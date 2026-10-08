package com.condo.booking;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import net.javacrumbs.shedlock.spring.annotation.SchedulerLock;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * Every 10 minutes: remind admins about requests waiting too long, expire unreviewed requests whose time came,
 * and cancel future bookings of members whose access ended. Idempotent, and locked to one node per tick.
 */
@Component
public class BookingJob {

    private static final Logger log = LoggerFactory.getLogger(BookingJob.class);

    private final BookingService bookings;

    public BookingJob(BookingService bookings) {
        this.bookings = bookings;
    }

    /** Every 10 minutes, on one node only. */
    @Scheduled(cron = "${app.bookings.jobs-cron}")
    @SchedulerLock(name = "booking-job", lockAtMostFor = "PT9M", lockAtLeastFor = "PT30S")
    public void scheduled() {
        run();
    }

    public void run() {
        int reminded = bookings.remindReviewers();
        int expired = bookings.expireUnreviewed();
        int cancelled = bookings.cancelForInactiveMembers();
        if (reminded + expired + cancelled > 0) {
            log.info("Bookings: {} reminder(s), {} expired request(s), {} cancelled for ended memberships",
                    reminded, expired, cancelled);
        }
    }
}
