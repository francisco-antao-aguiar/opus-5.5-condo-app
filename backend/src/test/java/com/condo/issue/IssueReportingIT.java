package com.condo.issue;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.condo.support.IssueTestSupport;
import com.fasterxml.jackson.databind.JsonNode;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;
import org.hamcrest.Matchers;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

class IssueReportingIT extends IssueTestSupport {

    @Autowired
    IssueRepository issues;

    @Test
    void reportingFromTheCatalog() throws Exception {
        JsonNode issue = reported(tenant1A, onAsset(roofLight, LIGHT_FLICKERING));
        assertThat(issue.get("number").asInt()).isEqualTo(1);
        assertThat(issue.get("title").asText()).isEqualTo("Flickering");
        assertThat(issue.get("status").asText()).isEqualTo("REPORTED");
        assertThat(issue.get("visibility").asText()).isEqualTo("COMMON");
        assertThat(issue.get("locationLabel").asText()).isEqualTo("Roof");
        assertThat(issue.get("assetName").asText()).isEqualTo("Roof light");
        assertThat(issue.get("assetType").asText()).isEqualTo("LIGHT");
        assertThat(issue.get("affectedCount").asInt()).isEqualTo(1);
        assertThat(issue.get("reportedByName").asText()).isEqualTo("Tenant1A");
        assertThat(issue.get("timeline").get(0).get("type").asText()).isEqualTo("REPORTED");

        JsonNode me = issue.get("me");
        assertThat(me.get("isReporter").asBoolean()).isTrue();
        assertThat(me.get("isAffected").asBoolean()).isTrue();
        assertThat(me.get("canMeToo").asBoolean()).isFalse();
        assertThat(me.get("allowedTransitions")).extracting(JsonNode::asText).containsExactly("RESOLVED");

        // Numbers are per building and sequential.
        assertThat(reported(owner1B, onAsset(roofLight, LIGHT_NOT_WORKING)).get("number").asInt()).isEqualTo(2);
    }

    @Test
    void duplicatesBecomeMeToo() throws Exception {
        String id = reported(tenant1A, onAsset(roofLight, LIGHT_FLICKERING)).get("id").asText();

        report(owner1B, onAsset(roofLight, LIGHT_FLICKERING))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("DUPLICATE_ISSUE"))
                .andExpect(jsonPath("$.duplicate.issueId").value(id))
                .andExpect(jsonPath("$.duplicate.affectedCount").value(1))
                .andExpect(jsonPath("$.duplicate.alreadyAffected").value(false));

        meToo(owner1B, id).andExpect(status().isOk())
                .andExpect(jsonPath("$.affectedCount").value(2))
                .andExpect(jsonPath("$.me.isAffected").value(true))
                .andExpect(jsonPath("$.me.canMeToo").value(false));
        meToo(owner1B, id).andExpect(jsonPath("$.affectedCount").value(2)); // idempotent

        report(owner1B, onAsset(roofLight, LIGHT_FLICKERING))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.duplicate.alreadyAffected").value(true));

        // A different problem on the same asset is a different issue.
        reported(owner1A, onAsset(roofLight, LIGHT_NOT_WORKING));
        getAs(tenant1A, "/api/buildings/{b}/assets/{a}/open-issues", buildingId, roofLight)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[*].title", Matchers.contains("Flickering", "Not working"))); // by urgency

        deleteAs(owner1B, "/api/buildings/{b}/issues/{i}/me-too", buildingId, id)
                .andExpect(jsonPath("$.affectedCount").value(1));
        deleteAs(tenant1A, "/api/buildings/{b}/issues/{i}/me-too", buildingId, id)
                .andExpect(status().isConflict()); // the reporter can't "un-report"
    }

    @Test
    void otherTextsAreDeduplicatedAfterNormalization() throws Exception {
        String id = reported(tenant1A, other(gate, "Squeaks loudly!")).get("id").asText();
        assertThat(getIssue(tenant1A, id).andReturn().getResponse().getContentAsString()).contains("Squeaks loudly!");
        report(owner1B, other(gate, "  squeaks   LOUDLY "))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.duplicate.issueId").value(id));
    }

    @Test
    void validatesWhatIsReported() throws Exception {
        Map<String, Object> both = onAsset(roofLight, LIGHT_FLICKERING);
        both.put("otherText", "and also this");
        report(tenant1A, both).andExpect(status().isBadRequest()).andExpect(jsonPath("$.errors[0].field").value("otherText"));

        Map<String, Object> neither = onAsset(roofLight, null);
        report(tenant1A, neither).andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.errors[0].field").value("problemTypeId"));

        report(tenant1A, onAsset(roofLight, DOOR_WONT_LOCK)) // a door problem on a light
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("INVALID_PROBLEM_TYPE"));

        // Hidden built-ins aren't offered any more.
        putAs(admin, Map.of("label", "Damaged fixture", "sortOrder", 4, "active", false),
                "/api/buildings/{b}/catalog/problem-types/{p}", buildingId, LIGHT_DAMAGED).andExpect(status().isOk());
        report(tenant1A, onAsset(roofLight, LIGHT_DAMAGED))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("INVALID_PROBLEM_TYPE"));

        report(tenant1A, new HashMap<>()).andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.errors[0].field").value("assetId"));

        deleteAs(admin, "/api/buildings/{b}/assets/{a}", buildingId, gate).andExpect(status().isNoContent());
        report(tenant1A, other(gate, "x")).andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("ASSET_ARCHIVED"));
    }

    @Test
    void somethingElseHereReportsOnAPlace() throws Exception {
        Map<String, Object> place = new HashMap<>(Map.of("spaceId", floor1.getId()));
        report(tenant1A, place).andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.errors[0].field").value("otherText"));
        place.put("problemTypeId", LIGHT_FLICKERING);
        report(tenant1A, place).andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("INVALID_PROBLEM_TYPE"));
        place.remove("problemTypeId");
        place.put("otherText", "Water stain on the ceiling");
        JsonNode issue = reported(tenant1A, place);
        assertThat(issue.get("assetId").isNull()).isTrue();
        assertThat(issue.get("title").asText()).isEqualTo("Water stain on the ceiling");
        assertThat(issue.get("locationLabel").asText()).isEqualTo("Floor 1");

        // Open issues keep their place from being deleted.
        deleteAs(admin, "/api/buildings/{b}/spaces/{s}?cascade=true", buildingId, floor1.getId())
                .andExpect(status().isConflict());
    }

    @Test
    void retriesWithTheSameClientRequestIdAreIdempotent() throws Exception {
        UUID requestId = UUID.randomUUID();
        Map<String, Object> body = onAsset(roofLight, LIGHT_FLICKERING);
        body.put("clientRequestId", requestId);
        String first = reported(tenant1A, body).get("id").asText();
        String second = reported(tenant1A, body).get("id").asText(); // not a DUPLICATE_ISSUE: same request
        assertThat(second).isEqualTo(first);
        assertThat(issues.findAll().stream().filter(i -> i.getBuildingId().equals(buildingId))).hasSize(1);
    }

    @Test
    void tenantsCantReportOnNeighboursPrivateThings() throws Exception {
        report(owner1B, onAsset(heater1A, BOILER_NO_HOT_WATER)).andExpect(status().isNotFound());
        Map<String, Object> place = new HashMap<>(Map.of("spaceId", unit1A.getId(), "otherText", "Leak"));
        report(owner1B, place).andExpect(status().isNotFound());
    }
}
