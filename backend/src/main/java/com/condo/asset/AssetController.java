package com.condo.asset;

import com.condo.asset.dto.AssetDtos.AssetDto;
import com.condo.asset.dto.AssetDtos.AssetQuery;
import com.condo.asset.dto.AssetDtos.AssetTypeDto;
import com.condo.asset.dto.AssetDtos.BulkCreateAssetsRequest;
import com.condo.asset.dto.AssetDtos.CreateAssetRequest;
import com.condo.asset.dto.AssetDtos.CreateProblemTypeRequest;
import com.condo.asset.dto.AssetDtos.ProblemTypeDto;
import com.condo.asset.dto.AssetDtos.UpdateAssetRequest;
import com.condo.asset.dto.AssetDtos.UpdateProblemTypeRequest;
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
@RequestMapping("/api/buildings/{buildingId}")
@Tag(name = "Assets & catalog")
public class AssetController {

    private final AssetService assetService;
    private final CatalogService catalogService;

    public AssetController(AssetService assetService, CatalogService catalogService) {
        this.assetService = assetService;
        this.catalogService = catalogService;
    }

    // ---------- catalog ----------

    @GetMapping("/catalog")
    @Operation(summary = "Asset types with this building's problem catalog")
    public List<AssetTypeDto> catalog(@PathVariable UUID buildingId,
            @RequestParam(defaultValue = "false") boolean includeInactive) {
        return catalogService.catalog(buildingId, includeInactive);
    }

    @PostMapping("/catalog/problem-types")
    @ResponseStatus(HttpStatus.CREATED)
    @Operation(summary = "Add a building-specific problem type")
    public ProblemTypeDto createProblemType(@PathVariable UUID buildingId,
            @Valid @RequestBody CreateProblemTypeRequest req) {
        return catalogService.create(buildingId, req);
    }

    @PutMapping("/catalog/problem-types/{problemTypeId}")
    @Operation(summary = "Edit a custom problem type, or hide/show a built-in one for this building")
    public ProblemTypeDto updateProblemType(@PathVariable UUID buildingId, @PathVariable UUID problemTypeId,
            @Valid @RequestBody UpdateProblemTypeRequest req) {
        return catalogService.update(buildingId, problemTypeId, req);
    }

    // ---------- assets ----------

    @GetMapping("/assets")
    @Operation(summary = "Assets visible to the caller (private-unit assets only to that unit and its caretakers)")
    public List<AssetDto> list(@PathVariable UUID buildingId, @RequestParam(required = false) UUID spaceId,
            @RequestParam(required = false) Boolean includeDescendants, @RequestParam(required = false) String type,
            @RequestParam(required = false) String q, @RequestParam(required = false) Boolean includeArchived) {
        return assetService.list(buildingId, new AssetQuery(spaceId, includeDescendants, type, q, includeArchived));
    }

    @GetMapping("/assets/{assetId}")
    public AssetDto get(@PathVariable UUID buildingId, @PathVariable UUID assetId) {
        return assetService.get(buildingId, assetId);
    }

    @PostMapping("/assets")
    @ResponseStatus(HttpStatus.CREATED)
    public AssetDto create(@PathVariable UUID buildingId, @Valid @RequestBody CreateAssetRequest req) {
        return assetService.create(buildingId, req);
    }

    @PostMapping("/assets/bulk")
    @ResponseStatus(HttpStatus.CREATED)
    @Operation(summary = "Create the same asset in several spaces (all-or-nothing)")
    public List<AssetDto> bulkCreate(@PathVariable UUID buildingId, @Valid @RequestBody BulkCreateAssetsRequest req) {
        return assetService.bulkCreate(buildingId, req);
    }

    @PutMapping("/assets/{assetId}")
    public AssetDto update(@PathVariable UUID buildingId, @PathVariable UUID assetId,
            @Valid @RequestBody UpdateAssetRequest req) {
        return assetService.update(buildingId, assetId, req);
    }

    @DeleteMapping("/assets/{assetId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @Operation(summary = "Archive (soft-delete) an asset; its id stays valid")
    public void archive(@PathVariable UUID buildingId, @PathVariable UUID assetId) {
        assetService.archive(buildingId, assetId);
    }

    @PostMapping("/assets/{assetId}/restore")
    public AssetDto restore(@PathVariable UUID buildingId, @PathVariable UUID assetId) {
        return assetService.restore(buildingId, assetId);
    }
}
