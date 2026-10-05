package com.condo.space;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.condo.governance.Role;
import com.condo.support.IntegrationTest;
import com.fasterxml.jackson.databind.JsonNode;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

class SpaceControllerIT extends IntegrationTest {

    private Actor admin;
    private UUID buildingId;
    private Space root;

    @BeforeEach
    void setUp() throws Exception {
        admin = register("Admin");
        buildingId = UUID.fromString(createBuilding(admin, "MANAGED").get("id").asText());
        root = spaces.findByBuildingIdAndParentIdIsNull(buildingId).orElseThrow();
    }

    private JsonNode create(UUID parentId, String type, String name) throws Exception {
        return body(postAs(admin, Map.of("parentId", parentId, "type", type, "name", name),
                "/api/buildings/{b}/spaces", buildingId).andExpect(status().isCreated()));
    }

    @Test
    void irregularStructuresAreFine() throws Exception {
        // A shop straight under the root, a floor with only one unit, a room inside a room.
        JsonNode shop = create(root.getId(), "UNIT", "Corner shop");
        assertThat(shop.get("visibility").asText()).isEqualTo("PRIVATE");
        assertThat(shop.get("depth").asInt()).isEqualTo(1);

        JsonNode mezz = create(root.getId(), "FLOOR", "Mezzanine");
        JsonNode office = create(UUID.fromString(mezz.get("id").asText()), "ROOM", "Office");
        JsonNode closet = create(UUID.fromString(office.get("id").asText()), "ROOM", "Closet");
        assertThat(closet.get("effectiveVisibility").asText()).isEqualTo("COMMON");
        assertThat(closet.get("visibility").isNull()).isTrue();

        postAs(admin, Map.of("parentId", root.getId(), "type", "BUILDING", "name", "Second root"),
                "/api/buildings/{b}/spaces", buildingId)
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("INVALID_HIERARCHY"));
    }

    @Test
    void visibilityIsInheritedAndOverridable() throws Exception {
        Space unit = spaceNamed(buildingId, "1A");
        JsonNode room = create(unit.getId(), "ROOM", "Bathroom");
        assertThat(room.get("effectiveVisibility").asText()).isEqualTo("PRIVATE");

        Map<String, Object> update = new HashMap<>();
        update.put("name", "Bathroom");
        update.put("type", "ROOM");
        update.put("visibility", "COMMON");
        update.put("sortOrder", 0);
        putAs(admin, update, "/api/buildings/{b}/spaces/{s}", buildingId, room.get("id").asText())
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.effectiveVisibility").value("COMMON"));

        update.put("visibility", null);
        putAs(admin, update, "/api/buildings/{b}/spaces/{s}", buildingId, room.get("id").asText())
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.visibility").isEmpty())
                .andExpect(jsonPath("$.effectiveVisibility").value("PRIVATE"));
    }

    @Test
    void moveRebasesTheWholeSubtree() throws Exception {
        Space floor1 = spaceNamed(buildingId, "Floor 1");
        Space floor2 = spaceNamed(buildingId, "Floor 2");
        Space unit = spaceNamed(buildingId, "1A");
        JsonNode room = create(unit.getId(), "ROOM", "Kitchen");

        JsonNode moved = body(postAs(admin, Map.of("newParentId", floor2.getId()),
                "/api/buildings/{b}/spaces/{s}/move", buildingId, unit.getId()).andExpect(status().isOk()));
        assertThat(moved).hasSize(2);

        Space movedUnit = spaces.findById(unit.getId()).orElseThrow();
        Space movedRoom = spaces.findById(UUID.fromString(room.get("id").asText())).orElseThrow();
        assertThat(movedUnit.getParentId()).isEqualTo(floor2.getId());
        assertThat(movedUnit.getPath()).isEqualTo(floor2.getPath() + unit.getId() + "/");
        assertThat(movedRoom.getPath()).isEqualTo(movedUnit.getPath() + movedRoom.getId() + "/");
        assertThat(movedRoom.getDepth()).isEqualTo(3);
        assertThat(movedRoom.isWithin(floor1)).isFalse();

        // Move the floor under root's roof: depth of grandchildren changes too.
        Space roof = spaceNamed(buildingId, "Roof");
        postAs(admin, Map.of("newParentId", roof.getId()), "/api/buildings/{b}/spaces/{s}/move", buildingId,
                floor2.getId()).andExpect(status().isOk());
        assertThat(spaces.findById(movedRoom.getId()).orElseThrow().getDepth()).isEqualTo(4);
    }

    @Test
    void cannotMoveIntoOwnSubtreeOrMoveRoot() throws Exception {
        Space floor1 = spaceNamed(buildingId, "Floor 1");
        Space unit = spaceNamed(buildingId, "1A");
        postAs(admin, Map.of("newParentId", unit.getId()), "/api/buildings/{b}/spaces/{s}/move", buildingId,
                floor1.getId())
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("INVALID_MOVE"));
        postAs(admin, Map.of("newParentId", floor1.getId()), "/api/buildings/{b}/spaces/{s}/move", buildingId,
                floor1.getId())
                .andExpect(status().isBadRequest());
        postAs(admin, Map.of("newParentId", floor1.getId()), "/api/buildings/{b}/spaces/{s}/move", buildingId,
                root.getId())
                .andExpect(status().isBadRequest());
    }

    @Test
    void deleteRequiresCascadeForNonLeafNodes() throws Exception {
        Space floor1 = spaceNamed(buildingId, "Floor 1");
        deleteAs(admin, "/api/buildings/{b}/spaces/{s}", buildingId, floor1.getId())
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("SPACE_HAS_CHILDREN"));
        deleteAs(admin, "/api/buildings/{b}/spaces/{s}?cascade=true", buildingId, floor1.getId())
                .andExpect(status().isNoContent());
        assertThat(spaces.findByBuildingIdOrderByDepthAscSortOrderAscNameAsc(buildingId))
                .extracting(Space::getName).doesNotContain("Floor 1", "1A", "1B");
        deleteAs(admin, "/api/buildings/{b}/spaces/{s}?cascade=true", buildingId, root.getId())
                .andExpect(status().isBadRequest());
    }

    @Test
    void deletingAUnitDetachesItsMembers() throws Exception {
        Actor tess = register("Tess");
        Space unit = spaceNamed(buildingId, "2A");
        UUID membershipId = addMember(buildingId, tess, Role.TENANT, unit).getId();
        deleteAs(admin, "/api/buildings/{b}/spaces/{s}", buildingId, unit.getId()).andExpect(status().isNoContent());
        getAs(tess, "/api/buildings/{b}/permissions/me", buildingId)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.membershipId").value(membershipId.toString()))
                .andExpect(jsonPath("$.unitId").isEmpty());
    }

    @Test
    void generateAppendsOnlyWhenAsked() throws Exception {
        Map<String, Object> req = new HashMap<>(Map.of("floors", 1, "unitsPerFloor", 1));
        postAs(admin, req, "/api/buildings/{b}/spaces/generate", buildingId)
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("STRUCTURE_NOT_EMPTY"));
        req.put("append", true);
        postAs(admin, req, "/api/buildings/{b}/spaces/generate", buildingId)
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.created").value(2));
    }

    @Test
    void residentsCanReadButNotEditInManagedMode() throws Exception {
        Actor owner = register("Owner");
        Space unit = spaceNamed(buildingId, "1A");
        addMember(buildingId, owner, Role.OWNER, unit);

        getAs(owner, "/api/buildings/{b}/spaces", buildingId).andExpect(status().isOk());
        getAs(owner, "/api/buildings/{b}/spaces/{s}", buildingId, unit.getId()).andExpect(status().isOk());
        postAs(owner, Map.of("parentId", unit.getId(), "type", "ROOM", "name", "Kitchen"),
                "/api/buildings/{b}/spaces", buildingId)
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("PERMISSION_DENIED"));
        deleteAs(owner, "/api/buildings/{b}/spaces/{s}", buildingId, unit.getId())
                .andExpect(status().isForbidden());
    }

    @Test
    void staleVersionsAreRejectedInsteadOfOverwriting() throws Exception {
        JsonNode floor = create(root.getId(), "FLOOR", "Mezzanine");
        long v0 = floor.get("version").asLong();
        Map<String, Object> update = new HashMap<>();
        update.put("name", "Mezzanine (east)");
        update.put("type", "FLOOR");
        update.put("visibility", null);
        update.put("sortOrder", 0);
        update.put("version", v0);
        String url = "/api/buildings/{b}/spaces/{s}";
        JsonNode updated = body(putAs(admin, update, url, buildingId, floor.get("id").asText())
                .andExpect(status().isOk()));
        assertThat(updated.get("version").asLong()).isEqualTo(v0 + 1);

        // A second editor still holding v0 gets a conflict, not a silent overwrite.
        update.put("name", "Mezzanine (west)");
        putAs(admin, update, url, buildingId, floor.get("id").asText())
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("CONFLICT"));

        // Clients that don't send a version keep last-write-wins.
        update.remove("version");
        putAs(admin, update, url, buildingId, floor.get("id").asText()).andExpect(status().isOk());
    }

    @Test
    void spacesOfAnotherBuildingAreNotReachable() throws Exception {
        Actor bob = register("Bob");
        UUID other = UUID.fromString(createBuilding(bob, "MANAGED").get("id").asText());
        Space foreignFloor = spaceNamed(other, "Floor 1");
        // Admin of building A addressing a space of building B through A's URL.
        getAs(admin, "/api/buildings/{b}/spaces/{s}", buildingId, foreignFloor.getId())
                .andExpect(status().isNotFound());
        postAs(admin, Map.of("parentId", foreignFloor.getId(), "type", "UNIT", "name", "Sneaky"),
                "/api/buildings/{b}/spaces", buildingId)
                .andExpect(status().isNotFound());
    }
}
