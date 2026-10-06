package com.condo.common.persistence;

import com.condo.common.error.ApiException;
import com.condo.common.error.ErrorCodes;
import java.util.Objects;

/**
 * Client-side optimistic locking: the client echoes the {@code version} it last saw. {@code @Version} already
 * protects concurrent transactions; this also catches edits made between the client's read and its write.
 */
public final class Versions {

    private Versions() {
    }

    /** No-op when the client didn't send a version (older clients keep last-write-wins). */
    public static void requireCurrent(Long expected, BaseEntity entity) {
        requireCurrent(expected, entity.getVersion());
    }

    /** For entities with their own key that don't extend BaseEntity. A new (unsaved) entity has no version. */
    public static void requireCurrent(Long expected, Long current) {
        if (expected != null && current != null && !Objects.equals(expected, current)) {
            throw ApiException.conflict(ErrorCodes.CONFLICT,
                    "Someone else changed this in the meantime. Reload and try again.");
        }
    }
}
