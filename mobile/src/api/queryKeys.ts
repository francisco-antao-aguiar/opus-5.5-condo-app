import type { UUID } from '@condo/shared';

/** Central query keys. Building-scoped keys share the ['buildings', id] prefix for easy invalidation. */
export const queryKeys = {
  me: ['me'] as const,
  governanceModes: ['governance', 'modes'] as const,
  roles: ['governance', 'roles'] as const,
  buildings: ['buildings'] as const,
  building: (id: UUID) => ['buildings', id] as const,
  permissions: (id: UUID) => ['buildings', id, 'permissions'] as const,
  spaces: (id: UUID) => ['buildings', id, 'spaces'] as const,
  members: (id: UUID) => ['buildings', id, 'members'] as const,
  invitations: (id: UUID) => ['buildings', id, 'invitations'] as const,
  /** Every active asset of the building I may see (prefix of `asset`). */
  assets: (id: UUID) => ['buildings', id, 'assets'] as const,
  asset: (id: UUID, assetId: UUID) => ['buildings', id, 'assets', assetId] as const,
  catalog: (id: UUID) => ['buildings', id, 'catalog'] as const,
  /** Public preview, keyed by normalized code. */
  invitationPreview: (code: string) => ['invitations', 'preview', code] as const,
};
