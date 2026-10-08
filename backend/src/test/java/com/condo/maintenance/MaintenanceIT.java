package com.condo.maintenance;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.condo.notification.NotificationRequest;
import com.condo.notification.NotificationType;
import com.condo.support.IssueTestSupport;
import com.fasterxml.jackson.databind.JsonNode;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.event.ApplicationEvents;
import org.springframework.test.context.event.RecordApplicationEvents;

@RecordApplicationEvents
class MaintenanceIT extends IssueTestSupport {

    @Autowired
    ApplicationEvents applicationEvents;
    @Autowired
    MaintenanceJob job;
    @Autowired
    MaintenanceService maintenance;
    @Autowired
    JdbcTemplate jdbc;

    private LocalDate today() {
        return LocalDate.now(ZoneId.of("Europe/Lisbon"));
    }

    private Map<String, Object> plan(UUID assetId, String title, Map<String, Object> recurrence) {
        Map<String, Object> m = new HashMap<>();
        m.put("assetId", assetId);
        m.put("title", title);
        m.put("checklist", List.of("Check the cables", "Sign the log"));
        m.put("recurrence", recurrence);
        m.put("startsOn", today().toString());
        return m;
    }

    private JsonNode created(Map<String, Object> plan) throws Exception {
        return body(postAs(admin, plan, "/api/buildings/{b}/maintenance-plans", buildingId)
                .andExpect(status().isCreated()));
    }

    @Test
    void aPlanGeneratesItsTaskAsAScheduledIssueOnce() throws Exception {
        JsonNode plan = created(plan(roofLight, "Roof light check", Map.of("unit", "MONTH", "every", 1)));
        assertThat(plan.get("checklist")).hasSize(2);
        assertThat(plan.get("recurrenceText").asText()).isNotBlank();
        String taskId = plan.get("openTaskId").asText();
        assertThat(taskId).isNotBlank();
        assertThat(plan.get("nextDueOn").asText()).isEqualTo(today().plusMonths(1).toString());

        getIssue(owner1B, taskId)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.kind").value("SCHEDULED"))
                .andExpect(jsonPath("$.dueOn").value(today().toString()))
                .andExpect(jsonPath("$.overdue").value(false))
                .andExpect(jsonPath("$.me.canMeToo").value(false));
        meToo(owner1B, taskId).andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("INVALID_STATE"));
        list(admin, "?view=triage&kind=SCHEDULED").andExpect(jsonPath("$.total").value(1));
        list(admin, "?view=triage&kind=REPORTED").andExpect(jsonPath("$.total").value(0));

        List<NotificationRequest> due = applicationEvents.stream(NotificationRequest.class)
                .filter(r -> r.type() == NotificationType.TASK_DUE).toList();
        assertThat(due).hasSize(1);
        assertThat(due.getFirst().recipients()).contains(admin.userId());

        // Rerunning the job never duplicates a task.
        job.run();
        list(admin, "?view=triage&kind=SCHEDULED&status=all").andExpect(jsonPath("$.total").value(1));
    }

    @Test
    void overdueTasksAreFlaggedOnce() throws Exception {
        JsonNode plan = created(plan(roofLight, "Roof light check", Map.of("unit", "YEAR", "every", 1)));
        UUID taskId = UUID.fromString(plan.get("openTaskId").asText());
        jdbc.update("update issue set due_on = ? where id = ?", today().minusDays(3), taskId);

        assertThat(maintenance.flagOverdue(buildingId)).isEqualTo(1);
        assertThat(maintenance.flagOverdue(buildingId)).isZero();
        assertThat(applicationEvents.stream(NotificationRequest.class)
                .filter(r -> r.type() == NotificationType.TASK_OVERDUE)).hasSize(1);
        getIssue(admin, taskId.toString()).andExpect(jsonPath("$.overdue").value(true));
        getAs(admin, "/api/buildings/{b}/issues/dashboard", buildingId)
                .andExpect(status().isOk()).andExpect(jsonPath("$.overdue[0].id").value(taskId.toString()));

        // Resolved tasks are never overdue.
        changeStatus(admin, taskId.toString(), "RESOLVED", "Done").andExpect(status().isOk())
                .andExpect(jsonPath("$.overdue").value(false));
    }

    @Test
    void residentsSeePlansButOnlyManagersChangeThem() throws Exception {
        String id = created(plan(roofLight, "Roof light check", Map.of("unit", "WEEK", "every", 2,
                "weekdays", List.of("MON")))).get("id").asText();
        postAs(tenant1A, plan(gate, "Gate", Map.of("unit", "ONCE")), "/api/buildings/{b}/maintenance-plans",
                buildingId).andExpect(status().isForbidden());
        postAs(owner1A, null, "/api/buildings/{b}/maintenance-plans/{p}/pause", buildingId, id)
                .andExpect(status().isForbidden());
        getAs(tenant1A, "/api/buildings/{b}/maintenance-plans", buildingId)
                .andExpect(status().isOk()).andExpect(jsonPath("$[0].id").value(id));

        Map<String, Object> bad = plan(roofLight, "Bad", Map.of("unit", "WEEK", "every", 0));
        postAs(admin, bad, "/api/buildings/{b}/maintenance-plans", buildingId).andExpect(status().isBadRequest());
        Map<String, Object> both = plan(roofLight, "Both", Map.of("unit", "ONCE"));
        both.put("spaceId", roof.getId());
        postAs(admin, both, "/api/buildings/{b}/maintenance-plans", buildingId).andExpect(status().isBadRequest());

        postAs(admin, Map.of("recurrence", Map.of("unit", "MONTH", "every", 3), "startsOn", "2027-01-31",
                "count", 3), "/api/buildings/{b}/maintenance-plans/preview", buildingId)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.dates[0]").value("2027-01-31"))
                .andExpect(jsonPath("$.dates[1]").value("2027-04-30"));
    }

    @Test
    void archivingTheItemPausesItsPlanAndPlansProtectTheirSpace() throws Exception {
        String id = created(plan(roofLight, "Roof light check", Map.of("unit", "MONTH", "every", 1)))
                .get("id").asText();
        deleteAs(admin, "/api/buildings/{b}/assets/{a}", buildingId, roofLight).andExpect(status().isNoContent());
        getAs(admin, "/api/buildings/{b}/maintenance-plans/{p}", buildingId, id)
                .andExpect(jsonPath("$.active").value(false))
                .andExpect(jsonPath("$.pausedReason").value("ASSET_ARCHIVED"));
        postAs(admin, null, "/api/buildings/{b}/maintenance-plans/{p}/resume", buildingId, id)
                .andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("ASSET_ARCHIVED"));

        Map<String, Object> onSpace = plan(null, "Clean the gutters", Map.of("unit", "YEAR", "every", 1));
        onSpace.remove("assetId");
        onSpace.put("spaceId", unit1B.getId());
        postAs(admin, onSpace, "/api/buildings/{b}/maintenance-plans", buildingId).andExpect(status().isCreated());
        deleteAs(admin, "/api/buildings/{b}/spaces/{s}", buildingId, unit1B.getId())
                .andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("SPACE_HAS_PLANS"));
    }

    @Test
    void theTaskKeepsItsOwnChecklistAndTicksAreSaved() throws Exception {
        JsonNode plan = created(plan(roofLight, "Roof light check", Map.of("unit", "MONTH", "every", 1)));
        String taskId = plan.get("openTaskId").asText();
        String url = "/api/buildings/{b}/issues/{i}/checklist/{n}";

        // Editing the plan afterwards doesn't rewrite the task's copy.
        Map<String, Object> edited = plan(roofLight, "Roof light check", Map.of("unit", "MONTH", "every", 1));
        edited.put("checklist", List.of("Something else"));
        putAs(admin, edited, "/api/buildings/{b}/maintenance-plans/{p}", buildingId, plan.get("id").asText())
                .andExpect(status().isOk());

        getIssue(owner1B, taskId)
                .andExpect(jsonPath("$.checklist.length()").value(2))
                .andExpect(jsonPath("$.checklist[0].text").value("Check the cables"))
                .andExpect(jsonPath("$.checklist[0].done").value(false))
                .andExpect(jsonPath("$.me.canTickChecklist").value(false));
        putAs(owner1B, Map.of("done", true), url, buildingId, taskId, 0).andExpect(status().isForbidden());

        long version = body(getIssue(admin, taskId).andExpect(jsonPath("$.me.canTickChecklist").value(true)))
                .get("version").asLong();
        putAs(admin, Map.of("done", true), url, buildingId, taskId, 1)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.checklist[1].done").value(true))
                .andExpect(jsonPath("$.checklist[1].doneByName").value("Admin"))
                .andExpect(jsonPath("$.checklist[1].doneAt").isNotEmpty())
                .andExpect(jsonPath("$.checklist[0].done").value(false))
                .andExpect(jsonPath("$.version").value(version + 1));
        // Ticking twice changes nothing; unticking clears who did it.
        putAs(admin, Map.of("done", true), url, buildingId, taskId, 1)
                .andExpect(jsonPath("$.version").value(version + 1));
        putAs(admin, Map.of("done", false), url, buildingId, taskId, 1)
                .andExpect(jsonPath("$.checklist[1].done").value(false))
                .andExpect(jsonPath("$.checklist[1].doneByName").isEmpty());
        putAs(admin, Map.of("done", true), url, buildingId, taskId, 2).andExpect(status().isNotFound());
        putAs(admin, Map.of(), url, buildingId, taskId, 0).andExpect(status().isBadRequest());

        // A resolved task's checklist is frozen; ordinary issues have none.
        changeStatus(admin, taskId, "RESOLVED", "Done").andExpect(status().isOk());
        putAs(admin, Map.of("done", true), url, buildingId, taskId, 0)
                .andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("INVALID_STATE"));
        String problem = reported(tenant1A, onAsset(roofLight, LIGHT_FLICKERING)).get("id").asText();
        getIssue(admin, problem).andExpect(jsonPath("$.checklist.length()").value(0));
        putAs(admin, Map.of("done", true), url, buildingId, problem, 0).andExpect(status().isNotFound());
    }
}
