import type { LocalDate, Weekday } from '@condo/shared';

/**
 * Building-time-zone helpers on top of Intl (no date library). Booking slots and maintenance dates are
 * local to the building's IANA zone, which may differ from the phone's.
 */

export function deviceTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return 'UTC';
  }
}

const partsCache = new Map<string, Intl.DateTimeFormat>();
function partsFormatter(tz: string) {
  let f = partsCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    partsCache.set(tz, f);
  }
  return f;
}

interface ZonedParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

export function zonedParts(t: Date | number, tz: string): ZonedParts {
  const out: Record<string, number> = {};
  for (const p of partsFormatter(tz).formatToParts(typeof t === 'number' ? new Date(t) : t)) {
    if (p.type !== 'literal') out[p.type] = Number(p.value);
  }
  return {
    year: out.year,
    month: out.month,
    day: out.day,
    hour: out.hour === 24 ? 0 : out.hour,
    minute: out.minute,
    second: out.second,
  };
}

/** Offset (ms) of `tz` from UTC at instant t. */
function offsetAt(t: number, tz: string): number {
  const p = zonedParts(t, tz);
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - Math.floor(t / 1000) * 1000;
}

function parseLocalDate(d: LocalDate): [number, number, number] {
  const [y, m, day] = d.split('-').map(Number);
  return [y, m, day];
}

/** Local date + "HH:mm" in `tz` → epoch ms (DST-safe: re-checks the offset at the result). */
export function zonedToEpoch(date: LocalDate, hhmm: string, tz: string): number {
  const [y, m, d] = parseLocalDate(date);
  const [hh, mm] = hhmm.split(':').map(Number);
  const guess = Date.UTC(y, m - 1, d, hh, mm);
  let t = guess - offsetAt(guess, tz);
  const second = guess - offsetAt(t, tz);
  if (second !== t) t = second;
  return t;
}

export function toLocalDate(y: number, m: number, d: number): LocalDate {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${y}-${pad(m)}-${pad(d)}`;
}

export function todayIn(tz: string): LocalDate {
  const p = zonedParts(Date.now(), tz);
  return toLocalDate(p.year, p.month, p.day);
}

export function addDaysLocal(date: LocalDate, n: number): LocalDate {
  const [y, m, d] = parseLocalDate(date);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return toLocalDate(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate());
}

const WEEKDAYS: Weekday[] = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];

export function weekdayOf(date: LocalDate): Weekday {
  const [y, m, d] = parseLocalDate(date);
  return WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
}

/** "HH:mm" → minutes after midnight. */
export function minutesOf(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

export function hhmmOf(minutes: number): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`;
}

/** Format an instant in the building's zone. */
export function formatInZone(iso: string | number, tz: string, opts: Intl.DateTimeFormatOptions): string {
  try {
    return new Intl.DateTimeFormat(undefined, { ...opts, timeZone: tz }).format(new Date(iso));
  } catch {
    return new Date(iso).toLocaleString();
  }
}

export function formatTime(iso: string | number, tz: string): string {
  return formatInZone(iso, tz, { hour: '2-digit', minute: '2-digit' });
}

/** "Sat 10 Oct, 18:00–21:00" in the building's zone. */
export function formatRange(startIso: string, endIso: string, tz: string): string {
  return `${formatInZone(startIso, tz, { weekday: 'short', day: 'numeric', month: 'short' })}, ${formatTime(startIso, tz)}–${formatTime(endIso, tz)}`;
}

/** A local calendar date (no zone shift): "Fri 1 Apr 2027". */
export function formatLocalDate(date: LocalDate, opts: Intl.DateTimeFormatOptions = { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }): string {
  const [y, m, d] = parseLocalDate(date);
  return new Intl.DateTimeFormat(undefined, { ...opts, timeZone: 'UTC' }).format(new Date(Date.UTC(y, m - 1, d, 12)));
}

/** One line to show when the building's zone isn't the phone's, or null. */
export function zoneNote(tz: string): string | null {
  return tz && tz !== deviceTimeZone() ? `Times are in the building's time zone (${tz}).` : null;
}
