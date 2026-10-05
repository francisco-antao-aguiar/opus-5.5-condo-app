import { DatePipe } from '@angular/common';
import { Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AssetTypeDto, OtherTextGroup } from '@condo/shared';
import { ApiService } from '../core/api.service';
import { describeError, ErrorText } from '../core/errors';
import { ToastService } from '../core/toast.service';
import { assetCodeIcon } from '../shared/assets';
import { promoteLabel } from '../shared/issues';
import { ModalComponent } from '../shared/modal.component';
import { BuildingContext } from './building-context.service';

/** "Other" texts residents typed, grouped; promote frequent ones into the catalog. */
@Component({
  selector: 'app-other-review-page',
  imports: [RouterLink, DatePipe, ModalComponent],
  template: `
    <p class="breadcrumb"><a [routerLink]="['/buildings', ctx.buildingId(), 'catalog']">‹ Problem catalog</a></p>
    <div class="page-head"><h1>Review “Other” reports</h1></div>
    <p class="muted">
      What residents typed when no catalog problem fitted, grouped by item type. Promote a frequent one to add it to the catalog
      — matching issues are re-filed under it, and future reporters can just tap it.
    </p>

    @if (!ctx.can('CATALOG_EDIT')) {
      <p class="muted">You need the “Edit problem catalog” permission to review these.</p>
    } @else if (error(); as e) {
      <div class="alert alert-error" role="alert">
        <strong>{{ e.title }}</strong>@if (e.detail) {<p>{{ e.detail }}</p>}
        <button type="button" class="btn btn-sm" (click)="load()">Retry</button>
      </div>
    } @else if (loading() && !groups().length) {
      <p class="muted">Loading…</p>
    } @else {
      <div class="table-wrap">
        <table class="table members-table">
          <thead>
            <tr><th>Item type</th><th>What people wrote</th><th>Reports</th><th>Open</th><th>Last seen</th><th><span class="sr-only">Actions</span></th></tr>
          </thead>
          <tbody>
            @for (g of groups(); track g.assetType + g.normalizedText) {
              <tr>
                <td data-label="Type"><span aria-hidden="true">{{ icon(g.assetType) }}</span> {{ typeName(g.assetType) }}</td>
                <td data-label="Text"><strong>“{{ g.sampleText }}”</strong></td>
                <td data-label="Reports">{{ g.count }}</td>
                <td data-label="Open">{{ g.openCount }}</td>
                <td data-label="Last seen">{{ g.lastReportedAt | date: 'mediumDate' }}</td>
                <td class="cell-actions"><button type="button" class="btn btn-sm btn-primary" (click)="openPromote(g)">Promote…</button></td>
              </tr>
            } @empty {
              <tr><td colspan="6" class="muted">Nothing to review. 🎉</td></tr>
            }
          </tbody>
        </table>
      </div>
    }

    @if (promoting(); as g) {
      <app-modal title="Add to the catalog" (closed)="promoting.set(null)">
        <p class="muted small">{{ g.count }} report{{ g.count === 1 ? '' : 's' }} of “{{ g.sampleText }}” on {{ typeName(g.assetType) }} items.</p>
        <label class="field">
          <span>Catalog label</span>
          <input type="text" maxlength="100" [value]="label()" (input)="label.set($any($event.target).value)" />
        </label>
        @if (promoteError(); as e) {
          <div class="alert alert-error" role="alert"><strong>{{ e.title }}</strong>@if (e.detail) {<p>{{ e.detail }}</p>}</div>
        }
        <div modal-footer>
          <button type="button" class="btn" (click)="promoting.set(null)">Cancel</button>
          <button type="button" class="btn btn-primary" [disabled]="busy() || !label().trim()" (click)="promote()">{{ busy() ? 'Adding…' : 'Add & re-file' }}</button>
        </div>
      </app-modal>
    }
  `,
})
export class OtherReviewPage {
  protected readonly ctx = inject(BuildingContext);
  private readonly api = inject(ApiService);
  private readonly toast = inject(ToastService);

  protected readonly icon = assetCodeIcon;
  protected readonly groups = signal<OtherTextGroup[]>([]);
  protected readonly types = signal<AssetTypeDto[]>([]);
  protected readonly loading = signal(true);
  protected readonly error = signal<ErrorText | null>(null);
  protected readonly promoting = signal<OtherTextGroup | null>(null);
  protected readonly label = signal('');
  protected readonly busy = signal(false);
  protected readonly promoteError = signal<ErrorText | null>(null);
  private readonly typeNames = computed(() => new Map(this.types().map((t) => [t.code, t.name])));

  constructor() {
    effect(() => {
      const id = this.ctx.buildingId();
      if (id && this.ctx.can('CATALOG_EDIT')) untracked(() => void this.load());
    });
  }

  protected typeName(code: string): string {
    return this.typeNames().get(code) ?? code;
  }

  protected async load(): Promise<void> {
    const b = this.ctx.buildingId()!;
    this.loading.set(true);
    this.error.set(null);
    try {
      const [groups, types] = await Promise.all([this.api.client.issues.otherTexts(b), this.api.client.catalog.get(b)]);
      this.groups.set([...groups].sort((a, c) => c.count - a.count || c.lastReportedAt.localeCompare(a.lastReportedAt)));
      this.types.set(types);
    } catch (e) {
      this.error.set(describeError(e));
    } finally {
      this.loading.set(false);
    }
  }

  protected openPromote(g: OtherTextGroup): void {
    this.promoteError.set(null);
    this.label.set(promoteLabel(g.sampleText));
    this.promoting.set(g);
  }

  protected async promote(): Promise<void> {
    const g = this.promoting();
    if (!g || this.busy()) return;
    this.busy.set(true);
    this.promoteError.set(null);
    try {
      const res = await this.api.client.issues.promoteOtherText(this.ctx.buildingId()!, {
        assetType: g.assetType,
        normalizedText: g.normalizedText,
        label: this.label().trim(),
      });
      const n = res.reclassifiedIssues;
      this.toast.success(`Added “${res.problemType.label}” to ${this.typeName(g.assetType)} problems`, `Re-filed ${n} issue${n === 1 ? '' : 's'}.`);
      this.promoting.set(null);
      await this.load();
    } catch (e) {
      this.promoteError.set(describeError(e));
    } finally {
      this.busy.set(false);
    }
  }
}
