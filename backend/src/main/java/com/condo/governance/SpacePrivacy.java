package com.condo.governance;

import com.condo.member.Membership;
import com.condo.space.Space;
import com.condo.space.Visibility;
import org.springframework.stereotype.Component;

/**
 * Who may see things (assets now, issues in phase 4) located in a PRIVATE space: the unit's own members, and
 * whoever the policy lets look after that space (asset editors, issue triagers). Expressed through
 * {@link PermissionService} so it follows the governance mode like everything else.
 */
@Component
public class SpacePrivacy {

    private final PermissionService permissions;

    public SpacePrivacy(PermissionService permissions) {
        this.permissions = permissions;
    }

    public boolean canSee(Membership member, Space space, Visibility effectiveVisibility) {
        if (effectiveVisibility == Visibility.COMMON) {
            return true;
        }
        Space unit = member.getUnitSpace();
        if (unit != null && space.isWithin(unit)) {
            return true;
        }
        return permissions.can(member, Action.ASSET_EDIT, space) || permissions.can(member, Action.ISSUE_TRIAGE, space);
    }
}
