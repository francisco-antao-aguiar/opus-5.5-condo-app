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

### Phases 4–5 (planned — fields reserved, not yet created)

| Entity | Key fields |
|---|---|
| **Issue** (P4) | id, buildingId, assetId, spaceId (denormalized), problemTypeId?, otherText?, otherTextNormalized?, note, status, visibility (snapshot of effective visibility), sharedWithAdmins, reporterMembershipId, mergedIntoId?, affectedCount, createdAt, statusChangedAt |
| **IssueAffected** (P4) | issueId, userId, createdAt — "me too" + subscription |
| **IssueEvent** (P4) | id, issueId, actorUserId, type (STATUS_CHANGE, COMMENT, ME_TOO, MERGE), fromStatus, toStatus, comment, createdAt |
| **IssuePhoto** (P4) | id, issueId, storageKey, contentType, size — via `StorageService` |
| **PushToken** (P5) | id, userId, expoPushToken, platform, lastSeenAt |
| **Notification** (P5) | id, userId, buildingId, type, payload JSON, readAt, createdAt |

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

