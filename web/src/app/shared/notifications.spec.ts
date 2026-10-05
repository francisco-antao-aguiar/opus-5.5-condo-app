import { NotificationDto } from '@condo/shared';
import { badgeText, groupByDay, notificationIcon, safeLink, timeAgo, titleWithCount } from './notifications';

// Local-time "now" so day boundaries don't depend on the machine's time zone.
const NOW = new Date(2026, 9, 5, 15, 0, 0);
const at = (d: Date) => d.toISOString();
const minutesAgo = (m: number) => at(new Date(NOW.getTime() - m * 60_000));

function note(id: string, createdAt: string): NotificationDto {
  return {
    id,
    type: 'ISSUE_STATUS_CHANGED',
    buildingId: 'b',
    buildingName: 'Aurora',
    issueId: 'i',
    title: 't',
    body: 'b',
    link: '/buildings/b/issues/i',
    read: false,
    createdAt,
  };
}

describe('timeAgo', () => {
  it('formats recent times compactly', () => {
    expect(timeAgo(minutesAgo(0.2), NOW)).toBe('just now');
    expect(timeAgo(minutesAgo(5), NOW)).toBe('5 min ago');
    expect(timeAgo(minutesAgo(180), NOW)).toBe('3 h ago');
  });

  it('uses calendar days after 24 h, then a date', () => {
    expect(timeAgo(at(new Date(2026, 9, 4, 9, 0)), NOW)).toBe('yesterday');
    expect(timeAgo(at(new Date(2026, 9, 1, 12, 0)), NOW)).toBe('4 d ago');
    expect(timeAgo(at(new Date(2026, 8, 20, 12, 0)), NOW)).toBe('20 Sept');
  });
});

describe('groupByDay', () => {
  it('groups newest-first notifications into Today / Yesterday / This week / Older', () => {
    const items = [
      note('a', minutesAgo(10)),
      note('b', at(new Date(2026, 9, 5, 0, 30))),
      note('c', at(new Date(2026, 9, 4, 23, 0))),
      note('d', at(new Date(2026, 9, 2, 8, 0))),
      note('e', at(new Date(2026, 8, 1, 8, 0))),
    ];
    expect(groupByDay(items, NOW).map((g) => [g.label, g.items.map((n) => n.id).join('')])).toEqual([
      ['Today', 'ab'],
      ['Yesterday', 'c'],
      ['This week', 'd'],
      ['Older', 'e'],
    ]);
    expect(groupByDay([], NOW)).toEqual([]);
  });
});

describe('title, badge and links', () => {
  it('prefixes the tab title with the unread count, replacing an old one', () => {
    expect(titleWithCount('Issues · Condo', 3)).toBe('(3) Issues · Condo');
    expect(titleWithCount('(3) Issues · Condo', 5)).toBe('(5) Issues · Condo');
    expect(titleWithCount('(5) Issues · Condo', 0)).toBe('Issues · Condo');
    expect(titleWithCount('Condo', 150)).toBe('(99+) Condo');
    expect(titleWithCount('(99+) Condo', 1)).toBe('(1) Condo');
  });

  it('caps the badge and picks icons', () => {
    expect(badgeText(7)).toBe('7');
    expect(badgeText(120)).toBe('99+');
    expect(notificationIcon('ISSUE_COMMENTED')).toBe('💬');
    expect(notificationIcon('SOMETHING_NEW')).toBe('🔔');
  });

  it('only follows app-relative links', () => {
    expect(safeLink('/buildings/b/issues/i')).toBe('/buildings/b/issues/i');
    expect(safeLink('//evil.example/x')).toBeNull();
    expect(safeLink('https://evil.example')).toBeNull();
    expect(safeLink(null)).toBeNull();
  });
});
