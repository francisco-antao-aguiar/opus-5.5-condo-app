package com.condo.booking;

import com.condo.auth.User;
import com.condo.auth.UserRepository;
import com.condo.building.Building;
import com.condo.building.BuildingRepository;
import com.condo.common.error.ApiException;
import com.condo.common.error.ErrorCodes;
import com.condo.common.security.CurrentUser;
import com.condo.common.storage.SignedUrls;
import com.condo.space.Space;
import com.condo.space.SpaceRepository;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.util.Map;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.servlet.support.ServletUriComponentsBuilder;

/**
 * iCalendar feed of a user's confirmed bookings, for calendar apps. Calendar apps can't send an Authorization
 * header, so the feed URL is signed and long-lived (a year). The signature covers the user's calendar key, so
 * resetting the key revokes every link handed out before.
 */
@Service
@Transactional
public class BookingCalendarService {

    static final Duration FEED_TTL = Duration.ofDays(365);
    private static final DateTimeFormatter ICS_TIME = DateTimeFormatter.ofPattern("yyyyMMdd'T'HHmmss'Z'")
            .withZone(ZoneOffset.UTC);

    private final BookingRepository bookings;
    private final SpaceRepository spaces;
    private final BuildingRepository buildings;
    private final UserRepository users;
    private final SignedUrls signedUrls;
    private final Clock clock;

    public BookingCalendarService(BookingRepository bookings, SpaceRepository spaces, BuildingRepository buildings,
            UserRepository users, SignedUrls signedUrls, Clock clock) {
        this.bookings = bookings;
        this.spaces = spaces;
        this.buildings = buildings;
        this.users = users;
        this.signedUrls = signedUrls;
        this.clock = clock;
    }

    public BookingDtos.CalendarLink link() {
        return link(me());
    }

    /** Revokes every calendar link handed out before and returns a fresh one. */
    public BookingDtos.CalendarLink resetLink() {
        User user = me();
        user.rotateCalendarKey();
        return link(user);
    }

    private User me() {
        return users.findById(CurrentUser.id()).orElseThrow(() -> ApiException.notFound("User"));
    }

    private BookingDtos.CalendarLink link(User user) {
        UUID userId = user.getId();
        SignedUrls.Signature sig = signedUrls.sign(resource(userId, user.calendarKey()), FEED_TTL);
        String url = ServletUriComponentsBuilder.fromCurrentContextPath()
                .path("/api/files/calendar/{user}.ics").queryParam("exp", sig.expiresAtEpochSeconds())
                .queryParam("sig", sig.sig()).buildAndExpand(userId).toUriString();
        return new BookingDtos.CalendarLink(url);
    }

    private static String resource(UUID userId, String calendarKey) {
        return "calendar:" + userId + ":" + calendarKey;
    }

    @Transactional(readOnly = true)
    public String feed(UUID userId, long exp, String sig) {
        String key = users.findById(userId).map(User::getCalendarKey).orElse(null);
        if (key == null || !signedUrls.verify(resource(userId, key), exp, sig)) {
            throw ApiException.forbidden(ErrorCodes.PERMISSION_DENIED, "This calendar link is invalid or has expired.");
        }
        Instant now = clock.instant();
        var mine = bookings.findConfirmedOfUser(userId, now.minus(Duration.ofDays(30)));
        Map<UUID, Space> spacesById = spaces.findAllById(mine.stream().map(Booking::getSpaceId).distinct().toList())
                .stream().collect(Collectors.toMap(Space::getId, Function.identity()));
        Map<UUID, String> buildingNames = buildings.findAllById(
                        mine.stream().map(Booking::getBuildingId).distinct().toList())
                .stream().collect(Collectors.toMap(Building::getId, Building::getName));

        StringBuilder ics = new StringBuilder();
        line(ics, "BEGIN:VCALENDAR");
        line(ics, "VERSION:2.0");
        line(ics, "PRODID:-//Condo//Bookings//EN");
        line(ics, "CALSCALE:GREGORIAN");
        line(ics, "X-WR-CALNAME:My bookings");
        for (Booking b : mine) {
            Space space = spacesById.get(b.getSpaceId());
            String summary = (space != null ? space.getName() : "Booking") + " · "
                    + buildingNames.getOrDefault(b.getBuildingId(), "");
            line(ics, "BEGIN:VEVENT");
            line(ics, "UID:" + b.getId() + "@condo");
            line(ics, "DTSTAMP:" + ICS_TIME.format(now));
            line(ics, "DTSTART:" + ICS_TIME.format(b.getStartsAt()));
            line(ics, "DTEND:" + ICS_TIME.format(b.getEndsAt()));
            line(ics, "SUMMARY:" + escape(summary));
            if (b.getNote() != null) {
                line(ics, "DESCRIPTION:" + escape(b.getNote()));
            }
            line(ics, "STATUS:CONFIRMED");
            line(ics, "END:VEVENT");
        }
        line(ics, "END:VCALENDAR");
        return ics.toString();
    }

    /** RFC 5545: CRLF line endings. */
    private static void line(StringBuilder sb, String content) {
        sb.append(content).append("\r\n");
    }

    private static String escape(String text) {
        return text.replace("\\", "\\\\").replace(";", "\\;").replace(",", "\\,").replace("\r", "")
                .replace("\n", "\\n");
    }
}
