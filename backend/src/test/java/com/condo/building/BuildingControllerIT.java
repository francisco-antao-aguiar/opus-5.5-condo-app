package com.condo.building;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.condo.governance.Role;
import com.condo.support.IntegrationTest;
import com.fasterxml.jackson.databind.JsonNode;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;

class BuildingControllerIT extends IntegrationTest {

    @Test
    void creatorBecomesAdminAndStructureIsGenerated() throws Exception {
        Actor alice = register("Alice");
        JsonNode b = createBuilding(alice, "MANAGED");
        String id = b.get("id").asText();

        assertThat(b.get("governanceMode").asText()).isEqualTo("MANAGED");
        assertThat(b.get("rootSpaceId").isNull()).isFalse();

        getAs(alice, "/api/buildings").andExpect(status().isOk())
                .andExpect(jsonPath("$[0].id").value(id));
        getAs(alice, "/api/buildings/{id}/permissions/me", id).andExpect(status().isOk())
                .andExpect(jsonPath("$.role").value("ADMIN"))
                .andExpect(jsonPath("$.actions[?(@.action=='BUILDING_SETTINGS')]").exists());
        // root + 2 floors × (1 + 2 units) + roof
        getAs(alice, "/api/buildings/{id}/spaces", id).andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(8));
    }

    @Test
    void outsidersGetAClearNotAMemberError() throws Exception {
        Actor alice = register("Alice");
        Actor mallory = register("Mallory");
        String id = createBuilding(alice, "MANAGED").get("id").asText();

        getAs(mallory, "/api/buildings/{id}", id)
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("NOT_A_MEMBER"));
        getAs(mallory, "/api/buildings/{id}/spaces", id)
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("NOT_A_MEMBER"));
        getAs(mallory, "/api/buildings/{id}", UUID.randomUUID())
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("NOT_FOUND"));
    }

    @Test
    void onlyAdminsChangeSettingsAndGovernanceMode() throws Exception {
        Actor alice = register("Alice");
        Actor manny = register("Manny");
        UUID id = UUID.fromString(createBuilding(alice, "MANAGED").get("id").asText());
        addMember(id, manny, Role.MANAGER, null);

        Map<String, Object> update = Map.of("name", "Renamed", "address", "", "governanceMode", "OPEN");
        putAs(manny, update, "/api/buildings/{id}", id)
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("PERMISSION_DENIED"));
        putAs(alice, update, "/api/buildings/{id}", id)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.governanceMode").value("OPEN"))
                .andExpect(jsonPath("$.address").isEmpty());
        assertThat(spaces.findByBuildingIdAndParentIdIsNull(id).orElseThrow().getName()).isEqualTo("Renamed");

        putAs(alice, Map.of("name", "X", "governanceMode", "ANARCHY"), "/api/buildings/{id}", id)
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("UNKNOWN_GOVERNANCE_MODE"));
    }

    @Test
    void governanceModeChangeTakesEffectImmediately() throws Exception {
        Actor alice = register("Alice");
        Actor tess = register("Tess");
        UUID id = UUID.fromString(createBuilding(alice, "MANAGED").get("id").asText());
        addMember(id, tess, Role.TENANT, spaceNamed(id, "1A"));
        String rootId = spaces.findByBuildingIdAndParentIdIsNull(id).orElseThrow().getId().toString();
        Map<String, Object> newFloor = Map.of("parentId", rootId, "type", "FLOOR", "name", "Floor 3");

        postAs(tess, newFloor, "/api/buildings/{id}/spaces", id).andExpect(status().isForbidden());
        putAs(alice, Map.of("name", "B", "governanceMode", "OPEN"), "/api/buildings/{id}", id)
                .andExpect(status().isOk());
        postAs(tess, newFloor, "/api/buildings/{id}/spaces", id).andExpect(status().isCreated());
    }

    @Test
    void governanceModesAndRolesAreListed() throws Exception {
        Actor alice = register("Alice");
        getAs(alice, "/api/governance-modes").andExpect(status().isOk())
                .andExpect(jsonPath("$[?(@.code=='MANAGED')].rules").exists())
                .andExpect(jsonPath("$[?(@.code=='OPEN')]").exists());
        getAs(alice, "/api/roles").andExpect(status().isOk())
                .andExpect(jsonPath("$[0].code").value("ADMIN"));
    }

    @Test
    void wizardRejectsAbsurdSizes() throws Exception {
        Actor alice = register("Alice");
        postAs(alice, Map.of("name", "Huge", "structure", Map.of("floors", 500, "unitsPerFloor", 4)),
                "/api/buildings")
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION_FAILED"));
    }
}
