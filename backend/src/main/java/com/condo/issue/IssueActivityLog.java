package com.condo.issue;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;

/** Placeholder consumer until phase 5 adds push and in-app notifications on the same event. */
@Component
class IssueActivityLog {

    private static final Logger log = LoggerFactory.getLogger(IssueActivityLog.class);

    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    void on(IssueActivity activity) {
        log.debug("Issue #{} {} ({}) by {} → notify {}", activity.issueNumber(), activity.type(), activity.status(),
                activity.actorUserId(), activity.audience());
    }
}
