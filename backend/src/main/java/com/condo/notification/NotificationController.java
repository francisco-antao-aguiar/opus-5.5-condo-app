package com.condo.notification;

import com.condo.issue.dto.IssueDtos.Page;
import com.condo.notification.dto.NotificationDtos.NotificationDto;
import com.condo.notification.dto.NotificationDtos.RegisterPushTokenRequest;
import com.condo.notification.dto.NotificationDtos.UnreadCount;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@Validated
@RequestMapping("/api/me")
@Tag(name = "Notifications")
public class NotificationController {

    private final MyNotificationsService service;

    public NotificationController(MyNotificationsService service) {
        this.service = service;
    }

    @GetMapping("/notifications")
    public Page<NotificationDto> list(@RequestParam(defaultValue = "false") boolean unreadOnly,
            @RequestParam(defaultValue = "0") @Min(0) int page,
            @RequestParam(defaultValue = "20") @Min(1) @Max(100) int size) {
        return service.list(unreadOnly, page, size);
    }

    @GetMapping("/notifications/unread-count")
    public UnreadCount unreadCount() {
        return service.unreadCount();
    }

    @PostMapping("/notifications/{id}/read")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void markRead(@PathVariable UUID id) {
        service.markRead(id);
    }

    @PostMapping("/notifications/read-all")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void markAllRead() {
        service.markAllRead();
    }

    @PostMapping("/push-tokens")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @Operation(summary = "Register this device's Expo push token (moves it to the current user)")
    public void registerPushToken(@Valid @RequestBody RegisterPushTokenRequest req) {
        service.registerPushToken(req);
    }

    @DeleteMapping("/push-tokens")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @Operation(summary = "Stop pushes to this device (call on logout)")
    public void unregisterPushToken(@RequestParam String token) {
        service.unregisterPushToken(token);
    }
}
