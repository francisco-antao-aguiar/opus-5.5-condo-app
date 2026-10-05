import { createApiClient } from '@condo/shared';
import { API_URL } from './config';
import { tokenStore } from './tokenStore';

type SessionExpiredHandler = () => void;
let sessionExpiredHandler: SessionExpiredHandler | null = null;

/** AuthProvider registers the handler (logout + redirect to login). */
export function setSessionExpiredHandler(handler: SessionExpiredHandler | null) {
  sessionExpiredHandler = handler;
}

export const api = createApiClient({
  baseUrl: API_URL,
  tokenStore,
  onSessionExpired: () => sessionExpiredHandler?.(),
});

export { tokenStore };
