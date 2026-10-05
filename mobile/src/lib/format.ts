import type { RoleCode, Visibility } from '@condo/shared';

const ROLE_LABELS: Record<string, string> = {
  ADMIN: 'Admin',
  MANAGER: 'Manager',
  OWNER: 'Owner',
  TENANT: 'Tenant',
};

/** Roles are server data; unknown codes fall back to a title-cased code. */
export function roleLabel(role: RoleCode): string {
  return ROLE_LABELS[role] ?? role.charAt(0) + role.slice(1).toLowerCase().replace(/_/g, ' ');
}

export function visibilityLabel(v: Visibility): string {
  return v === 'COMMON' ? 'Common' : 'Private';
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

export function isPast(iso: string | null | undefined): boolean {
  return !!iso && new Date(iso).getTime() < Date.now();
}

// ---------- dates (membership / invitation expiry) ----------

/** Last millisecond of the given local day, as an ISO instant (what the API expects for end dates). */
export function endOfDayIso(d: Date): string {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999).toISOString();
}

export function addDays(d: Date, days: number): Date {
  const out = new Date(d);
  out.setDate(out.getDate() + days);
  return out;
}

/** Calendar-aware month addition (Jan 31 + 1 month → Feb 28/29). */
export function addMonths(d: Date, months: number): Date {
  const out = new Date(d.getFullYear(), d.getMonth() + months, 1, d.getHours(), d.getMinutes());
  const lastDay = new Date(out.getFullYear(), out.getMonth() + 1, 0).getDate();
  out.setDate(Math.min(d.getDate(), lastDay));
  return out;
}

/** "2027-03-31" → local Date, or null when not a real calendar date. */
export function parseDateInput(text: string): Date | null {
  const m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(text.trim());
  if (!m) return null;
  const [y, mo, da] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const d = new Date(y, mo - 1, da);
  return d.getFullYear() === y && d.getMonth() === mo - 1 && d.getDate() === da ? d : null;
}

/** ISO instant → "YYYY-MM-DD" in local time (for prefilling the date field). */
export function toDateInput(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/**
 * How long membership from an invitation lasts: a fixed date, N days counted from acceptance,
 * or no end (null). An invitation carries at most one of the two.
 */
export function invitationAccessText(inv: {
  membershipExpiresAt: string | null;
  membershipDurationDays: number | null;
}): string | null {
  if (inv.membershipDurationDays != null) {
    const n = inv.membershipDurationDays;
    return `access for ${n} ${n === 1 ? 'day' : 'days'} after joining`;
  }
  if (inv.membershipExpiresAt) return `access until ${formatDate(inv.membershipExpiresAt)}`;
  return null;
}

export function capitalize(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}
