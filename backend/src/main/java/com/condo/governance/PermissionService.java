package com.condo.governance;

import com.condo.member.Membership;
import com.condo.space.Space;
import java.time.Clock;
import java.util.List;
import org.springframework.lang.Nullable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * The single authorization decision point. Every building-scoped check in the system calls {@link #can}.
 * It contains no role or mode names: behaviour comes entirely from {@code permission_policy} rows, so a
 * new governance mode (or role, or action grant) is a data change.
 */
@Service
public class PermissionService {

    private final PermissionPolicyRepository policies;
    private final Clock clock;

    public PermissionService(PermissionPolicyRepository policies, Clock clock) {
        this.policies = policies;
        this.clock = clock;
    }

    /**
     * @param member the actor's membership in the target's building (may be null → denied)
     * @param action what they want to do
     * @param target the space acted on; needed for {@link PermissionScope#OWN_UNIT} rules, null for building-wide actions
     */
    @Transactional(readOnly = true)
    public boolean can(@Nullable Membership member, Action action, @Nullable Space target) {
        if (member == null || !member.isActiveAt(clock.instant())) {
            return false;
        }
        if (target != null && !target.getBuildingId().equals(member.getBuilding().getId())) {
            return false;
        }
        return policies.findByGovernanceModeAndActionAndRoleCode(
                        member.getBuilding().getGovernanceMode(), action, member.getRoleCode())
                .map(rule -> scopeAllows(rule.getScope(), member, target))
                .orElse(false);
    }

    /** All actions the member holds and in which scope — for UI hints. */
    @Transactional(readOnly = true)
    public List<PermissionPolicy> grantsOf(Membership member) {
        if (!member.isActiveAt(clock.instant())) {
            return List.of();
        }
        return policies.findByGovernanceModeAndRoleCode(member.getBuilding().getGovernanceMode(),
                member.getRoleCode());
    }

    private static boolean scopeAllows(PermissionScope scope, Membership member, @Nullable Space target) {
        return switch (scope) {
            case ANY -> true;
            case OWN_UNIT -> {
                Space unit = member.getUnitSpace();
                yield unit != null && target != null && target.isWithin(unit);
            }
        };
    }
}
