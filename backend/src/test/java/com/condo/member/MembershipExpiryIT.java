package com.condo.member;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.condo.governance.Role;
import com.condo.support.IntegrationTest;
import java.time.Duration;
import java.time.Instant;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.transaction.support.TransactionTemplate;

class MembershipExpiryIT extends IntegrationTest {

    @Autowired
    MembershipExpiryJob job;
    @Autowired
    TransactionTemplate tx;

    @Test
    void jobPersistsExpiryAndANewEndDateRestoresAccess() throws Exception {
        Actor admin = register("Admin");
        Actor tenant = register("Tenant");
        UUID buildingId = UUID.fromString(createBuilding(admin, "MANAGED").get("id").asText());
        Membership m = addMember(buildingId, tenant, Role.TENANT, spaceNamed(buildingId, "1A"));
        Membership stillValid = addMember(buildingId, register("Other"), Role.TENANT, spaceNamed(buildingId, "1B"));
        tx.executeWithoutResult(s -> {
            memberships.findById(m.getId()).orElseThrow()
                    .update(Role.TENANT, m.getUnitSpace(), Instant.now().minusSeconds(5));
            memberships.findById(stillValid.getId()).orElseThrow()
                    .update(Role.TENANT, stillValid.getUnitSpace(), Instant.now().plus(Duration.ofDays(5)));
        });

        // Access is already gone before the job runs…
        getAs(tenant, "/api/buildings/{b}/spaces", buildingId)
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("MEMBERSHIP_EXPIRED"));
        assertThat(memberships.findById(m.getId()).orElseThrow().getStatus()).isEqualTo(MembershipStatus.ACTIVE);

        // …and the job makes the stored status agree, without touching valid memberships.
        assertThat(job.expireMemberships()).isGreaterThanOrEqualTo(1);
        assertThat(memberships.findById(m.getId()).orElseThrow().getStatus()).isEqualTo(MembershipStatus.EXPIRED);
        assertThat(memberships.findById(stillValid.getId()).orElseThrow().getStatus())
                .isEqualTo(MembershipStatus.ACTIVE);

        // Owner/admin extends the lease: access comes back.
        long version = memberships.findById(m.getId()).orElseThrow().getVersion();
        Map<String, Object> extend = new HashMap<>();
        extend.put("role", Role.TENANT);
        extend.put("unitId", m.getUnitSpace().getId());
        extend.put("expiresAt", Instant.now().plus(Duration.ofDays(90)));
        extend.put("version", version);
        putAs(admin, extend, "/api/buildings/{b}/members/{m}", buildingId, m.getId())
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("ACTIVE"))
                .andExpect(jsonPath("$.version").value(version + 1));
        getAs(tenant, "/api/buildings/{b}/spaces", buildingId).andExpect(status().isOk());
    }
}
