import { DatePipe, TitleCasePipe } from '@angular/common';
import { Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MemberDto, RoleDto, UUID } from '@condo/shared';
import { ApiService } from '../core/api.service';
import { AuthService } from '../core/auth.service';
import { ConfirmService } from '../core/confirm.service';
import { applyServerErrors, describeError, ErrorText } from '../core/errors';
import { ToastService } from '../core/toast.service';
import { dateInputToInstant, instantToDateInput } from '../shared/dates';
import { FieldErrorComponent } from '../shared/field-error.component';
import { BuildingContext } from './building-context.service';

@Component({
  selector: 'app-members-page',
  imports: [ReactiveFormsModule, DatePipe, TitleCasePipe, FieldErrorComponent],
  templateUrl: './members.page.html',
})
export class MembersPage {
  protected readonly ctx = inject(BuildingContext);
  private readonly api = inject(ApiService);
  private readonly auth = inject(AuthService);
  private readonly toast = inject(ToastService);
  private readonly confirm = inject(ConfirmService);

  protected readonly members = signal<MemberDto[]>([]);
  protected readonly roles = signal<RoleDto[]>([]);
  protected readonly loading = signal(true);
  protected readonly loadError = signal<ErrorText | null>(null);
  protected readonly editingId = signal<UUID | null>(null);
  protected readonly saving = signal(false);
  protected readonly editError = signal<ErrorText | null>(null);

  protected readonly form = new FormGroup({
    role: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    unitId: new FormControl<string>('', { nonNullable: true }),
    expiresAt: new FormControl('', { nonNullable: true }),
  });

  protected readonly myUserId = computed(() => this.auth.user()?.id ?? null);
  protected readonly canInvite = computed(() => this.ctx.can('MEMBER_INVITE'));

  /** Roles I may grant (rank ≤ mine). A hint: the server enforces ROLE_RANK_EXCEEDED. */
  protected readonly grantableRoles = computed(() => {
    const roles = [...this.roles()].sort((a, b) => b.rank - a.rank);
    const mine = roles.find((r) => r.code === this.ctx.perms()?.role);
    return mine ? roles.filter((r) => r.rank <= mine.rank) : roles;
  });
  protected readonly roleNames = computed(() => new Map(this.roles().map((r) => [r.code, r.name])));

  protected readonly sorted = computed(() => {
    const rank = new Map(this.roles().map((r) => [r.code, r.rank]));
    return [...this.members()].sort(
      (a, b) =>
        Number(a.status !== 'ACTIVE') - Number(b.status !== 'ACTIVE') ||
        (rank.get(b.role) ?? 0) - (rank.get(a.role) ?? 0) ||
        a.displayName.localeCompare(b.displayName),
    );
  });

  constructor() {
    effect(() => {
      const id = this.ctx.buildingId();
      if (id) untracked(() => void this.load(id));
    });
  }

  protected isGrantable(role: string): boolean {
    return this.grantableRoles().some((r) => r.code === role);
  }

  protected canManage(m: MemberDto): boolean {
    return m.status === 'ACTIVE' && this.ctx.can('MEMBER_MANAGE', m.unitId);
  }

  protected isExpired(m: MemberDto): boolean {
    return !!m.expiresAt && new Date(m.expiresAt).getTime() < Date.now();
  }

  protected async load(buildingId: UUID): Promise<void> {
    this.loading.set(true);
    this.loadError.set(null);
    try {
      const [members, roles] = await Promise.all([
        this.api.client.members.list(buildingId),
        this.roles().length ? Promise.resolve(this.roles()) : this.api.client.governance.roles(),
      ]);
      this.members.set(members);
      this.roles.set(roles);
    } catch (e) {
      this.loadError.set(describeError(e));
    } finally {
      this.loading.set(false);
    }
  }

  protected startEdit(m: MemberDto): void {
    this.editError.set(null);
    this.form.reset({ role: m.role, unitId: m.unitId ?? '', expiresAt: instantToDateInput(m.expiresAt) });
    this.editingId.set(m.id);
  }

  protected cancelEdit(): void {
    this.editingId.set(null);
    this.editError.set(null);
  }

  protected async save(m: MemberDto): Promise<void> {
    this.form.markAllAsTouched();
    if (this.form.invalid || this.saving()) return;
    const v = this.form.getRawValue();
    this.saving.set(true);
    this.editError.set(null);
    try {
      const updated = await this.api.client.members.update(this.ctx.buildingId()!, m.id, {
        role: v.role,
        unitId: v.unitId || null,
        expiresAt: dateInputToInstant(v.expiresAt),
      });
      this.members.update((list) => list.map((x) => (x.id === updated.id ? updated : x)));
      this.editingId.set(null);
      this.toast.success(`Updated ${updated.displayName}`);
      if (m.userId === this.myUserId()) await this.selfChanged();
    } catch (e) {
      applyServerErrors(this.form, e);
      this.editError.set(describeError(e));
    } finally {
      this.saving.set(false);
    }
  }

  protected async revoke(m: MemberDto): Promise<void> {
    const self = m.userId === this.myUserId();
    const ok = await this.confirm.ask({
      title: self ? 'Leave this building?' : `Revoke ${m.displayName}'s access?`,
      message: self
        ? 'You will immediately lose access to this building.'
        : 'They lose access immediately. You can invite them again later.',
      confirmText: self ? 'Leave' : 'Revoke',
      danger: true,
    });
    if (!ok) return;
    try {
      await this.api.client.members.revoke(this.ctx.buildingId()!, m.id);
      this.toast.success(self ? 'You left the building' : `Revoked ${m.displayName}`);
      this.editingId.set(null);
      if (self) {
        await this.selfChanged();
        return;
      }
      await this.load(this.ctx.buildingId()!);
    } catch (e) {
      this.toast.error(e);
    }
  }

  /** My own membership changed: permissions (and maybe access) changed with it. */
  private async selfChanged(): Promise<void> {
    await Promise.all([this.ctx.reload(), this.auth.loadMe().catch(() => undefined)]);
  }
}
