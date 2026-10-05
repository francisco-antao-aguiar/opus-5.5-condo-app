import {
  Instant,
  IssueEventDto,
  IssuePhotoDto,
  IssueStatus,
  MyPermissions,
  OPEN_ISSUE_STATUSES,
  ReportIssueRequest,
  UUID,
} from '@condo/shared';

/** The server rejects page sizes above 100 (400 VALIDATION_FAILED). */
export const MAX_PAGE_SIZE = 100;

export const ISSUE_STATUSES: readonly IssueStatus[] = ['REPORTED', 'ACKNOWLEDGED', 'IN_PROGRESS', 'RESOLVED'];

export const STATUS_LABELS: Record<IssueStatus, string> = {
  REPORTED: 'Reported',
  ACKNOWLEDGED: 'Acknowledged',
  IN_PROGRESS: 'In progress',
  RESOLVED: 'Resolved',
};

export const STATUS_BADGE: Record<IssueStatus, string> = {
  REPORTED: 'badge-danger',
  ACKNOWLEDGED: 'badge-warn',
  IN_PROGRESS: 'badge-info',
  RESOLVED: 'badge-ok',
};

export function statusLabel(s: string): string {
  return STATUS_LABELS[s as IssueStatus] ?? s;
}

export function isOpenStatus(s: IssueStatus): boolean {
  return OPEN_ISSUE_STATUSES.includes(s);
}

// ---------- transitions ----------

/** Button text for moving an issue to `to`. */
export function transitionLabel(from: IssueStatus, to: IssueStatus): string {
  if (to === 'REPORTED') return 'Reopen';
  if (to === 'RESOLVED') return from === 'RESOLVED' ? 'Resolved' : 'Resolve';
  if (to === 'ACKNOWLEDGED') return 'Acknowledge';
  return 'Start work';
}

/**
 * Board quick actions (no per-issue capabilities on summaries): every forward step, or "Reopen" for
 * resolved issues. The server has the final word (409 INVALID_TRANSITION / 403).
 */
export function boardTransitions(status: IssueStatus): IssueStatus[] {
  if (status === 'RESOLVED') return ['REPORTED'];
  const i = ISSUE_STATUSES.indexOf(status);
  return ISSUE_STATUSES.slice(i + 1);
}

/** Detail actions come only from `me.allowedTransitions`, in lifecycle order, never the current status. */
export function detailTransitions(current: IssueStatus, allowed: readonly IssueStatus[]): IssueStatus[] {
  return ISSUE_STATUSES.filter((s) => s !== current && allowed.includes(s));
}

// ---------- views / filters ----------

export type IssueTab = 'shared' | 'mine' | 'unit' | 'triage';

export function canTriageAnywhere(perms: MyPermissions | null | undefined): boolean {
  return !!perms?.actions.some((a) => a.action === 'ISSUE_TRIAGE');
}

export function availableTabs(perms: MyPermissions | null | undefined): IssueTab[] {
  const tabs: IssueTab[] = ['shared', 'mine'];
  if (perms?.unitId) tabs.push('unit');
  if (canTriageAnywhere(perms)) tabs.push('triage');
  return tabs;
}

/** UI status filter → `status` query param: "open" (default), "all", or one status. */
export function statusParam(filter: string): string {
  if (!filter || filter === 'open') return 'open';
  if (filter === 'all') return 'all';
  return ISSUE_STATUSES.includes(filter as IssueStatus) ? filter : 'open';
}

// ---------- time ----------

/** Compact age: "just now", "5 min", "3 h", "2 d", "6 wk". */
export function formatAge(from: Instant, now: Date = new Date()): string {
  const ms = Math.max(0, now.getTime() - new Date(from).getTime());
  const min = Math.floor(ms / 60_000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  if (h < 48) return `${h} h`;
  const d = Math.floor(h / 24);
  if (d < 28) return `${d} d`;
  return `${Math.floor(d / 7)} wk`;
}

/** "3 h ago", or "just now". */
export function formatAgo(from: Instant, now: Date = new Date()): string {
  const a = formatAge(from, now);
  return a === 'just now' ? a : `${a} ago`;
}

/** "Stuck in Reported > 48h" (or "> 2 days" for whole days ≥ 72h). */
export function stuckLabel(thresholdHours: number): string {
  if (thresholdHours >= 72 && thresholdHours % 24 === 0) return `Stuck in Reported > ${thresholdHours / 24} days`;
  return `Stuck in Reported > ${thresholdHours}h`;
}

// ---------- timeline ----------

export interface EventView {
  icon: string;
  /** "Ana changed status: Reported → In progress" */
  text: string;
  comment: string | null;
  relatedIssueId: UUID | null;
}

export function eventView(e: IssueEventDto): EventView {
  const who = e.actorName || 'Someone';
  const rel = e.relatedIssueNumber != null ? `#${e.relatedIssueNumber}` : 'another issue';
  const base = { comment: e.comment, relatedIssueId: e.relatedIssueId };
  switch (e.type) {
    case 'REPORTED':
      return { ...base, icon: '🚩', text: `${who} reported this` };
    case 'STATUS_CHANGED':
      return {
        ...base,
        icon: e.toStatus === 'RESOLVED' ? '✅' : e.toStatus === 'REPORTED' ? '↺' : '➜',
        text: `${who} changed status: ${statusLabel(e.fromStatus ?? '?')} → ${statusLabel(e.toStatus ?? '?')}`,
      };
    case 'COMMENT':
      return { ...base, icon: '💬', text: `${who} commented` };
    case 'ME_TOO':
      return { ...base, icon: '🙋', text: `${who} is also affected` };
    case 'ME_TOO_WITHDRAWN':
      return { ...base, icon: '↩', text: `${who} is no longer affected` };
    case 'MERGED_INTO':
      return { ...base, icon: '⤵', text: `${who} merged this into ${rel}` };
    case 'MERGED_FROM':
      return { ...base, icon: '⤴', text: `${who} merged ${rel} into this` };
    case 'PHOTO_ADDED':
      return { ...base, icon: '📷', text: `${who} added a photo` };
    case 'SHARING_CHANGED':
      return { ...base, icon: '🔓', text: `${who} changed sharing with building management` };
    case 'RECLASSIFIED':
      return { ...base, icon: '🏷', text: `${who} re-filed this under a catalog problem` };
    default:
      return { ...base, icon: '•', text: `${who}: ${String(e.type).toLowerCase().replace(/_/g, ' ')}` };
  }
}

// ---------- photos ----------

export const MAX_PHOTOS = 5;
export const MAX_PHOTO_BYTES = 10 * 1024 * 1024;
export const PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];
const PHOTO_EXT = /\.(jpe?g|png|webp|heic|heif)$/i;

/** Client-side check before upload (the server sniffs content too). Returns an error message or null. */
export function validatePhoto(file: { name: string; type: string; size: number }): string | null {
  // Some browsers report HEIC with an empty type: fall back to the extension.
  const typeOk = file.type ? PHOTO_TYPES.includes(file.type.toLowerCase()) : PHOTO_EXT.test(file.name);
  if (!typeOk) return `${file.name}: use a JPEG, PNG, WebP or HEIC photo.`;
  if (file.size > MAX_PHOTO_BYTES) return `${file.name} is larger than 10 MB.`;
  if (file.size === 0) return `${file.name} is empty.`;
  return null;
}

/** Splits picked files into accepted ones (up to the remaining slots) and error messages. */
export function pickPhotos(
  files: { name: string; type: string; size: number }[],
  alreadyHave: number,
): { accepted: number[]; errors: string[] } {
  const accepted: number[] = [];
  const errors: string[] = [];
  files.forEach((f, i) => {
    const err = validatePhoto(f);
    if (err) errors.push(err);
    else if (alreadyHave + accepted.length >= MAX_PHOTOS) errors.push(`${f.name}: at most ${MAX_PHOTOS} photos per issue.`);
    else accepted.push(i);
  });
  return { accepted, errors };
}

/** Signed URLs last an hour; treat them as stale a minute early. */
export function photoUrlExpired(p: Pick<IssuePhotoDto, 'urlExpiresAt'>, now: Date = new Date()): boolean {
  return new Date(p.urlExpiresAt).getTime() - 60_000 <= now.getTime();
}

// ---------- reporting ----------

export interface ReportDraft {
  /** Chosen place (always set; for an asset it's the asset's space). */
  spaceId: UUID;
  /** null = "Something else here". */
  assetId: UUID | null;
  /** Catalog problem, or null for "Other…". */
  problemTypeId: UUID | null;
  otherText: string;
  note: string;
  sharedWithAdmins: boolean;
  /** Only PRIVATE places may set sharedWithAdmins. */
  spaceIsPrivate: boolean;
  clientRequestId: UUID;
}

/**
 * Builds the report body: exactly one of problemTypeId / otherText; spaceId only for "something else"
 * (with an asset the server derives the place); sharedWithAdmins only for private places.
 */
export function buildReportRequest(d: ReportDraft): ReportIssueRequest {
  const req: ReportIssueRequest = { clientRequestId: d.clientRequestId };
  if (d.assetId) req.assetId = d.assetId;
  else req.spaceId = d.spaceId;
  if (d.assetId && d.problemTypeId) req.problemTypeId = d.problemTypeId;
  else req.otherText = d.otherText.trim();
  const note = d.note.trim();
  if (note) req.note = note;
  if (d.spaceIsPrivate) req.sharedWithAdmins = d.sharedWithAdmins;
  return req;
}

/** Whether the draft can be submitted (mirrors the server's required fields). */
export function reportProblemReady(d: Pick<ReportDraft, 'assetId' | 'problemTypeId' | 'otherText'>): boolean {
  if (d.assetId && d.problemTypeId) return true;
  return d.otherText.trim().length > 0;
}

/** Catalog label suggested from an "Other" text: trimmed, no trailing punctuation, capitalised. */
export function promoteLabel(sample: string): string {
  const t = sample.trim().replace(/[\s.!?,;:…]+$/u, '');
  return t ? t[0]!.toUpperCase() + t.slice(1) : t;
}

export function newClientRequestId(): UUID {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  // Fallback for non-secure contexts (plain http on a LAN IP).
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}
