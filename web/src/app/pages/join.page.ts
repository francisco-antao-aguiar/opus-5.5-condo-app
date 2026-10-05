import { Component, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { ApiError, InvitationPreview, formatInviteCode, normalizeInviteCode } from '@condo/shared';
import { AuthService } from '../core/auth.service';
import { ApiService } from '../core/api.service';
import { describeError, errorCode, ErrorText } from '../core/errors';
import { ToastService } from '../core/toast.service';
import { formatDate, joinProblem, JoinProblem, membershipAccessText, roleLabel } from '../shared/invitations';

/**
 * /join/:code — public. Shows what the invitation leads to before sign-in, then lets a signed-in
 * user accept it. Signed-out users go to register/login with returnUrl back here.
 */
@Component({
  selector: 'app-join-page',
  imports: [RouterLink],
  template: `
    <section class="join card">
      @if (!auth.user()) {
        <a routerLink="/login" class="brand join-brand"><span class="brand-mark">▦</span> Condo</a>
      }

      @if (loading()) {
        <p class="muted">Looking up invitation {{ display() }}…</p>
      } @else if (problem(); as p) {
        <div class="full-page-icon">{{ p.code === 'ALREADY_MEMBER' ? '🏠' : p.code === 'TOO_MANY_ATTEMPTS' ? '⏳' : '✉️' }}</div>
        <h1>{{ p.title }}</h1>
        <p class="muted">{{ p.detail }}</p>
        <p class="join-code-line">Code <code class="code">{{ display() }}</code></p>
        <div class="actions center-actions">
          @if (p.code === 'ALREADY_MEMBER' && preview(); as pv) {
            <a class="btn btn-primary" [routerLink]="['/buildings', pv.buildingId]">Open {{ pv.buildingName }}</a>
          } @else if (p.code === 'TOO_MANY_ATTEMPTS') {
            <button type="button" class="btn" (click)="load()">Try again</button>
          }
          <a class="btn" [routerLink]="auth.user() ? '/buildings' : '/login'">{{ auth.user() ? 'My buildings' : 'Sign in' }}</a>
        </div>
      } @else if (loadError(); as e) {
        <h1>{{ e.title }}</h1>
        @if (e.detail) {
          <p class="muted">{{ e.detail }}</p>
        }
        <div class="actions center-actions"><button type="button" class="btn btn-primary" (click)="load()">Retry</button></div>
      } @else if (preview(); as pv) {
        <div class="full-page-icon">🏢</div>
        <h1>You're invited</h1>
        <p class="join-lead">
          <strong>{{ pv.invitedByName }}</strong> invited you to join <strong>{{ pv.buildingName }}</strong>
          @if (pv.buildingAddress) {
            <span class="muted"> ({{ pv.buildingAddress }})</span>
          }
          as <strong>{{ role() }}</strong>@if (pv.unitName) { of <strong>{{ pv.unitName }}</strong>}.
        </p>
        @if (pv.membershipExpiresAt || pv.membershipDurationDays) {
          <p class="badge badge-warn join-until">{{ access() }}</p>
        }
        <p class="join-code-line">Code <code class="code">{{ display() }}</code> · valid until {{ date(pv.expiresAt) }}</p>

        @if (acceptError(); as e) {
          <div class="alert alert-error" role="alert"><strong>{{ e.title }}</strong>@if (e.detail) {<p>{{ e.detail }}</p>}</div>
        }

        @if (auth.user(); as user) {
          <div class="actions center-actions">
            <button type="button" class="btn btn-primary" [disabled]="accepting()" (click)="accept()">
              {{ accepting() ? 'Joining…' : 'Accept invitation' }}
            </button>
          </div>
          <p class="muted small">Signed in as {{ user.displayName }} ({{ user.email }}).</p>
        } @else if (checkingSession()) {
          <p class="muted">Checking your session…</p>
        } @else {
          <p class="muted">Create an account or sign in to accept.</p>
          <div class="actions center-actions">
            <a class="btn btn-primary" routerLink="/register" [queryParams]="{ returnUrl: here() }">Create account</a>
            <a class="btn" routerLink="/login" [queryParams]="{ returnUrl: here() }">Sign in</a>
          </div>
        }
      }
    </section>
  `,
})
export class JoinPage {
  protected readonly auth = inject(AuthService);
  private readonly api = inject(ApiService);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);

  /** Route param :code (component input binding). */
  readonly code = input.required<string>();

  protected readonly normalized = computed(() => normalizeInviteCode(this.code()));
  protected readonly display = computed(() => formatInviteCode(this.normalized()));
  protected readonly here = computed(() => `/join/${this.normalized()}`);

  protected readonly loading = signal(true);
  protected readonly preview = signal<InvitationPreview | null>(null);
  protected readonly problem = signal<JoinProblem | null>(null);
  protected readonly loadError = signal<ErrorText | null>(null);
  protected readonly accepting = signal(false);
  protected readonly acceptError = signal<ErrorText | null>(null);
  protected readonly checkingSession = signal(false);

  protected readonly role = computed(() => roleLabel(this.preview()?.role ?? ''));
  protected readonly date = formatDate;
  /** "Access until 31 Mar 2027" / "Access for 7 days after joining". */
  protected readonly access = computed(() => {
    const pv = this.preview();
    if (!pv) return '';
    const t = membershipAccessText(pv);
    return t[0]!.toUpperCase() + t.slice(1);
  });

  constructor() {
    // Signed in but /me not loaded yet (no authGuard on this route).
    if (this.auth.hasSession() && !this.auth.me()) {
      this.checkingSession.set(true);
      this.auth
        .loadMe()
        .catch(() => undefined)
        .finally(() => this.checkingSession.set(false));
    }

    effect(() => {
      const raw = this.code();
      const code = this.normalized();
      untracked(() => {
        // Canonical URL: "/join/abcd-efgh" → "/join/ABCDEFGH".
        if (code && raw !== code) {
          void this.router.navigate(['/join', code], { replaceUrl: true });
          return;
        }
        void this.load();
      });
    });

    // Already an (active) member: say so instead of offering a doomed "Accept".
    effect(() => {
      const pv = this.preview();
      if (!pv || pv.status !== 'ACTIVE' || this.problem()) return;
      const now = Date.now();
      const mine = this.auth
        .memberships()
        .find((m) => m.buildingId === pv.buildingId && (!m.expiresAt || new Date(m.expiresAt).getTime() > now));
      if (mine) untracked(() => this.problem.set(joinProblem('ALREADY_MEMBER')));
    });
  }

  protected async load(): Promise<void> {
    const code = this.normalized();
    this.loading.set(true);
    this.problem.set(null);
    this.loadError.set(null);
    this.acceptError.set(null);
    this.preview.set(null);
    if (!code) {
      this.problem.set(joinProblem('INVITATION_NOT_FOUND'));
      this.loading.set(false);
      return;
    }
    try {
      const pv = await this.api.client.invitations.preview(code);
      this.preview.set(pv);
      if (pv.status !== 'ACTIVE') this.problem.set(joinProblem(pv.status) ?? joinProblem('INVITATION_INVALID'));
    } catch (e) {
      const p = joinProblem(errorCode(e) ?? '');
      if (p) this.problem.set(p);
      else if (e instanceof ApiError && e.status === 404) this.problem.set(joinProblem('INVITATION_NOT_FOUND'));
      else this.loadError.set(describeError(e));
    } finally {
      this.loading.set(false);
    }
  }

  protected async accept(): Promise<void> {
    if (this.accepting()) return;
    this.accepting.set(true);
    this.acceptError.set(null);
    try {
      const res = await this.api.client.invitations.accept(this.normalized());
      const name = this.preview()?.buildingName ?? res.membership.buildingName;
      this.toast.success(`Welcome to ${name}!`, `You joined as ${roleLabel(res.membership.role)}${res.membership.unitName ? ` of ${res.membership.unitName}` : ''}.`);
      await this.auth.loadMe().catch(() => undefined);
      await this.router.navigate(['/buildings', res.buildingId]);
    } catch (e) {
      // 401: the session-expired flow already sends the user to /login?returnUrl=/join/…
      if (e instanceof ApiError && e.status === 401) return;
      const p = joinProblem(errorCode(e) ?? '');
      if (p) this.problem.set(p);
      else this.acceptError.set(describeError(e));
    } finally {
      this.accepting.set(false);
    }
  }
}
