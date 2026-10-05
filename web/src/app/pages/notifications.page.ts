import { Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { Router } from '@angular/router';
import { NotificationDto } from '@condo/shared';
import { ApiService } from '../core/api.service';
import { describeError, ErrorText } from '../core/errors';
import { NotificationService } from '../core/notification.service';
import { groupByDay, notificationIcon, safeLink, timeAgo } from '../shared/notifications';

const PAGE_SIZE = 20;

@Component({
  selector: 'app-notifications-page',
  template: `
    <div class="page-head">
      <h1>Notifications</h1>
      <div class="row gap wrap">
        <label class="check small">
          <input type="checkbox" [checked]="unreadOnly()" (change)="setUnreadOnly($any($event.target).checked)" />
          <span>Unread only</span>
        </label>
        <button type="button" class="btn btn-sm" [disabled]="!notes.unread()" (click)="markAll()">Mark all read</button>
      </div>
    </div>

    @if (error(); as e) {
      <div class="alert alert-error" role="alert">
        <strong>{{ e.title }}</strong>@if (e.detail) {<p>{{ e.detail }}</p>}
        <button type="button" class="btn btn-sm" (click)="load()">Retry</button>
      </div>
    } @else if (loading() && !items().length) {
      <p class="muted">Loading…</p>
    } @else {
      @for (g of groups(); track g.label) {
        <h2 class="note-group">{{ g.label }}</h2>
        <div class="card note-list">
          @for (n of g.items; track n.id) {
            <button type="button" class="note" [class.unread]="!n.read" (click)="open(n)">
              <span class="note-icon" aria-hidden="true">{{ icon(n.type) }}</span>
              <span class="note-text">
                <strong>{{ n.title }}</strong>
                <span>{{ n.body }}</span>
                <span class="muted small">{{ n.buildingName }} · {{ ago(n.createdAt) }}</span>
              </span>
              @if (!n.read) {
                <span class="unread-dot" aria-label="unread"></span>
              }
            </button>
          }
        </div>
      } @empty {
        <div class="empty card">
          <p><strong>{{ unreadOnly() ? 'No unread notifications.' : 'No notifications yet.' }}</strong></p>
          <p class="muted">You'll hear here when an issue you reported or follow changes.</p>
        </div>
      }
      @if (pages() > 1) {
        <div class="pager">
          <button type="button" class="btn btn-sm" [disabled]="page() === 0" (click)="page.set(page() - 1)">‹ Newer</button>
          <span class="muted small">Page {{ page() + 1 }} of {{ pages() }}</span>
          <button type="button" class="btn btn-sm" [disabled]="page() >= pages() - 1" (click)="page.set(page() + 1)">Older ›</button>
        </div>
      }
    }
  `,
})
export class NotificationsPage {
  private readonly api = inject(ApiService);
  protected readonly notes = inject(NotificationService);
  private readonly router = inject(Router);

  protected readonly unreadOnly = signal(false);
  protected readonly page = signal(0);
  protected readonly items = signal<NotificationDto[]>([]);
  protected readonly total = signal(0);
  protected readonly loading = signal(true);
  protected readonly error = signal<ErrorText | null>(null);
  protected readonly groups = computed(() => groupByDay(this.items()));
  protected readonly pages = computed(() => Math.max(1, Math.ceil(this.total() / PAGE_SIZE)));
  protected readonly icon = notificationIcon;
  protected readonly ago = (at: string) => timeAgo(at);

  constructor() {
    effect(() => {
      this.unreadOnly();
      this.page();
      untracked(() => void this.load());
    });
  }

  protected setUnreadOnly(v: boolean): void {
    this.page.set(0);
    this.unreadOnly.set(v);
  }

  protected async load(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      const res = await this.api.client.notifications.list({ unreadOnly: this.unreadOnly() || undefined, page: this.page(), size: PAGE_SIZE });
      this.items.set(res.items);
      this.total.set(res.total);
    } catch (e) {
      this.error.set(describeError(e));
    } finally {
      this.loading.set(false);
    }
  }

  protected async open(n: NotificationDto): Promise<void> {
    void this.notes.markRead(n);
    const link = safeLink(n.link);
    if (link) await this.router.navigateByUrl(link);
    else this.items.update((list) => list.map((x) => (x.id === n.id ? { ...x, read: true } : x)));
  }

  protected async markAll(): Promise<void> {
    await this.notes.markAllRead();
    await this.load();
  }
}
