package com.condo.building;

import com.condo.building.dto.BuildingDtos.BuildingDto;
import com.condo.building.dto.BuildingDtos.CreateBuildingRequest;
import com.condo.building.dto.BuildingDtos.UpdateBuildingRequest;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import java.util.List;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/buildings")
@Tag(name = "Buildings")
public class BuildingController {

    private final BuildingService buildingService;

    public BuildingController(BuildingService buildingService) {
        this.buildingService = buildingService;
    }

    @GetMapping
    @Operation(summary = "Buildings where the current user has an active membership")
    public List<BuildingDto> listMine() {
        return buildingService.listMine();
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    @Operation(summary = "Create a building (creator becomes ADMIN), optionally generating its structure")
    public BuildingDto create(@Valid @RequestBody CreateBuildingRequest req) {
        return buildingService.create(req);
    }

    @GetMapping("/{buildingId}")
    public BuildingDto get(@PathVariable UUID buildingId) {
        return buildingService.get(buildingId);
    }

    @PutMapping("/{buildingId}")
    public BuildingDto update(@PathVariable UUID buildingId, @Valid @RequestBody UpdateBuildingRequest req) {
        return buildingService.update(buildingId, req);
    }
}
