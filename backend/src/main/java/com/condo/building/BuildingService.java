package com.condo.building;

import com.condo.auth.User;
import com.condo.auth.UserRepository;
import com.condo.building.dto.BuildingDtos.BuildingDto;
import com.condo.building.dto.BuildingDtos.CreateBuildingRequest;
import com.condo.building.dto.BuildingDtos.UpdateBuildingRequest;
import com.condo.common.error.ApiException;
import com.condo.common.error.ErrorCodes;
import com.condo.common.security.CurrentUser;
import com.condo.governance.AccessGuard;
import com.condo.governance.Action;
import com.condo.governance.GovernanceMode;
import com.condo.governance.GovernanceModeRepository;
import com.condo.governance.Role;
import com.condo.member.Membership;
import com.condo.member.MembershipRepository;
import com.condo.space.Space;
import com.condo.space.SpaceRepository;
import com.condo.space.SpaceService;
import java.time.Clock;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@Transactional
public class BuildingService {

    private final BuildingRepository buildings;
    private final MembershipRepository memberships;
    private final UserRepository users;
    private final GovernanceModeRepository modes;
    private final SpaceRepository spaces;
    private final SpaceService spaceService;
    private final AccessGuard guard;
    private final Clock clock;

    public BuildingService(BuildingRepository buildings, MembershipRepository memberships, UserRepository users,
            GovernanceModeRepository modes, SpaceRepository spaces, SpaceService spaceService, AccessGuard guard,
            Clock clock) {
        this.buildings = buildings;
        this.memberships = memberships;
        this.users = users;
        this.modes = modes;
        this.spaces = spaces;
        this.spaceService = spaceService;
        this.guard = guard;
        this.clock = clock;
    }

    /** Any signed-in user can create a building; they become its first ADMIN. */
    public BuildingDto create(CreateBuildingRequest req) {
        User creator = users.getReferenceById(CurrentUser.id());
        String mode = requireMode(req.governanceMode() != null ? req.governanceMode() : GovernanceMode.MANAGED);
        Building building = buildings.save(new Building(req.name().trim(), blankToNull(req.address()), mode));
        Space root = spaceService.createRoot(building.getId(), building.getName());
        memberships.save(new Membership(building, creator, Role.ADMIN, null, null));
        if (req.structure() != null) {
            spaceService.generateUnder(root, req.structure());
        }
        return toDto(building, root.getId());
    }

    @Transactional(readOnly = true)
    public List<BuildingDto> listMine() {
        List<Building> mine = memberships.findActiveByUser(CurrentUser.id(), clock.instant()).stream()
                .map(Membership::getBuilding)
                .toList();
        if (mine.isEmpty()) {
            return List.of();
        }
        Map<UUID, UUID> roots = spaces.findByBuildingIdInAndParentIdIsNull(mine.stream().map(Building::getId).toList())
                .stream().collect(Collectors.toMap(Space::getBuildingId, Space::getId));
        return mine.stream().map(b -> toDto(b, roots.get(b.getId()))).toList();
    }

    @Transactional(readOnly = true)
    public BuildingDto get(UUID buildingId) {
        Membership m = guard.require(buildingId, Action.BUILDING_VIEW);
        return toDto(m.getBuilding(), spaceService.rootOf(buildingId).getId());
    }

    public BuildingDto update(UUID buildingId, UpdateBuildingRequest req) {
        Membership m = guard.require(buildingId, Action.BUILDING_SETTINGS);
        Building building = m.getBuilding();
        building.update(req.name().trim(), blankToNull(req.address()), requireMode(req.governanceMode()));
        Space root = spaceService.rootOf(buildingId);
        root.setName(building.getName());
        return toDto(building, root.getId());
    }

    private String requireMode(String code) {
        if (!modes.existsById(code)) {
            throw ApiException.badRequest(ErrorCodes.UNKNOWN_GOVERNANCE_MODE, "Unknown governance mode " + code);
        }
        return code;
    }

    private static BuildingDto toDto(Building b, UUID rootSpaceId) {
        return new BuildingDto(b.getId(), b.getName(), b.getAddress(), b.getGovernanceMode(), rootSpaceId,
                b.getCreatedAt());
    }

    private static String blankToNull(String s) {
        return s == null || s.isBlank() ? null : s.trim();
    }
}
