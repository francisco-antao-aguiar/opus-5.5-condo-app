package com.condo.governance.dto;

import com.condo.governance.Action;
import com.condo.governance.PermissionScope;
import java.util.List;
import java.util.UUID;

public final class GovernanceDtos {

    private GovernanceDtos() {
    }

    public record PolicyRule(Action action, String role, PermissionScope scope) {
    }

    public record GovernanceModeDto(String code, String name, String description, List<PolicyRule> rules) {
    }

    public record RoleDto(String code, String name, int rank) {
    }

    public record GrantedAction(Action action, PermissionScope scope) {
    }

    public record MyPermissions(UUID membershipId, String role, String governanceMode, UUID unitId,
            List<GrantedAction> actions) {
    }
}
