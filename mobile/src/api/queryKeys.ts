import type { UUID } from '@condo/shared';

/** Central query keys. Building-scoped keys share the ['buildings', id] prefix for easy invalidation. */
export const queryKeys = {
  me: ['me'] as const,
  governanceModes: ['governance', 'modes'] as const,
  buildings: ['buildings'] as const,
  building: (id: UUID) => ['buildings', id] as const,
  permissions: (id: UUID) => ['buildings', id, 'permissions'] as const,
  spaces: (id: UUID) => ['buildings', id, 'spaces'] as const,
  members: (id: UUID) => ['buildings', id, 'members'] as const,
};
