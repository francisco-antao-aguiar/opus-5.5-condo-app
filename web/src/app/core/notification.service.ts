import { DestroyRef, Injectable, effect, inject, signal } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { NavigationEnd, Router } from '@angular/router';
import { NotificationDto } from '@condo/shared';
import { filter } from 'rxjs';
import { titleWithCount } from '../shared/notifications';
import { ApiService } from './api.service';
import { AuthService } from './auth.service';

const POLL_MS = 60_000;

/**
 * Unread count for the header bell: polled every 60 s while signed in, and refreshed on window focus
 * and after each navigation. Also mirrors the count into document.title ("(3) Issues · Condo").
 */
@Injectable({ providedIn: 'root' })
export class NotificationService {
  private readonly api = inject(ApiService);
  private readonly auth = inject(AuthService);
  private readonly title = inject(Title);
  private readonly router = inject(Router);

  readonly unread = signal(0);
  readonly latest = signal<NotificationDto[]>([]);
  readonly latestLoading = signal(false);

  private timer: ReturnType<typeof setInterval> | null = null;
  private inFlight = false;
  private readonly onFocus = () => void this.refresh();

  constructor() {
    const destroyRef = inject(DestroyRef);

    effect(() => {
      if (this.auth.user()) this.start();
      else this.stop();
    });

    // Keep the tab title in sync with the count; the router resets the title on each navigation.
    effect(() => this.applyTitle(this.unread()));
    const sub = this.router.events.pipe(filter((e) => e instanceof NavigationEnd)).subscribe(() => {
      // The TitleStrategy sets the route title after NavigationEnd: re-apply on the next tick.
      setTimeout(() => this.applyTitle(this.unread()));
      if (this.auth.user()) void this.refresh();
    });

    destroyRef.onDestroy(() => {
      sub.unsubscribe();
      this.stop();
    });
  }

  private start(): void {
    if (this.timer) return;
    void this.refresh();
    this.timer = setInterval(() => void this.refresh(), POLL_MS);
    window.addEventListener('focus', this.onFocus);
  }

  private stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    window.removeEventListener('focus', this.onFocus);
    this.unread.set(0);
    this.latest.set([]);
  }

  private applyTitle(unread: number): void {
    this.title.setTitle(titleWithCount(this.title.getTitle(), unread));
  }

  async refresh(): Promise<void> {
    if (this.inFlight || !this.auth.hasSession()) return;
    this.inFlight = true;
    try {
      this.unread.set((await this.api.client.notifications.unreadCount()).unread);
    } catch {
      /* transient: the next poll retries; 401s go through the session-expired flow */
    } finally {
      this.inFlight = false;
    }
  }

  /** Latest 10 for the dropdown. */
  async loadLatest(): Promise<void> {
    this.latestLoading.set(true);
    try {
      const page = await this.api.client.notifications.list({ page: 0, size: 10 });
      this.latest.set(page.items);
    } catch {
      /* keep the previous list */
    } finally {
      this.latestLoading.set(false);
    }
  }

  async markRead(n: NotificationDto): Promise<void> {
    if (n.read) return;
    this.latest.update((list) => list.map((x) => (x.id === n.id ? { ...x, read: true } : x)));
    this.unread.update((u) => Math.max(0, u - 1));
    try {
      await this.api.client.notifications.markRead(n.id);
    } finally {
      void this.refresh();
    }
  }

  async markAllRead(): Promise<void> {
    this.latest.update((list) => list.map((x) => ({ ...x, read: true })));
    this.unread.set(0);
    try {
      await this.api.client.notifications.markAllRead();
    } finally {
      void this.refresh();
    }
  }
}
