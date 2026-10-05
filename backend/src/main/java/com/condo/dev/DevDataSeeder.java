package com.condo.dev;

import com.condo.auth.User;
import com.condo.auth.UserRepository;
import com.condo.building.Building;
import com.condo.building.BuildingRepository;
import com.condo.governance.GovernanceMode;
import com.condo.governance.Role;
import com.condo.invitation.Invitation;
import com.condo.invitation.InvitationRepository;
import com.condo.member.Membership;
import com.condo.member.MembershipRepository;
import com.condo.space.Space;
import com.condo.space.SpaceRepository;
import com.condo.space.SpaceType;
import com.condo.space.Visibility;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
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
    private final PasswordEncoder passwordEncoder;
    private final Clock clock;

    public DevDataSeeder(UserRepository users, BuildingRepository buildings, SpaceRepository spaces,
            MembershipRepository memberships, InvitationRepository invitations, PasswordEncoder passwordEncoder,
            Clock clock) {
        this.users = users;
        this.buildings = buildings;
        this.spaces = spaces;
        this.memberships = memberships;
        this.invitations = invitations;
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
        add(s, common(basement, "Garage", 0));
        add(s, common(basement, "Storage room", 1));
        add(s, common(basement, "Boiler room", 2));

        Space ground = add(s, floor(root, "Ground floor", 0));
        add(s, common(ground, "Lobby", 0));
        add(s, unit(ground, "Café Aurora (shop)", 1));
        add(s, unit(ground, "0A", 2));

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
        add(s, Space.childOf(unit2B, SpaceType.ROOM, "Kitchen", 0, null));
        add(s, Space.childOf(unit2B, SpaceType.ROOM, "Bathroom", 1, null));

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

        add(s, common(root, "Stairwell", 10_000));
        add(s, common(root, "Elevator shaft", 10_001));
        add(s, common(root, "Roof", 10_002));
        spaces.saveAll(s);

        Membership adminM = memberships.save(new Membership(aurora, admin, Role.ADMIN, null, null));
        memberships.save(new Membership(aurora, manager, Role.MANAGER, null, null));
        Membership ownerM = memberships.save(new Membership(aurora, owner, Role.OWNER, unit2B, null));
        memberships.save(new Membership(aurora, tenant, Role.TENANT, unit2B,
                clock.instant().plus(Duration.ofDays(180))));
        memberships.save(new Membership(aurora, owner2, Role.OWNER, duplex, null));
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

        // ---------- Small self-managed building ----------
        Building patio = buildings.save(new Building("Casa do Pátio", "Travessa do Sol 3, Porto", GovernanceMode.OPEN));
        List<Space> p = new ArrayList<>();
        Space proot = add(p, Space.root(patio.getId(), patio.getName()));
        Space pg = add(p, floor(proot, "Ground floor", 0));
        Space flatG = add(p, unit(pg, "Ground flat", 0));
        Space p1 = add(p, floor(proot, "First floor", 1));
        add(p, unit(p1, "First floor flat", 0));
        add(p, common(proot, "Shared garden", 100));
        spaces.saveAll(p);
        memberships.save(new Membership(patio, owner2, Role.ADMIN, null, null));
        memberships.save(new Membership(patio, owner, Role.OWNER, flatG, null));

        log.info("Seeded demo data: users admin|manager|owner|tenant|owner2|former@demo.test, password '{}'; "
                + "invite codes TENANT22, SHARE4AB, GUEST777", PASSWORD);
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
