import { Component, computed, inject, input, OnInit, output, signal } from '@angular/core';
import { AssetDto, CostCategory, CostEntryDto, IssueSummaryDto, LocalDate, MaintenancePlanDto, SaveCostEntryRequest, UUID } from '@condo/shared';
import { ApiService } from '../core/api.service';
import { CONFLICT_RELOADED, describeError, ErrorText, isConflict } from '../core/errors';
import { ToastService } from '../core/toast.service';
import { CATEGORY_LABELS, COST_CATEGORIES, validateReceipt } from '../shared/costs';
import { ModalComponent } from '../shared/modal.component';
import { COMMON_CURRENCIES, currencyDecimals, parseAmount } from '../shared/money';

export interface CostAnchors {
  issueId?: UUID | null;
  assetId?: UUID | null;
  maintenancePlanId?: UUID | null;
}

/** Add / edit a cost entry. The amount is typed as text and validated against the currency's decimals. */
@Component({
  selector: 'app-cost-dialog',
  imports: [ModalComponent],
  template: `
    <app-modal [title]="entry() ? 'Edit cost' : 'Add cost'" [wide]="true" (closed)="closed.emit()">
      <div class="grid-3">
        <label class="field">
          <span>Amount</span>
          <input type="text" inputmode="decimal" autocomplete="off" [value]="amountText()" (input)="amountText.set($any($event.target).value)" placeholder="0.00" />
          @if (amountText() && amountCheck(); as c) {
            @if (!c.ok) {
              <small class="field-error">{{ c.error }}</small>
            }
          }
        </label>
        <div class="field">
          <span>Currency</span>
          <div class="row gap">
            <select [value]="currencyChoices().includes(currency()) ? currency() : 'OTHER'" (change)="pickCurrency($any($event.target).value)" aria-label="Currency">
              @for (c of currencyChoices(); track c) {
                <option [value]="c" [selected]="c === currency()">{{ c }}</option>
              }
              <option value="OTHER" [selected]="!currencyChoices().includes(currency())">Other…</option>
            </select>
            @if (!currencyChoices().includes(currency())) {
              <input type="text" class="input-narrow code-input" maxlength="3" [value]="currency()" (input)="currency.set($any($event.target).value.toUpperCase())" aria-label="Currency code" />
            }
          </div>
          @if (decimals() === null) {
            <small class="field-error">Unknown currency code.</small>
          }
        </div>
        <label class="field">
          <span>Date</span>
          <input type="date" [value]="incurredOn()" (input)="incurredOn.set($any($event.target).value)" />
        </label>
      </div>
      <div class="grid-2">
        <label class="field">
          <span>Category</span>
          <select [value]="category()" (change)="category.set($any($event.target).value)">
            @for (c of categories; track c) {
              <option [value]="c" [selected]="c === category()">{{ categoryLabels[c] }}</option>
            }
          </select>
        </label>
        <label class="field">
          <span>Vendor <small class="muted">(optional)</small></span>
          <input type="text" maxlength="160" [value]="vendor()" (input)="vendor.set($any($event.target).value)" placeholder="e.g. Schindler" />
        </label>
      </div>
      <label class="field">
        <span>Description</span>
        <input type="text" maxlength="500" [value]="description()" (input)="description.set($any($event.target).value)" placeholder="e.g. Replace door motor" />
      </label>

      <fieldset class="field">
        <legend>Linked to <small class="muted">(optional — an issue fills in its item and place)</small></legend>
        <div class="grid-3">
          <select [value]="issueId()" (change)="issueId.set($any($event.target).value)" aria-label="Issue">
            <option value="" [selected]="!issueId()">No issue</option>
            @if (issueId() && !issueOptions().some((i) => i.id === issueId())) {
              <option [value]="issueId()" selected>{{ entry()?.issueNumber ? '#' + entry()!.issueNumber : 'Linked issue' }}</option>
            }
            @for (i of issueOptions(); track i.id) {
              <option [value]="i.id" [selected]="i.id === issueId()">#{{ i.number }} {{ i.title }}</option>
            }
          </select>
          <select [value]="assetId()" (change)="assetId.set($any($event.target).value)" aria-label="Item">
            <option value="" [selected]="!assetId()">No item</option>
            @for (a of assets(); track a.id) {
              <option [value]="a.id" [selected]="a.id === assetId()">{{ a.name }}</option>
            }
          </select>
          <select [value]="planId()" (change)="planId.set($any($event.target).value)" aria-label="Maintenance plan">
            <option value="" [selected]="!planId()">No maintenance plan</option>
            @for (p of plans(); track p.id) {
              <option [value]="p.id" [selected]="p.id === planId()">{{ p.title }}</option>
            }
          </select>
        </div>
      </fieldset>

      <div class="field">
        <span>Receipt <small class="muted">(photo or PDF, up to 10 MB)</small></span>
        <div class="row gap wrap">
          @if (entry()?.receipt; as r) {
            <a [href]="r.url" target="_blank" rel="noopener">🧾 Current receipt</a>
          }
          <input type="file" accept="image/jpeg,image/png,image/webp,image/heic,application/pdf,.heic,.pdf" (change)="pickReceipt($any($event.target))" aria-label="Receipt file" />
        </div>
        @if (receiptError(); as e) {
          <small class="field-error">{{ e }}</small>
        }
      </div>

      @if (error(); as e) {
        <div class="alert alert-error" role="alert"><strong>{{ e.title }}</strong>@if (e.detail) {<p>{{ e.detail }}</p>}</div>
      }
      <div modal-footer>
        <button type="button" class="btn" (click)="closed.emit()">Cancel</button>
        <button type="button" class="btn btn-primary" [disabled]="busy() || !!formError()" [title]="formError() ?? ''" (click)="save()">
          {{ busy() ? 'Saving…' : entry() ? 'Save' : 'Add cost' }}
        </button>
      </div>
    </app-modal>
  `,
})
export class CostDialogComponent implements OnInit {
  private readonly api = inject(ApiService);
  private readonly toast = inject(ToastService);

  readonly buildingId = input.required<UUID>();
  readonly entry = input<CostEntryDto | null>(null);
  readonly defaultCurrency = input('EUR');
  readonly today = input.required<LocalDate>();
  /** Pre-filled anchors when adding from an issue or asset. */
  readonly anchors = input<CostAnchors>({});
  readonly closed = output<void>();
  readonly saved = output<CostEntryDto>();

  protected readonly categories = COST_CATEGORIES;
  protected readonly categoryLabels = CATEGORY_LABELS;

  protected readonly amountText = signal('');
  protected readonly currency = signal('EUR');
  protected readonly incurredOn = signal('');
  protected readonly category = signal<CostCategory>('REPAIR');
  protected readonly description = signal('');
  protected readonly vendor = signal('');
  protected readonly issueId = signal('');
  protected readonly assetId = signal('');
  protected readonly planId = signal('');
  protected readonly receipt = signal<File | null>(null);
  protected readonly receiptError = signal<string | null>(null);
  private version: number | undefined;

  protected readonly assets = signal<AssetDto[]>([]);
  protected readonly plans = signal<MaintenancePlanDto[]>([]);
  protected readonly issueOptions = signal<IssueSummaryDto[]>([]);
  protected readonly busy = signal(false);
  protected readonly error = signal<ErrorText | null>(null);

  protected readonly currencyChoices = computed(() => [...new Set([this.defaultCurrency(), ...COMMON_CURRENCIES])]);
  protected readonly decimals = computed(() => currencyDecimals(this.currency()));
  protected readonly amountCheck = computed(() => parseAmount(this.amountText(), this.currency()));
  protected readonly formError = computed(() => {
    const a = this.amountCheck();
    if (!a.ok) return a.error;
    if (!this.incurredOn()) return 'Pick a date.';
    if (!this.description().trim()) return 'Add a short description.';
    if (this.receiptError()) return this.receiptError();
    return null;
  });

  ngOnInit(): void {
    const e = this.entry();
    if (e) {
      this.amountText.set(e.amount.amount);
      this.currency.set(e.amount.currency);
      this.incurredOn.set(e.incurredOn);
      this.category.set(e.category);
      this.description.set(e.description);
      this.vendor.set(e.vendor ?? '');
      this.issueId.set(e.issueId ?? '');
      this.assetId.set(e.assetId ?? '');
      this.planId.set(e.maintenancePlanId ?? '');
      this.version = e.version;
    } else {
      const a = this.anchors();
      this.currency.set(this.defaultCurrency());
      this.incurredOn.set(this.today());
      this.issueId.set(a.issueId ?? '');
      this.assetId.set(a.assetId ?? '');
      this.planId.set(a.maintenancePlanId ?? '');
      if (a.maintenancePlanId) this.category.set('MAINTENANCE');
    }
    void this.loadPickers();
  }

  private async loadPickers(): Promise<void> {
    const b = this.buildingId();
    const c = this.api.client;
    const [assets, plans, issues] = await Promise.allSettled([
      c.assets.list(b),
      c.maintenance.list(b),
      c.issues.list(b, { view: 'triage', status: 'all', sort: 'recent', size: 100 }),
    ]);
    if (assets.status === 'fulfilled') this.assets.set(assets.value);
    if (plans.status === 'fulfilled') this.plans.set(plans.value);
    if (issues.status === 'fulfilled') this.issueOptions.set(issues.value.items);
  }

  protected pickCurrency(v: string): void {
    this.currency.set(v === 'OTHER' ? '' : v);
  }

  protected pickReceipt(input: HTMLInputElement): void {
    const f = input.files?.[0] ?? null;
    this.receipt.set(f);
    this.receiptError.set(f ? validateReceipt(f) : null);
  }

  private request(): SaveCostEntryRequest {
    const a = this.amountCheck();
    return {
      amount: { amount: a.ok ? a.amount : this.amountText(), currency: this.currency() },
      incurredOn: this.incurredOn(),
      category: this.category(),
      description: this.description().trim(),
      vendor: this.vendor().trim() || null,
      issueId: this.issueId() || null,
      assetId: this.assetId() || null,
      maintenancePlanId: this.planId() || null,
      ...(this.version !== undefined ? { version: this.version } : {}),
    };
  }

  protected async save(): Promise<void> {
    if (this.formError() || this.busy()) return;
    this.busy.set(true);
    this.error.set(null);
    const e = this.entry();
    const b = this.buildingId();
    try {
      let saved = e ? await this.api.client.costs.update(b, e.id, this.request()) : await this.api.client.costs.create(b, this.request());
      const file = this.receipt();
      if (file) {
        const form = new FormData();
        form.append('file', file, file.name);
        try {
          saved = await this.api.client.costs.uploadReceipt(b, saved.id, form);
        } catch (up) {
          this.toast.info('Cost saved, but the receipt failed to upload', describeError(up).title);
        }
      }
      this.toast.success(e ? 'Cost saved' : 'Cost added');
      this.saved.emit(saved);
      this.closed.emit();
    } catch (err) {
      if (e && isConflict(err)) {
        try {
          this.version = (await this.api.client.costs.get(b, e.id)).version;
          this.toast.info(CONFLICT_RELOADED, 'Your edits are still in the form — save again to overwrite.');
        } catch (e2) {
          this.error.set(describeError(e2));
        }
      } else {
        this.error.set(describeError(err));
      }
    } finally {
      this.busy.set(false);
    }
  }
}
