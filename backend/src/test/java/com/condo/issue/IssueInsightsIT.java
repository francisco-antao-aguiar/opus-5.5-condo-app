package com.condo.issue;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.condo.support.IssueTestSupport;
import com.fasterxml.jackson.databind.JsonNode;
import java.sql.Timestamp;
import java.time.Duration;
import java.time.Instant;
import java.util.Map;
import java.util.UUID;
import org.hamcrest.Matchers;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;

class IssueInsightsIT extends IssueTestSupport {

    @Autowired
    JdbcTemplate jdbc;

    @Test
    void listsSortByUrgencyAndFilterByView() throws Exception {
        String one = reported(tenant1A, onAsset(roofLight, LIGHT_FLICKERING)).get("id").asText();
        String three = reported(owner1B, onAsset(roofLight, LIGHT_NOT_WORKING)).get("id").asText();
        meToo(owner1A, three);
        meToo(tenant1A, three);

        list(owner1A, "").andExpect(jsonPath("$.items[*].id", Matchers.contains(three, one)))
                .andExpect(jsonPath("$.total").value(2));
        list(owner1A, "?sort=recent&size=1").andExpect(jsonPath("$.items.length()").value(1))
                .andExpect(jsonPath("$.total").value(2));
        list(owner1B, "?view=mine").andExpect(jsonPath("$.items[*].id", Matchers.contains(three)));
        list(owner1A, "?view=mine").andExpect(jsonPath("$.total").value(1));
        list(owner1A, "?status=RESOLVED").andExpect(jsonPath("$.total").value(0));
        list(owner1A, "?status=nonsense").andExpect(status().isBadRequest());
        list(owner1A, "?spaceId=" + floor1.getId()).andExpect(jsonPath("$.total").value(0));
        list(owner1A, "?assetId=" + roofLight).andExpect(jsonPath("$.total").value(2));
    }

    @Test
    void dashboardHighlightsIssuesStuckInReported() throws Exception {
        String old = reported(tenant1A, onAsset(roofLight, LIGHT_FLICKERING)).get("id").asText();
        String fresh = reported(owner1B, onAsset(roofLight, LIGHT_NOT_WORKING)).get("id").asText();
        jdbc.update("update issue set status_changed_at = ? where id = ?",
                Timestamp.from(Instant.now().minus(Duration.ofHours(72))), UUID.fromString(old));

        JsonNode dash = body(getAs(admin, "/api/buildings/{b}/issues/dashboard", buildingId).andExpect(status().isOk()));
        assertThat(dash.get("stuckThresholdHours").asInt()).isEqualTo(48);
        assertThat(dash.get("counts").get("REPORTED").asInt()).isEqualTo(2);
        assertThat(dash.get("stuck").findValuesAsText("id")).containsExactly(old);
        assertThat(dash.get("stuck").get(0).get("stuck").asBoolean()).isTrue();
        assertThat(dash.get("hotspots").get(0).get("assetName").asText()).isEqualTo("Roof light");
        assertThat(dash.get("hotspots").get(0).get("openIssues").asInt()).isEqualTo(2);

        list(admin, "?view=triage").andExpect(jsonPath("$.items[?(@.id=='" + fresh + "')].stuck",
                Matchers.contains(false)));
        getAs(tenant1A, "/api/buildings/{b}/issues/dashboard", buildingId).andExpect(status().isForbidden());
    }

    @Test
    void frequentOtherTextsCanBePromotedIntoTheCatalog() throws Exception {
        String first = reported(tenant1A, other(gate, "Remote doesn't work")).get("id").asText();
        changeStatus(admin, first, "RESOLVED", null);
        reported(owner1B, other(gate, "remote doesn't work!"));
        reported(owner1A, other(roofLight, "Buzzing"));

        JsonNode groups = body(getAs(admin, "/api/buildings/{b}/issues/other-texts", buildingId)
                .andExpect(status().isOk()));
        assertThat(groups.get(0).get("assetType").asText()).isEqualTo("GATE");
        assertThat(groups.get(0).get("normalizedText").asText()).isEqualTo("remote doesn't work");
        assertThat(groups.get(0).get("count").asInt()).isEqualTo(2);
        assertThat(groups.get(0).get("openCount").asInt()).isEqualTo(1);
        getAs(admin, "/api/buildings/{b}/issues/dashboard", buildingId)
                .andExpect(jsonPath("$.otherTextGroups").value(1));

        JsonNode promoted = body(postAs(admin, Map.of("assetType", "GATE", "normalizedText", "remote doesn't work",
                "label", "Remote doesn't work"), "/api/buildings/{b}/issues/other-texts/promote", buildingId)
                .andExpect(status().isOk()));
        assertThat(promoted.get("reclassifiedIssues").asInt()).isEqualTo(2);
        String newType = promoted.get("problemType").get("id").asText();

        getIssue(admin, first)
                .andExpect(jsonPath("$.problemTypeId").value(newType))
                .andExpect(jsonPath("$.otherText").value("Remote doesn't work")) // kept for history
                .andExpect(jsonPath("$.timeline[-1].type").value("RECLASSIFIED"));
        getAs(admin, "/api/buildings/{b}/issues/other-texts", buildingId)
                .andExpect(jsonPath("$[*].assetType", Matchers.contains("LIGHT")));

        // From now on it's a regular catalog problem — and the open one catches duplicates.
        report(tenant1A, onAsset(gate, newType)).andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("DUPLICATE_ISSUE"));
        getAs(tenant1A, "/api/buildings/{b}/issues/other-texts", buildingId).andExpect(status().isForbidden());
    }
}
