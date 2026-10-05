import { GovernanceModeDto, RoleDto } from '@condo/shared';
import { buildPolicyMatrix } from './policy';

const roles: RoleDto[] = [
  { code: 'TENANT', name: 'Tenant', rank: 10 },
  { code: 'ADMIN', name: 'Admin', rank: 100 },
  { code: 'OWNER', name: 'Owner', rank: 20 },
];

const modes: GovernanceModeDto[] = [
  {
    code: 'MANAGED',
    name: 'Managed',
    description: '',
    rules: [
      { action: 'STRUCTURE_EDIT', role: 'ADMIN', scope: 'ANY' },
      { action: 'MEMBER_MANAGE', role: 'OWNER', scope: 'OWN_UNIT' },
      { action: 'BUILDING_VIEW', role: 'TENANT', scope: 'ANY' },
    ],
  },
  {
    code: 'OPEN',
    name: 'Open',
    description: '',
    rules: [
      { action: 'STRUCTURE_EDIT', role: 'ADMIN', scope: 'ANY' },
      { action: 'STRUCTURE_EDIT', role: 'TENANT', scope: 'ANY' },
      { action: 'MEMBER_MANAGE', role: 'OWNER', scope: 'OWN_UNIT' },
      { action: 'BUILDING_VIEW', role: 'TENANT', scope: 'ANY' },
    ],
  },
];

describe('buildPolicyMatrix', () => {
  const m = buildPolicyMatrix(modes, roles);

  it('orders roles by rank (highest first) and actions canonically', () => {
    expect(m.roles).toEqual(['ADMIN', 'OWNER', 'TENANT']);
    expect(m.actions).toEqual(['BUILDING_VIEW', 'STRUCTURE_EDIT', 'MEMBER_MANAGE']);
  });

  it('looks up scopes per mode', () => {
    expect(m.cell('MANAGED', 'MEMBER_MANAGE', 'OWNER')).toBe('OWN_UNIT');
    expect(m.cell('MANAGED', 'STRUCTURE_EDIT', 'TENANT')).toBeNull();
    expect(m.cell('OPEN', 'STRUCTURE_EDIT', 'TENANT')).toBe('ANY');
  });

  it('detects differences between modes', () => {
    expect(m.differs('MANAGED', 'OPEN', 'STRUCTURE_EDIT', 'TENANT')).toBe(true);
    expect(m.differs('MANAGED', 'OPEN', 'STRUCTURE_EDIT', 'ADMIN')).toBe(false);
  });
});
