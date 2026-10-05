package com.condo.asset;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.condo.governance.Role;
import com.condo.space.Space;
import com.condo.support.IntegrationTest;
import com.fasterxml.jackson.databind.JsonNode;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.hamcrest.Matchers;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.test.web.servlet.ResultActions;

class AssetControllerIT extends IntegrationTest {

    @Autowired
    AssetRepository assets;

    private Actor admin;
    private Actor owner1A;
    private Actor tenant1A;
    private Actor owner1B;
    private UUID buildingId;
    private Space unit1A;
    private Space unit1B;
    private Space floor1;
    private Space roof;

    @BeforeEach
    void setUp() throws Exception {
        admin = register("Admin");
        owner1A = register("Owner1A");
        tenant1A = register("Tenant1A");
        owner1B = register("Owner1B");
        buildingId = UUID.fromString(createBuilding(admin, "MANAGED").get("id").asText());
        unit1A = spaceNamed(buildingId, "1A");
        unit1B = spaceNamed(buildingId, "1B");
        floor1 = spaceNamed(buildingId, "Floor 1");
        roof = spaceNamed(buildingId, "Roof");
        addMember(buildingId, owner1A, Role.OWNER, unit1A);
        addMember(buildingId, tenant1A, Role.TENANT, unit1A);
        addMember(buildingId, owner1B, Role.OWNER, unit1B);
    }

    private Map<String, Object> asset(Space space, String type, String name) {
        Map<String, Object> m = new HashMap<>();
        m.put("spaceId", space.getId());
        m.put("type", type);
        m.put("name", name);
        return m;
    }

    private ResultActions create(Actor actor, Map<String, Object> body) throws Exception {
        return postAs(actor, body, "/api/buildings/{b}/assets", buildingId);
    }

    private JsonNode created(Actor actor, Space space, String type, String name) throws Exception {
        return body(create(actor, asset(space, type, name)).andExpect(status().isCreated()));
    }

    private ResultActions list(Actor actor, String query) throws Exception {
        return getAs(actor, "/api/buildings/{b}/assets" + query, buildingId);
    }

    @Test
    void adminsAddCommonAssetsEveryoneSees() throws Exception {
        JsonNode door = created(admin, roof, "DOOR", "Roof access door");
        assertThat(door.get("typeName").asText()).isEqualTo("Door");
        assertThat(door.get("spacePath").asText()).isEqualTo("Roof");
        assertThat(door.get("effectiveVisibility").asText()).isEqualTo("COMMON");
        assertThat(door.get("archived").asBoolean()).isFalse();

        list(tenant1A, "").andExpect(status().isOk()).andExpect(jsonPath("$[*].name", Matchers.contains("Roof access door")));
        getAs(owner1B, "/api/buildings/{b}/assets/{a}", buildingId, door.get("id").asText()).andExpect(status().isOk());
    }

    @Test
    void managedModeOwnersManageAssetsOnlyInsideTheirUnit() throws Exception {
        created(owner1A, unit1A, "BOILER", "Water heater");
        create(owner1A, asset(unit1B, "BOILER", "Not mine")).andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("PERMISSION_DENIED"));
        create(owner1A, asset(roof, "LIGHT", "Roof light")).andExpect(status().isForbidden());
        create(tenant1A, asset(unit1A, "LIGHT", "Tenant light")).andExpect(status().isForbidden());
    }

    @Test
    void privateAssetsAreOnlyVisibleToTheUnitAndItsCaretakers() throws Exception {
        JsonNode heater = created(owner1A, unit1A, "BOILER", "Water heater");
        String id = heater.get("id").asText();
        assertThat(heater.get("effectiveVisibility").asText()).isEqualTo("PRIVATE");

        list(tenant1A, "").andExpect(jsonPath("$[*].name", Matchers.contains("Water heater")));
        list(admin, "").andExpect(jsonPath("$[*].name", Matchers.contains("Water heater")));
        list(owner1B, "").andExpect(jsonPath("$.length()").value(0));
        // Not even its existence leaks.
        getAs(owner1B, "/api/buildings/{b}/assets/{a}", buildingId, id).andExpect(status().isNotFound());

        // Asset counts on the tree follow the same rule.
        getAs(admin, "/api/buildings/{b}/spaces/{s}", buildingId, unit1A.getId())
                .andExpect(jsonPath("$.assetCount").value(1));
        getAs(owner1B, "/api/buildings/{b}/spaces/{s}", buildingId, unit1A.getId())
                .andExpect(jsonPath("$.assetCount").value(0));
    }

    @Test
    void movingNeedsEditRightsOnBothEndsAndRespectsVersions() throws Exception {
        JsonNode light = created(admin, roof, "LIGHT", "Roof light");
        String id = light.get("id").asText();
        long v0 = light.get("version").asLong();

        Map<String, Object> move = asset(floor1, "LIGHT", "Landing light");
        move.put("version", v0);
        JsonNode moved = body(putAs(admin, move, "/api/buildings/{b}/assets/{a}", buildingId, id)
                .andExpect(status().isOk()));
        assertThat(moved.get("spacePath").asText()).isEqualTo("Floor 1");
        assertThat(moved.get("version").asLong()).isEqualTo(v0 + 1);

        putAs(admin, move, "/api/buildings/{b}/assets/{a}", buildingId, id)
                .andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("CONFLICT"));

        String heaterId = created(owner1A, unit1A, "BOILER", "Water heater").get("id").asText();
        putAs(owner1A, asset(unit1B, "BOILER", "Water heater"), "/api/buildings/{b}/assets/{a}", buildingId, heaterId)
                .andExpect(status().isForbidden());

        putAs(admin, asset(floor1, "SPACESHIP", "x"), "/api/buildings/{b}/assets/{a}", buildingId, id)
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("UNKNOWN_ASSET_TYPE"));
    }

    @Test
    void archiveKeepsTheAssetAndRestoreBringsItBack() throws Exception {
        String id = created(owner1A, unit1A, "BOILER", "Water heater").get("id").asText();
        deleteAs(tenant1A, "/api/buildings/{b}/assets/{a}", buildingId, id).andExpect(status().isForbidden());
        deleteAs(owner1A, "/api/buildings/{b}/assets/{a}", buildingId, id).andExpect(status().isNoContent());

        list(owner1A, "").andExpect(jsonPath("$.length()").value(0));
        list(owner1A, "?includeArchived=true")
                .andExpect(jsonPath("$[0].archived").value(true))
                .andExpect(jsonPath("$[0].archivedAt").isNotEmpty());
        putAs(owner1A, asset(unit1A, "BOILER", "Renamed"), "/api/buildings/{b}/assets/{a}", buildingId, id)
                .andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("ASSET_ARCHIVED"));

        postAs(owner1A, null, "/api/buildings/{b}/assets/{a}/restore", buildingId, id)
                .andExpect(status().isOk()).andExpect(jsonPath("$.archived").value(false));
        assertThat(assets.findById(UUID.fromString(id)).orElseThrow().isArchived()).isFalse();
    }

    @Test
    void spacesWithActiveAssetsCantBeDeletedButArchivedOnesSurvive() throws Exception {
        String id = created(admin, unit1A, "LIGHT", "Hall light").get("id").asText();
        deleteAs(admin, "/api/buildings/{b}/spaces/{s}?cascade=true", buildingId, floor1.getId())
                .andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("SPACE_HAS_ASSETS"));

        deleteAs(admin, "/api/buildings/{b}/assets/{a}", buildingId, id).andExpect(status().isNoContent());
        deleteAs(admin, "/api/buildings/{b}/spaces/{s}?cascade=true", buildingId, floor1.getId())
                .andExpect(status().isNoContent());

        Asset orphan = assets.findById(UUID.fromString(id)).orElseThrow();
        assertThat(orphan.isArchived()).isTrue();
        assertThat(orphan.getSpaceId()).isNull();
        list(admin, "?includeArchived=true").andExpect(jsonPath("$[0].spaceId").isEmpty())
                .andExpect(jsonPath("$[0].spacePath").isEmpty());
        list(owner1B, "?includeArchived=true").andExpect(jsonPath("$.length()").value(0));
        postAs(admin, null, "/api/buildings/{b}/assets/{a}/restore", buildingId, id)
                .andExpect(status().isConflict());
    }

    @Test
    void bulkCreateIsAllOrNothing() throws Exception {
        Space floor2 = spaceNamed(buildingId, "Floor 2");
        Map<String, Object> bulk = new HashMap<>(Map.of("type", "LIGHT", "name", "Stairwell light",
                "spaceIds", List.of(floor1.getId(), floor2.getId(), floor1.getId())));
        postAs(admin, bulk, "/api/buildings/{b}/assets/bulk", buildingId)
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.length()").value(2))
                .andExpect(jsonPath("$[*].spacePath", Matchers.containsInAnyOrder("Floor 1", "Floor 2")));

        bulk.put("spaceIds", List.of(unit1A.getId(), unit1B.getId()));
        postAs(owner1A, bulk, "/api/buildings/{b}/assets/bulk", buildingId).andExpect(status().isForbidden());
        list(owner1A, "?spaceId=" + unit1A.getId()).andExpect(jsonPath("$.length()").value(0));

        bulk.put("spaceIds", List.of());
        postAs(admin, bulk, "/api/buildings/{b}/assets/bulk", buildingId).andExpect(status().isBadRequest());
    }

    @Test
    void filtersBySubtreeTypeAndName() throws Exception {
        created(admin, floor1, "LIGHT", "Landing light");
        created(admin, unit1A, "PLUMBING", "Kitchen sink");
        created(admin, roof, "DOOR", "Roof door");

        list(admin, "?spaceId=" + floor1.getId()).andExpect(jsonPath("$.length()").value(2));
        list(admin, "?spaceId=" + floor1.getId() + "&includeDescendants=false")
                .andExpect(jsonPath("$[*].name", Matchers.contains("Landing light")));
        list(admin, "?type=DOOR").andExpect(jsonPath("$[*].name", Matchers.contains("Roof door")));
        list(admin, "?q=SINK").andExpect(jsonPath("$[*].name", Matchers.contains("Kitchen sink")));
        list(admin, "?spaceId=" + UUID.randomUUID()).andExpect(status().isNotFound());
    }
}
