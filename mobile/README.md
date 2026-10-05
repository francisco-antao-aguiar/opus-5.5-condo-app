# Condo mobile (Expo)

Expo SDK 57 + Expo Router app (TypeScript). Uses `@condo/shared` for all API types and the typed client.

## Run

Install from the repo root once (npm workspaces; this also builds `shared/dist`):

```bash
npm install
```

Then, from `mobile/`:

```bash
npx expo start            # press a (Android), i (iOS) or w (web)
npx tsc --noEmit          # typecheck
npx expo-doctor           # dependency / config checks
```

The backend must be running (`http://localhost:8080/api`). Dev users (password `demo1234`):
`admin@demo.test`, `manager@demo.test`, `owner@demo.test`, `tenant@demo.test`.

## API URL

The base URL comes from `EXPO_PUBLIC_API_URL`. Defaults:

| Target | Default |
|---|---|
| Android emulator | `http://10.0.2.2:8080/api` (the emulator's alias for your machine) |
| iOS simulator, web | `http://localhost:8080/api` |

**Physical devices** (Expo Go / dev build on a phone) cannot reach `localhost`; use your computer's LAN IP:

```bash
EXPO_PUBLIC_API_URL=http://192.168.1.20:8080/api npx expo start --clear
```

(or put it in `mobile/.env.local`). `EXPO_PUBLIC_*` values are inlined at bundle time, so restart with `--clear` after changing it.

## Layout

```
src/app/                       routes (Expo Router)
  _layout.tsx                  providers + auth gating (Stack.Protected)
  (auth)/login, register
  (app)/(tabs)/index           my buildings
  (app)/(tabs)/profile         user info, sign out
  (app)/buildings/new          create building + quick setup
  (app)/buildings/[buildingId]/index            building home (root of space browser)
  (app)/buildings/[buildingId]/spaces/[spaceId] one level of the drill-down browser
  (app)/buildings/[buildingId]/members          read-only members
src/api/                       shared client, token store (secure-store / localStorage on web), query client, query keys
src/auth/                      AuthProvider (tokens, me, login/register/logout, session expiry)
src/components/                UI kit, state views, space browser + edit sheets
src/hooks/                     TanStack Query hooks and mutations
src/theme/                     colors (light/dark), spacing, tap-target sizes
```

Deep links use the `buildingapp://` scheme, e.g. `buildingapp://buildings/{id}/spaces/{spaceId}`.
