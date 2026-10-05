package com.condo.issue;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.condo.support.IssueTestSupport;
import com.fasterxml.jackson.databind.JsonNode;
import java.util.List;
import java.util.Map;
import org.hamcrest.Matchers;
import org.junit.jupiter.api.Test;
import org.springframework.test.context.event.ApplicationEvents;
import org.springframework.test.context.event.RecordApplicationEvents;
import org.springframework.beans.factory.annotation.Autowired;

@RecordApplicationEvents
class IssueLifecycleIT extends IssueTestSupport {

    @Autowired
    ApplicationEvents applicationEvents;

    @Test
    void triagersMoveIssuesThroughTheLifecycleWithATimeline() throws Exception {
        String id = reported(tenant1A, onAsset(roofLight, LIGHT_FLICKERING)).get("id").asText();
        meToo(owner1B, id).andExpect(status().isOk());

        getIssue(admin, id).andExpect(jsonPath("$.me.allowedTransitions",
                Matchers.contains("ACKNOWLEDGED", "IN_PROGRESS", "RESOLVED")));
        changeStatus(admin, id, "ACKNOWLEDGED", "Electrician booked for Monday").andExpect(status().isOk());
        changeStatus(admin, id, "IN_PROGRESS", null).andExpect(status().isOk());
        changeStatus(admin, id, "ACKNOWLEDGED", null)
                .andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("INVALID_TRANSITION"));
        JsonNode resolved = body(changeStatus(admin, id, "RESOLVED", "Replaced the bulb").andExpect(status().isOk()));

        List<String> types = resolved.get("timeline").findValuesAsText("type");
        assertThat(types).containsExactly("REPORTED", "ME_TOO", "STATUS_CHANGED", "STATUS_CHANGED", "STATUS_CHANGED");
        JsonNode ack = resolved.get("timeline").get(2);
        assertThat(ack.get("actorName").asText()).isEqualTo("Admin");
        assertThat(ack.get("fromStatus").asText()).isEqualTo("REPORTED");
        assertThat(ack.get("toStatus").asText()).isEqualTo("ACKNOWLEDGED");
        assertThat(ack.get("comment").asText()).isEqualTo("Electrician booked for Monday");

        // Every change is announced to the affected people except whoever made it (phase 5 notifies them).
        List<IssueActivity> activity = applicationEvents.stream(IssueActivity.class)
                .filter(a -> a.type() == IssueEventType.STATUS_CHANGED).toList();
        assertThat(activity).hasSize(3);
        assertThat(activity.getLast().audience()).containsExactlyInAnyOrder(tenant1A.userId(), owner1B.userId());
        assertThat(activity.getLast().status()).isEqualTo(IssueStatus.RESOLVED);

        // A neighbour who said "me too" can reopen; "me too" itself isn't possible on a resolved issue.
        meToo(owner1A, id).andExpect(status().isConflict());
        changeStatus(owner1B, id, "REPORTED", "Flickering again").andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("REPORTED"));
    }

    @Test
    void residentsCanOnlyCloseTheirOwnIssueOrReopen() throws Exception {
        String id = reported(tenant1A, onAsset(roofLight, LIGHT_FLICKERING)).get("id").asText();
        changeStatus(tenant1A, id, "ACKNOWLEDGED", null).andExpect(status().isForbidden());
        changeStatus(owner1B, id, "RESOLVED", null).andExpect(status().isForbidden());
        changeStatus(tenant1A, id, "RESOLVED", "Fixed itself").andExpect(status().isOk());
        changeStatus(owner1B, id, "REPORTED", null).andExpect(status().isForbidden()); // not affected
        changeStatus(tenant1A, id, "REPORTED", null).andExpect(status().isOk());
    }

    @Test
    void staleVersionsConflictButMeTooDoesNot() throws Exception {
        JsonNode issue = reported(tenant1A, onAsset(roofLight, LIGHT_FLICKERING));
        String id = issue.get("id").asText();
        long version = issue.get("version").asLong();
        meToo(owner1B, id).andExpect(status().isOk()); // must not bump the version

        Map<String, Object> ack = Map.of("status", "ACKNOWLEDGED", "version", version);
        postAs(admin, ack, "/api/buildings/{b}/issues/{i}/status", buildingId, id).andExpect(status().isOk());
        Map<String, Object> stale = Map.of("status", "IN_PROGRESS", "version", version);
        postAs(admin, stale, "/api/buildings/{b}/issues/{i}/status", buildingId, id)
                .andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("CONFLICT"));
    }

    @Test
    void privateIssuesStayInTheUnitUnlessShared() throws Exception {
        JsonNode issue = reported(owner1A, onAsset(heater1A, BOILER_NO_HOT_WATER));
        String id = issue.get("id").asText();
        assertThat(issue.get("visibility").asText()).isEqualTo("PRIVATE");
        assertThat(issue.get("sharedWithAdmins").asBoolean()).isFalse();

        getIssue(tenant1A, id).andExpect(status().isOk());
        getIssue(admin, id).andExpect(status().isNotFound());
        getIssue(owner1B, id).andExpect(status().isNotFound());
        list(admin, "?view=triage").andExpect(jsonPath("$.total").value(0));
        list(tenant1A, "?view=shared").andExpect(jsonPath("$.total").value(0)); // never clutters the shared list
        list(tenant1A, "?view=unit").andExpect(jsonPath("$.items[0].id").value(id));

        // The unit runs its own private issues…
        changeStatus(tenant1A, id, "ACKNOWLEDGED", "Called the plumber").andExpect(status().isOk());

        // …until it shares one with building management.
        putAs(tenant1A, Map.of("sharedWithAdmins", true), "/api/buildings/{b}/issues/{i}/sharing", buildingId, id)
                .andExpect(status().isOk()).andExpect(jsonPath("$.sharedWithAdmins").value(true));
        getIssue(admin, id).andExpect(status().isOk());
        list(admin, "?view=triage").andExpect(jsonPath("$.items[0].id").value(id));
        changeStatus(admin, id, "IN_PROGRESS", null).andExpect(status().isOk());
        getIssue(owner1B, id).andExpect(status().isNotFound());
        putAs(admin, Map.of("sharedWithAdmins", false), "/api/buildings/{b}/issues/{i}/sharing", buildingId, id)
                .andExpect(status().isForbidden());
    }

    @Test
    void triagersMergeDuplicates() throws Exception {
        String keep = reported(tenant1A, onAsset(roofLight, LIGHT_NOT_WORKING)).get("id").asText();
        String dup = reported(owner1B, onAsset(roofLight, LIGHT_FLICKERING)).get("id").asText();

        postAs(tenant1A, Map.of("intoIssueId", keep), "/api/buildings/{b}/issues/{i}/merge", buildingId, dup)
                .andExpect(status().isForbidden());
        postAs(admin, Map.of("intoIssueId", dup), "/api/buildings/{b}/issues/{i}/merge", buildingId, dup)
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("INVALID_MERGE"));

        JsonNode survivor = body(postAs(admin, Map.of("intoIssueId", keep, "comment", "Same light"),
                "/api/buildings/{b}/issues/{i}/merge", buildingId, dup).andExpect(status().isOk()));
        assertThat(survivor.get("id").asText()).isEqualTo(keep);
        assertThat(survivor.get("affectedCount").asInt()).isEqualTo(2); // owner1B moved over
        assertThat(survivor.get("timeline").findValuesAsText("type")).contains("MERGED_FROM");

        getIssue(owner1B, dup)
                .andExpect(jsonPath("$.mergedIntoId").value(keep))
                .andExpect(jsonPath("$.status").value("RESOLVED"))
                .andExpect(jsonPath("$.timeline[-1].type").value("MERGED_INTO"))
                .andExpect(jsonPath("$.timeline[-1].relatedIssueNumber").value(1));
        changeStatus(admin, dup, "REPORTED", null)
                .andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("ISSUE_MERGED"));
        list(admin, "?view=triage&status=all").andExpect(jsonPath("$.total").value(1)); // merged ones are hidden
    }

    @Test
    void commentsGoIntoTheTimeline() throws Exception {
        String id = reported(tenant1A, onAsset(roofLight, LIGHT_FLICKERING)).get("id").asText();
        postAs(owner1B, Map.of("text", "Since yesterday evening"), "/api/buildings/{b}/issues/{i}/comments",
                buildingId, id)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.timeline[-1].type").value("COMMENT"))
                .andExpect(jsonPath("$.timeline[-1].comment").value("Since yesterday evening"))
                .andExpect(jsonPath("$.timeline[-1].actorName").value("Owner1B"));
        postAs(owner1B, Map.of("text", " "), "/api/buildings/{b}/issues/{i}/comments", buildingId, id)
                .andExpect(status().isBadRequest());
    }
}
