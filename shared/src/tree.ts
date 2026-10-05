import type { Action, MyPermissions, SpaceDto, SpaceType, UUID } from './types.js';

export interface SpaceNode extends SpaceDto {
  children: SpaceNode[];
}

/** Builds the tree from the flat list returned by GET /spaces. Children sorted by sortOrder, then name. */
export function buildSpaceTree(spaces: SpaceDto[]): SpaceNode | null {
  const nodes = new Map<UUID, SpaceNode>();
  for (const s of spaces) nodes.set(s.id, { ...s, children: [] });
  let root: SpaceNode | null = null;
  for (const node of nodes.values()) {
    if (node.parentId === null) root = node;
    else nodes.get(node.parentId)?.children.push(node);
  }
  const sort = (n: SpaceNode) => {
    n.children.sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, undefined, { numeric: true }));
    n.children.forEach(sort);
  };
  if (root) sort(root);
  return root;
}

/** Ancestors from root to the given node (inclusive). */
export function spacePath(spaces: SpaceDto[], id: UUID): SpaceDto[] {
  const byId = new Map(spaces.map((s) => [s.id, s]));
  const out: SpaceDto[] = [];
  let cur = byId.get(id);
  while (cur) {
    out.unshift(cur);
    cur = cur.parentId ? byId.get(cur.parentId) : undefined;
  }
  return out;
}

/** True when `id` is `ancestorId` or lies below it. */
export function isWithin(spaces: SpaceDto[], id: UUID, ancestorId: UUID): boolean {
  return spacePath(spaces, id).some((s) => s.id === ancestorId);
}

/**
 * Client-side mirror of PermissionService.can — for hiding buttons only.
 * The server is the authority and re-checks every request.
 */
export function canDo(perms: MyPermissions | undefined | null, action: Action, targetId?: UUID | null, spaces?: SpaceDto[]): boolean {
  if (!perms) return false;
  return perms.actions.some((g) => {
    if (g.action !== action) return false;
    if (g.scope === 'ANY') return true;
    if (!targetId || !perms.unitId || !spaces) return false;
    return isWithin(spaces, targetId, perms.unitId);
  });
}

export const SPACE_TYPE_LABELS: Record<SpaceType, string> = {
  BUILDING: 'Building',
  FLOOR: 'Floor',
  UNIT: 'Unit',
  ROOM: 'Room',
  COMMON_AREA: 'Common area',
};
