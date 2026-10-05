import { Component, computed, effect, inject, input, output, signal, untracked } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { AbstractControl, FormControl, FormGroup, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import { InvitationDto, RoleDto, UUID, formatInviteCode } from '@condo/shared';
import { ApiService } from '../core/api.service';
import { applyServerErrors, describeError, ErrorText } from '../core/errors';
import { ToastService } from '../core/toast.service';
import { copyText } from '../shared/clipboard';
import { FieldErrorComponent } from '../shared/field-error.component';
import {
  InviteFormValue,
  InviteTargets,
  InviteValidity,
  DEFAULT_DURATION_DAYS,
  DURATION_CHIPS,
  MAX_DURATION_DAYS,
  MAX_INVITE_DAYS,
  MembershipEnd,
  MAX_USES_LIMIT,
  NOTE_MAX,
  buildInvitationRequest,
  defaultInviteRole,
  invitationSummary,
  localDateString,
  maxInviteExpiry,
} from '../shared/invitations';
import { ModalComponent } from '../shared/modal.component';

/** "YYYY-MM-DD" must be today or later (and, with `max`, not after it). */
function dateRange(min: () => string, max?: () => string) {
  return (c: AbstractControl): ValidationErrors | null => {
    const v = c.value as string;
    if (!v) return null;
    if (v < min()) return { server: 'Pick today or a later date.' };
    if (max && v > max()) return { server: `Pick a date within ${MAX_INVITE_DAYS} days.` };
    return null;
  };
}

@Component({
  selector: 'app-invite-dialog',
  imports: [ReactiveFormsModule, ModalComponent, FieldErrorComponent],
  template: `
    <app-modal [title]="created() ? 'Invitation ready' : 'Invite people'" (closed)="closed.emit()">
      @if (created(); as inv) {
        <div class="invite-result">
          <p class="muted small">Share this code or link. Anyone who has it can join until it runs out.</p>
          <div class="invite-code" aria-label="Invitation code">{{ format(inv.code) }}</div>
          <p class="invite-summary">{{ summary() }}</p>
          @if (inv.note) {
            <p class="muted small">Note: {{ inv.note }}</p>
          }
          <div class="row gap wrap invite-copy">
            <button type="button" class="btn btn-primary" (click)="copy(inv.joinUrl, 'Link copied')">⧉ Copy link</button>
            <button type="button" class="btn" (click)="copy(format(inv.code), 'Code copied')">Copy code</button>
          </div>
          <p class="muted small invite-url">{{ inv.joinUrl }}</p>
        </div>
      } @else {
        <form [formGroup]="form" id="invite-form" (ngSubmit)="submit()" novalidate>
          <div class="grid-2">
            <label class="field">
              <span>Role</span>
              <select formControlName="role">
                @for (r of roles(); track r.code) {
                  <option [value]="r.code">{{ r.name }}</option>
                }
              </select>
              <app-field-error [control]="form.controls.role" label="Role" />
            </label>
            <label class="field">
              <span>Unit @if (targets().buildingWide) {<small class="muted">(optional)</small>}</span>
              <select formControlName="unitId">
                @if (targets().buildingWide) {
                  <option value="">— Whole building, no unit —</option>
                }
                @for (u of targets().units; track u.id) {
                  <option [value]="u.id">{{ u.label }}</option>
                }
              </select>
              @if (targets().lockedUnitId) {
                <small class="muted">You can invite people into your own unit.</small>
              }
              <app-field-error [control]="form.controls.unitId" label="Unit" />
            </label>
          </div>

          <fieldset class="field">
            <legend>Who is it for?</legend>
            <div class="row gap wrap">
              <label class="check"><input type="radio" formControlName="usage" value="single" /> <span>Single person</span></label>
              <label class="check"><input type="radio" formControlName="usage" value="multi" /> <span>Several people</span></label>
              @if (usage() === 'multi') {
                <label class="check">
                  <span>up to</span>
                  <input type="number" class="input-narrow" formControlName="maxUses" min="2" [max]="maxUsesLimit" aria-label="Maximum number of people" />
                  <span>people</span>
                </label>
              }
            </div>
            <app-field-error [control]="form.controls.maxUses" label="Number of people" />
          </fieldset>

          <div class="grid-2">
            <div class="field">
              <span id="invite-validity">Invitation valid for</span>
              <select aria-labelledby="invite-validity" formControlName="validity">
                <option value="1">1 day</option>
                <option value="7">7 days</option>
                <option value="30">30 days</option>
                <option value="custom">Until a date…</option>
              </select>
              @if (validity() === 'custom') {
                <input type="date" formControlName="expiresAt" [min]="today()" [max]="maxDate()" aria-label="Invitation valid until" />
              }
              <app-field-error [control]="form.controls.expiresAt" label="Valid until" />
            </div>
            <div class="field">
              <span id="invite-access">Access for whoever joins</span>
              <select aria-labelledby="invite-access" formControlName="membershipEnd">
                <option value="none">No end date</option>
                <option value="date">Until a date</option>
                <option value="days">For a number of days after joining</option>
              </select>
              @if (membershipEnd() === 'date') {
                <input type="date" formControlName="membershipExpiresAt" [min]="today()" aria-label="Access until" />
                <small class="muted">Access ends at the end of this day.</small>
              } @else if (membershipEnd() === 'days') {
                <div class="row gap wrap">
                  <input type="number" class="input-narrow" formControlName="membershipDurationDays" min="1" [max]="maxDurationDays" aria-label="Days of access after joining" />
                  <span class="muted small">days after joining</span>
                </div>
                <div class="chips">
                  @for (d of durationChips; track d) {
                    <button type="button" class="chip btn-sm" [class.selected]="form.controls.membershipDurationDays.value === d" (click)="form.controls.membershipDurationDays.setValue(d)">{{ d }} day{{ d === 1 ? '' : 's' }}</button>
                  }
                </div>
              }
              @if (role() === 'TENANT' && membershipEnd() !== 'date') {
                <small class="muted">Tip: for a tenant, “Until a date” fits a lease — e.g. the end of the lease.</small>
              }
              <app-field-error [control]="form.controls.membershipExpiresAt" label="Membership end date" />
              <app-field-error [control]="form.controls.membershipDurationDays" label="Days of access" />
            </div>
          </div>

          <label class="field">
            <span>Note <small class="muted">(optional, only visible to people who manage invitations)</small></span>
            <input type="text" formControlName="note" [maxlength]="noteMax" placeholder="e.g. New tenant, Maria" />
            <app-field-error [control]="form.controls.note" label="Note" />
          </label>

          @if (error(); as e) {
            <div class="alert alert-error" role="alert"><strong>{{ e.title }}</strong>@if (e.detail) {<p>{{ e.detail }}</p>}</div>
          }
        </form>
      }

      <div modal-footer>
        @if (created()) {
          <button type="button" class="btn" (click)="reset()">Create another</button>
          <button type="button" class="btn btn-primary" (click)="closed.emit()">Done</button>
        } @else {
          <button type="button" class="btn" (click)="closed.emit()">Cancel</button>
          <button type="submit" form="invite-form" class="btn btn-primary" [disabled]="busy()">{{ busy() ? 'Creating…' : 'Create invitation' }}</button>
        }
      </div>
    </app-modal>
  `,
})
export class InviteDialogComponent {
  private readonly api = inject(ApiService);
  private readonly toast = inject(ToastService);

  readonly buildingId = input.required<UUID>();
  /** Roles I may grant (rank ≤ mine), highest first. */
  readonly roles = input.required<RoleDto[]>();
  readonly targets = input.required<InviteTargets>();
  readonly roleNames = input<ReadonlyMap<string, string>>(new Map());
  readonly closed = output<void>();
  readonly invited = output<InvitationDto>();

  protected readonly maxUsesLimit = MAX_USES_LIMIT;
  protected readonly noteMax = NOTE_MAX;
  protected readonly maxDurationDays = MAX_DURATION_DAYS;
  protected readonly durationChips = DURATION_CHIPS;
  protected readonly format = formatInviteCode;
  protected readonly busy = signal(false);
  protected readonly error = signal<ErrorText | null>(null);
  protected readonly created = signal<InvitationDto | null>(null);

  protected readonly today = signal(localDateString(new Date()));
  protected readonly maxDate = signal(localDateString(maxInviteExpiry(new Date())));

  protected readonly form = new FormGroup({
    role: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    unitId: new FormControl('', { nonNullable: true }),
    usage: new FormControl<'single' | 'multi'>('single', { nonNullable: true }),
    maxUses: new FormControl(10, { nonNullable: true, validators: [Validators.required, Validators.min(2), Validators.max(MAX_USES_LIMIT)] }),
    validity: new FormControl<InviteValidity>('7', { nonNullable: true }),
    expiresAt: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, dateRange(() => this.today(), () => this.maxDate())],
    }),
    membershipEnd: new FormControl<MembershipEnd>('none', { nonNullable: true }),
    membershipExpiresAt: new FormControl('', { nonNullable: true, validators: [Validators.required, dateRange(() => this.today())] }),
    membershipDurationDays: new FormControl(DEFAULT_DURATION_DAYS, {
      nonNullable: true,
      validators: [Validators.required, Validators.min(1), Validators.max(MAX_DURATION_DAYS)],
    }),
    note: new FormControl('', { nonNullable: true, validators: [Validators.maxLength(NOTE_MAX)] }),
  });

  protected readonly usage = toSignal(this.form.controls.usage.valueChanges, { initialValue: this.form.controls.usage.value });
  protected readonly validity = toSignal(this.form.controls.validity.valueChanges, { initialValue: this.form.controls.validity.value });
  protected readonly membershipEnd = toSignal(this.form.controls.membershipEnd.valueChanges, {
    initialValue: this.form.controls.membershipEnd.value,
  });
  protected readonly role = toSignal(this.form.controls.role.valueChanges, { initialValue: this.form.controls.role.value });

  protected readonly summary = computed(() => {
    const inv = this.created();
    return inv ? invitationSummary(inv, this.roleNames().get(inv.role) ?? inv.role) : '';
  });

  constructor() {
    // Only validate the controls that are in use.
    this.form.controls.maxUses.disable();
    this.form.controls.expiresAt.disable();
    this.form.controls.membershipExpiresAt.disable();
    this.form.controls.membershipDurationDays.disable();
    this.form.controls.membershipEnd.valueChanges.subscribe((e) => {
      this.toggle(this.form.controls.membershipExpiresAt, e === 'date');
      this.toggle(this.form.controls.membershipDurationDays, e === 'days');
    });
    this.form.controls.usage.valueChanges.subscribe((u) => this.toggle(this.form.controls.maxUses, u === 'multi'));
    this.form.controls.validity.valueChanges.subscribe((v) => this.toggle(this.form.controls.expiresAt, v === 'custom'));

    effect(() => {
      const roles = this.roles();
      const targets = this.targets();
      untracked(() => this.applyDefaults(roles, targets));
    });
  }

  private toggle(c: AbstractControl, on: boolean): void {
    if (on) c.enable();
    else c.disable();
  }

  private applyDefaults(roles: RoleDto[], targets: InviteTargets): void {
    if (!roles.some((r) => r.code === this.form.controls.role.value)) {
      this.form.controls.role.setValue(defaultInviteRole(roles));
    }
    const unit = this.form.controls.unitId;
    if (targets.lockedUnitId) {
      unit.setValue(targets.lockedUnitId);
      unit.disable();
    } else {
      unit.enable();
      if (!targets.buildingWide && !unit.value) unit.setValue(targets.units[0]?.id ?? '');
    }
  }

  protected reset(): void {
    this.created.set(null);
    this.error.set(null);
    this.form.reset();
    this.applyDefaults(this.roles(), this.targets());
  }

  protected async submit(): Promise<void> {
    this.form.markAllAsTouched();
    if (this.form.invalid || this.busy()) return;
    this.busy.set(true);
    this.error.set(null);
    try {
      const v = this.form.getRawValue() as InviteFormValue;
      const inv = await this.api.client.invitations.create(this.buildingId(), buildInvitationRequest(v));
      this.created.set(inv);
      this.invited.emit(inv);
    } catch (e) {
      const unmatched = applyServerErrors(this.form, e);
      const err = describeError(e);
      this.error.set(unmatched.length ? { title: err.title, detail: unmatched.join(' · ') } : err);
    } finally {
      this.busy.set(false);
    }
  }

  protected async copy(text: string, done: string): Promise<void> {
    if (await copyText(text)) this.toast.success(done);
    else this.toast.info("Couldn't copy automatically", text);
  }
}
