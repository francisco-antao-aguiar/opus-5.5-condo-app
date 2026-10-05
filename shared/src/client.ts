import type {
  AcceptInvitationResponse,
  ApiProblem,
  AssetDto,
  AssetQuery,
  AssetTypeDto,
  BulkCreateAssetsRequest,
  CreateAssetRequest,
  CreateProblemTypeRequest,
  ProblemTypeDto,
  UpdateAssetRequest,
  UpdateProblemTypeRequest,
  AuthTokens,
  BuildingDto,
  CreateBuildingRequest,
  CreateInvitationRequest,
  CreateSpaceRequest,
  GenerateStructureRequest,
  GenerateStructureResponse,
  GovernanceModeDto,
  InvitationDto,
  InvitationPreview,
  LoginRequest,
  MeResponse,
  MemberDto,
  MoveSpaceRequest,
  MyPermissions,
  RegisterRequest,
  RoleDto,
  SpaceDto,
  UUID,
  UpdateBuildingRequest,
  UpdateMemberRequest,
  UpdateSpaceRequest,
} from './types.js';

/** "abcd-efgh " → "ABCDEFGH". Users may type codes in any case, with spaces or a dash. */
export function normalizeInviteCode(input: string): string {
  return input.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

/** "ABCDEFGH" → "ABCD-EFGH" for display. */
export function formatInviteCode(code: string): string {
  const c = normalizeInviteCode(code);
  return c.length === 8 ? `${c.slice(0, 4)}-${c.slice(4)}` : c;
}

function toQueryString(params: object): string {
  const parts = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`);
  return parts.length ? `?${parts.join('&')}` : '';
}

/** Where the client keeps tokens. Web: localStorage; mobile: expo-secure-store. */
export interface TokenStore {
  get(): AuthTokens | null | Promise<AuthTokens | null>;
  set(tokens: AuthTokens | null): void | Promise<void>;
}

export interface ApiClientConfig {
  /** e.g. "http://localhost:8080/api" */
  baseUrl: string;
  tokenStore: TokenStore;
  /** Called when the session cannot be refreshed; the app should route to login. */
  onSessionExpired?: () => void;
  fetchImpl?: typeof fetch;
}

/** Thrown for every non-2xx response. `problem.code` is stable and safe to branch on. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly problem: ApiProblem,
  ) {
    super(problem.detail ?? problem.title);
    this.name = 'ApiError';
  }

  /** Message for a given field from a 400 validation error, if any. */
  fieldError(field: string): string | undefined {
    return this.problem.errors?.find((e) => e.field === field)?.message;
  }
}

/** Network failure (no response). Mobile uses this to decide whether to queue and retry. */
export class NetworkError extends Error {
  constructor(readonly cause: unknown) {
    super('Network request failed');
    this.name = 'NetworkError';
  }
}

type Method = 'GET' | 'POST' | 'PUT' | 'DELETE';

export function createApiClient(config: ApiClientConfig) {
  const doFetch = config.fetchImpl ?? ((input: RequestInfo | URL, init?: RequestInit) => fetch(input, init));
  let refreshing: Promise<AuthTokens | null> | null = null;

  async function raw(method: Method, path: string, body: unknown, token: string | null): Promise<Response> {
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (token) headers['Authorization'] = `Bearer ${token}`;
    try {
      return await doFetch(config.baseUrl + path, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch (e) {
      throw new NetworkError(e);
    }
  }

  async function parse<T>(res: Response): Promise<T> {
    if (res.status === 204) return undefined as T;
    const text = await res.text();
    const data = text ? JSON.parse(text) : undefined;
    if (!res.ok) {
      const problem: ApiProblem =
        data && typeof data === 'object' && 'code' in data
          ? (data as ApiProblem)
          : { title: res.statusText || 'Request failed', status: res.status, code: 'HTTP_' + res.status };
      throw new ApiError(res.status, problem);
    }
    return data as T;
  }

  /** Single-flight refresh: concurrent 401s share one refresh call. */
  function refresh(): Promise<AuthTokens | null> {
    if (!refreshing) {
      refreshing = (async () => {
        const current = await config.tokenStore.get();
        if (!current) return null;
        try {
          const res = await raw('POST', '/auth/refresh', { refreshToken: current.refreshToken }, null);
          if (!res.ok) {
            await config.tokenStore.set(null);
            return null;
          }
          const tokens = (await res.json()) as AuthTokens;
          await config.tokenStore.set(tokens);
          return tokens;
        } finally {
          refreshing = null;
        }
      })();
    }
    return refreshing;
  }

  async function request<T>(method: Method, path: string, body?: unknown): Promise<T> {
    const tokens = await config.tokenStore.get();
    let res = await raw(method, path, body, tokens?.accessToken ?? null);
    if (res.status === 401 && tokens) {
      const renewed = await refresh();
      if (!renewed) {
        config.onSessionExpired?.();
      } else {
        res = await raw(method, path, body, renewed.accessToken);
      }
    }
    return parse<T>(res);
  }

  async function publicPost<T>(path: string, body: unknown): Promise<T> {
    return parse<T>(await raw('POST', path, body, null));
  }

  /** Never sends a token, so a stale session can't turn a public page into a login redirect. */
  async function publicGet<T>(path: string): Promise<T> {
    return parse<T>(await raw('GET', path, undefined, null));
  }

  const b = (buildingId: UUID) => `/buildings/${encodeURIComponent(buildingId)}`;

  return {
    auth: {
      async register(req: RegisterRequest): Promise<AuthTokens> {
        const tokens = await publicPost<AuthTokens>('/auth/register', req);
        await config.tokenStore.set(tokens);
        return tokens;
      },
      async login(req: LoginRequest): Promise<AuthTokens> {
        const tokens = await publicPost<AuthTokens>('/auth/login', req);
        await config.tokenStore.set(tokens);
        return tokens;
      },
      async logout(): Promise<void> {
        const tokens = await config.tokenStore.get();
        await config.tokenStore.set(null);
        if (tokens) {
          await publicPost<void>('/auth/logout', { refreshToken: tokens.refreshToken }).catch(() => undefined);
        }
      },
      refresh,
    },

    me: () => request<MeResponse>('GET', '/me'),

    governance: {
      modes: () => request<GovernanceModeDto[]>('GET', '/governance-modes'),
      roles: () => request<RoleDto[]>('GET', '/roles'),
    },

    buildings: {
      list: () => request<BuildingDto[]>('GET', '/buildings'),
      get: (id: UUID) => request<BuildingDto>('GET', b(id)),
      create: (req: CreateBuildingRequest) => request<BuildingDto>('POST', '/buildings', req),
      update: (id: UUID, req: UpdateBuildingRequest) => request<BuildingDto>('PUT', b(id), req),
      myPermissions: (id: UUID) => request<MyPermissions>('GET', `${b(id)}/permissions/me`),
    },

    spaces: {
      list: (buildingId: UUID) => request<SpaceDto[]>('GET', `${b(buildingId)}/spaces`),
      get: (buildingId: UUID, spaceId: UUID) => request<SpaceDto>('GET', `${b(buildingId)}/spaces/${spaceId}`),
      create: (buildingId: UUID, req: CreateSpaceRequest) =>
        request<SpaceDto>('POST', `${b(buildingId)}/spaces`, req),
      update: (buildingId: UUID, spaceId: UUID, req: UpdateSpaceRequest) =>
        request<SpaceDto>('PUT', `${b(buildingId)}/spaces/${spaceId}`, req),
      move: (buildingId: UUID, spaceId: UUID, req: MoveSpaceRequest) =>
        request<SpaceDto[]>('POST', `${b(buildingId)}/spaces/${spaceId}/move`, req),
      remove: (buildingId: UUID, spaceId: UUID, cascade = false) =>
        request<void>('DELETE', `${b(buildingId)}/spaces/${spaceId}?cascade=${cascade}`),
      generate: (buildingId: UUID, req: GenerateStructureRequest) =>
        request<GenerateStructureResponse>('POST', `${b(buildingId)}/spaces/generate`, req),
    },

    members: {
      list: (buildingId: UUID) => request<MemberDto[]>('GET', `${b(buildingId)}/members`),
      update: (buildingId: UUID, memberId: UUID, req: UpdateMemberRequest) =>
        request<MemberDto>('PUT', `${b(buildingId)}/members/${memberId}`, req),
      revoke: (buildingId: UUID, memberId: UUID) =>
        request<void>('DELETE', `${b(buildingId)}/members/${memberId}`),
    },

    catalog: {
      /** Asset types with this building's problem catalog. includeInactive shows hidden/deactivated entries (admin views). */
      get: (buildingId: UUID, includeInactive = false) =>
        request<AssetTypeDto[]>('GET', `${b(buildingId)}/catalog?includeInactive=${includeInactive}`),
      createProblemType: (buildingId: UUID, req: CreateProblemTypeRequest) =>
        request<ProblemTypeDto>('POST', `${b(buildingId)}/catalog/problem-types`, req),
      updateProblemType: (buildingId: UUID, problemTypeId: UUID, req: UpdateProblemTypeRequest) =>
        request<ProblemTypeDto>('PUT', `${b(buildingId)}/catalog/problem-types/${problemTypeId}`, req),
    },

    assets: {
      list: (buildingId: UUID, query: AssetQuery = {}) =>
        request<AssetDto[]>('GET', `${b(buildingId)}/assets${toQueryString(query)}`),
      get: (buildingId: UUID, assetId: UUID) => request<AssetDto>('GET', `${b(buildingId)}/assets/${assetId}`),
      create: (buildingId: UUID, req: CreateAssetRequest) =>
        request<AssetDto>('POST', `${b(buildingId)}/assets`, req),
      bulkCreate: (buildingId: UUID, req: BulkCreateAssetsRequest) =>
        request<AssetDto[]>('POST', `${b(buildingId)}/assets/bulk`, req),
      update: (buildingId: UUID, assetId: UUID, req: UpdateAssetRequest) =>
        request<AssetDto>('PUT', `${b(buildingId)}/assets/${assetId}`, req),
      /** Soft delete: keeps the id (QR labels, issue history). */
      archive: (buildingId: UUID, assetId: UUID) =>
        request<void>('DELETE', `${b(buildingId)}/assets/${assetId}`),
      restore: (buildingId: UUID, assetId: UUID) =>
        request<AssetDto>('POST', `${b(buildingId)}/assets/${assetId}/restore`),
    },

    invitations: {
      list: (buildingId: UUID) => request<InvitationDto[]>('GET', `${b(buildingId)}/invitations`),
      create: (buildingId: UUID, req: CreateInvitationRequest) =>
        request<InvitationDto>('POST', `${b(buildingId)}/invitations`, req),
      revoke: (buildingId: UUID, invitationId: UUID) =>
        request<void>('DELETE', `${b(buildingId)}/invitations/${invitationId}`),
      /** Public; works signed out. Accepts the code with or without dash, any case. */
      preview: (code: string) =>
        publicGet<InvitationPreview>(`/invitations/${encodeURIComponent(normalizeInviteCode(code))}`),
      accept: (code: string) =>
        request<AcceptInvitationResponse>(
          'POST',
          `/invitations/${encodeURIComponent(normalizeInviteCode(code))}/accept`,
        ),
    },
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;
