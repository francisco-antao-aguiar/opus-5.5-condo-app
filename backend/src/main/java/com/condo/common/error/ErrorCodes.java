package com.condo.common.error;

/** Stable error codes returned in the {@code code} field of every problem response. */
public final class ErrorCodes {

    public static final String VALIDATION_FAILED = "VALIDATION_FAILED";
    public static final String MALFORMED_REQUEST = "MALFORMED_REQUEST";
    public static final String UNAUTHENTICATED = "UNAUTHENTICATED";
    public static final String INVALID_CREDENTIALS = "INVALID_CREDENTIALS";
    public static final String INVALID_REFRESH_TOKEN = "INVALID_REFRESH_TOKEN";
    public static final String EMAIL_TAKEN = "EMAIL_TAKEN";
    public static final String NOT_FOUND = "NOT_FOUND";
    public static final String NOT_A_MEMBER = "NOT_A_MEMBER";
    public static final String MEMBERSHIP_EXPIRED = "MEMBERSHIP_EXPIRED";
    public static final String PERMISSION_DENIED = "PERMISSION_DENIED";
    public static final String UNKNOWN_GOVERNANCE_MODE = "UNKNOWN_GOVERNANCE_MODE";
    public static final String UNKNOWN_ROLE = "UNKNOWN_ROLE";
    public static final String INVALID_HIERARCHY = "INVALID_HIERARCHY";
    public static final String INVALID_MOVE = "INVALID_MOVE";
    public static final String SPACE_HAS_CHILDREN = "SPACE_HAS_CHILDREN";
    public static final String STRUCTURE_NOT_EMPTY = "STRUCTURE_NOT_EMPTY";
    public static final String STRUCTURE_TOO_LARGE = "STRUCTURE_TOO_LARGE";
    public static final String INVALID_UNIT = "INVALID_UNIT";
    public static final String LAST_ADMIN = "LAST_ADMIN";
    public static final String ROLE_RANK_EXCEEDED = "ROLE_RANK_EXCEEDED";
    public static final String CONFLICT = "CONFLICT";
    public static final String INVITATION_NOT_FOUND = "INVITATION_NOT_FOUND";
    public static final String INVITATION_EXPIRED = "INVITATION_EXPIRED";
    public static final String INVITATION_REVOKED = "INVITATION_REVOKED";
    public static final String INVITATION_EXHAUSTED = "INVITATION_EXHAUSTED";
    public static final String INVITATION_INVALID = "INVITATION_INVALID";
    public static final String ALREADY_MEMBER = "ALREADY_MEMBER";
    public static final String TOO_MANY_ATTEMPTS = "TOO_MANY_ATTEMPTS";
    public static final String INTERNAL_ERROR = "INTERNAL_ERROR";

    private ErrorCodes() {
    }
}
