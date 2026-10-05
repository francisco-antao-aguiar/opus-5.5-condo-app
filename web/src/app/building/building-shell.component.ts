import { Component, effect, inject, input, untracked } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { describeError } from '../core/errors';
import { BuildingContext } from './building-context.service';

@Component({
  selector: 'app-building-shell',
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  providers: [BuildingContext],
  template: `
    @if (ctx.accessDenied(); as code) {
      <section class="full-page">
        <div class="full-page-icon">🔒</div>
        @if (code === 'MEMBERSHIP_EXPIRED') {
          <h1>Your membership has expired</h1>
          <p class="muted">Your access to this building ended. Ask a building admin or manager to extend it.</p>
        } @else {
          <h1>You're not a member of this building</h1>
          <p class="muted">You can only see buildings you belong to. Ask an admin for an invitation, or pick one of your buildings.</p>
        }
        <a class="btn btn-primary" routerLink="/buildings">Go to my buildings</a>
      </section>
    } @else if (ctx.notFound()) {
      <section class="full-page">
        <div class="full-page-icon">🏚️</div>
        <h1>Building not found</h1>
        <p class="muted">It may have been removed, or the link is wrong.</p>
        <a class="btn btn-primary" routerLink="/buildings">Go to my buildings</a>
      </section>
    } @else if (ctx.error(); as err) {
      <section class="full-page">
        <h1>{{ describe(err).title }}</h1>
        <p class="muted">{{ describe(err).detail }}</p>
        <button type="button" class="btn btn-primary" (click)="ctx.reload()">Retry</button>
      </section>
    } @else {
      <div class="shell">
        <aside class="shell-nav">
          <div class="shell-title">
            <strong>{{ ctx.building()?.name ?? 'Loading…' }}</strong>
            @if (ctx.perms(); as p) {
              <span class="badge badge-role">{{ p.role }}</span>
            }
          </div>
          <nav aria-label="Building sections">
            <a routerLink="structure" routerLinkActive="active">▤ Structure</a>
            <a routerLink="assets" routerLinkActive="active">💡 Assets</a>
            <a routerLink="members" routerLinkActive="active">👥 Members</a>
            @if (ctx.can('CATALOG_EDIT')) {
              <a routerLink="catalog" routerLinkActive="active">☰ Problem catalog</a>
            }
            <a routerLink="settings" routerLinkActive="active">⚙ Settings</a>
          </nav>
        </aside>
        <section class="shell-content">
          @if (ctx.building()) {
            <router-outlet />
          } @else {
            <p class="muted">Loading building…</p>
          }
        </section>
      </div>
    }
  `,
})
export class BuildingShellComponent {
  protected readonly ctx = inject(BuildingContext);
  /** Route param :id (component input binding). */
  readonly id = input.required<string>();

  protected readonly describe = describeError;

  constructor() {
    effect(() => {
      const id = this.id();
      untracked(() => void this.ctx.load(id));
    });
  }
}
