import { Component, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { AssetDto, CostCategory, CostEntryDto, CostGroupBy, CostQuery, CostSummary, UUID } from '@condo/shared';
import { ApiService } from '../core/api.service';
import { describeError, ErrorText } from '../core/errors';
import { ToastService } from '../core/toast.service';
import { CATEGORY_LABELS, COST_CATEGORIES, GROUP_LABELS, downloadText, summaryView } from '../shared/costs';
import { formatMoney, formatTotals } from '../shared/money';
import { ReasonDialogComponent } from '../shared/reason-dialog.component';
import { formatLocalDate, todayIn } from '../shared/zoned';
import { BuildingContext } from './building-context.service';
import { CostDialogComponent } from './cost-dialog.component';

const PAGE_SIZE = 25;

@Component({
  selector: 'app-costs-page',
  imports: [RouterLink, CostDialogComponent, ReasonDialogComponent],
  template: `
    @if (ctx.perms() && !ctx.has('COST_VIEW')) {
      <section class="full-page">
        <div class="full-page-icon">🔒</div>
        <h1>Costs are private to management</h1>
        <p class="muted">Your role in this building can't see costs.</p>
      </section>
    } @else {
    <div class="page-head">
      <h1>Costs</h1>
      <div class="row gap wrap">
        <button type="button" class="btn" [disabled]="exporting()" (click)="exportCsv()">⬇ Export CSV</button>
        @if (canManage()) {
          <button type="button" class="btn btn-primary" (click)="editing.set('new')">＋ Add cost</button>
        }
      </div>
    </div>
    <p class="muted small">What the building spends, with receipts. Totals are kept per currency and never converted.</p>

    <div class="toolbar">
      <label class="row gap small">From <input type="date" [value]="from()" (change)="setFilter(() => from.set($any($event.target).value))" /></label>
      <label class="row gap small">To <input type="date" [value]="to()" (change)="setFilter(() => to.set($any($event.target).value))" /></label>
      <select [value]="category()" (change)="setFilter(() => category.set($any($event.target).value))" aria-label="Category">
        <option value="" [selected]="!category()">All categories</option>
        @for (c of categories; track c) {
          <option [value]="c" [selected]="c === category()">{{ categoryLabels[c] }}</option>
        }
      </select>
      <select [value]="assetId()" (change)="setFilter(() => assetId.set($any($event.target).value))" aria-label="Item">
        <option value="" [selected]="!assetId()">All items</option>
        @for (a of assets(); track a.id) {
          <option [value]="a.id" [selected]="a.id === assetId()">{{ a.name }}</option>
        }
      </select>
      @if (from() || to() || category() || assetId() || issue()) {
        <button type="button" class="btn btn-sm" (click)="clearFilters()">Clear filters</button>
      }
    </div>

    <section class="card summary-card">
      <div class="row gap wrap summary-head">
        <h2 class="grow">Summary</h2>
        <div class="segmented" role="group" aria-label="Group by">
          @for (g of groupings; track g) {
            <button type="button" [class.active]="groupBy() === g" (click)="groupBy.set(g)">{{ groupLabels[g] }}</button>
          }
        </div>
      </div>
      @if (summary(); as s) {
        <p class="summary-total"><strong>Total: {{ totals(s.totals) }}</strong></p>
        @if (s.groupBy === 'asset' || s.groupBy === 'space') {
          <p class="muted small">Costs without an item/place are grouped under “(none)”.</p>
        }
        <div class="bars">
          @for (r of summaryRows(); track r.key) {
            <div class="bar-row">
              <span class="bar-label" [title]="r.label">{{ r.label }} <span class="muted small">({{ r.count }})</span></span>
              <div class="bar-cells">
                @for (b of r.bars; track b.currency) {
                  <div class="bar-line">
                    <span class="bar" [style.width.%]="b.pct" [attr.data-currency]="b.currency"></span>
                    <span class="bar-value">{{ b.text }}</span>
                  </div>
                }
              </div>
            </div>
          } @empty {
            <p class="muted small">No costs in this period.</p>
          }
        </div>
      } @else if (summaryError()) {
        <p class="field-error">{{ summaryError() }}</p>
      } @else {
        <p class="muted small">Loading…</p>
      }
    </section>

    @if (error(); as e) {
      <div class="alert alert-error" role="alert">
        <strong>{{ e.title }}</strong>@if (e.detail) {<p>{{ e.detail }}</p>}
        <button type="button" class="btn btn-sm" (click)="reload()">Retry</button>
      </div>
    } @else {
      <div class="table-wrap" [class.busy]="loading()">
        <table class="table members-table costs-table">
          <thead>
            <tr><th>Date</th><th>Description</th><th>Category</th><th class="num">Amount</th><th>For</th><th><span class="sr-only">Actions</span></th></tr>
          </thead>
          <tbody>
            @for (c of entries(); track c.id) {
              <tr>
                <td data-label="Date">{{ date(c.incurredOn) }}</td>
                <td data-label="Description">
                  {{ c.description }}
                  @if (c.vendor) {
                    <div class="muted small">{{ c.vendor }}</div>
                  }
                </td>
                <td data-label="Category"><span class="badge">{{ categoryLabels[c.category] }}</span></td>
                <td data-label="Amount" class="num"><strong>{{ money(c) }}</strong></td>
                <td data-label="For" class="small">
                  @if (c.issueId) {
                    <a [routerLink]="['/buildings', ctx.buildingId(), 'issues', c.issueId]">#{{ c.issueNumber }}</a>
                  }
                  @if (c.assetId) {
                    <a [routerLink]="[]" [queryParams]="{ asset: c.assetId }" queryParamsHandling="merge"> {{ c.assetName }}</a>
                  }
                  @if (c.maintenancePlanId) {
                    <a [routerLink]="['/buildings', ctx.buildingId(), 'maintenance']"> 🛠 {{ c.planTitle }}</a>
                  }
                  @if (!c.issueId && !c.assetId && !c.maintenancePlanId) {
                    <span class="muted">{{ c.locationLabel ?? '—' }}</span>
                  }
                </td>
                <td class="cell-actions">
                  @if (c.receipt; as r) {
                    <a class="btn btn-sm" [href]="r.url" target="_blank" rel="noopener" title="Open receipt" (click)="receiptClicked(c, $event)">🧾</a>
                  }
                  @if (canManage()) {
                    <button type="button" class="btn btn-sm" (click)="editing.set(c)">Edit</button>
                    <button type="button" class="btn btn-sm btn-danger" (click)="deleting.set(c)">Delete</button>
                  }
                </td>
              </tr>
            } @empty {
              <tr><td colspan="6" class="muted">{{ loading() ? 'Loading…' : 'No costs match.' }}</td></tr>
            }
          </tbody>
        </table>
      </div>
      @if (pages() > 1) {
        <div class="pager">
          <button type="button" class="btn btn-sm" [disabled]="page() === 0" (click)="page.set(page() - 1)">‹ Previous</button>
          <span class="muted small">Page {{ page() + 1 }} of {{ pages() }} · {{ total() }} entries</span>
          <button type="button" class="btn btn-sm" [disabled]="page() >= pages() - 1" (click)="page.set(page() + 1)">Next ›</button>
        </div>
      }
    }

    }

    @if (deleting(); as d) {
      <app-reason-dialog
        [title]="'Delete “' + d.description + '”?'"
        [message]="money(d) + ' on ' + date(d.incurredOn) + '. It disappears from lists and totals; the entry and your reason are kept for the audit trail.'"
        label="Reason"
        placeholder="e.g. Entered twice"
        confirmText="Delete"
        [required]="true"
        [busy]="deletingBusy()"
        (confirmed)="remove(d, $event)"
        (closed)="deleting.set(null)"
      />
    }

    @if (editing(); as e) {
      <app-cost-dialog
        [buildingId]="ctx.buildingId()!"
        [entry]="e === 'new' ? null : e"
        [defaultCurrency]="ctx.building()?.currency ?? 'EUR'"
        [today]="today()"
        [anchors]="{ assetId: assetId() || null, issueId: issue() || null }"
        (saved)="reload()"
        (closed)="editing.set(null)"
      />
    }
  `,
})
export class CostsPage {
  protected readonly ctx = inject(BuildingContext);
  private readonly api = inject(ApiService);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);

  /** Query params: ?asset= / ?issue= (deep links from the asset dialog and issue detail). */
  readonly asset = input<string>();
  readonly issue = input<string>();

  protected readonly categories = COST_CATEGORIES;
  protected readonly categoryLabels = CATEGORY_LABELS;
  protected readonly groupLabels = GROUP_LABELS;
  protected readonly groupings: CostGroupBy[] = ['month', 'category', 'asset', 'space'];

  protected readonly from = signal('');
  protected readonly to = signal('');
  protected readonly category = signal<CostCategory | ''>('');
  protected readonly assetId = signal('');
  protected readonly page = signal(0);
  protected readonly groupBy = signal<CostGroupBy>('month');

  protected readonly entries = signal<CostEntryDto[]>([]);
  protected readonly total = signal(0);
  protected readonly loading = signal(true);
  protected readonly error = signal<ErrorText | null>(null);
  protected readonly summary = signal<CostSummary | null>(null);
  protected readonly summaryError = signal<string | null>(null);
  protected readonly assets = signal<AssetDto[]>([]);
  protected readonly exporting = signal(false);
  protected readonly editing = signal<CostEntryDto | 'new' | null>(null);
  protected readonly deleting = signal<CostEntryDto | null>(null);
  protected readonly deletingBusy = signal(false);

  protected readonly canManage = computed(() => this.ctx.has('COST_MANAGE'));
  protected readonly today = computed(() => todayIn(this.ctx.building()?.timeZone ?? 'Europe/Lisbon'));
  protected readonly pages = computed(() => Math.max(1, Math.ceil(this.total() / PAGE_SIZE)));
  protected readonly summaryRows = computed(() => (this.summary() ? summaryView(this.summary()!) : []));
  protected readonly date = (d: string) => formatLocalDate(d, { day: 'numeric', month: 'short', year: 'numeric' });
  protected readonly money = (c: CostEntryDto) => formatMoney(c.amount);
  protected readonly totals = formatTotals;

  private readonly query = computed<CostQuery>(() => ({
    ...(this.from() ? { from: this.from() } : {}),
    ...(this.to() ? { to: this.to() } : {}),
    ...(this.category() ? { category: this.category() as CostCategory } : {}),
    ...(this.assetId() ? { assetId: this.assetId() } : {}),
    ...(this.issue() ? { issueId: this.issue() } : {}),
    page: this.page(),
    size: PAGE_SIZE,
  }));
  private seq = 0;

  constructor() {
    effect(() => {
      const a = this.asset() ?? '';
      untracked(() => this.assetId.set(a));
    });
    effect(() => {
      const id = this.ctx.buildingId();
      const q = this.query();
      if (id && this.ctx.has('COST_VIEW')) untracked(() => void this.loadEntries(id, q));
    });
    effect(() => {
      const id = this.ctx.buildingId();
      const g = this.groupBy();
      const q = this.summaryQuery();
      if (id && this.ctx.has('COST_VIEW')) untracked(() => void this.loadSummary(id, g, q));
    });
    effect(() => {
      const id = this.ctx.buildingId();
      if (id) untracked(() => this.api.client.assets.list(id).then((a) => this.assets.set(a), () => undefined));
    });
  }

  private async loadEntries(b: UUID, q: CostQuery): Promise<void> {
    const seq = ++this.seq;
    this.loading.set(true);
    this.error.set(null);
    try {
      const res = await this.api.client.costs.list(b, q);
      if (seq !== this.seq) return;
      this.entries.set(res.items);
      this.total.set(res.total);
    } catch (e) {
      if (seq === this.seq) this.error.set(describeError(e));
    } finally {
      if (seq === this.seq) this.loading.set(false);
    }
  }

  /** Same filters as the table (minus paging): the summary now supports them all. */
  private readonly summaryQuery = computed<Omit<CostQuery, 'page' | 'size'>>(() => {
    const { page: _p, size: _s, ...rest } = this.query();
    return rest;
  });

  private async loadSummary(b: UUID, g: CostGroupBy, q: Omit<CostQuery, 'page' | 'size'>): Promise<void> {
    this.summaryError.set(null);
    try {
      this.summary.set(await this.api.client.costs.summary(b, g, q));
    } catch (e) {
      this.summary.set(null);
      this.summaryError.set(describeError(e).title);
    }
  }

  protected reload(): void {
    const b = this.ctx.buildingId();
    if (!b) return;
    void this.loadEntries(b, this.query());
    void this.loadSummary(b, this.groupBy(), this.summaryQuery());
  }

  protected setFilter(apply: () => void): void {
    this.page.set(0);
    apply();
  }

  protected clearFilters(): void {
    this.page.set(0);
    this.from.set('');
    this.to.set('');
    this.category.set('');
    this.assetId.set('');
    if (this.asset() || this.issue()) void this.router.navigate([], { queryParams: { asset: null, issue: null }, queryParamsHandling: 'merge' });
  }

  protected async exportCsv(): Promise<void> {
    this.exporting.set(true);
    try {
      const csv = await this.api.client.costs.exportCsv(this.ctx.buildingId()!, { ...(this.from() ? { from: this.from() } : {}), ...(this.to() ? { to: this.to() } : {}) });
      const name = (this.ctx.building()?.name ?? 'building').toLowerCase().replace(/[^a-z0-9]+/g, '-');
      downloadText(csv, `costs-${name}${this.from() ? '-from-' + this.from() : ''}${this.to() ? '-to-' + this.to() : ''}.csv`);
    } catch (e) {
      this.toast.error(e);
    } finally {
      this.exporting.set(false);
    }
  }

  /** Signed receipt links expire: refetch the entry first if this one is stale. */
  protected async receiptClicked(c: CostEntryDto, ev: Event): Promise<void> {
    if (!c.receipt || new Date(c.receipt.urlExpiresAt).getTime() - 60_000 > Date.now()) return;
    ev.preventDefault();
    try {
      const fresh = await this.api.client.costs.get(this.ctx.buildingId()!, c.id);
      this.entries.update((l) => l.map((x) => (x.id === c.id ? fresh : x)));
      if (fresh.receipt) window.open(fresh.receipt.url, '_blank', 'noopener');
    } catch (e) {
      this.toast.error(e);
    }
  }

  protected async remove(c: CostEntryDto, reason: string): Promise<void> {
    this.deletingBusy.set(true);
    try {
      await this.api.client.costs.remove(this.ctx.buildingId()!, c.id, reason);
      this.toast.success('Cost deleted');
      this.deleting.set(null);
      this.reload();
    } catch (e) {
      this.toast.error(e);
    } finally {
      this.deletingBusy.set(false);
    }
  }

}
