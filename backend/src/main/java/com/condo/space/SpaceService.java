package com.condo.space;

import com.condo.asset.AssetRepository;
import com.condo.common.error.ApiException;
import com.condo.common.error.ErrorCodes;
import com.condo.common.persistence.Versions;
import com.condo.governance.AccessGuard;
import com.condo.governance.Action;
import com.condo.governance.SpacePrivacy;
import com.condo.member.Membership;
import com.condo.space.dto.SpaceDtos.CreateSpaceRequest;
import com.condo.space.dto.SpaceDtos.GenerateStructureRequest;
import com.condo.space.dto.SpaceDtos.GenerateStructureResponse;
import com.condo.space.dto.SpaceDtos.MoveSpaceRequest;
import com.condo.space.dto.SpaceDtos.SpaceDto;
import com.condo.space.dto.SpaceDtos.UpdateSpaceRequest;
import java.util.Arrays;
import java.util.Collection;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@Transactional
public class SpaceService {

    private final SpaceRepository spaces;
    private final StructureGenerator generator;
    private final AccessGuard guard;
    private final AssetRepository assets;
    private final SpacePrivacy privacy;

    public SpaceService(SpaceRepository spaces, StructureGenerator generator, AccessGuard guard,
            AssetRepository assets, SpacePrivacy privacy) {
        this.spaces = spaces;
        this.generator = generator;
        this.guard = guard;
        this.assets = assets;
        this.privacy = privacy;
    }

    // ---------- queries ----------

    @Transactional(readOnly = true)
    public List<SpaceDto> list(UUID buildingId) {
        Membership viewer = guard.require(buildingId, Action.BUILDING_VIEW);
        List<Space> all = allOf(buildingId);
        return toDtos(all, all, viewer);
    }

    @Transactional(readOnly = true)
    public SpaceDto get(UUID buildingId, UUID spaceId) {
        Membership viewer = guard.require(buildingId, Action.BUILDING_VIEW);
        return toDto(find(buildingId, spaceId), viewer);
    }

    // ---------- commands ----------

    public SpaceDto create(UUID buildingId, CreateSpaceRequest req) {
        Space parent = find(buildingId, req.parentId());
        Membership viewer = guard.require(buildingId, Action.STRUCTURE_EDIT, parent);
        if (req.type() == SpaceType.BUILDING) {
            throw ApiException.badRequest(ErrorCodes.INVALID_HIERARCHY, "Only the root can be of type BUILDING.");
        }
        // Units are private unless said otherwise; everything else inherits.
        Visibility visibility = req.visibility() != null ? req.visibility()
                : req.type() == SpaceType.UNIT ? Visibility.PRIVATE : null;
        int sortOrder = req.sortOrder() != null ? req.sortOrder() : spaces.maxSortOrderUnder(parent.getId()) + 1;
        Space created = spaces.save(Space.childOf(parent, req.type(), req.name().trim(), sortOrder, visibility));
        return toDto(created, viewer);
    }

    public SpaceDto update(UUID buildingId, UUID spaceId, UpdateSpaceRequest req) {
        Space node = find(buildingId, spaceId);
        Membership viewer = guard.require(buildingId, Action.STRUCTURE_EDIT, node);
        Versions.requireCurrent(req.version(), node);
        if (node.isRoot()) {
            if (req.type() != SpaceType.BUILDING || req.visibility() == null) {
                throw ApiException.badRequest(ErrorCodes.INVALID_HIERARCHY,
                        "The building root must stay of type BUILDING with an explicit visibility.");
            }
        } else if (req.type() == SpaceType.BUILDING) {
            throw ApiException.badRequest(ErrorCodes.INVALID_HIERARCHY, "Only the root can be of type BUILDING.");
        }
        node.update(req.name().trim(), req.type(), req.visibility(), req.sortOrder());
        spaces.flush(); // bump @Version before mapping, so the client gets the new one
        return toDto(node, viewer);
    }

    /** Moves a node with its whole subtree. Returns the moved subtree. */
    public List<SpaceDto> move(UUID buildingId, UUID spaceId, MoveSpaceRequest req) {
        Space node = find(buildingId, spaceId);
        Space newParent = find(buildingId, req.newParentId());
        Membership viewer = guard.require(buildingId, Action.STRUCTURE_EDIT, node);
        guard.require(buildingId, Action.STRUCTURE_EDIT, newParent);
        if (node.isRoot()) {
            throw ApiException.badRequest(ErrorCodes.INVALID_MOVE, "The building root can't be moved.");
        }
        if (newParent.isWithin(node)) {
            throw ApiException.badRequest(ErrorCodes.INVALID_MOVE, "A space can't be moved inside itself.");
        }
        String oldPrefix = node.getPath();
        int depthDelta = newParent.getDepth() + 1 - node.getDepth();
        if (!newParent.getId().equals(node.getParentId())) {
            node.reparent(newParent);
        }
        node.setSortOrder(req.sortOrder() != null ? req.sortOrder() : spaces.maxSortOrderUnder(newParent.getId()) + 1);
        String newPrefix = node.getPath();
        if (!newPrefix.equals(oldPrefix)) {
            // The node itself already has its new path; this rewrites all descendants in one statement.
            spaces.rebaseSubtree(buildingId, oldPrefix, oldPrefix.length(), newPrefix, depthDelta);
        } else {
            spaces.flush();
        }
        List<Space> all = allOf(buildingId);
        return toDtos(all, all.stream().filter(s -> s.getPath().startsWith(newPrefix)).toList(), viewer);
    }

    public void delete(UUID buildingId, UUID spaceId, boolean cascade) {
        Space node = find(buildingId, spaceId);
        guard.require(buildingId, Action.STRUCTURE_EDIT, node);
        if (node.isRoot()) {
            throw ApiException.badRequest(ErrorCodes.INVALID_HIERARCHY, "The building root can't be deleted.");
        }
        if (!cascade && spaces.existsByParentId(node.getId())) {
            throw ApiException.conflict(ErrorCodes.SPACE_HAS_CHILDREN,
                    "This space has sub-spaces. Delete them too (cascade) or move them first.");
        }
        // Even with cascade: deleting a space must never silently retire equipment people report problems on.
        if (assets.existsActiveInSubtree(buildingId, node.getPath())) {
            throw ApiException.conflict(ErrorCodes.SPACE_HAS_ASSETS,
                    "There are items (lights, doors...) in this space. Move or archive them first.");
        }
        spaces.deleteNode(node.getId());
    }

    public GenerateStructureResponse generate(UUID buildingId, GenerateStructureRequest req) {
        Space root = rootOf(buildingId);
        Membership viewer = guard.require(buildingId, Action.STRUCTURE_EDIT, root);
        if (!Boolean.TRUE.equals(req.append()) && spaces.existsByParentId(root.getId())) {
            throw ApiException.conflict(ErrorCodes.STRUCTURE_NOT_EMPTY,
                    "This building already has a structure. Set append=true to add to it.");
        }
        List<Space> created = generateUnder(root, req);
        List<Space> all = allOf(buildingId);
        return new GenerateStructureResponse(created.size(), toDtos(all, created, viewer));
    }

    // ---------- used by BuildingService (caller has already authorized) ----------

    public Space createRoot(UUID buildingId, String name) {
        return spaces.save(Space.root(buildingId, name));
    }

    public List<Space> generateUnder(Space root, GenerateStructureRequest req) {
        if (StructureGenerator.estimate(req) > StructureGenerator.MAX_NODES) {
            throw ApiException.badRequest(ErrorCodes.STRUCTURE_TOO_LARGE,
                    "That would create more than " + StructureGenerator.MAX_NODES + " spaces.");
        }
        return spaces.saveAll(generator.generate(root, req));
    }

    public Space rootOf(UUID buildingId) {
        return spaces.findByBuildingIdAndParentIdIsNull(buildingId)
                .orElseThrow(() -> ApiException.notFound("Building structure"));
    }

    public Space find(UUID buildingId, UUID spaceId) {
        return spaces.findByIdAndBuildingId(spaceId, buildingId).orElseThrow(() -> ApiException.notFound("Space"));
    }

    // ---------- mapping ----------

    private List<Space> allOf(UUID buildingId) {
        return spaces.findByBuildingIdOrderByDepthAscSortOrderAscNameAsc(buildingId);
    }

    private SpaceDto toDto(Space node, Membership viewer) {
        List<UUID> ancestorIds = Arrays.stream(node.getPath().split("/"))
                .filter(s -> !s.isEmpty())
                .map(UUID::fromString)
                .toList();
        List<Space> lineage = spaces.findAllById(ancestorIds);
        return toDtos(lineage, List.of(node), viewer).getFirst();
    }

    /**
     * @param context all spaces needed to resolve inheritance (at least the ancestors of {@code nodes})
     * @param viewer  asset counts of private spaces the viewer can't see are reported as 0
     */
    private List<SpaceDto> toDtos(Collection<Space> context, Collection<Space> nodes, Membership viewer) {
        Map<UUID, Space> byId = context.stream().collect(Collectors.toMap(Space::getId, Function.identity()));
        nodes.forEach(n -> byId.put(n.getId(), n));
        Map<UUID, Long> counts = nodes.isEmpty() ? Map.of()
                : activeAssetCounts(nodes.iterator().next().getBuildingId());
        return nodes.stream()
                .map(s -> {
                    Visibility effective = effectiveVisibility(s, byId);
                    long count = counts.getOrDefault(s.getId(), 0L);
                    if (count > 0 && !privacy.canSee(viewer, s, effective)) {
                        count = 0;
                    }
                    return new SpaceDto(s.getId(), s.getBuildingId(), s.getParentId(), s.getType(), s.getName(),
                            s.getSortOrder(), s.getVisibility(), effective, s.getDepth(),
                            s.getVersion() != null ? s.getVersion() : 0L, count);
                })
                .toList();
    }

    private Map<UUID, Long> activeAssetCounts(UUID buildingId) {
        Map<UUID, Long> counts = new HashMap<>();
        for (Object[] row : assets.countActiveBySpace(buildingId)) {
            counts.put((UUID) row[0], (Long) row[1]);
        }
        return counts;
    }

    public static Visibility effectiveVisibility(Space space, Map<UUID, Space> byId) {
        for (Space cur = space; cur != null; cur = cur.getParentId() != null ? byId.get(cur.getParentId()) : null) {
            if (cur.getVisibility() != null) {
                return cur.getVisibility();
            }
        }
        return Visibility.COMMON;
    }
}
