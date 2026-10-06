import { useEffect, useRef, useSyncExternalStore } from 'react';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import type { PushPlatform } from '@condo/shared';
import { api } from '../api/client';
import { queryClient } from '../api/queryClient';
import { setPendingRoute } from '../lib/pendingRoute';

/**
 * Push notifications: permission (explained first), Expo push token registration, the Android
 * channel, and taps on notifications (including cold start) → the issue screen.
 * Push needs a physical device and an EAS projectId; without them everything here is a no-op
 * and Profile shows a hint.
 */

export const CHANNEL_ID = 'issue-updates';
const TOKEN_KEY = 'condo.pushToken';
const ASKED_KEY = 'condo.pushExplained';
const native = Platform.OS === 'ios' || Platform.OS === 'android';

if (native) {
  // Foreground notifications: show them (the in-app list refreshes too, see useNotificationResponses).
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: false,
      shouldSetBadge: true,
    }),
  });
}

// ---------- status (for the Profile hint) ----------

export type PushStatus =
  | { kind: 'unknown' }
  | { kind: 'unsupported'; reason: 'web' | 'simulator' | 'no-project-id' }
  | { kind: 'undetermined' }
  | { kind: 'denied' }
  | { kind: 'registered'; token: string }
  | { kind: 'error'; message: string };

let status: PushStatus = { kind: 'unknown' };
const listeners = new Set<() => void>();
function setStatus(s: PushStatus) {
  status = s;
  listeners.forEach((l) => l());
}
export function usePushStatus(): PushStatus {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => status,
    () => status,
  );
}

export function getProjectId(): string | undefined {
  const extra = Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined;
  return extra?.eas?.projectId ?? Constants.easConfig?.projectId ?? undefined;
}

/** Why push can't work here at all, or null if it can. */
export function pushUnsupportedReason(): 'web' | 'simulator' | 'no-project-id' | null {
  if (!native) return 'web';
  if (!Device.isDevice) return 'simulator';
  if (!getProjectId()) return 'no-project-id';
  return null;
}

async function ensureChannel() {
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
      name: 'Issue updates',
      description: 'Status changes and replies on problems you reported or are affected by.',
      importance: Notifications.AndroidImportance.HIGH,
    });
  }
}

/** Current permission without prompting: 'granted' | 'denied' | 'undetermined'. */
export async function pushPermission(): Promise<'granted' | 'denied' | 'undetermined'> {
  if (pushUnsupportedReason()) return 'denied';
  const p = await Notifications.getPermissionsAsync();
  if (p.granted) return 'granted';
  return p.canAskAgain ? 'undetermined' : 'denied';
}

export async function wasExplained(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(ASKED_KEY)) === '1';
  } catch {
    return true;
  }
}

export async function markExplained() {
  try {
    await AsyncStorage.setItem(ASKED_KEY, '1');
  } catch {
    // ignore
  }
}

/**
 * Registers this device's Expo push token for the signed-in user, if allowed. `ask` shows the
 * system prompt (only call it after the in-app explanation). Re-registers when the token changed
 * or belongs to another user (shared phones). Never throws.
 */
export async function registerPush(userId: string, ask = false): Promise<PushStatus> {
  const unsupported = pushUnsupportedReason();
  if (unsupported) {
    if (unsupported !== 'web') console.info(`[push] skipped: ${unsupported}`);
    setStatus({ kind: 'unsupported', reason: unsupported });
    return status;
  }
  try {
    await ensureChannel();
    let perm = await Notifications.getPermissionsAsync();
    if (!perm.granted && perm.canAskAgain && ask) perm = await Notifications.requestPermissionsAsync();
    if (!perm.granted) {
      setStatus(perm.canAskAgain ? { kind: 'undetermined' } : { kind: 'denied' });
      return status;
    }
    const token = (await Notifications.getExpoPushTokenAsync({ projectId: getProjectId() })).data;
    const saved = await readSaved();
    if (saved?.token !== token || saved.userId !== userId) {
      await api.notifications.registerPushToken({
        token,
        platform: Platform.OS as PushPlatform,
        deviceName: Device.deviceName ?? null,
      });
      await AsyncStorage.setItem(TOKEN_KEY, JSON.stringify({ token, userId }));
    }
    setStatus({ kind: 'registered', token });
  } catch (e) {
    // e.g. Expo Go on Android (no remote push since SDK 53), no network, Firebase not configured.
    console.warn('[push] registration failed', e);
    setStatus({ kind: 'error', message: e instanceof Error ? e.message : String(e) });
  }
  return status;
}

async function readSaved(): Promise<{ token: string; userId: string } | null> {
  try {
    const raw = await AsyncStorage.getItem(TOKEN_KEY);
    return raw ? (JSON.parse(raw) as { token: string; userId: string }) : null;
  } catch {
    return null;
  }
}

/** On logout, BEFORE the auth tokens are cleared: this device stops receiving the user's pushes. */
export async function unregisterPush(): Promise<void> {
  const saved = await readSaved();
  if (!saved) return;
  try {
    // Don't let a slow network hold up sign-out.
    await Promise.race([
      api.notifications.unregisterPushToken(saved.token),
      new Promise((resolve) => setTimeout(resolve, 4000)),
    ]);
  } catch (e) {
    console.warn('[push] unregister failed', e);
  }
  try {
    await AsyncStorage.removeItem(TOKEN_KEY);
  } catch {
    // ignore
  }
  setStatus({ kind: 'unknown' });
}

/** Re-register when Expo rotates the device token while the app runs. */
export function onPushTokenChange(userId: string): () => void {
  if (pushUnsupportedReason()) return () => undefined;
  const sub = Notifications.addPushTokenListener(() => {
    void registerPush(userId);
  });
  return () => sub.remove();
}

// ---------- taps & foreground ----------

const ID = '[0-9a-fA-F-]{36}';
/** Routes a notification may open (data comes from the network, so only these are followed). */
const SAFE_LINKS = [
  new RegExp(`^/buildings/${ID}$`),
  new RegExp(`^/buildings/${ID}/issues/${ID}$`),
  new RegExp(`^/buildings/${ID}/bookings(/${ID})?$`),
  new RegExp(`^/buildings/${ID}/assets/${ID}$`),
];

export function isSafeLink(link: unknown): link is string {
  return typeof link === 'string' && SAFE_LINKS.some((r) => r.test(link));
}

export function openLink(link: string, signedIn: boolean) {
  if (!isSafeLink(link)) return;
  if (signedIn) router.push(link as never);
  // Signed out: the login screen is showing; continue there after sign-in.
  else void setPendingRoute(link);
}

function refreshInbox() {
  void queryClient.invalidateQueries({ queryKey: ['notifications'] });
}

/**
 * Taps on push notifications → `data.link`, including the one that cold-started the app.
 * Mounted in the root layout; waits until the auth state is known so the router exists.
 */
export function useNotificationResponses(authStatus: 'loading' | 'signedOut' | 'signedIn') {
  const handled = useRef(new Set<string>());
  const signedIn = authStatus === 'signedIn';
  const signedInRef = useRef(signedIn);
  signedInRef.current = signedIn;

  useEffect(() => {
    if (!native || authStatus === 'loading') return;
    const handle = (response: Notifications.NotificationResponse | null) => {
      if (!response) return;
      const id = response.notification.request.identifier;
      if (handled.current.has(id)) return;
      handled.current.add(id);
      refreshInbox();
      // Let the navigator mount / settle first.
      setTimeout(() => openLink(response.notification.request.content.data?.link as string, signedInRef.current), 0);
      void Notifications.clearLastNotificationResponseAsync().catch(() => undefined);
    };
    // Cold start from a notification.
    handle(Notifications.getLastNotificationResponse());
    const tap = Notifications.addNotificationResponseReceivedListener(handle);
    const received = Notifications.addNotificationReceivedListener(() => {
      refreshInbox();
      // The issue the push is about probably changed too.
      void queryClient.invalidateQueries({ predicate: (q) => q.queryKey.includes('issues') });
    });
    return () => {
      tap.remove();
      received.remove();
    };
  }, [authStatus]);
}

/** App icon badge = unread in-app notifications (native only, best effort). */
export function setAppBadge(count: number) {
  if (!native) return;
  void Notifications.setBadgeCountAsync(count).catch(() => undefined);
}
