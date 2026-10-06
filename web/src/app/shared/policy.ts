import { Action, GovernanceModeDto, PermissionScope, RoleCode, RoleDto } from '@condo/shared';

export const ACTION_LABELS: Record<Action, string> = {
  BUILDING_VIEW: 'View building',
  BUILDING_SETTINGS: 'Building settings',
  STRUCTURE_EDIT: 'Edit structure',
  ASSET_CREATE: 'Add assets',
  ASSET_EDIT: 'Edit assets',
  ASSET_DELETE: 'Delete assets',
  ISSUE_REPORT: 'Report issues',
  ISSUE_TRIAGE: 'Triage issues',
  CATALOG_EDIT: 'Edit problem catalog',
  MEMBER_INVITE: 'Invite members',
  MEMBER_MANAGE: 'Manage members',
  MAINTENANCE_VIEW: 'View maintenance',
  MAINTENANCE_MANAGE: 'Manage maintenance plans',
  BOOKING_CREATE: 'Request bookings',
  BOOKING_MANAGE: 'Approve bookings & policies',
  COST_VIEW: 'View costs',
  COST_MANAGE: 'Manage costs',
};

const ACTION_ORDER = Object.keys(ACTION_LABELS) as Action[];

export interface PolicyMatrix {
  actions: Action[];
  roles: RoleCode[];
  /** cell(modeCode, action, role) → scope, or null when not granted. */
  cell: (mode: string, action: Action, role: RoleCode) => PermissionScope | null;
  /** True when the action/role cell differs between two modes. */
  differs: (modeA: string, modeB: string, action: Action, role: RoleCode) => boolean;
}

/**
 * Builds an actions × roles grid for every mode. Roles come from /roles (highest rank first) plus any
 * role that appears only in rules; actions follow the canonical order, then unknown actions.
 */
export function buildPolicyMatrix(modes: GovernanceModeDto[], roles: RoleDto[]): PolicyMatrix {
  const lookup = new Map<string, PermissionScope>();
  const actionSet = new Set<Action>();
  const roleSet = new Set<RoleCode>();
  for (const m of modes) {
    for (const r of m.rules) {
      lookup.set(`${m.code}|${r.action}|${r.role}`, r.scope);
      actionSet.add(r.action);
      roleSet.add(r.role);
    }
  }
  const orderedRoles = [...roles].sort((a, b) => b.rank - a.rank).map((r) => r.code);
  const extraRoles = [...roleSet].filter((r) => !orderedRoles.includes(r));
  const actions = [
    ...ACTION_ORDER.filter((a) => actionSet.has(a)),
    ...[...actionSet].filter((a) => !ACTION_ORDER.includes(a)),
  ];
  const cell = (mode: string, action: Action, role: RoleCode) => lookup.get(`${mode}|${action}|${role}`) ?? null;
  return {
    actions,
    roles: [...orderedRoles, ...extraRoles],
    cell,
    differs: (a, b, action, role) => cell(a, action, role) !== cell(b, action, role),
  };
}
