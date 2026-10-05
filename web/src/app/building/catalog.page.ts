import { Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { AssetTypeDto, ProblemTypeDto, UUID, UpdateProblemTypeRequest } from '@condo/shared';
import { ApiService } from '../core/api.service';
import { describeError, errorCode, ErrorText } from '../core/errors';
import { ToastService } from '../core/toast.service';
import { assetTypeIcon, customReorderPlan, isDuplicateLabel, problemTypeUpdate, sortProblemTypes } from '../shared/assets';
import { BuildingContext } from './building-context.service';

const LABEL_MAX = 100;

@Component({
  selector: 'app-catalog-page',
  template: `
    <div class="page-head">
      <h1>Problem catalog</h1>
    </div>
    <p class="alert alert-info">
      Residents pick from these when reporting; an “Other” option is always added. Built-in problems can be hidden if they
      don't apply here; your own can be renamed, reordered and turned off.
    </p>

    @if (!canEdit()) {
      <p class="muted">You need the “Edit problem catalog” permission to change this.</p>
    } @else if (loadError(); as e) {
      <div class="alert alert-error" role="alert">
        <strong>{{ e.title }}</strong>@if (e.detail) {<p>{{ e.detail }}</p>}
        <button type="button" class="btn btn-sm" (click)="load()">Retry</button>
      </div>
    } @else if (loading() && !types().length) {
      <p class="muted">Loading catalog…</p>
    } @else {
      <div class="catalog-grid" [class.busy]="busy()">
        @for (t of types(); track t.code) {
          @let list = sorted(t);
          <section class="card catalog-card">
            <h2><span aria-hidden="true">{{ icon(t.icon) }}</span> {{ t.name }}</h2>
            <ul class="problem-list">
              @for (p of list; track p.id) {
                <li class="problem-row" [class.inactive]="!p.active">
                  @if (p.builtIn) {
                    <span class="grow">{{ p.label }}</span>
                    <span class="badge">built-in</span>
                    @if (!p.active) {
                      <span class="badge badge-warn">hidden</span>
                    }
                    <button type="button" class="btn btn-sm" [disabled]="busy()" (click)="setActive(p, !p.active)">{{ p.active ? 'Hide' : 'Show' }}</button>
                  } @else {
                    <form class="grow row gap" (submit)="$event.preventDefault(); rename(t, p)">
                      <input
                        type="text"
                        class="grow"
                        [value]="draft(p.id, p.label)"
                        (input)="setDraft(p.id, $any($event.target).value)"
                        [attr.maxlength]="labelMax"
                        [attr.aria-label]="'Rename ' + p.label"
                      />
                      @if (draft(p.id, p.label).trim() !== p.label) {
                        <button type="submit" class="btn btn-sm btn-primary" [disabled]="busy() || !draft(p.id, p.label).trim()">Save</button>
                      }
                    </form>
                    @if (!p.active) {
                      <span class="badge badge-warn">off</span>
                    }
                    @let ci = customIndex(list, p.id);
                    <button type="button" class="btn btn-sm" aria-label="Move up" title="Move up" [disabled]="busy() || ci.index <= 0" (click)="reorder(t, p, -1)">▲</button>
                    <button type="button" class="btn btn-sm" aria-label="Move down" title="Move down" [disabled]="busy() || ci.index >= ci.count - 1" (click)="reorder(t, p, 1)">▼</button>
                    <button type="button" class="btn btn-sm" [class.btn-danger]="p.active" [disabled]="busy()" (click)="setActive(p, !p.active)">{{ p.active ? 'Turn off' : 'Turn on' }}</button>
                  }
                </li>
              } @empty {
                <li class="muted">No problems yet — residents can still use “Other”.</li>
              }
              <li class="muted small problem-other">Other… <em>(always offered)</em></li>
            </ul>
            <form class="row gap add-problem" (submit)="$event.preventDefault(); add(t)">
              <input
                type="text"
                class="grow"
                placeholder="Add problem, e.g. “Door won't lock”"
                [value]="draft('new:' + t.code, '')"
                (input)="setDraft('new:' + t.code, $any($event.target).value)"
                [attr.maxlength]="labelMax"
                [attr.aria-label]="'Add a problem for ' + t.name"
              />
              <button type="submit" class="btn btn-sm" [disabled]="busy() || !draft('new:' + t.code, '').trim()">＋ Add</button>
            </form>
            @if (rowError()?.code === t.code) {
              <p class="field-error" role="alert">{{ rowError()!.message }}</p>
            }
          </section>
        }
      </div>
    }
  `,
})
export class CatalogPage {
  protected readonly ctx = inject(BuildingContext);
  private readonly api = inject(ApiService);
  private readonly toast = inject(ToastService);

  protected readonly icon = assetTypeIcon;
  protected readonly labelMax = LABEL_MAX;
  protected readonly types = signal<AssetTypeDto[]>([]);
  protected readonly loading = signal(true);
  protected readonly loadError = signal<ErrorText | null>(null);
  protected readonly busy = signal(false);
  protected readonly drafts = signal<ReadonlyMap<string, string>>(new Map());
  /** Inline error under one asset type's card (duplicates etc.). */
  protected readonly rowError = signal<{ code: string; message: string } | null>(null);

  protected readonly canEdit = computed(() => this.ctx.can('CATALOG_EDIT'));

  constructor() {
    effect(() => {
      const id = this.ctx.buildingId();
      const can = this.canEdit();
      if (id && can) untracked(() => void this.load());
    });
  }

  private get bid(): UUID {
    return this.ctx.buildingId()!;
  }

  protected async load(): Promise<void> {
    this.loading.set(true);
    this.loadError.set(null);
    try {
      this.types.set(await this.api.client.catalog.get(this.bid, true));
    } catch (e) {
      this.loadError.set(describeError(e));
    } finally {
      this.loading.set(false);
    }
  }

  protected sorted(t: AssetTypeDto): ProblemTypeDto[] {
    return sortProblemTypes(t.problemTypes);
  }

  protected customIndex(list: ProblemTypeDto[], id: UUID): { index: number; count: number } {
    const custom = list.filter((p) => !p.builtIn);
    return { index: custom.findIndex((p) => p.id === id), count: custom.length };
  }

  protected draft(key: string, fallback: string): string {
    return this.drafts().get(key) ?? fallback;
  }

  protected setDraft(key: string, value: string): void {
    this.drafts.update((m) => new Map(m).set(key, value));
  }

  private clearDraft(key: string): void {
    this.drafts.update((m) => {
      const next = new Map(m);
      next.delete(key);
      return next;
    });
  }

  /** Runs a catalog mutation, maps the catalog-specific errors, then refetches. */
  private async mutate(typeCode: string, fn: () => Promise<unknown>, success?: string): Promise<boolean> {
    if (this.busy()) return false;
    this.busy.set(true);
    this.rowError.set(null);
    try {
      await fn();
      if (success) this.toast.success(success);
      return true;
    } catch (e) {
      const code = errorCode(e);
      if (code === 'DUPLICATE_PROBLEM_TYPE' || code === 'BUILT_IN_PROBLEM_TYPE' || code === 'VALIDATION_FAILED') {
        const d = describeError(e);
        this.rowError.set({ code: typeCode, message: d.detail ?? d.title });
      } else {
        this.toast.error(e);
      }
      return false;
    } finally {
      await this.load();
      this.busy.set(false);
    }
  }

  private update(p: ProblemTypeDto, patch: Partial<UpdateProblemTypeRequest>): Promise<ProblemTypeDto> {
    return this.api.client.catalog.updateProblemType(this.bid, p.id, problemTypeUpdate(p, patch));
  }

  protected async setActive(p: ProblemTypeDto, active: boolean): Promise<void> {
    const verb = p.builtIn ? (active ? 'Shown' : 'Hidden') : active ? 'Turned on' : 'Turned off';
    await this.mutate(p.assetType, () => this.update(p, { active }), `${verb}: “${p.label}”`);
  }

  protected async rename(t: AssetTypeDto, p: ProblemTypeDto): Promise<void> {
    const label = this.draft(p.id, p.label).trim();
    if (!label || label === p.label) return;
    if (isDuplicateLabel(t.problemTypes, label, p.id)) {
      this.rowError.set({ code: t.code, message: `“${label}” already exists for ${t.name}.` });
      return;
    }
    const ok = await this.mutate(t.code, () => this.update(p, { label }), 'Renamed');
    if (ok) this.clearDraft(p.id);
  }

  protected async reorder(t: AssetTypeDto, p: ProblemTypeDto, dir: -1 | 1): Promise<void> {
    const plan = customReorderPlan(t.problemTypes, p.id, dir);
    if (!plan.length) return;
    const byId = new Map(t.problemTypes.map((x) => [x.id, x]));
    await this.mutate(t.code, async () => {
      for (const u of plan) {
        const x = byId.get(u.id);
        if (x) await this.update(x, { sortOrder: u.sortOrder });
      }
    });
  }

  protected async add(t: AssetTypeDto): Promise<void> {
    const key = 'new:' + t.code;
    const label = this.draft(key, '').trim();
    if (!label) return;
    if (isDuplicateLabel(t.problemTypes, label)) {
      this.rowError.set({ code: t.code, message: `“${label}” already exists for ${t.name}${this.hiddenMatch(t, label) ? ' (it is currently hidden or turned off)' : ''}.` });
      return;
    }
    const ok = await this.mutate(
      t.code,
      () => this.api.client.catalog.createProblemType(this.bid, { assetType: t.code, label }),
      `Added “${label}” to ${t.name}`,
    );
    if (ok) this.clearDraft(key);
  }

  private hiddenMatch(t: AssetTypeDto, label: string): boolean {
    const l = label.toLowerCase();
    return t.problemTypes.some((p) => !p.active && p.label.toLowerCase() === l);
  }
}
