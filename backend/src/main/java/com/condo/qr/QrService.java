package com.condo.qr;

import com.condo.asset.Asset;
import com.condo.asset.AssetRepository;
import com.condo.asset.AssetService;
import com.condo.asset.dto.AssetDtos.AssetDto;
import com.condo.building.Building;
import com.condo.building.BuildingRepository;
import com.condo.common.error.ApiException;
import com.condo.common.error.ErrorCodes;
import com.condo.governance.AccessGuard;
import com.condo.governance.Action;
import com.condo.governance.PermissionService;
import com.condo.issue.IssueService;
import com.condo.issue.dto.IssueDtos.IssueSummaryDto;
import com.condo.member.Membership;
import com.condo.space.Space;
import com.condo.space.SpaceRepository;
import java.util.List;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * What a scanned asset code leads to. The asset id is not a secret (it's printed on a wall): everything the caller
 * learns depends on their membership, except the building's name when they aren't a member, so the app can say
 * "this belongs to X — ask for an invite" instead of a bare error.
 */
@Service
@Transactional(readOnly = true)
public class QrService {

    public record ResolvedAsset(AssetDto asset, UUID buildingId, String buildingName, boolean canReport,
            List<IssueSummaryDto> openIssues) {
    }

    private final AssetRepository assets;
    private final BuildingRepository buildings;
    private final SpaceRepository spaces;
    private final AssetService assetService;
    private final IssueService issueService;
    private final AccessGuard guard;
    private final PermissionService permissions;

    public QrService(AssetRepository assets, BuildingRepository buildings, SpaceRepository spaces,
            AssetService assetService, IssueService issueService, AccessGuard guard, PermissionService permissions) {
        this.assets = assets;
        this.buildings = buildings;
        this.spaces = spaces;
        this.assetService = assetService;
        this.issueService = issueService;
        this.guard = guard;
        this.permissions = permissions;
    }

    public ResolvedAsset resolve(UUID assetId) {
        Asset asset = assets.findById(assetId)
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, ErrorCodes.NOT_FOUND,
                        "This code isn't linked to anything."));
        Building building = buildings.findById(asset.getBuildingId()).orElseThrow();
        Membership member;
        try {
            member = guard.requireActiveMember(building.getId());
        } catch (ApiException e) {
            if (ErrorCodes.NOT_A_MEMBER.equals(e.getCode())) {
                throw new ApiException(HttpStatus.FORBIDDEN, ErrorCodes.NOT_A_MEMBER,
                        "This item belongs to " + building.getName() + ". You're not a member of that building.")
                        .with("buildingName", building.getName());
            }
            throw e;
        }
        if (asset.isArchived()) {
            throw new ApiException(HttpStatus.GONE, ErrorCodes.ASSET_ARCHIVED, "This item is no longer in use.");
        }
        AssetDto dto = assetService.get(building.getId(), assetId); // 404 for a neighbour's private item
        Space space = spaces.findById(asset.getSpaceId()).orElse(null);
        boolean canReport = permissions.can(member, Action.ISSUE_REPORT, space);
        return new ResolvedAsset(dto, building.getId(), building.getName(), canReport,
                issueService.openOnAsset(building.getId(), assetId));
    }
}
