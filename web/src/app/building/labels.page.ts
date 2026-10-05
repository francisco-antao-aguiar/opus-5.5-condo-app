import { Component, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { RouterLink } from '@angular/router';
import { AssetDto, UUID } from '@condo/shared';
import { ApiService } from '../core/api.service';
import { describeError, ErrorText } from '../core/errors';
import { LABEL_LAYOUTS, LabelSize, paginateLabels, parseIdsParam } from '../shared/qr';
import { qrSvg } from '../shared/qr-svg';
import { BuildingContext } from './building-context.service';

interface Label {
  asset: AssetDto;
  svg: SafeHtml;
}

/** Printable A4 sheet of QR labels for the selected assets. */
@Component({
  selector: 'app-labels-page',
  imports: [RouterLink],
  template: `
    <div class="no-print">
      <p class="breadcrumb"><a [routerLink]="['/buildings', ctx.buildingId(), 'assets']">‹ Assets</a></p>
      <div class="page-head">
        <h1>QR labels</h1>
        <div class="row gap wrap">
          <div class="segmented" role="group" aria-label="Label size">
            @for (s of sizes; track s) {
              <button type="button" [class.active]="size() === s" (click)="size.set(s)">{{ layouts[s].label }}</button>
            }
          </div>
          <button type="button" class="btn btn-primary" [disabled]="!labels().length" (click)="print()">🖨 Print</button>
        </div>
      </div>
      <p class="muted small">
        {{ labels().length }} label{{ labels().length === 1 ? '' : 's' }} on {{ pages().length }} A4 page{{ pages().length === 1 ? '' : 's' }}
        ({{ layouts[size()].widthMm }}×{{ layouts[size()].heightMm }} mm). In the print dialog choose A4, 100% scale and no margins
        — or “Save as PDF”.
      </p>
      @if (excluded().length) {
        <p class="alert alert-warn">
          {{ excluded().length }} archived item{{ excluded().length === 1 ? ' is' : 's are' }} left out: {{ excludedNames() }}.
        </p>
      }
      @if (missing() > 0) {
        <p class="alert alert-warn">{{ missing() }} selected item{{ missing() === 1 ? " wasn't" : "s weren't" }} found (deleted, or not visible to you).</p>
      }
      @if (error(); as e) {
        <div class="alert alert-error" role="alert"><strong>{{ e.title }}</strong>@if (e.detail) {<p>{{ e.detail }}</p>}</div>
      }
      @if (!ids().length) {
        <div class="empty card">
          <p><strong>No items selected.</strong></p>
          <p class="muted">Select items on the Assets page, then choose “Print QR labels”.</p>
        </div>
      }
    </div>

    @if (loading()) {
      <p class="muted no-print">Preparing labels…</p>
    }
    <div class="sheets" [class]="'sheets labels-' + size()">
      @for (page of pages(); track $index) {
        <div class="sheet">
          @for (l of page; track l.asset.id) {
            <div class="qr-label">
              <div class="qr-label-code" [innerHTML]="l.svg"></div>
              <div class="qr-label-text">
                <strong class="qr-label-name">{{ l.asset.name }}</strong>
                <span class="qr-label-loc">{{ l.asset.spacePath || buildingName() }}</span>
                <span class="qr-label-building">{{ buildingName() }}</span>
                <span class="qr-label-cta">Scan to report a problem</span>
              </div>
            </div>
          }
        </div>
      }
    </div>
  `,
})
export class LabelsPage {
  protected readonly ctx = inject(BuildingContext);
  private readonly api = inject(ApiService);
  private readonly sanitizer = inject(DomSanitizer);

  /** ?ids=a,b,c (fallback); router state carries longer selections. */
  readonly idsParam = input<string>('', { alias: 'ids' });

  protected readonly layouts = LABEL_LAYOUTS;
  protected readonly sizes: LabelSize[] = ['small', 'large'];
  protected readonly size = signal<LabelSize>('small');
  protected readonly labels = signal<Label[]>([]);
  protected readonly excluded = signal<AssetDto[]>([]);
  protected readonly missing = signal(0);
  protected readonly loading = signal(false);
  protected readonly error = signal<ErrorText | null>(null);

  private readonly stateIds: UUID[] = Array.isArray(history.state?.ids) ? (history.state.ids as UUID[]) : [];
  protected readonly ids = computed(() => (this.stateIds.length ? this.stateIds : parseIdsParam(this.idsParam())));
  protected readonly pages = computed(() => paginateLabels(this.labels(), this.size()));
  protected readonly buildingName = computed(() => this.ctx.building()?.name ?? '');
  protected readonly excludedNames = computed(() => this.excluded().map((a) => a.name).join(', '));

  constructor() {
    effect(() => {
      const b = this.ctx.buildingId();
      const ids = this.ids();
      if (b && ids.length) untracked(() => void this.load(b, ids));
    });
  }

  private async load(buildingId: UUID, ids: UUID[]): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      const all = await this.api.client.assets.list(buildingId, { includeArchived: true });
      const byId = new Map(all.map((a) => [a.id, a]));
      const picked = ids.map((id) => byId.get(id)).filter((a): a is AssetDto => !!a);
      this.missing.set(ids.length - picked.length);
      this.excluded.set(picked.filter((a) => a.archived));
      const active = picked.filter((a) => !a.archived);
      const svgs = await Promise.all(active.map((a) => qrSvg(a.qrUrl)));
      // SVG comes from the qrcode library, generated locally from our own URLs.
      this.labels.set(active.map((asset, i) => ({ asset, svg: this.sanitizer.bypassSecurityTrustHtml(svgs[i]!) })));
    } catch (e) {
      this.error.set(describeError(e));
    } finally {
      this.loading.set(false);
    }
  }

  protected print(): void {
    window.print();
  }
}
