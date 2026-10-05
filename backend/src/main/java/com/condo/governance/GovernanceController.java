package com.condo.governance;

import com.condo.governance.dto.GovernanceDtos.GovernanceModeDto;
import com.condo.governance.dto.GovernanceDtos.MyPermissions;
import com.condo.governance.dto.GovernanceDtos.RoleDto;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import java.util.List;
import java.util.UUID;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api")
@Tag(name = "Governance")
public class GovernanceController {

    private final GovernanceService governanceService;

    public GovernanceController(GovernanceService governanceService) {
        this.governanceService = governanceService;
    }

    @GetMapping("/governance-modes")
    @Operation(summary = "Governance presets with their full permission policy")
    public List<GovernanceModeDto> governanceModes() {
        return governanceService.governanceModes();
    }

    @GetMapping("/roles")
    @Operation(summary = "Roles, highest rank first")
    public List<RoleDto> roles() {
        return governanceService.roles();
    }

    @GetMapping("/buildings/{buildingId}/permissions/me")
    @Operation(summary = "Effective permissions of the current user (UI hints; the server always re-checks)")
    public MyPermissions myPermissions(@PathVariable UUID buildingId) {
        return governanceService.myPermissions(buildingId);
    }
}
