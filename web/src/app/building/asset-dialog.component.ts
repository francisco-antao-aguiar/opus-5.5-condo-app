import { Component, computed, inject, input, OnInit, output, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { AssetDto, AssetTypeDto, UUID } from '@condo/shared';
import { ApiService } from '../core/api.service';
import { ConfirmService } from '../core/confirm.service';
import { applyServerErrors, CONFLICT_RELOADED, describeError, errorCode, ErrorText, isConflict } from '../core/errors';
import { ToastService } from '../core/toast.service';
import { ASSET_NAME_MAX, ASSET_NOTES_MAX, SpaceOption, assetTypeIcon, prefillName, problemSummary } from '../shared/assets';
import { FieldErrorComponent } from '../shared/field-error.component';
import { ModalComponent } from '../shared/modal.component';

/** Create or edit one asset. Archive/restore live here too for existing assets. */
@Component({
  selector: 'app-asset-dialog',
  imports: [ReactiveFormsModule, ModalComponent, FieldErrorComponent],
  template: `
    <app-modal [title]="asset() ? 'Edit asset' : 'Add asset'" [wide]="true" (closed)="closed.emit()">
      @if (isArchived()) {
        <div class="alert alert-warn">
          <strong>This asset is archived.</strong>
          <p>Restore it to edit it or to let residents report problems on it again.</p>
          @if (canArchive()) {
            <button type="button" class="btn btn-sm" [disabled]="busy()" (click)="restore()">Restore</button>
          }
        </div>
      }
      <form [formGroup]="form" id="asset-form" (ngSubmit)="save()" novalidate>
        <fieldset class="field" [disabled]="isArchived()">
          <legend>Type</legend>
          <div class="type-grid" role="radiogroup" aria-label="Asset type">
            @for (t of catalog(); track t.code) {
              <button
                type="button"
                class="type-tile"
                role="radio"
                [attr.aria-checked]="type() === t.code"
                [class.selected]="type() === t.code"
                (click)="pickType(t)"
              >
                <span class="type-tile-icon" aria-hidden="true">{{ icon(t.icon) }}</span>
                <span>{{ t.name }}</span>
              </button>
            }
          </div>
          <app-field-error [control]="form.controls.type" label="Type" />
          @if (selectedType(); as t) {
            <p class="muted small catalog-preview">
              @if (problems(); as p) {
                Residents will be able to report: {{ p }} · Other…
              } @else {
                Residents will only be able to describe problems in their own words (“Other…”).
              }
            </p>
          }
        </fieldset>

        <div class="grid-2">
          <label class="field">
            <span>Name</span>
            <input type="text" formControlName="name" [maxlength]="nameMax" (input)="nameEdited = true" placeholder="e.g. Stairwell light" />
            <app-field-error [control]="form.controls.name" label="Name" />
          </label>
          <label class="field">
            <span>Location</span>
            <select formControlName="spaceId">
              @if (!form.controls.spaceId.value) {
                <option value="" disabled>Choose a space…</option>
              }
              @for (o of spaceChoices(); track o.space.id) {
                <option [value]="o.space.id">{{ o.label }}</option>
              }
            </select>
            @if (asset() && spaceChoices().length <= 1) {
              <small class="muted">You can't move this asset to another space.</small>
            }
            <app-field-error [control]="form.controls.spaceId" label="Location" />
          </label>
        </div>

        <label class="field">
          <span>Notes <small class="muted">(optional — model, serial number, where exactly…)</small></span>
          <textarea formControlName="notes" rows="3" [maxlength]="notesMax"></textarea>
          <app-field-error [control]="form.controls.notes" label="Notes" />
        </label>

        @if (error(); as e) {
          <div class="alert alert-error" role="alert"><strong>{{ e.title }}</strong>@if (e.detail) {<p>{{ e.detail }}</p>}</div>
        }
      </form>

      <div modal-footer>
        @if (asset() && canArchive() && !isArchived()) {
          <button type="button" class="btn btn-danger push-left" [disabled]="busy()" (click)="archive()">Archive</button>
        }
        <button type="button" class="btn" (click)="closed.emit()">Cancel</button>
        @if (!isArchived()) {
          <button type="submit" form="asset-form" class="btn btn-primary" [disabled]="busy()">
            {{ busy() ? 'Saving…' : asset() ? 'Save' : 'Add asset' }}
          </button>
        }
      </div>
    </app-modal>
  `,
})
export class AssetDialogComponent implements OnInit {
  private readonly api = inject(ApiService);
  private readonly toast = inject(ToastService);
  private readonly confirm = inject(ConfirmService);

  readonly buildingId = input.required<UUID>();
  readonly catalog = input.required<AssetTypeDto[]>();
  /** All spaces in tree order. */
  readonly spaces = input.required<SpaceOption[]>();
  /** Spaces this dialog may place the asset in (ASSET_CREATE, or ASSET_EDIT on old and new). */
  readonly allowed = input.required<ReadonlySet<UUID>>();
  /** Null = create. */
  readonly asset = input<AssetDto | null>(null);
  readonly initialSpaceId = input<UUID | null>(null);
  readonly canArchive = input(false);

  readonly closed = output<void>();
  /** Created, updated, archived or restored: the parent reloads its list. */
  readonly changed = output<AssetDto | null>();

  protected readonly nameMax = ASSET_NAME_MAX;
  protected readonly notesMax = ASSET_NOTES_MAX;
  protected readonly icon = assetTypeIcon;
  protected readonly busy = signal(false);
  protected readonly error = signal<ErrorText | null>(null);
  /** Latest server copy (refreshed after a conflict or restore). */
  protected readonly current = signal<AssetDto | null>(null);
  protected readonly isArchived = computed(() => !!this.current()?.archived);

  /** Set once the user types in the name, so picking another type doesn't overwrite it. */
  protected nameEdited = false;
  private prefilledFrom: string | null = null;

  protected readonly form = new FormGroup({
    type: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    spaceId: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    name: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.maxLength(ASSET_NAME_MAX)] }),
    notes: new FormControl('', { nonNullable: true, validators: [Validators.maxLength(ASSET_NOTES_MAX)] }),
  });

  protected readonly type = toSignal(this.form.controls.type.valueChanges, { initialValue: '' });
  protected readonly selectedType = computed(() => this.catalog().find((t) => t.code === this.type()) ?? null);
  protected readonly problems = computed(() => problemSummary(this.selectedType()));

  protected readonly spaceChoices = computed(() => {
    const allowed = this.allowed();
    const keep = this.current()?.spaceId;
    return this.spaces().filter((o) => allowed.has(o.space.id) || o.space.id === keep);
  });

  ngOnInit(): void {
    const a = this.asset();
    if (a) {
      this.fill(a);
    } else {
      const initial = this.initialSpaceId();
      if (initial && this.allowed().has(initial)) this.form.controls.spaceId.setValue(initial);
      else if (this.spaceChoices().length === 1) this.form.controls.spaceId.setValue(this.spaceChoices()[0]!.space.id);
    }
  }

  private fill(a: AssetDto): void {
    this.current.set(a);
    this.form.reset({ type: a.type, spaceId: a.spaceId ?? '', name: a.name, notes: a.notes ?? '' });
    this.nameEdited = true; // an existing name is the user's, never overwrite it
    if (a.archived) this.form.disable();
    else this.form.enable();
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

  protected async save(): Promise<void> {
    this.form.markAllAsTouched();
    if (this.form.invalid || this.busy()) return;
    const v = this.form.getRawValue();
    const body = { spaceId: v.spaceId, type: v.type, name: v.name.trim(), notes: v.notes.trim() || null };
    this.busy.set(true);
    this.error.set(null);
    try {
      const cur = this.current();
      const saved = cur
        ? await this.api.client.assets.update(this.buildingId(), cur.id, { ...body, version: cur.version })
        : await this.api.client.assets.create(this.buildingId(), body);
      this.toast.success(cur ? `Saved “${saved.name}”` : `Added “${saved.name}”`);
      this.changed.emit(saved);
      this.closed.emit();
    } catch (e) {
      const cur = this.current();
      if (cur && isConflict(e)) {
        await this.reload(cur.id);
        this.toast.info(CONFLICT_RELOADED, 'Check the values and save again if needed.');
      } else if (cur && errorCode(e) === 'ASSET_ARCHIVED') {
        await this.reload(cur.id);
      } else {
        const unmatched = applyServerErrors(this.form, e);
        const err = describeError(e);
        this.error.set(unmatched.length ? { title: err.title, detail: unmatched.join(' · ') } : err);
      }
    } finally {
      this.busy.set(false);
    }
  }

  private async reload(id: UUID): Promise<void> {
    try {
      this.fill(await this.api.client.assets.get(this.buildingId(), id));
    } catch (e) {
      this.error.set(describeError(e));
    }
  }

  protected async archive(): Promise<void> {
    const cur = this.current();
    if (!cur) return;
    const ok = await this.confirm.ask({
      title: `Archive “${cur.name}”?`,
      message:
        "It disappears from lists and residents can't report problems on it. Nothing is deleted: its id stays the same, so printed QR labels and its issue history are kept, and you can restore it any time.",
      confirmText: 'Archive',
      danger: true,
    });
    if (!ok) return;
    this.busy.set(true);
    try {
      await this.api.client.assets.archive(this.buildingId(), cur.id);
      this.toast.success(`Archived “${cur.name}”`);
      this.changed.emit(null);
      this.closed.emit();
    } catch (e) {
      this.error.set(describeError(e));
    } finally {
      this.busy.set(false);
    }
  }

  protected async restore(): Promise<void> {
    const cur = this.current();
    if (!cur) return;
    this.busy.set(true);
    this.error.set(null);
    try {
      const restored = await this.api.client.assets.restore(this.buildingId(), cur.id);
      this.fill(restored);
      this.toast.success(`Restored “${restored.name}”`);
      this.changed.emit(restored);
    } catch (e) {
      this.error.set(describeError(e));
    } finally {
      this.busy.set(false);
    }
  }
}
