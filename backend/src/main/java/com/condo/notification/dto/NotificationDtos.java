package com.condo.notification.dto;

import com.condo.notification.NotificationType;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import java.time.Instant;
import java.util.UUID;

public final class NotificationDtos {

    private NotificationDtos() {
    }

    public record NotificationDto(UUID id, NotificationType type, UUID buildingId, String buildingName, UUID issueId,
            String title, String body, String link, boolean read, Instant createdAt) {
    }

    public record UnreadCount(long unread) {
    }

    public record RegisterPushTokenRequest(
            @NotBlank @Size(max = 255) String token,
            @NotBlank @Pattern(regexp = "ios|android|web") String platform,
            @Size(max = 120) String deviceName) {
    }
}
