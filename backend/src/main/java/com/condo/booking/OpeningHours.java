package com.condo.booking;

import com.condo.common.error.ApiException;
import com.condo.common.error.ErrorCodes;
import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.time.format.TextStyle;
import java.util.ArrayList;
import java.util.EnumMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

/**
 * Weekly opening hours in building-local time: {"MON": [["10:00","22:00"]], …}; a missing day is closed and
 * "24:00" means end of day. Validated on save; used to check that a booking fits one open range.
 */
public final class OpeningHours {

    record Range(int startMinute, int endMinute) {
    }

    private final Map<DayOfWeek, List<Range>> days;

    private OpeningHours(Map<DayOfWeek, List<Range>> days) {
        this.days = days;
    }

    public static OpeningHours parse(Map<String, List<List<String>>> raw) {
        Map<DayOfWeek, List<Range>> days = new EnumMap<>(DayOfWeek.class);
        if (raw != null) {
            raw.forEach((dayCode, ranges) -> {
                DayOfWeek day = day(dayCode);
                List<Range> parsed = new ArrayList<>();
                for (List<String> pair : ranges == null ? List.<List<String>>of() : ranges) {
                    if (pair == null || pair.size() != 2) {
                        throw invalid("Each opening range needs a start and an end, like [\"10:00\", \"22:00\"].");
                    }
                    int start = minute(pair.get(0));
                    int end = minute(pair.get(1));
                    if (end <= start) {
                        throw invalid("An opening range must end after it starts (" + dayCode + ").");
                    }
                    parsed.add(new Range(start, end));
                }
                parsed.sort((a, b) -> Integer.compare(a.startMinute(), b.startMinute()));
                for (int i = 1; i < parsed.size(); i++) {
                    if (parsed.get(i).startMinute() < parsed.get(i - 1).endMinute()) {
                        throw invalid("Opening ranges overlap on " + dayCode + ".");
                    }
                }
                if (!parsed.isEmpty()) {
                    days.put(day, parsed);
                }
            });
        }
        if (days.isEmpty()) {
            throw invalid("Open the space at least one day a week.");
        }
        return new OpeningHours(days);
    }

    /** True if [start, end) (local) lies inside a single open range of the start's day. */
    public boolean contains(LocalDateTime start, LocalDateTime end) {
        LocalDate day = start.toLocalDate();
        int from = start.toLocalTime().toSecondOfDay() / 60;
        long minutes = java.time.Duration.between(start, end).toMinutes();
        int to = from + (int) minutes;
        if (start.toLocalTime().getSecond() != 0) {
            return false;
        }
        return days.getOrDefault(day.getDayOfWeek(), List.of()).stream()
                .anyMatch(r -> from >= r.startMinute() && to <= r.endMinute());
    }

    public Map<String, List<List<String>>> toJson() {
        Map<String, List<List<String>>> out = new LinkedHashMap<>();
        days.forEach((day, ranges) -> out.put(code(day),
                ranges.stream().map(r -> List.of(time(r.startMinute()), time(r.endMinute()))).toList()));
        return out;
    }

    private static int minute(String hhmm) {
        if (hhmm == null || !hhmm.matches("\\d{2}:\\d{2}")) {
            throw invalid("Times look like 09:30.");
        }
        if (hhmm.equals("24:00")) {
            return 24 * 60;
        }
        try {
            LocalTime t = LocalTime.parse(hhmm);
            return t.getHour() * 60 + t.getMinute();
        } catch (java.time.format.DateTimeParseException e) {
            throw invalid("Invalid time " + hhmm + ".");
        }
    }

    private static String time(int minute) {
        return String.format("%02d:%02d", minute / 60, minute % 60);
    }

    private static DayOfWeek day(String code) {
        for (DayOfWeek d : DayOfWeek.values()) {
            if (code(d).equalsIgnoreCase(code)) {
                return d;
            }
        }
        throw invalid("Unknown weekday " + code + ".");
    }

    private static String code(DayOfWeek d) {
        return d.getDisplayName(TextStyle.SHORT, Locale.ENGLISH).toUpperCase(Locale.ROOT);
    }

    private static ApiException invalid(String message) {
        return ApiException.badRequest(ErrorCodes.BOOKING_RULES, message);
    }
}
