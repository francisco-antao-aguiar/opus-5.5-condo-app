import { BookingPolicyDto, BusySlot, LocalDate, Weekday } from '@condo/shared';
import { WEEKDAYS } from './recurrence';
import { addDays, localParts, zonedToUtc } from './zoned';

export type CellState = 'free' | 'pending' | 'confirmed' | 'mine' | 'past' | 'too-far';

export interface SlotCell {
  /** Local "HH:mm" label in the building's zone. */
  label: string;
  start: Date;
  end: Date;
  state: CellState;
}

export interface DayColumn {
  date: LocalDate;
  weekday: Weekday;
  /** Only open-hour cells, in time order. Empty = closed that day. */
  cells: SlotCell[];
}

type GridPolicy = Pick<BookingPolicyDto, 'openingHours' | 'slotMinutes' | 'advanceDays'>;

function minutesOf(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h! * 60 + m!;
}

function hhmm(min: number): string {
  return `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
}

/**
 * The week grid for a bookable space: one column per local day (from `weekStart`), cells every
 * `slotMinutes` inside the opening hours, in the building's time zone. Local times that don't exist
 * (DST spring-forward) are skipped; each cell's end is its start + slotMinutes of real time.
 */
export function buildWeek(policy: GridPolicy, tz: string, weekStart: LocalDate, busy: readonly BusySlot[], now: Date, days = 7): DayColumn[] {
  const slotMs = policy.slotMinutes * 60_000;
  const horizon = now.getTime() + policy.advanceDays * 86_400_000;
  const busyMs = busy.map((b) => ({ s: new Date(b.startsAt).getTime(), e: new Date(b.endsAt).getTime(), b }));
  const out: DayColumn[] = [];
  for (let i = 0; i < days; i++) {
    const date = addDays(weekStart, i);
    const weekday = weekdayFromDate(date);
    const cells: SlotCell[] = [];
    for (const [open, close] of policy.openingHours[weekday] ?? []) {
      const endMin = close === '24:00' || close === '00:00' ? 1440 : minutesOf(close);
      for (let m = minutesOf(open); m + policy.slotMinutes <= endMin; m += policy.slotMinutes) {
        const start = zonedToUtc(date, hhmm(m), tz);
        if (!start) continue; // inside the DST gap
        const s = start.getTime();
        const e = s + slotMs;
        const hit = busyMs.find((x) => s < x.e && e > x.s);
        let state: CellState = 'free';
        if (hit) state = hit.b.mine ? 'mine' : hit.b.status === 'CONFIRMED' ? 'confirmed' : 'pending';
        else if (s < now.getTime()) state = 'past';
        else if (s > horizon) state = 'too-far';
        cells.push({ label: hhmm(m), start, end: new Date(e), state });
      }
    }
    cells.sort((a, b) => a.start.getTime() - b.start.getTime());
    out.push({ date, weekday, cells });
  }
  return out;
}

function weekdayFromDate(date: LocalDate): Weekday {
  const [y, m, d] = date.split('-').map(Number);
  return WEEKDAYS[(new Date(Date.UTC(y!, m! - 1, d!)).getUTCDay() + 6) % 7]!;
}

export type RangePick = { ok: true; startsAt: Date; endsAt: Date; minutes: number } | { ok: false; error: string };

/**
 * A booking range from two clicked cells of the same day (in any order): every cell in between must be
 * free and back-to-back (no closed gap), and the duration must respect min/max.
 */
export function pickRange(day: DayColumn, fromIdx: number, toIdx: number, policy: Pick<BookingPolicyDto, 'minMinutes' | 'maxMinutes'>): RangePick {
  const a = Math.min(fromIdx, toIdx);
  const b = Math.max(fromIdx, toIdx);
  const cells = day.cells.slice(a, b + 1);
  if (!cells.length) return { ok: false, error: 'Pick a time.' };
  for (let i = 0; i < cells.length; i++) {
    const c = cells[i]!;
    if (c.state !== 'free') return { ok: false, error: c.state === 'past' ? 'That time has passed.' : c.state === 'too-far' ? 'That is too far ahead.' : 'Part of that time is already taken.' };
    if (i > 0 && cells[i - 1]!.end.getTime() !== c.start.getTime()) return { ok: false, error: 'The space is closed for part of that time.' };
  }
  const startsAt = cells[0]!.start;
  const endsAt = cells[cells.length - 1]!.end;
  const minutes = Math.round((endsAt.getTime() - startsAt.getTime()) / 60_000);
  if (minutes < policy.minMinutes) return { ok: false, error: `Book at least ${durationText(policy.minMinutes)}.` };
  if (minutes > policy.maxMinutes) return { ok: false, error: `Book at most ${durationText(policy.maxMinutes)}.` };
  return { ok: true, startsAt, endsAt, minutes };
}

export function durationText(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (!h) return `${m} min`;
  return m ? `${h} h ${m} min` : `${h} h`;
}

/** Local day bounds as instants, for availability queries (covers DST-length days). */
export function weekBounds(weekStart: LocalDate, tz: string, days = 7): { from: string; to: string } {
  const from = zonedToUtc(weekStart, '00:00', tz) ?? zonedToUtc(weekStart, '01:00', tz)!;
  const end = addDays(weekStart, days);
  const to = zonedToUtc(end, '00:00', tz) ?? zonedToUtc(end, '01:00', tz)!;
  return { from: from.toISOString(), to: to.toISOString() };
}

/** The local date of an instant, as shown on the calendar header. */
export function dayOf(instant: Date, tz: string): LocalDate {
  return localParts(instant, tz).date;
}
