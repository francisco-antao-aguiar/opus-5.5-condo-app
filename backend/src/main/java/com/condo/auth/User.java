package com.condo.auth;

import com.condo.common.persistence.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;
import java.security.SecureRandom;
import java.util.Base64;
import org.hibernate.annotations.OptimisticLock;

@Entity
@Table(name = "app_user")
public class User extends BaseEntity {

    @Column(nullable = false, length = 320)
    private String email;

    @Column(name = "password_hash", nullable = false, length = 100)
    private String passwordHash;

    @Column(name = "display_name", nullable = false, length = 120)
    private String displayName;

    private static final SecureRandom RANDOM = new SecureRandom();

    /** Signed into calendar feed links; rotating it revokes every link handed out before. Created on first use. */
    @OptimisticLock(excluded = true)
    @Column(name = "calendar_key", length = 32)
    private String calendarKey;

    protected User() {
    }

    public User(String email, String passwordHash, String displayName) {
        this.email = normalizeEmail(email);
        this.passwordHash = passwordHash;
        this.displayName = displayName.trim();
    }

    public static String normalizeEmail(String email) {
        return email.trim().toLowerCase(java.util.Locale.ROOT);
    }

    public String getEmail() {
        return email;
    }

    public String getPasswordHash() {
        return passwordHash;
    }

    public String getDisplayName() {
        return displayName;
    }

    /** The current calendar key, creating one the first time. */
    public String calendarKey() {
        if (calendarKey == null) {
            rotateCalendarKey();
        }
        return calendarKey;
    }

    public void rotateCalendarKey() {
        byte[] bytes = new byte[16];
        RANDOM.nextBytes(bytes);
        calendarKey = Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    }

    /** Null until a calendar link was first asked for. */
    public String getCalendarKey() {
        return calendarKey;
    }
}
