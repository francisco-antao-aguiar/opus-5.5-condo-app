import { AssetTypeDto, MyPermissions, ProblemTypeDto, SpaceDto } from '@condo/shared';
import {
  FALLBACK_ASSET_ICON,
  allowedSpaceIds,
  applyShortcut,
  assetQuery,
  assetSpaceTargets,
  assetTypeIcon,
  customReorderPlan,
  isDuplicateLabel,
  prefillName,
  problemSummary,
  problemTypeUpdate,
  shortcutSpaceIds,
  spacesInTreeOrder,
} from './assets';

function space(id: string, parentId: string | null, type: SpaceDto['type'], name: string, sortOrder = 0): SpaceDto {
  return { id, buildingId: 'b', parentId, type, name, sortOrder, visibility: null, effectiveVisibility: 'COMMON', depth: 0, version: 0, assetCount: 0 };
}

const spaces: SpaceDto[] = [
  space('root', null, 'BUILDING', 'Aurora'),
  space('f1', 'root', 'FLOOR', 'Floor 1', 1),
  space('f0', 'root', 'FLOOR', 'Ground floor', 0),
  space('u1a', 'f1', 'UNIT', '1A', 0),
  space('u1b', 'f1', 'UNIT', '1B', 1),
  space('k1a', 'u1a', 'ROOM', 'Kitchen'),
  space('lobby', 'f0', 'COMMON_AREA', 'Lobby'),
  space('roof', 'root', 'COMMON_AREA', 'Roof', 9),
];

function perms(rules: MyPermissions['actions'], unitId: string | null = null): MyPermissions {
  return { membershipId: 'm', role: 'X', governanceMode: 'MANAGED', unitId, actions: rules };
}
const admin = perms([
  { action: 'ASSET_CREATE', scope: 'ANY' },
  { action: 'ASSET_EDIT', scope: 'ANY' },
]);
const owner1a = perms(
  [
    { action: 'ASSET_CREATE', scope: 'OWN_UNIT' },
    { action: 'ASSET_EDIT', scope: 'OWN_UNIT' },
  ],
  'u1a',
);

describe('assetTypeIcon', () => {
  it('maps known icon keys and falls back for unknown ones', () => {
    expect(assetTypeIcon('bulb')).toBe('💡');
    expect(assetTypeIcon('FIRE')).toBe('🧯');
    for (const k of ['elevator', 'door', 'gate', 'intercom', 'boiler', 'plumbing', 'window', 'tool']) {
      expect(assetTypeIcon(k)).toBeTruthy();
    }
    expect(assetTypeIcon('spaceship')).toBe(FALLBACK_ASSET_ICON);
    expect(assetTypeIcon(null)).toBe(FALLBACK_ASSET_ICON);
  });
});

describe('spaces for assets', () => {
  it('lists spaces in tree order with depth and a path label below the root', () => {
    const rows = spacesInTreeOrder(spaces).map((o) => [o.space.id, o.depth, o.label]);
    expect(rows).toEqual([
      ['root', 0, 'Aurora'],
      ['f0', 1, 'Ground floor'],
      ['lobby', 2, 'Ground floor › Lobby'],
      ['f1', 1, 'Floor 1'],
      ['u1a', 2, 'Floor 1 › 1A'],
      ['k1a', 3, 'Floor 1 › 1A › Kitchen'],
      ['u1b', 2, 'Floor 1 › 1B'],
      ['roof', 1, 'Roof'],
    ]);
  });

  it('create: every space for ANY scope, only my unit subtree for OWN_UNIT', () => {
    expect(assetSpaceTargets(admin, spaces, 'create').size).toBe(spaces.length);
    expect([...assetSpaceTargets(owner1a, spaces, 'create')].sort()).toEqual(['k1a', 'u1a']);
    expect(assetSpaceTargets(null, spaces, 'create').size).toBe(0);
  });

  it('edit/move: needs ASSET_EDIT on the current space too', () => {
    expect([...assetSpaceTargets(owner1a, spaces, { currentSpaceId: 'k1a' })].sort()).toEqual(['k1a', 'u1a']);
    // An owner can't touch (or move away) the lobby light.
    expect(assetSpaceTargets(owner1a, spaces, { currentSpaceId: 'lobby' }).size).toBe(0);
    expect(assetSpaceTargets(admin, spaces, { currentSpaceId: 'lobby' }).has('roof')).toBe(true);
  });

  it('allowedSpaceIds follows the action', () => {
    expect(allowedSpaceIds(owner1a, spaces, 'ASSET_DELETE').size).toBe(0);
  });
});

describe('bulk shortcuts', () => {
  const allowedAll = allowedSpaceIds(admin, spaces, 'ASSET_CREATE');

  it('picks spaces of one type, restricted to those I may create in', () => {
    expect(shortcutSpaceIds(spaces, 'FLOOR', allowedAll)).toEqual(['f1', 'f0']);
    expect(shortcutSpaceIds(spaces, 'UNIT', allowedAll)).toEqual(['u1a', 'u1b']);
    expect(shortcutSpaceIds(spaces, 'COMMON_AREA', allowedAll)).toEqual(['lobby', 'roof']);
    const ownerAllowed = allowedSpaceIds(owner1a, spaces, 'ASSET_CREATE');
    expect(shortcutSpaceIds(spaces, 'UNIT', ownerAllowed)).toEqual(['u1a']);
    expect(shortcutSpaceIds(spaces, 'FLOOR', ownerAllowed)).toEqual([]);
  });

  it('adds a shortcut to the selection, and removes it when it was fully selected', () => {
    const once = applyShortcut(new Set(['roof']), ['f0', 'f1']);
    expect([...once].sort()).toEqual(['f0', 'f1', 'roof']);
    const twice = applyShortcut(once, ['f0', 'f1']);
    expect([...twice]).toEqual(['roof']);
    // Partly selected → completes it rather than toggling off.
    expect([...applyShortcut(new Set(['f0']), ['f0', 'f1'])].sort()).toEqual(['f0', 'f1']);
  });
});

describe('prefillName', () => {
  it('uses the type name for an empty or untouched name', () => {
    expect(prefillName('', false, null, 'Light')).toBe('Light');
    expect(prefillName('   ', true, null, 'Light')).toBe('Light');
    expect(prefillName('Light', false, 'Light', 'Door')).toBe('Door');
  });

  it("keeps a name the user typed, but replaces a still-prefilled one", () => {
    expect(prefillName('Stairwell light', true, 'Light', 'Door')).toBe('Stairwell light');
    expect(prefillName('Light', true, 'Light', 'Door')).toBe('Door');
  });
});

describe('assetQuery', () => {
  it('omits empty filters and only sends includeDescendants with a space', () => {
    expect(assetQuery({ spaceId: '', includeDescendants: true, type: '', q: '  ', includeArchived: false })).toEqual({});
    expect(assetQuery({ spaceId: 'f1', includeDescendants: false, type: 'LIGHT', q: ' lamp ', includeArchived: true })).toEqual({
      spaceId: 'f1',
      includeDescendants: false,
      type: 'LIGHT',
      q: 'lamp',
      includeArchived: true,
    });
  });
});

function pt(id: string, label: string, sortOrder: number, builtIn: boolean, active = true): ProblemTypeDto {
  return { id, assetType: 'LIGHT', label, sortOrder, builtIn, active };
}

describe('catalog', () => {
  it('built-ins: only active changes; label and sortOrder are sent back unchanged', () => {
    const b = pt('b1', 'Not working', 10, true);
    expect(problemTypeUpdate(b, { active: false })).toEqual({ label: 'Not working', sortOrder: 10, active: false });
    expect(problemTypeUpdate(b, { label: 'Broken', sortOrder: 99, active: true })).toEqual({ label: 'Not working', sortOrder: 10, active: true });
  });

  it('custom entries: label (trimmed), sortOrder and active may change', () => {
    const c = pt('c1', 'Buzzing', 50, false);
    expect(problemTypeUpdate(c, { label: '  Humming ' })).toEqual({ label: 'Humming', sortOrder: 50, active: true });
    expect(problemTypeUpdate(c, { sortOrder: 60, active: false })).toEqual({ label: 'Buzzing', sortOrder: 60, active: false });
  });

  it('reorders custom entries only, swapping sortOrders', () => {
    const list = [pt('b1', 'Not working', 10, true), pt('c1', 'Buzzing', 50, false), pt('b2', 'Flickering', 20, true), pt('c2', 'Too dim', 60, false)];
    expect(customReorderPlan(list, 'c2', -1)).toEqual([
      { id: 'c2', sortOrder: 50 },
      { id: 'c1', sortOrder: 60 },
    ]);
    expect(customReorderPlan(list, 'c1', -1)).toEqual([]); // already the first custom entry
  });

  it('renumbers tied custom entries after the last built-in', () => {
    const list = [pt('b1', 'Not working', 30, true), pt('c1', 'A', 0, false), pt('c2', 'B', 0, false)];
    expect(customReorderPlan(list, 'c2', -1)).toEqual([
      { id: 'c2', sortOrder: 40 },
      { id: 'c1', sortOrder: 50 },
    ]);
  });

  it('detects duplicates case-insensitively, including built-ins', () => {
    const list = [pt('b1', 'Not working', 10, true), pt('c1', 'Buzzing', 50, false)];
    expect(isDuplicateLabel(list, ' not WORKING ')).toBe(true);
    expect(isDuplicateLabel(list, 'Buzzing', 'c1')).toBe(false);
    expect(isDuplicateLabel(list, 'Smells')).toBe(false);
  });

  it('summarises the active problems residents will see', () => {
    const type: AssetTypeDto = {
      code: 'LIGHT',
      name: 'Light',
      icon: 'bulb',
      sortOrder: 0,
      problemTypes: [pt('b1', 'Not working', 10, true), pt('b2', 'Flickering', 20, true), pt('b3', 'Hidden one', 30, true, false)],
    };
    expect(problemSummary(type)).toBe('Not working · Flickering');
    expect(problemSummary(null)).toBe('');
  });
});
