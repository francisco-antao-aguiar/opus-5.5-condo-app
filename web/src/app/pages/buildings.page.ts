import { NgTemplateOutlet } from '@angular/common';
import { Component, computed, inject, OnInit, signal, viewChild } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { BuildingDto, GovernanceModeDto } from '@condo/shared';
import { map } from 'rxjs';
import { ApiService } from '../core/api.service';
import { AuthService } from '../core/auth.service';
import { applyServerErrors, describeError, ErrorText } from '../core/errors';
import { extractInviteCode } from '../shared/invitations';
import { ToastService } from '../core/toast.service';
import { FieldErrorComponent } from '../shared/field-error.component';
import { StructureWizardComponent } from '../shared/structure-wizard.component';

interface BuildingCard {
  id: string;
  name: string;
  address: string | null;
  role: string | null;
  unitName: string | null;
  expiresAt: string | null;
}

@Component({
  selector: 'app-buildings-page',
  imports: [ReactiveFormsModule, RouterLink, NgTemplateOutlet, FieldErrorComponent, StructureWizardComponent],
  template: `
    <ng-template #joinForm let-big>
      <form class="join-form" [class.join-form-big]="big" (submit)="$event.preventDefault(); join()" novalidate>
        <label class="sr-only" [for]="big ? 'join-code-big' : 'join-code'">Invitation code</label>
        <input
          [id]="big ? 'join-code-big' : 'join-code'"
          type="text"
          class="code-input"
          [formControl]="joinCtl"
          placeholder="ABCD-EFGH"
          autocomplete="off"
          autocapitalize="characters"
          spellcheck="false"
          maxlength="200"
        />
        <button type="submit" class="btn" [class.btn-primary]="big" [disabled]="!joinCode()">Go</button>
      </form>
    </ng-template>

    <div class="page-head">
      <h1>My buildings</h1>
      <div class="row gap wrap">
        @if (cards().length) {
          <div class="row gap join-inline">
            <span class="muted small">Got an invite code?</span>
            <ng-container *ngTemplateOutlet="joinForm; context: { $implicit: false }" />
          </div>
        }
        @if (!showCreate()) {
          <button type="button" class="btn btn-primary" (click)="openCreate()">＋ Create building</button>
        }
      </div>
    </div>

    @if (!loading() && !loadError() && cards().length === 0) {
      <section class="card join-empty">
        <h2>You're not in any building yet — got an invite code?</h2>
        <p class="muted">Paste the code or link someone sent you, like <code class="code">ABCD-EFGH</code>.</p>
        <ng-container *ngTemplateOutlet="joinForm; context: { $implicit: true }" />
        <p class="muted small">No invitation? Create your own building below.</p>
      </section>
    }

    @if (loadError(); as e) {
      <div class="alert alert-error" role="alert">
        <strong>{{ e.title }}</strong>@if (e.detail) {<p>{{ e.detail }}</p>}
        <button type="button" class="btn btn-sm" (click)="load()">Retry</button>
      </div>
    }

    @if (showCreate()) {
      <section class="card">
        <h2>Create building</h2>
        <form [formGroup]="form" (ngSubmit)="create()" novalidate>
          <div class="grid-2">
            <label class="field">
              <span>Name</span>
              <input type="text" formControlName="name" placeholder="Rua das Flores 12" />
              <app-field-error [control]="form.controls.name" label="Name" />
            </label>
            <label class="field">
              <span>Address <small class="muted">(optional)</small></span>
              <input type="text" formControlName="address" />
              <app-field-error [control]="form.controls.address" label="Address" />
            </label>
          </div>

          <fieldset class="field">
            <legend>Governance mode</legend>
            @if (modes().length) {
              <div class="mode-options">
                @for (m of modes(); track m.code) {
                  <label class="mode-option" [class.selected]="form.controls.governanceMode.value === m.code">
                    <input type="radio" formControlName="governanceMode" [value]="m.code" />
                    <span><strong>{{ m.name }}</strong><small>{{ m.description }}</small></span>
                  </label>
                }
              </div>
            } @else {
              <p class="muted">Loading modes…</p>
            }
          </fieldset>

          <label class="check">
            <input type="checkbox" formControlName="quickSetup" />
            <span>Quick setup: generate floors, units and common areas now</span>
          </label>
          @if (form.controls.quickSetup.value) {
            <div class="subcard"><app-structure-wizard /></div>
          }

          @if (createError(); as e) {
            <div class="alert alert-error" role="alert"><strong>{{ e.title }}</strong>@if (e.detail) {<p>{{ e.detail }}</p>}</div>
          }
          <div class="actions">
            <button type="button" class="btn" (click)="showCreate.set(false)">Cancel</button>
            <button type="submit" class="btn btn-primary" [disabled]="creating()">{{ creating() ? 'Creating…' : 'Create building' }}</button>
          </div>
        </form>
      </section>
    }

    @if (loading()) {
      <p class="muted">Loading…</p>
    } @else if (cards().length === 0 && !loadError()) {
      <!-- Empty state is the "join with a code" card at the top. -->
    } @else {
      <div class="cards">
        @for (b of cards(); track b.id) {
          <a class="card building-card" [routerLink]="['/buildings', b.id]">
            <h3>{{ b.name }}</h3>
            <p class="muted">{{ b.address || 'No address' }}</p>
            <div class="row gap wrap">
              @if (b.role) {
                <span class="badge badge-role">{{ b.role }}</span>
              }
              @if (b.unitName) {
                <span class="badge">Unit {{ b.unitName }}</span>
              }
              @if (b.expiresAt) {
                <span class="badge badge-warn">until {{ b.expiresAt.slice(0, 10) }}</span>
              }
            </div>
          </a>
        }
      </div>
    }
  `,
})
export class BuildingsPage implements OnInit {
  private readonly api = inject(ApiService);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);
  private readonly wizard = viewChild(StructureWizardComponent);

  protected readonly buildings = signal<BuildingDto[]>([]);
  protected readonly modes = signal<GovernanceModeDto[]>([]);
  protected readonly loading = signal(true);
  protected readonly loadError = signal<ErrorText | null>(null);
  protected readonly showCreate = signal(false);
  protected readonly creating = signal(false);
  protected readonly createError = signal<ErrorText | null>(null);

  protected readonly joinCtl = new FormControl('', { nonNullable: true });
  protected readonly joinCode = toSignal(this.joinCtl.valueChanges.pipe(map(extractInviteCode)), { initialValue: '' });

  protected readonly form = new FormGroup({
    name: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.maxLength(200)] }),
    address: new FormControl('', { nonNullable: true, validators: [Validators.maxLength(500)] }),
    governanceMode: new FormControl('MANAGED', { nonNullable: true, validators: [Validators.required] }),
    quickSetup: new FormControl(true, { nonNullable: true }),
  });

  /** Buildings from /buildings, enriched with my role from /me memberships. */
  protected readonly cards = computed<BuildingCard[]>(() => {
    const byBuilding = new Map(this.auth.memberships().map((m) => [m.buildingId, m]));
    const list = this.buildings();
    const fromList = list.map((b) => {
      const m = byBuilding.get(b.id);
      return { id: b.id, name: b.name, address: b.address, role: m?.role ?? null, unitName: m?.unitName ?? null, expiresAt: m?.expiresAt ?? null };
    });
    // Memberships not (yet) in the list, e.g. if /buildings failed.
    const known = new Set(list.map((b) => b.id));
    const extra = [...byBuilding.values()]
      .filter((m) => !known.has(m.buildingId))
      .map((m) => ({ id: m.buildingId, name: m.buildingName, address: null, role: m.role, unitName: m.unitName, expiresAt: m.expiresAt }));
    return [...fromList, ...extra].sort((a, b) => a.name.localeCompare(b.name));
  });

  ngOnInit(): void {
    void this.load();
  }

  protected async load(): Promise<void> {
    this.loading.set(true);
    this.loadError.set(null);
    try {
      const [buildings] = await Promise.all([this.api.client.buildings.list(), this.auth.loadMe()]);
      this.buildings.set(buildings);
      if (buildings.length === 0) this.openCreate();
    } catch (e) {
      this.loadError.set(describeError(e));
    } finally {
      this.loading.set(false);
    }
  }

  /** Accepts "abcd-efgh", "ABCDEFGH" or a pasted join link. */
  protected join(): void {
    const code = this.joinCode();
    if (code) void this.router.navigate(['/join', code]);
  }

  protected openCreate(): void {
    this.showCreate.set(true);
    if (!this.modes().length) {
      this.api.client.governance.modes().then(
        (modes) => {
          this.modes.set(modes);
          if (!modes.some((m) => m.code === this.form.controls.governanceMode.value) && modes[0]) {
            this.form.controls.governanceMode.setValue(modes[0].code);
          }
        },
        (e) => this.toast.error(e),
      );
    }
  }

  protected async create(): Promise<void> {
    this.form.markAllAsTouched();
    const wizard = this.form.controls.quickSetup.value ? this.wizard() : undefined;
    wizard?.markAllTouched();
    if (this.form.invalid || (wizard && !wizard.valid()) || this.creating()) return;

    this.creating.set(true);
    this.createError.set(null);
    const v = this.form.getRawValue();
    try {
      const building = await this.api.client.buildings.create({
        name: v.name.trim(),
        address: v.address.trim() || null,
        governanceMode: v.governanceMode,
        structure: wizard ? wizard.request() : null,
      });
      await this.auth.loadMe().catch(() => undefined);
      this.toast.success(`“${building.name}” created`);
      await this.router.navigate(['/buildings', building.id, 'structure']);
    } catch (e) {
      applyServerErrors(this.form, e);
      if (wizard) {
        // Wizard fields come back as "structure.floors" etc.
        applyServerErrors(wizard.form, e, 'structure.');
      }
      this.createError.set(describeError(e));
    } finally {
      this.creating.set(false);
    }
  }
}
