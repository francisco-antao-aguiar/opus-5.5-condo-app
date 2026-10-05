package com.condo.invitation;

public enum InvitationStatus {
    ACTIVE,
    /** Every allowed use has been consumed. */
    EXHAUSTED,
    EXPIRED,
    REVOKED,
    /** Within dates and uses, but the issuer can no longer invite. Computed by the service, not the entity. */
    INVALID
}
