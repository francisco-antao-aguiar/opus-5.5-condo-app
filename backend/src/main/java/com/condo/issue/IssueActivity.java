package com.condo.issue;

import java.util.Set;
import java.util.UUID;

/**
 * Published (after commit) for every timeline entry. {@code audience} = everyone affected (reporter + "me too"),
 * minus the actor. {@code NotificationDispatcher} turns them into in-app and push notifications.
 */
public record IssueActivity(UUID buildingId, UUID issueId, int issueNumber, UUID eventId, IssueEventType type,
        IssueStatus status, UUID actorUserId, Set<UUID> audience) {
}
