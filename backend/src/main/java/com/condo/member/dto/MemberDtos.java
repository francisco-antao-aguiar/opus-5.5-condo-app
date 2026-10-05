package com.condo.member.dto;

import com.condo.auth.dto.AuthDtos.UserDto;
import com.condo.member.MembershipStatus;
import jakarta.validation.constraints.Future;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

public final class MemberDtos {

    private MemberDtos() {
    }

    /** {@code email} is null unless the caller may manage this member. */
    public record MemberDto(UUID id, UUID userId, String displayName, String email, String role, UUID unitId,
            String unitName, MembershipStatus status, Instant expiresAt, Instant createdAt) {
    }

    /** Full replace. */
    public record UpdateMemberRequest(
            @NotBlank @Size(max = 32) String role,
            UUID unitId,
            @Future Instant expiresAt) {
    }

    public record MembershipSummary(UUID membershipId, UUID buildingId, String buildingName, String role,
            UUID unitId, String unitName, Instant expiresAt) {
    }

    public record MeResponse(UserDto user, List<MembershipSummary> memberships) {
    }
}
