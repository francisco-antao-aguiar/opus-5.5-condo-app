package com.condo.member;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.condo.governance.Role;
import com.condo.space.Space;
import com.condo.support.IntegrationTest;
import java.time.Duration;
import java.time.Instant;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.beans.factory.annotation.Autowired;

class MemberControllerIT extends IntegrationTest {

    @Autowired
    TransactionTemplate tx;

    private Actor admin;
    private Actor owner;
    private Actor tenant;
    private UUID buildingId;
    private Space unit1A;
    private Space unit1B;
    private Membership ownerM;
    private Membership tenantM;

    @BeforeEach
    void setUp() throws Exception {
        admin = register("Admin");
        owner = register("Owner");
        tenant = register("Tenant");
        buildingId = UUID.fromString(createBuilding(admin, "MANAGED").get("id").asText());
        unit1A = spaceNamed(buildingId, "1A");
        unit1B = spaceNamed(buildingId, "1B");
        ownerM = addMember(buildingId, owner, Role.OWNER, unit1A);
        tenantM = addMember(buildingId, tenant, Role.TENANT, unit1A);
    }

    private Map<String, Object> update(String role, UUID unitId, Instant expiresAt) {
        Map<String, Object> m = new HashMap<>();
        m.put("role", role);
        m.put("unitId", unitId);
        m.put("expiresAt", expiresAt);
        return m;
    }

    private UUID adminMembershipId() {
        return memberships.findByBuildingAndUser(buildingId, admin.userId()).orElseThrow().getId();
    }

    @Test
    void contactDetailsAreOnlyVisibleToThoseWhoCanManage() throws Exception {
        getAs(tenant, "/api/buildings/{b}/members", buildingId).andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(3))
                .andExpect(jsonPath("$[?(@.role=='ADMIN')].email").value(org.hamcrest.Matchers.contains((Object) null)))
                .andExpect(jsonPath("$[?(@.role=='TENANT')].email").value(org.hamcrest.Matchers.contains(tenant.email())));
        getAs(owner, "/api/buildings/{b}/members", buildingId).andExpect(status().isOk())
                .andExpect(jsonPath("$[?(@.role=='TENANT')].email").value(org.hamcrest.Matchers.contains(tenant.email())));
        getAs(admin, "/api/buildings/{b}/members", buildingId).andExpect(status().isOk())
                .andExpect(jsonPath("$[?(@.role=='OWNER')].email").value(org.hamcrest.Matchers.contains(owner.email())));
    }

    @Test
    void ownerManagesTenantsOfOwnUnitOnly() throws Exception {
        Instant inAMonth = Instant.now().plus(Duration.ofDays(30));
        putAs(owner, update(Role.TENANT, unit1A.getId(), inAMonth), "/api/buildings/{b}/members/{m}", buildingId,
                tenantM.getId())
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.expiresAt").exists());

        // Can't move the tenant into someone else's unit…
        putAs(owner, update(Role.TENANT, unit1B.getId(), null), "/api/buildings/{b}/members/{m}", buildingId,
                tenantM.getId())
                .andExpect(status().isForbidden());
        // …nor promote them above owner…
        putAs(owner, update(Role.MANAGER, unit1A.getId(), null), "/api/buildings/{b}/members/{m}", buildingId,
                tenantM.getId())
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("ROLE_RANK_EXCEEDED"));
        // …nor touch members outside the unit.
        putAs(owner, update(Role.TENANT, null, null), "/api/buildings/{b}/members/{m}", buildingId,
                adminMembershipId())
                .andExpect(status().isForbidden());
    }

    @Test
    void tenantsCannotManageMembers() throws Exception {
        putAs(tenant, update(Role.OWNER, unit1A.getId(), null), "/api/buildings/{b}/members/{m}", buildingId,
                tenantM.getId())
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("PERMISSION_DENIED"));
    }

    @Test
    void lastAdminCannotBeDemotedOrRevoked() throws Exception {
        UUID adminId = adminMembershipId();
        putAs(admin, update(Role.MANAGER, null, null), "/api/buildings/{b}/members/{m}", buildingId, adminId)
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("LAST_ADMIN"));
        deleteAs(admin, "/api/buildings/{b}/members/{m}", buildingId, adminId)
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("LAST_ADMIN"));

        // With a second admin it works.
        putAs(admin, update(Role.ADMIN, null, null), "/api/buildings/{b}/members/{m}", buildingId, ownerM.getId())
                .andExpect(status().isOk());
        putAs(admin, update(Role.MANAGER, null, null), "/api/buildings/{b}/members/{m}", buildingId, adminId)
                .andExpect(status().isOk());
    }

    @Test
    void revokedMembersLoseAccessImmediately() throws Exception {
        getAs(tenant, "/api/buildings/{b}/spaces", buildingId).andExpect(status().isOk());
        deleteAs(owner, "/api/buildings/{b}/members/{m}", buildingId, tenantM.getId())
                .andExpect(status().isNoContent());
        getAs(tenant, "/api/buildings/{b}/spaces", buildingId)
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("NOT_A_MEMBER"));
        getAs(tenant, "/api/me").andExpect(jsonPath("$.memberships.length()").value(0));
    }

    @Test
    void expiredMembershipsLoseAccessWithoutAnyJob() throws Exception {
        tx.executeWithoutResult(s -> {
            Membership m = memberships.findById(tenantM.getId()).orElseThrow();
            m.update(m.getRoleCode(), m.getUnitSpace(), Instant.now().minusSeconds(1));
        });
        getAs(tenant, "/api/buildings/{b}/spaces", buildingId)
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("MEMBERSHIP_EXPIRED"));
        getAs(tenant, "/api/buildings").andExpect(jsonPath("$.length()").value(0));
        // Others still see the expired member (with status) only if they can manage them.
        getAs(admin, "/api/buildings/{b}/members", buildingId)
                .andExpect(jsonPath("$[?(@.role=='TENANT')].status").value(org.hamcrest.Matchers.contains("EXPIRED")));
    }

    @Test
    void membersCanLeaveOnTheirOwn() throws Exception {
        deleteAs(tenant, "/api/buildings/{b}/members/{m}", buildingId, tenantM.getId())
                .andExpect(status().isNoContent());
        assertThat(memberships.findById(tenantM.getId()).orElseThrow().getStatus())
                .isEqualTo(MembershipStatus.REVOKED);
    }

    @Test
    void validatesRoleAndUnit() throws Exception {
        putAs(admin, update("EMPEROR", null, null), "/api/buildings/{b}/members/{m}", buildingId, tenantM.getId())
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("UNKNOWN_ROLE"));
        UUID floorId = spaceNamed(buildingId, "Floor 1").getId();
        putAs(admin, update(Role.TENANT, floorId, null), "/api/buildings/{b}/members/{m}", buildingId,
                tenantM.getId())
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("INVALID_UNIT"));
        putAs(admin, update(Role.TENANT, null, Instant.now().minusSeconds(60)), "/api/buildings/{b}/members/{m}",
                buildingId, tenantM.getId())
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION_FAILED"));
    }
}
