import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  normalizeInviteCode,
  type AssetDto,
  type ChangeIssueStatusRequest,
  type IssueDto,
  type CreateAssetRequest,
  type CreateBuildingRequest,
  type CreateInvitationRequest,
  type CreateSpaceRequest,
  type MemberDto,
  type SpaceDto,
  type UpdateAssetRequest,
  type UpdateMemberRequest,
  type UpdateSpaceRequest,
  type UUID,
} from '@condo/shared';
import { api } from '../api/client';
import { queryKeys } from '../api/queryKeys';
import { photoForm, type LocalPhoto } from '../lib/photos';

// ---------- queries ----------

export function useBuildings() {
  return useQuery({ queryKey: queryKeys.buildings, queryFn: api.buildings.list });
}

export function useGovernanceModes() {
  // Reference data: rarely changes.
  return useQuery({ queryKey: queryKeys.governanceModes, queryFn: api.governance.modes, staleTime: 10 * 60_000 });
}

export function useRoles() {
  return useQuery({ queryKey: queryKeys.roles, queryFn: api.governance.roles, staleTime: 10 * 60_000 });
}

export function useBuilding(buildingId: UUID) {
  return useQuery({ queryKey: queryKeys.building(buildingId), queryFn: () => api.buildings.get(buildingId) });
}

export function useMyPermissions(buildingId: UUID) {
  return useQuery({
    queryKey: queryKeys.permissions(buildingId),
    queryFn: () => api.buildings.myPermissions(buildingId),
    enabled: !!buildingId,
  });
}

export function useSpaces(buildingId: UUID) {
  return useQuery({ queryKey: queryKeys.spaces(buildingId), queryFn: () => api.spaces.list(buildingId) });
}

export function useMembers(buildingId: UUID) {
  return useQuery({ queryKey: queryKeys.members(buildingId), queryFn: () => api.members.list(buildingId) });
}

export function useInvitations(buildingId: UUID, enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.invitations(buildingId),
    queryFn: () => api.invitations.list(buildingId),
    enabled,
  });
}

/** Public preview; works signed out. Invitation errors are definitive, so never retried here. */
export function useInvitationPreview(code: string) {
  const normalized = normalizeInviteCode(code);
  return useQuery({
    queryKey: queryKeys.invitationPreview(normalized),
    queryFn: () => api.invitations.preview(normalized),
    enabled: normalized.length > 0,
    staleTime: 0,
  });
}

// ---------- mutations ----------

export function useCreateBuilding() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (req: CreateBuildingRequest) => api.buildings.create(req),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.buildings, exact: true });
      void qc.invalidateQueries({ queryKey: queryKeys.me });
    },
  });
}

function useInvalidateSpaces(buildingId: UUID) {
  const qc = useQueryClient();
  // Assets carry their space's name/path/visibility, so structure changes refresh them too.
  return () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: queryKeys.spaces(buildingId) }),
      qc.invalidateQueries({ queryKey: queryKeys.assets(buildingId) }),
    ]);
}

export function useCreateSpace(buildingId: UUID) {
  const invalidate = useInvalidateSpaces(buildingId);
  return useMutation({
    mutationFn: (req: CreateSpaceRequest) => api.spaces.create(buildingId, req),
    onSettled: invalidate,
  });
}

/** Always refetches afterwards, so a 409 CONFLICT is followed by the latest version. */
export function useUpdateSpace(buildingId: UUID) {
  const invalidate = useInvalidateSpaces(buildingId);
  return useMutation({
    mutationFn: ({ spaceId, req }: { spaceId: UUID; req: UpdateSpaceRequest }) =>
      api.spaces.update(buildingId, spaceId, req),
    onSettled: invalidate,
  });
}

export function useDeleteSpace(buildingId: UUID) {
  const invalidate = useInvalidateSpaces(buildingId);
  return useMutation({
    mutationFn: ({ spaceId, cascade }: { spaceId: UUID; cascade: boolean }) =>
      api.spaces.remove(buildingId, spaceId, cascade),
    onSettled: invalidate,
  });
}

/** Full-replace body for PUT /spaces/{id}, starting from the current node; carries its version. */
export function toUpdateRequest(space: SpaceDto, patch: Partial<UpdateSpaceRequest>): UpdateSpaceRequest {
  return {
    name: space.name,
    type: space.type,
    visibility: space.visibility,
    sortOrder: space.sortOrder,
    version: space.version,
    ...patch,
  };
}

// ---------- members ----------

/** Full-replace body for PUT /members/{id}, starting from the current member; carries its version. */
export function toMemberUpdate(member: MemberDto, patch: Partial<UpdateMemberRequest>): UpdateMemberRequest {
  return {
    role: member.role,
    unitId: member.unitId,
    expiresAt: member.expiresAt,
    version: member.version,
    ...patch,
  };
}

function useInvalidateMembership(buildingId: UUID) {
  const qc = useQueryClient();
  return () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: queryKeys.members(buildingId) }),
      // My own role/expiry may have changed (or a member reactivated): refresh "me" and the list.
      qc.invalidateQueries({ queryKey: queryKeys.me }),
      qc.invalidateQueries({ queryKey: queryKeys.buildings, exact: true }),
    ]);
}

export function useUpdateMember(buildingId: UUID) {
  const invalidate = useInvalidateMembership(buildingId);
  return useMutation({
    mutationFn: ({ memberId, req }: { memberId: UUID; req: UpdateMemberRequest }) =>
      api.members.update(buildingId, memberId, req),
    onSettled: invalidate,
  });
}

export function useRevokeMember(buildingId: UUID) {
  const invalidate = useInvalidateMembership(buildingId);
  return useMutation({
    mutationFn: (memberId: UUID) => api.members.revoke(buildingId, memberId),
    onSettled: invalidate,
  });
}

/** Revoke my own membership. Building-scoped caches are marked stale (refetching them now would just 403). */
export function useLeaveBuilding(buildingId: UUID) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (membershipId: UUID) => api.members.revoke(buildingId, membershipId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.building(buildingId), refetchType: 'none' });
      void qc.invalidateQueries({ queryKey: queryKeys.me });
      void qc.invalidateQueries({ queryKey: queryKeys.buildings, exact: true });
    },
  });
}

// ---------- invitations ----------

export function useCreateInvitation(buildingId: UUID) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (req: CreateInvitationRequest) => api.invitations.create(buildingId, req),
    onSettled: () => qc.invalidateQueries({ queryKey: queryKeys.invitations(buildingId) }),
  });
}

export function useRevokeInvitation(buildingId: UUID) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (invitationId: UUID) => api.invitations.revoke(buildingId, invitationId),
    onSettled: () => qc.invalidateQueries({ queryKey: queryKeys.invitations(buildingId) }),
  });
}

export function useAcceptInvitation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (code: string) => api.invitations.accept(code),
    onSuccess: (res) => {
      // A reactivated membership may have stale cached 403s for this building.
      void qc.invalidateQueries({ queryKey: queryKeys.building(res.buildingId) });
      void qc.invalidateQueries({ queryKey: queryKeys.me });
      void qc.invalidateQueries({ queryKey: queryKeys.buildings, exact: true });
    },
  });
}

// ---------- assets & catalog ----------

/**
 * All active assets of the building that I may see, fetched once and grouped by space on the client.
 * One request serves every level of the drill-down (instant navigation, works from cache offline),
 * and buildings have at most a few hundred assets. Archived assets are excluded by the server default.
 */
export function useAssets(buildingId: UUID) {
  return useQuery({ queryKey: queryKeys.assets(buildingId), queryFn: () => api.assets.list(buildingId) });
}

export function useAsset(buildingId: UUID, assetId: UUID) {
  const qc = useQueryClient();
  return useQuery({
    queryKey: queryKeys.asset(buildingId, assetId),
    queryFn: () => api.assets.get(buildingId, assetId),
    // Instant render when coming from the browser; the fetch still refreshes it.
    placeholderData: () =>
      qc.getQueryData<AssetDto[]>(queryKeys.assets(buildingId))?.find((a) => a.id === assetId),
  });
}

/** Asset types with this building's active problem types. Reference-ish data. */
export function useCatalog(buildingId: UUID) {
  return useQuery({
    queryKey: queryKeys.catalog(buildingId),
    queryFn: () => api.catalog.get(buildingId),
    staleTime: 10 * 60_000,
  });
}

function useInvalidateAssets(buildingId: UUID) {
  const qc = useQueryClient();
  // Prefix covers the list and every detail; spaces carry assetCount.
  return () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: queryKeys.assets(buildingId) }),
      qc.invalidateQueries({ queryKey: queryKeys.spaces(buildingId) }),
    ]);
}

export function useCreateAsset(buildingId: UUID) {
  const invalidate = useInvalidateAssets(buildingId);
  return useMutation({
    mutationFn: (req: CreateAssetRequest) => api.assets.create(buildingId, req),
    onSettled: invalidate,
  });
}

/** Always refetches afterwards, so a 409 CONFLICT is followed by the latest version. */
export function useUpdateAsset(buildingId: UUID) {
  const invalidate = useInvalidateAssets(buildingId);
  return useMutation({
    mutationFn: ({ assetId, req }: { assetId: UUID; req: UpdateAssetRequest }) =>
      api.assets.update(buildingId, assetId, req),
    onSettled: invalidate,
  });
}

export function useArchiveAsset(buildingId: UUID) {
  const invalidate = useInvalidateAssets(buildingId);
  return useMutation({
    mutationFn: (assetId: UUID) => api.assets.archive(buildingId, assetId),
    onSettled: invalidate,
  });
}

export function useRestoreAsset(buildingId: UUID) {
  const invalidate = useInvalidateAssets(buildingId);
  return useMutation({
    mutationFn: (assetId: UUID) => api.assets.restore(buildingId, assetId),
    onSettled: invalidate,
  });
}

/** Full-replace body for PUT /assets/{id}, starting from the current asset; carries its version. */
export function toAssetUpdate(asset: AssetDto, patch: Partial<UpdateAssetRequest>): UpdateAssetRequest {
  return {
    spaceId: asset.spaceId ?? '',
    type: asset.type,
    name: asset.name,
    notes: asset.notes,
    version: asset.version,
    ...patch,
  };
}

// ---------- issues ----------

export type IssueListView = 'mine' | 'shared' | 'unit' | 'triage';
export type IssueStatusFilter = 'open' | 'all';
const ISSUE_PAGE = 30;

/** Paged list, newest activity first. */
export function useIssueList(buildingId: UUID, view: IssueListView, status: IssueStatusFilter, enabled = true) {
  return useInfiniteQuery({
    queryKey: queryKeys.issueList(buildingId, view, status),
    queryFn: ({ pageParam }) =>
      api.issues.list(buildingId, { view, status, sort: 'recent', page: pageParam, size: ISSUE_PAGE }),
    initialPageParam: 0,
    getNextPageParam: (last) => ((last.page + 1) * last.size < last.total ? last.page + 1 : undefined),
    enabled,
  });
}

export function useIssue(buildingId: UUID, issueId: UUID) {
  return useQuery({
    queryKey: queryKeys.issue(buildingId, issueId),
    queryFn: () => api.issues.get(buildingId, issueId),
    // Photo URLs are signed for 1 h; keep them fresh when the screen is revisited.
    staleTime: 15_000,
  });
}

export function useOpenIssuesOnAsset(buildingId: UUID, assetId: UUID | null | undefined) {
  return useQuery({
    queryKey: queryKeys.openIssuesOnAsset(buildingId, assetId ?? ''),
    queryFn: () => api.issues.openOnAsset(buildingId, assetId!),
    enabled: !!assetId,
    staleTime: 0,
  });
}

/**
 * Every issue action returns the updated IssueDto: put it in the cache, refresh lists.
 * On CONFLICT / INVALID_TRANSITION / ISSUE_MERGED the detail is refetched so the screen shows the latest.
 */
function useIssueMutation<V>(buildingId: UUID, issueId: UUID, fn: (v: V) => Promise<IssueDto>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: (issue) => {
      qc.setQueryData(queryKeys.issue(buildingId, issueId), issue);
    },
    onSettled: (_d, error) => {
      void qc.invalidateQueries({ queryKey: queryKeys.issues(buildingId), refetchType: 'active' });
      if (error) void qc.invalidateQueries({ queryKey: queryKeys.issue(buildingId, issueId) });
    },
  });
}

export function useChangeIssueStatus(buildingId: UUID, issueId: UUID) {
  return useIssueMutation(buildingId, issueId, (req: ChangeIssueStatusRequest) =>
    api.issues.changeStatus(buildingId, issueId, req),
  );
}

export function useCommentIssue(buildingId: UUID, issueId: UUID) {
  return useIssueMutation(buildingId, issueId, (text: string) => api.issues.comment(buildingId, issueId, { text }));
}

export function useMeToo(buildingId: UUID, issueId: UUID) {
  return useIssueMutation(buildingId, issueId, (on: boolean) =>
    on ? api.issues.meToo(buildingId, issueId) : api.issues.withdrawMeToo(buildingId, issueId),
  );
}

export function useIssueSharing(buildingId: UUID, issueId: UUID) {
  return useIssueMutation(buildingId, issueId, (sharedWithAdmins: boolean) =>
    api.issues.setSharing(buildingId, issueId, { sharedWithAdmins }),
  );
}

export function useAddIssuePhoto(buildingId: UUID, issueId: UUID) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (photo: LocalPhoto) => api.issues.uploadPhoto(buildingId, issueId, await photoForm(photo)),
    onSettled: () => qc.invalidateQueries({ queryKey: queryKeys.issue(buildingId, issueId) }),
  });
}

// ---------- QR & notifications ----------

/** Building-less lookup after a scan / deep link. Errors are definitive (403/404/410), never retried. */
export function useResolvedAsset(assetId: UUID, enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.resolvedAsset(assetId),
    queryFn: () => api.qr.resolve(assetId),
    enabled,
    staleTime: 0,
  });
}

/** Polled every 60 s while the app is open, and refetched on foreground (focusManager). */
export function useUnreadCount(enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.unreadCount,
    queryFn: api.notifications.unreadCount,
    enabled,
    refetchInterval: 60_000,
    staleTime: 15_000,
  });
}

export function useNotificationList() {
  return useInfiniteQuery({
    queryKey: queryKeys.notificationList,
    queryFn: ({ pageParam }) => api.notifications.list({ page: pageParam, size: 30 }),
    initialPageParam: 0,
    getNextPageParam: (last) => ((last.page + 1) * last.size < last.total ? last.page + 1 : undefined),
  });
}

export function useMarkNotificationRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: UUID) => api.notifications.markRead(id),
    onSettled: () => qc.invalidateQueries({ queryKey: queryKeys.notifications }),
  });
}

export function useMarkAllNotificationsRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.notifications.markAllRead(),
    onSettled: () => qc.invalidateQueries({ queryKey: queryKeys.notifications }),
  });
}
