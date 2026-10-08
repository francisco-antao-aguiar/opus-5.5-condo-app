import { Component, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ChecklistItemDto, IssueDto, IssueStatus, IssueSummaryDto, MaintenancePlanDto, UUID } from '@condo/shared';
import { ApiService } from '../core/api.service';
import { CONFLICT_RELOADED, describeError, errorCode, ErrorText, isConflict } from '../core/errors';
import { ConfirmService } from '../core/confirm.service';
import { ToastService } from '../core/toast.service';
import { assetCodeIcon } from '../shared/assets';
import {
  MAX_PAGE_SIZE,
  checklistDoneText,
  checklistProgress,
  MAX_PHOTOS,
  STATUS_BADGE,
  detailTransitions,
  eventView,
  formatAge,
  formatAgo,
  pickPhotos,
  photoUrlExpired,
  statusLabel,
  transitionLabel,
} from '../shared/issues';
import { ModalComponent } from '../shared/modal.component';
import { formatLocalDate, todayIn } from '../shared/zoned';
import { BuildingContext } from './building-context.service';
import { CostsPanelComponent } from './costs-panel.component';
import { TransitionDialogComponent, TransitionRequest } from './transition-dialog.component';

@Component({
  selector: 'app-issue-detail-page',
  imports: [RouterLink, ModalComponent, TransitionDialogComponent, CostsPanelComponent],
  templateUrl: './issue-detail.page.html',
})
export class IssueDetailPage {
  protected readonly ctx = inject(BuildingContext);
  private readonly api = inject(ApiService);
  private readonly toast = inject(ToastService);
  private readonly confirm = inject(ConfirmService);

  /** Route param :issueId (component input binding). */
  readonly issueId = input.required<string>();

  protected readonly issue = signal<IssueDto | null>(null);
  /** The maintenance plan of a scheduled task (for its checklist). */
  protected readonly plan = signal<MaintenancePlanDto | null>(null);
  /** Checklist indexes with a tick request in flight. */
  protected readonly ticking = signal<ReadonlySet<number>>(new Set());
  protected readonly progress = checklistProgress;
  protected readonly doneText = (item: ChecklistItemDto) => checklistDoneText(item, this.ctx.building()?.timeZone);
  protected readonly today = computed(() => todayIn(this.ctx.building()?.timeZone ?? 'Europe/Lisbon'));
  protected readonly localDate = (d: string | null) => formatLocalDate(d);
  protected readonly loading = signal(true);
  protected readonly loadError = signal<ErrorText | null>(null);
  protected readonly busy = signal(false);
  protected readonly commentText = signal('');
  protected readonly photoErrors = signal<string[]>([]);
  protected readonly uploading = signal(0);
  protected readonly lightbox = signal<string | null>(null);

  protected readonly transition = signal<TransitionRequest | null>(null);
  protected readonly mergeOpen = signal(false);
  protected readonly mergeCandidates = signal<IssueSummaryDto[]>([]);
  protected readonly mergeFilter = signal('');
  protected readonly mergeTarget = signal<IssueSummaryDto | null>(null);
  protected readonly mergeComment = signal('');

  protected readonly statusLabel = statusLabel;
  protected readonly badge = STATUS_BADGE;
  protected readonly age = formatAge;
  protected readonly ago = formatAgo;
  protected readonly icon = assetCodeIcon;
  protected readonly maxPhotos = MAX_PHOTOS;

  protected readonly transitions = computed(() => {
    const i = this.issue();
    return i && !i.mergedIntoId ? detailTransitions(i.status, i.me.allowedTransitions) : [];
  });
  protected readonly events = computed(() => [...(this.issue()?.timeline ?? [])].map((e) => ({ e, v: eventView(e) })));
  protected readonly filteredCandidates = computed(() => {
    const q = this.mergeFilter().trim().toLowerCase().replace(/^#/, '');
    return this.mergeCandidates().filter(
      (c) => !q || String(c.number) === q || c.title.toLowerCase().includes(q) || (c.assetName ?? '').toLowerCase().includes(q) || c.locationLabel.toLowerCase().includes(q),
    );
  });

  private lastPhotoRefresh = 0;

  constructor() {
    effect(() => {
      const id = this.issueId();
      const b = this.ctx.buildingId();
      if (id && b) untracked(() => void this.load());
    });
  }

  private get bid(): UUID {
    return this.ctx.buildingId()!;
  }

  protected async load(): Promise<void> {
    this.loading.set(true);
    this.loadError.set(null);
    try {
      const issue = await this.api.client.issues.get(this.bid, this.issueId());
      this.issue.set(issue);
      if (issue.maintenancePlanId && issue.maintenancePlanId !== this.plan()?.id && this.ctx.has('MAINTENANCE_VIEW')) {
        this.api.client.maintenance.get(this.bid, issue.maintenancePlanId).then(
          (p) => this.plan.set(p),
          () => this.plan.set(null),
        );
      }
    } catch (e) {
      this.loadError.set(describeError(e));
    } finally {
      this.loading.set(false);
    }
  }

  /** Saves one checklist tick; the server's IssueDto (new version) becomes the state. No optimistic update. */
  protected async tick(index: number, done: boolean, box: HTMLInputElement): Promise<void> {
    if (this.ticking().has(index)) return;
    this.ticking.update((s) => new Set(s).add(index));
    try {
      this.issue.set(await this.api.client.issues.tickChecklist(this.bid, this.issueId(), index, { done }));
    } catch (e) {
      box.checked = !done; // undo the browser's own toggle; the refetch below has the truth
      const code = errorCode(e);
      if (isConflict(e)) this.toast.info('Someone else just updated this checklist — reloaded it.');
      else if (code === 'INVALID_STATE') this.toast.info('This task is closed, so its checklist can no longer change.');
      else this.toast.error(e);
      if (isConflict(e) || code === 'INVALID_STATE') await this.load();
    } finally {
      this.ticking.update((s) => {
        const n = new Set(s);
        n.delete(index);
        return n;
      });
    }
  }

  protected transitionLabel(to: IssueStatus): string {
    return transitionLabel(this.issue()!.status, to);
  }

  /** Runs an action returning the updated issue; maps the issue-specific conflicts to a refetch. */
  private async act(fn: () => Promise<IssueDto | void>, success?: string): Promise<boolean> {
    if (this.busy()) return false;
    this.busy.set(true);
    try {
      const updated = await fn();
      if (updated) this.issue.set(updated);
      if (success) this.toast.success(success);
      return true;
    } catch (e) {
      const code = errorCode(e);
      if (isConflict(e)) {
        this.toast.info(CONFLICT_RELOADED, 'Check the issue and try again if still needed.');
        await this.load();
      } else if (code === 'ISSUE_MERGED' || code === 'INVALID_TRANSITION') {
        this.toast.error(e);
        await this.load();
      } else {
        this.toast.error(e);
      }
      return false;
    } finally {
      this.busy.set(false);
    }
  }

  // ---------- status ----------

  protected openTransition(to: IssueStatus): void {
    const i = this.issue()!;
    this.transition.set({ issueId: i.id, number: i.number, title: i.title, from: i.status, to, version: i.version });
  }

  protected async applyTransition(comment: string | null): Promise<void> {
    const t = this.transition();
    if (!t) return;
    await this.act(
      () => this.api.client.issues.changeStatus(this.bid, t.issueId, { status: t.to, comment, version: t.version }),
      `Now ${statusLabel(t.to).toLowerCase()}`,
    );
    this.transition.set(null);
  }

  // ---------- comment / me too / sharing ----------

  protected async comment(): Promise<void> {
    const text = this.commentText().trim();
    if (!text) return;
    const ok = await this.act(() => this.api.client.issues.comment(this.bid, this.issueId(), { text }));
    if (ok) this.commentText.set('');
  }

  protected meToo(): Promise<boolean> {
    return this.act(() => this.api.client.issues.meToo(this.bid, this.issueId()), "Added you — you'll be kept in the loop");
  }

  protected withdraw(): Promise<boolean> {
    return this.act(() => this.api.client.issues.withdrawMeToo(this.bid, this.issueId()), 'You are no longer marked as affected');
  }

  protected setSharing(shared: boolean): Promise<boolean> {
    return this.act(
      () => this.api.client.issues.setSharing(this.bid, this.issueId(), { sharedWithAdmins: shared }),
      shared ? 'Shared with building management' : 'No longer shared with building management',
    );
  }

  // ---------- photos ----------

  protected async addPhotos(input: HTMLInputElement): Promise<void> {
    const files = [...(input.files ?? [])];
    input.value = '';
    const i = this.issue();
    if (!i || !files.length) return;
    const { accepted, errors } = pickPhotos(files, i.photos.length);
    this.photoErrors.set(errors);
    for (const idx of accepted) {
      const f = files[idx]!;
      const form = new FormData();
      form.append('file', f, f.name);
      this.uploading.update((n) => n + 1);
      try {
        await this.api.client.issues.uploadPhoto(this.bid, i.id, form);
      } catch (e) {
        this.photoErrors.update((list) => [...list, `${f.name}: ${describeError(e).title}`]);
      } finally {
        this.uploading.update((n) => n - 1);
      }
    }
    if (accepted.length) await this.load();
  }

  protected async deletePhoto(photoId: UUID): Promise<void> {
    const ok = await this.confirm.ask({
      title: 'Delete this photo?',
      message: 'It is removed from the issue for everyone. This cannot be undone.',
      confirmText: 'Delete',
      danger: true,
    });
    if (!ok) return;
    const done = await this.act(() => this.api.client.issues.deletePhoto(this.bid, this.issueId(), photoId), 'Photo deleted');
    if (done) await this.load();
  }

  /** Signed photo links expire after an hour: refetch the issue for fresh ones (at most every 30 s). */
  protected photoFailed(): void {
    const i = this.issue();
    if (!i || Date.now() - this.lastPhotoRefresh < 30_000) return;
    if (i.photos.some((p) => photoUrlExpired(p)) || this.lastPhotoRefresh === 0) {
      this.lastPhotoRefresh = Date.now();
      void this.load();
    }
  }

  protected openPhoto(url: string): void {
    const i = this.issue();
    const p = i?.photos.find((x) => x.url === url);
    if (p && photoUrlExpired(p)) {
      this.photoFailed();
      return;
    }
    this.lightbox.set(url);
  }

  // ---------- merge ----------

  protected async openMerge(): Promise<void> {
    this.mergeOpen.set(true);
    this.mergeTarget.set(null);
    this.mergeFilter.set('');
    this.mergeComment.set('');
    try {
      const page = await this.api.client.issues.list(this.bid, { view: 'triage', status: 'open', sort: 'recent', size: MAX_PAGE_SIZE });
      this.mergeCandidates.set(page.items.filter((c) => c.id !== this.issueId() && !c.mergedIntoId));
    } catch (e) {
      this.toast.error(e);
    }
  }

  protected async merge(): Promise<void> {
    const target = this.mergeTarget();
    if (!target) return;
    const ok = await this.act(
      () => this.api.client.issues.merge(this.bid, this.issueId(), { intoIssueId: target.id, comment: this.mergeComment().trim() || null }),
      `Merged into #${target.number}`,
    );
    if (ok) this.mergeOpen.set(false);
  }
}
