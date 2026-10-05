package com.condo.governance;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.condo.auth.User;
import com.condo.building.Building;
import com.condo.member.Membership;
import com.condo.space.Space;
import com.condo.space.SpaceType;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

/** Pure unit tests: the policy table is an in-memory list, so these test the decision logic only. */
class PermissionServiceTest {

    private static final Instant NOW = Instant.parse("2026-10-05T12:00:00Z");

    private final List<PermissionPolicy> rules = new ArrayList<>();
    private PermissionService service;

    private Building building;
    private Space root;
    private Space floor;
    private Space unit2B;
    private Space kitchen2B;
    private Space unit2C;
    private final User user = new User("x@test.local", "hash", "X");

    @BeforeEach
    void setUp() {
        PermissionPolicyRepository repo = mock(PermissionPolicyRepository.class);
        when(repo.findByGovernanceModeAndActionAndRoleCode(anyString(), any(), anyString())).thenAnswer(inv ->
                rules.stream()
                        .filter(r -> r.getGovernanceMode().equals(inv.getArgument(0))
                                && r.getAction() == inv.getArgument(1)
                                && r.getRoleCode().equals(inv.getArgument(2)))
                        .findFirst());
        service = new PermissionService(repo, Clock.fixed(NOW, ZoneOffset.UTC));

        building = new Building("B", null, "MANAGED");
        root = Space.root(building.getId(), "B");
        floor = Space.childOf(root, SpaceType.FLOOR, "Floor 2", 2, null);
        unit2B = Space.childOf(floor, SpaceType.UNIT, "2B", 1, null);
        kitchen2B = Space.childOf(unit2B, SpaceType.ROOM, "Kitchen", 0, null);
        unit2C = Space.childOf(floor, SpaceType.UNIT, "2C", 2, null);
    }

    private void rule(String mode, Action action, String role, PermissionScope scope) {
        rules.add(new PermissionPolicy(mode, action, role, scope));
    }

    private Membership member(String role, Space unit) {
        return new Membership(building, user, role, unit, null);
    }

    @Test
    void allowsWhenRuleWithAnyScopeExists() {
        rule("MANAGED", Action.STRUCTURE_EDIT, "MANAGER", PermissionScope.ANY);
        assertThat(service.can(member("MANAGER", null), Action.STRUCTURE_EDIT, unit2C)).isTrue();
        assertThat(service.can(member("MANAGER", null), Action.STRUCTURE_EDIT, null)).isTrue();
    }

    @Test
    void deniesWhenNoRuleForRoleOrAction() {
        rule("MANAGED", Action.STRUCTURE_EDIT, "MANAGER", PermissionScope.ANY);
        assertThat(service.can(member("TENANT", unit2B), Action.STRUCTURE_EDIT, unit2B)).isFalse();
        assertThat(service.can(member("MANAGER", null), Action.ASSET_DELETE, unit2B)).isFalse();
    }

    @Test
    void ownUnitScopeCoversTheUnitAndEverythingInsideIt() {
        rule("MANAGED", Action.MEMBER_MANAGE, "OWNER", PermissionScope.OWN_UNIT);
        Membership owner = member("OWNER", unit2B);
        assertThat(service.can(owner, Action.MEMBER_MANAGE, unit2B)).isTrue();
        assertThat(service.can(owner, Action.MEMBER_MANAGE, kitchen2B)).isTrue();
        assertThat(service.can(owner, Action.MEMBER_MANAGE, unit2C)).isFalse();
        assertThat(service.can(owner, Action.MEMBER_MANAGE, floor)).isFalse();
        assertThat(service.can(owner, Action.MEMBER_MANAGE, null)).isFalse();
    }

    @Test
    void ownUnitScopeDeniesMembersWithoutUnit() {
        rule("MANAGED", Action.MEMBER_MANAGE, "OWNER", PermissionScope.OWN_UNIT);
        assertThat(service.can(member("OWNER", null), Action.MEMBER_MANAGE, unit2B)).isFalse();
    }

    @Test
    void expiredMembershipLosesAccessAtCheckTime() {
        rule("MANAGED", Action.BUILDING_VIEW, "TENANT", PermissionScope.ANY);
        Membership stillValid = new Membership(building, user, "TENANT", unit2B, NOW.plus(Duration.ofMinutes(1)));
        Membership expired = new Membership(building, user, "TENANT", unit2B, NOW.minus(Duration.ofSeconds(1)));
        Membership expiringNow = new Membership(building, user, "TENANT", unit2B, NOW);
        assertThat(service.can(stillValid, Action.BUILDING_VIEW, null)).isTrue();
        assertThat(service.can(expired, Action.BUILDING_VIEW, null)).isFalse();
        assertThat(service.can(expiringNow, Action.BUILDING_VIEW, null)).isFalse();
    }

    @Test
    void revokedMembershipIsDenied() {
        rule("MANAGED", Action.BUILDING_VIEW, "TENANT", PermissionScope.ANY);
        Membership m = member("TENANT", unit2B);
        m.revoke(NOW);
        assertThat(service.can(m, Action.BUILDING_VIEW, null)).isFalse();
        assertThat(service.grantsOf(m)).isEmpty();
    }

    @Test
    void nullMemberIsDenied() {
        assertThat(service.can(null, Action.BUILDING_VIEW, null)).isFalse();
    }

    @Test
    void targetInAnotherBuildingIsDenied() {
        rule("MANAGED", Action.STRUCTURE_EDIT, "ADMIN", PermissionScope.ANY);
        Space foreign = Space.root(new Building("Other", null, "MANAGED").getId(), "Other");
        assertThat(service.can(member("ADMIN", null), Action.STRUCTURE_EDIT, foreign)).isFalse();
    }

    @Test
    void decisionFollowsTheBuildingsGovernanceMode() {
        rule("OPEN", Action.STRUCTURE_EDIT, "TENANT", PermissionScope.ANY);
        Membership tenant = member("TENANT", unit2B);
        assertThat(service.can(tenant, Action.STRUCTURE_EDIT, unit2C)).isFalse(); // building is MANAGED
        building.update("B", null, "OPEN");
        assertThat(service.can(tenant, Action.STRUCTURE_EDIT, unit2C)).isTrue();
    }

    @Test
    void unknownModeOrRoleIsSimplyDataNotCode() {
        // A brand-new mode and role work as soon as their rows exist.
        rule("HYBRID", Action.ASSET_CREATE, "CONCIERGE", PermissionScope.ANY);
        building.update("B", null, "HYBRID");
        assertThat(service.can(member("CONCIERGE", null), Action.ASSET_CREATE, floor)).isTrue();
        assertThat(service.can(member("CONCIERGE", null), Action.ASSET_DELETE, floor)).isFalse();
    }
}
