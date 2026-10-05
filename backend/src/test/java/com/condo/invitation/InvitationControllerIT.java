package com.condo.invitation;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.condo.governance.Role;
import com.condo.member.Membership;
import com.condo.space.Space;
import com.condo.support.IntegrationTest;
import com.fasterxml.jackson.databind.JsonNode;
import java.time.Duration;
import java.time.Instant;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.Callable;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.test.web.servlet.ResultActions;

class InvitationControllerIT extends IntegrationTest {

    @Autowired
    InvitationRepository invitations;

    private Actor admin;
    private Actor owner;
    private Actor tenant;
    private UUID buildingId;
    private Space unit1A;
    private Space unit1B;
    private Space unit2A;
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
        unit2A = spaceNamed(buildingId, "2A");
        ownerM = addMember(buildingId, owner, Role.OWNER, unit1A);
        tenantM = addMember(buildingId, tenant, Role.TENANT, unit1A);
    }

    private Map<String, Object> inviteBody(String role, Space unit) {
        Map<String, Object> body = new HashMap<>();
        body.put("role", role);
        body.put("unitId", unit != null ? unit.getId() : null);
        return body;
    }

    private ResultActions createInvite(Actor actor, Map<String, Object> body) throws Exception {
        return postAs(actor, body, "/api/buildings/{b}/invitations", buildingId);
    }

    private String inviteCode(Actor actor, Map<String, Object> body) throws Exception {
        return body(createInvite(actor, body).andExpect(status().isCreated())).get("code").asText();
    }

    private ResultActions accept(Actor actor, String code) throws Exception {
        return postAs(actor, null, "/api/invitations/{code}/accept", code);
    }

    private ResultActions anonymousPreview(String code, String ip) throws Exception {
        return mvc.perform(get("/api/invitations/{code}", code).with(r -> {
            r.setRemoteAddr(ip);
            return r;
        }));
    }

    @Test
    void adminInvitesAndANewPersonJoins() throws Exception {
        Map<String, Object> body = inviteBody(Role.OWNER, unit2A);
        body.put("note", "New owner of 2A");
        JsonNode inv = body(createInvite(admin, body).andExpect(status().isCreated()));
        String code = inv.get("code").asText();
        assertThat(code).hasSize(8);
        assertThat(inv.get("status").asText()).isEqualTo("ACTIVE");
        assertThat(inv.get("maxUses").asInt()).isEqualTo(1);
        assertThat(inv.get("joinUrl").asText()).endsWith("/join/" + code);
        assertThat(inv.get("deepLink").asText()).isEqualTo("buildingapp://join/" + code);
        assertThat(Instant.parse(inv.get("expiresAt").asText()))
                .isBetween(Instant.now().plus(Duration.ofDays(6)), Instant.now().plus(Duration.ofDays(8)));

        // Preview works signed out, so the join page can show what you're joining before sign-up.
        anonymousPreview(code.toLowerCase().substring(0, 4) + "-" + code.substring(4), "10.0.0.1")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.role").value("OWNER"))
                .andExpect(jsonPath("$.unitName").value("2A"))
                .andExpect(jsonPath("$.invitedByName").value("Admin"))
                .andExpect(jsonPath("$.status").value("ACTIVE"));

        Actor nina = register("Nina");
        accept(nina, code).andExpect(status().isOk())
                .andExpect(jsonPath("$.buildingId").value(buildingId.toString()))
                .andExpect(jsonPath("$.membership.role").value("OWNER"))
                .andExpect(jsonPath("$.membership.unitName").value("2A"));
        getAs(nina, "/api/buildings/{b}/permissions/me", buildingId).andExpect(status().isOk())
                .andExpect(jsonPath("$.unitId").value(unit2A.getId().toString()));
        getAs(admin, "/api/buildings/{b}/members", buildingId)
                .andExpect(jsonPath("$[?(@.displayName=='Nina')].invitedByName")
                        .value(org.hamcrest.Matchers.contains("Admin")));

        // Single use: the next person is turned away.
        accept(register("Late"), code)
                .andExpect(status().isGone())
                .andExpect(jsonPath("$.code").value("INVITATION_EXHAUSTED"));
        getAs(admin, "/api/buildings/{b}/invitations", buildingId)
                .andExpect(jsonPath("$[0].useCount").value(1))
                .andExpect(jsonPath("$[0].status").value("EXHAUSTED"));
    }

    @Test
    void ownersInviteOnlyIntoTheirOwnUnitAndNotAboveTheirRole() throws Exception {
        Instant leaseEnd = Instant.now().plus(Duration.ofDays(180));
        Map<String, Object> body = inviteBody(Role.TENANT, unit1A);
        body.put("membershipExpiresAt", leaseEnd);
        String code = inviteCode(owner, body);

        createInvite(owner, inviteBody(Role.TENANT, unit1B))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("PERMISSION_DENIED"));
        createInvite(owner, inviteBody(Role.TENANT, null))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("PERMISSION_DENIED"));
        createInvite(owner, inviteBody(Role.MANAGER, unit1A))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("ROLE_RANK_EXCEEDED"));
        createInvite(tenant, inviteBody(Role.TENANT, unit1A))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("PERMISSION_DENIED"));

        // The membership itself carries the lease end date.
        Actor flatmate = register("Flatmate");
        accept(flatmate, code).andExpect(status().isOk());
        Membership m = memberships.findByBuildingAndUser(buildingId, flatmate.userId()).orElseThrow();
        assertThat(m.getRoleCode()).isEqualTo(Role.TENANT);
        assertThat(m.getExpiresAt()).isCloseTo(leaseEnd, org.assertj.core.api.Assertions.within(1,
                java.time.temporal.ChronoUnit.SECONDS));
    }

    @Test
    void guestAccessIsCountedFromAcceptance() throws Exception {
        Map<String, Object> body = inviteBody(Role.TENANT, unit1A);
        body.put("membershipDurationDays", 7);
        JsonNode inv = body(createInvite(owner, body).andExpect(status().isCreated()));
        assertThat(inv.get("membershipDurationDays").asInt()).isEqualTo(7);
        assertThat(inv.get("membershipExpiresAt").isNull()).isTrue();
        String code = inv.get("code").asText();
        anonymousPreview(code, "10.0.0.5").andExpect(jsonPath("$.membershipDurationDays").value(7));

        Actor guest = register("Guest");
        Instant before = Instant.now();
        accept(guest, code).andExpect(status().isOk());
        Instant after = Instant.now();
        Instant expires = memberships.findByBuildingAndUser(buildingId, guest.userId()).orElseThrow().getExpiresAt();
        assertThat(expires).isBetween(before.plus(Duration.ofDays(7)), after.plus(Duration.ofDays(7)));

        Map<String, Object> both = inviteBody(Role.TENANT, unit1A);
        both.put("membershipDurationDays", 7);
        both.put("membershipExpiresAt", Instant.now().plus(Duration.ofDays(30)));
        createInvite(owner, both)
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.errors[0].field").value("membershipDurationDays"));
        Map<String, Object> tooLong = inviteBody(Role.TENANT, unit1A);
        tooLong.put("membershipDurationDays", 0);
        createInvite(owner, tooLong).andExpect(status().isBadRequest());
    }

    @Test
    void multiUseInvitationStopsAtMaxUses() throws Exception {
        Map<String, Object> body = inviteBody(Role.TENANT, unit1B);
        body.put("maxUses", 2);
        String code = inviteCode(admin, body);
        accept(register("A"), code).andExpect(status().isOk());
        accept(register("B"), code).andExpect(status().isOk());
        accept(register("C"), code)
                .andExpect(status().isGone())
                .andExpect(jsonPath("$.code").value("INVITATION_EXHAUSTED"));
    }

    @Test
    void revokedInvitationsStopWorking() throws Exception {
        JsonNode inv = body(createInvite(admin, inviteBody(Role.OWNER, unit2A)).andExpect(status().isCreated()));
        String code = inv.get("code").asText();
        String id = inv.get("id").asText();

        // An owner can't cancel an admin's invitation into a unit that isn't theirs…
        deleteAs(owner, "/api/buildings/{b}/invitations/{id}", buildingId, id).andExpect(status().isForbidden());
        deleteAs(admin, "/api/buildings/{b}/invitations/{id}", buildingId, id).andExpect(status().isNoContent());

        anonymousPreview(code, "10.0.0.2").andExpect(jsonPath("$.status").value("REVOKED"));
        accept(register("Too late"), code)
                .andExpect(status().isGone())
                .andExpect(jsonPath("$.code").value("INVITATION_REVOKED"));

        // …but anyone can cancel their own.
        String ownId = body(createInvite(owner, inviteBody(Role.TENANT, unit1A))).get("id").asText();
        deleteAs(owner, "/api/buildings/{b}/invitations/{id}", buildingId, ownId).andExpect(status().isNoContent());
    }

    @Test
    void expiredInvitationsStopWorking() throws Exception {
        Membership adminM = memberships.findByBuildingAndUser(buildingId, admin.userId()).orElseThrow();
        invitations.save(new Invitation(buildings.findById(buildingId).orElseThrow(), "XPRDCD22", Role.TENANT,
                null, adminM, 1, Instant.now().minusSeconds(1), null, null));
        anonymousPreview("XPRDCD22", "10.0.0.3").andExpect(jsonPath("$.status").value("EXPIRED"));
        accept(register("Slow"), "XPRDCD22")
                .andExpect(status().isGone())
                .andExpect(jsonPath("$.code").value("INVITATION_EXPIRED"));
    }

    @Test
    void validatesInput() throws Exception {
        Map<String, Object> past = inviteBody(Role.TENANT, unit1A);
        past.put("expiresAt", Instant.now().minusSeconds(60));
        createInvite(admin, past)
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION_FAILED"))
                .andExpect(jsonPath("$.errors[0].field").value("expiresAt"));

        Map<String, Object> tooLong = inviteBody(Role.TENANT, unit1A);
        tooLong.put("expiresAt", Instant.now().plus(Duration.ofDays(91)));
        createInvite(admin, tooLong).andExpect(status().isBadRequest());

        Map<String, Object> pastMembership = inviteBody(Role.TENANT, unit1A);
        pastMembership.put("membershipExpiresAt", Instant.now().minusSeconds(60));
        createInvite(admin, pastMembership)
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.errors[0].field").value("membershipExpiresAt"));

        Map<String, Object> zeroUses = inviteBody(Role.TENANT, unit1A);
        zeroUses.put("maxUses", 0);
        createInvite(admin, zeroUses).andExpect(status().isBadRequest());

        createInvite(admin, inviteBody(Role.TENANT, spaceNamed(buildingId, "Floor 1")))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("INVALID_UNIT"));
        createInvite(admin, inviteBody("EMPEROR", null))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("UNKNOWN_ROLE"));
    }

    @Test
    void activeMembersCantReuseAnInvitation() throws Exception {
        String code = inviteCode(admin, inviteBody(Role.OWNER, unit2A));
        accept(tenant, code)
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("ALREADY_MEMBER"));
        // The slot wasn't consumed.
        accept(register("Real invitee"), code).andExpect(status().isOk());
    }

    @Test
    void formerMembersRejoinWithTheNewInvitationsTerms() throws Exception {
        deleteAs(admin, "/api/buildings/{b}/members/{m}", buildingId, tenantM.getId()).andExpect(status().isNoContent());
        getAs(tenant, "/api/buildings/{b}/spaces", buildingId).andExpect(status().isForbidden());

        String code = inviteCode(admin, inviteBody(Role.TENANT, unit1B));
        accept(tenant, code).andExpect(status().isOk());

        Membership m = memberships.findById(tenantM.getId()).orElseThrow();
        assertThat(m.getStatus().name()).isEqualTo("ACTIVE");
        assertThat(m.getRevokedAt()).isNull();
        getAs(tenant, "/api/buildings/{b}/permissions/me", buildingId).andExpect(status().isOk())
                .andExpect(jsonPath("$.unitId").value(unit1B.getId().toString()));
    }

    @Test
    void invitationsDieWithTheIssuersRightToInvite() throws Exception {
        String code = inviteCode(owner, inviteBody(Role.TENANT, unit1A));
        // The owner sells the flat and loses access.
        deleteAs(admin, "/api/buildings/{b}/members/{m}", buildingId, ownerM.getId()).andExpect(status().isNoContent());
        anonymousPreview(code, "10.0.0.4").andExpect(jsonPath("$.status").value("INVALID"));
        accept(register("Buyer's friend"), code)
                .andExpect(status().isGone())
                .andExpect(jsonPath("$.code").value("INVITATION_INVALID"));
    }

    @Test
    void listShowsOnlyWhatTheCallerMayManage() throws Exception {
        inviteCode(admin, inviteBody(Role.OWNER, unit2A));
        inviteCode(admin, inviteBody(Role.TENANT, unit1A));
        inviteCode(owner, inviteBody(Role.TENANT, unit1A));

        getAs(admin, "/api/buildings/{b}/invitations", buildingId).andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(3));
        getAs(owner, "/api/buildings/{b}/invitations", buildingId).andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(2))
                .andExpect(jsonPath("$[*].unitName").value(org.hamcrest.Matchers.everyItem(
                        org.hamcrest.Matchers.is("1A"))));
        getAs(tenant, "/api/buildings/{b}/invitations", buildingId)
                .andExpect(status().isForbidden());
    }

    @Test
    void wrongCodesAreRateLimited() throws Exception {
        String good = inviteCode(admin, inviteBody(Role.TENANT, unit1A));
        String ip = "10.66.66." + (int) (Math.random() * 200);
        for (int i = 0; i < 10; i++) {
            anonymousPreview("ZZZZZZZ" + (char) ('A' + i), ip)
                    .andExpect(status().isNotFound())
                    .andExpect(jsonPath("$.code").value("INVITATION_NOT_FOUND"));
        }
        anonymousPreview(good, ip)
                .andExpect(status().isTooManyRequests())
                .andExpect(jsonPath("$.code").value("TOO_MANY_ATTEMPTS"));
        anonymousPreview(good, "10.77.77.77").andExpect(status().isOk());
    }

    @Test
    void concurrentAcceptsCantExceedMaxUses() throws Exception {
        String code = inviteCode(admin, inviteBody(Role.TENANT, unit1B));
        List<Actor> racers = List.of(register("R1"), register("R2"), register("R3"), register("R4"));
        ExecutorService pool = Executors.newFixedThreadPool(racers.size());
        try {
            List<Callable<Integer>> calls = racers.stream()
                    .<Callable<Integer>>map(a -> () -> accept(a, code).andReturn().getResponse().getStatus())
                    .toList();
            List<Integer> statuses = pool.invokeAll(calls).stream().map(f -> {
                try {
                    return f.get();
                } catch (Exception e) {
                    throw new IllegalStateException(e);
                }
            }).toList();
            assertThat(statuses).containsOnlyOnce(200);
            assertThat(statuses).filteredOn(s -> s != 200).allMatch(s -> s == 410);
        } finally {
            pool.shutdownNow();
        }
        assertThat(invitations.findByCode(code).orElseThrow().getUseCount()).isEqualTo(1);
    }
}
