import * as Crypto from 'expo-crypto';

/** UUIDv4 for clientRequestId. expo-crypto works on Hermes, Android, iOS and web alike. */
export function newId(): string {
  return Crypto.randomUUID();
}
