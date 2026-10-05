package com.condo.notification;

import com.condo.issue.IssueActivity;
import java.util.concurrent.Executor;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.stereotype.Component;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;

/** Hands committed issue activity to {@link NotificationService} on the notification executor. */
@Component
class NotificationDispatcher {

    private static final Logger log = LoggerFactory.getLogger(NotificationDispatcher.class);

    private final NotificationService notificationService;
    private final Executor executor;

    NotificationDispatcher(NotificationService notificationService,
            @Qualifier("notificationExecutor") Executor executor) {
        this.notificationService = notificationService;
        this.executor = executor;
    }

    /** Only after commit: nobody is told about a change that was rolled back. */
    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    void on(IssueActivity activity) {
        executor.execute(() -> {
            try {
                notificationService.deliver(activity);
            } catch (RuntimeException e) {
                log.error("Notifying about issue #{} {} failed", activity.issueNumber(), activity.type(), e);
            }
        });
    }
}
