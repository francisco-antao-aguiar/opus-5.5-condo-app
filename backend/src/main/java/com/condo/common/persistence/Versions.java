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
        if (expected != null && !Objects.equals(expected, entity.getVersion())) {
            throw ApiException.conflict(ErrorCodes.CONFLICT,
                    "Someone else changed this in the meantime. Reload and try again.");
        }
    }
}
