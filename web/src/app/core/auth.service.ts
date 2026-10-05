import { Injectable, computed, inject, signal } from '@angular/core';
import { LoginRequest, MeResponse, RegisterRequest } from '@condo/shared';
import { ApiService } from './api.service';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly api = inject(ApiService);
  private pending: Promise<MeResponse> | null = null;

  /** Current user and memberships; null when signed out or not loaded yet. */
  readonly me = signal<MeResponse | null>(null);
  readonly user = computed(() => this.me()?.user ?? null);
  readonly memberships = computed(() => this.me()?.memberships ?? []);

  constructor() {
    this.api.onSessionExpired(() => this.me.set(null));
  }

  hasSession(): boolean {
    return this.api.hasSession();
  }

  /** Fetches /me (single-flight) and updates `me`. Rejects with ApiError/NetworkError. */
  loadMe(): Promise<MeResponse> {
    if (!this.pending) {
      this.pending = this.api.client
        .me()
        .then((me) => {
          this.me.set(me);
          return me;
        })
        .finally(() => (this.pending = null));
    }
    return this.pending;
  }

  async login(req: LoginRequest): Promise<MeResponse> {
    await this.api.client.auth.login(req);
    return this.loadMe();
  }

  async register(req: RegisterRequest): Promise<MeResponse> {
    await this.api.client.auth.register(req);
    return this.loadMe();
  }

  async logout(): Promise<void> {
    this.me.set(null);
    await this.api.client.auth.logout();
  }
}
