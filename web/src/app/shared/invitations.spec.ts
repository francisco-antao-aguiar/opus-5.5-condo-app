import { MyPermissions, RoleDto, SpaceDto } from '@condo/shared';
import {
  InviteFormValue,
  buildInvitationRequest,
  defaultInviteRole,
  durationUntil,
  extractInviteCode,
  grantableRoles,
  invitationStatusBadge,
  invitationSummary,
  inviteExpiresAt,
  inviteTargets,
  joinProblem,
  maxInviteExpiry,
  memberStatusBadge,
  membershipAccessText,
  roleLabel,
  safeReturnUrl,
} from './invitations';

const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date('2026-10-05T10:00:00Z');

function space(id: string, parentId: string | null, type: SpaceDto['type'], name: string): SpaceDto {
  return { id, buildingId: 'b', parentId, type, name, sortOrder: 0, visibility: null, effectiveVisibility: 'COMMON', depth: 0, version: 0, assetCount: 0 };
}

const spaces: SpaceDto[] = [
  space('root', null, 'BUILDING', 'Aurora'),
  space('f1', 'root', 'FLOOR', 'Floor 1'),
  space('u1b', 'f1', 'UNIT', '1B'),
  space('u1a', 'f1', 'UNIT', '1A'),
  space('room', 'u1a', 'ROOM', 'Kitchen'),
  space('lobby', 'root', 'COMMON_AREA', 'Lobby'),
];

function perms(scope: 'ANY' | 'OWN_UNIT' | null, unitId: string | null = null): MyPermissions {
  return {
    membershipId: 'm',
    role: scope === 'OWN_UNIT' ? 'OWNER' : 'ADMIN',
    governanceMode: 'MANAGED',
    unitId,
    actions: scope ? [{ action: 'MEMBER_INVITE', scope }] : [{ action: 'BUILDING_VIEW', scope: 'ANY' }],
  };
}

function form(patch: Partial<InviteFormValue> = {}): InviteFormValue {
  return {
    role: 'TENANT',
    unitId: 'u1a',
    usage: 'single',
    maxUses: 10,
    validity: '7',
    expiresAt: '',
    membershipEnd: 'none',
    membershipExpiresAt: '',
    membershipDurationDays: 7,
    note: '',
    ...patch,
  };
}

describe('inviteTargets (which units may I invite into)', () => {
  it('ANY scope: building-wide plus every UNIT, sorted by label', () => {
    const labels = new Map([
      ['u1a', 'Aurora › Floor 1 › 1A'],
      ['u1b', 'Aurora › Floor 1 › 1B'],
    ]);
    const t = inviteTargets(perms('ANY'), spaces, labels);
    expect(t.canInvite).toBe(true);
    expect(t.buildingWide).toBe(true);
    expect(t.lockedUnitId).toBeNull();
    expect(t.units).toEqual([
      { id: 'u1a', label: 'Aurora › Floor 1 › 1A' },
      { id: 'u1b', label: 'Aurora › Floor 1 › 1B' },
    ]);
  });

  it('OWN_UNIT only: just my unit, locked, no building-wide option', () => {
    const t = inviteTargets(perms('OWN_UNIT', 'u1a'), spaces);
    expect(t).toEqual({ canInvite: true, buildingWide: false, units: [{ id: 'u1a', label: '1A' }], lockedUnitId: 'u1a' });
  });

  it('OWN_UNIT without a unit, no permission, or no perms: cannot invite', () => {
    expect(inviteTargets(perms('OWN_UNIT', null), spaces).canInvite).toBe(false);
    expect(inviteTargets(perms(null), spaces).canInvite).toBe(false);
    expect(inviteTargets(null, spaces).canInvite).toBe(false);
  });
});

describe('roles', () => {
  const roles: RoleDto[] = [
    { code: 'TENANT', name: 'Tenant', rank: 10 },
    { code: 'ADMIN', name: 'Admin', rank: 100 },
    { code: 'OWNER', name: 'Owner', rank: 20 },
    { code: 'MANAGER', name: 'Manager', rank: 50 },
  ];

  it('offers only roles with rank ≤ mine, highest first', () => {
    expect(grantableRoles(roles, 'OWNER').map((r) => r.code)).toEqual(['OWNER', 'TENANT']);
    expect(grantableRoles(roles, 'ADMIN').map((r) => r.code)).toEqual(['ADMIN', 'MANAGER', 'OWNER', 'TENANT']);
  });

  it('defaults to Tenant, else the lowest role', () => {
    expect(defaultInviteRole(grantableRoles(roles, 'OWNER'))).toBe('TENANT');
    expect(defaultInviteRole([{ code: 'X', name: 'X', rank: 5 }, { code: 'Y', name: 'Y', rank: 1 }])).toBe('Y');
  });

  it('labels unknown role codes readably', () => {
    expect(roleLabel('TENANT')).toBe('Tenant');
    expect(roleLabel('BOARD_MEMBER')).toBe('Board Member');
    expect(roleLabel('TENANT', new Map([['TENANT', 'Inquilino']]))).toBe('Inquilino');
  });
});

describe('buildInvitationRequest (form → request)', () => {
  it('single use, 7 days, no membership end, empty note → nulls', () => {
    expect(buildInvitationRequest(form(), NOW)).toEqual({
      role: 'TENANT',
      unitId: 'u1a',
      maxUses: 1,
      expiresAt: new Date(NOW.getTime() + 7 * DAY).toISOString(),
      membershipExpiresAt: null,
      membershipDurationDays: null,
      note: null,
    });
  });

  it('sends exactly one of membershipExpiresAt / membershipDurationDays', () => {
    // Stale values in the hidden input must not leak into the request.
    const filled = { membershipExpiresAt: '2027-03-31', membershipDurationDays: 30 };
    const none = buildInvitationRequest(form({ ...filled, membershipEnd: 'none' }), NOW);
    expect([none.membershipExpiresAt, none.membershipDurationDays]).toEqual([null, null]);

    const date = buildInvitationRequest(form({ ...filled, membershipEnd: 'date' }), NOW);
    expect(date.membershipExpiresAt).not.toBeNull();
    expect(date.membershipDurationDays).toBeNull();

    const days = buildInvitationRequest(form({ ...filled, membershipEnd: 'days' }), NOW);
    expect(days.membershipExpiresAt).toBeNull();
    expect(days.membershipDurationDays).toBe(30);
  });

  it('days after joining defaults to 7', () => {
    expect(buildInvitationRequest(form({ membershipEnd: 'days' }), NOW).membershipDurationDays).toBe(7);
    expect(buildInvitationRequest(form({ membershipEnd: 'days', membershipDurationDays: 0 }), NOW).membershipDurationDays).toBe(7);
  });

  it('several people uses the max count; ignores it for single use', () => {
    expect(buildInvitationRequest(form({ usage: 'multi', maxUses: 25 }), NOW).maxUses).toBe(25);
    expect(buildInvitationRequest(form({ usage: 'single', maxUses: 25 }), NOW).maxUses).toBe(1);
  });

  it('building-wide invite sends unitId null; note is trimmed', () => {
    const req = buildInvitationRequest(form({ unitId: '', role: 'MANAGER', note: '  New manager  ' }), NOW);
    expect(req.unitId).toBeNull();
    expect(req.note).toBe('New manager');
  });

  it('membership end date becomes the end of that local day', () => {
    const req = buildInvitationRequest(form({ membershipEnd: 'date', membershipExpiresAt: '2027-03-31' }), NOW);
    const d = new Date(req.membershipExpiresAt!);
    expect([d.getFullYear(), d.getMonth() + 1, d.getDate(), d.getHours(), d.getMinutes(), d.getSeconds()]).toEqual([2027, 3, 31, 23, 59, 59]);
  });

  it('preset validities are now + N days', () => {
    expect(inviteExpiresAt('1', '', NOW)).toBe(new Date(NOW.getTime() + DAY).toISOString());
    expect(inviteExpiresAt('30', '', NOW)).toBe(new Date(NOW.getTime() + 30 * DAY).toISOString());
  });

  it('custom validity is the end of that local day, capped below 90 days', () => {
    const custom = new Date(inviteExpiresAt('custom', '2026-10-20', NOW)!);
    expect([custom.getDate(), custom.getHours(), custom.getMinutes()]).toEqual([20, 23, 59]);

    const far = inviteExpiresAt('custom', '2027-01-03', NOW)!; // end of day ~90.6 days away
    expect(far).toBe(maxInviteExpiry(NOW).toISOString());
    expect(new Date(far).getTime()).toBeLessThanOrEqual(NOW.getTime() + 90 * DAY);
    expect(inviteExpiresAt('custom', '', NOW)).toBeNull();
  });
});

describe('codes', () => {
  it('extracts a code from typed input or a pasted link', () => {
    expect(extractInviteCode('abcd-efgh')).toBe('ABCDEFGH');
    expect(extractInviteCode('  AbCd EfGh ')).toBe('ABCDEFGH');
    expect(extractInviteCode('http://localhost:4200/join/ABCD-EFGH?x=1')).toBe('ABCDEFGH');
    expect(extractInviteCode('buildingapp://join/abcdefgh')).toBe('ABCDEFGH');
  });

  it('only allows same-app return URLs', () => {
    expect(safeReturnUrl('/join/ABCDEFGH')).toBe('/join/ABCDEFGH');
    expect(safeReturnUrl('//evil.example')).toBe('/buildings');
    expect(safeReturnUrl('https://evil.example')).toBe('/buildings');
    expect(safeReturnUrl(undefined)).toBe('/buildings');
  });
});

describe('summary and status formatting', () => {
  it('describes an invitation in plain language', () => {
    const summary = invitationSummary(
      {
        role: 'TENANT',
        unitName: '2B',
        maxUses: 1,
        expiresAt: new Date(NOW.getTime() + 7 * DAY).toISOString(),
        membershipExpiresAt: new Date(2027, 2, 31, 23, 59, 59).toISOString(),
      },
      'Tenant',
      NOW,
    );
    expect(summary).toBe('Joins as Tenant of 2B · access until 31 Mar 2027 · single use · link valid 7 days');
  });

  it('covers building-wide, multi-use, no end date and expired links', () => {
    const summary = invitationSummary(
      { role: 'MANAGER', unitName: null, maxUses: 20, expiresAt: new Date(NOW.getTime() - 1000).toISOString(), membershipExpiresAt: null },
      'Manager',
      NOW,
    );
    expect(summary).toBe('Joins as Manager (whole building) · access with no end date · up to 20 people · link expired');
  });

  it('describes access counted from acceptance', () => {
    const base = { role: 'TENANT', unitName: '2B', maxUses: 1, expiresAt: new Date(NOW.getTime() + 7 * DAY).toISOString(), membershipExpiresAt: null };
    expect(invitationSummary({ ...base, membershipDurationDays: 7 }, 'Tenant', NOW)).toBe(
      'Joins as Tenant of 2B · access for 7 days after joining · single use · link valid 7 days',
    );
    expect(membershipAccessText({ membershipExpiresAt: null, membershipDurationDays: 1 })).toBe('access for 1 day after joining');
    expect(membershipAccessText({ membershipExpiresAt: null, membershipDurationDays: null })).toBe('access with no end date');
  });

  it('formats remaining durations', () => {
    expect(durationUntil(new Date(NOW.getTime() + DAY).toISOString(), NOW)).toBe('1 day');
    expect(durationUntil(new Date(NOW.getTime() + 5 * 3600_000).toISOString(), NOW)).toBe('5 hours');
    expect(durationUntil(new Date(NOW.getTime() - 1).toISOString(), NOW)).toBe('expired');
  });

  it('maps invitation statuses to badges', () => {
    expect(invitationStatusBadge('ACTIVE')).toEqual({ label: 'Active', cls: 'badge-ok' });
    expect(invitationStatusBadge('EXHAUSTED').label).toBe('Used up');
    expect(invitationStatusBadge('EXPIRED').cls).toBe('badge-warn');
    expect(invitationStatusBadge('REVOKED').cls).toBe('badge-danger');
  });

  it('treats EXPIRED status and a past expiresAt alike for members', () => {
    expect(memberStatusBadge({ status: 'EXPIRED', expiresAt: null }, NOW).label).toBe('Expired');
    expect(memberStatusBadge({ status: 'ACTIVE', expiresAt: '2026-10-01T00:00:00Z' }, NOW).label).toBe('Expired');
    expect(memberStatusBadge({ status: 'ACTIVE', expiresAt: '2027-10-01T00:00:00Z' }, NOW).label).toBe('Active');
    expect(memberStatusBadge({ status: 'REVOKED', expiresAt: null }, NOW).cls).toBe('badge-danger');
  });
});

describe('joinProblem', () => {
  it('maps error codes and non-active preview statuses to friendly messages', () => {
    expect(joinProblem('INVITATION_NOT_FOUND')?.title).toContain("couldn't find");
    expect(joinProblem('EXHAUSTED')).toMatchObject({ code: 'INVITATION_EXHAUSTED', title: expect.stringContaining('already used') });
    expect(joinProblem('EXPIRED')?.code).toBe('INVITATION_EXPIRED');
    expect(joinProblem('REVOKED')?.code).toBe('INVITATION_REVOKED');
    expect(joinProblem('INVITATION_INVALID')?.title).toContain('no longer valid');
    expect(joinProblem('ALREADY_MEMBER')?.code).toBe('ALREADY_MEMBER');
    expect(joinProblem('TOO_MANY_ATTEMPTS')?.title).toContain('Too many');
    expect(joinProblem('PERMISSION_DENIED')).toBeNull();
  });
});

describe('INVALID invitations (issuer lost the right to invite)', () => {
  it('has its own badge and join message', () => {
    expect(invitationStatusBadge('INVALID').label).toBe('No longer valid');
    expect(joinProblem('INVALID')?.code).toBe('INVITATION_INVALID');
  });
});
