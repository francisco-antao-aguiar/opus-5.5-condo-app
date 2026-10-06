package com.condo.notification;

import java.util.Set;
import java.util.UUID;

/**
 * "Tell these people this." Publish it as an application event from any transaction; {@link NotificationDispatcher}
 * delivers it after commit (in-app + push). Issue activity is translated into the same request.
 *
 * @param issueId the related issue, if any (kept so the notification can be cleared when the issue is viewed)
 * @param link    app-relative route, the same on web and mobile
 */
public record NotificationRequest(UUID buildingId, Set<UUID> recipients, NotificationType type, UUID issueId,
        String title, String body, String link) {
}
