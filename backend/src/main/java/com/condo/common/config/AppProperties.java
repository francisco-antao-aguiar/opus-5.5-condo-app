package com.condo.common.config;

import java.time.Duration;
import java.util.List;
import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "app")
public record AppProperties(Jwt jwt, Cors cors, Links links, Invitations invitations, Issues issues,
        Notifications notifications, Push push, Buildings buildings, Bookings bookings) {

    public record Jwt(String secret, String issuer, Duration accessTokenTtl, Duration refreshTokenTtl) {
    }

    public record Cors(List<String> allowedOrigins) {
    }

    /** Public URLs embedded in invitations (and, in phase 5, QR codes). */
    public record Links(String webBaseUrl, String appScheme) {
    }

    /** Brute-force protection for invite-code lookups: at most N failures per caller per window. */
    public record Invitations(int maxFailedLookups, Duration lookupWindow) {
    }

    /** {@code stuckAfter}: how long an issue may sit in REPORTED before the dashboard flags it. */
    public record Issues(Duration stuckAfter) {
    }

    /** {@code async=false} delivers on the publishing thread (tests). */
    public record Notifications(boolean async) {
    }

    /** Expo push. Disabled → pushes are logged instead of sent. */
    public record Push(boolean enabled, String expoUrl, String accessToken) {
    }

    /** Defaults for new buildings (IANA zone id, ISO 4217 code). */
    public record Buildings(String defaultTimeZone, String defaultCurrency) {
    }

    /** {@code reviewReminderAfter}: when admins are reminded about a request nobody has reviewed. */
    public record Bookings(Duration reviewReminderAfter) {
    }
}
