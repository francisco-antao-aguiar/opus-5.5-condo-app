import {
  CreateInvitationRequest,
  Instant,
  InvitationStatus,
  MyPermissions,
  RoleDto,
  SpaceDto,
  UUID,
  canDo,
  normalizeInviteCode,
} from '@condo/shared';
import { dateInputToInstant } from './dates';

const DAY_MS = 24 * 60 * 60 * 1000;
/** Server limit for an invitation's own validity. */
export const MAX_INVITE_DAYS = 90;
/** Safety margin so a "90 days" custom date isn't rejected for a few seconds of clock skew. */
const MAX_VALIDITY_MARGIN_MS = 5 * 60 * 1000;
export const MAX_USES_LIMIT = 500;
export const NOTE_MAX = 200;
/** Server range for "access for N days after joining". */
export const MAX_DURATION_DAYS = 3650;
export const DEFAULT_DURATION_DAYS = 7;
export const DURATION_CHIPS = [1, 7, 30, 90] as const;

// ---------- who may invite where ----------

export interface UnitOption {
  id: UUID;
  label: string;
}

export interface InviteTargets {
  /** At least one target is allowed: show the Invite button and the invitations list. */
  canInvite: boolean;
  /** MEMBER_INVITE with scope ANY: may leave the unit empty (building-wide). */
  buildingWide: boolean;
  /** UNIT spaces I may invite into. */
  units: UnitOption[];
  /** Set when I may only invite into my own unit: preselect it and lock the select. */
  lockedUnitId: UUID | null;
}

/**
 * Mirrors the server rule "MEMBER_INVITE on the invitation's unit (null unit → building-wide)".
 * ANY scope → building-wide plus every UNIT. OWN_UNIT only → just `perms.unitId`.
 */
export function inviteTargets(
  perms: MyPermissions | null | undefined,
  spaces: SpaceDto[],
  labels: ReadonlyMap<UUID, string> = new Map(),
): InviteTargets {
  const none: InviteTargets = { canInvite: false, buildingWide: false, units: [], lockedUnitId: null };
  if (!perms) return none;
  const label = (s: SpaceDto) => labels.get(s.id) ?? s.name;
  const sortUnits = (list: UnitOption[]) => list.sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true }));

  if (canDo(perms, 'MEMBER_INVITE', null, spaces)) {
    const units = spaces.filter((s) => s.type === 'UNIT').map((s) => ({ id: s.id, label: label(s) }));
    return { canInvite: true, buildingWide: true, units: sortUnits(units), lockedUnitId: null };
  }
  const own = perms.unitId ? spaces.find((s) => s.id === perms.unitId) : undefined;
  if (own && canDo(perms, 'MEMBER_INVITE', own.id, spaces)) {
    return { canInvite: true, buildingWide: false, units: [{ id: own.id, label: label(own) }], lockedUnitId: own.id };
  }
  return none;
}

/** Roles I may grant: rank ≤ mine (server enforces ROLE_RANK_EXCEEDED). Highest first. */
export function grantableRoles(roles: RoleDto[], myRole: string | null | undefined): RoleDto[] {
  const sorted = [...roles].sort((a, b) => b.rank - a.rank);
  const mine = sorted.find((r) => r.code === myRole);
  return mine ? sorted.filter((r) => r.rank <= mine.rank) : sorted;
}

/** Tenant when available (most common invite), else the lowest grantable role. */
export function defaultInviteRole(roles: RoleDto[]): string {
  return roles.find((r) => r.code === 'TENANT')?.code ?? roles[roles.length - 1]?.code ?? '';
}

// ---------- form → request ----------

export type InviteValidity = '1' | '7' | '30' | 'custom';
/** How long the membership created by accepting lasts. */
export type MembershipEnd = 'none' | 'date' | 'days';

export interface InviteFormValue {
  role: string;
  unitId: string;
  usage: 'single' | 'multi';
  maxUses: number;
  validity: InviteValidity;
  /** Custom "valid until" local date (YYYY-MM-DD), used when validity = custom. */
  expiresAt: string;
  membershipEnd: MembershipEnd;
  /** Membership end date (YYYY-MM-DD) → end of that local day; used when membershipEnd = date. */
  membershipExpiresAt: string;
  /** Days of access counted from acceptance; used when membershipEnd = days. */
  membershipDurationDays: number;
  note: string;
}

/** Local "YYYY-MM-DD" for a Date (for <input type="date"> min/max). */
export function localDateString(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Latest instant an invitation may be valid until. */
export function maxInviteExpiry(now: Date): Date {
  return new Date(now.getTime() + MAX_INVITE_DAYS * DAY_MS - MAX_VALIDITY_MARGIN_MS);
}

/** When the invitation stops working: now + N days, or the end of the custom day (capped at 90 days). */
export function inviteExpiresAt(validity: InviteValidity, customDate: string, now: Date): Instant | null {
  if (validity !== 'custom') return new Date(now.getTime() + Number(validity) * DAY_MS).toISOString();
  const end = dateInputToInstant(customDate);
  if (!end) return null;
  const cap = maxInviteExpiry(now);
  return new Date(end).getTime() > cap.getTime() ? cap.toISOString() : end;
}

export function buildInvitationRequest(v: InviteFormValue, now: Date = new Date()): CreateInvitationRequest {
  const note = v.note.trim();
  return {
    role: v.role,
    unitId: v.unitId || null,
    maxUses: v.usage === 'single' ? 1 : Math.trunc(v.maxUses),
    expiresAt: inviteExpiresAt(v.validity, v.expiresAt, now),
    // The server accepts at most one of these two (400 if both); neither = no end.
    membershipExpiresAt: v.membershipEnd === 'date' ? dateInputToInstant(v.membershipExpiresAt) : null,
    membershipDurationDays: v.membershipEnd === 'days' ? Math.trunc(v.membershipDurationDays || DEFAULT_DURATION_DAYS) : null,
    note: note || null,
  };
}

// ---------- codes ----------

/** Accepts a bare code ("abcd-efgh") or a pasted join link ("https://…/join/ABCD-EFGH") and returns "ABCDEFGH". */
export function extractInviteCode(input: string): string {
  const m = /\/join\/([^/?#\s]+)/i.exec(input);
  return normalizeInviteCode(m ? decodeURIComponent(m[1]) : input);
}

// ---------- display ----------

export function formatDate(value: Instant | null | undefined): string {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

/** "7 days", "1 day", "5 hours", "expired". */
export function durationUntil(value: Instant, now: Date = new Date()): string {
  const ms = new Date(value).getTime() - now.getTime();
  if (!(ms > 0)) return 'expired';
  const days = Math.round(ms / DAY_MS);
  if (days >= 1) return `${days} day${days === 1 ? '' : 's'}`;
  const hours = Math.max(1, Math.round(ms / (60 * 60 * 1000)));
  return `${hours} hour${hours === 1 ? '' : 's'}`;
}

export interface SummaryInput {
  role: string;
  unitName: string | null;
  maxUses: number;
  useCount?: number;
  expiresAt: Instant;
  membershipExpiresAt: Instant | null;
  membershipDurationDays?: number | null;
}

/** "access until 31 Mar 2027" / "access for 7 days after joining" / "access with no end date". */
export function membershipAccessText(inv: { membershipExpiresAt: Instant | null; membershipDurationDays?: number | null }): string {
  if (inv.membershipExpiresAt) return `access until ${formatDate(inv.membershipExpiresAt)}`;
  const n = inv.membershipDurationDays;
  if (n) return `access for ${n} day${n === 1 ? '' : 's'} after joining`;
  return 'access with no end date';
}

/** "Joins as Tenant of 2B · access until 31 Mar 2027 · single use · link valid 7 days" */
export function invitationSummary(inv: SummaryInput, roleName: string, now: Date = new Date()): string {
  const parts = [
    inv.unitName ? `Joins as ${roleName} of ${inv.unitName}` : `Joins as ${roleName} (whole building)`,
    membershipAccessText(inv),
    inv.maxUses === 1 ? 'single use' : `up to ${inv.maxUses} people`,
    new Date(inv.expiresAt).getTime() > now.getTime() ? `link valid ${durationUntil(inv.expiresAt, now)}` : 'link expired',
  ];
  return parts.join(' · ');
}

export interface Badge {
  label: string;
  cls: string;
}

export function invitationStatusBadge(status: InvitationStatus): Badge {
  switch (status) {
    case 'ACTIVE':
      return { label: 'Active', cls: 'badge-ok' };
    case 'EXHAUSTED':
      return { label: 'Used up', cls: 'badge-info' };
    case 'EXPIRED':
      return { label: 'Expired', cls: 'badge-warn' };
    case 'REVOKED':
      return { label: 'Revoked', cls: 'badge-danger' };
    case 'INVALID':
      return { label: 'No longer valid', cls: 'badge-danger' };
    default:
      return { label: String(status), cls: '' };
  }
}

/** Member status, treating a past expiresAt as expired even before the server job flips it. */
export function memberStatusBadge(m: { status: string; expiresAt: Instant | null }, now: Date = new Date()): Badge {
  const past = !!m.expiresAt && new Date(m.expiresAt).getTime() <= now.getTime();
  if (m.status === 'EXPIRED' || (m.status === 'ACTIVE' && past)) return { label: 'Expired', cls: 'badge-warn' };
  if (m.status === 'REVOKED') return { label: 'Revoked', cls: 'badge-danger' };
  if (m.status === 'ACTIVE') return { label: 'Active', cls: 'badge-ok' };
  return { label: m.status, cls: '' };
}

// ---------- join page messages ----------

export interface JoinProblem {
  code: string;
  title: string;
  detail: string;
}

const JOIN_PROBLEMS: Record<string, Omit<JoinProblem, 'code'>> = {
  INVITATION_NOT_FOUND: {
    title: "We couldn't find that code",
    detail: 'Check for typos — codes have 8 letters and digits, like ABCD-EFGH.',
  },
  INVITATION_EXPIRED: {
    title: 'This invitation has expired',
    detail: 'Ask the person who invited you to send a new one.',
  },
  INVITATION_REVOKED: {
    title: 'This invitation was cancelled',
    detail: 'The person who created it revoked it. Ask them for a new one if you still need access.',
  },
  INVITATION_EXHAUSTED: {
    title: 'This invitation was already used',
    detail: 'It has been used as many times as allowed. Ask for a new one.',
  },
  INVITATION_INVALID: {
    title: 'This invitation is no longer valid',
    detail: 'The person who sent it can no longer invite people here. Ask for a new one.',
  },
  ALREADY_MEMBER: {
    title: "You're already a member of this building",
    detail: 'No need to accept again — just open the building.',
  },
  TOO_MANY_ATTEMPTS: {
    title: 'Too many attempts',
    detail: 'Please wait a few minutes before trying another code.',
  },
};

const STATUS_TO_CODE: Record<string, string> = {
  EXPIRED: 'INVITATION_EXPIRED',
  REVOKED: 'INVITATION_REVOKED',
  EXHAUSTED: 'INVITATION_EXHAUSTED',
  INVALID: 'INVITATION_INVALID',
};

/** Friendly message for an error code (from preview/accept) or a non-ACTIVE preview status. */
export function joinProblem(codeOrStatus: string): JoinProblem | null {
  const code = STATUS_TO_CODE[codeOrStatus] ?? codeOrStatus;
  const p = JOIN_PROBLEMS[code];
  return p ? { code, ...p } : null;
}

/** "?returnUrl=" values: only same-app absolute paths (no protocol-relative "//evil"). */
export function safeReturnUrl(value: string | null | undefined, fallback = '/buildings'): string {
  return value && value.startsWith('/') && !value.startsWith('//') && !value.startsWith('/\\') ? value : fallback;
}

/** Display name for a role code when /roles isn't available (signed out): "TENANT" → "Tenant". */
export function roleLabel(code: string, names?: ReadonlyMap<string, string>): string {
  const known = names?.get(code);
  if (known) return known;
  return code
    .toLowerCase()
    .split('_')
    .map((w) => (w ? w[0]!.toUpperCase() + w.slice(1) : w))
    .join(' ');
}
