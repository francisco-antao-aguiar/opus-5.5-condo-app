package com.condo.maintenance;

import com.condo.common.error.ApiException;
import com.condo.common.error.ErrorCodes;
import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.Month;
import java.time.YearMonth;
import java.time.format.TextStyle;
import java.time.temporal.ChronoUnit;
import java.time.temporal.TemporalAdjusters;
import java.util.ArrayList;
import java.util.EnumSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.stream.Collectors;

/**
 * A deliberately small recurrence model (not RFC 5545): once, every N days, every N weeks on some weekdays,
 * every N months on a day, every N years on a month/day. Periods are anchored at the plan's start date; a day of
 * month beyond the month's length clamps to its last day (31 → 28/29 Feb). Dates are local to the building.
 */
public record Recurrence(Unit unit, Integer every, List<String> weekdays, Integer dayOfMonth, Integer month) {

    public enum Unit { ONCE, DAY, WEEK, MONTH, YEAR }

    private static final int MAX_EVERY = 365;

    /** Validates and fills defaults from the start date (day of month, month, weekday). */
    public Recurrence normalized(LocalDate startsOn) {
        if (unit == null) {
            throw invalid("Choose how often it repeats.");
        }
        if (unit == Unit.ONCE) {
            return new Recurrence(Unit.ONCE, null, null, null, null);
        }
        int n = every == null ? 1 : every;
        if (n < 1 || n > MAX_EVERY) {
            throw invalid("\"Every\" must be between 1 and " + MAX_EVERY + ".");
        }
        return switch (unit) {
            case DAY -> new Recurrence(Unit.DAY, n, null, null, null);
            case WEEK -> {
                Set<DayOfWeek> days = parseWeekdays(weekdays);
                if (days.isEmpty()) {
                    days = EnumSet.of(startsOn.getDayOfWeek());
                }
                yield new Recurrence(Unit.WEEK, n, days.stream().map(Recurrence::code).toList(), null, null);
            }
            case MONTH -> new Recurrence(Unit.MONTH, n, null, day(dayOfMonth, startsOn), null);
            case YEAR -> {
                int m = month == null ? startsOn.getMonthValue() : month;
                if (m < 1 || m > 12) {
                    throw invalid("Month must be 1–12.");
                }
                yield new Recurrence(Unit.YEAR, n, null, day(dayOfMonth, startsOn), m);
            }
            case ONCE -> throw new IllegalStateException();
        };
    }

    /** First occurrence on or after {@code from} (and not before {@code startsOn}), or null if none until endsOn. */
    public LocalDate nextOnOrAfter(LocalDate startsOn, LocalDate endsOn, LocalDate from) {
        LocalDate floor = from.isBefore(startsOn) ? startsOn : from;
        LocalDate next = switch (unit) {
            case ONCE -> startsOn.isBefore(floor) ? null : startsOn;
            case DAY -> {
                long k = ceilDiv(ChronoUnit.DAYS.between(startsOn, floor), every);
                yield startsOn.plusDays(k * every);
            }
            case WEEK -> nextWeekly(startsOn, floor);
            case MONTH -> nextMonthly(startsOn, floor);
            case YEAR -> nextYearly(startsOn, floor);
        };
        return next == null || (endsOn != null && next.isAfter(endsOn)) ? null : next;
    }

    /** Up to {@code max} occurrences from {@code from}. */
    public List<LocalDate> occurrences(LocalDate startsOn, LocalDate endsOn, LocalDate from, int max) {
        List<LocalDate> out = new ArrayList<>();
        LocalDate cursor = from;
        while (out.size() < max) {
            LocalDate next = nextOnOrAfter(startsOn, endsOn, cursor);
            if (next == null) {
                break;
            }
            out.add(next);
            cursor = next.plusDays(1);
        }
        return out;
    }

    /** "Every 6 months on day 1", for people. */
    public String describe(LocalDate startsOn) {
        return switch (unit) {
            case ONCE -> "Once, on " + startsOn;
            case DAY -> every == 1 ? "Every day" : "Every " + every + " days";
            case WEEK -> (every == 1 ? "Every week" : "Every " + every + " weeks") + " on "
                    + parseWeekdays(weekdays).stream()
                            .map(d -> d.getDisplayName(TextStyle.SHORT, Locale.ENGLISH))
                            .collect(Collectors.joining(", "));
            case MONTH -> (every == 1 ? "Every month" : "Every " + every + " months") + " on day " + dayOfMonth
                    + (dayOfMonth > 28 ? " (or the month's last day)" : "");
            case YEAR -> (every == 1 ? "Every year" : "Every " + every + " years") + " on " + dayOfMonth + " "
                    + Month.of(month).getDisplayName(TextStyle.SHORT, Locale.ENGLISH);
        };
    }

    // ---------- internals ----------

    private LocalDate nextWeekly(LocalDate startsOn, LocalDate floor) {
        Set<DayOfWeek> days = parseWeekdays(weekdays);
        LocalDate anchorMonday = startsOn.with(TemporalAdjusters.previousOrSame(DayOfWeek.MONDAY));
        // At most `every` weeks ahead there is a matching week; scan day by day (bounded).
        for (LocalDate d = floor; !d.isAfter(floor.plusWeeks((long) every + 1)); d = d.plusDays(1)) {
            long weeks = ChronoUnit.WEEKS.between(anchorMonday, d.with(TemporalAdjusters.previousOrSame(DayOfWeek.MONDAY)));
            if (weeks % every == 0 && days.contains(d.getDayOfWeek())) {
                return d;
            }
        }
        return null;
    }

    private LocalDate nextMonthly(LocalDate startsOn, LocalDate floor) {
        YearMonth anchor = YearMonth.from(startsOn);
        long k = Math.max(0, ChronoUnit.MONTHS.between(anchor, YearMonth.from(floor)) / every);
        for (int i = 0; i < 3; i++, k++) {
            LocalDate candidate = clamp(anchor.plusMonths(k * every), dayOfMonth);
            if (!candidate.isBefore(floor) && !candidate.isBefore(startsOn)) {
                return candidate;
            }
        }
        return null;
    }

    private LocalDate nextYearly(LocalDate startsOn, LocalDate floor) {
        int anchor = startsOn.getYear();
        long k = Math.max(0, (floor.getYear() - anchor) / every);
        for (int i = 0; i < 3; i++, k++) {
            LocalDate candidate = clamp(YearMonth.of((int) (anchor + k * every), month), dayOfMonth);
            if (!candidate.isBefore(floor) && !candidate.isBefore(startsOn)) {
                return candidate;
            }
        }
        return null;
    }

    private static LocalDate clamp(YearMonth ym, int day) {
        return ym.atDay(Math.min(day, ym.lengthOfMonth()));
    }

    private static long ceilDiv(long a, long b) {
        return a <= 0 ? 0 : (a + b - 1) / b;
    }

    private static int day(Integer dayOfMonth, LocalDate startsOn) {
        int d = dayOfMonth == null ? startsOn.getDayOfMonth() : dayOfMonth;
        if (d < 1 || d > 31) {
            throw invalid("Day of month must be 1–31.");
        }
        return d;
    }

    private static Set<DayOfWeek> parseWeekdays(List<String> codes) {
        Set<DayOfWeek> days = EnumSet.noneOf(DayOfWeek.class);
        if (codes == null) {
            return days;
        }
        for (String c : codes) {
            days.add(switch (c == null ? "" : c.toUpperCase(Locale.ROOT)) {
                case "MON" -> DayOfWeek.MONDAY;
                case "TUE" -> DayOfWeek.TUESDAY;
                case "WED" -> DayOfWeek.WEDNESDAY;
                case "THU" -> DayOfWeek.THURSDAY;
                case "FRI" -> DayOfWeek.FRIDAY;
                case "SAT" -> DayOfWeek.SATURDAY;
                case "SUN" -> DayOfWeek.SUNDAY;
                default -> throw invalid("Unknown weekday " + c + ".");
            });
        }
        return days;
    }

    private static String code(DayOfWeek d) {
        return d.getDisplayName(TextStyle.SHORT, Locale.ENGLISH).toUpperCase(Locale.ROOT);
    }

    private static ApiException invalid(String message) {
        return ApiException.badRequest(ErrorCodes.INVALID_RECURRENCE, message);
    }
}
