import { BookingDto, BookingStatus, OpeningHours, SaveBookingPolicyRequest, Weekday } from '@condo/shared';
import { describeError, errorCode, ErrorText, problemOf } from '../core/errors';
import { WEEKDAYS } from './recurrence';

export const BOOKING_STATUS_LABELS: Record<BookingStatus, string> = {
  PENDING: 'Waiting for approval',
  CONFIRMED: 'Confirmed',
  REJECTED: 'Rejected',
  CANCELLED: 'Cancelled',
};
export const BOOKING_STATUS_BADGE: Record<BookingStatus, string> = {
  PENDING: 'badge-warn',
  CONFIRMED: 'badge-ok',
  REJECTED: 'badge-danger',
  CANCELLED: '',
};

const BOOKING_ERRORS: Record<string, string> = {
  BOOKING_CONFLICT: 'Someone else has already requested or booked part of that time. Pick another slot.',
  BOOKING_RULES: "That time doesn't fit this space's booking rules.",
  BOOKING_LIMIT: 'Your unit already has the maximum number of active bookings for this space.',
  BOOKING_CANCEL_CUTOFF: "It's too close to the start to cancel online. Contact a building admin.",
  NOT_BOOKABLE: "This space can't be booked right now.",
  INVALID_STATE: 'This booking has already been decided or cancelled. Refresh to see its status.',
};

/** Friendly booking error: our headline, with the server's detail (which names the broken rule) underneath. */
export function bookingError(e: unknown): ErrorText {
  const code = errorCode(e);
  const title = code ? BOOKING_ERRORS[code] : undefined;
  if (!title) return describeError(e);
  const detail = problemOf(e)?.detail;
  return { title, detail: detail && detail !== title ? detail : undefined };
}

export function isBookingError(e: unknown): boolean {
  return !!BOOKING_ERRORS[errorCode(e) ?? ''];
}

/** Pending first (oldest first, they've waited longest), then upcoming by start, then the rest newest first. */
export function sortForQueue(list: readonly BookingDto[]): BookingDto[] {
  const rank = (b: BookingDto) => (b.status === 'PENDING' ? 0 : b.status === 'CONFIRMED' ? 1 : 2);
  return [...list].sort((a, b) => {
    const r = rank(a) - rank(b);
    if (r) return r;
    if (a.status === 'PENDING') return a.createdAt.localeCompare(b.createdAt);
    if (a.status === 'CONFIRMED') return a.startsAt.localeCompare(b.startsAt);
    return b.startsAt.localeCompare(a.startsAt);
  });
}

// ---------- policy editor ----------

export function defaultPolicy(): SaveBookingPolicyRequest {
  const hours: OpeningHours = {};
  for (const d of WEEKDAYS) hours[d] = [['10:00', '22:00']];
  return {
    enabled: true,
    slotMinutes: 30,
    minMinutes: 60,
    maxMinutes: 240,
    openingHours: hours,
    advanceDays: 60,
    maxActivePerUnit: 2,
    cancelCutoffHours: 24,
    rulesText: null,
  };
}

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$|^24:00$/;

/** Validation for the policy form (mirrors the server rules we know of). Null when valid. */
export function policyError(p: SaveBookingPolicyRequest): string | null {
  if (!(p.slotMinutes >= 5 && p.slotMinutes <= 240 && 1440 % p.slotMinutes === 0)) return 'Slot length must divide the day (e.g. 15, 30, 60 minutes).';
  if (p.minMinutes % p.slotMinutes || p.maxMinutes % p.slotMinutes) return 'Minimum and maximum must be multiples of the slot length.';
  if (p.minMinutes < p.slotMinutes || p.maxMinutes < p.minMinutes) return 'Maximum must be at least the minimum, and the minimum at least one slot.';
  if (!(p.advanceDays >= 1 && p.advanceDays <= 365)) return 'Advance booking must be 1 to 365 days.';
  if (p.maxActivePerUnit !== null && !(p.maxActivePerUnit >= 1)) return 'Per-unit limit must be at least 1 (or empty for no limit).';
  if (!(p.cancelCutoffHours >= 0)) return 'Cancel cutoff can’t be negative.';
  for (const d of WEEKDAYS) {
    for (const [a, b] of p.openingHours[d] ?? []) {
      if (!HHMM.test(a) || !HHMM.test(b)) return `${d}: use HH:mm times.`;
      if (b !== '24:00' && b <= a) return `${d}: closing must be after opening.`;
    }
  }
  if (!WEEKDAYS.some((d) => (p.openingHours[d] ?? []).length)) return 'Open the space on at least one day.';
  return null;
}

/** Copy one day's hours to every day (the common "same hours all week" case). */
export function copyHoursToAll(hours: OpeningHours, from: Weekday): OpeningHours {
  const src = hours[from] ?? [];
  const out: OpeningHours = {};
  for (const d of WEEKDAYS) out[d] = src.map(([a, b]) => [a, b] as [string, string]);
  return out;
}
