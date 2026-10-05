import { canDo, type Action, type MemberDto, type MyPermissions, type PermissionScope, type RoleCode, type RoleDto, type SpaceDto } from '@condo/shared';

/**
 * UI hints for invitations and member management. Mirrors the server rules in DESIGN.md §2;
 * the server re-checks everything, these only decide which buttons to show.
 */

/** Broadest scope I hold for an action, or null. */
export function scopeFor(perms: MyPermissions | undefined, action: Action): PermissionScope | null {
  const grants = perms?.actions.filter((g) => g.action === action) ?? [];
  if (grants.some((g) => g.scope === 'ANY')) return 'ANY';
  // OWN_UNIT is useless without a unit.
  if (grants.some((g) => g.scope === 'OWN_UNIT') && perms?.unitId) return 'OWN_UNIT';
  return null;
}

export function canInvite(perms: MyPermissions | undefined): boolean {
  return scopeFor(perms, 'MEMBER_INVITE') !== null;
}

export function rankOf(roles: RoleDto[] | undefined, code: RoleCode): number | undefined {
  return roles?.find((r) => r.code === code)?.rank;
}

/** Roles I may hand out: rank ≤ mine, highest first. */
export function grantableRoles(roles: RoleDto[] | undefined, myRole: RoleCode): RoleDto[] {
  const mine = rankOf(roles, myRole);
  if (mine === undefined || !roles) return [];
  return roles.filter((r) => r.rank <= mine).sort((a, b) => b.rank - a.rank);
}

/**
 * May I change/revoke this member? Needs MEMBER_MANAGE on the member's unit (OWN_UNIT holders:
 * only people inside their unit), the member must not outrank me, and it isn't me (that's "Leave").
 */
export function canManageMember(
  perms: MyPermissions | undefined,
  member: MemberDto,
  spaces: SpaceDto[] | undefined,
  roles: RoleDto[] | undefined,
): boolean {
  if (!perms || member.id === perms.membershipId) return false;
  if (!canDo(perms, 'MEMBER_MANAGE', member.unitId, spaces)) return false;
  const mine = rankOf(roles, perms.role);
  const theirs = rankOf(roles, member.role);
  if (mine === undefined || theirs === undefined) return false;
  return theirs <= mine;
}
