package com.condo.member;

import com.condo.auth.User;
import com.condo.auth.UserRepository;
import com.condo.auth.dto.AuthDtos.UserDto;
import com.condo.common.error.ApiException;
import com.condo.common.error.ErrorCodes;
import com.condo.common.persistence.Versions;
import com.condo.common.security.CurrentUser;
import com.condo.governance.AccessGuard;
import com.condo.governance.Action;
import com.condo.governance.PermissionService;
import com.condo.governance.Role;
import com.condo.governance.RoleRepository;
import com.condo.member.dto.MemberDtos.MeResponse;
import com.condo.member.dto.MemberDtos.MemberDto;
import com.condo.member.dto.MemberDtos.MembershipSummary;
import com.condo.member.dto.MemberDtos.UpdateMemberRequest;
import com.condo.space.Space;
import com.condo.space.SpaceRepository;
import com.condo.space.SpaceType;
import java.time.Clock;
import java.time.Instant;
import java.util.List;
import java.util.Objects;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@Transactional
public class MemberService {

    private final MembershipRepository memberships;
    private final RoleRepository roles;
    private final SpaceRepository spaces;
    private final UserRepository users;
    private final AccessGuard guard;
    private final PermissionService permissionService;
    private final Clock clock;

    public MemberService(MembershipRepository memberships, RoleRepository roles, SpaceRepository spaces,
            UserRepository users, AccessGuard guard, PermissionService permissionService, Clock clock) {
        this.memberships = memberships;
        this.roles = roles;
        this.spaces = spaces;
        this.users = users;
        this.guard = guard;
        this.permissionService = permissionService;
        this.clock = clock;
    }

    @Transactional(readOnly = true)
    public MeResponse me() {
        User user = users.findById(CurrentUser.id())
                .orElseThrow(() -> ApiException.unauthorized(ErrorCodes.UNAUTHENTICATED, "Account not found."));
        List<MembershipSummary> list = memberships.findActiveByUser(user.getId(), clock.instant()).stream()
                .map(MemberService::summaryOf)
                .toList();
        return new MeResponse(new UserDto(user.getId(), user.getEmail(), user.getDisplayName()), list);
    }

    /**
     * Everyone in the building can see who the members are. Contact details and revoked/expired members
     * are shown only to those allowed to manage that member.
     */
    @Transactional(readOnly = true)
    public List<MemberDto> list(UUID buildingId) {
        Membership actor = guard.require(buildingId, Action.BUILDING_VIEW);
        Instant now = clock.instant();
        return memberships.findByBuildingWithUsers(buildingId).stream()
                .filter(m -> m.isActiveAt(now) || canManage(actor, m))
                .map(m -> toDto(m, canManage(actor, m) || m.getId().equals(actor.getId())))
                .toList();
    }

    public MemberDto update(UUID buildingId, UUID memberId, UpdateMemberRequest req) {
        Membership target = findInBuilding(buildingId, memberId);
        Membership actor = guard.require(buildingId, Action.MEMBER_MANAGE, target.getUnitSpace());
        if (target.getStatus() == MembershipStatus.REVOKED) {
            throw ApiException.conflict(ErrorCodes.CONFLICT, "This membership was revoked; invite the person again.");
        }
        Versions.requireCurrent(req.version(), target);
        Role newRole = roles.findById(req.role())
                .orElseThrow(() -> ApiException.badRequest(ErrorCodes.UNKNOWN_ROLE, "Unknown role " + req.role()));
        requireRankAtLeast(actor, target.getRoleCode());
        requireRankAtLeast(actor, newRole.getCode());

        Space unit = null;
        if (req.unitId() != null) {
            unit = spaces.findByIdAndBuildingId(req.unitId(), buildingId)
                    .filter(s -> s.getType() == SpaceType.UNIT)
                    .orElseThrow(() -> ApiException.badRequest(ErrorCodes.INVALID_UNIT,
                            "The unit must be a UNIT space of this building."));
            // An owner managing their own unit can't move people into someone else's unit.
            if (!Objects.equals(unitId(target), unit.getId())
                    && !permissionService.can(actor, Action.MEMBER_MANAGE, unit)) {
                throw ApiException.forbidden(ErrorCodes.PERMISSION_DENIED,
                        "You can't assign members to that unit.");
            }
        } else if (target.getUnitSpace() != null && !permissionService.can(actor, Action.MEMBER_MANAGE, null)) {
            throw ApiException.forbidden(ErrorCodes.PERMISSION_DENIED, "You can't remove members from their unit.");
        }

        boolean losesAdmin = Role.ADMIN.equals(target.getRoleCode())
                && (!Role.ADMIN.equals(newRole.getCode()) || req.expiresAt() != null);
        if (losesAdmin && target.isActiveAt(clock.instant())) {
            requireAnotherAdmin(buildingId);
        }
        target.update(newRole.getCode(), unit, req.expiresAt());
        memberships.flush();
        return toDto(target, true);
    }

    /** Revokes access. Members may also revoke themselves ("leave the building"). */
    public void revoke(UUID buildingId, UUID memberId) {
        Membership target = findInBuilding(buildingId, memberId);
        boolean self = target.getUser().getId().equals(CurrentUser.id());
        if (!self) {
            Membership actor = guard.require(buildingId, Action.MEMBER_MANAGE, target.getUnitSpace());
            requireRankAtLeast(actor, target.getRoleCode());
        }
        if (target.getStatus() == MembershipStatus.REVOKED) {
            return;
        }
        if (Role.ADMIN.equals(target.getRoleCode()) && target.isActiveAt(clock.instant())) {
            requireAnotherAdmin(buildingId);
        }
        target.revoke(clock.instant());
    }

    public static MembershipSummary summaryOf(Membership m) {
        return new MembershipSummary(m.getId(), m.getBuilding().getId(), m.getBuilding().getName(),
                m.getRoleCode(), unitId(m), unitName(m), m.getExpiresAt());
    }

    private boolean canManage(Membership actor, Membership target) {
        return permissionService.can(actor, Action.MEMBER_MANAGE, target.getUnitSpace())
                && rank(actor.getRoleCode()) >= rank(target.getRoleCode());
    }

    private void requireRankAtLeast(Membership actor, String roleCode) {
        if (rank(actor.getRoleCode()) < rank(roleCode)) {
            throw ApiException.forbidden(ErrorCodes.ROLE_RANK_EXCEEDED,
                    "You can't grant or change a role above your own.");
        }
    }

    private void requireAnotherAdmin(UUID buildingId) {
        if (memberships.countActiveAdmins(buildingId, clock.instant()) <= 1) {
            throw ApiException.conflict(ErrorCodes.LAST_ADMIN, "A building needs at least one admin.");
        }
    }

    private int rank(String roleCode) {
        return roles.findById(roleCode).map(Role::getRank).orElse(0);
    }

    private Membership findInBuilding(UUID buildingId, UUID memberId) {
        guard.requireActiveMember(buildingId);
        return memberships.findInBuilding(memberId, buildingId).orElseThrow(() -> ApiException.notFound("Member"));
    }

    private MemberDto toDto(Membership m, boolean withContact) {
        return new MemberDto(m.getId(), m.getUser().getId(), m.getUser().getDisplayName(),
                withContact ? m.getUser().getEmail() : null, m.getRoleCode(), unitId(m), unitName(m),
                m.effectiveStatus(clock.instant()), m.getExpiresAt(), m.getCreatedAt(),
                m.getInvitedBy() != null ? m.getInvitedBy().getDisplayName() : null,
                m.getVersion() != null ? m.getVersion() : 0L);
    }

    private static UUID unitId(Membership m) {
        return m.getUnitSpace() != null ? m.getUnitSpace().getId() : null;
    }

    private static String unitName(Membership m) {
        return m.getUnitSpace() != null ? m.getUnitSpace().getName() : null;
    }
}
