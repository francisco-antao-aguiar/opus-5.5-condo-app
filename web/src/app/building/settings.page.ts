import { Component, computed, effect, inject, OnInit, signal, untracked } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Action, GovernanceModeDto, RoleCode, RoleDto } from '@condo/shared';
import { ApiService } from '../core/api.service';
import { AuthService } from '../core/auth.service';
import { ConfirmService } from '../core/confirm.service';
import { applyServerErrors, CONFLICT_RELOADED, describeError, ErrorText, isConflict } from '../core/errors';
import { ToastService } from '../core/toast.service';
import { FieldErrorComponent } from '../shared/field-error.component';
import { ACTION_LABELS, buildPolicyMatrix } from '../shared/policy';
import { BuildingContext } from './building-context.service';

@Component({
  selector: 'app-settings-page',
  imports: [ReactiveFormsModule, FieldErrorComponent],
  templateUrl: './settings.page.html',
})
export class SettingsPage implements OnInit {
  protected readonly ctx = inject(BuildingContext);
  private readonly api = inject(ApiService);
  private readonly auth = inject(AuthService);
  private readonly toast = inject(ToastService);
  private readonly confirm = inject(ConfirmService);

  protected readonly actionLabels = ACTION_LABELS;
  protected readonly modes = signal<GovernanceModeDto[]>([]);
  protected readonly roles = signal<RoleDto[]>([]);
  protected readonly loadError = signal<ErrorText | null>(null);
  protected readonly saving = signal(false);
  protected readonly saveError = signal<ErrorText | null>(null);

  protected readonly form = new FormGroup({
    name: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.maxLength(200)] }),
    address: new FormControl('', { nonNullable: true, validators: [Validators.maxLength(500)] }),
    governanceMode: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
  });

  protected readonly canEdit = computed(() => this.ctx.can('BUILDING_SETTINGS'));
  protected readonly selectedMode = toSignal(this.form.controls.governanceMode.valueChanges, { initialValue: '' });
  protected readonly currentMode = computed(() => this.ctx.building()?.governanceMode ?? '');
  protected readonly matrix = computed(() => buildPolicyMatrix(this.modes(), this.roles()));

  /** Selected mode first, then the others, so the comparison reads left to right. */
  protected readonly orderedModes = computed(() => {
    const sel = this.selectedMode() || this.currentMode();
    return [...this.modes()].sort((a, b) => Number(b.code === sel) - Number(a.code === sel));
  });
  protected readonly roleNames = computed(() => new Map(this.roles().map((r) => [r.code, r.name])));

  /** Number of action/role cells that change if the selected mode is saved. */
  protected readonly changeCount = computed(() => {
    const sel = this.selectedMode();
    const cur = this.currentMode();
    if (!sel || sel === cur) return 0;
    const m = this.matrix();
    let n = 0;
    for (const a of m.actions) for (const r of m.roles) if (m.differs(sel, cur, a, r)) n++;
    return n;
  });

  constructor() {
    // (Re)fill the form whenever the building loads or is saved.
    effect(() => {
      const b = this.ctx.building();
      if (!b) return;
      untracked(() => {
        this.form.reset({ name: b.name, address: b.address ?? '', governanceMode: b.governanceMode });
        if (this.canEdit()) this.form.enable();
        else this.form.disable();
      });
    });
  }

  ngOnInit(): void {
    Promise.all([this.api.client.governance.modes(), this.api.client.governance.roles()]).then(
      ([modes, roles]) => {
        this.modes.set(modes);
        this.roles.set(roles);
      },
      (e) => this.loadError.set(describeError(e)),
    );
  }

  protected cellText(mode: string, action: Action, role: RoleCode): string {
    const scope = this.matrix().cell(mode, action, role);
    return scope === 'ANY' ? '✓' : scope === 'OWN_UNIT' ? 'own unit' : '';
  }

  /** Highlight cells in the selected mode that differ from the building's current mode. */
  protected changed(mode: string, action: Action, role: RoleCode): boolean {
    const cur = this.currentMode();
    return mode === this.selectedMode() && mode !== cur && this.matrix().differs(mode, cur, action, role);
  }

  protected modeName(code: string): string {
    return this.modes().find((m) => m.code === code)?.name ?? code;
  }

  protected async save(): Promise<void> {
    this.form.markAllAsTouched();
    const b = this.ctx.building();
    if (!b || this.form.invalid || this.saving()) return;
    const v = this.form.getRawValue();
    if (v.governanceMode !== b.governanceMode) {
      const ok = await this.confirm.ask({
        title: `Switch to “${this.modeName(v.governanceMode)}”?`,
        message: `This changes ${this.changeCount()} permission${this.changeCount() === 1 ? '' : 's'} for members of this building, effective immediately.`,
        confirmText: 'Switch mode',
      });
      if (!ok) return;
    }
    this.saving.set(true);
    this.saveError.set(null);
    try {
      const updated = await this.api.client.buildings.update(b.id, {
        name: v.name.trim(),
        address: v.address.trim() || null,
        governanceMode: v.governanceMode,
        version: b.version,
      });
      this.ctx.building.set(updated);
      this.toast.success('Settings saved');
      await Promise.all([this.ctx.refreshPermissions(), this.auth.loadMe().catch(() => undefined)]);
    } catch (e) {
      if (isConflict(e)) {
        // Refetch: the effect above refills the form with the latest values.
        try {
          this.ctx.building.set(await this.api.client.buildings.get(b.id));
          this.toast.info(CONFLICT_RELOADED, 'Review the settings and save again if needed.');
        } catch (e2) {
          this.toast.error(e2);
        }
        return;
      }
      applyServerErrors(this.form, e);
      this.saveError.set(describeError(e));
    } finally {
      this.saving.set(false);
    }
  }
}
