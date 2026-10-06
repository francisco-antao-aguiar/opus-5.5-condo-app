package com.condo.building.dto;

import com.condo.space.dto.SpaceDtos.GenerateStructureRequest;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import java.time.Instant;
import java.util.UUID;

public final class BuildingDtos {

    private BuildingDtos() {
    }

    public record BuildingDto(UUID id, String name, String address, String governanceMode, UUID rootSpaceId,
            Instant createdAt, String timeZone, String currency, long version) {
    }

    public record CreateBuildingRequest(
            @NotBlank @Size(max = 200) String name,
            @Size(max = 500) String address,
            @Size(max = 32) String governanceMode,
            @Valid GenerateStructureRequest structure,
            @Size(max = 64) String timeZone,
            @Size(min = 3, max = 3) String currency) {
    }

    /** Full replace. */
    public record UpdateBuildingRequest(
            @NotBlank @Size(max = 200) String name,
            @Size(max = 500) String address,
            @NotBlank @Size(max = 32) String governanceMode,
            @Size(max = 64) String timeZone,
            @Size(min = 3, max = 3) String currency,
            Long version) {
    }
}
