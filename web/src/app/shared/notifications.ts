import { Instant, NotificationDto } from '@condo/shared';

export const NOTIFICATION_ICONS: Record<string, string> = {
  ISSUE_REPORTED: '🚩',
  ISSUE_STATUS_CHANGED: '➜',
  ISSUE_COMMENTED: '💬',
  ISSUE_MERGED: '⤵',
};

export function notificationIcon(type: string): string {
  return NOTIFICATION_ICONS[type] ?? '🔔';
}

/** "just now", "5 min ago", "3 h ago", "yesterday", "4 d ago", then a date. */
export function timeAgo(at: Instant, now: Date = new Date()): string {
  const ms = Math.max(0, now.getTime() - new Date(at).getTime());
  const min = Math.floor(ms / 60_000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min} min ago`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} h ago`;
  const days = dayDiff(new Date(at), now);
  if (days === 1) return 'yesterday';
  if (days < 7) return `${days} d ago`;
  return new Date(at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

/** Calendar days between two dates in local time (0 = same day). */
function dayDiff(a: Date, b: Date): number {
  const da = new Date(a.getFullYear(), a.getMonth(), a.getDate()).getTime();
  const db = new Date(b.getFullYear(), b.getMonth(), b.getDate()).getTime();
  return Math.round((db - da) / 86_400_000);
}

export interface NotificationGroup {
  label: string;
  items: NotificationDto[];
}

/** Today / Yesterday / This week / Older, keeping the server's newest-first order. */
export function groupByDay(items: readonly NotificationDto[], now: Date = new Date()): NotificationGroup[] {
  const groups: NotificationGroup[] = [];
  for (const n of items) {
    const d = dayDiff(new Date(n.createdAt), now);
    const label = d <= 0 ? 'Today' : d === 1 ? 'Yesterday' : d < 7 ? 'This week' : 'Older';
    const last = groups[groups.length - 1];
    if (last && last.label === label) last.items.push(n);
    else groups.push({ label, items: [n] });
  }
  return groups;
}

/** "(3) Issues · Condo" — strips any previous count first. */
export function titleWithCount(title: string, unread: number): string {
  const base = title.replace(/^\(\d+\+?\)\s*/, '');
  if (unread <= 0) return base;
  return `(${unread > 99 ? '99+' : unread}) ${base}`;
}

/** Badge text on the bell. */
export function badgeText(unread: number): string {
  return unread > 99 ? '99+' : String(unread);
}

/** Only follow app-relative links from notifications (never an absolute or protocol-relative URL). */
export function safeLink(link: string | null | undefined): string | null {
  return link && link.startsWith('/') && !link.startsWith('//') ? link : null;
}
