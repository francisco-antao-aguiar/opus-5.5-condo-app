import { SpaceDto, SpaceType, buildSpaceTree } from '@condo/shared';
import { flattenTree, moveTargets, pathLabels, reorderPlan, subtreeIds } from './space-utils';

let seq = 0;
function space(id: string, parentId: string | null, type: SpaceType, name = id, sortOrder = seq++): SpaceDto {
  return {
    id,
    buildingId: 'b1',
    parentId,
    type,
    name,
    sortOrder,
    visibility: null,
    effectiveVisibility: 'COMMON',
    depth: 0,
    version: 0,
    assetCount: 0,
  };
}

// root
// ├─ f1 (Floor 1)
// │  ├─ u1a (1A)
// │  │  └─ r1 (Kitchen)
// │  └─ u1b (1B)
// ├─ f2 (Floor 2)
// │  └─ u2a (2A)
// └─ lobby
const spaces: SpaceDto[] = [
  space('root', null, 'BUILDING', 'Building'),
  space('f1', 'root', 'FLOOR', 'Floor 1'),
  space('u1a', 'f1', 'UNIT', '1A'),
  space('r1', 'u1a', 'ROOM', 'Kitchen'),
  space('u1b', 'f1', 'UNIT', '1B'),
  space('f2', 'root', 'FLOOR', 'Floor 2'),
  space('u2a', 'f2', 'UNIT', '2A'),
  space('lobby', 'root', 'COMMON_AREA', 'Lobby'),
];
const ids = (list: SpaceDto[]) => list.map((s) => s.id).sort();

describe('subtreeIds', () => {
  it('includes the node and all descendants', () => {
    expect([...subtreeIds(spaces, 'f1')].sort()).toEqual(['f1', 'r1', 'u1a', 'u1b']);
    expect([...subtreeIds(spaces, 'lobby')]).toEqual(['lobby']);
  });
});

describe('moveTargets', () => {
  it('excludes the node, its descendants and its current parent', () => {
    expect(ids(moveTargets(spaces, 'f1'))).toEqual(['f2', 'lobby', 'u2a']);
    expect(ids(moveTargets(spaces, 'u1a'))).toEqual(['f2', 'lobby', 'root', 'u1b', 'u2a']);
  });

  it('returns nothing for the root or an unknown node', () => {
    expect(moveTargets(spaces, 'root')).toEqual([]);
    expect(moveTargets(spaces, 'nope')).toEqual([]);
  });

  it('applies the permission filter', () => {
    expect(ids(moveTargets(spaces, 'r1', (t) => t.type === 'UNIT'))).toEqual(['u1b', 'u2a']);
  });
});

describe('reorderPlan', () => {
  const a = space('a', 'p', 'UNIT', 'A', 0);
  const b = space('b', 'p', 'UNIT', 'B', 5);
  const c = space('c', 'p', 'UNIT', 'C', 9);

  it('swaps sortOrders with the neighbour when they differ', () => {
    expect(reorderPlan([a, b, c], 'b', -1)).toEqual([
      { id: 'b', sortOrder: 0 },
      { id: 'a', sortOrder: 5 },
    ]);
  });

  it('renumbers siblings when sortOrders tie, returning only changed rows', () => {
    const tied = [space('x', 'p', 'UNIT', 'X', 0), space('y', 'p', 'UNIT', 'Y', 0), space('z', 'p', 'UNIT', 'Z', 0)];
    expect(reorderPlan(tied, 'x', 1)).toEqual([
      { id: 'x', sortOrder: 10 },
      { id: 'z', sortOrder: 20 },
    ]);
  });

  it('is a no-op at the edges', () => {
    expect(reorderPlan([a, b, c], 'a', -1)).toEqual([]);
    expect(reorderPlan([a, b, c], 'c', 1)).toEqual([]);
  });
});

describe('flattenTree', () => {
  const tree = buildSpaceTree(spaces);

  it('skips children of collapsed nodes', () => {
    const rows = flattenTree(tree, new Set(['root', 'f1']), '');
    expect(rows.map((r) => r.node.id)).toEqual(['root', 'f1', 'u1a', 'u1b', 'f2', 'lobby']);
    expect(rows.find((r) => r.node.id === 'u1a')).toMatchObject({ depth: 2, hasChildren: true, expanded: false });
  });

  it('shows matches with their ancestors when filtering, ignoring collapse state', () => {
    const rows = flattenTree(tree, new Set(), 'kitch');
    expect(rows.map((r) => r.node.id)).toEqual(['root', 'f1', 'u1a', 'r1']);
    expect(rows.filter((r) => r.match).map((r) => r.node.id)).toEqual(['r1']);
  });
});

describe('pathLabels', () => {
  it('joins ancestor names', () => {
    expect(pathLabels(spaces).get('r1')).toBe('Building › Floor 1 › 1A › Kitchen');
  });
});
