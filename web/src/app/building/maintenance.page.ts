import { Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AssetDto, MaintenancePlanDto, UUID } from '@condo/shared';
import { ApiService } from '../core/api.service';
import { CONFLICT_RELOADED, describeError, ErrorText, isConflict } from '../core/errors';
import { ToastService } from '../core/toast.service';
import { spacesInTreeOrder } from '../shared/assets';
import { formatLocalDate, todayIn } from '../shared/zoned';
import { BuildingContext } from './building-context.service';
import { PlanDialogComponent } from './plan-dialog.component';

@Component({
  selector: 'app-maintenance-page',
  imports: [RouterLink, PlanDialogComponent],
  template: `
    <div class="page-head">
      <h1>Maintenance</h1>
      <div class="row gap wrap">
        <a class="btn" [routerLink]="['/buildings', ctx.buildingId(), 'issues']" [queryParams]="{ view: 'triage', kind: 'SCHEDULED' }">🛠 Open tasks</a>
        @if (canManage()) {
          <button type="button" class="btn btn-primary" (click)="editing.set('new')">＋ New plan</button>
        }
      </div>
    </div>
    <p class="muted small">
      Recurring jobs — inspections, cleaning, bulb changes. Each due date becomes a task in Issues
      (dates in {{ tz() }}).
    </p>

    @if (error(); as e) {
      <div class="alert alert-error" role="alert">
        <strong>{{ e.title }}</strong>@if (e.detail) {<p>{{ e.detail }}</p>}
        <button type="button" class="btn btn-sm" (click)="load()">Retry</button>
      </div>
    } @else if (loading() && !plans().length) {
      <p class="muted">Loading plans…</p>
    } @else {
      <div class="table-wrap">
        <table class="table members-table">
          <thead>
            <tr><th>Plan</th><th>For</th><th>Repeats</th><th>Next due</th><th>Status</th><th><span class="sr-only">Actions</span></th></tr>
          </thead>
          <tbody>
            @for (p of plans(); track p.id) {
              <tr [class.inactive]="!p.active">
                <td data-label="Plan">
                  <strong>{{ p.title }}</strong>
                  @if (p.assigneeNote) {
                    <div class="muted small">{{ p.assigneeNote }}</div>
                  }
                </td>
                <td data-label="For">{{ p.assetName ? '🔧 ' + p.assetName : '📍' }} <span class="muted small">{{ p.locationLabel }}</span></td>
                <td data-label="Repeats">{{ p.recurrenceText }}</td>
                <td data-label="Next due">
                  {{ p.nextDueOn ? date(p.nextDueOn) : 'Finished' }}
                  @if (p.openTaskId) {
                    <div><a class="small" [routerLink]="['/buildings', ctx.buildingId(), 'issues', p.openTaskId]">Open task ›</a></div>
                  }
                </td>
                <td data-label="Status">
                  @if (p.active) {
                    <span class="badge badge-ok">Active</span>
                  } @else {
                    <span class="badge badge-warn" [title]="p.pausedReason === 'ASSET_ARCHIVED' ? 'Its item was archived' : 'Paused by a manager'">
                      Paused · {{ p.pausedReason === 'ASSET_ARCHIVED' ? 'item archived' : 'manually' }}
                    </span>
                  }
                </td>
                <td class="cell-actions">
                  @if (canManage()) {
                    <button type="button" class="btn btn-sm" (click)="editing.set(p)">Edit</button>
                    <button type="button" class="btn btn-sm" [disabled]="busy()" (click)="toggle(p)">{{ p.active ? 'Pause' : 'Resume' }}</button>
                  }
                </td>
              </tr>
            } @empty {
              <tr>
                <td colspan="6" class="muted">
                  No maintenance plans yet.
                  @if (canManage()) {
                    Add one for inspections and other recurring jobs.
                  }
                </td>
              </tr>
            }
          </tbody>
        </table>
      </div>
    }

    @if (editing(); as e) {
      <app-plan-dialog
        [buildingId]="ctx.buildingId()!"
        [plan]="e === 'new' ? null : e"
        [assets]="assets()"
        [spaces]="spaces()"
        [today]="today()"
        (saved)="load()"
        (closed)="editing.set(null)"
      />
    }
  `,
})
export class MaintenancePage {
  protected readonly ctx = inject(BuildingContext);
  private readonly api = inject(ApiService);
  private readonly toast = inject(ToastService);

  protected readonly plans = signal<MaintenancePlanDto[]>([]);
  protected readonly assets = signal<AssetDto[]>([]);
  protected readonly loading = signal(true);
  protected readonly error = signal<ErrorText | null>(null);
  protected readonly busy = signal(false);
  protected readonly editing = signal<MaintenancePlanDto | 'new' | null>(null);

  protected readonly canManage = computed(() => this.ctx.has('MAINTENANCE_MANAGE'));
  protected readonly tz = computed(() => this.ctx.building()?.timeZone ?? 'Europe/Lisbon');
  protected readonly today = computed(() => todayIn(this.tz()));
  protected readonly spaces = computed(() => spacesInTreeOrder(this.ctx.spaces()));
  protected readonly date = (d: string) => formatLocalDate(d);

  constructor() {
    effect(() => {
      const id = this.ctx.buildingId();
      if (id) untracked(() => void this.load());
    });
  }

  private get bid(): UUID {
    return this.ctx.buildingId()!;
  }

  protected async load(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      const [plans, assets] = await Promise.all([
        this.api.client.maintenance.list(this.bid),
        this.canManage() ? this.api.client.assets.list(this.bid) : Promise.resolve([] as AssetDto[]),
      ]);
      // Active first, then by next due date.
      this.plans.set([...plans].sort((a, b) => Number(b.active) - Number(a.active) || (a.nextDueOn ?? '9999').localeCompare(b.nextDueOn ?? '9999')));
      this.assets.set(assets);
    } catch (e) {
      this.error.set(describeError(e));
    } finally {
      this.loading.set(false);
    }
  }

  protected async toggle(p: MaintenancePlanDto): Promise<void> {
    this.busy.set(true);
    try {
      const updated = p.active ? await this.api.client.maintenance.pause(this.bid, p.id) : await this.api.client.maintenance.resume(this.bid, p.id);
      this.toast.success(updated.active ? `Resumed “${p.title}”` : `Paused “${p.title}”`);
    } catch (e) {
      if (isConflict(e)) this.toast.info(CONFLICT_RELOADED);
      else this.toast.error(e);
    } finally {
      this.busy.set(false);
      await this.load();
    }
  }
}
