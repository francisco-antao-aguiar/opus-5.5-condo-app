import { Component, computed, inject, input, output, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { AssetTypeDto, SpaceDto, UUID } from '@condo/shared';
import { ApiService } from '../core/api.service';
import { applyServerErrors, describeError, ErrorText } from '../core/errors';
import { ToastService } from '../core/toast.service';
import {
  ASSET_NAME_MAX,
  ASSET_NOTES_MAX,
  BULK_MAX,
  BulkShortcut,
  SpaceOption,
  applyShortcut,
  assetTypeIcon,
  prefillName,
  problemSummary,
  shortcutSpaceIds,
} from '../shared/assets';
import { FieldErrorComponent } from '../shared/field-error.component';
import { ModalComponent } from '../shared/modal.component';

/** "Add to several spaces": one type + name, many spaces, one bulkCreate call. */
@Component({
  selector: 'app-bulk-assets-dialog',
  imports: [ReactiveFormsModule, ModalComponent, FieldErrorComponent],
  template: `
    <app-modal title="Add to several spaces" [wide]="true" (closed)="closed.emit()">
      <form [formGroup]="form" id="bulk-form" (ngSubmit)="save()" novalidate>
        <fieldset class="field">
          <legend>Type</legend>
          <div class="type-grid" role="radiogroup" aria-label="Asset type">
            @for (t of catalog(); track t.code) {
              <button type="button" class="type-tile" role="radio" [attr.aria-checked]="type() === t.code" [class.selected]="type() === t.code" (click)="pickType(t)">
                <span class="type-tile-icon" aria-hidden="true">{{ icon(t.icon) }}</span>
                <span>{{ t.name }}</span>
              </button>
            }
          </div>
          <app-field-error [control]="form.controls.type" label="Type" />
          @if (problems()) {
            <p class="muted small catalog-preview">Residents will be able to report: {{ problems() }} · Other…</p>
          }
        </fieldset>

        <div class="grid-2">
          <label class="field">
            <span>Name <small class="muted">(the same in every space)</small></span>
            <input type="text" formControlName="name" [maxlength]="nameMax" (input)="nameEdited = true" placeholder="e.g. Stairwell light" />
            <app-field-error [control]="form.controls.name" label="Name" />
          </label>
          <label class="field">
            <span>Notes <small class="muted">(optional)</small></span>
            <input type="text" formControlName="notes" [maxlength]="notesMax" />
            <app-field-error [control]="form.controls.notes" label="Notes" />
          </label>
        </div>

        <fieldset class="field">
          <legend>Spaces</legend>
          <div class="row gap wrap">
            @for (s of shortcuts; track s.kind) {
              <button type="button" class="chip btn-sm" [disabled]="!counts()[s.kind]" (click)="shortcut(s.kind)">
                {{ s.label }} ({{ counts()[s.kind] }})
              </button>
            }
            @if (selected().size) {
              <button type="button" class="btn-icon small" (click)="clearSelection()">Clear</button>
            }
          </div>
          <div class="check-tree" role="group" aria-label="Spaces">
            @for (o of spaces(); track o.space.id) {
              @let ok = allowed().has(o.space.id);
              <label class="check check-row" [style.padding-left.rem]="o.depth * 1.1" [class.disabled]="!ok" [title]="ok ? '' : 'You can’t add assets here'">
                <input type="checkbox" [checked]="selected().has(o.space.id)" [disabled]="!ok" (change)="toggle(o.space)" />
                <span>{{ o.space.name }} <small class="muted">{{ typeLabel(o.space) }}</small></span>
              </label>
            }
          </div>
        </fieldset>

        @if (error(); as e) {
          <div class="alert alert-error" role="alert"><strong>{{ e.title }}</strong>@if (e.detail) {<p>{{ e.detail }}</p>}</div>
        }
      </form>

      <div modal-footer>
        <span class="muted push-left bulk-count" aria-live="polite">
          @if (selected().size > bulkMax) {
            <span class="field-error">At most {{ bulkMax }} spaces at once.</span>
          } @else {
            Will create {{ selected().size }} asset{{ selected().size === 1 ? '' : 's' }}
          }
        </span>
        <button type="button" class="btn" (click)="closed.emit()">Cancel</button>
        <button type="submit" form="bulk-form" class="btn btn-primary" [disabled]="busy() || !selected().size || selected().size > bulkMax">
          {{ busy() ? 'Creating…' : 'Create ' + selected().size }}
        </button>
      </div>
    </app-modal>
  `,
})
export class BulkAssetsDialogComponent {
  private readonly api = inject(ApiService);
  private readonly toast = inject(ToastService);

  readonly buildingId = input.required<UUID>();
  readonly catalog = input.required<AssetTypeDto[]>();
  readonly spaces = input.required<SpaceOption[]>();
  /** Spaces where I hold ASSET_CREATE. */
  readonly allowed = input.required<ReadonlySet<UUID>>();
  readonly closed = output<void>();
  readonly created = output<number>();

  protected readonly nameMax = ASSET_NAME_MAX;
  protected readonly notesMax = ASSET_NOTES_MAX;
  protected readonly bulkMax = BULK_MAX;
  protected readonly icon = assetTypeIcon;
  protected readonly busy = signal(false);
  protected readonly error = signal<ErrorText | null>(null);
  protected readonly selected = signal<ReadonlySet<UUID>>(new Set());
  protected nameEdited = false;
  private prefilledFrom: string | null = null;

  protected readonly shortcuts: { kind: BulkShortcut; label: string }[] = [
    { kind: 'FLOOR', label: 'All floors' },
    { kind: 'UNIT', label: 'All units' },
    { kind: 'COMMON_AREA', label: 'All common areas' },
  ];

  protected readonly form = new FormGroup({
    type: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    name: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.maxLength(ASSET_NAME_MAX)] }),
    notes: new FormControl('', { nonNullable: true, validators: [Validators.maxLength(ASSET_NOTES_MAX)] }),
  });

  protected readonly type = toSignal(this.form.controls.type.valueChanges, { initialValue: '' });
  protected readonly problems = computed(() => problemSummary(this.catalog().find((t) => t.code === this.type())));

  private readonly flat = computed<SpaceDto[]>(() => this.spaces().map((o) => o.space));
  protected readonly counts = computed(() => {
    const out = {} as Record<BulkShortcut, number>;
    for (const s of this.shortcuts) out[s.kind] = shortcutSpaceIds(this.flat(), s.kind, this.allowed()).length;
    return out;
  });

  protected typeLabel(s: SpaceDto): string {
    return { BUILDING: 'building', FLOOR: 'floor', UNIT: 'unit', ROOM: 'room', COMMON_AREA: 'common area' }[s.type] ?? '';
  }

  protected pickType(t: AssetTypeDto): void {
    const name = this.form.controls.name;
    const next = prefillName(name.value, this.nameEdited, this.prefilledFrom, t.name);
    if (next !== name.value) {
      name.setValue(next);
      this.prefilledFrom = t.name;
      this.nameEdited = false;
    }
    this.form.controls.type.setValue(t.code);
  }

  protected toggle(s: SpaceDto): void {
    this.selected.update((set) => {
      const next = new Set(set);
      if (next.has(s.id)) next.delete(s.id);
      else next.add(s.id);
      return next;
    });
  }

  protected clearSelection(): void {
    this.selected.set(new Set());
  }

  protected shortcut(kind: BulkShortcut): void {
    this.selected.update((set) => applyShortcut(set, shortcutSpaceIds(this.flat(), kind, this.allowed())));
  }

  protected async save(): Promise<void> {
    this.form.markAllAsTouched();
    const ids = [...this.selected()];
    if (this.form.invalid || !ids.length || ids.length > BULK_MAX || this.busy()) return;
    const v = this.form.getRawValue();
    this.busy.set(true);
    this.error.set(null);
    try {
      const res = await this.api.client.assets.bulkCreate(this.buildingId(), {
        type: v.type,
        name: v.name.trim(),
        notes: v.notes.trim() || null,
        spaceIds: ids,
      });
      this.toast.success(`Created ${res.length} asset${res.length === 1 ? '' : 's'}`);
      this.created.emit(res.length);
      this.closed.emit();
    } catch (e) {
      const unmatched = applyServerErrors(this.form, e);
      const err = describeError(e);
      this.error.set(unmatched.length ? { title: err.title, detail: unmatched.join(' · ') } : err);
    } finally {
      this.busy.set(false);
    }
  }
}
