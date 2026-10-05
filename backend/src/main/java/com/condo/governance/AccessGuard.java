package com.condo.governance;

import com.condo.building.BuildingRepository;
import com.condo.common.error.ApiException;
import com.condo.common.error.ErrorCodes;
import com.condo.common.security.CurrentUser;
import com.condo.member.Membership;
import com.condo.member.MembershipRepository;
import com.condo.member.MembershipStatus;
import com.condo.space.Space;
import java.time.Clock;
import java.util.Locale;
import java.util.UUID;
import org.springframework.lang.Nullable;
import org.springframework.stereotype.Component;

/**
 * Resolves the current user's membership for a building and asks {@link PermissionService} for a decision,
 * translating a denial into the most helpful error (not a member / expired / not allowed).
 */
@Component
public class AccessGuard {

    private final MembershipRepository memberships;
    private final BuildingRepository buildings;
    private final PermissionService permissionService;
    private final Clock clock;

    public AccessGuard(MembershipRepository memberships, BuildingRepository buildings,
            PermissionService permissionService, Clock clock) {
        this.memberships = memberships;
        this.buildings = buildings;
        this.permissionService = permissionService;
        this.clock = clock;
    }

    public Membership require(UUID buildingId, Action action) {
        return require(buildingId, action, null);
    }

    public Membership require(UUID buildingId, Action action, @Nullable Space target) {
        Membership member = requireActiveMember(buildingId);
        if (target != null && !target.getBuildingId().equals(buildingId)) {
            throw ApiException.notFound("Space");
        }
        if (!permissionService.can(member, action, target)) {
            throw ApiException.forbidden(ErrorCodes.PERMISSION_DENIED,
                    "Your role in this building doesn't allow " + describe(action) + ".");
        }
        return member;
    }

    /** Active membership with no particular action, e.g. to read one's own permissions. */
    public Membership requireActiveMember(UUID buildingId) {
        Membership member = memberships.findByBuildingAndUser(buildingId, CurrentUser.id()).orElse(null);
        if (member == null) {
            if (!buildings.existsById(buildingId)) {
                throw ApiException.notFound("Building");
            }
            throw ApiException.forbidden(ErrorCodes.NOT_A_MEMBER, "You're not a member of this building.");
        }
        MembershipStatus status = member.effectiveStatus(clock.instant());
        if (status == MembershipStatus.REVOKED) {
            throw ApiException.forbidden(ErrorCodes.NOT_A_MEMBER, "Your access to this building was revoked.");
        }
        if (status == MembershipStatus.EXPIRED) {
            throw ApiException.forbidden(ErrorCodes.MEMBERSHIP_EXPIRED, "Your access to this building has expired.");
        }
        return member;
    }

    private static String describe(Action action) {
        return action.name().toLowerCase(Locale.ROOT).replace('_', ' ');
    }
}
