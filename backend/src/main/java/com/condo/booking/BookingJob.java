package com.condo.booking;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * Every 10 minutes: remind admins about requests waiting too long, expire unreviewed requests whose time came,
 * and cancel future bookings of members whose access ended. Idempotent; single-node assumption as other jobs.
 */
@Component
public class BookingJob {

    private static final Logger log = LoggerFactory.getLogger(BookingJob.class);

    private final BookingService bookings;

    public BookingJob(BookingService bookings) {
        this.bookings = bookings;
    }

    @Scheduled(cron = "${app.bookings.jobs-cron}")
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
