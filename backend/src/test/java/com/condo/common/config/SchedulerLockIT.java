package com.condo.common.config;

import static org.assertj.core.api.Assertions.assertThat;

import com.condo.booking.BookingJob;
import com.condo.maintenance.MaintenanceJob;
import com.condo.member.MembershipExpiryJob;
import com.condo.support.IntegrationTest;
import java.time.Duration;
import java.time.Instant;
import java.util.Optional;
import net.javacrumbs.shedlock.core.LockConfiguration;
import net.javacrumbs.shedlock.core.LockProvider;
import net.javacrumbs.shedlock.core.SimpleLock;
import org.junit.jupiter.api.Test;
import org.springframework.aop.support.AopUtils;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;

class SchedulerLockIT extends IntegrationTest {

    @Autowired
    BookingJob bookingJob;
    @Autowired
    MaintenanceJob maintenanceJob;
    @Autowired
    MembershipExpiryJob membershipExpiryJob;
    @Autowired
    LockProvider lockProvider;
    @Autowired
    JdbcTemplate jdbc;

    @Test
    void scheduledTicksTakeTheJobLockSoOtherNodesSkipThem() {
        assertThat(AopUtils.isAopProxy(bookingJob)).isTrue();
        assertThat(AopUtils.isAopProxy(maintenanceJob)).isTrue();
        assertThat(AopUtils.isAopProxy(membershipExpiryJob)).isTrue();

        bookingJob.scheduled();

        // The tick is over but the lock is held for its 30 s minimum, so a second node can't run it right away.
        Instant lockedUntil = jdbc.queryForObject("select lock_until from shedlock where name = 'booking-job'",
                java.sql.Timestamp.class).toInstant();
        assertThat(lockedUntil).isAfter(Instant.now().plusSeconds(20));
        Optional<SimpleLock> otherNode = lockProvider.lock(new LockConfiguration(Instant.now(), "booking-job",
                Duration.ofMinutes(9), Duration.ZERO));
        assertThat(otherNode).isEmpty();

        // Other jobs have their own lock.
        Optional<SimpleLock> maintenance = lockProvider.lock(new LockConfiguration(Instant.now(),
                "maintenance-job-probe", Duration.ofMinutes(1), Duration.ZERO));
        assertThat(maintenance).isPresent();
        maintenance.get().unlock();
    }
}
