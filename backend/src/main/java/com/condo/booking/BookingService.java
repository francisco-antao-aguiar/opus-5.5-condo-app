package com.condo.booking;

import com.condo.auth.User;
import com.condo.auth.UserRepository;
import com.condo.booking.BookingDtos.Availability;
import com.condo.booking.BookingDtos.BookingDecisionRequest;
import com.condo.booking.BookingDtos.BookingDto;
import com.condo.booking.BookingDtos.BookingPolicyDto;
import com.condo.booking.BookingDtos.BusySlot;
import com.condo.booking.BookingDtos.CreateBookingRequest;
import com.condo.booking.BookingDtos.SaveBookingPolicyRequest;
import com.condo.building.Building;
import com.condo.building.BuildingRepository;
import com.condo.common.config.AppProperties;
import com.condo.common.error.ApiException;
import com.condo.common.error.ErrorCodes;
import com.condo.common.persistence.Versions;
import com.condo.governance.AccessGuard;
import com.condo.governance.Action;
import com.condo.governance.PermissionService;
import com.condo.issue.IssueViews;
import com.condo.member.Membership;
import com.condo.member.MembershipRepository;
import com.condo.notification.NotificationRequest;
import com.condo.notification.NotificationType;
import com.condo.space.Space;
import com.condo.space.SpaceRepository;
import com.condo.space.SpaceService;
import com.condo.space.Visibility;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.Arrays;
import java.util.EnumSet;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Shared-space booking. Every request starts PENDING and holds its slot until an admin approves or rejects it;
 * overlap checks run under a row lock on the space's policy, so two simultaneous requests can't both get in.
 */
@Service
@Transactional
public class BookingService {

    private static final Duration MAX_AVAILABILITY_RANGE = Duration.ofDays(62);
    private static final DateTimeFormatter WHEN = DateTimeFormatter.ofPattern("EEE d MMM, HH:mm", Locale.ENGLISH);

    private final BookingPolicyRepository policies;
    private final BookingRepository bookings;
    private final SpaceRepository spaces;
    private final BuildingRepository buildings;
    private final MembershipRepository memberships;
    private final UserRepository users;
    private final AccessGuard guard;
    private final PermissionService permissions;
    private final ApplicationEventPublisher publisher;
    private final AppProperties props;
    private final Clock clock;

    public BookingService(BookingPolicyRepository policies, BookingRepository bookings, SpaceRepository spaces,
            BuildingRepository buildings, MembershipRepository memberships, UserRepository users, AccessGuard guard,
            PermissionService permissions, ApplicationEventPublisher publisher, AppProperties props, Clock clock) {
        this.policies = policies;
        this.bookings = bookings;
        this.spaces = spaces;
        this.buildings = buildings;
        this.memberships = memberships;
        this.users = users;
        this.guard = guard;
        this.permissions = permissions;
        this.publisher = publisher;
        this.props = props;
        this.clock = clock;
    }

    // ===================== policies =====================

    /** Members see enabled bookable spaces; managers also see disabled ones. */
    @Transactional(readOnly = true)
    public List<BookingPolicyDto> bookableSpaces(UUID buildingId) {
        Membership member = guard.require(buildingId, Action.BUILDING_VIEW);
        boolean manager = permissions.can(member, Action.BOOKING_MANAGE, null);
        Ctx ctx = ctx(buildingId);
        return policies.findByBuildingId(buildingId).stream()
                .filter(p -> manager || p.isEnabled())
                .filter(p -> ctx.spaces().containsKey(p.getSpaceId()))
                .map(p -> toDto(p, ctx))
                .sorted((a, b) -> a.locationLabel().compareToIgnoreCase(b.locationLabel()))
                .toList();
    }

    @Transactional(readOnly = true)
    public BookingPolicyDto getPolicy(UUID buildingId, UUID spaceId) {
        Membership member = guard.require(buildingId, Action.BUILDING_VIEW);
        BookingPolicy policy = policies.findById(spaceId)
                .filter(p -> p.getBuildingId().equals(buildingId))
                .filter(p -> p.isEnabled() || permissions.can(member, Action.BOOKING_MANAGE, null))
                .orElseThrow(() -> ApiException.notFound("Bookable space"));
        return toDto(policy, ctx(buildingId));
    }

    public BookingPolicyDto savePolicy(UUID buildingId, UUID spaceId, SaveBookingPolicyRequest req) {
        Ctx ctx = ctx(buildingId);
        Space space = ctx.space(spaceId);
        guard.require(buildingId, Action.BOOKING_MANAGE, space);
        if (SpaceService.effectiveVisibility(space, ctx.spaces()) != Visibility.COMMON) {
            throw ApiException.badRequest(ErrorCodes.NOT_BOOKABLE, "Only common spaces can be booked.");
        }
        int slot = req.slotMinutes();
        if (req.minMinutes() % slot != 0 || req.maxMinutes() % slot != 0 || req.minMinutes() > req.maxMinutes()) {
            throw ApiException.badRequest(ErrorCodes.BOOKING_RULES,
                    "Minimum and maximum durations must be whole slots, minimum ≤ maximum.");
        }
        OpeningHours hours = OpeningHours.parse(req.openingHours());
        BookingPolicy policy = policies.findById(spaceId).orElseGet(() -> new BookingPolicy(spaceId, buildingId));
        Versions.requireCurrent(req.version(), policy.getVersion());
        policy.define(req.enabled(), slot, req.minMinutes(), req.maxMinutes(), hours, req.advanceDays(),
                req.maxActivePerUnit(), req.cancelCutoffHours(), blankToNull(req.rulesText()));
        policies.saveAndFlush(policy);
        return toDto(policy, ctx);
    }

    // ===================== reading bookings =====================

    @Transactional(readOnly = true)
    public Availability availability(UUID buildingId, UUID spaceId, Instant from, Instant to) {
        Membership member = guard.require(buildingId, Action.BUILDING_VIEW);
        BookingPolicyDto policy = getPolicy(buildingId, spaceId);
        if (!to.isAfter(from) || Duration.between(from, to).compareTo(MAX_AVAILABILITY_RANGE) > 0) {
            throw ApiException.invalidField("to", "Ask for at most 62 days at a time");
        }
        UUID me = member.getUser().getId();
        List<BusySlot> busy = bookings.findLiveOverlapping(spaceId, from, to).stream()
                .map(b -> new BusySlot(b.getStartsAt(), b.getEndsAt(), b.getStatus().name(), b.getUserId().equals(me)))
                .toList();
        return new Availability(spaceId, policy.timeZone(), from, to, busy, policy);
    }

    /** Everyone sees when spaces are taken; names only for their own bookings or for managers. */
    @Transactional(readOnly = true)
    public List<BookingDto> list(UUID buildingId, Boolean mine, UUID spaceId, String status, Instant from,
            Instant to) {
        Membership member = guard.require(buildingId, Action.BUILDING_VIEW);
        Set<Booking.Status> statuses = parseStatuses(status);
        Instant start = from != null ? from : Instant.EPOCH;
        Instant end = to != null ? to : Instant.parse("9999-12-31T00:00:00Z");
        UUID me = member.getUser().getId();
        Ctx ctx = ctx(buildingId);
        return bookings.findInRange(buildingId, start, end).stream()
                .filter(b -> !Boolean.TRUE.equals(mine) || b.getUserId().equals(me))
                .filter(b -> spaceId == null || spaceId.equals(b.getSpaceId()))
                .filter(b -> statuses.contains(b.getStatus()))
                .map(b -> toDto(b, member, ctx))
                .toList();
    }

    @Transactional(readOnly = true)
    public BookingDto get(UUID buildingId, UUID bookingId) {
        Membership member = guard.require(buildingId, Action.BUILDING_VIEW);
        return toDto(find(buildingId, bookingId), member, ctx(buildingId));
    }

    // ===================== requesting & deciding =====================

    public BookingDto request(UUID buildingId, CreateBookingRequest req) {
        Ctx ctx = ctx(buildingId);
        Space space = ctx.space(req.spaceId());
        Membership member = guard.require(buildingId, Action.BOOKING_CREATE, space);
        BookingPolicy policy = policies.findForUpdate(req.spaceId())
                .filter(p -> p.getBuildingId().equals(buildingId) && p.isEnabled())
                .orElseThrow(() -> ApiException.conflict(ErrorCodes.NOT_BOOKABLE, "This space can't be booked."));
        checkRules(policy, ctx.zone(), req.startsAt(), req.endsAt());
        requireFree(req.spaceId(), req.startsAt(), req.endsAt(), null);

        Instant now = clock.instant();
        UUID unitId = member.getUnitSpace() != null ? member.getUnitSpace().getId() : null;
        if (policy.getMaxActivePerUnit() != null) {
            long upcoming = unitId != null ? bookings.countUpcomingForUnit(req.spaceId(), unitId, now)
                    : bookings.countUpcomingForMembership(req.spaceId(), member.getId(), now);
            if (upcoming >= policy.getMaxActivePerUnit()) {
                throw ApiException.conflict(ErrorCodes.BOOKING_LIMIT, "Your home already has "
                        + policy.getMaxActivePerUnit() + " upcoming booking(s) for this space.");
            }
        }
        Booking booking = bookings.save(new Booking(buildingId, req.spaceId(), member.getId(), member.getUser().getId(),
                unitId, req.startsAt(), req.endsAt(), blankToNull(req.note())));
        notifyManagers(booking, space, ctx, NotificationType.BOOKING_REQUESTED, member.getUser().getId(),
                member.getUser().getDisplayName() + " asked for " + when(booking, ctx.zone()));
        return toDto(booking, member, ctx);
    }

    public BookingDto approve(UUID buildingId, UUID bookingId, BookingDecisionRequest req) {
        Booking booking = find(buildingId, bookingId);
        Ctx ctx = ctx(buildingId);
        Membership admin = guard.require(buildingId, Action.BOOKING_MANAGE, ctx.space(booking.getSpaceId()));
        policies.findForUpdate(booking.getSpaceId());
        requirePending(booking);
        if (!booking.getStartsAt().isAfter(clock.instant())) {
            throw ApiException.conflict(ErrorCodes.INVALID_STATE, "This booking has already started.");
        }
        requireFree(booking.getSpaceId(), booking.getStartsAt(), booking.getEndsAt(), booking.getId());
        booking.approve(admin.getUser().getId(), blankToNull(req.note()), clock.instant());
        bookings.flush();
        notifyRequester(booking, ctx, NotificationType.BOOKING_CONFIRMED, "Confirmed: " + when(booking, ctx.zone())
                + (booking.getDecisionNote() != null ? " · " + booking.getDecisionNote() : ""));
        return toDto(booking, admin, ctx);
    }

    public BookingDto reject(UUID buildingId, UUID bookingId, BookingDecisionRequest req) {
        Booking booking = find(buildingId, bookingId);
        Ctx ctx = ctx(buildingId);
        Membership admin = guard.require(buildingId, Action.BOOKING_MANAGE, ctx.space(booking.getSpaceId()));
        requirePending(booking);
        booking.reject(admin.getUser().getId(), blankToNull(req.note()), clock.instant());
        bookings.flush();
        notifyRequester(booking, ctx, NotificationType.BOOKING_REJECTED, "Not approved: " + when(booking, ctx.zone())
                + (booking.getDecisionNote() != null ? " · " + booking.getDecisionNote() : ""));
        return toDto(booking, admin, ctx);
    }

    /** The requester may withdraw a pending request anytime, a confirmed one until the cutoff; managers anytime. */
    public BookingDto cancel(UUID buildingId, UUID bookingId, BookingDecisionRequest req) {
        Booking booking = find(buildingId, bookingId);
        Ctx ctx = ctx(buildingId);
        Membership member = guard.require(buildingId, Action.BUILDING_VIEW);
        boolean manager = permissions.can(member, Action.BOOKING_MANAGE, ctx.space(booking.getSpaceId()));
        boolean mine = booking.getUserId().equals(member.getUser().getId());
        if (!manager && !mine) {
            throw ApiException.forbidden(ErrorCodes.PERMISSION_DENIED, "You can only cancel your own bookings.");
        }
        if (!booking.isLive()) {
            throw ApiException.conflict(ErrorCodes.INVALID_STATE, "This booking is already " + label(booking) + ".");
        }
        if (!manager && booking.getStatus() == Booking.Status.CONFIRMED) {
            BookingPolicy policy = policies.findById(booking.getSpaceId()).orElse(null);
            int cutoff = policy != null ? policy.getCancelCutoffHours() : 0;
            if (clock.instant().isAfter(booking.getStartsAt().minus(Duration.ofHours(cutoff)))) {
                throw ApiException.conflict(ErrorCodes.BOOKING_CANCEL_CUTOFF, "Confirmed bookings can be cancelled "
                        + "until " + cutoff + " hours before they start. Ask an admin.");
            }
        }
        booking.cancel(member.getUser().getId(), blankToNull(req.note()), clock.instant());
        bookings.flush();
        if (!mine) {
            notifyRequester(booking, ctx, NotificationType.BOOKING_CANCELLED, "Cancelled: " + when(booking, ctx.zone())
                    + (booking.getDecisionNote() != null ? " · " + booking.getDecisionNote() : ""));
        }
        return toDto(booking, member, ctx);
    }

    // ===================== jobs (BookingJob) =====================

    /** Requests nobody reviewed before they start are rejected, so the requester isn't left hanging. */
    public int expireUnreviewed() {
        Instant now = clock.instant();
        List<Booking> stale = bookings.findPendingStarted(now);
        for (Booking b : stale) {
            b.reject(null, "Not reviewed in time", now);
            Ctx ctx = ctx(b.getBuildingId());
            notifyRequester(b, ctx, NotificationType.BOOKING_REJECTED,
                    "Not reviewed in time: " + when(b, ctx.zone()));
        }
        return stale.size();
    }

    /** One reminder to the admins about a request still pending after the configured delay (48 h). */
    public int remindReviewers() {
        Instant now = clock.instant();
        List<Booking> waiting = bookings.findPendingNeedingReminder(
                now.minus(props.bookings().reviewReminderAfter()), now);
        for (Booking b : waiting) {
            Ctx ctx = ctx(b.getBuildingId());
            long hours = Duration.between(b.getCreatedAt(), now).toHours();
            notifyManagers(b, ctx.spaces().get(b.getSpaceId()), ctx, NotificationType.BOOKING_REVIEW_REMINDER, null,
                    "Waiting for review for " + hours + " h: " + when(b, ctx.zone()));
            b.markReminded(now);
        }
        return waiting.size();
    }

    /** Members whose access ended don't keep future bookings. */
    public int cancelForInactiveMembers() {
        Instant now = clock.instant();
        List<Booking> orphaned = bookings.findLiveOfInactiveMembers(now);
        orphaned.forEach(b -> b.cancel(null, "Membership ended", now));
        return orphaned.size();
    }

    // ===================== helpers =====================

    private void checkRules(BookingPolicy policy, ZoneId zone, Instant start, Instant end) {
        Instant now = clock.instant();
        if (!end.isAfter(start)) {
            throw rules("The end must be after the start.");
        }
        if (!start.isAfter(now)) {
            throw rules("Pick a time in the future.");
        }
        if (start.isAfter(now.plus(Duration.ofDays(policy.getAdvanceDays())))) {
            throw rules("This space can be booked at most " + policy.getAdvanceDays() + " days ahead.");
        }
        long minutes = Duration.between(start, end).toMinutes();
        if (minutes < policy.getMinMinutes() || minutes > policy.getMaxMinutes()) {
            throw rules("Bookings last between " + policy.getMinMinutes() + " and " + policy.getMaxMinutes()
                    + " minutes.");
        }
        LocalDateTime localStart = LocalDateTime.ofInstant(start, zone);
        LocalDateTime localEnd = LocalDateTime.ofInstant(end, zone);
        int startMinute = localStart.getHour() * 60 + localStart.getMinute();
        if (localStart.getSecond() != 0 || startMinute % policy.getSlotMinutes() != 0
                || minutes % policy.getSlotMinutes() != 0) {
            throw rules("Bookings start and end on " + policy.getSlotMinutes() + "-minute slots.");
        }
        if (!policy.openingHours().contains(localStart, localEnd)) {
            throw rules("That time is outside the opening hours.");
        }
    }

    private void requireFree(UUID spaceId, Instant start, Instant end, UUID ignoreBookingId) {
        boolean taken = bookings.findLiveOverlapping(spaceId, start, end).stream()
                .anyMatch(b -> !b.getId().equals(ignoreBookingId));
        if (taken) {
            throw ApiException.conflict(ErrorCodes.BOOKING_CONFLICT, "Someone already asked for (part of) that time.");
        }
    }

    private static void requirePending(Booking booking) {
        if (booking.getStatus() != Booking.Status.PENDING) {
            throw ApiException.conflict(ErrorCodes.INVALID_STATE, "This booking is already " + label(booking) + ".");
        }
    }

    private void notifyManagers(Booking b, Space space, Ctx ctx, NotificationType type, UUID except, String body) {
        Instant now = clock.instant();
        Set<UUID> recipients = memberships.findByBuildingWithUsers(b.getBuildingId()).stream()
                .filter(m -> m.isActiveAt(now) && permissions.can(m, Action.BOOKING_MANAGE, space))
                .map(m -> m.getUser().getId())
                .filter(u -> !u.equals(except))
                .collect(Collectors.toCollection(LinkedHashSet::new));
        publish(b, ctx, type, recipients, body);
    }

    private void notifyRequester(Booking b, Ctx ctx, NotificationType type, String body) {
        publish(b, ctx, type, new LinkedHashSet<>(List.of(b.getUserId())), body);
    }

    private void publish(Booking b, Ctx ctx, NotificationType type, Set<UUID> recipients, String body) {
        Space space = ctx.spaces().get(b.getSpaceId());
        publisher.publishEvent(new NotificationRequest(b.getBuildingId(), recipients, type, null,
                "Booking · " + (space != null ? space.getName() : "space"), body,
                "/buildings/" + b.getBuildingId() + "/bookings/" + b.getId()));
    }

    private BookingDto toDto(Booking b, Membership viewer, Ctx ctx) {
        Space space = ctx.spaces().get(b.getSpaceId());
        boolean manager = permissions.can(viewer, Action.BOOKING_MANAGE, space);
        boolean mine = b.getUserId().equals(viewer.getUser().getId());
        boolean revealNames = manager || mine;
        Map<UUID, String> names = users.findAllById(java.util.stream.Stream.of(b.getUserId(), b.getDecidedByUserId())
                        .filter(java.util.Objects::nonNull).toList()).stream()
                .collect(Collectors.toMap(User::getId, User::getDisplayName));
        Space unit = b.getUnitSpaceId() != null ? ctx.spaces().get(b.getUnitSpaceId()) : null;
        boolean canCancel = b.isLive() && (manager || mine);
        return new BookingDto(b.getId(), b.getSpaceId(), space != null ? space.getName() : "", b.getStartsAt(),
                b.getEndsAt(), b.getStatus(), revealNames ? b.getNote() : null, b.getDecisionNote(),
                revealNames ? names.get(b.getUserId()) : null, revealNames && unit != null ? unit.getName() : null,
                mine, revealNames ? names.get(b.getDecidedByUserId()) : null, b.getDecidedAt(), b.getCreatedAt(),
                canCancel, manager && b.getStatus() == Booking.Status.PENDING,
                b.getVersion() != null ? b.getVersion() : 0L);
    }

    private BookingPolicyDto toDto(BookingPolicy p, Ctx ctx) {
        Space space = ctx.spaces().get(p.getSpaceId());
        return new BookingPolicyDto(p.getSpaceId(), space != null ? space.getName() : "",
                space != null ? SpaceService.pathLabel(space, ctx.spaces()) : "", p.isEnabled(), p.getSlotMinutes(),
                p.getMinMinutes(), p.getMaxMinutes(), p.openingHours().toJson(), p.getAdvanceDays(),
                p.getMaxActivePerUnit(), p.getCancelCutoffHours(), p.getRulesText(), ctx.zone().getId(),
                p.getVersion() != null ? p.getVersion() : 0L);
    }

    private Booking find(UUID buildingId, UUID bookingId) {
        return bookings.findByIdAndBuildingId(bookingId, buildingId).orElseThrow(() -> ApiException.notFound("Booking"));
    }

    private Ctx ctx(UUID buildingId) {
        Building building = buildings.findById(buildingId).orElseThrow(() -> ApiException.notFound("Building"));
        return new Ctx(IssueViews.index(spaces.findByBuildingIdOrderByDepthAscSortOrderAscNameAsc(buildingId)),
                building.zone());
    }

    private record Ctx(Map<UUID, Space> spaces, ZoneId zone) {

        Space space(UUID id) {
            Space s = spaces.get(id);
            if (s == null) {
                throw ApiException.notFound("Space");
            }
            return s;
        }
    }

    private static Set<Booking.Status> parseStatuses(String csv) {
        if (csv == null || csv.isBlank()) {
            return EnumSet.allOf(Booking.Status.class);
        }
        try {
            return Arrays.stream(csv.split(",")).map(s -> Booking.Status.valueOf(s.trim().toUpperCase(Locale.ROOT)))
                    .collect(Collectors.toCollection(() -> EnumSet.noneOf(Booking.Status.class)));
        } catch (IllegalArgumentException e) {
            throw ApiException.invalidField("status", "use PENDING, CONFIRMED, REJECTED or CANCELLED");
        }
    }

    private static String when(Booking b, ZoneId zone) {
        return WHEN.format(b.getStartsAt().atZone(zone)) + "–"
                + DateTimeFormatter.ofPattern("HH:mm").format(b.getEndsAt().atZone(zone));
    }

    private static String label(Booking b) {
        return b.getStatus().name().toLowerCase(Locale.ROOT);
    }

    private static ApiException rules(String message) {
        return new ApiException(HttpStatus.BAD_REQUEST, ErrorCodes.BOOKING_RULES, message);
    }

    private static String blankToNull(String s) {
        return s == null || s.isBlank() ? null : s.trim();
    }
}
