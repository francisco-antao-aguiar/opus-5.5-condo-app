import { IssueEventDto, MyPermissions } from '@condo/shared';
import {
  ReportDraft,
  availableTabs,
  boardTransitions,
  buildReportRequest,
  detailTransitions,
  eventView,
  formatAge,
  formatAgo,
  newClientRequestId,
  photoUrlExpired,
  pickPhotos,
  promoteLabel,
  reportProblemReady,
  statusParam,
  stuckLabel,
  transitionLabel,
  validatePhoto,
} from './issues';

const NOW = new Date('2026-10-05T12:00:00Z');

function draft(patch: Partial<ReportDraft> = {}): ReportDraft {
  return {
    spaceId: 'lobby',
    assetId: 'light-1',
    problemTypeId: 'flicker',
    otherText: '',
    note: '',
    sharedWithAdmins: false,
    spaceIsPrivate: false,
    clientRequestId: 'req-1',
    ...patch,
  };
}

describe('buildReportRequest', () => {
  it('asset + catalog problem: no spaceId, no otherText', () => {
    expect(buildReportRequest(draft())).toEqual({ clientRequestId: 'req-1', assetId: 'light-1', problemTypeId: 'flicker' });
  });

  it('asset + Other: otherText only (trimmed), never both', () => {
    const req = buildReportRequest(draft({ problemTypeId: null, otherText: '  Buzzing at night ' }));
    expect(req).toEqual({ clientRequestId: 'req-1', assetId: 'light-1', otherText: 'Buzzing at night' });
    expect('problemTypeId' in req).toBe(false);
  });

  it('"something else here": spaceId + otherText, even if a problem was picked before', () => {
    const req = buildReportRequest(draft({ assetId: null, problemTypeId: 'flicker', otherText: 'Water on the floor' }));
    expect(req).toEqual({ clientRequestId: 'req-1', spaceId: 'lobby', otherText: 'Water on the floor' });
  });

  it('note only when non-empty; sharedWithAdmins only for private places', () => {
    expect(buildReportRequest(draft({ note: '  ' })).note).toBeUndefined();
    expect(buildReportRequest(draft({ note: ' since Monday ' })).note).toBe('since Monday');
    expect('sharedWithAdmins' in buildReportRequest(draft({ sharedWithAdmins: true }))).toBe(false);
    expect(buildReportRequest(draft({ spaceIsPrivate: true, sharedWithAdmins: true })).sharedWithAdmins).toBe(true);
    expect(buildReportRequest(draft({ spaceIsPrivate: true })).sharedWithAdmins).toBe(false);
  });

  it('ready only when a problem or text is given', () => {
    expect(reportProblemReady({ assetId: 'a', problemTypeId: 'p', otherText: '' })).toBe(true);
    expect(reportProblemReady({ assetId: 'a', problemTypeId: null, otherText: ' ' })).toBe(false);
    expect(reportProblemReady({ assetId: null, problemTypeId: 'p', otherText: '' })).toBe(false);
    expect(reportProblemReady({ assetId: null, problemTypeId: null, otherText: 'x' })).toBe(true);
  });

  it('generates distinct UUID-shaped client request ids', () => {
    const a = newClientRequestId();
    expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(newClientRequestId()).not.toBe(a);
  });
});

describe('transitions', () => {
  it('board: every forward step, or Reopen when resolved', () => {
    expect(boardTransitions('REPORTED')).toEqual(['ACKNOWLEDGED', 'IN_PROGRESS', 'RESOLVED']);
    expect(boardTransitions('ACKNOWLEDGED')).toEqual(['IN_PROGRESS', 'RESOLVED']);
    expect(boardTransitions('IN_PROGRESS')).toEqual(['RESOLVED']);
    expect(boardTransitions('RESOLVED')).toEqual(['REPORTED']);
  });

  it('detail: only what the server allows, in lifecycle order, never the current status', () => {
    expect(detailTransitions('REPORTED', ['RESOLVED', 'ACKNOWLEDGED', 'REPORTED'])).toEqual(['ACKNOWLEDGED', 'RESOLVED']);
    expect(detailTransitions('IN_PROGRESS', [])).toEqual([]);
  });

  it('labels', () => {
    expect(transitionLabel('RESOLVED', 'REPORTED')).toBe('Reopen');
    expect(transitionLabel('REPORTED', 'ACKNOWLEDGED')).toBe('Acknowledge');
    expect(transitionLabel('ACKNOWLEDGED', 'IN_PROGRESS')).toBe('Start work');
    expect(transitionLabel('IN_PROGRESS', 'RESOLVED')).toBe('Resolve');
  });
});

describe('views and filters', () => {
  const perms = (actions: string[], unitId: string | null = null): MyPermissions => ({
    membershipId: 'm',
    role: 'X',
    governanceMode: 'MANAGED',
    unitId,
    actions: actions.map((a) => ({ action: a as never, scope: 'ANY' })),
  });

  it('shows My unit only with a unit, Triage only with ISSUE_TRIAGE', () => {
    expect(availableTabs(perms(['ISSUE_REPORT']))).toEqual(['shared', 'mine']);
    expect(availableTabs(perms(['ISSUE_REPORT'], 'u2b'))).toEqual(['shared', 'mine', 'unit']);
    expect(availableTabs(perms(['ISSUE_TRIAGE']))).toEqual(['shared', 'mine', 'triage']);
  });

  it('maps the status filter', () => {
    expect(statusParam('')).toBe('open');
    expect(statusParam('all')).toBe('all');
    expect(statusParam('IN_PROGRESS')).toBe('IN_PROGRESS');
    expect(statusParam('bogus')).toBe('open');
  });
});

describe('time formatting', () => {
  const ago = (ms: number) => new Date(NOW.getTime() - ms).toISOString();
  it('formats ages compactly', () => {
    expect(formatAge(ago(10_000), NOW)).toBe('just now');
    expect(formatAge(ago(5 * 60_000), NOW)).toBe('5 min');
    expect(formatAge(ago(3 * 3_600_000), NOW)).toBe('3 h');
    expect(formatAge(ago(47 * 3_600_000), NOW)).toBe('47 h');
    expect(formatAge(ago(3 * 86_400_000), NOW)).toBe('3 d');
    expect(formatAge(ago(60 * 86_400_000), NOW)).toBe('8 wk');
    expect(formatAge(new Date(NOW.getTime() + 5000).toISOString(), NOW)).toBe('just now');
  });

  it('adds "ago" except for just now', () => {
    expect(formatAgo(ago(3 * 3_600_000), NOW)).toBe('3 h ago');
    expect(formatAgo(ago(1000), NOW)).toBe('just now');
  });

  it('labels the stuck threshold', () => {
    expect(stuckLabel(48)).toBe('Stuck in Reported > 48h');
    expect(stuckLabel(72)).toBe('Stuck in Reported > 3 days');
    expect(stuckLabel(30)).toBe('Stuck in Reported > 30h');
  });

  it('treats photo URLs as expired a minute early', () => {
    expect(photoUrlExpired({ urlExpiresAt: new Date(NOW.getTime() + 30_000).toISOString() }, NOW)).toBe(true);
    expect(photoUrlExpired({ urlExpiresAt: new Date(NOW.getTime() + 600_000).toISOString() }, NOW)).toBe(false);
  });
});

describe('timeline text', () => {
  const ev = (patch: Partial<IssueEventDto>): IssueEventDto => ({
    id: 'e',
    type: 'COMMENT',
    actorName: 'Ana',
    fromStatus: null,
    toStatus: null,
    comment: null,
    relatedIssueId: null,
    relatedIssueNumber: null,
    createdAt: NOW.toISOString(),
    ...patch,
  });

  it('describes each event type', () => {
    expect(eventView(ev({ type: 'REPORTED' })).text).toBe('Ana reported this');
    expect(eventView(ev({ type: 'STATUS_CHANGED', fromStatus: 'REPORTED', toStatus: 'IN_PROGRESS' })).text).toBe(
      'Ana changed status: Reported → In progress',
    );
    expect(eventView(ev({ type: 'STATUS_CHANGED', fromStatus: 'IN_PROGRESS', toStatus: 'RESOLVED' })).icon).toBe('✅');
    expect(eventView(ev({ type: 'COMMENT', comment: 'On it' }))).toMatchObject({ text: 'Ana commented', comment: 'On it' });
    expect(eventView(ev({ type: 'ME_TOO' })).text).toBe('Ana is also affected');
    expect(eventView(ev({ type: 'ME_TOO_WITHDRAWN' })).text).toBe('Ana is no longer affected');
    expect(eventView(ev({ type: 'MERGED_INTO', relatedIssueId: 'i7', relatedIssueNumber: 7 }))).toMatchObject({
      text: 'Ana merged this into #7',
      relatedIssueId: 'i7',
    });
    expect(eventView(ev({ type: 'MERGED_FROM', relatedIssueNumber: 9 })).text).toBe('Ana merged #9 into this');
    expect(eventView(ev({ type: 'PHOTO_ADDED' })).text).toBe('Ana added a photo');
    expect(eventView(ev({ type: 'SHARING_CHANGED' })).text).toContain('sharing');
    expect(eventView(ev({ type: 'RECLASSIFIED' })).text).toContain('re-filed');
    expect(eventView(ev({ type: 'SOMETHING_NEW' as never })).text).toBe('Ana: something new');
  });
});

describe('promoteLabel', () => {
  it('suggests a clean catalog label from an Other text', () => {
    expect(promoteLabel('hinge squeaks!')).toBe('Hinge squeaks');
    expect(promoteLabel('  remote broken... ')).toBe('Remote broken');
    expect(promoteLabel('')).toBe('');
  });
});

describe('photo validation', () => {
  const MB = 1024 * 1024;
  it('accepts jpeg/png/webp/heic up to 10 MB', () => {
    expect(validatePhoto({ name: 'a.jpg', type: 'image/jpeg', size: 2 * MB })).toBeNull();
    expect(validatePhoto({ name: 'a.png', type: 'image/png', size: 10 * MB })).toBeNull();
    expect(validatePhoto({ name: 'a.webp', type: 'image/webp', size: 1 })).toBeNull();
    expect(validatePhoto({ name: 'IMG_1.HEIC', type: '', size: MB })).toBeNull();
  });

  it('rejects other types, oversize and empty files', () => {
    expect(validatePhoto({ name: 'a.gif', type: 'image/gif', size: MB })).toContain('JPEG');
    expect(validatePhoto({ name: 'doc.pdf', type: '', size: MB })).toContain('JPEG');
    expect(validatePhoto({ name: 'big.jpg', type: 'image/jpeg', size: 10 * MB + 1 })).toContain('10 MB');
    expect(validatePhoto({ name: 'z.jpg', type: 'image/jpeg', size: 0 })).toContain('empty');
  });

  it('caps the number of photos at 5 including existing ones', () => {
    const f = (name: string) => ({ name, type: 'image/jpeg', size: 100 });
    const res = pickPhotos([f('1.jpg'), { name: 'x.gif', type: 'image/gif', size: 1 }, f('2.jpg'), f('3.jpg')], 3);
    expect(res.accepted).toEqual([0, 2]);
    expect(res.errors).toHaveLength(2);
    expect(res.errors[1]).toContain('at most 5');
  });
});
