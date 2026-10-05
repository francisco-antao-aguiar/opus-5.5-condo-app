package com.condo.common.security;

import com.condo.common.error.ApiException;
import com.condo.common.error.ErrorCodes;
import java.util.UUID;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;

/** The authenticated user id, taken from the JWT subject. */
public final class CurrentUser {

    private CurrentUser() {
    }

    public static UUID id() {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth instanceof JwtAuthenticationToken token) {
            return UUID.fromString(token.getName());
        }
        throw ApiException.unauthorized(ErrorCodes.UNAUTHENTICATED, "Authentication required.");
    }
}
