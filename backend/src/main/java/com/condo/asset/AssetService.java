package com.condo.asset;

import com.condo.asset.dto.AssetDtos.AssetDto;
import com.condo.asset.dto.AssetDtos.AssetQuery;
import com.condo.asset.dto.AssetDtos.BulkCreateAssetsRequest;
import com.condo.asset.dto.AssetDtos.CreateAssetRequest;
import com.condo.asset.dto.AssetDtos.UpdateAssetRequest;
import com.condo.common.config.AppProperties;
import com.condo.common.error.ApiException;
import com.condo.common.error.ErrorCodes;
import com.condo.common.persistence.Versions;
import com.condo.governance.AccessGuard;
import com.condo.governance.Action;
import com.condo.governance.PermissionService;
import com.condo.governance.SpacePrivacy;
import com.condo.member.Membership;
import com.condo.space.Space;
import com.condo.space.SpaceRepository;
import com.condo.space.SpaceService;
import com.condo.space.Visibility;
import java.time.Clock;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@Transactional
public class AssetService {

    private final AssetRepository assets;
    private final AssetTypeRepository assetTypes;
    private final SpaceRepository spaces;
    private final CatalogService catalog;
    private final AccessGuard guard;
    private final PermissionService permissions;
    private final SpacePrivacy privacy;
    private final AppProperties props;
    private final Clock clock;

    public AssetService(AssetRepository assets, AssetTypeRepository assetTypes, SpaceRepository spaces,
            CatalogService catalog, AccessGuard guard, PermissionService permissions, SpacePrivacy privacy,
            AppProperties props, Clock clock) {
        this.assets = assets;
        this.assetTypes = assetTypes;
        this.spaces = spaces;
        this.catalog = catalog;
        this.guard = guard;
        this.permissions = permissions;
        this.privacy = privacy;
        this.props = props;
        this.clock = clock;
    }

    // ---------- queries ----------

    /** All assets of the building the caller may see, filtered. A building has at most a few thousand. */
    @Transactional(readOnly = true)
    public List<AssetDto> list(UUID buildingId, AssetQuery query) {
        Membership member = guard.require(buildingId, Action.BUILDING_VIEW);
        Context ctx = context(buildingId);
        String subtreePrefix = null;
        if (query.spaceId() != null) {
            Space root = ctx.space(query.spaceId());
            if (root == null) {
                throw ApiException.notFound("Space");
            }
            subtreePrefix = root.getPath();
        }
        boolean descendants = query.includeDescendants() == null || query.includeDescendants();
        String needle = query.q() == null || query.q().isBlank() ? null : query.q().trim().toLowerCase(Locale.ROOT);
        boolean includeArchived = Boolean.TRUE.equals(query.includeArchived());

        List<AssetDto> out = new ArrayList<>();
        for (Asset a : assets.findByBuildingId(buildingId)) {
            if (a.isArchived() && !includeArchived) {
                continue;
            }
            if (query.type() != null && !query.type().equals(a.getAssetTypeCode())) {
                continue;
            }
            if (needle != null && !a.getName().toLowerCase(Locale.ROOT).contains(needle)) {
                continue;
            }
            Space space = ctx.space(a.getSpaceId());
            if (subtreePrefix != null) {
                if (space == null) {
                    continue;
                }
                boolean match = descendants ? space.getPath().startsWith(subtreePrefix)
                        : space.getId().equals(query.spaceId());
                if (!match) {
                    continue;
                }
            }
            if (canSee(member, a, ctx)) {
                out.add(toDto(a, ctx));
            }
        }
        out.sort(Comparator.comparing((AssetDto d) -> d.spacePath() == null ? "￿" : d.spacePath())
                .thenComparing(AssetDto::name, String.CASE_INSENSITIVE_ORDER));
        return out;
    }

    /** Hidden private assets answer 404, so their existence isn't revealed. */
    @Transactional(readOnly = true)
    public AssetDto get(UUID buildingId, UUID assetId) {
        Membership member = guard.require(buildingId, Action.BUILDING_VIEW);
        Asset asset = find(buildingId, assetId);
        Context ctx = context(buildingId);
        if (!canSee(member, asset, ctx)) {
            throw ApiException.notFound("Asset");
        }
        return toDto(asset, ctx);
    }

    // ---------- commands ----------

    public AssetDto create(UUID buildingId, CreateAssetRequest req) {
        Space space = findSpace(buildingId, req.spaceId());
        guard.require(buildingId, Action.ASSET_CREATE, space);
        catalog.requireAssetType(req.type());
        Asset asset = assets.save(new Asset(buildingId, space.getId(), req.type(), req.name().trim(),
                blankToNull(req.notes())));
        return toDto(asset, context(buildingId));
    }

    /** Same asset in many spaces at once; all-or-nothing. */
    public List<AssetDto> bulkCreate(UUID buildingId, BulkCreateAssetsRequest req) {
        catalog.requireAssetType(req.type());
        List<Space> targets = new ArrayList<>();
        for (UUID spaceId : new LinkedHashSet<>(req.spaceIds())) {
            Space space = findSpace(buildingId, spaceId);
            guard.require(buildingId, Action.ASSET_CREATE, space);
            targets.add(space);
        }
        String name = req.name().trim();
        String notes = blankToNull(req.notes());
        List<Asset> created = assets.saveAll(targets.stream()
                .map(s -> new Asset(buildingId, s.getId(), req.type(), name, notes))
                .toList());
        Context ctx = context(buildingId);
        return created.stream().map(a -> toDto(a, ctx)).toList();
    }

    /** Full replace; moving to another space needs ASSET_EDIT on both ends. */
    public AssetDto update(UUID buildingId, UUID assetId, UpdateAssetRequest req) {
        Asset asset = find(buildingId, assetId);
        if (asset.isArchived()) {
            throw ApiException.conflict(ErrorCodes.ASSET_ARCHIVED, "This item is archived. Restore it to edit it.");
        }
        Space current = findSpace(buildingId, asset.getSpaceId());
        guard.require(buildingId, Action.ASSET_EDIT, current);
        Space target = current;
        if (!req.spaceId().equals(current.getId())) {
            target = findSpace(buildingId, req.spaceId());
            guard.require(buildingId, Action.ASSET_EDIT, target);
        }
        Versions.requireCurrent(req.version(), asset);
        catalog.requireAssetType(req.type());
        asset.update(target.getId(), req.type(), req.name().trim(), blankToNull(req.notes()));
        assets.flush();
        return toDto(asset, context(buildingId));
    }

    /** Soft delete: the id stays valid for QR labels and issue history. Idempotent. */
    public void archive(UUID buildingId, UUID assetId) {
        Asset asset = find(buildingId, assetId);
        guard.require(buildingId, Action.ASSET_DELETE, spaceOrNull(buildingId, asset));
        asset.archive(clock.instant());
    }

    public AssetDto restore(UUID buildingId, UUID assetId) {
        Asset asset = find(buildingId, assetId);
        Space space = spaceOrNull(buildingId, asset);
        guard.require(buildingId, Action.ASSET_DELETE, space);
        if (space == null) {
            throw ApiException.conflict(ErrorCodes.CONFLICT,
                    "This item's location was deleted, so it can't be restored. Create a new one instead.");
        }
        asset.restore();
        assets.flush();
        return toDto(asset, context(buildingId));
    }

    // ---------- helpers ----------

    private boolean canSee(Membership member, Asset asset, Context ctx) {
        Space space = ctx.space(asset.getSpaceId());
        if (space == null) {
            // Location gone: only people who manage assets building-wide.
            return permissions.can(member, Action.ASSET_DELETE, null);
        }
        return privacy.canSee(member, space, ctx.visibility(space));
    }

    private Asset find(UUID buildingId, UUID assetId) {
        return assets.findByIdAndBuildingId(assetId, buildingId).orElseThrow(() -> ApiException.notFound("Asset"));
    }

    private Space findSpace(UUID buildingId, UUID spaceId) {
        return spaces.findByIdAndBuildingId(spaceId, buildingId).orElseThrow(() -> ApiException.notFound("Space"));
    }

    private Space spaceOrNull(UUID buildingId, Asset asset) {
        return asset.getSpaceId() == null ? null
                : spaces.findByIdAndBuildingId(asset.getSpaceId(), buildingId).orElse(null);
    }

    private Context context(UUID buildingId) {
        Map<UUID, Space> byId = spaces.findByBuildingIdOrderByDepthAscSortOrderAscNameAsc(buildingId).stream()
                .collect(Collectors.toMap(Space::getId, Function.identity()));
        Map<String, String> typeNames = assetTypes.findAll().stream()
                .collect(Collectors.toMap(AssetType::getCode, AssetType::getName));
        return new Context(byId, typeNames);
    }

    private AssetDto toDto(Asset a, Context ctx) {
        Space space = ctx.space(a.getSpaceId());
        return new AssetDto(a.getId(), a.getBuildingId(), a.getSpaceId(), space != null ? space.getName() : null,
                space != null ? ctx.pathLabel(space) : null, a.getAssetTypeCode(),
                ctx.typeNames().getOrDefault(a.getAssetTypeCode(), a.getAssetTypeCode()), a.getName(), a.getNotes(),
                space != null ? ctx.visibility(space) : null, a.isArchived(), a.getArchivedAt(), a.getCreatedAt(),
                a.getVersion() != null ? a.getVersion() : 0L,
                props.links().webBaseUrl() + "/r/" + a.getId(),
                props.links().appScheme() + "://report/asset/" + a.getId());
    }

    private static String blankToNull(String s) {
        return s == null || s.isBlank() ? null : s.trim();
    }

    /** The building's spaces and type names, loaded once per request. */
    private record Context(Map<UUID, Space> spacesById, Map<String, String> typeNames) {

        Space space(UUID id) {
            return id == null ? null : spacesById.get(id);
        }

        Visibility visibility(Space space) {
            return SpaceService.effectiveVisibility(space, spacesById);
        }

        String pathLabel(Space space) {
            return SpaceService.pathLabel(space, spacesById);
        }
    }
}
