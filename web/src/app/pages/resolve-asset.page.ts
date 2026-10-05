import { Component, effect, inject, input, signal, untracked } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ResolvedAsset, UUID } from '@condo/shared';
import { ApiService } from '../core/api.service';
import { ToastService } from '../core/toast.service';
import { assetCodeIcon } from '../shared/assets';
import { STATUS_BADGE, statusLabel } from '../shared/issues';
import { ResolveErrorView, isMobileUserAgent, resolveErrorView } from '../shared/qr';

/** /r/:assetId — what a printed QR label opens. Signed-in only (authGuard brings people back here). */
@Component({
  selector: 'app-resolve-asset-page',
  imports: [RouterLink],
  template: `
    <section class="join card resolve">
      @if (loading()) {
        <p class="muted">Looking up this item…</p>
      } @else if (error(); as e) {
        <div class="full-page-icon">{{ e.kind === 'archived' ? '📦' : e.kind === 'not-member' || e.kind === 'expired' ? '🔒' : '❔' }}</div>
        <h1>{{ e.title }}</h1>
        <p class="muted">{{ e.detail }}</p>
        <div class="actions center-actions">
          @if (e.kind === 'not-member') {
            <a class="btn btn-primary" routerLink="/buildings">Join with a code</a>
          } @else if (e.kind === 'other') {
            <button type="button" class="btn btn-primary" (click)="load()">Retry</button>
          }
          <a class="btn" routerLink="/buildings">My buildings</a>
        </div>
      } @else if (res(); as r) {
        <p class="muted small">{{ r.buildingName }}</p>
        <div class="resolve-item">
          <span class="resolve-icon" aria-hidden="true">{{ icon(r.asset.type) }}</span>
          <div>
            <h1>{{ r.asset.name }}</h1>
            <p class="muted">{{ r.asset.typeName }} · {{ r.asset.spacePath || r.buildingName }}</p>
          </div>
        </div>

        @if (r.openIssues.length) {
          <div class="already">
            <h2>Already reported</h2>
            @for (o of r.openIssues; track o.id) {
              <div class="already-row">
                <span class="grow">
                  <a [routerLink]="['/buildings', r.buildingId, 'issues', o.id]"><strong>#{{ o.number }}</strong> {{ o.title }}</a>
                  · <span [class]="'badge ' + badge[o.status]">{{ statusLabel(o.status) }}</span>
                  · {{ o.affectedCount }} affected
                </span>
                @if (o.affectedByMe || joined().has(o.id)) {
                  <span class="badge badge-info">You're on it</span>
                } @else if (r.canReport) {
                  <button type="button" class="btn btn-sm btn-primary" [disabled]="busy()" (click)="meToo(r.buildingId, o.id)">🙋 Me too</button>
                }
              </div>
            }
          </div>
        }

        @if (r.canReport) {
          <a class="btn btn-primary btn-big" [routerLink]="['/buildings', r.buildingId, 'issues', 'new']" [queryParams]="{ asset: r.asset.id }">
            🚩 Report a problem with this
          </a>
        } @else {
          <p class="alert alert-info">You can see this item but can't report problems on it. Ask a building admin if that's wrong.</p>
        }

        <div class="actions center-actions">
          @if (mobile) {
            <a class="btn" [href]="r.asset.deepLink">Open in the app</a>
          }
          <a class="btn" [routerLink]="['/buildings', r.buildingId, 'issues']" [queryParams]="{ asset: r.asset.id, view: 'shared' }">Issues on this item</a>
        </div>
      }
    </section>
  `,
})
export class ResolveAssetPage {
  private readonly api = inject(ApiService);
  private readonly toast = inject(ToastService);

  /** Route param :assetId (component input binding). */
  readonly assetId = input.required<string>();

  protected readonly loading = signal(true);
  protected readonly res = signal<ResolvedAsset | null>(null);
  protected readonly error = signal<ResolveErrorView | null>(null);
  protected readonly busy = signal(false);
  protected readonly joined = signal<ReadonlySet<UUID>>(new Set());
  protected readonly icon = assetCodeIcon;
  protected readonly badge = STATUS_BADGE;
  protected readonly statusLabel = statusLabel;
  protected readonly mobile = isMobileUserAgent(navigator.userAgent);

  constructor() {
    effect(() => {
      this.assetId();
      untracked(() => void this.load());
    });
  }

  protected async load(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      this.res.set(await this.api.client.qr.resolve(this.assetId()));
    } catch (e) {
      this.error.set(resolveErrorView(e));
    } finally {
      this.loading.set(false);
    }
  }

  protected async meToo(buildingId: UUID, issueId: UUID): Promise<void> {
    this.busy.set(true);
    try {
      const i = await this.api.client.issues.meToo(buildingId, issueId);
      this.joined.update((s) => new Set(s).add(issueId));
      this.res.update((r) => (r ? { ...r, openIssues: r.openIssues.map((o) => (o.id === issueId ? { ...o, affectedCount: i.affectedCount } : o)) } : r));
      this.toast.success(`You're on #${i.number}`, "We'll let you know when it changes.");
    } catch (e) {
      this.toast.error(e);
    } finally {
      this.busy.set(false);
    }
  }
}
