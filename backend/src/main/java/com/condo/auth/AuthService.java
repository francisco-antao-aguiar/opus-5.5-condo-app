package com.condo.auth;

import com.condo.auth.dto.AuthDtos.AuthTokens;
import com.condo.auth.dto.AuthDtos.LoginRequest;
import com.condo.auth.dto.AuthDtos.RegisterRequest;
import com.condo.common.config.AppProperties;
import com.condo.common.error.ApiException;
import com.condo.common.error.ErrorCodes;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.time.Clock;
import java.time.Instant;
import java.util.Base64;
import java.util.HexFormat;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class AuthService {

    private static final Logger log = LoggerFactory.getLogger(AuthService.class);
    private static final SecureRandom RANDOM = new SecureRandom();

    private final UserRepository users;
    private final RefreshTokenRepository refreshTokens;
    private final PasswordEncoder passwordEncoder;
    private final JwtService jwtService;
    private final AppProperties props;
    private final Clock clock;
    /** Compared against when the email is unknown, so login timing doesn't reveal which emails exist. */
    private final String dummyHash;

    public AuthService(UserRepository users, RefreshTokenRepository refreshTokens, PasswordEncoder passwordEncoder,
            JwtService jwtService, AppProperties props, Clock clock) {
        this.users = users;
        this.refreshTokens = refreshTokens;
        this.passwordEncoder = passwordEncoder;
        this.jwtService = jwtService;
        this.props = props;
        this.clock = clock;
        this.dummyHash = passwordEncoder.encode(UUID.randomUUID().toString());
    }

    @Transactional
    public AuthTokens register(RegisterRequest req) {
        String email = User.normalizeEmail(req.email());
        if (users.existsByEmail(email)) {
            throw ApiException.conflict(ErrorCodes.EMAIL_TAKEN, "An account with this email already exists.");
        }
        User user = users.save(new User(email, passwordEncoder.encode(req.password()), req.displayName()));
        return issue(user, UUID.randomUUID());
    }

    @Transactional
    public AuthTokens login(LoginRequest req) {
        User user = users.findByEmail(User.normalizeEmail(req.email())).orElse(null);
        String hash = user != null ? user.getPasswordHash() : dummyHash;
        boolean matches = passwordEncoder.matches(req.password(), hash);
        if (user == null || !matches) {
            throw ApiException.unauthorized(ErrorCodes.INVALID_CREDENTIALS, "Wrong email or password.");
        }
        return issue(user, UUID.randomUUID());
    }

    /** Rotates the refresh token. Presenting an already-rotated token revokes the whole family (theft signal). */
    @Transactional(noRollbackFor = ApiException.class)
    public AuthTokens refresh(String rawToken) {
        Instant now = clock.instant();
        RefreshToken token = refreshTokens.findByTokenHash(hash(rawToken)).orElseThrow(AuthService::invalidRefresh);
        if (token.isRevoked()) {
            log.warn("Refresh token reuse detected for user {}; revoking family {}", token.getUserId(),
                    token.getFamilyId());
            refreshTokens.revokeFamily(token.getFamilyId(), now);
            throw invalidRefresh();
        }
        if (token.isExpiredAt(now)) {
            throw invalidRefresh();
        }
        token.revoke(now);
        User user = users.findById(token.getUserId()).orElseThrow(AuthService::invalidRefresh);
        return issue(user, token.getFamilyId());
    }

    @Transactional
    public void logout(String rawToken) {
        refreshTokens.findByTokenHash(hash(rawToken))
                .ifPresent(t -> refreshTokens.revokeFamily(t.getFamilyId(), clock.instant()));
    }

    private AuthTokens issue(User user, UUID familyId) {
        Instant now = clock.instant();
        Instant accessExpires = now.plus(props.jwt().accessTokenTtl());
        Instant refreshExpires = now.plus(props.jwt().refreshTokenTtl());
        String access = jwtService.createAccessToken(user, now, accessExpires);

        byte[] bytes = new byte[32];
        RANDOM.nextBytes(bytes);
        String refresh = Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
        refreshTokens.save(new RefreshToken(user.getId(), familyId, hash(refresh), refreshExpires));

        return new AuthTokens(access, refresh, "Bearer", accessExpires, refreshExpires);
    }

    static String hash(String raw) {
        try {
            byte[] digest = MessageDigest.getInstance("SHA-256").digest(raw.getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(digest);
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException(e);
        }
    }

    private static ApiException invalidRefresh() {
        return ApiException.unauthorized(ErrorCodes.INVALID_REFRESH_TOKEN, "Session expired. Please sign in again.");
    }
}
