import { Component, computed } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { CommonAreaKind, GenerateStructureRequest, UnitNaming } from '@condo/shared';
import { map } from 'rxjs';
import { FieldErrorComponent } from './field-error.component';
import {
  COMMON_AREA_KINDS,
  DEFAULT_WIZARD_VALUE,
  WIZARD_LIMITS,
  WizardFormValue,
  estimateSpaceCount,
  toGenerateRequest,
} from './wizard';

const intControl = (value: number, limits: { min: number; max: number }) =>
  new FormControl(value, {
    nonNullable: true,
    validators: [Validators.required, Validators.min(limits.min), Validators.max(limits.max)],
  });

/**
 * Quick-setup wizard fields with a live "~N spaces" preview. Used by "Create building" and by the
 * structure editor's "Quick setup"; the host reads `request()` / `valid()` when submitting.
 */
@Component({
  selector: 'app-structure-wizard',
  imports: [ReactiveFormsModule, FieldErrorComponent],
  template: `
    <div class="wizard" [formGroup]="form">
      <div class="grid-3">
        <label class="field">
          <span>Floors above ground</span>
          <input type="number" formControlName="floors" [min]="L.floors.min" [max]="L.floors.max" />
          <app-field-error [control]="form.controls.floors" label="Floors" />
        </label>
        <label class="field">
          <span>Units per floor</span>
          <input type="number" formControlName="unitsPerFloor" [min]="L.unitsPerFloor.min" [max]="L.unitsPerFloor.max" />
          <app-field-error [control]="form.controls.unitsPerFloor" label="Units per floor" />
        </label>
        <label class="field">
          <span>Basement levels</span>
          <input type="number" formControlName="basements" [min]="L.basements.min" [max]="L.basements.max" />
          <app-field-error [control]="form.controls.basements" label="Basements" />
        </label>
      </div>

      <label class="check">
        <input type="checkbox" formControlName="groundFloor" />
        <span>Ground floor with its own units / shops</span>
      </label>
      @if (value().groundFloor) {
        <div class="grid-3 indent">
          <label class="field">
            <span>Ground-floor units</span>
            <input type="number" formControlName="groundUnits" [min]="0" [max]="L.groundUnits.max" />
            <app-field-error [control]="form.controls.groundUnits" label="Units" />
          </label>
          <label class="field">
            <span>Shops</span>
            <input type="number" formControlName="groundShops" [min]="0" [max]="L.groundShops.max" />
            <app-field-error [control]="form.controls.groundShops" label="Shops" />
          </label>
        </div>
      }

      <fieldset class="field">
        <legend>Unit naming</legend>
        <div class="row gap">
          <label class="check"><input type="radio" formControlName="unitNaming" value="LETTERS" /> Letters (1A, 1B)</label>
          <label class="check"><input type="radio" formControlName="unitNaming" value="NUMBERS" /> Numbers (101, 102)</label>
        </div>
      </fieldset>

      <fieldset class="field" formGroupName="commonAreas">
        <legend>Common areas</legend>
        <div class="chips">
          @for (c of commonAreaKinds; track c.kind) {
            <label class="check chip"><input type="checkbox" [formControlName]="c.kind" /> {{ c.label }}</label>
          }
        </div>
      </fieldset>

      <p class="preview" aria-live="polite">Will create <strong>~{{ estimate() }}</strong> spaces.</p>
    </div>
  `,
})
export class StructureWizardComponent {
  protected readonly L = WIZARD_LIMITS;
  protected readonly commonAreaKinds = COMMON_AREA_KINDS;

  readonly form = new FormGroup({
    floors: intControl(DEFAULT_WIZARD_VALUE.floors, WIZARD_LIMITS.floors),
    unitsPerFloor: intControl(DEFAULT_WIZARD_VALUE.unitsPerFloor, WIZARD_LIMITS.unitsPerFloor),
    basements: intControl(DEFAULT_WIZARD_VALUE.basements, WIZARD_LIMITS.basements),
    groundFloor: new FormControl(DEFAULT_WIZARD_VALUE.groundFloor, { nonNullable: true }),
    groundUnits: intControl(DEFAULT_WIZARD_VALUE.groundUnits, WIZARD_LIMITS.groundUnits),
    groundShops: intControl(DEFAULT_WIZARD_VALUE.groundShops, WIZARD_LIMITS.groundShops),
    unitNaming: new FormControl<UnitNaming>(DEFAULT_WIZARD_VALUE.unitNaming, { nonNullable: true }),
    commonAreas: new FormGroup(
      Object.fromEntries(
        COMMON_AREA_KINDS.map((c) => [
          c.kind,
          new FormControl(!!DEFAULT_WIZARD_VALUE.commonAreas[c.kind], { nonNullable: true }),
        ]),
      ) as Record<CommonAreaKind, FormControl<boolean>>,
    ),
  });

  protected readonly value = toSignal(
    this.form.valueChanges.pipe(map(() => this.form.getRawValue() as WizardFormValue)),
    { initialValue: this.form.getRawValue() as WizardFormValue },
  );
  private readonly status = toSignal(this.form.statusChanges, { initialValue: this.form.status });

  readonly request = computed<GenerateStructureRequest>(() => toGenerateRequest(this.value()));
  readonly estimate = computed(() => estimateSpaceCount(this.request()));
  readonly valid = computed(() => this.status() === 'VALID');

  markAllTouched(): void {
    this.form.markAllAsTouched();
  }
}
