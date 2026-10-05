// API contract shared by the web and mobile apps.
// Mirrors the backend DTOs in backend/src/main/java/com/condo/**/dto. Keep both in sync.

export type UUID = string;
/** ISO-8601 instant, e.g. "2026-10-05T12:00:00Z". */
export type Instant = string;

/** Built-in roles. Roles are data on the server, so unknown codes must be tolerated. */
export type RoleCode = 'ADMIN' | 'MANAGER' | 'OWNER' | 'TENANT' | (string & {});
export type GovernanceModeCode = 'MANAGED' | 'OPEN' | (string & {});

export type Action =
  | 'BUILDING_VIEW'
  | 'BUILDING_SETTINGS'
  | 'STRUCTURE_EDIT'
  | 'ASSET_CREATE'
  | 'ASSET_EDIT'
  | 'ASSET_DELETE'
  | 'ISSUE_REPORT'
  | 'ISSUE_TRIAGE'
  | 'CATALOG_EDIT'
  | 'MEMBER_INVITE'
  | 'MEMBER_MANAGE';

export type PermissionScope = 'ANY' | 'OWN_UNIT';
export type SpaceType = 'BUILDING' | 'FLOOR' | 'UNIT' | 'ROOM' | 'COMMON_AREA';
export type Visibility = 'COMMON' | 'PRIVATE';
export type MembershipStatus = 'ACTIVE' | 'REVOKED' | 'EXPIRED';

// ---------- errors ----------

/** Stable values of ApiProblem.code (backend: com.condo.common.error.ErrorCodes). Unknown codes may appear. */
export type ErrorCode =
  | 'VALIDATION_FAILED'
  | 'MALFORMED_REQUEST'
  | 'UNAUTHENTICATED'
  | 'INVALID_CREDENTIALS'
  | 'INVALID_REFRESH_TOKEN'
  | 'EMAIL_TAKEN'
  | 'NOT_FOUND'
  | 'NOT_A_MEMBER'
  | 'MEMBERSHIP_EXPIRED'
  | 'PERMISSION_DENIED'
  | 'UNKNOWN_GOVERNANCE_MODE'
  | 'UNKNOWN_ROLE'
  | 'INVALID_HIERARCHY'
  | 'INVALID_MOVE'
  | 'SPACE_HAS_CHILDREN'
  | 'STRUCTURE_NOT_EMPTY'
  | 'STRUCTURE_TOO_LARGE'
  | 'INVALID_UNIT'
  | 'LAST_ADMIN'
  | 'ROLE_RANK_EXCEEDED'
  | 'CONFLICT'
  | 'INVITATION_NOT_FOUND'
  | 'INVITATION_EXPIRED'
  | 'INVITATION_REVOKED'
  | 'INVITATION_EXHAUSTED'
  | 'INVITATION_INVALID'
  | 'ALREADY_MEMBER'
  | 'TOO_MANY_ATTEMPTS'
  | 'INTERNAL_ERROR'
  | (string & {});

export interface FieldError {
  field: string;
  message: string;
}

/** RFC 7807 problem detail with an application error code. */
export interface ApiProblem {
  type?: string;
  title: string;
  status: number;
  detail?: string;
  code: ErrorCode;
  errors?: FieldError[];
}

// ---------- auth ----------

export interface RegisterRequest {
  email: string;
  password: string;
  displayName: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface RefreshRequest {
  refreshToken: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  tokenType: 'Bearer';
  accessTokenExpiresAt: Instant;
  refreshTokenExpiresAt: Instant;
}

export interface UserDto {
  id: UUID;
  email: string;
  displayName: string;
}

export interface MembershipSummary {
  membershipId: UUID;
  buildingId: UUID;
  buildingName: string;
  role: RoleCode;
  unitId: UUID | null;
  unitName: string | null;
  expiresAt: Instant | null;
}

/** `memberships` lists only memberships that currently grant access (not revoked, not expired). */
export interface MeResponse {
  user: UserDto;
  memberships: MembershipSummary[];
}

// ---------- governance ----------

export interface PolicyRule {
  action: Action;
  role: RoleCode;
  scope: PermissionScope;
}

export interface GovernanceModeDto {
  code: GovernanceModeCode;
  name: string;
  description: string;
  rules: PolicyRule[];
}

export interface RoleDto {
  code: RoleCode;
  name: string;
  rank: number;
}

export interface GrantedAction {
  action: Action;
  scope: PermissionScope;
}

/** Effective permissions of the current user in a building. UI hints only — the server always re-checks. */
export interface MyPermissions {
  membershipId: UUID;
  role: RoleCode;
  governanceMode: GovernanceModeCode;
  unitId: UUID | null;
  actions: GrantedAction[];
}

// ---------- buildings ----------

export interface BuildingDto {
  id: UUID;
  name: string;
  address: string | null;
  governanceMode: GovernanceModeCode;
  rootSpaceId: UUID;
  createdAt: Instant;
  /** Optimistic-locking version; send it back on update to detect concurrent edits. */
  version: number;
}

export type CommonAreaKind = 'LOBBY' | 'GARAGE' | 'ROOF' | 'ELEVATOR_SHAFT' | 'STAIRWELL' | 'STORAGE';
export type UnitNaming = 'LETTERS' | 'NUMBERS';

/** Quick-setup wizard: "N floors × M units, plus optional common areas". */
export interface GenerateStructureRequest {
  /** Floors above ground, 0..200. */
  floors: number;
  /** Units on each floor above ground, 0..50. */
  unitsPerFloor: number;
  /** Basement levels, 0..10. */
  basements?: number;
  /** Ground floor with its own units/shops; omit for no ground floor. */
  groundFloor?: { units?: number; shops?: number } | null;
  /** LETTERS → "1A, 1B"; NUMBERS → "101, 102". Default LETTERS. */
  unitNaming?: UnitNaming;
  commonAreas?: CommonAreaKind[];
  /** Allow generating into a building that already has structure. Default false. */
  append?: boolean;
}

export interface GenerateStructureResponse {
  created: number;
  spaces: SpaceDto[];
}

export interface CreateBuildingRequest {
  name: string;
  address?: string | null;
  governanceMode?: GovernanceModeCode;
  structure?: GenerateStructureRequest | null;
}

export interface UpdateBuildingRequest {
  name: string;
  address: string | null;
  governanceMode: GovernanceModeCode;
  /** If given and stale, the server answers 409 CONFLICT instead of overwriting. */
  version?: number;
}

// ---------- spaces ----------

export interface SpaceDto {
  id: UUID;
  buildingId: UUID;
  parentId: UUID | null;
  type: SpaceType;
  name: string;
  sortOrder: number;
  /** Stored value; null = inherit from parent. */
  visibility: Visibility | null;
  /** Visibility after inheritance. */
  effectiveVisibility: Visibility;
  depth: number;
  version: number;
}

export interface CreateSpaceRequest {
  parentId: UUID;
  type: Exclude<SpaceType, 'BUILDING'>;
  name: string;
  /** Omit/null = inherit (UNITs default to PRIVATE). */
  visibility?: Visibility | null;
  sortOrder?: number;
}

/** Full replace. visibility null = inherit. */
export interface UpdateSpaceRequest {
  name: string;
  type: SpaceType;
  visibility: Visibility | null;
  sortOrder: number;
  /** If given and stale, the server answers 409 CONFLICT instead of overwriting. */
  version?: number;
}

export interface MoveSpaceRequest {
  newParentId: UUID;
  sortOrder?: number;
}

// ---------- members ----------

export interface MemberDto {
  id: UUID;
  userId: UUID;
  displayName: string;
  /** Null unless the caller may manage this member (privacy). */
  email: string | null;
  role: RoleCode;
  unitId: UUID | null;
  unitName: string | null;
  status: MembershipStatus;
  expiresAt: Instant | null;
  createdAt: Instant;
  /** Who issued the invitation this member joined with, if any. */
  invitedByName: string | null;
  version: number;
}

/**
 * Full replace. On an EXPIRED member, a future expiresAt — or null for "no end date" — restores access.
 */
export interface UpdateMemberRequest {
  role: RoleCode;
  unitId: UUID | null;
  expiresAt: Instant | null;
  /** If given and stale, the server answers 409 CONFLICT instead of overwriting. */
  version?: number;
}

// ---------- invitations ----------

/**
 * INVALID: still within its dates and uses, but whoever issued it can no longer invite (e.g. the owner left).
 * Accepting a non-ACTIVE invitation fails with the matching INVITATION_* error code (410).
 */
export type InvitationStatus = 'ACTIVE' | 'EXHAUSTED' | 'EXPIRED' | 'REVOKED' | 'INVALID';

export interface InvitationDto {
  id: UUID;
  buildingId: UUID;
  /** 8 characters, no ambiguous letters/digits. Display with formatInviteCode(). */
  code: string;
  role: RoleCode;
  unitId: UUID | null;
  unitName: string | null;
  maxUses: number;
  useCount: number;
  /** When the invitation itself stops working. */
  expiresAt: Instant;
  /** Fixed end date of the membership created by accepting. */
  membershipExpiresAt: Instant | null;
  /** Or: membership lasts this many days counted from acceptance. At most one of the two is set; neither = no end. */
  membershipDurationDays: number | null;
  note: string | null;
  status: InvitationStatus;
  createdByName: string;
  createdAt: Instant;
  /** Web fallback link, e.g. http://localhost:4200/join/ABCDEFGH */
  joinUrl: string;
  /** App deep link, e.g. buildingapp://join/ABCDEFGH */
  deepLink: string;
}

/** 400 VALIDATION_FAILED field names match these property names. */
export interface CreateInvitationRequest {
  role: RoleCode;
  /** Required when the inviter may only invite into their own unit (owners). */
  unitId?: UUID | null;
  /** 1 = single use (default), up to 500. */
  maxUses?: number;
  /** Default: 7 days from now; at most 90 days. */
  expiresAt?: Instant | null;
  /** Fixed membership end date for whoever accepts (e.g. end of lease). */
  membershipExpiresAt?: Instant | null;
  /** Or: membership lasts N days (1..3650) from acceptance, e.g. 7 for a guest. Not both. */
  membershipDurationDays?: number | null;
  note?: string | null;
}

/**
 * Public: what an invite code leads to, shown before sign-in/registration.
 * Unknown codes → 404 INVITATION_NOT_FOUND; known but unusable codes → 200 with a non-ACTIVE status.
 */
export interface InvitationPreview {
  code: string;
  buildingId: UUID;
  buildingName: string;
  buildingAddress: string | null;
  role: RoleCode;
  unitName: string | null;
  invitedByName: string;
  status: InvitationStatus;
  expiresAt: Instant;
  membershipExpiresAt: Instant | null;
  membershipDurationDays: number | null;
}

export interface AcceptInvitationResponse {
  buildingId: UUID;
  membership: MembershipSummary;
}
