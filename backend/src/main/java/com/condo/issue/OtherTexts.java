package com.condo.issue;

import java.text.Normalizer;
import java.util.Locale;

/**
 * Normalization of free "Other" texts so "Smells of gas!", "smells of gas" and " Smells  of gas." group together
 * (duplicate detection and the admin review of frequent texts). Accents are kept: "pão" ≠ "pao" in Portuguese.
 */
public final class OtherTexts {

    private OtherTexts() {
    }

    public static String normalize(String text) {
        if (text == null) {
            return null;
        }
        String s = Normalizer.normalize(text, Normalizer.Form.NFKC)
                .toLowerCase(Locale.ROOT)
                .replaceAll("\\s+", " ")
                .trim()
                .replaceAll("[\\p{IsPunctuation}\\s]+$", "")
                .replaceAll("^[\\p{IsPunctuation}\\s]+", "");
        return s.isEmpty() ? null : s;
    }
}
