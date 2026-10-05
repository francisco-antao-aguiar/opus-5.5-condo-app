package com.condo.invitation;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.condo.building.Building;
import java.time.Duration;
import java.time.Instant;
import org.junit.jupiter.api.Test;

class InvitationTest {

    private static final Instant NOW = Instant.parse("2026-10-05T12:00:00Z");
    private final Building building = new Building("B", null, "MANAGED");

    private Invitation invitation(int maxUses, Instant expiresAt) {
        return new Invitation(building, "ABCDEFGH", "TENANT", null, null, maxUses, expiresAt, null, null);
    }

    @Test
    void singleUseInvitationIsExhaustedAfterOneUse() {
        Invitation i = invitation(1, NOW.plus(Duration.ofDays(1)));
        assertThat(i.statusAt(NOW)).isEqualTo(InvitationStatus.ACTIVE);
        i.consume(NOW);
        assertThat(i.getUseCount()).isEqualTo(1);
        assertThat(i.statusAt(NOW)).isEqualTo(InvitationStatus.EXHAUSTED);
        assertThatThrownBy(() -> i.consume(NOW)).isInstanceOf(IllegalStateException.class);
    }

    @Test
    void multiUseInvitationCountsDown() {
        Invitation i = invitation(3, NOW.plus(Duration.ofDays(1)));
        i.consume(NOW);
        i.consume(NOW);
        assertThat(i.statusAt(NOW)).isEqualTo(InvitationStatus.ACTIVE);
        i.consume(NOW);
        assertThat(i.statusAt(NOW)).isEqualTo(InvitationStatus.EXHAUSTED);
    }

    @Test
    void expiresExactlyAtExpiresAt() {
        Instant expiry = NOW.plus(Duration.ofHours(1));
        Invitation i = invitation(1, expiry);
        assertThat(i.statusAt(expiry.minusMillis(1))).isEqualTo(InvitationStatus.ACTIVE);
        assertThat(i.statusAt(expiry)).isEqualTo(InvitationStatus.EXPIRED);
        assertThatThrownBy(() -> i.consume(expiry)).isInstanceOf(IllegalStateException.class);
    }

    @Test
    void mostFinalReasonWins() {
        Invitation i = invitation(1, NOW.plus(Duration.ofDays(1)));
        i.consume(NOW);
        Instant later = NOW.plus(Duration.ofDays(2));
        assertThat(i.statusAt(later)).isEqualTo(InvitationStatus.EXPIRED); // expired beats exhausted
        i.revoke(NOW);
        assertThat(i.statusAt(later)).isEqualTo(InvitationStatus.REVOKED); // revoked beats everything
    }

    @Test
    void revokeIsIdempotentAndKeepsFirstTimestamp() {
        Invitation i = invitation(1, NOW.plus(Duration.ofDays(1)));
        i.revoke(NOW);
        i.revoke(NOW.plusSeconds(60));
        assertThat(i.getRevokedAt()).isEqualTo(NOW);
    }

    @Test
    void membershipEndIsEitherFixedOrRelativeToAcceptance() {
        Instant leaseEnd = NOW.plus(Duration.ofDays(200));
        Invitation fixed = new Invitation(building, "ABCDEFGH", "TENANT", null, null, 1,
                NOW.plus(Duration.ofDays(7)), leaseEnd, null, null);
        Invitation guest = new Invitation(building, "ABCDEFGJ", "TENANT", null, null, 1,
                NOW.plus(Duration.ofDays(7)), null, 7, null);
        Invitation open = invitation(1, NOW.plus(Duration.ofDays(7)));

        Instant acceptedAt = NOW.plus(Duration.ofDays(3));
        assertThat(fixed.membershipExpiryFor(acceptedAt)).isEqualTo(leaseEnd);
        assertThat(guest.membershipExpiryFor(acceptedAt)).isEqualTo(acceptedAt.plus(Duration.ofDays(7)));
        assertThat(open.membershipExpiryFor(acceptedAt)).isNull();
    }

    @Test
    void rejectsBothEndDateAndDuration() {
        assertThatThrownBy(() -> new Invitation(building, "ABCDEFGH", "TENANT", null, null, 1,
                NOW.plus(Duration.ofDays(7)), NOW.plus(Duration.ofDays(30)), 7, null))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> new Invitation(building, "ABCDEFGH", "TENANT", null, null, 1,
                NOW.plus(Duration.ofDays(7)), null, 0, null))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void rejectsNonPositiveMaxUses() {
        assertThatThrownBy(() -> invitation(0, NOW.plus(Duration.ofDays(1))))
                .isInstanceOf(IllegalArgumentException.class);
    }
}
