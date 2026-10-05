// Native (iOS/Android): tokens live in the OS keychain/keystore via expo-secure-store.
// Metro picks tokenStorage.web.ts on web, where secure-store is unavailable.
import * as SecureStore from 'expo-secure-store';

const KEY = 'condo.auth.tokens';

export async function readRaw(): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(KEY);
  } catch {
    return null;
  }
}

export async function writeRaw(value: string | null): Promise<void> {
  if (value === null) await SecureStore.deleteItemAsync(KEY);
  else await SecureStore.setItemAsync(KEY, value);
}
