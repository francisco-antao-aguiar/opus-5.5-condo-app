package com.condo.support;

import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.condo.governance.Role;
import com.condo.space.Space;
import com.fasterxml.jackson.databind.JsonNode;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.springframework.test.web.servlet.ResultActions;

/**
 * A Managed building with: admin; owner and tenant of 1A; owner of 1B. Assets: a COMMON roof light and garage-like
 * gate on Floor 1, and a PRIVATE water heater in 1A.
 */
public abstract class IssueTestSupport extends IntegrationTest {

    public static final String LIGHT_NOT_WORKING = "00000000-0000-0000-0001-000000000001";
    public static final String LIGHT_FLICKERING = "00000000-0000-0000-0001-000000000002";
    public static final String LIGHT_DAMAGED = "00000000-0000-0000-0001-000000000004";
    public static final String DOOR_WONT_LOCK = "00000000-0000-0000-0003-000000000001";
    public static final String BOILER_NO_HOT_WATER = "00000000-0000-0000-0006-000000000001";

    protected Actor admin;
    protected Actor owner1A;
    protected Actor tenant1A;
    protected Actor owner1B;
    protected UUID buildingId;
    protected Space unit1A;
    protected Space unit1B;
    protected Space floor1;
    protected Space roof;
    protected UUID roofLight;
    protected UUID gate;
    protected UUID heater1A;

    @BeforeEach
    void setUpBuilding() throws Exception {
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
        roofLight = asset(admin, roof, "LIGHT", "Roof light");
        gate = asset(admin, floor1, "GATE", "Floor gate");
        heater1A = asset(owner1A, unit1A, "BOILER", "Water heater");
    }

    protected UUID asset(Actor actor, Space space, String type, String name) throws Exception {
        return UUID.fromString(body(postAs(actor, Map.of("spaceId", space.getId(), "type", type, "name", name),
                "/api/buildings/{b}/assets", buildingId).andExpect(status().isCreated())).get("id").asText());
    }

    protected Map<String, Object> onAsset(UUID assetId, String problemTypeId) {
        Map<String, Object> m = new HashMap<>();
        m.put("assetId", assetId);
        m.put("problemTypeId", problemTypeId);
        return m;
    }

    protected Map<String, Object> other(UUID assetId, String text) {
        Map<String, Object> m = new HashMap<>();
        m.put("assetId", assetId);
        m.put("otherText", text);
        return m;
    }

    protected ResultActions report(Actor actor, Map<String, Object> body) throws Exception {
        return postAs(actor, body, "/api/buildings/{b}/issues", buildingId);
    }

    protected JsonNode reported(Actor actor, Map<String, Object> body) throws Exception {
        return body(report(actor, body).andExpect(status().isCreated()));
    }

    protected ResultActions getIssue(Actor actor, String issueId) throws Exception {
        return getAs(actor, "/api/buildings/{b}/issues/{i}", buildingId, issueId);
    }

    protected ResultActions changeStatus(Actor actor, String issueId, String status, String comment)
            throws Exception {
        Map<String, Object> body = new HashMap<>();
        body.put("status", status);
        body.put("comment", comment);
        return postAs(actor, body, "/api/buildings/{b}/issues/{i}/status", buildingId, issueId);
    }

    protected ResultActions meToo(Actor actor, String issueId) throws Exception {
        return postAs(actor, null, "/api/buildings/{b}/issues/{i}/me-too", buildingId, issueId);
    }

    protected ResultActions list(Actor actor, String query) throws Exception {
        return getAs(actor, "/api/buildings/{b}/issues" + query, buildingId);
    }
}
