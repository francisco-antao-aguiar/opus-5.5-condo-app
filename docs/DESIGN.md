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

### Phases 2–5 (planned — fields reserved, not yet created)

| Entity | Key fields |
|---|---|
| **Invitation** (P2) | id, buildingId, code (short, unique), roleCode, unitSpaceId?, createdBy, maxUses, useCount, expiresAt, membershipExpiresAt?/membershipDuration?, revokedAt |
| **AssetType** (P3) | code PK (LIGHT, ELEVATOR, DOOR, GATE, INTERCOM, BOILER…), name, icon, builtIn |
| **ProblemType** (P3) | id, assetTypeCode, buildingId? (null = global catalog), code, label, sortOrder, active |
| **Asset** (P3) | id (also the QR id), buildingId, spaceId, assetTypeCode, name, createdAt |
| **Issue** (P4) | id, buildingId, assetId, spaceId (denormalized), problemTypeId?, otherText?, otherTextNormalized?, note, status, visibility (snapshot of effective visibility), sharedWithAdmins, reporterMembershipId, mergedIntoId?, affectedCount, createdAt, statusChangedAt |
| **IssueAffected** (P4) | issueId, userId, createdAt — "me too" + subscription |
| **IssueEvent** (P4) | id, issueId, actorUserId, type (STATUS_CHANGE, COMMENT, ME_TOO, MERGE), fromStatus, toStatus, comment, createdAt |
| **IssuePhoto** (P4) | id, issueId, storageKey, contentType, size — via `StorageService` |
| **PushToken** (P5) | id, userId, expoPushToken, platform, lastSeenAt |
| **Notification** (P5) | id, userId, buildingId, type, payload JSON, readAt, createdAt |

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

## 4. Assumptions

1. **One membership per user per building**, with at most one unit. An owner of two units (flat + garage box) would need a `membership_unit` join table — easy to add, but it changes the `OWN_UNIT` check to "any of my units".
2. **Units spanning floors** (duplexes) are a `UNIT` under their entrance floor with child `ROOM` nodes for the upper level. A unit has exactly one parent; there is no "appears on two floors" link.
3. **Hierarchy rules are deliberately loose:** only the root may be `BUILDING`, and the root cannot be moved or deleted. Anything else can go under anything (shop directly on ground floor, storage room in the garage…).
4. **Open mode lets owners triage** (someone has to, in a self-managed building) but not tenants. This is one row each way if you disagree.
5. **Expiry is checked at authorization time** in `PermissionService`; phase 2 adds a scheduled job that flips `status` to `EXPIRED` for reporting, but correctness never depends on it.
6. Building creation is open to any authenticated user (they become ADMIN of it).
7. Access tokens: 15 min JWT (HS256). Refresh tokens: 30 days, opaque, rotated.
