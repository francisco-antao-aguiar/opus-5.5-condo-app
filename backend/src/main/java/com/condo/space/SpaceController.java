package com.condo.space;

import com.condo.space.dto.SpaceDtos.CreateSpaceRequest;
import com.condo.space.dto.SpaceDtos.GenerateStructureRequest;
import com.condo.space.dto.SpaceDtos.GenerateStructureResponse;
import com.condo.space.dto.SpaceDtos.MoveSpaceRequest;
import com.condo.space.dto.SpaceDtos.SpaceDto;
import com.condo.space.dto.SpaceDtos.UpdateSpaceRequest;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import java.util.List;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/buildings/{buildingId}/spaces")
@Tag(name = "Spaces")
public class SpaceController {

    private final SpaceService spaceService;

    public SpaceController(SpaceService spaceService) {
        this.spaceService = spaceService;
    }

    @GetMapping
    @Operation(summary = "All spaces of the building as a flat list (build the tree from parentId)")
    public List<SpaceDto> list(@PathVariable UUID buildingId) {
        return spaceService.list(buildingId);
    }

    @GetMapping("/{spaceId}")
    public SpaceDto get(@PathVariable UUID buildingId, @PathVariable UUID spaceId) {
        return spaceService.get(buildingId, spaceId);
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public SpaceDto create(@PathVariable UUID buildingId, @Valid @RequestBody CreateSpaceRequest req) {
        return spaceService.create(buildingId, req);
    }

    @PutMapping("/{spaceId}")
    public SpaceDto update(@PathVariable UUID buildingId, @PathVariable UUID spaceId,
            @Valid @RequestBody UpdateSpaceRequest req) {
        return spaceService.update(buildingId, spaceId, req);
    }

    @PostMapping("/{spaceId}/move")
    @Operation(summary = "Move a space (with its subtree) under a new parent; returns the moved subtree")
    public List<SpaceDto> move(@PathVariable UUID buildingId, @PathVariable UUID spaceId,
            @Valid @RequestBody MoveSpaceRequest req) {
        return spaceService.move(buildingId, spaceId, req);
    }

    @DeleteMapping("/{spaceId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@PathVariable UUID buildingId, @PathVariable UUID spaceId,
            @RequestParam(defaultValue = "false") boolean cascade) {
        spaceService.delete(buildingId, spaceId, cascade);
    }

    @PostMapping("/generate")
    @ResponseStatus(HttpStatus.CREATED)
    @Operation(summary = "Quick-setup wizard: generate floors, units and common areas in one call")
    public GenerateStructureResponse generate(@PathVariable UUID buildingId,
            @Valid @RequestBody GenerateStructureRequest req) {
        return spaceService.generate(buildingId, req);
    }
}
