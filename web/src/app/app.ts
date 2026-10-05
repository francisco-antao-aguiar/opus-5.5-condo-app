import { Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink, RouterOutlet } from '@angular/router';
import { filter, map } from 'rxjs';
import { AuthService } from './core/auth.service';
import { ConfirmService } from './core/confirm.service';
import { NotificationService } from './core/notification.service';
import { ToastService } from './core/toast.service';
import { NotificationBellComponent } from './shared/notification-bell.component';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, NotificationBellComponent],
  host: { '(document:click)': 'menuOpen.set(false)' },
  templateUrl: './app.html',
})
export class App {
  private readonly router = inject(Router);
  protected readonly auth = inject(AuthService);
  protected readonly toast = inject(ToastService);
  protected readonly confirm = inject(ConfirmService);
  protected readonly menuOpen = signal(false);
  /** Starts unread polling (and the "(3) Condo" title) as soon as the app boots. */
  private readonly notifications = inject(NotificationService);

  private readonly url = toSignal(
    this.router.events.pipe(
      filter((e): e is NavigationEnd => e instanceof NavigationEnd),
      map((e) => e.urlAfterRedirects),
    ),
    { initialValue: this.router.url },
  );

  /** Building id from the current URL (/buildings/:id/...), for the switcher. */
  protected readonly currentBuildingId = computed(() => /^\/buildings\/([^/?#]+)/.exec(this.url())?.[1] ?? '');

  protected readonly initials = computed(() => {
    const name = this.auth.user()?.displayName ?? '';
    return name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0]!.toUpperCase())
      .join('') || '?';
  });

  protected switchBuilding(id: string): void {
    void this.router.navigate(id ? ['/buildings', id] : ['/buildings']);
  }

  protected toggleMenu(event: Event): void {
    event.stopPropagation();
    this.menuOpen.update((v) => !v);
  }

  protected async logout(): Promise<void> {
    this.menuOpen.set(false);
    await this.auth.logout();
    await this.router.navigate(['/login']);
  }
}
