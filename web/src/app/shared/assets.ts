import {
  Action,
  AssetQuery,
  AssetTypeDto,
  MyPermissions,
  ProblemTypeDto,
  SpaceDto,
  SpaceNode,
  SpaceType,
  UUID,
  UpdateProblemTypeRequest,
  buildSpaceTree,
  canDo,
} from '@condo/shared';
import { SortUpdate } from './space-utils';

export const ASSET_NAME_MAX = 200;
export const ASSET_NOTES_MAX = 1000;
export const BULK_MAX = 500;

// ---------- icons ----------

const ASSET_ICONS: Record<string, string> = {
  bulb: '💡',
  elevator: '🛗',
  door: '🚪',
  gate: '⛩',
  intercom: '📞',
  boiler: '🔥',
  plumbing: '🚰',
  window: '🪟',
  fire: '🧯',
  tool: '🔧',
};
export const FALLBACK_ASSET_ICON = '🔧';

/** Icon key from AssetTypeDto.icon → glyph. Unknown keys (server reference data may grow) get a wrench. */
export function assetTypeIcon(icon: string | null | undefined): string {
  return (icon && ASSET_ICONS[icon.toLowerCase()]) || FALLBACK_ASSET_ICON;
}

// ---------- spaces ----------

export interface SpaceOption {
  space: SpaceDto;
  depth: number;
  /** "Floor 2 › 2B" — path below the root (the root itself is its own name). */
  label: string;
}

/** All spaces in tree order (root first, children by sortOrder), with depth for indentation. */
export function spacesInTreeOrder(spaces: SpaceDto[]): SpaceOption[] {
  const root = buildSpaceTree(spaces);
  if (!root) return [];
  const out: SpaceOption[] = [];
  const walk = (n: SpaceNode, depth: number, prefix: string) => {
    const label = depth === 0 ? n.name : prefix ? `${prefix} › ${n.name}` : n.name;
    out.push({ space: n, depth, label });
    n.children.forEach((c) => walk(c, depth + 1, depth === 0 ? '' : label));
  };
  walk(root, 0, '');
  return out;
}

/** Ids of the spaces where `action` is allowed (client hint; the server re-checks). */
export function allowedSpaceIds(perms: MyPermissions | null | undefined, spaces: SpaceDto[], action: Action): Set<UUID> {
  const ids = new Set<UUID>();
  for (const s of spaces) if (canDo(perms, action, s.id, spaces)) ids.add(s.id);
  return ids;
}

/**
 * Spaces an asset may be placed in by this dialog.
 * Create: ASSET_CREATE on the target. Edit/move: ASSET_EDIT on the current space *and* the target —
 * so nothing at all when I can't edit it where it is now.
 */
export function assetSpaceTargets(
  perms: MyPermissions | null | undefined,
  spaces: SpaceDto[],
  mode: 'create' | { currentSpaceId: UUID | null },
): Set<UUID> {
  if (mode === 'create') return allowedSpaceIds(perms, spaces, 'ASSET_CREATE');
  if (!canDo(perms, 'ASSET_EDIT', mode.currentSpaceId, spaces)) return new Set();
  return allowedSpaceIds(perms, spaces, 'ASSET_EDIT');
}

export type BulkShortcut = Extract<SpaceType, 'FLOOR' | 'UNIT' | 'COMMON_AREA'>;

/** "All floors / all units / all common areas", restricted to spaces I may create in. */
export function shortcutSpaceIds(spaces: SpaceDto[], kind: BulkShortcut, allowed: ReadonlySet<UUID>): UUID[] {
  return spaces.filter((s) => s.type === kind && allowed.has(s.id)).map((s) => s.id);
}

/** Toggle a shortcut: if every matching space is already selected, unselect them; otherwise add them all. */
export function applyShortcut(selected: ReadonlySet<UUID>, ids: UUID[]): Set<UUID> {
  const next = new Set(selected);
  const all = ids.length > 0 && ids.every((id) => next.has(id));
  for (const id of ids) {
    if (all) next.delete(id);
    else next.add(id);
  }
  return next;
}

// ---------- form helpers ----------

/**
 * Name to show after picking a type: the type name when the field is empty, untouched by the user,
 * or still equal to the previously prefilled type name; otherwise keep what the user typed.
 */
export function prefillName(current: string, userEdited: boolean, previousTypeName: string | null, typeName: string): string {
  const trimmed = current.trim();
  if (!trimmed || !userEdited || trimmed === previousTypeName) return typeName;
  return current;
}

export interface AssetFilters {
  spaceId: string;
  includeDescendants: boolean;
  type: string;
  q: string;
  includeArchived: boolean;
}

export function assetQuery(f: AssetFilters): AssetQuery {
  const q: AssetQuery = {};
  if (f.spaceId) {
    q.spaceId = f.spaceId;
    q.includeDescendants = f.includeDescendants;
  }
  if (f.type) q.type = f.type;
  if (f.q.trim()) q.q = f.q.trim();
  if (f.includeArchived) q.includeArchived = true;
  return q;
}

// ---------- catalog ----------

/** "Not working · Flickering · …" — active entries only, as residents will see them. */
export function problemSummary(type: AssetTypeDto | null | undefined): string {
  return (type?.problemTypes ?? [])
    .filter((p) => p.active)
    .map((p) => p.label)
    .join(' · ');
}

/**
 * PUT body for a problem type. Built-ins can only be hidden/shown: label and sortOrder are always
 * sent back unchanged (the server answers 409 BUILT_IN_PROBLEM_TYPE otherwise).
 */
export function problemTypeUpdate(
  pt: ProblemTypeDto,
  patch: Partial<UpdateProblemTypeRequest>,
): UpdateProblemTypeRequest {
  if (pt.builtIn) return { label: pt.label, sortOrder: pt.sortOrder, active: patch.active ?? pt.active };
  return {
    label: (patch.label ?? pt.label).trim(),
    sortOrder: patch.sortOrder ?? pt.sortOrder,
    active: patch.active ?? pt.active,
  };
}

/** Catalog entries in display order (sortOrder, then label). */
export function sortProblemTypes(list: ProblemTypeDto[]): ProblemTypeDto[] {
  return [...list].sort((a, b) => a.sortOrder - b.sortOrder || a.label.localeCompare(b.label));
}

/**
 * Moves a custom entry up/down among the *custom* entries of one asset type (built-ins can't be re-sorted).
 * Swaps sortOrders with the neighbour; on ties, renumbers the custom entries after the last built-in.
 */
export function customReorderPlan(list: ProblemTypeDto[], id: UUID, dir: -1 | 1): SortUpdate[] {
  const sorted = sortProblemTypes(list);
  const custom = sorted.filter((p) => !p.builtIn);
  const i = custom.findIndex((p) => p.id === id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= custom.length) return [];
  const a = custom[i]!;
  const b = custom[j]!;
  if (a.sortOrder !== b.sortOrder) {
    return [
      { id: a.id, sortOrder: b.sortOrder },
      { id: b.id, sortOrder: a.sortOrder },
    ];
  }
  const order = custom.map((p) => p.id);
  [order[i], order[j]] = [order[j]!, order[i]!];
  const base = Math.max(0, ...sorted.filter((p) => p.builtIn).map((p) => p.sortOrder)) + 10;
  const current = new Map(custom.map((p) => [p.id, p.sortOrder]));
  return order.map((pid, idx) => ({ id: pid, sortOrder: base + idx * 10 })).filter((u) => current.get(u.id) !== u.sortOrder);
}

/** Case-insensitive duplicate check within one asset type (mirrors the server's DUPLICATE_PROBLEM_TYPE). */
export function isDuplicateLabel(list: ProblemTypeDto[], label: string, exceptId?: UUID): boolean {
  const l = label.trim().toLowerCase();
  return !!l && list.some((p) => p.id !== exceptId && p.label.trim().toLowerCase() === l);
}
