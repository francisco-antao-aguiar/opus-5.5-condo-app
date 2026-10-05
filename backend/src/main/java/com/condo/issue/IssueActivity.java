package com.condo.issue;

import java.util.Set;
import java.util.UUID;

/**
 * Published (after commit) for every timeline entry. {@code audience} = everyone affected (reporter + "me too"),
 * minus the actor. Phase 5 turns these into push and in-app notifications; nothing in phase 4 depends on it.
 */
public record IssueActivity(UUID buildingId, UUID issueId, int issueNumber, IssueEventType type, IssueStatus status,
        UUID actorUserId, Set<UUID> audience) {
}
