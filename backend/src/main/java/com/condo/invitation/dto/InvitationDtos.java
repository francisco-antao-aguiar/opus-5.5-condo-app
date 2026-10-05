package com.condo.invitation.dto;

import com.condo.invitation.InvitationStatus;
import com.condo.member.dto.MemberDtos.MembershipSummary;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import java.time.Instant;
import java.util.UUID;

public final class InvitationDtos {

    private InvitationDtos() {
    }

    public record InvitationDto(UUID id, UUID buildingId, String code, String role, UUID unitId, String unitName,
            int maxUses, int useCount, Instant expiresAt, Instant membershipExpiresAt, Integer membershipDurationDays,
            String note,
            InvitationStatus status, String createdByName, Instant createdAt, String joinUrl, String deepLink) {
    }

    /** Time-dependent rules (future dates, 90-day cap) are checked in the service against the clock. */
    public record CreateInvitationRequest(
            @NotBlank @Size(max = 32) String role,
            UUID unitId,
            @Min(1) @Max(500) Integer maxUses,
            Instant expiresAt,
            Instant membershipExpiresAt,
            @Min(1) @Max(3650) Integer membershipDurationDays,
            @Size(max = 200) String note) {
    }

    public record InvitationPreview(String code, UUID buildingId, String buildingName, String buildingAddress,
            String role, String unitName, String invitedByName, InvitationStatus status, Instant expiresAt,
            Instant membershipExpiresAt, Integer membershipDurationDays) {
    }

    public record AcceptInvitationResponse(UUID buildingId, MembershipSummary membership) {
    }
}
