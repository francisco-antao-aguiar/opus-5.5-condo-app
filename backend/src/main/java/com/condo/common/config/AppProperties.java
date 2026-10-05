package com.condo.common.config;

import java.time.Duration;
import java.util.List;
import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "app")
public record AppProperties(Jwt jwt, Cors cors, Links links, Invitations invitations) {

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
}
