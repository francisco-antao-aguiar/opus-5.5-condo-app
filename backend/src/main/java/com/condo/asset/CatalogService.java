package com.condo.asset;

import com.condo.asset.dto.AssetDtos.AssetTypeDto;
import com.condo.asset.dto.AssetDtos.CreateProblemTypeRequest;
import com.condo.asset.dto.AssetDtos.ProblemTypeDto;
import com.condo.asset.dto.AssetDtos.UpdateProblemTypeRequest;
import com.condo.common.error.ApiException;
import com.condo.common.error.ErrorCodes;
import com.condo.governance.AccessGuard;
import com.condo.governance.Action;
import com.condo.governance.PermissionService;
import com.condo.member.Membership;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** The problem catalog as one building sees it: built-ins (minus hidden ones) plus the building's own entries. */
@Service
@Transactional
public class CatalogService {

    private final AssetTypeRepository assetTypes;
    private final ProblemTypeRepository problemTypes;
    private final ProblemTypeHiddenRepository hidden;
    private final AccessGuard guard;
    private final PermissionService permissions;

    public CatalogService(AssetTypeRepository assetTypes, ProblemTypeRepository problemTypes,
            ProblemTypeHiddenRepository hidden, AccessGuard guard, PermissionService permissions) {
        this.assetTypes = assetTypes;
        this.problemTypes = problemTypes;
        this.hidden = hidden;
        this.guard = guard;
        this.permissions = permissions;
    }

    @Transactional(readOnly = true)
    public List<AssetTypeDto> catalog(UUID buildingId, boolean includeInactive) {
        Membership member = guard.require(buildingId, Action.BUILDING_VIEW);
        if (includeInactive && !permissions.can(member, Action.CATALOG_EDIT, null)) {
            throw ApiException.forbidden(ErrorCodes.PERMISSION_DENIED, "Only catalog editors see hidden entries.");
        }
        Set<UUID> hiddenIds = hidden.hiddenIds(buildingId);
        Map<String, List<ProblemTypeDto>> byType = problemTypes.findForBuilding(buildingId).stream()
                .map(p -> toDto(p, hiddenIds))
                .filter(p -> includeInactive || p.active())
                .sorted(Comparator.comparingInt(ProblemTypeDto::sortOrder).thenComparing(ProblemTypeDto::label))
                .collect(Collectors.groupingBy(ProblemTypeDto::assetType));
        return assetTypes.findAllByOrderBySortOrderAsc().stream()
                .map(t -> new AssetTypeDto(t.getCode(), t.getName(), t.getIcon(), t.getSortOrder(),
                        byType.getOrDefault(t.getCode(), List.of())))
                .toList();
    }

    public ProblemTypeDto create(UUID buildingId, CreateProblemTypeRequest req) {
        guard.require(buildingId, Action.CATALOG_EDIT);
        requireAssetType(req.assetType());
        String label = req.label().trim();
        requireUniqueLabel(buildingId, req.assetType(), label, null);
        int sortOrder = req.sortOrder() != null ? req.sortOrder()
                : problemTypes.maxSortOrder(buildingId, req.assetType()) + 1;
        ProblemType created = problemTypes.save(ProblemType.custom(buildingId, req.assetType(), label, sortOrder));
        return toDto(created, Set.of());
    }

    /** Custom entries: rename/reorder/(de)activate. Built-ins: only hide/show for this building. */
    public ProblemTypeDto update(UUID buildingId, UUID problemTypeId, UpdateProblemTypeRequest req) {
        guard.require(buildingId, Action.CATALOG_EDIT);
        ProblemType p = problemTypes.findById(problemTypeId)
                .filter(x -> x.belongsTo(buildingId))
                .orElseThrow(() -> ApiException.notFound("Problem type"));
        String label = req.label().trim();
        if (p.isBuiltIn()) {
            if (!label.equals(p.getLabel()) || req.sortOrder() != p.getSortOrder()) {
                throw ApiException.conflict(ErrorCodes.BUILT_IN_PROBLEM_TYPE,
                        "Built-in problems can be hidden for this building but not renamed or reordered.");
            }
            ProblemTypeHidden.Key key = new ProblemTypeHidden.Key(buildingId, p.getId());
            boolean isHidden = hidden.existsById(key);
            if (req.active() && isHidden) {
                hidden.deleteById(key);
            } else if (!req.active() && !isHidden) {
                hidden.save(new ProblemTypeHidden(buildingId, p.getId()));
            }
            hidden.flush();
            return toDto(p, hidden.hiddenIds(buildingId));
        }
        if (!label.equalsIgnoreCase(p.getLabel())) {
            requireUniqueLabel(buildingId, p.getAssetTypeCode(), label, p.getId());
        }
        p.update(label, req.sortOrder(), req.active());
        return toDto(p, Set.of());
    }

    void requireAssetType(String code) {
        if (!assetTypes.existsById(code)) {
            throw ApiException.badRequest(ErrorCodes.UNKNOWN_ASSET_TYPE, "Unknown asset type " + code);
        }
    }

    private void requireUniqueLabel(UUID buildingId, String assetType, String label, UUID exceptId) {
        boolean taken = problemTypes.findSameLabel(buildingId, assetType, label).stream()
                .anyMatch(p -> !p.getId().equals(exceptId));
        if (taken) {
            throw ApiException.conflict(ErrorCodes.DUPLICATE_PROBLEM_TYPE,
                    "\"" + label + "\" is already in the catalog for this type.");
        }
    }

    private static ProblemTypeDto toDto(ProblemType p, Set<UUID> hiddenIds) {
        boolean active = p.isBuiltIn() ? !hiddenIds.contains(p.getId()) : p.isActive();
        return new ProblemTypeDto(p.getId(), p.getAssetTypeCode(), p.getLabel(), p.getSortOrder(), p.isBuiltIn(),
                active);
    }
}
