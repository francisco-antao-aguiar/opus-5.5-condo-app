package com.condo.space.dto;

import com.condo.space.SpaceType;
import com.condo.space.Visibility;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.util.List;
import java.util.UUID;

public final class SpaceDtos {

    private SpaceDtos() {
    }

    public record SpaceDto(UUID id, UUID buildingId, UUID parentId, SpaceType type, String name, int sortOrder,
            Visibility visibility, Visibility effectiveVisibility, int depth, long version) {
    }

    public record CreateSpaceRequest(
            @NotNull UUID parentId,
            @NotNull SpaceType type,
            @NotBlank @Size(max = 200) String name,
            Visibility visibility,
            Integer sortOrder) {
    }

    /** Full replace; {@code visibility == null} means inherit. */
    public record UpdateSpaceRequest(
            @NotBlank @Size(max = 200) String name,
            @NotNull SpaceType type,
            Visibility visibility,
            @NotNull Integer sortOrder,
            Long version) {
    }

    public record MoveSpaceRequest(@NotNull UUID newParentId, Integer sortOrder) {
    }

    public enum CommonAreaKind { LOBBY, GARAGE, ROOF, ELEVATOR_SHAFT, STAIRWELL, STORAGE }

    public enum UnitNaming { LETTERS, NUMBERS }

    public record GroundFloor(@Min(0) @Max(50) Integer units, @Min(0) @Max(20) Integer shops) {
    }

    public record GenerateStructureRequest(
            @NotNull @Min(0) @Max(200) Integer floors,
            @NotNull @Min(0) @Max(50) Integer unitsPerFloor,
            @Min(0) @Max(10) Integer basements,
            @Valid GroundFloor groundFloor,
            UnitNaming unitNaming,
            List<CommonAreaKind> commonAreas,
            Boolean append) {
    }

    public record GenerateStructureResponse(int created, List<SpaceDto> spaces) {
    }
}
