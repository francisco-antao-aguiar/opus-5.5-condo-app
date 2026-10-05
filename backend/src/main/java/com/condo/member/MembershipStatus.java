package com.condo.member;

public enum MembershipStatus {
    ACTIVE,
    REVOKED,
    /** Reported when an ACTIVE membership is past {@code expiresAt}; a phase 2 job may also persist it. */
    EXPIRED
}
