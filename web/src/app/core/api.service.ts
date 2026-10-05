import { Injectable, inject } from '@angular/core';
import { Router } from '@angular/router';
import { ApiClient, AuthTokens, TokenStore, createApiClient } from '@condo/shared';
import { environment } from '../../environments/environment';

const STORAGE_KEY = 'condo.tokens';

/** TokenStore backed by localStorage; tolerates storage being unavailable (private mode, etc.). */
export const localStorageTokenStore: TokenStore = {
  get(): AuthTokens | null {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? (JSON.parse(raw) as AuthTokens) : null;
    } catch {
      return null;
    }
  },
  set(tokens: AuthTokens | null): void {
    try {
      if (tokens) localStorage.setItem(STORAGE_KEY, JSON.stringify(tokens));
      else localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* storage unavailable: the session only lives for this page load */
    }
  },
};

/** Thin injectable around the shared typed client. Use `api.client.<area>.<call>()`. */
@Injectable({ providedIn: 'root' })
export class ApiService {
  private readonly router = inject(Router);
  private readonly expiredHandlers: (() => void)[] = [];

  readonly client: ApiClient = createApiClient({
    baseUrl: environment.apiBaseUrl,
    tokenStore: localStorageTokenStore,
    onSessionExpired: () => this.handleSessionExpired(),
  });

  hasSession(): boolean {
    return localStorageTokenStore.get() !== null;
  }

  /** Register a callback run when the refresh token is rejected (before redirecting to /login). */
  onSessionExpired(handler: () => void): void {
    this.expiredHandlers.push(handler);
  }

  private handleSessionExpired(): void {
    this.expiredHandlers.forEach((h) => h());
    const returnUrl = this.router.url;
    if (!returnUrl.startsWith('/login')) {
      void this.router.navigate(['/login'], { queryParams: { returnUrl, expired: 1 } });
    }
  }
}
