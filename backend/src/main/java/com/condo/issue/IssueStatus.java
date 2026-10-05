package com.condo.issue;

/** REPORTED → ACKNOWLEDGED → IN_PROGRESS → RESOLVED; forward skips allowed; RESOLVED reopens to REPORTED. */
public enum IssueStatus {
    REPORTED,
    ACKNOWLEDGED,
    IN_PROGRESS,
    RESOLVED;

    public boolean isOpen() {
        return this != RESOLVED;
    }

    public boolean canMoveTo(IssueStatus target) {
        if (this == RESOLVED) {
            return target == REPORTED;
        }
        return target.ordinal() > ordinal();
    }
}
