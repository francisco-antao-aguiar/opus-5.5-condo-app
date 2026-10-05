package com.condo.notification;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.UUID;

/** An Expo push token of one device, owned by whoever registered it last. */
@Entity
@Table(name = "push_token")
public class PushToken {

    @Id
    private UUID id = UUID.randomUUID();

    @Column(name = "user_id", nullable = false)
    private UUID userId;

    @Column(nullable = false, length = 255)
    private String token;

    @Column(nullable = false, length = 16)
    private String platform;

    @Column(name = "device_name", length = 120)
    private String deviceName;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    @Column(name = "last_seen_at", nullable = false)
    private Instant lastSeenAt;

    protected PushToken() {
    }

    public PushToken(UUID userId, String token, String platform, String deviceName, Instant now) {
        this.userId = userId;
        this.token = token;
        this.platform = platform;
        this.deviceName = deviceName;
        this.createdAt = now;
        this.lastSeenAt = now;
    }

    /** Same device registering again, possibly signed in as someone else now. */
    public void refresh(UUID userId, String platform, String deviceName, Instant now) {
        this.userId = userId;
        this.platform = platform;
        this.deviceName = deviceName;
        this.lastSeenAt = now;
    }

    public UUID getUserId() {
        return userId;
    }

    public String getToken() {
        return token;
    }
}
