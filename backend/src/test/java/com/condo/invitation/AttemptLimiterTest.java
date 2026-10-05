package com.condo.invitation;

import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.condo.common.config.AppProperties;
import com.condo.common.error.ApiException;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZoneOffset;
import org.junit.jupiter.api.Test;

class AttemptLimiterTest {

    /** A clock the test can move forward. */
    static final class MutableClock extends Clock {
        Instant now = Instant.parse("2026-10-05T12:00:00Z");

        @Override
        public ZoneId getZone() {
            return ZoneOffset.UTC;
        }

        @Override
        public Clock withZone(ZoneId zone) {
            return this;
        }

        @Override
        public Instant instant() {
            return now;
        }
    }

    private final MutableClock clock = new MutableClock();
    private final AttemptLimiter limiter = new AttemptLimiter(
            new AppProperties(null, null, null, new AppProperties.Invitations(3, Duration.ofMinutes(15)), null), clock);

    @Test
    void blocksAfterTooManyFailuresWithinTheWindow() {
        for (int i = 0; i < 3; i++) {
            assertThatCode(() -> limiter.checkAllowed("ip:1")).doesNotThrowAnyException();
            limiter.recordFailure("ip:1");
        }
        assertThatThrownBy(() -> limiter.checkAllowed("ip:1"))
                .isInstanceOf(ApiException.class)
                .hasFieldOrPropertyWithValue("code", "TOO_MANY_ATTEMPTS");
    }

    @Test
    void callersAreIndependent() {
        for (int i = 0; i < 3; i++) {
            limiter.recordFailure("ip:1");
        }
        assertThatCode(() -> limiter.checkAllowed("ip:2")).doesNotThrowAnyException();
    }

    @Test
    void failuresAgeOutOfTheWindow() {
        for (int i = 0; i < 3; i++) {
            limiter.recordFailure("user:x");
        }
        clock.now = clock.now.plus(Duration.ofMinutes(15)).plusSeconds(1);
        assertThatCode(() -> limiter.checkAllowed("user:x")).doesNotThrowAnyException();
    }
}
