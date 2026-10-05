import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  CreateBuildingRequest,
  CreateSpaceRequest,
  SpaceDto,
  UpdateSpaceRequest,
  UUID,
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

/** Full-replace body for PUT /spaces/{id}, starting from the current node. */
export function toUpdateRequest(space: SpaceDto, patch: Partial<UpdateSpaceRequest>): UpdateSpaceRequest {
  return {
    name: space.name,
    type: space.type,
    visibility: space.visibility,
    sortOrder: space.sortOrder,
    ...patch,
  };
}
