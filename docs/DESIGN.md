# Condo App — Design

This document is the source of truth for the data model, the permission policy and the API surface.
Phases 2–5 entities are listed so phase 1 does not paint us into a corner; only phase 1 tables exist today.

## 1. Data model

```
                       ┌──────────────┐
                       │  app_user    │ id, email (unique), password_hash, display_name, created_at
                       └──────┬───────┘
          refresh_token ──────┤ (id, user_id, token_hash, expires_at, revoked_at, replaced_by)
                              │ 1..*
┌────────────────┐     ┌──────┴───────┐      ┌──────────┐
│governance_mode │◄────┤  building    │      │  role    │ code PK (OWNER, TENANT, MANAGER, ADMIN…), name, rank
│ code PK, name  │     │ id, name,    │      └────┬─────┘
└──────┬─────────┘     │ address,     │           │
       │ 1..*          │ governance_  │           │
┌──────┴──────────────┐│ mode         │           │
│ permission_policy   ││ created_at   │           │
│ governance_mode ─┐  │└──┬────────┬──┘           │
│ action           │  │   │ 1..*   │ 1..*         │
│ role_code ───────┼──┼───┼────────┼──────────────┘
│ scope ANY|OWN_UNIT  │   │        │
└─────────────────────┘   │   ┌────┴────────────┐
                          │   │  membership     │ id, building_id, user_id, role_code,
                          │   │                 │ unit_space_id?, status ACTIVE|REVOKED,
                          │   │                 │ expires_at?, created_at, revoked_at
                          │   └────┬────────────┘
                     ┌────┴────────┴──┐
                     │     space      │ id, building_id, parent_id? (self FK, ON DELETE CASCADE),
                     │ (tree node)    │ type BUILDING|FLOOR|UNIT|ROOM|COMMON_AREA, name, sort_order,
                     │                │ visibility COMMON|PRIVATE|null(=inherit), path, depth, version
                     └────────────────┘
```

### Phase 1 (implemented)

| Entity | Key fields | Notes |
|---|---|---|
| **User** | id (UUID), email, passwordHash, displayName | BCrypt hashes. |
| **RefreshToken** | id, userId, tokenHash (SHA-256), expiresAt, revokedAt | Opaque, rotated on every use; reuse of a rotated token revokes the whole family. |
| **Role** | code (PK), name, rank | Reference table — new roles are rows. `rank` stops a user granting a role above their own. |
| **GovernanceMode** | code (PK), name, description | `MANAGED`, `OPEN` are rows. |
| **PermissionPolicy** | (governanceMode, action, roleCode) unique, scope | The whole authorization model. `scope = ANY` or `OWN_UNIT` (target must be inside the member's unit subtree). |
| **Building** | id, name, address, governanceMode | Root `Space` (type BUILDING, parent null) is created with it. |
| **Membership** | id, building, user, role, unitSpace?, status, expiresAt? | One per (building, user). `expiresAt` is the *membership* expiry; checked at every authorization. |
| **Space** | id, buildingId, parentId, type, name, sortOrder, visibility?, path, depth | Generic tree node. |

### Phase 2 (implemented)

| Entity | Key fields | Notes |
|---|---|---|
| **Invitation** | id, buildingId, code (unique), roleCode, unitSpace?, createdByMembership, maxUses, useCount, expiresAt, membershipExpiresAt? | membershipDurationDays?, note?, revokedAt? | Status is computed: REVOKED > EXPIRED > EXHAUSTED > ACTIVE. Deleting the unit deletes its invitations. |
| **Membership** (+) | invitationId? | Provenance: which invitation (and so which inviter) a member joined with. |

* **Codes**: 8 characters from a 31-symbol alphabet without look-alikes (no 0/O, 1/I/L) ≈ 40 bits, shown as `ABCD-EFGH`, accepted in any case with or without the dash. Links: `{web}/join/{code}` and `buildingapp://join/{code}`.
* **Who may invite** = `MEMBER_INVITE` on the invitation's unit (null unit → building-wide, so `OWN_UNIT` holders must pick their unit). The invited role's rank may not exceed the inviter's.
* **Accept** locks the invitation row (`SELECT … FOR UPDATE`) so concurrent accepts can't exceed `maxUses`, then re-checks that the issuer *still* holds `MEMBER_INVITE` on that unit — an owner who sold their flat can't keep letting people in with an old link. Already-active members are refused (no silent role change); revoked/expired members are reactivated with the invitation's role/unit/expiry.
* **Preview** (`GET /invitations/{code}`) is public so the join page can say "Ana invited you to Edifício Aurora as tenant of 2B" before sign-up. Failed lookups are rate-limited per caller (user id, else IP).
* **Membership end**: an invitation carries a fixed `membershipExpiresAt` *or* a `membershipDurationDays` resolved at accept time (accepted at T → expires T + N days), never both (DB check constraint).
* **Expiry**: access ends exactly at `expiresAt` because `PermissionService` checks it on every call. A scheduled job (`app.memberships.expiry-cron`, default every 15 min) also flips such rows to `EXPIRED` so lists and reports agree. Setting a new future expiry on an expired member reactivates them.
* **Concurrency**: Space, Member and Building DTOs expose `version`; updates may send it back and get `409 CONFLICT` when stale.

### Phase 3 (implemented)

| Entity | Key fields | Notes |
|---|---|---|
| **AssetType** | code PK, name, icon, sortOrder | Reference data like roles: LIGHT, ELEVATOR, DOOR, GATE, INTERCOM, BOILER, PLUMBING, WINDOW, FIRE_SAFETY, OTHER. |
| **ProblemType** | id, assetTypeCode, buildingId? (null = built-in), label, sortOrder, active | Built-ins have fixed UUIDs (stable across environments, referenced by phase 4 issues). Custom ones belong to one building. |
| **ProblemTypeHidden** | (buildingId, problemTypeId) | A building hides a built-in that doesn't apply, without touching the global catalog. |
| **Asset** | id (stable, QR target), buildingId, spaceId?, assetTypeCode, name, notes?, archivedAt? | Attaches to any space. "Delete" = archive: the id, issue history and printed QR labels survive. |

* **Archive, don't delete.** `DELETE /assets/{id}` sets `archivedAt`; `POST …/restore` undoes it. A space whose subtree still has *active* assets can't be deleted (409 `SPACE_HAS_ASSETS`); archived assets don't block it and keep their history with `spaceId = null` (FK `ON DELETE SET NULL`, plus a check that only archived assets may lack a space).
* **Private assets are private.** An asset in a PRIVATE space is listed only to members whose unit contains it and to members allowed to edit assets or triage issues there (`can(ASSET_EDIT|ISSUE_TRIAGE, space)`). So the reporting flow never shows you a neighbour's boiler. Same rule will apply to private issues in phase 4.
* **Permissions** (policy rows, no new code path): `ASSET_CREATE` on the target space, `ASSET_EDIT` on the current *and* new space when moving, `ASSET_DELETE` to archive/restore, `CATALOG_EDIT` for the building catalog. **Policy change (data only):** Managed mode now also grants OWNER `ASSET_CREATE/EDIT/DELETE` scoped to `OWN_UNIT`, so owners can register the boiler in their own flat; building structure stays admin-only.
* **Catalog rules:** built-ins can be hidden per building but not renamed (409 `BUILT_IN_PROBLEM_TYPE`); labels are unique per asset type within a building, case-insensitively, including built-ins (409 `DUPLICATE_PROBLEM_TYPE`). Custom entries are deactivated, never deleted (phase 4 issues reference them). The reporting UI's "Other…" choice is client-side; promoting frequent "Other" texts into custom entries is a phase 4 admin view on top of `POST /catalog/problem-types`.
* **Bulk add**: one type + name across up to 500 spaces in one call ("Stairwell light" on every floor).
* **Archived assets without a space** (their space was deleted later) are visible only to members with building-wide `ASSET_DELETE`; restoring one returns 409 since it has nowhere to go.
* **Phase 5 note:** QR deep links carry only the asset id, so phase 5 adds a building-less `GET /assets/{id}` resolver that answers with the building (or `NOT_A_MEMBER`).

### Phase 4 (implemented)

| Entity | Key fields | Notes |
|---|---|---|
| **Issue** | id, buildingId, number (per building), assetId?, spaceId?, locationLabel (snapshot), problemTypeId? \| otherText (+ normalized), note?, status, visibility (snapshot), sharedWithAdmins, reporter, mergedIntoId?, affectedCount, clientRequestId?, createdAt, statusChangedAt, lastActivityAt, version | Exactly one of problemTypeId / otherText. No asset = "something else here" on a space (otherText required). |
| **IssueAffected** | (issueId, userId), kind REPORTER \| ME_TOO, createdAt | Reporter + "me too" people = affectedCount and the phase 5 notification audience. |
| **IssueEvent** | id, issueId, actor, type, fromStatus?, toStatus?, comment?, relatedIssueId?, createdAt | The timeline: REPORTED, STATUS_CHANGED, COMMENT, ME_TOO(_WITHDRAWN), MERGED_INTO/FROM, PHOTO_ADDED, SHARING_CHANGED, RECLASSIFIED. |
| **IssuePhoto** | id, issueId, storageKey, contentType, sizeBytes, uploadedBy, createdAt | Bytes live behind `StorageService` (local disk in dev, S3-ready). |
| **Building** (+) | issueSeq | Row-locked counter for issue numbers (#1, #2…). |

* **Reporting** = asset + catalog problem (or "Other" text), optional note and photos. The problem must be *offered* by this building for the asset's type (built-in not hidden, or own active custom entry), else 400 `INVALID_PROBLEM_TYPE`. Requires `ISSUE_REPORT` on the space and being able to see the asset (private rule).
* **Idempotent submit**: `clientRequestId` is unique per reporter. Re-sending the same report (mobile offline queue, flaky network) returns the issue created the first time instead of a second one.
* **Duplicates**: before creating, an *open* issue on the same asset with the same problem type — or, for "Other", the same normalized text (lower-case, trimmed, collapsed spaces, no trailing punctuation) — answers **409 `DUPLICATE_ISSUE`** with `duplicate: {issueId, number, title, status, affectedCount, alreadyAffected}`. Clients show "Already reported — N neighbours affected" with **Me too**. `GET /assets/{id}/open-issues` lets the asset screen show them *before* the user picks a problem.
* **Me too** adds the caller to IssueAffected (idempotent), bumps affectedCount and subscribes them (phase 5 notifications). Withdrawable, except by the reporter.
* **Lifecycle**: REPORTED → ACKNOWLEDGED → IN_PROGRESS → RESOLVED, forward skips allowed, RESOLVED → REPORTED (reopen); anything else is 409 `INVALID_TRANSITION`. Who:
  * *triagers* — `ISSUE_TRIAGE` on the space and allowed to see the issue — any transition, plus merge;
  * the *reporter* — RESOLVED ("fixed itself") and reopen of their own issue;
  * *affected* members — reopen;
  * for PRIVATE issues not shared with management, the *unit's own members* act as its triagers.
* **Merge** (triager on both): the source is closed (RESOLVED, `mergedIntoId`) and its affected people are added to the target; both timelines record it. Merged issues are hidden from lists and refuse further changes (409 `ISSUE_MERGED`).
* **Private issues** (asset/space effectively PRIVATE when reported): visible to the reporter and the unit's members; to triagers only when `sharedWithAdmins`. They never appear in the `shared` view. Reporter/unit members can toggle sharing.
* **Views**: `shared` (COMMON), `mine` (reported or me-too), `unit` (PRIVATE of my unit), `triage` (what I may triage). Summaries carry `affectedByMe` and `lastActivityAt` per viewer. Sort `urgency` = affectedCount desc, then oldest; `recent` = last activity. Default status filter: open.
* **Dashboard** (`ISSUE_TRIAGE`): counts per status, issues **stuck in REPORTED** longer than `app.issues.stuck-after` (default 48h), hotspot assets, number of "Other" groups to review.
* **"Other" review** (`CATALOG_EDIT`): groups by (asset type, normalized text) with count/open count; **promote** creates a custom problem type (phase 3 catalog) and re-files matching issues to it (RECLASSIFIED event; `otherText` kept for history).
* **Photos**: max 5 per issue, 10 MB each, JPEG/PNG/WebP/HEIC (checked by content sniffing, not just the header). Served via `/api/files/photos/{id}?exp=&sig=` — HMAC-signed, 1-hour links — so `<img>` tags work without an Authorization header. Uploader or triager can delete.
* **Notifications (phase 5 hook)**: every timeline event publishes an `IssueActivity` application event after commit, carrying the issue and the affected users. Phase 5 listens to it for push + in-app notifications; nothing in phase 4 depends on it.
* **Spaces**: a space whose subtree has open issues can't be deleted (409 `SPACE_HAS_OPEN_ISSUES`); resolved issues keep their `locationLabel` snapshot with `spaceId = null`.

### Phase 5 (implemented)

| Entity | Key fields | Notes |
|---|---|---|
| **PushToken** | id, userId, token (unique), platform, deviceName?, createdAt, lastSeenAt | Expo push token per device. Re-registering a token moves it to the current user (shared phones); tokens Expo reports as `DeviceNotRegistered` are deleted. |
| **Notification** | id, userId, buildingId, issueId?, type, title, body, link, readAt?, createdAt | The in-app list. `link` is an app-relative route identical on web and mobile (`/buildings/{b}/issues/{i}`). |

**QR codes**
* Every asset's id is its QR identity (stable since phase 3; archived assets keep it). `AssetDto.qrUrl` = `{webBaseUrl}/r/{assetId}` is what gets printed; `AssetDto.deepLink` = `buildingapp://report/asset/{assetId}` is the app route.
* **Why the label encodes the web URL rather than the custom scheme:** phone camera apps reliably open https links, and the label must still work for someone without the app installed. The web route `/r/:assetId` shows the report flow for that asset (after sign-in) and offers "Open in the app" via the deep link. In production, register the web domain as Android App Links / iOS Universal Links so the camera opens the app directly — that needs a real domain (`assetlinks.json` / `apple-app-site-association`), not possible on localhost.
* `GET /assets/{id}/resolve` (authenticated, building-less) answers with the asset, its building, `canReport` and its open issues. Not a member → 403 `NOT_A_MEMBER` with `buildingName` so the app can say whose it is; private item of another unit or unknown id → 404; archived → 410 `ASSET_ARCHIVED`. The asset id carries no secret: the answer depends entirely on the caller's membership.
* `parseAssetCode()` in `@condo/shared` accepts the web link, the app link or a bare id, so the in-app scanner, deep links and manual entry share one parser.
* **Label sheet (web):** admins select assets → printable A4 sheet (QR, item name, location, building, "Scan to report a problem"); "Save as PDF" from the print dialog covers the PDF case.

**Notifications**
* Phase 4's `IssueActivity` (published after commit, with the issue's affected people minus the actor) feeds `NotificationService`, which runs on a background executor so requests never wait for delivery. For each recipient it stores an in-app **Notification** and sends an **Expo push** to the user's registered devices.
* Who is notified:
  * `ISSUE_STATUS_CHANGED`, `ISSUE_MERGED`, `ISSUE_COMMENTED` → reporter + "me too" people (never the actor). Status changes are required by the spec; comments are included because silence after a reply breaks "reporters always get feedback".
  * `ISSUE_REPORTED` → members who may **triage** that issue (for an unshared private issue: the unit's own members), never the reporter.
* Push goes through `PushSender`: `ExpoPushSender` (batches of 100 to the Expo push API, deletes tokens rejected as `DeviceNotRegistered`) when `app.push.enabled=true`, otherwise a logging sender (dev default, tests). An Expo access token can be set via `APP_PUSH_ACCESS_TOKEN`.
* Out of scope for now: per-user notification preferences and quiet hours (a `notification_preference` table keyed by user × type would slot in front of delivery).

### Phase 6 compatibility (design only)

* **Maintenance schedules / recurring tasks** → `maintenance_plan(assetId|spaceId, rrule, nextDueAt)` producing `task` rows; tasks can reuse the Issue timeline pattern. Assets and spaces are already stable targets.
* **Announcements** → `announcement(buildingId, audienceSpaceId?, …)`; audience is a subtree of the space tree (same `path` prefix logic as permissions).
* **Shared-space booking** → `bookable` flag/config on `space` (COMMON_AREA nodes) + `booking(spaceId, membershipId, start, end)`.
* **Cost tracking** → `cost_entry(buildingId, issueId?|taskId?|assetId?, amount, currency, …)`.
* Each of these adds new **actions** (`ANNOUNCEMENT_POST`, `BOOKING_CREATE`, `COST_VIEW`…) as rows in `permission_policy` — no new authorization code path.

### Tree storage strategy — adjacency list + materialized path

Each `space` row stores `parent_id` (source of truth, FK) **and** `path` = `/rootId/…/ownId/` plus `depth`.

* **Subtree** = `path LIKE '/…/nodeId/%'` — one indexed query, portable (H2 and PostgreSQL), no recursive CTEs (which JPA doesn't support).
* **"Is X inside unit U?"** (the `OWN_UNIT` permission scope) = `x.path.startsWith(u.path)` — pure string check, no DB round trip.
* **Move** = one bulk `UPDATE … SET path = CONCAT(newPrefix, SUBSTRING(path, len(oldPrefix)+1))` over the subtree; cycle check is `newParent.path.startsWith(node.path)`.
* **Whole tree** = `WHERE building_id = ?` (a building is a few hundred nodes) and the client assembles it from `parentId`.
* UUIDs make paths ~37 chars per level; real buildings are ≤ 6 levels deep, `VARCHAR(1024)` is ample.

### Visibility

`space.visibility` is nullable; `null` means *inherit from parent*. The root is created `COMMON`; `UNIT` nodes default to `PRIVATE` when not specified. The API returns both the stored value and the computed `effectiveVisibility`.

## 2. Permission policy

All checks go through `PermissionService.can(membership, action, targetSpace)`:

1. membership must be `ACTIVE` and not past `expiresAt` (expiry is enforced at authorization time — no window where an expired tenant still has access);
2. look up rows `(building.governanceMode, action, membership.role)`;
3. `ANY` → allowed; `OWN_UNIT` → allowed iff `target.path` starts with the member's unit path.

A new mode (e.g. "anyone adds devices, only admins delete") = one `governance_mode` row + its policy rows. Building-level overrides could later be a `building_permission_override` table merged in the same method.

| Action | MANAGED | OPEN |
|---|---|---|
| `BUILDING_VIEW` | ADMIN, MANAGER, OWNER, TENANT | ADMIN, MANAGER, OWNER, TENANT |
| `BUILDING_SETTINGS` (rename, governance mode) | ADMIN | ADMIN |
| `STRUCTURE_EDIT` | ADMIN, MANAGER | ADMIN, MANAGER, OWNER, TENANT |
| `ASSET_CREATE` | ADMIN, MANAGER | ADMIN, MANAGER, OWNER, TENANT |
| `ASSET_EDIT` | ADMIN, MANAGER | ADMIN, MANAGER, OWNER, TENANT |
| `ASSET_DELETE` | ADMIN, MANAGER | ADMIN, MANAGER, OWNER |
| `ISSUE_REPORT` | ADMIN, MANAGER, OWNER, TENANT | ADMIN, MANAGER, OWNER, TENANT |
| `ISSUE_TRIAGE` | ADMIN, MANAGER | ADMIN, MANAGER, OWNER |
| `CATALOG_EDIT` (custom problem types, promote "Other") | ADMIN, MANAGER | ADMIN, MANAGER, OWNER |
| `MEMBER_INVITE` | ADMIN, MANAGER; OWNER *(own unit)* | ADMIN, MANAGER; OWNER *(own unit)* |
| `MEMBER_MANAGE` (change role/unit/expiry, revoke) | ADMIN, MANAGER; OWNER *(own unit)* | ADMIN, MANAGER; OWNER *(own unit)* |

Cross-cutting invariants enforced in the member service (not per-mode):
* you cannot grant a role with a higher `rank` than your own, nor modify a member who outranks you;
* a building always keeps at least one active ADMIN.

## 3. Phase 1 REST API

All under `/api`. Errors are RFC 7807 `application/problem+json` with an extra `code` and optional `errors[]`.

| Method | Path | Auth / action |
|---|---|---|
| POST | `/auth/register` | public |
| POST | `/auth/login` | public |
| POST | `/auth/refresh` | public (refresh token) |
| POST | `/auth/logout` | public (refresh token) |
| GET | `/me` | authenticated — user + memberships |
| GET | `/governance-modes` | authenticated — presets with their policy rows |
| GET | `/roles` | authenticated — roles with rank |
| GET | `/buildings` | authenticated — my buildings |
| POST | `/buildings` | authenticated — creator becomes ADMIN; optional inline `structure` (wizard) |
| GET | `/buildings/{b}` | `BUILDING_VIEW` |
| PUT | `/buildings/{b}` | `BUILDING_SETTINGS` |
| GET | `/buildings/{b}/permissions/me` | member — effective actions (UI hints only) |
| GET | `/buildings/{b}/spaces` | `BUILDING_VIEW` — flat list, client builds tree |
| GET | `/buildings/{b}/spaces/{s}` | `BUILDING_VIEW` |
| POST | `/buildings/{b}/spaces` | `STRUCTURE_EDIT` on parent |
| PUT | `/buildings/{b}/spaces/{s}` | `STRUCTURE_EDIT` on node |
| POST | `/buildings/{b}/spaces/{s}/move` | `STRUCTURE_EDIT` on node and new parent |
| DELETE | `/buildings/{b}/spaces/{s}?cascade=true` | `STRUCTURE_EDIT` on node |
| POST | `/buildings/{b}/spaces/generate` | `STRUCTURE_EDIT` on root — quick-setup wizard |
| GET | `/buildings/{b}/members` | `BUILDING_VIEW` |
| PUT | `/buildings/{b}/members/{m}` | `MEMBER_MANAGE` on member's unit |
| DELETE | `/buildings/{b}/members/{m}` | `MEMBER_MANAGE` on member's unit (revoke) |

### Phase 2 endpoints

| Method | Path | Auth / action |
|---|---|---|
| GET | `/buildings/{b}/invitations` | `MEMBER_INVITE` — only invitations for spaces the caller may invite into |
| POST | `/buildings/{b}/invitations` | `MEMBER_INVITE` on the unit (or building-wide when unit is null) |
| DELETE | `/buildings/{b}/invitations/{id}` | `MEMBER_INVITE` on its unit (revoke) |
| GET | `/invitations/{code}` | public, rate-limited — preview |
| POST | `/invitations/{code}/accept` | authenticated |

### Phase 3 endpoints

| Method | Path | Auth / action |
|---|---|---|
| GET | `/buildings/{b}/catalog?includeInactive=` | `BUILDING_VIEW` (inactive entries need `CATALOG_EDIT`) |
| POST | `/buildings/{b}/catalog/problem-types` | `CATALOG_EDIT` |
| PUT | `/buildings/{b}/catalog/problem-types/{id}` | `CATALOG_EDIT` (built-ins: hide/show only) |
| GET | `/buildings/{b}/assets?spaceId=&includeDescendants=&type=&q=&includeArchived=` | `BUILDING_VIEW`, filtered by private-space rule |
| GET | `/buildings/{b}/assets/{id}` | `BUILDING_VIEW` + private-space rule |
| POST | `/buildings/{b}/assets` | `ASSET_CREATE` on the space |
| POST | `/buildings/{b}/assets/bulk` | `ASSET_CREATE` on every space |
| PUT | `/buildings/{b}/assets/{id}` | `ASSET_EDIT` on old and new space |
| DELETE | `/buildings/{b}/assets/{id}` | `ASSET_DELETE` (archive) |
| POST | `/buildings/{b}/assets/{id}/restore` | `ASSET_DELETE` |

### Phase 4 endpoints

| Method | Path | Auth / action |
|---|---|---|
| POST | `/buildings/{b}/issues` | `ISSUE_REPORT` on the space (409 `DUPLICATE_ISSUE` with `duplicate`) |
| GET | `/buildings/{b}/issues?view=&status=&spaceId=&assetId=&sort=&page=&size=` | member; filtered by issue visibility |
| GET | `/buildings/{b}/issues/{id}` | can see the issue |
| GET | `/buildings/{b}/assets/{assetId}/open-issues` | can see the asset |
| POST | `/buildings/{b}/issues/{id}/status` | lifecycle rules above |
| POST | `/buildings/{b}/issues/{id}/comments` | can see the issue |
| POST / DELETE | `/buildings/{b}/issues/{id}/me-too` | can see the issue (`ISSUE_REPORT`) |
| POST | `/buildings/{b}/issues/{id}/merge` | triager on both issues |
| PUT | `/buildings/{b}/issues/{id}/sharing` | reporter or unit member, PRIVATE issues |
| POST | `/buildings/{b}/issues/{id}/photos` (multipart `file`) | reporter, affected, or triager |
| DELETE | `/buildings/{b}/issues/{id}/photos/{photoId}` | uploader or triager |
| GET | `/files/photos/{photoId}?exp=&sig=` | public, signed link |
| GET | `/buildings/{b}/issues/dashboard` | `ISSUE_TRIAGE` |
| GET | `/buildings/{b}/issues/other-texts` | `CATALOG_EDIT` |
| POST | `/buildings/{b}/issues/other-texts/promote` | `CATALOG_EDIT` |

### Phase 5 endpoints

| Method | Path | Auth / action |
|---|---|---|
| GET | `/assets/{assetId}/resolve` | authenticated; membership of the asset's building |
| GET | `/me/notifications?unreadOnly=&page=&size=` | authenticated (own notifications only) |
| GET | `/me/notifications/unread-count` | authenticated |
| POST | `/me/notifications/{id}/read` | owner of the notification |
| POST | `/me/notifications/read-all` | authenticated |
| POST | `/me/push-tokens` | authenticated — register/move a device token |
| DELETE | `/me/push-tokens?token=` | authenticated — on logout |

## 4. Assumptions

1. **One membership per user per building**, with at most one unit. An owner of two units (flat + garage box) would need a `membership_unit` join table — easy to add, but it changes the `OWN_UNIT` check to "any of my units".
2. **Units spanning floors** (duplexes) are a `UNIT` under their entrance floor with child `ROOM` nodes for the upper level. A unit has exactly one parent; there is no "appears on two floors" link.
3. **Hierarchy rules are deliberately loose:** only the root may be `BUILDING`, and the root cannot be moved or deleted. Anything else can go under anything (shop directly on ground floor, storage room in the garage…).
4. **Open mode lets owners triage** (someone has to, in a self-managed building) but not tenants. This is one row each way if you disagree.
5. **Expiry is checked at authorization time** in `PermissionService`; phase 2 adds a scheduled job that flips `status` to `EXPIRED` for reporting, but correctness never depends on it.
6. Building creation is open to any authenticated user (they become ADMIN of it).
7. Access tokens: 15 min JWT (HS256). Refresh tokens: 30 days, opaque, rotated.
8. **Owners may invite co-owners** into their own unit (same rank), not just tenants. *(Confirmed.)*
9. **Membership end** is either a fixed date chosen when inviting (end of lease) or a duration counted from acceptance (e.g. 7 days for a guest; 7 is the UI preset), never both. No end date is the default. *(Confirmed.)*
10. **Asset types are global reference data** (like roles); buildings customise the *problem* catalog, not the list of asset types. A building-specific asset type would be a nullable `building_id` on `asset_type`, mirroring `problem_type`.
11. **Managed-mode owners manage assets in their own unit** (data-only policy change, see Phase 3).
12. **Reports without an asset** are allowed on a space with free text ("something else here"), so residents are never stuck when equipment isn't registered.
13. **Duplicate detection is per asset** (same asset + same problem, or same normalized "Other" text). Space-level reports aren't deduplicated automatically; triagers merge them.
14. **The reporter may close their own issue** ("it fixed itself") and reopen it; neighbours who said "me too" may reopen. Everything else needs `ISSUE_TRIAGE`.
15. **Printed QR labels encode the https web link**, which opens the app when installed (with App/Universal Links in production) and falls back to the web report flow otherwise; the custom `buildingapp://` scheme is the app's internal route and is also accepted by the scanner.
16. **Comment notifications** go to the same audience as status changes; new-issue notifications go to triagers. Notification preferences are not in scope yet.

