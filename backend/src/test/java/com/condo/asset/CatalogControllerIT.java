package com.condo.asset;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.condo.governance.Role;
import com.condo.support.IntegrationTest;
import com.fasterxml.jackson.databind.JsonNode;
import java.util.Map;
import java.util.UUID;
import org.hamcrest.Matchers;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

class CatalogControllerIT extends IntegrationTest {

    private static final String LIGHT_FLICKERING = "00000000-0000-0000-0001-000000000002";

    private Actor admin;
    private Actor tenant;
    private UUID buildingId;

    @BeforeEach
    void setUp() throws Exception {
        admin = register("Admin");
        tenant = register("Tenant");
        buildingId = UUID.fromString(createBuilding(admin, "MANAGED").get("id").asText());
        addMember(buildingId, tenant, Role.TENANT, spaceNamed(buildingId, "1A"));
    }

    private JsonNode catalog(Actor actor, boolean includeInactive) throws Exception {
        return body(getAs(actor, "/api/buildings/{b}/catalog?includeInactive=" + includeInactive, buildingId)
                .andExpect(status().isOk()));
    }

    private JsonNode type(JsonNode catalog, String code) {
        for (JsonNode t : catalog) {
            if (t.get("code").asText().equals(code)) {
                return t;
            }
        }
        throw new AssertionError("no type " + code);
    }

    private String label(JsonNode type, int i) {
        return type.get("problemTypes").get(i).get("label").asText();
    }

    @Test
    void everyBuiltInAssetTypeHasASeededCatalog() throws Exception {
        JsonNode cat = catalog(tenant, false);
        assertThat(cat).hasSize(10);
        for (JsonNode t : cat) {
            assertThat(t.get("problemTypes").size()).as(t.get("code").asText()).isGreaterThanOrEqualTo(3);
            assertThat(t.get("problemTypes").get(0).get("builtIn").asBoolean()).isTrue();
        }
        JsonNode light = type(cat, "LIGHT");
        assertThat(light.get("icon").asText()).isEqualTo("bulb");
        assertThat(label(light, 0)).isEqualTo("Not working");
        assertThat(label(light, 1)).isEqualTo("Flickering");
        assertThat(label(light, 2)).isEqualTo("Always on");
        assertThat(label(type(cat, "INTERCOM"), 1)).isEqualTo("Doesn't open the door");
    }

    @Test
    void customProblemsBelongToOneBuilding() throws Exception {
        postAs(admin, Map.of("assetType", "GATE", "label", "Remote doesn't work"),
                "/api/buildings/{b}/catalog/problem-types", buildingId)
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.builtIn").value(false))
                .andExpect(jsonPath("$.active").value(true));

        JsonNode gate = type(catalog(tenant, false), "GATE");
        assertThat(gate.get("problemTypes").findValuesAsText("label")).contains("Remote doesn't work");

        Actor other = register("Other");
        UUID otherBuilding = UUID.fromString(createBuilding(other, "MANAGED").get("id").asText());
        JsonNode otherGate = type(body(getAs(other, "/api/buildings/{b}/catalog", otherBuilding)), "GATE");
        assertThat(otherGate.get("problemTypes").findValuesAsText("label")).doesNotContain("Remote doesn't work");
    }

    @Test
    void labelsAreUniquePerTypeIncludingBuiltIns() throws Exception {
        postAs(admin, Map.of("assetType", "LIGHT", "label", "  FLICKERING "),
                "/api/buildings/{b}/catalog/problem-types", buildingId)
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("DUPLICATE_PROBLEM_TYPE"));
        // Same label on another asset type is fine.
        postAs(admin, Map.of("assetType", "DOOR", "label", "Flickering"),
                "/api/buildings/{b}/catalog/problem-types", buildingId)
                .andExpect(status().isCreated());
        postAs(admin, Map.of("assetType", "SPACESHIP", "label", "x"),
                "/api/buildings/{b}/catalog/problem-types", buildingId)
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("UNKNOWN_ASSET_TYPE"));
    }

    @Test
    void builtInsCanBeHiddenButNotRenamed() throws Exception {
        String url = "/api/buildings/{b}/catalog/problem-types/{p}";
        putAs(admin, Map.of("label", "Blinking", "sortOrder", 2, "active", true), url, buildingId, LIGHT_FLICKERING)
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("BUILT_IN_PROBLEM_TYPE"));

        putAs(admin, Map.of("label", "Flickering", "sortOrder", 2, "active", false), url, buildingId, LIGHT_FLICKERING)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.active").value(false));
        assertThat(type(catalog(tenant, false), "LIGHT").get("problemTypes").findValuesAsText("label"))
                .doesNotContain("Flickering");
        JsonNode adminView = type(catalog(admin, true), "LIGHT");
        assertThat(adminView.get("problemTypes").findValuesAsText("label")).contains("Flickering");

        // Hiding is per building: a different building still offers it.
        Actor other = register("Other");
        UUID otherBuilding = UUID.fromString(createBuilding(other, "MANAGED").get("id").asText());
        assertThat(type(body(getAs(other, "/api/buildings/{b}/catalog", otherBuilding)), "LIGHT")
                .get("problemTypes").findValuesAsText("label")).contains("Flickering");

        putAs(admin, Map.of("label", "Flickering", "sortOrder", 2, "active", true), url, buildingId, LIGHT_FLICKERING)
                .andExpect(status().isOk());
        assertThat(type(catalog(tenant, false), "LIGHT").get("problemTypes").findValuesAsText("label"))
                .contains("Flickering");
    }

    @Test
    void customProblemsCanBeRenamedAndDeactivated() throws Exception {
        String id = body(postAs(admin, Map.of("assetType", "GATE", "label", "Remote broken"),
                "/api/buildings/{b}/catalog/problem-types", buildingId)).get("id").asText();
        putAs(admin, Map.of("label", "Remote doesn't work", "sortOrder", 0, "active", false),
                "/api/buildings/{b}/catalog/problem-types/{p}", buildingId, id)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.label").value("Remote doesn't work"))
                .andExpect(jsonPath("$.active").value(false));
        assertThat(type(catalog(tenant, false), "GATE").get("problemTypes").findValuesAsText("label"))
                .doesNotContain("Remote doesn't work");
    }

    @Test
    void catalogEditingFollowsThePolicy() throws Exception {
        postAs(tenant, Map.of("assetType", "GATE", "label", "Squeaks"),
                "/api/buildings/{b}/catalog/problem-types", buildingId)
                .andExpect(status().isForbidden());
        getAs(tenant, "/api/buildings/{b}/catalog?includeInactive=true", buildingId)
                .andExpect(status().isForbidden());

        // In an Open building owners edit the catalog too.
        Actor openAdmin = register("OpenAdmin");
        Actor openOwner = register("OpenOwner");
        UUID open = UUID.fromString(createBuilding(openAdmin, "OPEN").get("id").asText());
        addMember(open, openOwner, Role.OWNER, spaceNamed(open, "1A"));
        postAs(openOwner, Map.of("assetType", "GATE", "label", "Squeaks"),
                "/api/buildings/{b}/catalog/problem-types", open)
                .andExpect(status().isCreated());

        // Another building's custom entry can't be edited through this building.
        String foreign = body(postAs(openAdmin, Map.of("assetType", "DOOR", "label", "Sticky"),
                "/api/buildings/{b}/catalog/problem-types", open)).get("id").asText();
        putAs(admin, Map.of("label", "Mine now", "sortOrder", 0, "active", true),
                "/api/buildings/{b}/catalog/problem-types/{p}", buildingId, foreign)
                .andExpect(status().isNotFound());
        getAs(admin, "/api/buildings/{b}/catalog", buildingId)
                .andExpect(jsonPath("$[?(@.code=='DOOR')].problemTypes[*].label",
                        Matchers.not(Matchers.hasItem("Sticky"))));
    }
}
