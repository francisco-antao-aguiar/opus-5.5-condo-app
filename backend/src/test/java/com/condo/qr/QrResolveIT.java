package com.condo.qr;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.condo.member.Membership;
import com.condo.support.IssueTestSupport;
import com.fasterxml.jackson.databind.JsonNode;
import java.time.Instant;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.transaction.support.TransactionTemplate;

class QrResolveIT extends IssueTestSupport {

    @Autowired
    TransactionTemplate tx;

    @Test
    void assetsCarryTheirQrLinks() throws Exception {
        JsonNode asset = body(getAs(admin, "/api/buildings/{b}/assets/{a}", buildingId, roofLight));
        assertThat(asset.get("qrUrl").asText()).isEqualTo("http://localhost:4200/r/" + roofLight);
        assertThat(asset.get("deepLink").asText()).isEqualTo("buildingapp://report/asset/" + roofLight);
    }

    @Test
    void membersGetTheAssetTheirRightsAndOpenIssues() throws Exception {
        String issue = reported(owner1B, onAsset(roofLight, LIGHT_FLICKERING)).get("id").asText();
        getAs(tenant1A, "/api/assets/{a}/resolve", roofLight)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.buildingId").value(buildingId.toString()))
                .andExpect(jsonPath("$.buildingName").isNotEmpty())
                .andExpect(jsonPath("$.asset.name").value("Roof light"))
                .andExpect(jsonPath("$.asset.qrUrl").exists())
                .andExpect(jsonPath("$.canReport").value(true))
                .andExpect(jsonPath("$.openIssues[0].id").value(issue))
                .andExpect(jsonPath("$.openIssues[0].affectedByMe").value(false));
    }

    @Test
    void strangersAreToldWhoseItIs() throws Exception {
        Actor stranger = register("Stranger");
        String buildingName = buildings.findById(buildingId).orElseThrow().getName();
        getAs(stranger, "/api/assets/{a}/resolve", roofLight)
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("NOT_A_MEMBER"))
                .andExpect(jsonPath("$.buildingName").value(buildingName));
        getAs(null, "/api/assets/{a}/resolve", roofLight).andExpect(status().isUnauthorized());
    }

    @Test
    void privateUnknownArchivedAndExpiredCases() throws Exception {
        getAs(owner1B, "/api/assets/{a}/resolve", heater1A).andExpect(status().isNotFound()); // neighbour's flat
        getAs(tenant1A, "/api/assets/{a}/resolve", heater1A).andExpect(status().isOk());       // own flat
        getAs(admin, "/api/assets/{a}/resolve", UUID.randomUUID()).andExpect(status().isNotFound());

        deleteAs(admin, "/api/buildings/{b}/assets/{a}", buildingId, gate).andExpect(status().isNoContent());
        getAs(tenant1A, "/api/assets/{a}/resolve", gate)
                .andExpect(status().isGone())
                .andExpect(jsonPath("$.code").value("ASSET_ARCHIVED"));

        Membership m = memberships.findByBuildingAndUser(buildingId, owner1B.userId()).orElseThrow();
        tx.executeWithoutResult(s -> {
            Membership managed = memberships.findById(m.getId()).orElseThrow();
            managed.update(managed.getRoleCode(), managed.getUnitSpace(), Instant.now().minusSeconds(1));
        });
        getAs(owner1B, "/api/assets/{a}/resolve", roofLight)
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("MEMBERSHIP_EXPIRED"));
    }

    @Test
    void residentsWhoMayNotReportStillSeeTheItem() throws Exception {
        // Tenants may report everywhere by default; take it away through policy data, not code.
        jdbcRemoveTenantReporting();
        try {
            getAs(tenant1A, "/api/assets/{a}/resolve", roofLight)
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.canReport").value(false));
        } finally {
            restoreTenantReporting(); // shared policy table: always put it back
        }
    }

    @Autowired
    org.springframework.jdbc.core.JdbcTemplate jdbc;

    private void jdbcRemoveTenantReporting() {
        jdbc.update("delete from permission_policy where governance_mode = 'MANAGED' and action = 'ISSUE_REPORT' "
                + "and role_code = 'TENANT'");
    }

    private void restoreTenantReporting() {
        jdbc.update("insert into permission_policy (governance_mode, action, role_code, scope) "
                + "values ('MANAGED', 'ISSUE_REPORT', 'TENANT', 'ANY')");
    }
}
