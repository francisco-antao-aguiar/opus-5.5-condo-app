# Condo — web app

The Angular 21 admin app for the condo building-management product. It's standalone, zoneless and signal-based. It talks to the backend through the typed client in `@condo/shared`.

## Run

Dependencies are installed once at the repo root (npm workspaces). Build `shared` first if `shared/dist` is missing (`npm run build -w @condo/shared`).

```bash
cd web
npx ng serve          # http://localhost:4200
npx ng build          # production build → dist/web
npx ng test --watch=false   # vitest unit tests
```

The backend must be running at `http://localhost:8080/api` with CORS allowing `http://localhost:4200`.
Dev seed users all use the password `demo1234`: `admin@demo.test`, `manager@demo.test`, `owner@demo.test`, `tenant@demo.test`.

## Configuration

`src/environments/environment.ts` holds `apiBaseUrl`. To point other environments elsewhere, add a file and a
`fileReplacements` entry to the matching configuration in `angular.json`.

Tokens are kept in `localStorage` under `condo.tokens`. The shared client refreshes them automatically. If the refresh fails, the app sends you to `/login`.

## Layout

```
src/app/
  core/       api.service (shared client + token store), auth.service (me() signal), auth.guard,
              errors (ApiError → friendly text, field errors → form controls), toast & confirm services
  shared/     structure wizard (component + pure logic), space-utils (move targets, reorder, tree flattening),
              policy matrix, assets (icons, allowed spaces, bulk shortcuts, catalog requests), invitations (who may invite where, form → request, summaries, join messages),
              clipboard, modal, field-error
  pages/      login, register (both honour ?returnUrl), buildings (list + create + "join with a code"),
              join (/join/:code — public invitation preview + accept)
  building/   shell + BuildingContext (building, my permissions, spaces as signals) and the
              structure / assets (+ asset and bulk-add dialogs) / members (+ invite dialog, invitations list) /
              problem catalog / settings child pages
```

Permission checks in the UI use `canDo()` from `@condo/shared` and only hide controls. The server always re-checks.

## Invitations (phase 2)

* **Members page** — "Invite people" appears for anyone with `MEMBER_INVITE`. Admins and managers can invite into any unit
  or the whole building. Owners (`OWN_UNIT`) can only invite into their own unit, which is preselected and locked. After
  you create one, the dialog shows the code (`ABCD-EFGH`) with Copy link / Copy code. The invitations list underneath shows
  active invitations by default ("Show all" includes used, expired and revoked ones), and you can revoke one from there.
* **Membership length** — choose "No end date", "Until a date" or "For N days after joining". The request sends at most
  one of `membershipExpiresAt` and `membershipDurationDays`, because the server rejects both together.
* **Dates** — "Until a date" and a custom "valid until" date mean the *end* of that local day. A custom validity is
  capped just under the server's 90-day limit.
* **Join** — `/join/:code` works signed out. It accepts any case and an optional dash, and redirects to the canonical code.
  If you're signed out, Create account / Sign in bring you back to the invitation afterwards.
* **Concurrency** — space, member and building updates send the DTO's `version`. On a `409 CONFLICT` the page reloads the
  latest data and says so.

`angular.json` keeps `@condo/shared` out of Vite's dev pre-bundling. Otherwise `ng serve` keeps serving a stale copy of the
shared client after `shared/dist` is rebuilt (the error is "does not provide an export named …").

## Assets and problem catalog (phase 3)

* **Assets** (`/buildings/:id/assets?space=<id>`) — every member can open it. The server hides private assets you can't
  see. You can filter by space (sub-spaces included by default), type and name, and choose to show archived assets.
  * **Add asset** offers only the spaces where you have `ASSET_CREATE`. **Edit** needs `ASSET_EDIT` on the current space
    and on the new one.
  * Picking a type pre-fills the name and shows what residents will be able to report for that type.
  * **Add to several spaces** creates the same asset in many spaces in one `bulkCreate` call. Shortcuts select all
    floors, all units or all common areas.
  * Assets are archived, never deleted (QR labels and history survive) and can be restored.
* **Structure** — nodes show a 💡 *n* chip linking to their assets. Deleting a space that still has active assets
  explains why it can't be deleted and links to those assets.
* **Problem catalog** (`/buildings/:id/catalog`, nav entry for `CATALOG_EDIT`) — built-in problems can be hidden or
  shown. Custom ones can be added, renamed, reordered and turned off or on.

## Issues (phase 4)

* **Issues** (`/buildings/:id/issues?view=shared|mine|unit|triage&space=&asset=`) has tabs for *Building*, *Mine*,
  *My unit* (if you have a unit) and *Triage* (if you hold `ISSUE_TRIAGE`).
  * You can filter by status (open by default, all, or one status), sort by urgency or recent activity, and page through
    results.
  * Triage adds the dashboard: counts per status, issues stuck in *Reported*, hotspots, and how many "Other" texts are
    waiting for review. It also has a list ↔ board toggle. The board offers quick transitions, each with an optional
    comment.
* **Detail** (`issues/:issueId`): header, note, photo gallery and timeline. The available actions come only from the
  server's `me` capabilities: status changes (sent with `version`), comment, Me too / withdraw, sharing, add photo, and
  merge into another issue.
  * Photo links are signed and expire after an hour, so the page refetches the issue when one fails to load.
* **Report a problem** (`issues/new?space=|asset=`) is a four-step flow: Place → Item → Problem → Details.
  * When you pick an item, it first shows issues already open on it, with *Me too*.
  * Each submit sends a fresh `clientRequestId`. A `409 DUPLICATE_ISSUE` shows the existing issue instead of creating
    a new one.
  * Photos are uploaded after the issue is created (max 5, 10 MB, JPEG/PNG/WebP/HEIC).
  * Entry points: the Issues page, asset rows, and the asset dialog.
* **Review "Other"** (`catalog/other`, needs `CATALOG_EDIT`) promotes recurring free-text problems into the catalog and
  re-files matching issues.

## QR codes and notifications (phase 5)

* **QR labels** — on the Assets page, tick items (the header box selects every item currently shown), then choose
  **Print QR labels**. The sheet at `assets/labels` is A4 and comes in two sizes: *Small 3×8* (70×37 mm) and *Large 2×4*
  (105×74 mm).
  * Each label has the QR of `asset.qrUrl`, the item name, its location, the building and "Scan to report a problem".
  * Archived items are left out, with a note.
  * Print at 100% scale with no margins, or "Save as PDF".
  * Each asset row (▦ QR) and the asset dialog show a QR preview with *Download SVG*, *Copy link* and *Print label*.
  * QR codes are drawn with the `qrcode` package, loaded lazily so it only ships with the pages that need it.
* **`/r/:assetId`** — the link printed on labels. It needs sign-in (you come back here after login) and calls
  `qr.resolve`.
  * Shows the item, its open issues (Me too / "You're on it") and **Report a problem with this**, which opens the report
    flow at the problem step.
  * On phones it also shows *Open in the app*.
  * If you're not a member, the page names the building and points to "Join with a code". Expired memberships, archived
    items and unknown codes each get their own message.
* **Notifications** — a bell in the header shows the unread count. It refreshes every 60 s, on window focus and after
  each navigation, and the tab title shows the count, e.g. "(3) Issues · Condo".
  * The dropdown lists the latest 10. Clicking one marks it read and opens its link.
  * `/notifications` lists everything, grouped by day, with paging and an "Unread only" filter.
