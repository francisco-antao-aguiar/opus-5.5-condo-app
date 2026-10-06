package com.condo.booking;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.condo.notification.NotificationRequest;
import com.condo.notification.NotificationType;
import com.condo.support.IssueTestSupport;
import java.net.URI;
import java.sql.Timestamp;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.event.ApplicationEvents;
import org.springframework.test.context.event.RecordApplicationEvents;
import org.springframework.test.web.servlet.ResultActions;

@RecordApplicationEvents
class BookingIT extends IssueTestSupport {

    private static final ZoneId LISBON = ZoneId.of("Europe/Lisbon");

    @Autowired
    ApplicationEvents applicationEvents;
    @Autowired
    BookingService service;
    @Autowired
    JdbcTemplate jdbc;

    private UUID room;

    @BeforeEach
    void makeThePartyRoomBookable() throws Exception {
        room = UUID.fromString(body(postAs(admin, Map.of("parentId", floor1.getId(), "type", "COMMON_AREA",
                "name", "Party room"), "/api/buildings/{b}/spaces", buildingId).andExpect(status().isCreated()))
                .get("id").asText());
        putAs(admin, policy(), "/api/buildings/{b}/spaces/{s}/booking-policy", buildingId, room)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.enabled").value(true))
                .andExpect(jsonPath("$.timeZone").value("Europe/Lisbon"));
    }

    private Map<String, Object> policy() {
        Map<String, Object> p = new HashMap<>();
        p.put("enabled", true);
        p.put("slotMinutes", 60);
        p.put("minMinutes", 60);
        p.put("maxMinutes", 240);
        List<List<String>> day = List.of(List.of("08:00", "22:00"));
        p.put("openingHours", Map.of("MON", day, "TUE", day, "WED", day, "THU", day, "FRI", day, "SAT", day,
                "SUN", day));
        p.put("advanceDays", 30);
        p.put("maxActivePerUnit", 1);
        p.put("cancelCutoffHours", 168); // a week: any booking in these tests is inside the cutoff
        p.put("rulesText", "Leave it clean.");
        return p;
    }

    /** {@code days} from today at {@code hour}:00 Lisbon time. */
    private static Instant at(int days, int hour, int minute) {
        return LocalDate.now(LISBON).plusDays(days).atTime(hour, minute).atZone(LISBON).toInstant();
    }

    private ResultActions request(Actor actor, Instant start, Instant end) throws Exception {
        return postAs(actor, Map.of("spaceId", room, "startsAt", start.toString(), "endsAt", end.toString(),
                "note", "Birthday"), "/api/buildings/{b}/bookings", buildingId);
    }

    private String requested(Actor actor, Instant start, Instant end) throws Exception {
        return body(request(actor, start, end).andExpect(status().isCreated())).get("id").asText();
    }

    private ResultActions decide(Actor actor, String id, String what) throws Exception {
        return postAs(actor, Map.of("note", "ok"), "/api/buildings/{b}/bookings/{id}/" + what, buildingId, id);
    }

    @Test
    void requestsWaitForAnAdminAndHoldTheirSlot() throws Exception {
        String id = requested(tenant1A, at(2, 10, 0), at(2, 12, 0));
        getAs(tenant1A, "/api/buildings/{b}/bookings/{id}", buildingId, id)
                .andExpect(jsonPath("$.status").value("PENDING"))
                .andExpect(jsonPath("$.mine").value(true))
                .andExpect(jsonPath("$.canCancel").value(true))
                .andExpect(jsonPath("$.canDecide").value(false));
        assertThat(applicationEvents.stream(NotificationRequest.class)
                .filter(r -> r.type() == NotificationType.BOOKING_REQUESTED)
                .flatMap(r -> r.recipients().stream())).contains(admin.userId()).doesNotContain(tenant1A.userId());

        // The pending request already blocks the slot for others.
        request(owner1B, at(2, 11, 0), at(2, 13, 0))
                .andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("BOOKING_CONFLICT"));
        getAs(owner1B, "/api/buildings/{b}/spaces/{s}/availability?from={f}&to={t}", buildingId, room,
                at(0, 0, 0), at(7, 0, 0))
                .andExpect(jsonPath("$.busy.length()").value(1))
                .andExpect(jsonPath("$.busy[0].mine").value(false));

        decide(tenant1A, id, "approve").andExpect(status().isForbidden());
        decide(admin, id, "approve").andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("CONFIRMED"))
                .andExpect(jsonPath("$.decidedByName").value("Admin"));
        decide(admin, id, "reject").andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("INVALID_STATE"));
        assertThat(applicationEvents.stream(NotificationRequest.class)
                .filter(r -> r.type() == NotificationType.BOOKING_CONFIRMED)
                .flatMap(r -> r.recipients().stream())).containsExactly(tenant1A.userId());

        // Inside the cutoff the requester can't cancel, an admin still can.
        decide(tenant1A, id, "cancel").andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("BOOKING_CANCEL_CUTOFF"));
        decide(admin, id, "cancel").andExpect(status().isOk()).andExpect(jsonPath("$.status").value("CANCELLED"));
        requested(owner1B, at(2, 11, 0), at(2, 13, 0)); // the slot is free again
    }

    @Test
    void rulesAndTheHomeLimitAreEnforced() throws Exception {
        expectRules(at(2, 3, 0), at(2, 4, 0)); // closed at night
        expectRules(at(2, 10, 30), at(2, 11, 30)); // off the slot grid
        expectRules(at(2, 10, 0), at(2, 15, 0)); // longer than 4 h
        expectRules(at(-1, 10, 0), at(-1, 11, 0)); // the past
        expectRules(at(40, 10, 0), at(40, 11, 0)); // too far ahead
        expectRules(at(2, 12, 0), at(2, 10, 0)); // backwards

        requested(tenant1A, at(2, 10, 0), at(2, 11, 0));
        // One upcoming booking per home: the owner of 1A shares the tenant's quota, 1B has its own.
        request(owner1A, at(3, 10, 0), at(3, 11, 0))
                .andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("BOOKING_LIMIT"));
        requested(owner1B, at(3, 10, 0), at(3, 11, 0));

        putAs(admin, policy(), "/api/buildings/{b}/spaces/{s}/booking-policy", buildingId, unit1A.getId())
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("NOT_BOOKABLE"));
        putAs(tenant1A, policy(), "/api/buildings/{b}/spaces/{s}/booking-policy", buildingId, room)
                .andExpect(status().isForbidden());
    }

    @Test
    void requestersCanWithdrawAndAdminsReject() throws Exception {
        String withdrawn = requested(tenant1A, at(2, 10, 0), at(2, 11, 0));
        decide(owner1B, withdrawn, "cancel").andExpect(status().isForbidden());
        decide(tenant1A, withdrawn, "cancel").andExpect(status().isOk());

        String rejected = requested(tenant1A, at(2, 10, 0), at(2, 11, 0));
        decide(admin, rejected, "reject").andExpect(status().isOk()).andExpect(jsonPath("$.status").value("REJECTED"));
        getAs(tenant1A, "/api/buildings/{b}/bookings?mine=true", buildingId)
                .andExpect(jsonPath("$.length()").value(2));
        getAs(owner1B, "/api/buildings/{b}/bookings?mine=true", buildingId).andExpect(jsonPath("$.length()").value(0));
    }

    @Test
    void jobsRemindExpireAndCleanUp() throws Exception {
        String waiting = requested(tenant1A, at(2, 10, 0), at(2, 11, 0));
        jdbc.update("update booking set created_at = ? where id = ?",
                Timestamp.from(Instant.now().minus(Duration.ofHours(49))), UUID.fromString(waiting));
        assertThat(service.remindReviewers()).isEqualTo(1);
        assertThat(service.remindReviewers()).isZero(); // once only
        assertThat(applicationEvents.stream(NotificationRequest.class)
                .filter(r -> r.type() == NotificationType.BOOKING_REVIEW_REMINDER)).hasSize(1);

        // Nobody reviewed it and its time came: rejected so the requester isn't left hanging.
        jdbc.update("update booking set starts_at = ?, ends_at = ? where id = ?",
                Timestamp.from(Instant.now().minusSeconds(60)), Timestamp.from(Instant.now().plusSeconds(3540)),
                UUID.fromString(waiting));
        assertThat(service.expireUnreviewed()).isEqualTo(1);
        getAs(tenant1A, "/api/buildings/{b}/bookings/{id}", buildingId, waiting)
                .andExpect(jsonPath("$.status").value("REJECTED"));

        // A member whose access ended loses their future bookings.
        String confirmed = requested(owner1B, at(3, 10, 0), at(3, 11, 0));
        decide(admin, confirmed, "approve").andExpect(status().isOk());
        jdbc.update("update membership set status = 'REVOKED' where user_id = ? and building_id = ?",
                owner1B.userId(), buildingId);
        assertThat(service.cancelForInactiveMembers()).isEqualTo(1);
        getAs(admin, "/api/buildings/{b}/bookings/{id}", buildingId, confirmed)
                .andExpect(jsonPath("$.status").value("CANCELLED"));
    }

    @Test
    void confirmedBookingsShowUpInTheCalendarFeed() throws Exception {
        String id = requested(tenant1A, at(2, 10, 0), at(2, 12, 0));
        decide(admin, id, "approve").andExpect(status().isOk());

        URI link = URI.create(body(getAs(tenant1A, "/api/me/bookings/calendar-link")).get("url").asText());
        String feed = mvc.perform(get(link.getRawPath() + "?" + link.getRawQuery()))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        assertThat(feed).startsWith("BEGIN:VCALENDAR\r\n").contains("UID:" + id + "@condo")
                .contains("SUMMARY:Party room").endsWith("END:VCALENDAR\r\n");

        mvc.perform(get(link.getRawPath() + "?" + link.getRawQuery().replaceAll("sig=[^&]+", "sig=bogus")))
                .andExpect(status().isForbidden());

        // Upcoming bookings protect their space.
        deleteAs(admin, "/api/buildings/{b}/spaces/{s}", buildingId, room)
                .andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("SPACE_HAS_BOOKINGS"));
    }

    private void expectRules(Instant start, Instant end) throws Exception {
        request(tenant1A, start, end)
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("BOOKING_RULES"));
    }
}
