package com.condo.common.storage;

import java.nio.charset.StandardCharsets;
import java.security.InvalidKeyException;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.Base64;
import javax.crypto.Mac;
import javax.crypto.SecretKey;
import org.springframework.stereotype.Component;

/**
 * Short-lived HMAC-signed links for files, so {@code <img src>} works without an Authorization header.
 * Signature covers resource id + expiry; the key is the app's JWT signing key.
 */
@Component
public class SignedUrls {

    public static final Duration TTL = Duration.ofHours(1);

    private final SecretKey key;
    private final Clock clock;

    public SignedUrls(SecretKey jwtSigningKey, Clock clock) {
        this.key = jwtSigningKey;
        this.clock = clock;
    }

    public record Signature(long expiresAtEpochSeconds, String sig) {

        public Instant expiresAt() {
            return Instant.ofEpochSecond(expiresAtEpochSeconds);
        }
    }

    public Signature sign(String resourceId) {
        return sign(resourceId, TTL);
    }

    /** Longer-lived links, e.g. a calendar subscription that calendar apps poll for months. */
    public Signature sign(String resourceId, Duration ttl) {
        long exp = clock.instant().plus(ttl).getEpochSecond();
        return new Signature(exp, hmac(resourceId + ":" + exp));
    }

    public boolean verify(String resourceId, long exp, String sig) {
        if (sig == null || Instant.ofEpochSecond(exp).isBefore(clock.instant())) {
            return false;
        }
        byte[] expected = hmac(resourceId + ":" + exp).getBytes(StandardCharsets.US_ASCII);
        return MessageDigest.isEqual(expected, sig.getBytes(StandardCharsets.US_ASCII));
    }

    private String hmac(String payload) {
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(key);
            byte[] raw = mac.doFinal(payload.getBytes(StandardCharsets.UTF_8));
            return Base64.getUrlEncoder().withoutPadding().encodeToString(raw);
        } catch (NoSuchAlgorithmException | InvalidKeyException e) {
            throw new IllegalStateException(e);
        }
    }
}
