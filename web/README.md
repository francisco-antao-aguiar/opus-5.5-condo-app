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
              policy matrix, invitations (who may invite where, form → request, summaries, join messages),
              clipboard, modal, field-error
  pages/      login, register (both honour ?returnUrl), buildings (list + create + "join with a code"),
              join (/join/:code — public invitation preview + accept)
  building/   shell + BuildingContext (building, my permissions, spaces as signals) and the
              structure / members (+ invite dialog, invitations list) / settings child pages
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
