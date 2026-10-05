import AsyncStorage from '@react-native-async-storage/async-storage';
import { normalizeInviteCode } from '@condo/shared';

/**
 * Invite code a signed-out user opened, remembered across sign-in / registration (and an app
 * restart in between) so they land back on the join screen. Not a secret: the code is in the
 * link they were sent, so AsyncStorage (localStorage on web) is enough.
 */
const KEY = 'condo.pendingInvite';
/** Forget a pending invite after a day so a stale code doesn't hijack a later sign-in. */
const MAX_AGE_MS = 24 * 60 * 60 * 1000;

let memory: string | null | undefined;

export async function setPendingInvite(code: string): Promise<void> {
  const c = normalizeInviteCode(code);
  memory = c;
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify({ code: c, at: Date.now() }));
  } catch {
    // In-memory value still covers the common case (same app session).
  }
}

export async function getPendingInvite(): Promise<string | null> {
  if (memory !== undefined) return memory;
  try {
    const raw = await AsyncStorage.getItem(KEY);
    const parsed = raw ? (JSON.parse(raw) as { code?: string; at?: number }) : null;
    memory = parsed?.code && parsed.at && Date.now() - parsed.at < MAX_AGE_MS ? parsed.code : null;
  } catch {
    memory = null;
  }
  return memory;
}

export async function clearPendingInvite(): Promise<void> {
  memory = null;
  try {
    await AsyncStorage.removeItem(KEY);
  } catch {
    // ignore
  }
}

/**
 * Join screens currently mounted (by code). After sign-in the guard flip pops the auth screens
 * and reveals the join screen the user came from, so the redirect must not push a second one.
 */
const mountedJoinScreens = new Map<string, number>();

export function registerJoinScreen(code: string): () => void {
  mountedJoinScreens.set(code, (mountedJoinScreens.get(code) ?? 0) + 1);
  return () => {
    const n = (mountedJoinScreens.get(code) ?? 1) - 1;
    if (n <= 0) mountedJoinScreens.delete(code);
    else mountedJoinScreens.set(code, n);
  };
}

export function isJoinScreenMounted(code: string): boolean {
  return mountedJoinScreens.has(code);
}
