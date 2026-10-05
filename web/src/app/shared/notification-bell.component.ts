import { Component, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { NotificationDto } from '@condo/shared';
import { NotificationService } from '../core/notification.service';
import { badgeText, notificationIcon, safeLink, timeAgo } from './notifications';

/** Header bell: unread badge + dropdown with the latest 10. */
@Component({
  selector: 'app-notification-bell',
  imports: [RouterLink],
  host: { '(document:click)': 'open.set(false)', '(document:keydown.escape)': 'open.set(false)', class: 'bell-host' },
  template: `
    <button
      type="button"
      class="bell"
      [attr.aria-label]="notes.unread() ? notes.unread() + ' unread notifications' : 'Notifications'"
      [attr.aria-expanded]="open()"
      aria-haspopup="true"
      (click)="toggle($event)"
    >
      🔔
      @if (notes.unread() > 0) {
        <span class="bell-badge">{{ badge(notes.unread()) }}</span>
      }
    </button>
    @if (open()) {
      <div class="menu bell-menu" (click)="$event.stopPropagation()">
        <div class="bell-head">
          <strong>Notifications</strong>
          @if (notes.unread() > 0) {
            <button type="button" class="btn-icon small" (click)="notes.markAllRead()">Mark all read</button>
          }
        </div>
        @if (notes.latestLoading() && !notes.latest().length) {
          <p class="muted small pad">Loading…</p>
        }
        @for (n of notes.latest(); track n.id) {
          <button type="button" class="note" [class.unread]="!n.read" (click)="go(n)">
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
        } @empty {
          @if (!notes.latestLoading()) {
            <p class="muted small pad">You're all caught up.</p>
          }
        }
        <a class="bell-all" routerLink="/notifications" (click)="open.set(false)">See all</a>
      </div>
    }
  `,
})
export class NotificationBellComponent {
  protected readonly notes = inject(NotificationService);
  private readonly router = inject(Router);
  protected readonly open = signal(false);
  protected readonly icon = notificationIcon;
  protected readonly ago = (at: string) => timeAgo(at);
  protected readonly badge = badgeText;

  protected toggle(ev: Event): void {
    ev.stopPropagation();
    const next = !this.open();
    this.open.set(next);
    if (next) void this.notes.loadLatest();
  }

  protected async go(n: NotificationDto): Promise<void> {
    this.open.set(false);
    void this.notes.markRead(n);
    const link = safeLink(n.link);
    if (link) await this.router.navigateByUrl(link);
  }
}
