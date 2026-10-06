package com.condo.issue;

import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import java.util.Optional;

/**
 * Identifies uploads by their magic bytes, not by the client-supplied Content-Type or file name, so a renamed
 * script can't be stored and served back as an "image".
 */
public final class ImageTypes {

    public record ImageType(String contentType, String extension) {
    }

    public static final int HEADER_BYTES = 16;

    private ImageTypes() {
    }

    public static Optional<ImageType> sniff(byte[] h) {
        if (h.length >= 3 && (h[0] & 0xFF) == 0xFF && (h[1] & 0xFF) == 0xD8 && (h[2] & 0xFF) == 0xFF) {
            return Optional.of(new ImageType("image/jpeg", "jpg"));
        }
        if (h.length >= 8 && Arrays.equals(Arrays.copyOf(h, 8),
                new byte[] {(byte) 0x89, 'P', 'N', 'G', '\r', '\n', 0x1A, '\n'})) {
            return Optional.of(new ImageType("image/png", "png"));
        }
        if (h.length >= 12 && ascii(h, 0, 4).equals("RIFF") && ascii(h, 8, 4).equals("WEBP")) {
            return Optional.of(new ImageType("image/webp", "webp"));
        }
        // ISO-BMFF: size(4) "ftyp" brand(4). iPhone photos are HEIC.
        if (h.length >= 12 && ascii(h, 4, 4).equals("ftyp")) {
            String brand = ascii(h, 8, 4);
            if (brand.startsWith("hei") || brand.startsWith("hev") || brand.equals("mif1") || brand.equals("msf1")) {
                return Optional.of(new ImageType("image/heic", "heic"));
            }
        }
        return Optional.empty();
    }

    private static String ascii(byte[] h, int from, int len) {
        return new String(h, from, len, StandardCharsets.US_ASCII);
    }
}
