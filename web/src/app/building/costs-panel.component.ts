import { Component, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CostEntryDto, Money, UUID } from '@condo/shared';
import { ApiService } from '../core/api.service';
import { CATEGORY_LABELS } from '../shared/costs';
import { formatMoney, formatTotals } from '../shared/money';
import { formatLocalDate } from '../shared/zoned';
import { CostAnchors, CostDialogComponent } from './cost-dialog.component';

/** "Costs: €340.00 (3)" for an issue or an asset, with Add cost for COST_MANAGE. */
@Component({
  selector: 'app-costs-panel',
  imports: [RouterLink, CostDialogComponent],
  template: `
    <div class="costs-panel">
      <div class="row gap wrap">
        <strong class="grow">
          Costs: {{ loaded() ? totals() : '…' }}
          @if (loaded()) {
            <span class="muted small">({{ total() }} {{ total() === 1 ? 'entry' : 'entries' }})</span>
          }
        </strong>
        @if (canManage()) {
          <button type="button" class="btn btn-sm" (click)="adding.set(true)">＋ Add cost</button>
        }
        @if (total() > 0) {
          <a class="btn btn-sm" [routerLink]="['/buildings', buildingId(), 'costs']" [queryParams]="anchors().issueId ? { issue: anchors().issueId } : { asset: anchors().assetId }">View all</a>
        }
      </div>
      @if (entries().length) {
        <ul class="cost-mini">
          @for (c of entries().slice(0, 5); track c.id) {
            <li>
              <span>{{ date(c.incurredOn) }} · {{ c.description }} <span class="muted small">{{ categoryLabels[c.category] }}</span></span>
              <strong>{{ money(c) }}</strong>
            </li>
          }
        </ul>
      }
    </div>

    @if (adding()) {
      <app-cost-dialog
        [buildingId]="buildingId()"
        [defaultCurrency]="defaultCurrency()"
        [today]="today()"
        [anchors]="anchors()"
        (saved)="load()"
        (closed)="adding.set(false)"
      />
    }
  `,
})
export class CostsPanelComponent {
  private readonly api = inject(ApiService);

  readonly buildingId = input.required<UUID>();
  readonly anchors = input.required<CostAnchors>();
  readonly canManage = input(false);
  readonly defaultCurrency = input('EUR');
  readonly today = input.required<string>();

  protected readonly categoryLabels = CATEGORY_LABELS;
  protected readonly entries = signal<CostEntryDto[]>([]);
  protected readonly total = signal(0);
  protected readonly loaded = signal(false);
  protected readonly adding = signal(false);
  /** Server-side totals for the whole filter, one Money per currency. */
  protected readonly summaryTotals = signal<Money[]>([]);
  protected readonly totals = computed(() => formatTotals(this.summaryTotals()));
  protected readonly money = (c: CostEntryDto) => formatMoney(c.amount);
  protected readonly date = (d: string) => formatLocalDate(d, { day: 'numeric', month: 'short', year: 'numeric' });

  constructor() {
    effect(() => {
      this.buildingId();
      this.anchors();
      untracked(() => void this.load());
    });
  }

  protected async load(): Promise<void> {
    const a = this.anchors();
    const filter = {
      ...(a.issueId ? { issueId: a.issueId } : {}),
      ...(!a.issueId && a.assetId ? { assetId: a.assetId } : {}),
    };
    try {
      // The latest 5 for the mini list; totals come from the summary (exact, all entries, per currency).
      const [page, summary] = await Promise.all([
        this.api.client.costs.list(this.buildingId(), { ...filter, size: 5 }),
        this.api.client.costs.summary(this.buildingId(), 'category', filter),
      ]);
      this.entries.set(page.items);
      this.total.set(page.total);
      this.summaryTotals.set(summary.totals);
    } catch {
      this.entries.set([]);
      this.summaryTotals.set([]);
    } finally {
      this.loaded.set(true);
    }
  }
}
