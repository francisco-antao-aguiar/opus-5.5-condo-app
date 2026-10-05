# Condo — building management

Residents report problems (broken light, stuck elevator…) in about ten seconds; admins triage and resolve them.

| Folder | What | Stack |
|---|---|---|
| [`backend/`](backend) | REST API | Spring Boot 3.5, Java 21, JPA, Flyway, H2 (file), JWT |
| [`web/`](web) | Admin + resident web app | Angular 21 (standalone, zoneless, signals) |
| [`mobile/`](mobile) | Resident app | Expo SDK 57, Expo Router, TanStack Query |
| [`shared/`](shared) | API types + typed fetch client used by both frontends | TypeScript |
| [`docs/DESIGN.md`](docs/DESIGN.md) | Data model, permission policy table, endpoint list, assumptions | |

## Prerequisites

- Java 21 and Maven 3.9+
- Node 22.12+ or 24+ (Angular 22 requires Node ≥ 24.15, which is why the web app is on Angular 21 for now)

## Install the JS workspace (once)

```bash
npm install
```

This installs `shared`, `web` and `mobile` as npm workspaces and builds `shared` (postinstall). After changing anything in `shared/src`, rebuild it:

```bash
npm run build:shared
```

## Backend

```bash
cd backend
mvn spring-boot:run
```

- API: http://localhost:8080/api · Swagger UI: http://localhost:8080/swagger-ui.html
- The `dev` profile is the default. It enables the H2 console at http://localhost:8080/h2-console (JDBC URL `jdbc:h2:file:./data/condo`, user `sa`, no password) and seeds demo data on first start.
- Uploaded photos go to `backend/uploads/` (`APP_STORAGE_DIR`) behind the `StorageService` interface.
- Data lives in `backend/data/` (survives restarts). Delete that folder to reseed (needed to get new seed data after pulling).
- Invitation links point at `APP_WEB_BASE_URL` (default `http://localhost:4200`). A scheduled job (every 15 min, `app.memberships.expiry-cron`) marks lapsed memberships EXPIRED; access is already cut at the exact end time regardless.
- Other port: `mvn spring-boot:run -Dspring-boot.run.arguments=--server.port=18080`
- Tests (unit + integration on in-memory H2): `mvn test`
- Outside dev, set `APP_JWT_SECRET` to a base64 key of at least 32 bytes.

### Demo accounts (dev seed, password `demo1234`)

| Email | Role |
|---|---|
| admin@demo.test | ADMIN of *Edifício Aurora* (Managed) |
| manager@demo.test | MANAGER of *Edifício Aurora* |
| owner@demo.test | OWNER of unit 2B in *Aurora*; OWNER in *Casa do Pátio* (Open) |
| tenant@demo.test | TENANT of 2B, membership expires in 180 days |
| owner2@demo.test | OWNER of the 3C/4C duplex in *Aurora*; ADMIN of *Casa do Pátio* |
| former@demo.test | ex-TENANT of 1A whose membership expired 10 days ago (gets "access expired") |

Invite codes in the seed (open `http://localhost:4200/join/<code>` or `buildingapp://join/<code>`):

| Code | What it does |
|---|---|
| `TENANT22` | Olívia (owner of 2B) invites up to 3 flatmates as TENANT of 2B, access for 1 year |
| `SHARE4AB` | Admin invites one new OWNER of 4A |
| `GUEST777` | Olívia invites a guest into 2B whose access lasts 7 days from when they accept |
| `EXPRD222` | Already expired, to see the error state |

*Edifício Aurora* is deliberately irregular: a basement with garage, storage and boiler room; a ground floor with a lobby, a shop and one flat; floors with 4, 3, 3 and 2 units; a duplex spanning two floors; and roof, stairwell and elevator shaft hanging off the root.

It also has 19 assets (lobby light, door, intercom and extinguisher, the elevator, garage gate and lights, the central boiler, a stairwell light on every floor…), including private ones in 2B and the duplex that only those units and the admins see. Its problem catalog adds a custom gate problem ("Remote doesn't work") and hides the built-in "Damaged fixture" for lights.

Seven sample issues show the whole lifecycle:

| # | Issue | What it demonstrates |
|---|---|---|
| 1 | Lobby light · Flickering | 3 neighbours affected ("me too"), top of the urgency sort |
| 2 | Elevator · Door won't close | Acknowledged → In progress, with comments in the timeline |
| 3 | Garage gate · Remote doesn't work | Untouched for 4 days → flagged as **stuck** on the dashboard |
| 4 | Intercom · No sound | Resolved |
| 5 | 2B kitchen sink · Leak | **Private**: only 2B's members see it (not shared with management) |
| 6, 7 | Roof door · "Hinge squeaks" | The same free "Other" text twice → ready to promote in the "Other" review |

## Web

```bash
npm start -w @condo/web
```

Open http://localhost:4200. The API URL is in `web/src/environments/`.

## Mobile

```bash
cd mobile
npx expo start
```

The API URL comes from `EXPO_PUBLIC_API_URL` and defaults to `http://10.0.2.2:8080/api` on the Android emulator and `http://localhost:8080/api` elsewhere. On a physical device, use your machine's LAN IP. See [`mobile/README.md`](mobile/README.md).

## CORS

The backend allows `http://localhost:4200`, `:8081` and `:19006` by default. To change this, set `app.cors.allowed-origins` (or the `APP_CORS_ALLOWED_ORIGINS` environment variable).

## Roadmap

1. **Building tree, spaces, roles, governance, auth** ✅
2. **Invitations and membership expiry** ✅
3. **Asset types, assets, problem catalogs** ✅
4. **Issue reporting, duplicate detection / "me too", lifecycle and timeline** ✅
5. QR codes, deep links, push notifications
6. Design only: maintenance, announcements, booking, costs (see DESIGN.md)
