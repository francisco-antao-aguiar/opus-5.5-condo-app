package com.condo.notification;

import com.condo.building.Building;
import com.condo.building.BuildingRepository;
import com.condo.common.error.ApiException;
import com.condo.common.error.ErrorCodes;
import com.condo.common.security.CurrentUser;
import com.condo.issue.IssueViewed;
import com.condo.issue.dto.IssueDtos.Page;
import com.condo.notification.dto.NotificationDtos.NotificationDto;
import com.condo.notification.dto.NotificationDtos.RegisterPushTokenRequest;
import com.condo.notification.dto.NotificationDtos.UnreadCount;
import java.time.Clock;
import java.util.Map;
import java.util.UUID;
import java.util.regex.Pattern;
import java.util.stream.Collectors;
import org.springframework.context.event.EventListener;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** The signed-in user's own notification list and push devices. */
@Service
@Transactional
public class MyNotificationsService {

    /** Expo push tokens look like ExponentPushToken[xxxxxxxx] (older: ExpoPushToken[…]). */
    private static final Pattern EXPO_TOKEN = Pattern.compile("^Expo(nent)?PushToken\\[[A-Za-z0-9_-]+]$");

    private final NotificationRepository notifications;
    private final PushTokenRepository pushTokens;
    private final BuildingRepository buildings;
    private final Clock clock;

    public MyNotificationsService(NotificationRepository notifications, PushTokenRepository pushTokens,
            BuildingRepository buildings, Clock clock) {
        this.notifications = notifications;
        this.pushTokens = pushTokens;
        this.buildings = buildings;
        this.clock = clock;
    }

    @Transactional(readOnly = true)
    public Page<NotificationDto> list(boolean unreadOnly, int page, int size) {
        UUID me = CurrentUser.id();
        PageRequest pageable = PageRequest.of(page, size);
        org.springframework.data.domain.Page<Notification> result = unreadOnly
                ? notifications.findByUserIdAndReadAtIsNullOrderByCreatedAtDesc(me, pageable)
                : notifications.findByUserIdOrderByCreatedAtDesc(me, pageable);
        Map<UUID, String> names = buildings.findAllById(result.stream().map(Notification::getBuildingId).toList())
                .stream().collect(Collectors.toMap(Building::getId, Building::getName));
        return new Page<>(result.stream()
                .map(n -> new NotificationDto(n.getId(), n.getType(), n.getBuildingId(),
                        names.getOrDefault(n.getBuildingId(), ""), n.getIssueId(), n.getTitle(), n.getBody(),
                        n.getLink(), n.getReadAt() != null, n.getCreatedAt()))
                .toList(), page, size, result.getTotalElements());
    }

    @Transactional(readOnly = true)
    public UnreadCount unreadCount() {
        return new UnreadCount(notifications.countByUserIdAndReadAtIsNull(CurrentUser.id()));
    }

    public void markRead(UUID id) {
        notifications.findByIdAndUserId(id, CurrentUser.id())
                .orElseThrow(() -> ApiException.notFound("Notification"))
                .markRead(clock.instant());
    }

    public void markAllRead() {
        notifications.markAllRead(CurrentUser.id(), clock.instant());
    }

    /** Opening an issue (from anywhere: list, link, push) clears its notifications from the bell. */
    @EventListener
    void onIssueViewed(IssueViewed viewed) {
        notifications.markIssueRead(viewed.userId(), viewed.issueId(), clock.instant());
    }

    /** Upsert by token: a device moves to whoever signs in on it, so pushes never reach a previous user. */
    public void registerPushToken(RegisterPushTokenRequest req) {
        String token = req.token().trim();
        if (!EXPO_TOKEN.matcher(token).matches()) {
            throw ApiException.badRequest(ErrorCodes.INVALID_PUSH_TOKEN, "That isn't an Expo push token.");
        }
        UUID me = CurrentUser.id();
        pushTokens.findByToken(token).ifPresentOrElse(
                t -> t.refresh(me, req.platform(), req.deviceName(), clock.instant()),
                () -> pushTokens.save(new PushToken(me, token, req.platform(), req.deviceName(), clock.instant())));
    }

    /** Only removes the caller's own registration of that token. */
    public void unregisterPushToken(String token) {
        pushTokens.deleteByTokenAndUserId(token.trim(), CurrentUser.id());
    }
}
