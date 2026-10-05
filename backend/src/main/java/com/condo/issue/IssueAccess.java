package com.condo.issue;

import com.condo.governance.Action;
import com.condo.governance.PermissionService;
import com.condo.member.Membership;
import com.condo.space.Space;
import com.condo.space.Visibility;
import java.util.Arrays;
import java.util.List;
import org.springframework.lang.Nullable;
import org.springframework.stereotype.Component;

/**
 * Issue-level rules on top of the permission policy. PRIVATE issues (on a unit's things) are visible to the
 * reporter and the unit's members, and to triagers only when the reporter shared them with management. The unit's
 * members run their own private issues; everything else is triaged by {@code ISSUE_TRIAGE} holders.
 */
@Component
public class IssueAccess {

    private final PermissionService permissions;

    public IssueAccess(PermissionService permissions) {
        this.permissions = permissions;
    }

    /** @param space the issue's space, or null if it was deleted */
    public boolean canSee(Membership m, Issue issue, @Nullable Space space) {
        if (issue.getVisibility() == Visibility.COMMON || isReporter(m, issue) || isUnitMember(m, space)) {
            return true;
        }
        return issue.isSharedWithAdmins() && permissions.can(m, Action.ISSUE_TRIAGE, space);
    }

    public boolean canTriage(Membership m, Issue issue, @Nullable Space space) {
        if (!canSee(m, issue, space)) {
            return false;
        }
        if (issue.getVisibility() == Visibility.PRIVATE) {
            return isUnitMember(m, space)
                    || (issue.isSharedWithAdmins() && permissions.can(m, Action.ISSUE_TRIAGE, space));
        }
        return permissions.can(m, Action.ISSUE_TRIAGE, space);
    }

    /** Statuses this member may move the issue to right now. */
    public List<IssueStatus> allowedTransitions(Membership m, Issue issue, @Nullable Space space, boolean affected) {
        if (issue.isMerged() || !canSee(m, issue, space)) {
            return List.of();
        }
        IssueStatus current = issue.getStatus();
        if (canTriage(m, issue, space)) {
            return Arrays.stream(IssueStatus.values()).filter(current::canMoveTo).toList();
        }
        boolean reporter = isReporter(m, issue);
        if (current.isOpen()) {
            // "It fixed itself": the reporter may close their own issue.
            return reporter ? List.of(IssueStatus.RESOLVED) : List.of();
        }
        return reporter || affected ? List.of(IssueStatus.REPORTED) : List.of();
    }

    public boolean isReporter(Membership m, Issue issue) {
        return issue.getReporterUserId().equals(m.getUser().getId());
    }

    /** The space is inside the member's own unit. */
    public boolean isUnitMember(Membership m, @Nullable Space space) {
        Space unit = m.getUnitSpace();
        return unit != null && space != null && space.isWithin(unit);
    }
}
