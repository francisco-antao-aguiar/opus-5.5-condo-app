package com.condo.building;

import com.condo.auth.User;
import com.condo.auth.UserRepository;
import com.condo.building.dto.BuildingDtos.BuildingDto;
import com.condo.building.dto.BuildingDtos.CreateBuildingRequest;
import com.condo.building.dto.BuildingDtos.UpdateBuildingRequest;
import com.condo.common.config.AppProperties;
import com.condo.common.error.ApiException;
import com.condo.common.error.ErrorCodes;
import com.condo.common.persistence.Versions;
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
    private final AppProperties props;

    public BuildingService(BuildingRepository buildings, MembershipRepository memberships, UserRepository users,
            GovernanceModeRepository modes, SpaceRepository spaces, SpaceService spaceService, AccessGuard guard,
            Clock clock, AppProperties props) {
        this.buildings = buildings;
        this.memberships = memberships;
        this.users = users;
        this.modes = modes;
        this.spaces = spaces;
        this.spaceService = spaceService;
        this.guard = guard;
        this.clock = clock;
        this.props = props;
    }

    /** Any signed-in user can create a building; they become its first ADMIN. */
    public BuildingDto create(CreateBuildingRequest req) {
        User creator = users.getReferenceById(CurrentUser.id());
        String mode = requireMode(req.governanceMode() != null ? req.governanceMode() : GovernanceMode.MANAGED);
        Building building = buildings.save(new Building(req.name().trim(), blankToNull(req.address()), mode,
                timeZone(req.timeZone() != null ? req.timeZone() : props.buildings().defaultTimeZone()),
                currency(req.currency() != null ? req.currency() : props.buildings().defaultCurrency())));
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
        Versions.requireCurrent(req.version(), building);
        building.update(req.name().trim(), blankToNull(req.address()), requireMode(req.governanceMode()));
        building.setLocale(req.timeZone() != null ? timeZone(req.timeZone()) : building.getTimeZone(),
                req.currency() != null ? currency(req.currency()) : building.getCurrency());
        Space root = spaceService.rootOf(buildingId);
        root.setName(building.getName());
        buildings.flush();
        return toDto(building, root.getId());
    }

    /** Normalized IANA id ("europe/lisbon" → "Europe/Lisbon"); region ids only, no raw offsets. */
    static String timeZone(String id) {
        try {
            java.time.ZoneId zone = java.time.ZoneId.of(id.trim());
            if (!(zone instanceof java.time.ZoneOffset)) {
                return zone.getId();
            }
        } catch (java.time.DateTimeException e) {
            // fall through
        }
        throw ApiException.badRequest(ErrorCodes.INVALID_TIME_ZONE, "Unknown time zone " + id
                + ". Use a region like Europe/Lisbon.");
    }

    static String currency(String code) {
        try {
            return java.util.Currency.getInstance(code.trim().toUpperCase(java.util.Locale.ROOT)).getCurrencyCode();
        } catch (IllegalArgumentException e) {
            throw ApiException.badRequest(ErrorCodes.UNKNOWN_CURRENCY, "Unknown currency " + code + ".");
        }
    }

    private String requireMode(String code) {
        if (!modes.existsById(code)) {
            throw ApiException.badRequest(ErrorCodes.UNKNOWN_GOVERNANCE_MODE, "Unknown governance mode " + code);
        }
        return code;
    }

    private static BuildingDto toDto(Building b, UUID rootSpaceId) {
        return new BuildingDto(b.getId(), b.getName(), b.getAddress(), b.getGovernanceMode(), rootSpaceId,
                b.getCreatedAt(), b.getTimeZone(), b.getCurrency(), b.getVersion() != null ? b.getVersion() : 0L);
    }

    private static String blankToNull(String s) {
        return s == null || s.isBlank() ? null : s.trim();
    }
}
