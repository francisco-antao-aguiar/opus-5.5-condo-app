import type {
  AcceptInvitationResponse,
  ApiProblem,
  AssetDto,
  AssetQuery,
  AssetTypeDto,
  Availability,
  BookingDecisionRequest,
  BookingDto,
  BookingPolicyDto,
  BookingQuery,
  BulkCreateAssetsRequest,
  CalendarLink,
  CostEntryDto,
  CostGroupBy,
  CostQuery,
  CostSummary,
  CreateBookingRequest,
  MaintenancePlanDto,
  RecurrencePreview,
  RecurrencePreviewRequest,
  SaveBookingPolicyRequest,
  SaveCostEntryRequest,
  SaveMaintenancePlanRequest,
  ChangeIssueStatusRequest,
  ChecklistTickRequest,
  CommentRequest,
  IssueDashboard,
  IssueDto,
  IssuePhotoDto,
  IssueQuery,
  IssueSummaryDto,
  MergeIssueRequest,
  NotificationDto,
  RegisterPushTokenRequest,
  ResolvedAsset,
  UnreadCount,
  OtherTextGroup,
  Page,
  PromoteOtherTextRequest,
  PromoteOtherTextResponse,
  ReportIssueRequest,
  SharingRequest,
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

const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

/**
 * Asset id from anything an asset QR code may contain: the web link (".../r/{id}"), the app link
 * ("buildingapp://report/asset/{id}") or a bare id. Null if it isn't an asset code.
 */
export function parseAssetCode(scanned: string): string | null {
  const text = scanned.trim();
  const patterns = [/\/r\/([0-9a-f-]{36})(?:[/?#]|$)/i, /report\/asset\/([0-9a-f-]{36})(?:[/?#]|$)/i, /^([0-9a-f-]{36})$/i];
  for (const p of patterns) {
    const m = p.exec(text);
    if (m && UUID_RE.test(m[1])) return m[1].toLowerCase();
  }
  return null;
}

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
    const isForm = typeof FormData !== 'undefined' && body instanceof FormData;
    // Multipart: let fetch set the boundary header itself.
    if (body !== undefined && !isForm) headers['Content-Type'] = 'application/json';
    if (token) headers['Authorization'] = `Bearer ${token}`;
    try {
      return await doFetch(config.baseUrl + path, {
        method,
        headers,
        body: body === undefined ? undefined : isForm ? (body as FormData) : JSON.stringify(body),
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

  /** Authenticated GET returning text (CSV exports). */
  async function requestText(path: string): Promise<string> {
    const tokens = await config.tokenStore.get();
    let res = await raw('GET', path, undefined, tokens?.accessToken ?? null);
    if (res.status === 401 && tokens) {
      const renewed = await refresh();
      if (!renewed) config.onSessionExpired?.();
      else res = await raw('GET', path, undefined, renewed.accessToken);
    }
    if (!res.ok) return parse<string>(res);
    return res.text();
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

    maintenance: {
      list: (buildingId: UUID) => request<MaintenancePlanDto[]>('GET', `${b(buildingId)}/maintenance-plans`),
      get: (buildingId: UUID, planId: UUID) =>
        request<MaintenancePlanDto>('GET', `${b(buildingId)}/maintenance-plans/${planId}`),
      create: (buildingId: UUID, req: SaveMaintenancePlanRequest) =>
        request<MaintenancePlanDto>('POST', `${b(buildingId)}/maintenance-plans`, req),
      update: (buildingId: UUID, planId: UUID, req: SaveMaintenancePlanRequest) =>
        request<MaintenancePlanDto>('PUT', `${b(buildingId)}/maintenance-plans/${planId}`, req),
      pause: (buildingId: UUID, planId: UUID) =>
        request<MaintenancePlanDto>('POST', `${b(buildingId)}/maintenance-plans/${planId}/pause`),
      resume: (buildingId: UUID, planId: UUID) =>
        request<MaintenancePlanDto>('POST', `${b(buildingId)}/maintenance-plans/${planId}/resume`),
      /** Next dates for a recurrence, for the plan form (no plan needed). */
      preview: (buildingId: UUID, req: RecurrencePreviewRequest) =>
        request<RecurrencePreview>('POST', `${b(buildingId)}/maintenance-plans/preview`, req),
    },

    costs: {
      list: (buildingId: UUID, query: CostQuery = {}) =>
        request<Page<CostEntryDto>>('GET', `${b(buildingId)}/costs${toQueryString(query)}`),
      get: (buildingId: UUID, costId: UUID) => request<CostEntryDto>('GET', `${b(buildingId)}/costs/${costId}`),
      create: (buildingId: UUID, req: SaveCostEntryRequest) =>
        request<CostEntryDto>('POST', `${b(buildingId)}/costs`, req),
      update: (buildingId: UUID, costId: UUID, req: SaveCostEntryRequest) =>
        request<CostEntryDto>('PUT', `${b(buildingId)}/costs/${costId}`, req),
      /** Soft delete; the reason is kept for the audit trail. */
      remove: (buildingId: UUID, costId: UUID, reason: string) =>
        request<void>('DELETE', `${b(buildingId)}/costs/${costId}${toQueryString({ reason })}`),
      /** Multipart field "file": image or PDF, max 10 MB. Replaces any previous receipt. */
      uploadReceipt: (buildingId: UUID, costId: UUID, form: FormData) =>
        request<CostEntryDto>('POST', `${b(buildingId)}/costs/${costId}/receipt`, form),
      summary: (buildingId: UUID, groupBy: CostGroupBy, query: Omit<CostQuery, 'page' | 'size'> = {}) =>
        request<CostSummary>('GET', `${b(buildingId)}/costs/summary${toQueryString({ ...query, groupBy })}`),
      /** CSV text for the accountant. */
      exportCsv: (buildingId: UUID, query: Pick<CostQuery, 'from' | 'to'> = {}) =>
        requestText(`${b(buildingId)}/costs/export.csv${toQueryString(query)}`),
    },

    bookings: {
      bookableSpaces: (buildingId: UUID) => request<BookingPolicyDto[]>('GET', `${b(buildingId)}/bookable-spaces`),
      /** 404 when the space isn't bookable. */
      getPolicy: (buildingId: UUID, spaceId: UUID) =>
        request<BookingPolicyDto>('GET', `${b(buildingId)}/spaces/${spaceId}/booking-policy`),
      savePolicy: (buildingId: UUID, spaceId: UUID, req: SaveBookingPolicyRequest) =>
        request<BookingPolicyDto>('PUT', `${b(buildingId)}/spaces/${spaceId}/booking-policy`, req),
      availability: (buildingId: UUID, spaceId: UUID, from: string, to: string) =>
        request<Availability>(
          'GET',
          `${b(buildingId)}/spaces/${spaceId}/availability${toQueryString({ from, to })}`,
        ),
      list: (buildingId: UUID, query: BookingQuery = {}) =>
        request<BookingDto[]>('GET', `${b(buildingId)}/bookings${toQueryString(query)}`),
      get: (buildingId: UUID, bookingId: UUID) =>
        request<BookingDto>('GET', `${b(buildingId)}/bookings/${bookingId}`),
      request: (buildingId: UUID, req: CreateBookingRequest) =>
        request<BookingDto>('POST', `${b(buildingId)}/bookings`, req),
      approve: (buildingId: UUID, bookingId: UUID, req: BookingDecisionRequest = {}) =>
        request<BookingDto>('POST', `${b(buildingId)}/bookings/${bookingId}/approve`, req),
      reject: (buildingId: UUID, bookingId: UUID, req: BookingDecisionRequest = {}) =>
        request<BookingDto>('POST', `${b(buildingId)}/bookings/${bookingId}/reject`, req),
      cancel: (buildingId: UUID, bookingId: UUID, req: BookingDecisionRequest = {}) =>
        request<BookingDto>('POST', `${b(buildingId)}/bookings/${bookingId}/cancel`, req),
      calendarLink: () => request<CalendarLink>('GET', '/me/bookings/calendar-link'),
      /** Revokes every calendar link handed out before (e.g. one shared by mistake) and returns a new one. */
      resetCalendarLink: () => request<CalendarLink>('POST', '/me/bookings/calendar-link/reset'),
    },

    qr: {
      /** After scanning: which building/asset this is, and whether I may report on it. */
      resolve: (assetId: UUID) => request<ResolvedAsset>('GET', `/assets/${encodeURIComponent(assetId)}/resolve`),
    },

    notifications: {
      list: (query: { unreadOnly?: boolean; page?: number; size?: number } = {}) =>
        request<Page<NotificationDto>>('GET', `/me/notifications${toQueryString(query)}`),
      unreadCount: () => request<UnreadCount>('GET', '/me/notifications/unread-count'),
      markRead: (id: UUID) => request<void>('POST', `/me/notifications/${id}/read`),
      markAllRead: () => request<void>('POST', '/me/notifications/read-all'),
      registerPushToken: (req: RegisterPushTokenRequest) => request<void>('POST', '/me/push-tokens', req),
      /** Call on logout (before clearing tokens) so this device stops receiving pushes. */
      unregisterPushToken: (token: string) =>
        request<void>('DELETE', `/me/push-tokens?token=${encodeURIComponent(token)}`),
    },

    issues: {
      /** 409 DUPLICATE_ISSUE → error.problem.duplicate holds the open issue to "me too". */
      report: (buildingId: UUID, req: ReportIssueRequest) =>
        request<IssueDto>('POST', `${b(buildingId)}/issues`, req),
      list: (buildingId: UUID, query: IssueQuery = {}) =>
        request<Page<IssueSummaryDto>>('GET', `${b(buildingId)}/issues${toQueryString(query)}`),
      get: (buildingId: UUID, issueId: UUID) => request<IssueDto>('GET', `${b(buildingId)}/issues/${issueId}`),
      /** Open issues on an asset that the caller can see — show them before asking "what's wrong?". */
      openOnAsset: (buildingId: UUID, assetId: UUID) =>
        request<IssueSummaryDto[]>('GET', `${b(buildingId)}/assets/${assetId}/open-issues`),
      changeStatus: (buildingId: UUID, issueId: UUID, req: ChangeIssueStatusRequest) =>
        request<IssueDto>('POST', `${b(buildingId)}/issues/${issueId}/status`, req),
      comment: (buildingId: UUID, issueId: UUID, req: CommentRequest) =>
        request<IssueDto>('POST', `${b(buildingId)}/issues/${issueId}/comments`, req),
      /** Scheduled tasks: tick or untick checklist item `index`. 409 INVALID_STATE once resolved. */
      tickChecklist: (buildingId: UUID, issueId: UUID, index: number, req: ChecklistTickRequest) =>
        request<IssueDto>('PUT', `${b(buildingId)}/issues/${issueId}/checklist/${index}`, req),
      meToo: (buildingId: UUID, issueId: UUID) =>
        request<IssueDto>('POST', `${b(buildingId)}/issues/${issueId}/me-too`),
      withdrawMeToo: (buildingId: UUID, issueId: UUID) =>
        request<IssueDto>('DELETE', `${b(buildingId)}/issues/${issueId}/me-too`),
      merge: (buildingId: UUID, issueId: UUID, req: MergeIssueRequest) =>
        request<IssueDto>('POST', `${b(buildingId)}/issues/${issueId}/merge`, req),
      setSharing: (buildingId: UUID, issueId: UUID, req: SharingRequest) =>
        request<IssueDto>('PUT', `${b(buildingId)}/issues/${issueId}/sharing`, req),
      /**
       * Multipart field "file". Web: form.append('file', blob, name).
       * React Native: form.append('file', { uri, name, type } as any).
       */
      uploadPhoto: (buildingId: UUID, issueId: UUID, form: FormData) =>
        request<IssuePhotoDto>('POST', `${b(buildingId)}/issues/${issueId}/photos`, form),
      deletePhoto: (buildingId: UUID, issueId: UUID, photoId: UUID) =>
        request<void>('DELETE', `${b(buildingId)}/issues/${issueId}/photos/${photoId}`),
      dashboard: (buildingId: UUID) => request<IssueDashboard>('GET', `${b(buildingId)}/issues/dashboard`),
      otherTexts: (buildingId: UUID) => request<OtherTextGroup[]>('GET', `${b(buildingId)}/issues/other-texts`),
      promoteOtherText: (buildingId: UUID, req: PromoteOtherTextRequest) =>
        request<PromoteOtherTextResponse>('POST', `${b(buildingId)}/issues/other-texts/promote`, req),
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
