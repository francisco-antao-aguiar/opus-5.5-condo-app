package com.condo.invitation;

import com.condo.auth.User;
import com.condo.auth.UserRepository;
import com.condo.common.config.AppProperties;
import com.condo.common.error.ApiException;
import com.condo.common.error.ErrorCodes;
import com.condo.common.security.CurrentUser;
import com.condo.governance.AccessGuard;
import com.condo.governance.Action;
import com.condo.governance.PermissionService;
import com.condo.governance.Role;
import com.condo.governance.RoleRepository;
import com.condo.invitation.dto.InvitationDtos.AcceptInvitationResponse;
import com.condo.invitation.dto.InvitationDtos.CreateInvitationRequest;
import com.condo.invitation.dto.InvitationDtos.InvitationDto;
import com.condo.invitation.dto.InvitationDtos.InvitationPreview;
import com.condo.member.MemberService;
import com.condo.member.Membership;
import com.condo.member.MembershipRepository;
import com.condo.space.Space;
import com.condo.space.SpaceRepository;
import com.condo.space.SpaceType;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@Transactional
public class InvitationService {

    static final Duration DEFAULT_VALIDITY = Duration.ofDays(7);
    static final Duration MAX_VALIDITY = Duration.ofDays(90);

    private final InvitationRepository invitations;
    private final MembershipRepository memberships;
    private final RoleRepository roles;
    private final SpaceRepository spaces;
    private final UserRepository users;
    private final AccessGuard guard;
    private final PermissionService permissionService;
    private final AttemptLimiter limiter;
    private final AppProperties props;
    private final Clock clock;

    public InvitationService(InvitationRepository invitations, MembershipRepository memberships, RoleRepository roles,
            SpaceRepository spaces, UserRepository users, AccessGuard guard, PermissionService permissionService,
            AttemptLimiter limiter, AppProperties props, Clock clock) {
        this.invitations = invitations;
        this.memberships = memberships;
        this.roles = roles;
        this.spaces = spaces;
        this.users = users;
        this.guard = guard;
        this.permissionService = permissionService;
        this.limiter = limiter;
        this.props = props;
        this.clock = clock;
    }

    // ---------- managing invitations (building members) ----------

    /** Invitations the caller may manage: those into spaces they can invite into, plus their own. */
    @Transactional(readOnly = true)
    public List<InvitationDto> list(UUID buildingId) {
        Membership actor = guard.requireActiveMember(buildingId);
        boolean mayInvite = permissionService.grantsOf(actor).stream()
                .anyMatch(g -> g.getAction() == Action.MEMBER_INVITE);
        if (!mayInvite) {
            throw ApiException.forbidden(ErrorCodes.PERMISSION_DENIED, "Your role in this building can't invite people.");
        }
        Instant now = clock.instant();
        return invitations.findByBuilding(buildingId).stream()
                .filter(i -> i.getCreatedBy().getId().equals(actor.getId())
                        || permissionService.can(actor, Action.MEMBER_INVITE, i.getUnitSpace()))
                .map(i -> toDto(i, now))
                .toList();
    }

    public InvitationDto create(UUID buildingId, CreateInvitationRequest req) {
        Space unit = resolveUnit(buildingId, req.unitId());
        // For OWN_UNIT inviters (owners) a null unit means "building-wide", which their rule doesn't cover.
        Membership inviter = guard.require(buildingId, Action.MEMBER_INVITE, unit);
        Role role = roles.findById(req.role())
                .orElseThrow(() -> ApiException.badRequest(ErrorCodes.UNKNOWN_ROLE, "Unknown role " + req.role()));
        if (role.getRank() > rankOf(inviter.getRoleCode())) {
            throw ApiException.forbidden(ErrorCodes.ROLE_RANK_EXCEEDED, "You can't invite someone above your own role.");
        }

        Instant now = clock.instant();
        Instant expiresAt = req.expiresAt() != null ? req.expiresAt() : now.plus(DEFAULT_VALIDITY);
        if (!expiresAt.isAfter(now)) {
            throw ApiException.invalidField("expiresAt", "must be in the future");
        }
        if (expiresAt.isAfter(now.plus(MAX_VALIDITY))) {
            throw ApiException.invalidField("expiresAt", "can be at most 90 days from now");
        }
        if (req.membershipExpiresAt() != null && !req.membershipExpiresAt().isAfter(now)) {
            throw ApiException.invalidField("membershipExpiresAt", "must be in the future");
        }
        if (req.membershipExpiresAt() != null && req.membershipDurationDays() != null) {
            throw ApiException.invalidField("membershipDurationDays",
                    "choose either an end date or a number of days, not both");
        }

        Invitation invitation = invitations.save(new Invitation(inviter.getBuilding(), uniqueCode(), role.getCode(),
                unit, inviter, req.maxUses() != null ? req.maxUses() : 1, expiresAt, req.membershipExpiresAt(),
                req.membershipDurationDays(), blankToNull(req.note())));
        return toDto(invitation, now);
    }

    /** The issuer can always revoke their own; otherwise MEMBER_INVITE on the invitation's unit is needed. */
    public void revoke(UUID buildingId, UUID invitationId) {
        Membership actor = guard.requireActiveMember(buildingId);
        Invitation invitation = invitations.findInBuilding(invitationId, buildingId)
                .orElseThrow(() -> ApiException.notFound("Invitation"));
        if (!invitation.getCreatedBy().getId().equals(actor.getId())) {
            guard.require(buildingId, Action.MEMBER_INVITE, invitation.getUnitSpace());
        }
        invitation.revoke(clock.instant());
    }

    // ---------- using a code (anyone holding it) ----------

    @Transactional(readOnly = true)
    public InvitationPreview preview(String rawCode, String callerKey) {
        limiter.checkAllowed(callerKey);
        Invitation i = invitations.findByCode(InviteCodes.normalize(rawCode)).orElseThrow(() -> notFound(callerKey));
        return new InvitationPreview(i.getCode(), i.getBuilding().getId(), i.getBuilding().getName(),
                i.getBuilding().getAddress(), i.getRoleCode(), unitName(i), issuerName(i), effectiveStatus(i, clock.instant()),
                i.getExpiresAt(), i.getMembershipExpiresAt(), i.getMembershipDurationDays());
    }

    public AcceptInvitationResponse accept(String rawCode) {
        UUID userId = CurrentUser.id();
        String callerKey = "user:" + userId;
        limiter.checkAllowed(callerKey);
        Invitation invitation = invitations.findByCodeForUpdate(InviteCodes.normalize(rawCode))
                .orElseThrow(() -> notFound(callerKey));
        Instant now = clock.instant();
        requireUsable(invitation, now);
        if (!issuerStillAllowed(invitation)) {
            throw gone(ErrorCodes.INVITATION_INVALID,
                    "This invitation is no longer valid because the person who sent it can't invite anymore.");
        }
        Membership issuer = invitation.getCreatedBy();
        if (invitation.getMembershipExpiresAt() != null && !invitation.getMembershipExpiresAt().isAfter(now)) {
            throw gone(ErrorCodes.INVITATION_EXPIRED, "The access period offered by this invitation has already ended.");
        }

        Instant membershipExpiresAt = invitation.membershipExpiryFor(now);
        UUID buildingId = invitation.getBuilding().getId();
        Membership membership = memberships.findByBuildingAndUser(buildingId, userId).orElse(null);
        if (membership != null && membership.isActiveAt(now)) {
            throw ApiException.conflict(ErrorCodes.ALREADY_MEMBER, "You're already a member of this building.");
        }
        User invitedBy = issuer.getUser();
        if (membership != null) {
            membership.rejoin(invitation.getRoleCode(), invitation.getUnitSpace(), membershipExpiresAt, invitation,
                    invitedBy);
        } else {
            User user = users.getReferenceById(userId);
            membership = new Membership(invitation.getBuilding(), user, invitation.getRoleCode(),
                    invitation.getUnitSpace(), membershipExpiresAt);
            membership.joinedVia(invitation, invitedBy);
            memberships.save(membership);
        }
        invitation.consume(now);
        return new AcceptInvitationResponse(buildingId, MemberService.summaryOf(membership));
    }

    // ---------- helpers ----------

    /** An invitation is only as good as its issuer's current right to invite into that unit with that role. */
    private boolean issuerStillAllowed(Invitation invitation) {
        Membership issuer = invitation.getCreatedBy();
        return permissionService.can(issuer, Action.MEMBER_INVITE, invitation.getUnitSpace())
                && rankOf(invitation.getRoleCode()) <= rankOf(issuer.getRoleCode());
    }

    private InvitationStatus effectiveStatus(Invitation invitation, Instant now) {
        InvitationStatus status = invitation.statusAt(now);
        return status == InvitationStatus.ACTIVE && !issuerStillAllowed(invitation) ? InvitationStatus.INVALID : status;
    }

    private void requireUsable(Invitation invitation, Instant now) {
        switch (invitation.statusAt(now)) {
            case ACTIVE -> {
            }
            case REVOKED -> throw gone(ErrorCodes.INVITATION_REVOKED, "This invitation was cancelled.");
            case EXPIRED -> throw gone(ErrorCodes.INVITATION_EXPIRED, "This invitation has expired.");
            case EXHAUSTED -> throw gone(ErrorCodes.INVITATION_EXHAUSTED, "This invitation has already been used.");
            case INVALID -> throw new IllegalStateException("statusAt never yields INVALID");
        }
    }

    private Space resolveUnit(UUID buildingId, UUID unitId) {
        if (unitId == null) {
            return null;
        }
        return spaces.findByIdAndBuildingId(unitId, buildingId)
                .filter(s -> s.getType() == SpaceType.UNIT)
                .orElseThrow(() -> ApiException.badRequest(ErrorCodes.INVALID_UNIT,
                        "The unit must be a UNIT space of this building."));
    }

    private String uniqueCode() {
        for (int attempt = 0; attempt < 5; attempt++) {
            String code = InviteCodes.generate();
            if (!invitations.existsByCode(code)) {
                return code;
            }
        }
        throw new IllegalStateException("Could not generate a unique invitation code");
    }

    private int rankOf(String roleCode) {
        return roles.findById(roleCode).map(Role::getRank).orElse(0);
    }

    private ApiException notFound(String callerKey) {
        limiter.recordFailure(callerKey);
        return new ApiException(HttpStatus.NOT_FOUND, ErrorCodes.INVITATION_NOT_FOUND,
                "We couldn't find an invitation with that code.");
    }

    private static ApiException gone(String code, String message) {
        return new ApiException(HttpStatus.GONE, code, message);
    }

    private InvitationDto toDto(Invitation i, Instant now) {
        return new InvitationDto(i.getId(), i.getBuilding().getId(), i.getCode(), i.getRoleCode(),
                i.getUnitSpace() != null ? i.getUnitSpace().getId() : null, unitName(i), i.getMaxUses(),
                i.getUseCount(), i.getExpiresAt(), i.getMembershipExpiresAt(), i.getMembershipDurationDays(),
                i.getNote(), effectiveStatus(i, now),
                issuerName(i), i.getCreatedAt(), props.links().webBaseUrl() + "/join/" + i.getCode(),
                props.links().appScheme() + "://join/" + i.getCode());
    }

    private static String unitName(Invitation i) {
        return i.getUnitSpace() != null ? i.getUnitSpace().getName() : null;
    }

    private static String issuerName(Invitation i) {
        return i.getCreatedBy().getUser().getDisplayName();
    }

    private static String blankToNull(String s) {
        return s == null || s.isBlank() ? null : s.trim();
    }
}
