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
  /** Prefix of every issue query in a building. */
  issues: (id: UUID) => ['buildings', id, 'issues'] as const,
  issueList: (id: UUID, view: string, status: string) => ['buildings', id, 'issues', 'list', view, status] as const,
  issue: (id: UUID, issueId: UUID) => ['buildings', id, 'issues', 'detail', issueId] as const,
  openIssuesOnAsset: (id: UUID, assetId: UUID) => ['buildings', id, 'issues', 'onAsset', assetId] as const,
  maintenancePlans: (id: UUID) => ['buildings', id, 'maintenance'] as const,
  maintenancePlan: (id: UUID, planId: UUID) => ['buildings', id, 'maintenance', planId] as const,
  /** Prefix of every cost query in a building. */
  costs: (id: UUID) => ['buildings', id, 'costs'] as const,
  costList: (id: UUID, anchor: string) => ['buildings', id, 'costs', 'list', anchor] as const,
  /** Prefix of every booking query in a building. */
  bookings: (id: UUID) => ['buildings', id, 'bookings'] as const,
  bookableSpaces: (id: UUID) => ['buildings', id, 'bookings', 'spaces'] as const,
  availability: (id: UUID, spaceId: UUID, day: string) => ['buildings', id, 'bookings', 'availability', spaceId, day] as const,
  bookingList: (id: UUID, filter: string) => ['buildings', id, 'bookings', 'list', filter] as const,
  calendarLink: ['me', 'calendar-link'] as const,
  /** In-app notifications (not building-scoped). */
  notifications: ['notifications'] as const,
  notificationList: ['notifications', 'list'] as const,
  unreadCount: ['notifications', 'unread'] as const,
  resolvedAsset: (assetId: UUID) => ['qr', assetId] as const,
  /** Public preview, keyed by normalized code. */
  invitationPreview: (code: string) => ['invitations', 'preview', code] as const,
};
