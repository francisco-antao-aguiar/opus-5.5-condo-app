import { Instant } from '@condo/shared';

/** Instant → local "YYYY-MM-DD" for <input type="date">. */
export function instantToDateInput(value: Instant | null): string {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Local "YYYY-MM-DD" → Instant at the end of that local day (access lasts the whole day). */
export function dateInputToInstant(value: string): Instant | null {
  if (!value) return null;
  const d = new Date(`${value}T23:59:59`);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}
