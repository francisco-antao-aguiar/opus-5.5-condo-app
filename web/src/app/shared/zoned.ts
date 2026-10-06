import { LocalDate, Weekday } from '@condo/shared';
import { WEEKDAYS } from './recurrence';

/**
 * Time-zone helpers on top of Intl (no date library). Everything about bookings and maintenance is
 * local to the *building's* zone, which may differ from the browser's.
 */

const partsFormatters = new Map<string, Intl.DateTimeFormat>();

function partsFormatter(tz: string): Intl.DateTimeFormat {
  let f = partsFormatters.get(tz);
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
    partsFormatters.set(tz, f);
  }
  return f;
}

export interface LocalParts {
  date: LocalDate;
  time: string; // HH:mm
  weekday: Weekday;
}

function rawParts(instant: number, tz: string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const p of partsFormatter(tz).formatToParts(new Date(instant))) {
    if (p.type !== 'literal') out[p.type] = Number(p.value);
  }
  return out;
}

/** Offset (ms) of `tz` from UTC at that instant: local wall clock − UTC. */
export function tzOffsetMs(instant: number, tz: string): number {
  const p = rawParts(instant, tz);
  const asUtc = Date.UTC(p['year']!, p['month']! - 1, p['day']!, p['hour'] === 24 ? 0 : p['hour']!, p['minute']!, p['second']!);
  return asUtc - Math.floor(instant / 1000) * 1000;
}

const pad = (n: number) => String(n).padStart(2, '0');

export function localParts(instant: Date | number, tz: string): LocalParts {
  const t = typeof instant === 'number' ? instant : instant.getTime();
  const p = rawParts(t, tz);
  const date = `${p['year']}-${pad(p['month']!)}-${pad(p['day']!)}`;
  return { date, time: `${pad(p['hour'] === 24 ? 0 : p['hour']!)}:${pad(p['minute']!)}`, weekday: weekdayOfDate(date) };
}

function weekdayOfDate(date: LocalDate): Weekday {
  const [y, m, d] = date.split('-').map(Number);
  return WEEKDAYS[(new Date(Date.UTC(y!, m! - 1, d!)).getUTCDay() + 6) % 7]!;
}

/**
 * Local wall-clock date + "HH:mm" in `tz` → the instant. Null when that local time doesn't exist
 * (the spring-forward gap). For the repeated hour in autumn, returns the first occurrence.
 */
export function zonedToUtc(date: LocalDate, time: string, tz: string): Date | null {
  const [y, m, d] = date.split('-').map(Number);
  const [hh, mm] = time.split(':').map(Number);
  const wall = Date.UTC(y!, m! - 1, d!, hh!, mm!);
  // Try both offsets around the wall time; keep the earliest candidate that maps back exactly.
  const candidates = new Set<number>();
  for (const probe of [wall - 86_400_000 / 2, wall, wall + 86_400_000 / 2]) candidates.add(wall - tzOffsetMs(probe, tz));
  const ok = [...candidates].filter((t) => {
    const lp = localParts(t, tz);
    return lp.date === date && lp.time === time;
  });
  return ok.length ? new Date(Math.min(...ok)) : null;
}

export function addDays(date: LocalDate, n: number): LocalDate {
  const [y, m, d] = date.split('-').map(Number);
  const t = new Date(Date.UTC(y!, m! - 1, d! + n));
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
}

/** Monday of the week containing `date`. */
export function startOfWeek(date: LocalDate): LocalDate {
  return addDays(date, -WEEKDAYS.indexOf(weekdayOfDate(date)));
}

/** Today's local date in `tz`. */
export function todayIn(tz: string, now: Date = new Date()): LocalDate {
  return localParts(now, tz).date;
}

export function browserTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

/** "Mon 6 Oct, 18:00" in the building's zone. */
export function formatInZone(instant: string | Date, tz: string, opts: Intl.DateTimeFormatOptions = { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }): string {
  return new Intl.DateTimeFormat('en-GB', { ...opts, timeZone: tz }).format(new Date(instant));
}

/** "18:00–20:00" (or across days) in the building's zone. */
export function formatRange(start: string | Date, end: string | Date, tz: string): string {
  const s = localParts(new Date(start), tz);
  const e = localParts(new Date(end), tz);
  const day = formatInZone(start, tz, { weekday: 'short', day: 'numeric', month: 'short' });
  return s.date === e.date || (e.time === '00:00' && addDays(s.date, 1) === e.date)
    ? `${day}, ${s.time}–${e.time === '00:00' ? '24:00' : e.time}`
    : `${formatInZone(start, tz)} – ${formatInZone(end, tz)}`;
}

/** Local date "YYYY-MM-DD" → "Wed 1 Apr 2027" (no zone shifting). */
export function formatLocalDate(date: LocalDate | null | undefined, opts: Intl.DateTimeFormatOptions = { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }): string {
  if (!date) return '';
  const [y, m, d] = date.split('-').map(Number);
  return new Intl.DateTimeFormat('en-GB', { ...opts, timeZone: 'UTC' }).format(new Date(Date.UTC(y!, m! - 1, d!)));
}

/** Time zones for a picker (falls back to a short list on old engines). */
export function supportedTimeZones(): string[] {
  const intl = Intl as unknown as { supportedValuesOf?: (k: string) => string[] };
  try {
    const list = intl.supportedValuesOf?.('timeZone');
    if (list?.length) return list;
  } catch {
    /* fall through */
  }
  return ['Europe/Lisbon', 'Europe/London', 'Europe/Madrid', 'Europe/Paris', 'Europe/Berlin', 'America/Sao_Paulo', 'America/New_York', 'UTC'];
}

export function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}
