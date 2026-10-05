import { DatePipe } from '@angular/common';
import { Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { InvitationDto, MemberDto, RoleDto, UUID, formatInviteCode } from '@condo/shared';
import { ApiService } from '../core/api.service';
import { AuthService } from '../core/auth.service';
import { ConfirmService } from '../core/confirm.service';
import { applyServerErrors, CONFLICT_RELOADED, describeError, ErrorText, isConflict } from '../core/errors';
import { ToastService } from '../core/toast.service';
import { copyText } from '../shared/clipboard';
import { dateInputToInstant, instantToDateInput } from '../shared/dates';
import { grantableRoles, invitationStatusBadge, inviteTargets, localDateString, memberStatusBadge } from '../shared/invitations';
import { FieldErrorComponent } from '../shared/field-error.component';
import { BuildingContext } from './building-context.service';
import { InviteDialogComponent } from './invite-dialog.component';

@Component({
  selector: 'app-members-page',
  imports: [ReactiveFormsModule, DatePipe, FieldErrorComponent, InviteDialogComponent],
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
  protected readonly inviteTargets = computed(() => inviteTargets(this.ctx.perms(), this.ctx.spaces(), this.ctx.labels()));
  protected readonly canInvite = computed(() => this.inviteTargets().canInvite);

  /** Roles I may grant (rank ≤ mine). A hint: the server enforces ROLE_RANK_EXCEEDED. */
  protected readonly grantableRoles = computed(() => grantableRoles(this.roles(), this.ctx.perms()?.role));

  // ---------- invitations ----------
  protected readonly inviteOpen = signal(false);
  protected readonly invitations = signal<InvitationDto[]>([]);
  protected readonly invitationsLoading = signal(false);
  protected readonly invitationsError = signal<ErrorText | null>(null);
  protected readonly showAllInvitations = signal(false);
  protected readonly visibleInvitations = computed(() => {
    const list = [...this.invitations()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return this.showAllInvitations() ? list : list.filter((i) => i.status === 'ACTIVE');
  });
  protected readonly hiddenInvitationCount = computed(() => this.invitations().length - this.visibleInvitations().length);
  protected readonly formatCode = formatInviteCode;
  protected readonly invitationBadge = invitationStatusBadge;
  protected readonly memberBadge = memberStatusBadge;
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

  /** Editing an expired member: explain how to restore access. */
  protected readonly editingExpired = computed(() => {
    const m = this.members().find((x) => x.id === this.editingId());
    return !!m && this.memberBadge(m).label === 'Expired';
  });
  protected readonly today = localDateString(new Date());

  constructor() {
    effect(() => {
      const id = this.ctx.buildingId();
      if (id) untracked(() => void this.load(id));
    });
    effect(() => {
      const id = this.ctx.buildingId();
      const can = this.canInvite();
      if (id && can) untracked(() => void this.loadInvitations(id));
    });
  }

  protected isGrantable(role: string): boolean {
    return this.grantableRoles().some((r) => r.code === role);
  }

  /** Active and expired members can be edited (a new future end date restores an expired one); revoked can't. */
  protected canManage(m: MemberDto): boolean {
    return m.status !== 'REVOKED' && this.ctx.can('MEMBER_MANAGE', m.unitId);
  }

  protected isInactive(m: MemberDto): boolean {
    return this.memberBadge(m).label !== 'Active';
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
        version: m.version,
      });
      this.members.update((list) => list.map((x) => (x.id === updated.id ? updated : x)));
      this.editingId.set(null);
      this.toast.success(`Updated ${updated.displayName}`);
      if (m.userId === this.myUserId()) await this.selfChanged();
    } catch (e) {
      if (isConflict(e)) {
        await this.reloadAfterConflict(m.id);
        return;
      }
      applyServerErrors(this.form, e);
      this.editError.set(describeError(e));
    } finally {
      this.saving.set(false);
    }
  }

  /** 409 CONFLICT: refetch and reopen the editor on the latest version of the member. */
  private async reloadAfterConflict(memberId: UUID): Promise<void> {
    await this.load(this.ctx.buildingId()!);
    const fresh = this.members().find((x) => x.id === memberId);
    if (fresh && this.canManage(fresh)) this.startEdit(fresh);
    else this.editingId.set(null);
    this.toast.info(CONFLICT_RELOADED, 'Check the values and save again if needed.');
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

  // ---------- invitations ----------

  protected async loadInvitations(buildingId: UUID = this.ctx.buildingId()!): Promise<void> {
    this.invitationsLoading.set(true);
    this.invitationsError.set(null);
    try {
      this.invitations.set(await this.api.client.invitations.list(buildingId));
    } catch (e) {
      this.invitationsError.set(describeError(e));
    } finally {
      this.invitationsLoading.set(false);
    }
  }

  protected onInvited(inv: InvitationDto): void {
    this.invitations.update((list) => [inv, ...list.filter((i) => i.id !== inv.id)]);
  }

  protected async copyLink(inv: InvitationDto): Promise<void> {
    if (await copyText(inv.joinUrl)) this.toast.success('Link copied', this.formatCode(inv.code));
    else this.toast.info("Couldn't copy automatically", inv.joinUrl);
  }

  protected async revokeInvitation(inv: InvitationDto): Promise<void> {
    const ok = await this.confirm.ask({
      title: `Revoke invitation ${this.formatCode(inv.code)}?`,
      message: 'The code and link stop working immediately. People who already joined keep their access.',
      confirmText: 'Revoke',
      danger: true,
    });
    if (!ok) return;
    try {
      await this.api.client.invitations.revoke(this.ctx.buildingId()!, inv.id);
      this.toast.success('Invitation revoked');
    } catch (e) {
      this.toast.error(e);
    }
    await this.loadInvitations();
  }

  /** My own membership changed: permissions (and maybe access) changed with it. */
  private async selfChanged(): Promise<void> {
    await Promise.all([this.ctx.reload(), this.auth.loadMe().catch(() => undefined)]);
  }
}
