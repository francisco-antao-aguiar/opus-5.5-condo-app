package com.condo.dev;

import com.condo.asset.Asset;
import com.condo.asset.AssetRepository;
import com.condo.asset.ProblemType;
import com.condo.asset.ProblemTypeHidden;
import com.condo.asset.ProblemTypeHiddenRepository;
import com.condo.asset.ProblemTypeRepository;
import com.condo.auth.User;
import com.condo.booking.Booking;
import com.condo.booking.BookingPolicy;
import com.condo.booking.BookingPolicyRepository;
import com.condo.booking.BookingRepository;
import com.condo.booking.OpeningHours;
import com.condo.cost.CostEntry;
import com.condo.cost.CostEntryRepository;
import com.condo.cost.Money;
import com.condo.auth.UserRepository;
import com.condo.building.Building;
import com.condo.building.BuildingRepository;
import com.condo.governance.GovernanceMode;
import com.condo.governance.Role;
import com.condo.invitation.Invitation;
import com.condo.issue.Issue;
import com.condo.issue.IssueAffected;
import com.condo.issue.IssueAffectedRepository;
import com.condo.issue.IssueEvent;
import com.condo.issue.IssueEventRepository;
import com.condo.issue.IssueEventType;
import com.condo.issue.IssueRepository;
import com.condo.issue.IssueStatus;
import com.condo.issue.OtherTexts;
import com.condo.space.SpaceService;
import com.condo.invitation.InvitationRepository;
import com.condo.maintenance.MaintenancePlan;
import com.condo.maintenance.MaintenancePlanRepository;
import com.condo.maintenance.Recurrence;
import com.condo.member.Membership;
import com.condo.notification.Notification;
import com.condo.notification.NotificationRepository;
import com.condo.notification.NotificationType;
import com.condo.member.MembershipRepository;
import com.condo.space.Space;
import com.condo.space.SpaceRepository;
import com.condo.space.SpaceType;
import com.condo.space.Visibility;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.function.Function;
import java.util.stream.Collectors;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Profile;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/**
 * Dev-only demo data. Deliberately irregular: a basement with garage and storage, a ground floor with a shop,
 * a floor with 3 units while others have 4, a duplex spanning floors 3–4, and common areas hanging off the root.
 * Runs once (skipped when any user exists). All accounts use the password {@value #PASSWORD}.
 */
@Component
@Profile("dev")
@ConditionalOnProperty(name = "app.seed.enabled", havingValue = "true")
public class DevDataSeeder implements ApplicationRunner {

    static final String PASSWORD = "demo1234";
    private static final Logger log = LoggerFactory.getLogger(DevDataSeeder.class);

    private final UserRepository users;
    private final BuildingRepository buildings;
    private final SpaceRepository spaces;
    private final MembershipRepository memberships;
    private final InvitationRepository invitations;
    private final AssetRepository assets;
    private final ProblemTypeRepository problemTypes;
    private final ProblemTypeHiddenRepository hiddenProblemTypes;
    private final IssueRepository issues;
    private final IssueAffectedRepository issueAffected;
    private final IssueEventRepository issueEvents;
    private final NotificationRepository notifications;
    private final MaintenancePlanRepository plans;
    private final CostEntryRepository costs;
    private final BookingPolicyRepository bookingPolicies;
    private final BookingRepository bookings;
    private final PasswordEncoder passwordEncoder;
    private final Clock clock;

    public DevDataSeeder(UserRepository users, BuildingRepository buildings, SpaceRepository spaces,
            MembershipRepository memberships, InvitationRepository invitations, AssetRepository assets,
            ProblemTypeRepository problemTypes, ProblemTypeHiddenRepository hiddenProblemTypes,
            IssueRepository issues, IssueAffectedRepository issueAffected, IssueEventRepository issueEvents,
            NotificationRepository notifications, MaintenancePlanRepository plans, CostEntryRepository costs,
            BookingPolicyRepository bookingPolicies, BookingRepository bookings, PasswordEncoder passwordEncoder,
            Clock clock) {
        this.users = users;
        this.buildings = buildings;
        this.spaces = spaces;
        this.memberships = memberships;
        this.invitations = invitations;
        this.assets = assets;
        this.problemTypes = problemTypes;
        this.hiddenProblemTypes = hiddenProblemTypes;
        this.issues = issues;
        this.issueAffected = issueAffected;
        this.issueEvents = issueEvents;
        this.notifications = notifications;
        this.plans = plans;
        this.costs = costs;
        this.bookingPolicies = bookingPolicies;
        this.bookings = bookings;
        this.passwordEncoder = passwordEncoder;
        this.clock = clock;
    }

    @Override
    @Transactional
    public void run(ApplicationArguments args) {
        if (users.count() > 0) {
            return;
        }
        String hash = passwordEncoder.encode(PASSWORD);
        User admin = users.save(new User("admin@demo.test", hash, "Ana Admin"));
        User manager = users.save(new User("manager@demo.test", hash, "Miguel Manager"));
        User owner = users.save(new User("owner@demo.test", hash, "Olívia Owner"));
        User tenant = users.save(new User("tenant@demo.test", hash, "Tiago Tenant"));
        User owner2 = users.save(new User("owner2@demo.test", hash, "Rita Duplex"));
        User former = users.save(new User("former@demo.test", hash, "Filipe Former"));

        // ---------- Managed building with an irregular structure ----------
        Building aurora = buildings.save(new Building("Edifício Aurora", "Rua das Flores 12, Lisboa",
                GovernanceMode.MANAGED));
        List<Space> s = new ArrayList<>();
        Space root = add(s, Space.root(aurora.getId(), aurora.getName()));

        Space basement = add(s, floor(root, "Basement -1", -1));
        Space garage = add(s, common(basement, "Garage", 0));
        add(s, common(basement, "Storage room", 1));
        Space boilerRoom = add(s, common(basement, "Boiler room", 2));

        Space ground = add(s, floor(root, "Ground floor", 0));
        Space lobby = add(s, common(ground, "Lobby", 0));
        add(s, unit(ground, "Café Aurora (shop)", 1));
        add(s, unit(ground, "0A", 2));
        Space partyRoom = add(s, common(ground, "Party room", 3));

        Space f1 = add(s, floor(root, "Floor 1", 1));
        Space unit1A = null;
        for (String u : List.of("1A", "1B", "1C", "1D")) {
            Space x = add(s, unit(f1, u, u.charAt(1) - 'A'));
            if (u.equals("1A")) {
                unit1A = x;
            }
        }
        Space f2 = add(s, floor(root, "Floor 2", 2));
        Space unit2B = null;
        for (String u : List.of("2A", "2B", "2C")) {
            Space x = add(s, unit(f2, u, u.charAt(1) - 'A'));
            if (u.equals("2B")) {
                unit2B = x;
            }
        }
        Space kitchen2B = add(s, Space.childOf(unit2B, SpaceType.ROOM, "Kitchen", 0, null));
        Space bathroom2B = add(s, Space.childOf(unit2B, SpaceType.ROOM, "Bathroom", 1, null));

        Space f3 = add(s, floor(root, "Floor 3", 3));
        add(s, unit(f3, "3A", 0));
        add(s, unit(f3, "3B", 1));
        // Duplex: lives under its entrance floor, upper level modelled as a room.
        Space duplex = add(s, unit(f3, "3C/4C Duplex", 2));
        add(s, Space.childOf(duplex, SpaceType.ROOM, "Lower level (floor 3)", 0, null));
        add(s, Space.childOf(duplex, SpaceType.ROOM, "Upper level (floor 4)", 1, null));

        Space f4 = add(s, floor(root, "Floor 4", 4));
        Space unit4A = add(s, unit(f4, "4A", 0));
        add(s, unit(f4, "4B", 1));

        Space stairwell = add(s, common(root, "Stairwell", 10_000));
        Space shaft = add(s, common(root, "Elevator shaft", 10_001));
        Space roof = add(s, common(root, "Roof", 10_002));
        spaces.saveAll(s);

        // ---------- Assets ----------
        UUID a = aurora.getId();
        List<Asset> items = new ArrayList<>(List.of(
                new Asset(a, lobby.getId(), "LIGHT", "Lobby ceiling light", null),
                new Asset(a, lobby.getId(), "DOOR", "Main entrance door", "Glass door with magnetic lock"),
                new Asset(a, lobby.getId(), "INTERCOM", "Entrance intercom", null),
                new Asset(a, lobby.getId(), "FIRE_SAFETY", "Lobby fire extinguisher", "Inspected yearly in March"),
                new Asset(a, shaft.getId(), "ELEVATOR", "Elevator", "Schindler 3300, 6 people"),
                new Asset(a, garage.getId(), "GATE", "Garage gate", "Opened with remote"),
                new Asset(a, garage.getId(), "LIGHT", "Garage lights", null),
                new Asset(a, boilerRoom.getId(), "BOILER", "Central boiler", null),
                new Asset(a, roof.getId(), "DOOR", "Roof access door", null),
                new Asset(a, kitchen2B.getId(), "PLUMBING", "Kitchen sink", null),
                new Asset(a, bathroom2B.getId(), "BOILER", "Water heater", "Private to 2B"),
                new Asset(a, duplex.getId(), "WINDOW", "Skylight", null)));
        for (Space floor : List.of(basement, ground, f1, f2, f3, f4)) {
            items.add(new Asset(a, floor.getId(), "LIGHT", "Stairwell light", null));
        }
        items.add(new Asset(a, stairwell.getId(), "FIRE_SAFETY", "Emergency lighting", null));
        assets.saveAll(items);

        // Building-specific catalog: an extra gate problem, and a built-in this building doesn't want offered.
        ProblemType remote = problemTypes.save(ProblemType.custom(a, "GATE", "Remote doesn't work", 10));
        hiddenProblemTypes.save(new ProblemTypeHidden(a, UUID.fromString("00000000-0000-0000-0001-000000000004")));

        // ---------- Sample issues ----------
        Map<String, Asset> byName = items.stream().collect(Collectors.toMap(Asset::getName, Function.identity(),
                (x, y) -> x));
        Map<UUID, Space> spaceIndex = s.stream().collect(Collectors.toMap(Space::getId, Function.identity()));
        Instant t = clock.instant();
        Issue lobbyIssue = issue(aurora, byName.get("Lobby ceiling light"), spaceIndex, LIGHT_FLICKERING, null,
                "Worse in the evening", tenant, t.minus(Duration.ofHours(30)));
        meToo(lobbyIssue, owner, t.minus(Duration.ofHours(20)));
        meToo(lobbyIssue, owner2, t.minus(Duration.ofHours(5)));

        Issue elevatorIssue = issue(aurora, byName.get("Elevator"), spaceIndex, ELEVATOR_DOOR, null, null, owner2,
                t.minus(Duration.ofDays(2)));
        meToo(elevatorIssue, tenant, t.minus(Duration.ofDays(1)));
        status(elevatorIssue, admin, IssueStatus.ACKNOWLEDGED, "Technician booked for tomorrow 9:00",
                t.minus(Duration.ofDays(1)));
        status(elevatorIssue, manager, IssueStatus.IN_PROGRESS, "Technician on site", t.minus(Duration.ofHours(2)));

        // Untouched for 4 days: the dashboard flags it as stuck.
        issue(aurora, byName.get("Garage gate"), spaceIndex, remote.getId(), null, null, owner,
                t.minus(Duration.ofDays(4)));

        Issue intercom = issue(aurora, byName.get("Entrance intercom"), spaceIndex, INTERCOM_NO_SOUND, null, null,
                owner2, t.minus(Duration.ofDays(10)));
        status(intercom, manager, IssueStatus.RESOLVED, "Speaker replaced", t.minus(Duration.ofDays(8)));

        // Private to 2B and not shared with management: only 2B's members see it.
        issue(aurora, byName.get("Kitchen sink"), spaceIndex, PLUMBING_LEAK, null, "Dripping under the sink", tenant,
                t.minus(Duration.ofHours(6)));

        // Two neighbours wrote the same thing under "Other": ready to be promoted into the catalog.
        Issue squeak = issue(aurora, byName.get("Roof access door"), spaceIndex, null, "Hinge squeaks", null, owner,
                t.minus(Duration.ofDays(6)));
        status(squeak, manager, IssueStatus.RESOLVED, "Oiled", t.minus(Duration.ofDays(5)));
        issue(aurora, byName.get("Roof access door"), spaceIndex, null, "hinge squeaks!", null, owner2,
                t.minus(Duration.ofHours(12)));

        // A few notifications so the bell isn't empty on a fresh start (normally created by NotificationService).
        String link = "/buildings/" + aurora.getId() + "/issues/";
        notifications.saveAll(List.of(
                new Notification(admin.getId(), aurora.getId(), lobbyIssue.getId(), NotificationType.ISSUE_REPORTED,
                        "#1 Flickering", "Lobby ceiling light · Ground floor › Lobby · reported by Tiago Tenant",
                        link + lobbyIssue.getId(), t.minus(Duration.ofHours(30))),
                new Notification(tenant.getId(), aurora.getId(), elevatorIssue.getId(),
                        NotificationType.ISSUE_STATUS_CHANGED, "#2 Door won't close",
                        "Acknowledged by Ana Admin: Technician booked for tomorrow 9:00",
                        link + elevatorIssue.getId(), t.minus(Duration.ofDays(1))),
                new Notification(tenant.getId(), aurora.getId(), elevatorIssue.getId(),
                        NotificationType.ISSUE_STATUS_CHANGED, "#2 Door won't close",
                        "Work started by Miguel Manager: Technician on site", link + elevatorIssue.getId(),
                        t.minus(Duration.ofHours(2)))));

        Membership adminM = memberships.save(new Membership(aurora, admin, Role.ADMIN, null, null));
        memberships.save(new Membership(aurora, manager, Role.MANAGER, null, null));
        Membership ownerM = memberships.save(new Membership(aurora, owner, Role.OWNER, unit2B, null));
        Membership tenantM = memberships.save(new Membership(aurora, tenant, Role.TENANT, unit2B,
                clock.instant().plus(Duration.ofDays(180))));
        Membership owner2M = memberships.save(new Membership(aurora, owner2, Role.OWNER, duplex, null));
        // A tenant whose lease ended: shows up as EXPIRED and has no access.
        memberships.save(new Membership(aurora, former, Role.TENANT, unit1A,
                clock.instant().minus(Duration.ofDays(10))));

        // Invitations (codes are fixed so they're easy to try: /join/TENANT22, /join/SHARE4AB, /join/GUEST777).
        Instant now = clock.instant();
        invitations.save(new Invitation(aurora, "TENANT22", Role.TENANT, unit2B, ownerM, 3,
                now.plus(Duration.ofDays(30)), now.plus(Duration.ofDays(365)), "Flatmates for 2B"));
        invitations.save(new Invitation(aurora, "SHARE4AB", Role.OWNER, unit4A, adminM, 1,
                now.plus(Duration.ofDays(7)), null, "New owner of 4A"));
        invitations.save(new Invitation(aurora, "GUEST777", Role.TENANT, unit2B, ownerM, 1,
                now.plus(Duration.ofDays(14)), null, 7, "A friend staying for a week"));
        invitations.save(new Invitation(aurora, "EXPRD222", Role.TENANT, unit1A, adminM, 1,
                now.minus(Duration.ofDays(1)), null, "Old link"));

        // ---------- Phase 6: maintenance plans, costs, bookings ----------
        ZoneId zone = aurora.zone();
        LocalDate today = LocalDate.ofInstant(now, zone);

        // Elevator inspection every 6 months; this round is 5 days late, so it shows as overdue.
        MaintenancePlan elevatorPlan = plan(aurora, admin, byName.get("Elevator").getId(), null,
                "Elevator inspection", List.of("Test the emergency phone", "Check door sensors", "Sign the logbook"),
                new Recurrence(Recurrence.Unit.MONTH, 6, null, null, null), today.minusDays(5), "Schindler, contract 4471");
        Issue overdueTask = scheduledTask(aurora, elevatorPlan, byName.get("Elevator"), spaceIndex, admin, now);
        // Stairwell bulbs once a year; the next round is three weeks away (no task yet).
        plan(aurora, manager, null, stairwell.getId(), "Replace stairwell bulbs", List.of(),
                new Recurrence(Recurrence.Unit.YEAR, 1, null, null, null), today.plusDays(21), null);
        // Fire extinguisher inspection every March.
        plan(aurora, admin, byName.get("Lobby fire extinguisher").getId(), null, "Fire extinguisher inspection",
                List.of("Pressure in the green", "Seal intact"), new Recurrence(Recurrence.Unit.YEAR, 1, null, null, null),
                LocalDate.of(today.getYear() + 1, 3, 15), "Extintores do Norte");

        Asset elevator = byName.get("Elevator");
        costs.saveAll(List.of(
                cost(aurora, admin, "340.00", today.minusDays(1), CostEntry.Category.REPAIR,
                        "Door sensor replaced", "Schindler", elevatorIssue.getId(), null, elevator.getId(),
                        elevator.getSpaceId()),
                cost(aurora, manager, "85.90", today.minusDays(8), CostEntry.Category.REPAIR, "Intercom speaker",
                        "TecnoPorteiro", intercom.getId(), null, byName.get("Entrance intercom").getId(),
                        lobby.getId()),
                cost(aurora, admin, "120.00", today.minusDays(5), CostEntry.Category.MAINTENANCE,
                        "Elevator inspection call-out", "Schindler", overdueTask.getId(), elevatorPlan.getId(),
                        elevator.getId(), elevator.getSpaceId()),
                cost(aurora, admin, "220.00", today.minusMonths(2).withDayOfMonth(1), CostEntry.Category.CLEANING,
                        "Common areas cleaning", "Limpa Já", null, null, null, null),
                cost(aurora, admin, "220.00", today.minusMonths(1).withDayOfMonth(1), CostEntry.Category.CLEANING,
                        "Common areas cleaning", "Limpa Já", null, null, null, null),
                cost(aurora, admin, "64.37", today.minusMonths(1).withDayOfMonth(12), CostEntry.Category.UTILITIES,
                        "Common electricity", "EDP", null, null, null, null)));

        // The party room can be booked; every request waits for an admin.
        BookingPolicy partyPolicy = new BookingPolicy(partyRoom.getId(), a);
        List<List<String>> evenings = List.of(List.of("10:00", "23:00"));
        partyPolicy.define(true, 60, 60, 300, OpeningHours.parse(Map.of("MON", evenings, "TUE", evenings,
                        "WED", evenings, "THU", evenings, "FRI", evenings, "SAT", evenings, "SUN", evenings)),
                60, 2, 24, "Quiet after 22:00. Leave the room as you found it; the cleaning kit is in the cupboard.");
        bookingPolicies.save(partyPolicy);
        bookings.save(new Booking(a, partyRoom.getId(), tenantM.getId(), tenant.getId(), unit2B.getId(),
                at(today.plusDays(3), 18, zone), at(today.plusDays(3), 21, zone), "Birthday dinner, about 12 people"));
        Booking confirmed = new Booking(a, partyRoom.getId(), owner2M.getId(), owner2.getId(), duplex.getId(),
                at(today.plusDays(6), 15, zone), at(today.plusDays(6), 18, zone), "Kids' party");
        confirmed.approve(admin.getId(), "Enjoy!", now);
        bookings.save(confirmed);

        // ---------- Small self-managed building ----------
        Building patio = buildings.save(new Building("Casa do Pátio", "Travessa do Sol 3, Porto", GovernanceMode.OPEN));
        List<Space> p = new ArrayList<>();
        Space proot = add(p, Space.root(patio.getId(), patio.getName()));
        Space pg = add(p, floor(proot, "Ground floor", 0));
        Space flatG = add(p, unit(pg, "Ground flat", 0));
        Space p1 = add(p, floor(proot, "First floor", 1));
        add(p, unit(p1, "First floor flat", 0));
        Space garden = add(p, common(proot, "Shared garden", 100));
        spaces.saveAll(p);
        assets.saveAll(List.of(
                new Asset(patio.getId(), garden.getId(), "GATE", "Garden gate", null),
                new Asset(patio.getId(), garden.getId(), "LIGHT", "Garden lamp", null)));
        memberships.save(new Membership(patio, owner2, Role.ADMIN, null, null));
        memberships.save(new Membership(patio, owner, Role.OWNER, flatG, null));

        log.info("Seeded demo data: users admin|manager|owner|tenant|owner2|former@demo.test, password '{}'; "
                + "invite codes TENANT22, SHARE4AB, GUEST777; 7 sample issues, 3 maintenance plans (1 overdue task), "
                + "6 costs, a bookable party room with 2 bookings", PASSWORD);
    }

    private static final UUID LIGHT_FLICKERING = UUID.fromString("00000000-0000-0000-0001-000000000002");
    private static final UUID ELEVATOR_DOOR = UUID.fromString("00000000-0000-0000-0002-000000000003");
    private static final UUID INTERCOM_NO_SOUND = UUID.fromString("00000000-0000-0000-0005-000000000001");
    private static final UUID PLUMBING_LEAK = UUID.fromString("00000000-0000-0000-0007-000000000001");

    private Issue issue(Building building, Asset asset, Map<UUID, Space> spaceIndex, UUID problemTypeId,
            String otherText, String note, User reporter, Instant at) {
        Space space = spaceIndex.get(asset.getSpaceId());
        Visibility visibility = SpaceService.effectiveVisibility(space, spaceIndex);
        Issue issue = issues.save(new Issue(building.getId(), building.nextIssueNumber(), asset.getId(), space.getId(),
                SpaceService.pathLabel(space, spaceIndex), problemTypeId, otherText, OtherTexts.normalize(otherText),
                note, visibility, false, reporter.getId(), null, at));
        issueAffected.save(new IssueAffected(issue.getId(), reporter.getId(), IssueAffected.Kind.REPORTER, at));
        issueEvents.save(IssueEvent.of(issue, reporter.getId(), IssueEventType.REPORTED, null, at));
        return issue;
    }

    private MaintenancePlan plan(Building building, User by, UUID assetId, UUID spaceId, String title,
            List<String> checklist, Recurrence recurrence, LocalDate startsOn, String assigneeNote) {
        MaintenancePlan plan = new MaintenancePlan(building.getId(), by.getId());
        plan.define(assetId, spaceId, title, null, checklist, recurrence.normalized(startsOn), startsOn, null, 7,
                assigneeNote);
        plan.scheduleFrom(startsOn);
        return plans.save(plan);
    }

    /** The plan's first occurrence as a task (what MaintenanceService would have generated), then advance it. */
    private Issue scheduledTask(Building building, MaintenancePlan plan, Asset asset, Map<UUID, Space> spaceIndex,
            User by, Instant now) {
        Space space = spaceIndex.get(asset.getSpaceId());
        Issue task = issues.save(Issue.scheduled(building.getId(), building.nextIssueNumber(), asset.getId(),
                space.getId(), SpaceService.pathLabel(space, spaceIndex), plan.getTitle(),
                SpaceService.effectiveVisibility(space, spaceIndex), by.getId(), plan.getId(), plan.getNextDueOn(),
                now.minus(Duration.ofDays(12))));
        issueAffected.save(new IssueAffected(task.getId(), by.getId(), IssueAffected.Kind.REPORTER, task.getCreatedAt()));
        issueEvents.save(IssueEvent.of(task, by.getId(), IssueEventType.REPORTED,
                "Scheduled maintenance, due " + plan.getNextDueOn(), task.getCreatedAt()));
        plan.advance();
        return task;
    }

    private static CostEntry cost(Building building, User by, String amount, LocalDate on, CostEntry.Category category,
            String description, String vendor, UUID issueId, UUID planId, UUID assetId, UUID spaceId) {
        CostEntry entry = new CostEntry(building.getId(), by.getId());
        entry.define(Money.parse(amount, "EUR"), on, category, description, vendor, issueId, planId, assetId,
                spaceId);
        return entry;
    }

    private static Instant at(LocalDate day, int hour, ZoneId zone) {
        return day.atTime(hour, 0).atZone(zone).toInstant();
    }

    private void meToo(Issue issue, User user, Instant at) {
        issueAffected.save(new IssueAffected(issue.getId(), user.getId(), IssueAffected.Kind.ME_TOO, at));
        issue.setAffectedCount(issue.getAffectedCount() + 1);
        issue.touch(at);
        issueEvents.save(IssueEvent.of(issue, user.getId(), IssueEventType.ME_TOO, null, at));
    }

    private void status(Issue issue, User actor, IssueStatus to, String comment, Instant at) {
        IssueStatus from = issue.getStatus();
        issue.changeStatus(to, at);
        issueEvents.save(IssueEvent.statusChange(issue, actor.getId(), from, to, comment, at));
    }

    private static Space add(List<Space> list, Space space) {
        list.add(space);
        return space;
    }

    private static Space floor(Space parent, String name, int sort) {
        return Space.childOf(parent, SpaceType.FLOOR, name, sort, null);
    }

    private static Space unit(Space parent, String name, int sort) {
        return Space.childOf(parent, SpaceType.UNIT, name, sort, Visibility.PRIVATE);
    }

    private static Space common(Space parent, String name, int sort) {
        return Space.childOf(parent, SpaceType.COMMON_AREA, name, sort, null);
    }
}
