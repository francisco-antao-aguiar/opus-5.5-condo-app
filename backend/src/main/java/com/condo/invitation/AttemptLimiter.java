package com.condo.invitation;

import com.condo.common.config.AppProperties;
import com.condo.common.error.ApiException;
import com.condo.common.error.ErrorCodes;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayDeque;
import java.util.Deque;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;

/**
 * Sliding-window limit on failed invite-code lookups per caller (user id, or IP when signed out).
 * In-memory: good enough for a single instance; a shared store (Redis) would replace it when scaling out.
 */
@Component
public class AttemptLimiter {

    private static final int MAX_TRACKED_CALLERS = 10_000;

    private final Map<String, Deque<Instant>> failures = new ConcurrentHashMap<>();
    private final int maxFailures;
    private final Duration window;
    private final Clock clock;

    public AttemptLimiter(AppProperties props, Clock clock) {
        this.maxFailures = props.invitations().maxFailedLookups();
        this.window = props.invitations().lookupWindow();
        this.clock = clock;
    }

    public void checkAllowed(String callerKey) {
        Deque<Instant> recent = failures.get(callerKey);
        if (recent == null) {
            return;
        }
        synchronized (recent) {
            prune(recent, clock.instant());
            if (recent.size() >= maxFailures) {
                throw new ApiException(HttpStatus.TOO_MANY_REQUESTS, ErrorCodes.TOO_MANY_ATTEMPTS,
                        "Too many wrong codes. Wait a few minutes and try again.");
            }
        }
    }

    public void recordFailure(String callerKey) {
        Instant now = clock.instant();
        if (failures.size() > MAX_TRACKED_CALLERS) {
            failures.values().removeIf(d -> {
                synchronized (d) {
                    prune(d, now);
                    return d.isEmpty();
                }
            });
        }
        Deque<Instant> recent = failures.computeIfAbsent(callerKey, k -> new ArrayDeque<>());
        synchronized (recent) {
            prune(recent, now);
            recent.addLast(now);
        }
    }

    private void prune(Deque<Instant> recent, Instant now) {
        Instant cutoff = now.minus(window);
        while (!recent.isEmpty() && !recent.peekFirst().isAfter(cutoff)) {
            recent.pollFirst();
        }
    }
}
