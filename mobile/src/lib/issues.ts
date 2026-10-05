import { ApiError, type IssueEventDto, type IssueStatus } from '@condo/shared';
import type { Palette } from '../theme';

export const STATUS_LABEL: Record<IssueStatus, string> = {
  REPORTED: 'Reported',
  ACKNOWLEDGED: 'Acknowledged',
  IN_PROGRESS: 'In progress',
  RESOLVED: 'Resolved',
};

export function statusLabel(s: IssueStatus): string {
  return STATUS_LABEL[s] ?? s;
}

export function statusColors(s: IssueStatus, colors: Palette): { color: string; background: string } {
  switch (s) {
    case 'REPORTED':
      return { color: colors.warning, background: colors.surfaceAlt };
    case 'ACKNOWLEDGED':
      return { color: colors.primary, background: colors.surfaceAlt };
    case 'IN_PROGRESS':
      return { color: colors.private, background: colors.privateSoft };
    case 'RESOLVED':
      return { color: colors.success, background: colors.commonSoft };
    default:
      return { color: colors.textMuted, background: colors.surfaceAlt };
  }
}

/** Big-button label for moving an issue from `from` to `to`. */
export function transitionLabel(from: IssueStatus, to: IssueStatus): string {
  if (to === 'RESOLVED') return 'Mark resolved';
  if (from === 'RESOLVED' && to === 'REPORTED') return 'Reopen';
  if (to === 'ACKNOWLEDGED') return 'Acknowledge';
  if (to === 'IN_PROGRESS') return 'Start work';
  return 'Set to ' + statusLabel(to);
}

export function affectedText(n: number): string {
  if (n <= 1) return '1 person affected';
  return `${n} people affected`;
}

/** One line per timeline event ("Ana marked it resolved"). */
export function eventText(e: IssueEventDto): string {
  const who = e.actorName;
  switch (e.type) {
    case 'REPORTED':
      return `${who} reported it`;
    case 'STATUS_CHANGED':
      if (e.toStatus === 'REPORTED' && e.fromStatus === 'RESOLVED') return `${who} reopened it`;
      return `${who} changed the status to ${e.toStatus ? statusLabel(e.toStatus) : '?'}`;
    case 'COMMENT':
      return `${who} commented`;
    case 'ME_TOO':
      return `${who} is affected too`;
    case 'ME_TOO_WITHDRAWN':
      return `${who} is no longer affected`;
    case 'MERGED_INTO':
      return `${who} merged it into #${e.relatedIssueNumber ?? '?'}`;
    case 'MERGED_FROM':
      return `${who} merged #${e.relatedIssueNumber ?? '?'} into this one`;
    case 'PHOTO_ADDED':
      return `${who} added a photo`;
    case 'SHARING_CHANGED':
      return `${who} changed sharing with building management`;
    case 'RECLASSIFIED':
      return `${who} re-filed it under a catalog problem`;
    default:
      return `${who}: ${String(e.type).toLowerCase().replace(/_/g, ' ')}`;
  }
}

export function problemCode(e: unknown): string | undefined {
  return e instanceof ApiError ? e.problem.code : undefined;
}

export function formatDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

/** "5 min ago", "3 h ago", "2 d ago", then a date. */
export function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (Number.isNaN(ms)) return '';
  const min = Math.round(ms / 60000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min} min ago`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.round(h / 24);
  if (d < 7) return `${d} d ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}
