package com.condo.invitation;

import java.security.SecureRandom;
import java.util.Locale;

/**
 * Human-friendly invite codes: 8 symbols from an alphabet without look-alikes (no 0/O, 1/I/L), shown as
 * {@code ABCD-EFGH}. 31^8 ≈ 8.5·10^11 combinations (~40 bits); lookups are rate-limited, so guessing is
 * impractical, and every code also expires.
 */
public final class InviteCodes {

    static final String ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
    static final int LENGTH = 8;
    private static final SecureRandom RANDOM = new SecureRandom();

    private InviteCodes() {
    }

    public static String generate() {
        StringBuilder sb = new StringBuilder(LENGTH);
        for (int i = 0; i < LENGTH; i++) {
            sb.append(ALPHABET.charAt(RANDOM.nextInt(ALPHABET.length())));
        }
        return sb.toString();
    }

    /** "abcd-efgh " → "ABCDEFGH". Anything that can't be a code normalizes to something that won't match. */
    public static String normalize(String input) {
        return input == null ? "" : input.toUpperCase(Locale.ROOT).replaceAll("[^A-Z0-9]", "");
    }

    public static String format(String code) {
        return code.length() == LENGTH ? code.substring(0, 4) + "-" + code.substring(4) : code;
    }
}
