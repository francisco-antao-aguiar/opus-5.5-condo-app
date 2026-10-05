package com.condo.auth;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.condo.support.IntegrationTest;
import com.fasterxml.jackson.databind.JsonNode;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;

class AuthControllerIT extends IntegrationTest {

    private final String email = "auth-" + UUID.randomUUID() + "@test.local";

    private JsonNode registerAndLogin() throws Exception {
        call(post("/api/auth/register"), null, Map.of("email", email, "password", "password123", "displayName", "A"))
                .andExpect(status().isCreated());
        return body(call(post("/api/auth/login"), null, Map.of("email", email.toUpperCase(), "password", "password123"))
                .andExpect(status().isOk()));
    }

    @Test
    void registerLoginAndAccessMe() throws Exception {
        JsonNode tokens = registerAndLogin();
        mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get("/api/me")
                        .header("Authorization", "Bearer " + tokens.get("accessToken").asText()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.user.email").value(email))
                .andExpect(jsonPath("$.memberships").isArray());
    }

    @Test
    void duplicateEmailIsRejected() throws Exception {
        registerAndLogin();
        call(post("/api/auth/register"), null, Map.of("email", email, "password", "password123", "displayName", "B"))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("EMAIL_TAKEN"));
    }

    @Test
    void wrongPasswordAndUnknownEmailLookTheSame() throws Exception {
        registerAndLogin();
        call(post("/api/auth/login"), null, Map.of("email", email, "password", "nope-nope"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("INVALID_CREDENTIALS"));
        call(post("/api/auth/login"), null, Map.of("email", "ghost@test.local", "password", "nope-nope"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("INVALID_CREDENTIALS"));
    }

    @Test
    void registerValidatesInput() throws Exception {
        call(post("/api/auth/register"), null, Map.of("email", "not-an-email", "password", "short", "displayName", ""))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION_FAILED"))
                .andExpect(jsonPath("$.errors.length()").value(3));
    }

    @Test
    void refreshRotatesAndReuseRevokesTheFamily() throws Exception {
        String first = registerAndLogin().get("refreshToken").asText();

        JsonNode second = body(call(post("/api/auth/refresh"), null, Map.of("refreshToken", first))
                .andExpect(status().isOk()));
        String secondToken = second.get("refreshToken").asText();

        // Replaying the rotated token is treated as theft: it fails and kills the newer token too.
        call(post("/api/auth/refresh"), null, Map.of("refreshToken", first))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("INVALID_REFRESH_TOKEN"));
        call(post("/api/auth/refresh"), null, Map.of("refreshToken", secondToken))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void logoutRevokesRefreshToken() throws Exception {
        String refresh = registerAndLogin().get("refreshToken").asText();
        call(post("/api/auth/logout"), null, Map.of("refreshToken", refresh)).andExpect(status().isNoContent());
        call(post("/api/auth/refresh"), null, Map.of("refreshToken", refresh)).andExpect(status().isUnauthorized());
    }

    @Test
    void protectedEndpointsRequireAToken() throws Exception {
        getAs(null, "/api/me")
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("UNAUTHENTICATED"));
        mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get("/api/me")
                        .header("Authorization", "Bearer not-a-jwt"))
                .andExpect(status().isUnauthorized());
    }
}
