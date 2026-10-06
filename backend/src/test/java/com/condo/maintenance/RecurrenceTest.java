package com.condo.maintenance;

import static java.time.LocalDate.parse;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.condo.common.error.ApiException;
import com.condo.maintenance.Recurrence.Unit;
import java.time.LocalDate;
import java.util.List;
import org.junit.jupiter.api.Test;

class RecurrenceTest {

    private static Recurrence r(Unit unit, Integer every, List<String> weekdays, Integer day, Integer month,
            LocalDate start) {
        return new Recurrence(unit, every, weekdays, day, month).normalized(start);
    }

    private static List<String> dates(Recurrence r, String start, String end, String from, int n) {
        return r.occurrences(parse(start), end == null ? null : parse(end), parse(from), n).stream()
                .map(LocalDate::toString).toList();
    }

    @Test
    void everySixMonthsOnTheFirst() {
        Recurrence every6 = r(Unit.MONTH, 6, null, 1, null, parse("2026-01-01"));
        assertThat(dates(every6, "2026-01-01", null, "2026-01-01", 4))
                .containsExactly("2026-01-01", "2026-07-01", "2027-01-01", "2027-07-01");
        // Starting the search mid-period jumps to the next anchored occurrence, not "6 months from now".
        assertThat(dates(every6, "2026-01-01", null, "2026-03-15", 1)).containsExactly("2026-07-01");
        assertThat(every6.describe(parse("2026-01-01"))).isEqualTo("Every 6 months on day 1");
    }

    @Test
    void monthEndClampsToTheLastDay() {
        Recurrence monthly31 = r(Unit.MONTH, 1, null, 31, null, parse("2026-01-31"));
        assertThat(dates(monthly31, "2026-01-31", null, "2026-01-01", 4))
                .containsExactly("2026-01-31", "2026-02-28", "2026-03-31", "2026-04-30");
        assertThat(dates(r(Unit.YEAR, 1, null, 29, 2, parse("2027-01-01")), "2027-01-01", null, "2027-01-01", 2))
                .containsExactly("2027-02-28", "2028-02-29"); // leap year
        assertThat(monthly31.describe(parse("2026-01-31"))).contains("last day");
    }

    @Test
    void weeklyOnSeveralDaysEveryOtherWeek() {
        // 2026-10-05 is a Monday.
        Recurrence fortnightly = r(Unit.WEEK, 2, List.of("MON", "thu"), null, null, parse("2026-10-05"));
        assertThat(dates(fortnightly, "2026-10-05", null, "2026-10-05", 4))
                .containsExactly("2026-10-05", "2026-10-08", "2026-10-19", "2026-10-22");
        assertThat(fortnightly.describe(parse("2026-10-05"))).isEqualTo("Every 2 weeks on Mon, Thu");
        // No weekdays given → the start date's weekday.
        assertThat(r(Unit.WEEK, 1, null, null, null, parse("2026-10-07")).weekdays()).containsExactly("WED");
    }

    @Test
    void dailyAndYearlyAndOnce() {
        assertThat(dates(r(Unit.DAY, 3, null, null, null, parse("2026-10-01")), "2026-10-01", null, "2026-10-02", 3))
                .containsExactly("2026-10-04", "2026-10-07", "2026-10-10");
        Recurrence january = r(Unit.YEAR, 1, null, 15, 1, parse("2026-10-01"));
        assertThat(dates(january, "2026-10-01", null, "2026-10-01", 2)).containsExactly("2027-01-15", "2028-01-15");
        assertThat(january.describe(parse("2026-10-01"))).isEqualTo("Every year on 15 Jan");
        Recurrence once = r(Unit.ONCE, 5, List.of("MON"), 3, 4, parse("2026-11-02"));
        assertThat(dates(once, "2026-11-02", null, "2026-01-01", 5)).containsExactly("2026-11-02");
        assertThat(dates(once, "2026-11-02", null, "2026-11-03", 5)).isEmpty();
    }

    @Test
    void endDateStopsTheSeries() {
        Recurrence monthly = r(Unit.MONTH, 1, null, 10, null, parse("2026-01-10"));
        assertThat(dates(monthly, "2026-01-10", "2026-03-10", "2026-01-01", 10))
                .containsExactly("2026-01-10", "2026-02-10", "2026-03-10");
    }

    @Test
    void invalidInputIsRejectedWithACode() {
        LocalDate start = parse("2026-01-01");
        for (Recurrence bad : List.of(
                new Recurrence(null, 1, null, null, null),
                new Recurrence(Unit.DAY, 0, null, null, null),
                new Recurrence(Unit.DAY, 400, null, null, null),
                new Recurrence(Unit.MONTH, 1, null, 32, null),
                new Recurrence(Unit.YEAR, 1, null, 1, 13),
                new Recurrence(Unit.WEEK, 1, List.of("FUNDAY"), null, null))) {
            assertThatThrownBy(() -> bad.normalized(start))
                    .isInstanceOf(ApiException.class)
                    .hasFieldOrPropertyWithValue("code", "INVALID_RECURRENCE");
        }
    }
}
