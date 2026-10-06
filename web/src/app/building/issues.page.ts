import { Component, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { IssueDashboard, IssueKind, IssueQuery, IssueStatus, IssueSummaryDto, UUID } from '@condo/shared';
import { ApiService } from '../core/api.service';
import { CONFLICT_RELOADED, describeError, ErrorText, isConflict } from '../core/errors';
import { ToastService } from '../core/toast.service';
import { assetCodeIcon } from '../shared/assets';
import {
  ISSUE_STATUSES,
  MAX_PAGE_SIZE,
  IssueTab,
  STATUS_BADGE,
  availableTabs,
  boardTransitions,
  formatAge,
  formatAgo,
  statusLabel,
  statusParam,
  stuckLabel,
  transitionLabel,
} from '../shared/issues';
import { formatLocalDate } from '../shared/zoned';
import { BuildingContext } from './building-context.service';
import { TransitionDialogComponent, TransitionRequest } from './transition-dialog.component';

const PAGE_SIZE = 25;
const TAB_LABELS: Record<IssueTab, string> = { shared: 'Building', mine: 'Mine', unit: 'My unit', triage: 'Triage' };

@Component({
  selector: 'app-issues-page',
  imports: [RouterLink, TransitionDialogComponent],
  templateUrl: './issues.page.html',
})
export class IssuesPage {
  protected readonly ctx = inject(BuildingContext);
  private readonly api = inject(ApiService);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);

  /** Query params (component input binding). */
  readonly view = input<string>();
  readonly space = input<string>();
  readonly asset = input<string>();
  /** ?kind=REPORTED|SCHEDULED (empty = both). */
  readonly kind = input<string>();

  protected readonly tabLabels = TAB_LABELS;
  protected readonly statuses = ISSUE_STATUSES;
  protected readonly statusLabel = statusLabel;
  protected readonly badge = STATUS_BADGE;
  protected readonly age = formatAge;
  protected readonly ago = formatAgo;
  protected readonly icon = assetCodeIcon;
  protected readonly transitionLabel = transitionLabel;
  protected readonly boardTransitions = boardTransitions;
  protected readonly maxPage = MAX_PAGE_SIZE;

  protected readonly tabs = computed(() => availableTabs(this.ctx.perms()));
  protected readonly tab = computed<IssueTab>(() => {
    const v = this.view() as IssueTab;
    const tabs = this.tabs();
    if (tabs.includes(v)) return v;
    return tabs.includes('triage') ? 'triage' : 'shared';
  });
  protected readonly status = signal('open');
  protected readonly sort = signal<'urgency' | 'recent'>('urgency');
  protected readonly page = signal(0);
  protected readonly mode = signal<'list' | 'board'>('list');
  protected readonly isBoard = computed(() => this.tab() === 'triage' && this.mode() === 'board');

  protected readonly items = signal<IssueSummaryDto[]>([]);
  protected readonly total = signal(0);
  protected readonly loading = signal(true);
  protected readonly loadError = signal<ErrorText | null>(null);
  protected readonly board = signal<Record<IssueStatus, IssueSummaryDto[]>>({ REPORTED: [], ACKNOWLEDGED: [], IN_PROGRESS: [], RESOLVED: [] });
  protected readonly dashboard = signal<IssueDashboard | null>(null);

  protected readonly transition = signal<TransitionRequest | null>(null);
  protected readonly transitioning = signal(false);

  protected readonly pages = computed(() => Math.max(1, Math.ceil(this.total() / PAGE_SIZE)));
  protected readonly canReviewOther = computed(() => this.ctx.can('CATALOG_EDIT'));
  protected readonly filterSpaceName = computed(() => (this.space() ? (this.ctx.spaceById().get(this.space()!)?.name ?? 'a space') : ''));
  private loadSeq = 0;

  /** List query from the current tab, filters and page. */
  protected readonly query = computed<IssueQuery>(() => ({
    view: this.tab(),
    status: statusParam(this.status()),
    sort: this.sort(),
    page: this.page(),
    size: PAGE_SIZE,
    ...(this.space() ? { spaceId: this.space() } : {}),
    ...(this.asset() ? { assetId: this.asset() } : {}),
    ...(this.kindFilter() ? { kind: this.kindFilter() as IssueKind } : {}),
  }));

  protected readonly kindFilter = computed<IssueKind | ''>(() => (this.kind() === 'REPORTED' || this.kind() === 'SCHEDULED' ? this.kind() as IssueKind : ''));
  protected readonly dueDate = (d: string | null) => (d ? formatLocalDate(d, { day: 'numeric', month: 'short' }) : '');

  constructor() {
    effect(() => {
      const id = this.ctx.buildingId();
      const q = this.query();
      const board = this.isBoard();
      if (id) untracked(() => void (board ? this.loadBoard(id) : this.loadList(id, q)));
    });
    effect(() => {
      const id = this.ctx.buildingId();
      if (id && this.tab() === 'triage') untracked(() => void this.loadDashboard(id));
    });
  }

  private async loadList(buildingId: UUID, q: IssueQuery): Promise<void> {
    const seq = ++this.loadSeq;
    this.loading.set(true);
    this.loadError.set(null);
    try {
      const res = await this.api.client.issues.list(buildingId, q);
      if (seq !== this.loadSeq) return;
      this.items.set(res.items);
      this.total.set(res.total);
    } catch (e) {
      if (seq === this.loadSeq) this.loadError.set(describeError(e));
    } finally {
      if (seq === this.loadSeq) this.loading.set(false);
    }
  }

  /** Board: all open issues by urgency, plus the latest resolved ones. */
  private async loadBoard(buildingId: UUID): Promise<void> {
    const seq = ++this.loadSeq;
    this.loading.set(true);
    this.loadError.set(null);
    const extra: IssueQuery = {
      ...(this.space() ? { spaceId: this.space() } : {}),
      ...(this.asset() ? { assetId: this.asset() } : {}),
      ...(this.kindFilter() ? { kind: this.kindFilter() as IssueKind } : {}),
    };
    try {
      const c = this.api.client.issues;
      const [open, resolved] = await Promise.all([
        c.list(buildingId, { view: 'triage', status: 'open', sort: 'urgency', size: MAX_PAGE_SIZE, ...extra }),
        c.list(buildingId, { view: 'triage', status: 'RESOLVED', sort: 'recent', size: 20, ...extra }),
      ]);
      if (seq !== this.loadSeq) return;
      const cols: Record<IssueStatus, IssueSummaryDto[]> = { REPORTED: [], ACKNOWLEDGED: [], IN_PROGRESS: [], RESOLVED: resolved.items };
      for (const i of open.items) cols[i.status]?.push(i);
      this.board.set(cols);
      this.total.set(open.total);
    } catch (e) {
      if (seq === this.loadSeq) this.loadError.set(describeError(e));
    } finally {
      if (seq === this.loadSeq) this.loading.set(false);
    }
  }

  private async loadDashboard(buildingId: UUID): Promise<void> {
    try {
      this.dashboard.set(await this.api.client.issues.dashboard(buildingId));
    } catch {
      this.dashboard.set(null); // not essential: the list still works
    }
  }

  protected reload(): void {
    const id = this.ctx.buildingId();
    if (!id) return;
    if (this.isBoard()) void this.loadBoard(id);
    else void this.loadList(id, this.query());
    if (this.tab() === 'triage') void this.loadDashboard(id);
  }

  protected setTab(t: IssueTab): void {
    this.page.set(0);
    void this.router.navigate([], { queryParams: { view: t }, queryParamsHandling: 'merge' });
  }

  protected setStatus(s: string): void {
    this.page.set(0);
    this.status.set(s);
  }

  protected setKind(k: string): void {
    this.page.set(0);
    void this.router.navigate([], { queryParams: { kind: k || null }, queryParamsHandling: 'merge' });
  }

  protected clearPlaceFilter(): void {
    void this.router.navigate([], { queryParams: { space: null, asset: null }, queryParamsHandling: 'merge' });
  }

  protected openTransition(i: IssueSummaryDto, to: IssueStatus, ev: Event): void {
    ev.stopPropagation();
    ev.preventDefault();
    this.transition.set({ issueId: i.id, number: i.number, title: i.title, from: i.status, to, version: i.version });
  }

  protected async applyTransition(comment: string | null): Promise<void> {
    const t = this.transition();
    if (!t || this.transitioning()) return;
    this.transitioning.set(true);
    try {
      await this.api.client.issues.changeStatus(this.ctx.buildingId()!, t.issueId, { status: t.to, comment, version: t.version });
      this.toast.success(`#${t.number} → ${statusLabel(t.to)}`);
      this.transition.set(null);
    } catch (e) {
      // Stale card: the finally block refetches the board/list with the latest version of every issue.
      if (isConflict(e)) this.toast.info(CONFLICT_RELOADED, `#${t.number} changed in the meantime — check it and try again.`);
      else this.toast.error(e);
      this.transition.set(null);
    } finally {
      this.transitioning.set(false);
      this.reload();
    }
  }

  /** The server may omit statuses with zero issues. */
  protected countOf(d: IssueDashboard, s: IssueStatus): number {
    return (d.counts as Partial<Record<IssueStatus, number>>)[s] ?? 0;
  }

  protected stuckLabel(hours: number): string {
    return stuckLabel(hours);
  }
}
