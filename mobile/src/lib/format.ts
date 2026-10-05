import type { RoleCode, Visibility } from '@condo/shared';

const ROLE_LABELS: Record<string, string> = {
  ADMIN: 'Admin',
  MANAGER: 'Manager',
  OWNER: 'Owner',
  TENANT: 'Tenant',
};

/** Roles are server data; unknown codes fall back to a title-cased code. */
export function roleLabel(role: RoleCode): string {
  return ROLE_LABELS[role] ?? role.charAt(0) + role.slice(1).toLowerCase().replace(/_/g, ' ');
}

export function visibilityLabel(v: Visibility): string {
  return v === 'COMMON' ? 'Common' : 'Private';
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

export function isPast(iso: string | null | undefined): boolean {
  return !!iso && new Date(iso).getTime() < Date.now();
}
