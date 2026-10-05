package com.condo.asset.dto;

import com.condo.space.Visibility;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

public final class AssetDtos {

    private AssetDtos() {
    }

    public record ProblemTypeDto(UUID id, String assetType, String label, int sortOrder, boolean builtIn,
            boolean active) {
    }

    public record AssetTypeDto(String code, String name, String icon, int sortOrder,
            List<ProblemTypeDto> problemTypes) {
    }

    public record CreateProblemTypeRequest(
            @NotBlank @Size(max = 32) String assetType,
            @NotBlank @Size(max = 120) String label,
            Integer sortOrder) {
    }

    public record UpdateProblemTypeRequest(
            @NotBlank @Size(max = 120) String label,
            @NotNull Integer sortOrder,
            @NotNull Boolean active) {
    }

    public record AssetDto(UUID id, UUID buildingId, UUID spaceId, String spaceName, String spacePath, String type,
            String typeName, String name, String notes, Visibility effectiveVisibility, boolean archived,
            Instant archivedAt, Instant createdAt, long version, String qrUrl, String deepLink) {
    }

    public record CreateAssetRequest(
            @NotNull UUID spaceId,
            @NotBlank @Size(max = 32) String type,
            @NotBlank @Size(max = 120) String name,
            @Size(max = 500) String notes) {
    }

    public record UpdateAssetRequest(
            @NotNull UUID spaceId,
            @NotBlank @Size(max = 32) String type,
            @NotBlank @Size(max = 120) String name,
            @Size(max = 500) String notes,
            Long version) {
    }

    public record BulkCreateAssetsRequest(
            @NotBlank @Size(max = 32) String type,
            @NotBlank @Size(max = 120) String name,
            @NotEmpty @Size(max = 500) List<@NotNull UUID> spaceIds,
            @Size(max = 500) String notes) {
    }

    public record AssetQuery(UUID spaceId, Boolean includeDescendants, String type, String q, Boolean includeArchived) {
    }
}
