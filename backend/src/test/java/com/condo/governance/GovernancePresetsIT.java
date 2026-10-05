package com.condo.governance;

import static org.assertj.core.api.Assertions.assertThat;

import com.condo.auth.User;
import com.condo.auth.UserRepository;
import com.condo.building.Building;
import com.condo.building.BuildingRepository;
import com.condo.member.Membership;
import com.condo.space.Space;
import com.condo.space.SpaceRepository;
import com.condo.space.SpaceType;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.transaction.annotation.Transactional;

/** Verifies the Flyway-seeded Managed/Open presets, and that a new mode is purely a data change. */
@SpringBootTest
@ActiveProfiles("test")
@Transactional
class GovernancePresetsIT {

    @Autowired
    PermissionService permissions;
    @Autowired
    BuildingRepository buildings;
    @Autowired
    SpaceRepository spaces;
    @Autowired
    UserRepository users;
    @Autowired
    JdbcTemplate jdbc;

    private Building building;
    private Space unitA;
    private Space unitB;
    private User user;

    @BeforeEach
    void setUp() {
        building = buildings.save(new Building("Presets", null, GovernanceMode.MANAGED));
        Space root = spaces.save(Space.root(building.getId(), "Presets"));
        Space floor = spaces.save(Space.childOf(root, SpaceType.FLOOR, "F1", 1, null));
        unitA = spaces.save(Space.childOf(floor, SpaceType.UNIT, "1A", 1, null));
        unitB = spaces.save(Space.childOf(floor, SpaceType.UNIT, "1B", 2, null));
        user = users.save(new User("presets-" + UUID.randomUUID() + "@test.local", "x", "P"));
    }

    private boolean can(String role, Action action, Space target) {
        return permissions.can(new Membership(building, user, role, unitA, null), action, target);
    }

    @Test
    void managedPreset() {
        assertThat(can(Role.ADMIN, Action.BUILDING_SETTINGS, null)).isTrue();
        assertThat(can(Role.MANAGER, Action.BUILDING_SETTINGS, null)).isFalse();
        assertThat(can(Role.MANAGER, Action.STRUCTURE_EDIT, unitB)).isTrue();
        assertThat(can(Role.OWNER, Action.STRUCTURE_EDIT, unitA)).isFalse();
        assertThat(can(Role.TENANT, Action.ISSUE_REPORT, unitB)).isTrue();
        assertThat(can(Role.TENANT, Action.ISSUE_TRIAGE, unitB)).isFalse();
        assertThat(can(Role.OWNER, Action.MEMBER_INVITE, unitA)).isTrue();
        assertThat(can(Role.OWNER, Action.MEMBER_INVITE, unitB)).isFalse();
    }

    @Test
    void openPreset() {
        building.update(building.getName(), null, GovernanceMode.OPEN);
        assertThat(can(Role.TENANT, Action.STRUCTURE_EDIT, unitB)).isTrue();
        assertThat(can(Role.TENANT, Action.ASSET_CREATE, unitB)).isTrue();
        assertThat(can(Role.TENANT, Action.ASSET_DELETE, unitB)).isFalse();
        assertThat(can(Role.OWNER, Action.ISSUE_TRIAGE, unitB)).isTrue();
        assertThat(can(Role.TENANT, Action.ISSUE_TRIAGE, unitB)).isFalse();
        assertThat(can(Role.MANAGER, Action.BUILDING_SETTINGS, null)).isFalse();
    }

    @Test
    void middleModeNeedsOnlyNewRows() {
        // "Anyone can add devices, only admins delete them" — inserted as data, no code change.
        jdbc.update("insert into governance_mode (code, name, description) values ('DEVICES_OPEN', 'Devices open', 'x')");
        jdbc.update("""
                insert into permission_policy (governance_mode, action, role_code, scope)
                select 'DEVICES_OPEN', action, role_code, scope from permission_policy where governance_mode = 'MANAGED'
                """);
        jdbc.update("insert into permission_policy (governance_mode, action, role_code, scope) values "
                + "('DEVICES_OPEN', 'ASSET_CREATE', 'TENANT', 'ANY'), ('DEVICES_OPEN', 'ASSET_CREATE', 'OWNER', 'ANY')");
        building.update(building.getName(), null, "DEVICES_OPEN");

        assertThat(can(Role.TENANT, Action.ASSET_CREATE, unitB)).isTrue();
        assertThat(can(Role.TENANT, Action.ASSET_DELETE, unitB)).isFalse();
        assertThat(can(Role.ADMIN, Action.ASSET_DELETE, unitB)).isTrue();
        assertThat(can(Role.TENANT, Action.STRUCTURE_EDIT, unitB)).isFalse();
    }
}
