import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  normalizeInviteCode,
  type CreateBuildingRequest,
  type CreateInvitationRequest,
  type CreateSpaceRequest,
  type MemberDto,
  type SpaceDto,
  type UpdateMemberRequest,
  type UpdateSpaceRequest,
  type UUID,
} from '@condo/shared';
import { api } from '../api/client';
import { queryKeys } from '../api/queryKeys';

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
  return () => qc.invalidateQueries({ queryKey: queryKeys.spaces(buildingId) });
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
