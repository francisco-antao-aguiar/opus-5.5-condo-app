package com.condo.maintenance;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

public final class MaintenanceDtos {

    private MaintenanceDtos() {
    }

    public record MaintenancePlanDto(UUID id, UUID buildingId, UUID assetId, String assetName, UUID spaceId,
            String locationLabel, String title, String description, List<String> checklist, Recurrence recurrence,
            String recurrenceText, LocalDate startsOn, LocalDate endsOn, int leadDays, String assigneeNote,
            boolean active, MaintenancePlan.PausedReason pausedReason, LocalDate nextDueOn, UUID openTaskId,
            Instant createdAt, long version) {
    }

    public record SaveMaintenancePlanRequest(
            UUID assetId,
            UUID spaceId,
            @NotBlank @Size(max = 160) String title,
            @Size(max = 2000) String description,
            @Size(max = 30) List<@NotBlank @Size(max = 200) String> checklist,
            @NotNull @Valid Recurrence recurrence,
            @NotNull LocalDate startsOn,
            LocalDate endsOn,
            @Min(0) @Max(90) Integer leadDays,
            @Size(max = 300) String assigneeNote,
            Long version) {
    }

    public record RecurrencePreviewRequest(@NotNull Recurrence recurrence, @NotNull LocalDate startsOn,
            LocalDate endsOn, @Min(1) @Max(24) Integer count) {
    }

    public record RecurrencePreview(List<LocalDate> dates, String recurrenceText) {
    }
}
