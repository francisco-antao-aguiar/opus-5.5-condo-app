import { LocalDate, Recurrence, RecurrenceUnit, Weekday } from '@condo/shared';

export const WEEKDAYS: Weekday[] = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];
export const WEEKDAY_LABELS: Record<Weekday, string> = { MON: 'Mon', TUE: 'Tue', WED: 'Wed', THU: 'Thu', FRI: 'Fri', SAT: 'Sat', SUN: 'Sun' };
export const MONTH_LABELS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export const UNIT_LABELS: Record<RecurrenceUnit, string> = { ONCE: 'Once', DAY: 'Daily', WEEK: 'Weekly', MONTH: 'Monthly', YEAR: 'Yearly' };

/** Flat form state for the recurrence builder (every field present, whatever the unit). */
export interface RecurrenceForm {
  unit: RecurrenceUnit;
  every: number;
  weekdays: Weekday[];
  dayOfMonth: number;
  month: number;
}

/** Sensible defaults, seeded from the start date when there is one. */
export function defaultRecurrenceForm(startsOn?: LocalDate): RecurrenceForm {
  const [y, m, d] = (startsOn ?? '').split('-').map(Number);
  const valid = !!y && !!m && !!d;
  return {
    unit: 'MONTH',
    every: 1,
    weekdays: [valid ? weekdayOf(startsOn!) : 'MON'],
    dayOfMonth: valid ? d! : 1,
    month: valid ? m! : 1,
  };
}

/**
 * Switching the repeat unit starts that unit fresh: "every" back to 1, and the fields the new unit
 * doesn't use (weekdays / day of month / month) reset to defaults seeded from the start date, so nothing
 * from the previous unit (e.g. "every 6" months) silently carries over.
 */
export function changeUnit(f: RecurrenceForm, unit: RecurrenceUnit, startsOn?: LocalDate): RecurrenceForm {
  if (unit === f.unit) return f;
  return { ...defaultRecurrenceForm(startsOn), unit, every: 1 };
}

/** Builder state → the minimal Recurrence the API expects (only the fields of that unit). */
export function toRecurrence(f: RecurrenceForm): Recurrence {
  const every = Math.max(1, Math.trunc(f.every || 1));
  switch (f.unit) {
    case 'ONCE':
      return { unit: 'ONCE' };
    case 'DAY':
      return { unit: 'DAY', every };
    case 'WEEK':
      return { unit: 'WEEK', every, weekdays: WEEKDAYS.filter((w) => f.weekdays.includes(w)) };
    case 'MONTH':
      return { unit: 'MONTH', every, dayOfMonth: f.dayOfMonth };
    case 'YEAR':
      return { unit: 'YEAR', every, month: f.month, dayOfMonth: f.dayOfMonth };
  }
}

/** Recurrence (from a saved plan) → builder state, filling unused fields with defaults. */
export function fromRecurrence(r: Recurrence, startsOn?: LocalDate): RecurrenceForm {
  const d = defaultRecurrenceForm(startsOn);
  return {
    unit: r.unit,
    every: r.every ?? 1,
    weekdays: r.weekdays?.length ? [...r.weekdays] : d.weekdays,
    dayOfMonth: r.dayOfMonth ?? d.dayOfMonth,
    month: r.month ?? d.month,
  };
}

/** Client-side validation mirroring 400 INVALID_RECURRENCE. Null when valid. */
export function recurrenceError(f: RecurrenceForm): string | null {
  if (f.unit !== 'ONCE' && !(Number.isInteger(f.every) && f.every >= 1 && f.every <= 365)) return 'Repeat every 1 to 365.';
  if (f.unit === 'WEEK' && !f.weekdays.length) return 'Pick at least one weekday.';
  if ((f.unit === 'MONTH' || f.unit === 'YEAR') && !(Number.isInteger(f.dayOfMonth) && f.dayOfMonth >= 1 && f.dayOfMonth <= 31)) return 'Day of month must be 1 to 31.';
  if (f.unit === 'YEAR' && !(Number.isInteger(f.month) && f.month >= 1 && f.month <= 12)) return 'Pick a month.';
  return null;
}

/** Local wording, used until the server's recurrenceText arrives. */
export function describeRecurrence(r: Recurrence): string {
  const n = r.every ?? 1;
  const every = (unit: string) => (n === 1 ? `Every ${unit}` : `Every ${n} ${unit}s`);
  switch (r.unit) {
    case 'ONCE':
      return 'Once';
    case 'DAY':
      return every('day');
    case 'WEEK':
      return `${every('week')} on ${(r.weekdays ?? []).map((w) => WEEKDAY_LABELS[w]).join(', ')}`;
    case 'MONTH':
      return `${every('month')} on day ${r.dayOfMonth ?? 1}`;
    case 'YEAR':
      return `${every('year')} on ${r.dayOfMonth ?? 1} ${MONTH_LABELS[(r.month ?? 1) - 1]}`;
  }
}

/** Weekday of a local date, independent of the browser's time zone. */
export function weekdayOf(date: LocalDate): Weekday {
  const [y, m, d] = date.split('-').map(Number);
  const dow = new Date(Date.UTC(y!, m! - 1, d!)).getUTCDay(); // 0 = Sunday
  return WEEKDAYS[(dow + 6) % 7]!;
}

export function toggleWeekday(list: readonly Weekday[], w: Weekday): Weekday[] {
  return list.includes(w) ? list.filter((x) => x !== w) : WEEKDAYS.filter((x) => x === w || list.includes(x));
}
