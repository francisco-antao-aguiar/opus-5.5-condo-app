import AsyncStorage from '@react-native-async-storage/async-storage';
import { normalizeInviteCode } from '@condo/shared';

/**
 * Where a signed-out user was trying to go (an invite, a scanned QR deep link, a notification),
 * remembered across sign-in / registration (and an app restart in between) so they land back
 * there. Only app-relative routes are stored. Not a secret, so AsyncStorage (localStorage on web).
 */
const KEY = 'condo.pendingRoute';
/** Forget it after a day so a stale target doesn't hijack a later sign-in. */
const MAX_AGE_MS = 24 * 60 * 60 * 1000;

let memory: string | null | undefined;

/** Routes we accept as pending targets (keeps arbitrary strings out of router.navigate). */
export function isAllowedPendingRoute(path: string): boolean {
  return /^\/(join\/[A-Z0-9]+|report\/asset\/[0-9a-f-]{36}|buildings\/[0-9a-zA-Z/_-]+)$/.test(path);
}

export async function setPendingRoute(path: string): Promise<void> {
  if (!isAllowedPendingRoute(path)) return;
  memory = path;
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify({ path, at: Date.now() }));
  } catch {
    // In-memory value still covers the common case (same app session).
  }
}

export async function getPendingRoute(): Promise<string | null> {
  if (memory !== undefined) return memory;
  try {
    const raw = await AsyncStorage.getItem(KEY);
    const parsed = raw ? (JSON.parse(raw) as { path?: string; at?: number }) : null;
    memory =
      parsed?.path && parsed.at && Date.now() - parsed.at < MAX_AGE_MS && isAllowedPendingRoute(parsed.path)
        ? parsed.path
        : null;
  } catch {
    memory = null;
  }
  return memory;
}

export async function clearPendingRoute(): Promise<void> {
  memory = null;
  try {
    await AsyncStorage.removeItem(KEY);
  } catch {
    // ignore
  }
}

// ---------- invites (phase 2 API, now a pending route) ----------

export const joinPath = (code: string) => `/join/${normalizeInviteCode(code)}`;

export function setPendingInvite(code: string): Promise<void> {
  return setPendingRoute(joinPath(code));
}

export const clearPendingInvite = clearPendingRoute;

// ---------- screens currently mounted ----------

/**
 * Pending-target screens currently mounted (by route). After sign-in the guard flip pops the auth
 * screens and reveals the screen the user came from, so the redirect must not push a second one.
 */
const mounted = new Map<string, number>();

export function registerScreen(path: string): () => void {
  mounted.set(path, (mounted.get(path) ?? 0) + 1);
  return () => {
    const n = (mounted.get(path) ?? 1) - 1;
    if (n <= 0) mounted.delete(path);
    else mounted.set(path, n);
  };
}

export function isScreenMounted(path: string): boolean {
  return mounted.has(path);
}
