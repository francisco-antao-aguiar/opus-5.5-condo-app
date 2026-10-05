import type { AuthTokens, TokenStore } from '@condo/shared';
import { readRaw, writeRaw } from './tokenStorage';

type Listener = (tokens: AuthTokens | null) => void;

/**
 * TokenStore for the shared client: persisted in secure storage, cached in memory so
 * every request doesn't hit the keychain, and observable so auth state follows
 * token changes made inside the client (e.g. a failed refresh clears them).
 */
function createTokenStore() {
  let cache: AuthTokens | null = null;
  let loaded: Promise<AuthTokens | null> | null = null;
  const listeners = new Set<Listener>();

  function load(): Promise<AuthTokens | null> {
    if (!loaded) {
      loaded = readRaw().then((raw) => {
        try {
          cache = raw ? (JSON.parse(raw) as AuthTokens) : null;
        } catch {
          cache = null;
        }
        return cache;
      });
    }
    return loaded;
  }

  const store: TokenStore & {
    load: () => Promise<AuthTokens | null>;
    subscribe: (l: Listener) => () => void;
  } = {
    async get() {
      await load();
      return cache;
    },
    async set(tokens) {
      await load();
      cache = tokens;
      listeners.forEach((l) => l(tokens));
      try {
        await writeRaw(tokens ? JSON.stringify(tokens) : null);
      } catch (e) {
        // Keep the in-memory session even if persistence fails.
        console.warn('Failed to persist tokens', e);
      }
    },
    load,
    subscribe(l) {
      listeners.add(l);
      return () => listeners.delete(l);
    },
  };
  return store;
}

export const tokenStore = createTokenStore();
