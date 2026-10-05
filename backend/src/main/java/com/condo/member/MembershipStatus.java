package com.condo.member;

public enum MembershipStatus {
    ACTIVE,
    REVOKED,
    /** Past {@code expiresAt}. Computed at check time, and persisted by {@code MembershipExpiryJob}. */
    EXPIRED
}
