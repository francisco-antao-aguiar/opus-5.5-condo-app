// API contract shared by the web and mobile apps.
// Mirrors the backend DTOs in backend/src/main/java/com/condo/**/dto. Keep both in sync.

export type UUID = string;
/** Local calendar date "YYYY-MM-DD" (no time zone). */
export type LocalDate = string;
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
  | 'MEMBER_MANAGE'
  | 'MAINTENANCE_VIEW'
  | 'MAINTENANCE_MANAGE'
  | 'BOOKING_CREATE'
  | 'BOOKING_MANAGE'
  | 'COST_VIEW'
  | 'COST_MANAGE';

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
  | 'UNKNOWN_ASSET_TYPE'
  | 'SPACE_HAS_ASSETS'
  | 'ASSET_ARCHIVED'
  | 'BUILT_IN_PROBLEM_TYPE'
  | 'DUPLICATE_PROBLEM_TYPE'
  | 'DUPLICATE_ISSUE'
  | 'INVALID_PROBLEM_TYPE'
  | 'INVALID_TRANSITION'
  | 'INVALID_MERGE'
  | 'ISSUE_MERGED'
  | 'SPACE_HAS_OPEN_ISSUES'
  | 'PHOTO_LIMIT'
  | 'FILE_TOO_LARGE'
  | 'UNSUPPORTED_MEDIA_TYPE'
  | 'INVALID_PUSH_TOKEN'
  | 'INVALID_TIME_ZONE'
  | 'UNKNOWN_CURRENCY'
  | 'INVALID_AMOUNT'
  | 'INVALID_RECURRENCE'
  | 'SPACE_HAS_PLANS'
  | 'SPACE_HAS_BOOKINGS'
  | 'NOT_BOOKABLE'
  | 'BOOKING_CONFLICT'
  | 'BOOKING_RULES'
  | 'BOOKING_LIMIT'
  | 'BOOKING_CANCEL_CUTOFF'
  | 'INVALID_STATE'
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
  /** Present on 409 DUPLICATE_ISSUE: the open issue to offer "Me too" on instead. */
  duplicate?: DuplicateIssueInfo;
  /** Present on 403 NOT_A_MEMBER from QR resolve: whose item this is. */
  buildingName?: string;
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
  /** IANA time zone (e.g. "Europe/Lisbon"): schedules and opening hours are local to it. */
  timeZone: string;
  /** ISO 4217 code (e.g. "EUR"): only the default for new cost entries. */
  currency: string;
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
  /** Default "Europe/Lisbon". */
  timeZone?: string;
  /** Default "EUR". */
  currency?: string;
}

export interface UpdateBuildingRequest {
  name: string;
  address: string | null;
  governanceMode: GovernanceModeCode;
  /** Omit to keep the current value. */
  timeZone?: string;
  /** Omit to keep the current value. */
  currency?: string;
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
  /** Active assets attached directly to this space (not descendants) that the caller may see. */
  assetCount: number;
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

// ---------- assets & problem catalog ----------

/** Built-in asset types. Reference data on the server, so unknown codes must be tolerated. */
export type AssetTypeCode =
  | 'LIGHT'
  | 'ELEVATOR'
  | 'DOOR'
  | 'GATE'
  | 'INTERCOM'
  | 'BOILER'
  | 'PLUMBING'
  | 'WINDOW'
  | 'FIRE_SAFETY'
  | 'OTHER'
  | (string & {});

export interface ProblemTypeDto {
  id: UUID;
  assetType: AssetTypeCode;
  label: string;
  sortOrder: number;
  /** Global catalog entry (can be hidden per building, not renamed). */
  builtIn: boolean;
  /** False = hidden (built-in) or deactivated (custom) in this building. Reporting UIs show only active ones. */
  active: boolean;
}

export interface AssetTypeDto {
  code: AssetTypeCode;
  name: string;
  /** Short icon key: bulb, elevator, door, gate, intercom, boiler, plumbing, window, fire, tool. Clients map it to a glyph. */
  icon: string;
  sortOrder: number;
  /** Ordered by sortOrder, then label. Reporting UIs append their own "Other…" choice. */
  problemTypes: ProblemTypeDto[];
}

export interface CreateProblemTypeRequest {
  assetType: AssetTypeCode;
  label: string;
  sortOrder?: number;
}

/** Built-ins: only `active` may change (409 BUILT_IN_PROBLEM_TYPE otherwise). Custom: all fields. */
export interface UpdateProblemTypeRequest {
  label: string;
  sortOrder: number;
  active: boolean;
}

export interface AssetDto {
  /** Stable forever — phase 5 QR codes encode it. */
  id: UUID;
  buildingId: UUID;
  /** Null only for archived assets whose space was later deleted. */
  spaceId: UUID | null;
  spaceName: string | null;
  /** Human path below the building root, e.g. "Floor 2 › 2B › Kitchen". */
  spacePath: string | null;
  type: AssetTypeCode;
  typeName: string;
  name: string;
  notes: string | null;
  /** Visibility of the asset's space after inheritance (null if the space is gone). */
  effectiveVisibility: Visibility | null;
  archived: boolean;
  archivedAt: Instant | null;
  createdAt: Instant;
  version: number;
  /** What the printed QR label encodes: a web link that also opens the app, e.g. https://…/r/{id}. */
  qrUrl: string;
  /** App deep link, e.g. buildingapp://report/asset/{id}. */
  deepLink: string;
}

export interface CreateAssetRequest {
  spaceId: UUID;
  type: AssetTypeCode;
  name: string;
  notes?: string | null;
}

/** Full replace. Moving = changing spaceId. Archived assets must be restored first (409 ASSET_ARCHIVED). */
export interface UpdateAssetRequest {
  spaceId: UUID;
  type: AssetTypeCode;
  name: string;
  notes: string | null;
  version?: number;
}

/** "Add a Stairwell light to every floor": same type/name in several spaces at once (1..500). */
export interface BulkCreateAssetsRequest {
  type: AssetTypeCode;
  name: string;
  spaceIds: UUID[];
  notes?: string | null;
}

export interface AssetQuery {
  /** Limit to this space… */
  spaceId?: UUID;
  /** …and everything below it (default true when spaceId is set). */
  includeDescendants?: boolean;
  type?: AssetTypeCode;
  /** Case-insensitive match on asset name. */
  q?: string;
  includeArchived?: boolean;
}

// ---------- issues ----------

export type IssueStatus = 'REPORTED' | 'ACKNOWLEDGED' | 'IN_PROGRESS' | 'RESOLVED';

export type IssueKind = 'REPORTED' | 'SCHEDULED';

/** Not RESOLVED (and not merged into another issue). */
export const OPEN_ISSUE_STATUSES: readonly IssueStatus[] = ['REPORTED', 'ACKNOWLEDGED', 'IN_PROGRESS'];

export type IssueEventType =
  | 'REPORTED'
  | 'STATUS_CHANGED'
  | 'COMMENT'
  | 'ME_TOO'
  | 'ME_TOO_WITHDRAWN'
  | 'MERGED_INTO'
  | 'MERGED_FROM'
  | 'PHOTO_ADDED'
  | 'SHARING_CHANGED'
  | 'RECLASSIFIED';

/**
 * shared: COMMON issues (the building's shared list) · mine: reported or "me too"-ed by me ·
 * unit: PRIVATE issues of my unit · triage: everything I may triage (COMMON + PRIVATE shared with management).
 */
export type IssueView = 'shared' | 'mine' | 'unit' | 'triage';

export interface IssueSummaryDto {
  id: UUID;
  buildingId: UUID;
  /** Per-building sequence, shown as "#12". */
  number: number;
  /** Problem label, or the "Other" text, e.g. "Flickering". */
  title: string;
  status: IssueStatus;
  visibility: Visibility;
  sharedWithAdmins: boolean;
  assetId: UUID | null;
  assetName: string | null;
  assetType: AssetTypeCode | null;
  spaceId: UUID | null;
  /** Snapshot taken when reported, e.g. "Floor 2 › 2B › Kitchen". */
  locationLabel: string;
  /** REPORTED by a resident, or SCHEDULED: generated by a maintenance plan. */
  kind: IssueKind;
  maintenancePlanId: UUID | null;
  /** Scheduled tasks: local date it's due (YYYY-MM-DD, building time zone). */
  dueOn: LocalDate | null;
  /** Scheduled task still open after dueOn. */
  overdue: boolean;
  problemTypeId: UUID | null;
  otherText: string | null;
  /** Reporter + everyone who said "me too". Drives urgency sorting. */
  affectedCount: number;
  photoCount: number;
  reportedByName: string;
  createdAt: Instant;
  statusChangedAt: Instant;
  /** Last timeline entry of any kind (comment, me too, photo…); what sort=recent orders by. */
  lastActivityAt: Instant;
  /** The caller reported it or said "me too" (so "already reported" cards can say so). */
  affectedByMe: boolean;
  /** REPORTED for longer than the building's threshold (dashboard highlight). */
  stuck: boolean;
  mergedIntoId: UUID | null;
  /** Send back on status changes (also from list/board views) to get 409 CONFLICT instead of overwriting. */
  version: number;
}

export interface IssueEventDto {
  id: UUID;
  type: IssueEventType;
  actorName: string;
  fromStatus: IssueStatus | null;
  toStatus: IssueStatus | null;
  comment: string | null;
  /** MERGED_INTO / MERGED_FROM: the other issue. */
  relatedIssueId: UUID | null;
  relatedIssueNumber: number | null;
  createdAt: Instant;
}

export interface IssuePhotoDto {
  id: UUID;
  /**
   * Signed, short-lived absolute URL on the API host, usable directly in <img>/<Image> without auth headers;
   * refetch the issue for a fresh one after urlExpiresAt.
   */
  url: string;
  urlExpiresAt: Instant;
  contentType: string;
  sizeBytes: number;
  uploadedByName: string;
  createdAt: Instant;
  /** The caller uploaded it or triages the issue. */
  canDelete: boolean;
}

/** What the current user may do with this issue (UI hints; the server re-checks). */
export interface IssueCapabilities {
  isReporter: boolean;
  isAffected: boolean;
  canMeToo: boolean;
  canComment: boolean;
  allowedTransitions: IssueStatus[];
  canMerge: boolean;
  canChangeSharing: boolean;
  canAddPhoto: boolean;
}

export interface IssueDto extends IssueSummaryDto {
  note: string | null;
  timeline: IssueEventDto[];
  photos: IssuePhotoDto[];
  me: IssueCapabilities;
}

/**
 * Exactly one of problemTypeId / otherText. With no assetId, spaceId is required and so is otherText
 * ("something else here"). clientRequestId makes retries idempotent: same id → same issue back.
 */
export interface ReportIssueRequest {
  assetId?: UUID | null;
  spaceId?: UUID | null;
  problemTypeId?: UUID | null;
  otherText?: string | null;
  note?: string | null;
  /** PRIVATE issues only: let building management see and handle it. */
  sharedWithAdmins?: boolean;
  clientRequestId?: UUID;
}

export interface DuplicateIssueInfo {
  issueId: UUID;
  number: number;
  title: string;
  status: IssueStatus;
  affectedCount: number;
  /** The caller already reported it or said "me too". */
  alreadyAffected: boolean;
}

export interface ChangeIssueStatusRequest {
  status: IssueStatus;
  comment?: string | null;
  version?: number;
}

export interface CommentRequest {
  text: string;
}

export interface MergeIssueRequest {
  /** The issue that survives; this one is closed into it. */
  intoIssueId: UUID;
  comment?: string | null;
}

export interface SharingRequest {
  sharedWithAdmins: boolean;
}

export interface IssueQuery {
  view?: IssueView;
  /** Filter on origin; omit for both. */
  kind?: IssueKind;
  /** Comma-separated statuses, or "open" (default) / "all". */
  status?: string;
  spaceId?: UUID;
  assetId?: UUID;
  /** urgency (default): affectedCount desc, then oldest first. recent: last activity first. */
  sort?: 'urgency' | 'recent';
  page?: number;
  /** 1..100, default 25 (400 VALIDATION_FAILED above 100). */
  size?: number;
}

export interface Page<T> {
  items: T[];
  page: number;
  size: number;
  total: number;
}

export interface AssetHotspot {
  assetId: UUID;
  assetName: string;
  locationLabel: string;
  openIssues: number;
  affected: number;
}

export interface IssueDashboard {
  /** Always contains every status (0 when none). */
  counts: Record<IssueStatus, number>;
  stuckThresholdHours: number;
  stuck: IssueSummaryDto[];
  /** Up to 5 assets with the most open issues (even a single one). */
  hotspots: AssetHotspot[];
  /** Scheduled maintenance tasks past their due date, oldest first. */
  overdue: IssueSummaryDto[];
  /** Open scheduled tasks due within the next 7 days. */
  dueThisWeek: number;
  /** "Other" groups seen at least twice and not yet promoted (the review page lists single ones too). */
  otherTextGroups: number;
}

export interface OtherTextGroup {
  assetType: AssetTypeCode;
  normalizedText: string;
  /** Most common original spelling. */
  sampleText: string;
  count: number;
  openCount: number;
  lastReportedAt: Instant;
}

export interface PromoteOtherTextRequest {
  assetType: AssetTypeCode;
  normalizedText: string;
  /** Catalog label to create (defaults to sampleText in UIs). */
  label: string;
}

export interface PromoteOtherTextResponse {
  problemType: ProblemTypeDto;
  /** Issues re-filed under the new catalog entry. */
  reclassifiedIssues: number;
}

// ---------- QR codes ----------

/**
 * Result of scanning an asset's QR code (GET /assets/{id}/resolve).
 * Errors: 404 NOT_FOUND (unknown code, or a private item you can't see), 403 NOT_A_MEMBER with `buildingName`
 * (show "This belongs to X — ask for an invite"), 403 MEMBERSHIP_EXPIRED, 410 ASSET_ARCHIVED.
 */
export interface ResolvedAsset {
  asset: AssetDto;
  buildingId: UUID;
  buildingName: string;
  /** ISSUE_REPORT allowed here; if false, show the asset and its issues read-only. */
  canReport: boolean;
  /** Open issues on it the caller can see, most urgent first ("already reported?"). */
  openIssues: IssueSummaryDto[];
}

// ---------- notifications ----------

export type NotificationType =
  | 'ISSUE_REPORTED'
  | 'ISSUE_STATUS_CHANGED'
  | 'ISSUE_COMMENTED'
  | 'ISSUE_MERGED'
  | 'TASK_DUE'
  | 'TASK_OVERDUE'
  | 'BOOKING_REQUESTED'
  | 'BOOKING_REVIEW_REMINDER'
  | 'BOOKING_CONFIRMED'
  | 'BOOKING_REJECTED'
  | 'BOOKING_CANCELLED';

/**
 * In-app notification. Opening the issue (GET /buildings/{b}/issues/{i}) marks the viewer's notifications about it
 * as read, so clients don't need to call markRead when navigating from a notification. Web has no push: poll
 * unreadCount.
 */
export interface NotificationDto {
  id: UUID;
  type: NotificationType;
  buildingId: UUID;
  buildingName: string;
  issueId: UUID | null;
  title: string;
  body: string;
  /** App-relative route, identical on web and mobile, e.g. "/buildings/{b}/issues/{i}". */
  link: string;
  read: boolean;
  createdAt: Instant;
}

export interface UnreadCount {
  unread: number;
}

export type PushPlatform = 'ios' | 'android' | 'web';

export interface RegisterPushTokenRequest {
  /** Expo push token, e.g. "ExponentPushToken[xxxxxxxx]". Re-registering moves it to the current user. */
  token: string;
  platform: PushPlatform;
  deviceName?: string | null;
}

// ---------- maintenance (phase 6) ----------

export type Weekday = 'MON' | 'TUE' | 'WED' | 'THU' | 'FRI' | 'SAT' | 'SUN';
export type RecurrenceUnit = 'ONCE' | 'DAY' | 'WEEK' | 'MONTH' | 'YEAR';

/**
 * Deliberately small, validated recurrence (not RFC 5545):
 * ONCE (on startsOn) · DAY {every} · WEEK {every, weekdays} · MONTH {every, dayOfMonth} · YEAR {every, month, dayOfMonth}.
 * dayOfMonth beyond the month's end clamps to its last day. 400 INVALID_RECURRENCE otherwise.
 */
export interface Recurrence {
  unit: RecurrenceUnit;
  /** 1..365, ignored for ONCE. Default 1. */
  every?: number;
  weekdays?: Weekday[];
  dayOfMonth?: number;
  month?: number;
}

export type PlanPausedReason = 'MANUAL' | 'ASSET_ARCHIVED';

export interface MaintenancePlanDto {
  id: UUID;
  buildingId: UUID;
  assetId: UUID | null;
  assetName: string | null;
  spaceId: UUID | null;
  locationLabel: string;
  title: string;
  description: string | null;
  checklist: string[];
  recurrence: Recurrence;
  /** "Every 6 months on day 1", for display. */
  recurrenceText: string;
  startsOn: LocalDate;
  endsOn: LocalDate | null;
  /** Tasks are created this many days before they're due. */
  leadDays: number;
  assigneeNote: string | null;
  active: boolean;
  pausedReason: PlanPausedReason | null;
  /** Next occurrence not yet generated (null when the plan is finished). */
  nextDueOn: LocalDate | null;
  /** The plan's most recent open task, if any. */
  openTaskId: UUID | null;
  createdAt: Instant;
  version: number;
}

/** Exactly one of assetId / spaceId. Full replace on PUT. */
export interface SaveMaintenancePlanRequest {
  assetId?: UUID | null;
  spaceId?: UUID | null;
  title: string;
  description?: string | null;
  checklist?: string[];
  recurrence: Recurrence;
  startsOn: LocalDate;
  endsOn?: LocalDate | null;
  /** 0..90, default 7. */
  leadDays?: number;
  assigneeNote?: string | null;
  version?: number;
}

export interface RecurrencePreviewRequest {
  recurrence: Recurrence;
  startsOn: LocalDate;
  endsOn?: LocalDate | null;
  /** 1..24, default 5. */
  count?: number;
}

export interface RecurrencePreview {
  dates: LocalDate[];
  recurrenceText: string;
}

// ---------- costs (phase 6) ----------

/**
 * Money is a decimal STRING plus ISO 4217 currency, never a JS number. Decimals must fit the currency
 * (2 for EUR, 0 for JPY…). Totals are never mixed across currencies.
 */
export interface Money {
  amount: string;
  currency: string;
}

export type CostCategory = 'REPAIR' | 'MAINTENANCE' | 'CLEANING' | 'UTILITIES' | 'INSURANCE' | 'OTHER';

export interface CostReceiptDto {
  /** Signed, expiring link (like issue photos). */
  url: string;
  urlExpiresAt: Instant;
  contentType: string;
}

export interface CostEntryDto {
  id: UUID;
  buildingId: UUID;
  amount: Money;
  incurredOn: LocalDate;
  category: CostCategory;
  description: string;
  vendor: string | null;
  issueId: UUID | null;
  issueNumber: number | null;
  maintenancePlanId: UUID | null;
  planTitle: string | null;
  assetId: UUID | null;
  assetName: string | null;
  spaceId: UUID | null;
  locationLabel: string | null;
  receipt: CostReceiptDto | null;
  createdByName: string;
  createdAt: Instant;
  version: number;
}

/**
 * Full replace on PUT. Anchors are optional; an issue anchor fills in asset/space automatically.
 * amount.currency defaults to the building's currency when omitted.
 */
export interface SaveCostEntryRequest {
  amount: { amount: string; currency?: string };
  incurredOn: LocalDate;
  category: CostCategory;
  description: string;
  vendor?: string | null;
  issueId?: UUID | null;
  maintenancePlanId?: UUID | null;
  assetId?: UUID | null;
  spaceId?: UUID | null;
  version?: number;
}

export interface CostQuery {
  from?: LocalDate;
  to?: LocalDate;
  category?: CostCategory;
  assetId?: UUID;
  issueId?: UUID;
  maintenancePlanId?: UUID;
  page?: number;
  size?: number;
}

export type CostGroupBy = 'month' | 'category' | 'asset' | 'space';

export interface CostSummaryRow {
  /** month "2026-09", category code, or asset/space id. */
  key: string;
  label: string;
  /** One total per currency. */
  totals: Money[];
  count: number;
}

export interface CostSummary {
  groupBy: CostGroupBy;
  rows: CostSummaryRow[];
  totals: Money[];
}

// ---------- booking (phase 6) ----------

export type BookingStatus = 'PENDING' | 'CONFIRMED' | 'REJECTED' | 'CANCELLED';

/** Local "HH:mm" ranges per weekday, e.g. { MON: [["10:00","22:00"]] }. Missing day = closed. */
export type OpeningHours = Partial<Record<Weekday, [string, string][]>>;

export interface BookingPolicyDto {
  spaceId: UUID;
  spaceName: string;
  locationLabel: string;
  enabled: boolean;
  slotMinutes: number;
  minMinutes: number;
  maxMinutes: number;
  openingHours: OpeningHours;
  advanceDays: number;
  maxActivePerUnit: number | null;
  cancelCutoffHours: number;
  rulesText: string | null;
  /** The building's, for rendering. */
  timeZone: string;
  version: number;
}

export type SaveBookingPolicyRequest = Omit<BookingPolicyDto, 'spaceId' | 'spaceName' | 'locationLabel' | 'timeZone' | 'version'> & {
  version?: number;
};

export interface BookingDto {
  id: UUID;
  spaceId: UUID;
  spaceName: string;
  startsAt: Instant;
  endsAt: Instant;
  status: BookingStatus;
  note: string | null;
  /** Admin's reason (rejection/cancellation). */
  decisionNote: string | null;
  /** Only for my own bookings and for BOOKING_MANAGE holders; null otherwise. */
  requestedByName: string | null;
  unitName: string | null;
  mine: boolean;
  decidedByName: string | null;
  decidedAt: Instant | null;
  createdAt: Instant;
  canCancel: boolean;
  canDecide: boolean;
  version: number;
}

/** Every request starts PENDING until an admin approves it. Overlaps → 409 BOOKING_CONFLICT. */
export interface CreateBookingRequest {
  spaceId: UUID;
  startsAt: Instant;
  endsAt: Instant;
  note?: string | null;
}

export interface BookingDecisionRequest {
  /** Shown to the requester; useful on reject/cancel. */
  note?: string | null;
}

export interface BusySlot {
  startsAt: Instant;
  endsAt: Instant;
  /** PENDING requests hold their slot too. */
  status: 'PENDING' | 'CONFIRMED';
  mine: boolean;
}

export interface Availability {
  spaceId: UUID;
  timeZone: string;
  from: Instant;
  to: Instant;
  busy: BusySlot[];
  policy: BookingPolicyDto;
}

export interface BookingQuery {
  mine?: boolean;
  spaceId?: UUID;
  /** Comma-separated BookingStatus values. */
  status?: string;
  from?: Instant;
  to?: Instant;
}

export interface CalendarLink {
  /** Signed iCalendar (.ics) feed of my confirmed bookings, for calendar apps. */
  url: string;
}

