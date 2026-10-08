package com.condo.member;

import java.time.Clock;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import net.javacrumbs.shedlock.spring.annotation.SchedulerLock;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/**
 * Persists EXPIRED status for memberships past their end date, so stored data matches reality for lists and
 * reports. Not needed for security: {@link Membership#isActiveAt} already denies access from the exact instant.
 */
@Component
public class MembershipExpiryJob {

    private static final Logger log = LoggerFactory.getLogger(MembershipExpiryJob.class);

    private final MembershipRepository memberships;
    private final Clock clock;

    public MembershipExpiryJob(MembershipRepository memberships, Clock clock) {
        this.memberships = memberships;
        this.clock = clock;
    }

    /** Every 15 minutes, on one node only. */
    @Scheduled(cron = "${app.memberships.expiry-cron}")
    @SchedulerLock(name = "membership-expiry-job", lockAtMostFor = "PT14M", lockAtLeastFor = "PT30S")
    @Transactional
    public void scheduled() {
        expireMemberships();
    }

    @Transactional
    public int expireMemberships() {
        int expired = memberships.markExpired(clock.instant());
        if (expired > 0) {
            log.info("Marked {} membership(s) as expired", expired);
        }
        return expired;
    }
}
