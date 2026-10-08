package com.condo.issue;

import java.time.Instant;
import java.util.UUID;

/**
 * A ticked checklist item of a scheduled task, by its position in the task's checklist snapshot. {@code at} is
 * kept as ISO-8601 text so the JSON column needs no Java-time module.
 */
public record ChecklistTick(int index, UUID by, String at) {

    public Instant atInstant() {
        return Instant.parse(at);
    }
}
