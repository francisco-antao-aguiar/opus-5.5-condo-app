package com.condo.booking;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;

public final class BookingDtos {

    private BookingDtos() {
    }

    public record BookingPolicyDto(UUID spaceId, String spaceName, String locationLabel, boolean enabled,
            int slotMinutes, int minMinutes, int maxMinutes, Map<String, List<List<String>>> openingHours,
            int advanceDays, Integer maxActivePerUnit, int cancelCutoffHours, String rulesText, String timeZone,
            long version) {
    }

    public record SaveBookingPolicyRequest(
            @NotNull Boolean enabled,
            @NotNull @Min(5) @Max(1440) Integer slotMinutes,
            @NotNull @Min(5) @Max(10080) Integer minMinutes,
            @NotNull @Min(5) @Max(10080) Integer maxMinutes,
            @NotNull Map<String, List<List<String>>> openingHours,
            @NotNull @Min(1) @Max(365) Integer advanceDays,
            @Min(1) @Max(50) Integer maxActivePerUnit,
            @NotNull @Min(0) @Max(168) Integer cancelCutoffHours,
            @Size(max = 2000) String rulesText,
            Long version) {
    }

    public record BookingDto(UUID id, UUID spaceId, String spaceName, Instant startsAt, Instant endsAt,
            Booking.Status status, String note, String decisionNote, String requestedByName, String unitName,
            boolean mine, String decidedByName, Instant decidedAt, Instant createdAt, boolean canCancel,
            boolean canDecide, long version) {
    }

    public record CreateBookingRequest(@NotNull UUID spaceId, @NotNull Instant startsAt, @NotNull Instant endsAt,
            @Size(max = 500) String note) {
    }

    public record BookingDecisionRequest(@Size(max = 500) String note) {
    }

    public record BusySlot(Instant startsAt, Instant endsAt, String status, boolean mine) {
    }

    public record Availability(UUID spaceId, String timeZone, Instant from, Instant to, List<BusySlot> busy,
            BookingPolicyDto policy) {
    }

    public record CalendarLink(String url) {
    }
}
