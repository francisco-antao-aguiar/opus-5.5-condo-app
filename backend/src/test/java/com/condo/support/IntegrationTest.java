package com.condo.support;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;

import com.condo.auth.User;
import com.condo.auth.UserRepository;
import com.condo.building.Building;
import com.condo.building.BuildingRepository;
import com.condo.member.Membership;
import com.condo.member.MembershipRepository;
import com.condo.space.Space;
import com.condo.space.SpaceRepository;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.Map;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

/**
 * Full-stack tests against an in-memory H2 migrated by Flyway. Tests isolate themselves by creating their own
 * users (random emails) and buildings instead of truncating tables.
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
public abstract class IntegrationTest {

    @Autowired
    protected MockMvc mvc;
    @Autowired
    protected ObjectMapper json;
    @Autowired
    protected UserRepository users;
    @Autowired
    protected BuildingRepository buildings;
    @Autowired
    protected SpaceRepository spaces;
    @Autowired
    protected MembershipRepository memberships;

    /** A registered user and their access token. */
    public record Actor(UUID userId, String email, String token) {
    }

    protected Actor register(String name) throws Exception {
        String email = name.toLowerCase().replaceAll("[^a-z0-9]", "") + "-" + UUID.randomUUID() + "@test.local";
        JsonNode tokens = body(call(post("/api/auth/register"), null,
                Map.of("email", email, "password", "password123", "displayName", name)));
        UUID id = users.findByEmail(email).map(User::getId).orElseThrow();
        return new Actor(id, email, tokens.get("accessToken").asText());
    }

    /** Creates a building as {@code admin} with a small generated structure; returns its JSON. */
    protected JsonNode createBuilding(Actor admin, String mode) throws Exception {
        return body(call(post("/api/buildings"), admin, Map.of(
                "name", "Test building " + UUID.randomUUID(),
                "governanceMode", mode,
                "structure", Map.of("floors", 2, "unitsPerFloor", 2, "commonAreas", new String[] {"ROOF"}))));
    }

    /** Adds a member directly (invitations arrive in phase 2). */
    protected Membership addMember(UUID buildingId, Actor actor, String role, Space unit) {
        Building b = buildings.findById(buildingId).orElseThrow();
        User u = users.findById(actor.userId()).orElseThrow();
        return memberships.save(new Membership(b, u, role, unit, null));
    }

    protected Space spaceNamed(UUID buildingId, String name) {
        return spaces.findByBuildingIdOrderByDepthAscSortOrderAscNameAsc(buildingId).stream()
                .filter(s -> s.getName().equals(name)).findFirst().orElseThrow();
    }

    protected ResultActions call(MockHttpServletRequestBuilder req, Actor actor, Object body) throws Exception {
        if (actor != null) {
            req.header("Authorization", "Bearer " + actor.token());
        }
        if (body != null) {
            req.contentType(MediaType.APPLICATION_JSON).content(json.writeValueAsString(body));
        }
        return mvc.perform(req);
    }

    protected ResultActions getAs(Actor actor, String url, Object... vars) throws Exception {
        return call(get(url, vars), actor, null);
    }

    protected ResultActions postAs(Actor actor, Object body, String url, Object... vars) throws Exception {
        return call(post(url, vars), actor, body);
    }

    protected ResultActions putAs(Actor actor, Object body, String url, Object... vars) throws Exception {
        return call(put(url, vars), actor, body);
    }

    protected ResultActions deleteAs(Actor actor, String url, Object... vars) throws Exception {
        return call(delete(url, vars), actor, null);
    }

    protected JsonNode body(ResultActions result) throws Exception {
        return json.readTree(result.andReturn().getResponse().getContentAsString());
    }
}
