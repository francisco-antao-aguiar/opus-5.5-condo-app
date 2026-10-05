import { SpaceDto, SpaceNode, UUID } from '@condo/shared';

/** Ids of `rootId` and everything below it (uses parentId links, not the materialized path). */
export function subtreeIds(spaces: SpaceDto[], rootId: UUID): Set<UUID> {
  const children = new Map<UUID, UUID[]>();
  for (const s of spaces) {
    if (s.parentId) {
      const list = children.get(s.parentId);
      if (list) list.push(s.id);
      else children.set(s.parentId, [s.id]);
    }
  }
  const out = new Set<UUID>();
  const stack = [rootId];
  while (stack.length) {
    const id = stack.pop()!;
    if (out.has(id)) continue;
    out.add(id);
    stack.push(...(children.get(id) ?? []));
  }
  return out;
}

/** Human label "Building › Floor 1 › 1A" for each space id. */
export function pathLabels(spaces: SpaceDto[]): Map<UUID, string> {
  const byId = new Map(spaces.map((s) => [s.id, s]));
  const cache = new Map<UUID, string>();
  const label = (s: SpaceDto, guard = 0): string => {
    const hit = cache.get(s.id);
    if (hit !== undefined) return hit;
    const parent = s.parentId ? byId.get(s.parentId) : undefined;
    const value = parent && guard < 64 ? `${label(parent, guard + 1)} › ${s.name}` : s.name;
    cache.set(s.id, value);
    return value;
  };
  spaces.forEach((s) => label(s));
  return cache;
}

/**
 * Valid "Move to…" targets for `nodeId`: every space except the node itself, its descendants
 * (would create a cycle) and its current parent (no-op). `allowed` filters by permission.
 */
export function moveTargets(
  spaces: SpaceDto[],
  nodeId: UUID,
  allowed: (target: SpaceDto) => boolean = () => true,
): SpaceDto[] {
  const node = spaces.find((s) => s.id === nodeId);
  if (!node || node.parentId === null) return [];
  const excluded = subtreeIds(spaces, nodeId);
  return spaces.filter((s) => !excluded.has(s.id) && s.id !== node.parentId && allowed(s));
}

export interface SortUpdate {
  id: UUID;
  sortOrder: number;
}

/**
 * sortOrder updates needed to move `id` one step up (-1) or down (+1) among `siblings`
 * (already in display order). Swaps with the neighbour when their sortOrders differ; otherwise
 * (ties, e.g. everything at 0) renumbers the siblings 0,10,20… and returns only the changed ones.
 */
export function reorderPlan(siblings: SpaceDto[], id: UUID, dir: -1 | 1): SortUpdate[] {
  const i = siblings.findIndex((s) => s.id === id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= siblings.length) return [];
  const a = siblings[i];
  const b = siblings[j];
  if (a.sortOrder !== b.sortOrder) {
    return [
      { id: a.id, sortOrder: b.sortOrder },
      { id: b.id, sortOrder: a.sortOrder },
    ];
  }
  const order = siblings.map((s) => s.id);
  [order[i], order[j]] = [order[j], order[i]];
  const current = new Map(siblings.map((s) => [s.id, s.sortOrder]));
  return order
    .map((sid, idx) => ({ id: sid, sortOrder: idx * 10 }))
    .filter((u) => current.get(u.id) !== u.sortOrder);
}

export interface FlatRow {
  node: SpaceNode;
  depth: number;
  hasChildren: boolean;
  expanded: boolean;
  /** Matches the filter text itself (vs. shown only as an ancestor of a match). */
  match: boolean;
}

/**
 * Flattens the tree into the rows to render. Without a filter, children of collapsed nodes are skipped.
 * With a filter, shows matching nodes plus their ancestors (expanded), regardless of collapse state.
 */
export function flattenTree(root: SpaceNode | null, expanded: ReadonlySet<UUID>, filter: string): FlatRow[] {
  if (!root) return [];
  const rows: FlatRow[] = [];
  const q = filter.trim().toLowerCase();

  if (!q) {
    const walk = (n: SpaceNode, depth: number) => {
      const open = expanded.has(n.id);
      rows.push({ node: n, depth, hasChildren: n.children.length > 0, expanded: open, match: false });
      if (open) n.children.forEach((c) => walk(c, depth + 1));
    };
    walk(root, 0);
    return rows;
  }

  const keep = new Set<UUID>();
  const mark = (n: SpaceNode): boolean => {
    let any = n.name.toLowerCase().includes(q);
    for (const c of n.children) if (mark(c)) any = true;
    if (any) keep.add(n.id);
    return any;
  };
  mark(root);
  const walk = (n: SpaceNode, depth: number) => {
    if (!keep.has(n.id)) return;
    const visibleChildren = n.children.filter((c) => keep.has(c.id));
    rows.push({
      node: n,
      depth,
      hasChildren: n.children.length > 0,
      expanded: visibleChildren.length > 0,
      match: n.name.toLowerCase().includes(q),
    });
    visibleChildren.forEach((c) => walk(c, depth + 1));
  };
  walk(root, 0);
  return rows;
}
