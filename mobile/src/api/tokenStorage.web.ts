// Web fallback: expo-secure-store has no web implementation, so use localStorage.
const KEY = 'condo.auth.tokens';

function storage(): Storage | null {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null;
  } catch {
    return null;
  }
}

export async function readRaw(): Promise<string | null> {
  return storage()?.getItem(KEY) ?? null;
}

export async function writeRaw(value: string | null): Promise<void> {
  const s = storage();
  if (!s) return;
  if (value === null) s.removeItem(KEY);
  else s.setItem(KEY, value);
}
