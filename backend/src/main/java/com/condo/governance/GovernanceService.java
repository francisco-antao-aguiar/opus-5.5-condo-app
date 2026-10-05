package com.condo.governance;

import com.condo.governance.dto.GovernanceDtos.GovernanceModeDto;
import com.condo.governance.dto.GovernanceDtos.GrantedAction;
import com.condo.governance.dto.GovernanceDtos.MyPermissions;
import com.condo.governance.dto.GovernanceDtos.PolicyRule;
import com.condo.governance.dto.GovernanceDtos.RoleDto;
import com.condo.member.Membership;
import java.util.Comparator;
import java.util.List;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@Transactional(readOnly = true)
public class GovernanceService {

    private final GovernanceModeRepository modes;
    private final PermissionPolicyRepository policies;
    private final RoleRepository roles;
    private final PermissionService permissionService;
    private final AccessGuard guard;

    public GovernanceService(GovernanceModeRepository modes, PermissionPolicyRepository policies,
            RoleRepository roles, PermissionService permissionService, AccessGuard guard) {
        this.modes = modes;
        this.policies = policies;
        this.roles = roles;
        this.permissionService = permissionService;
        this.guard = guard;
    }

    public List<GovernanceModeDto> governanceModes() {
        return modes.findAllByOrderByCodeAsc().stream()
                .map(m -> new GovernanceModeDto(m.getCode(), m.getName(), m.getDescription(),
                        policies.findByGovernanceModeOrderByActionAscRoleCodeAsc(m.getCode()).stream()
                                .map(p -> new PolicyRule(p.getAction(), p.getRoleCode(), p.getScope()))
                                .toList()))
                .toList();
    }

    public List<RoleDto> roles() {
        return roles.findAllByOrderByRankDesc().stream()
                .map(r -> new RoleDto(r.getCode(), r.getName(), r.getRank()))
                .toList();
    }

    public MyPermissions myPermissions(UUID buildingId) {
        Membership m = guard.requireActiveMember(buildingId);
        List<GrantedAction> actions = permissionService.grantsOf(m).stream()
                .map(p -> new GrantedAction(p.getAction(), p.getScope()))
                .sorted(Comparator.comparing(GrantedAction::action))
                .toList();
        return new MyPermissions(m.getId(), m.getRoleCode(), m.getBuilding().getGovernanceMode(),
                m.getUnitSpace() != null ? m.getUnitSpace().getId() : null, actions);
    }
}
