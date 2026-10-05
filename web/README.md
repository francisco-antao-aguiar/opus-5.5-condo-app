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
              policy matrix, modal, field-error
  pages/      login, register, buildings (list + create with quick setup)
  building/   shell + BuildingContext (building, my permissions, spaces as signals) and the
              structure / members / settings child pages
```

Permission checks in the UI use `canDo()` from `@condo/shared` and only hide controls. The server always re-checks.
