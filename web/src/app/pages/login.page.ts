import { Component, computed, inject, input, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../core/auth.service';
import { applyServerErrors, describeError, ErrorText } from '../core/errors';
import { FieldErrorComponent } from '../shared/field-error.component';
import { safeReturnUrl } from '../shared/invitations';

@Component({
  selector: 'app-login-page',
  imports: [ReactiveFormsModule, RouterLink, FieldErrorComponent],
  template: `
    <section class="auth-card card">
      <h1>Sign in</h1>
      @if (joining()) {
        <p class="alert alert-info">Sign in to accept your invitation.</p>
      }
      @if (expired()) {
        <p class="alert alert-info">Your session expired. Please sign in again.</p>
      }
      @if (error(); as e) {
        <div class="alert alert-error" role="alert"><strong>{{ e.title }}</strong>@if (e.detail) {<p>{{ e.detail }}</p>}</div>
      }
      <form [formGroup]="form" (ngSubmit)="submit()" novalidate>
        <label class="field">
          <span>Email</span>
          <input type="email" formControlName="email" autocomplete="username" />
          <app-field-error [control]="form.controls.email" label="Email" />
        </label>
        <label class="field">
          <span>Password</span>
          <input type="password" formControlName="password" autocomplete="current-password" />
          <app-field-error [control]="form.controls.password" label="Password" />
        </label>
        <button type="submit" class="btn btn-primary btn-block" [disabled]="busy()">{{ busy() ? 'Signing in…' : 'Sign in' }}</button>
      </form>
      <p class="muted center">No account? <a routerLink="/register" [queryParams]="linkParams()">Create one</a></p>
    </section>
  `,
})
export class LoginPage {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  /** Query params (component input binding). */
  readonly returnUrl = input<string>();
  readonly expired = input<string>();

  protected readonly joining = computed(() => safeReturnUrl(this.returnUrl(), '').startsWith('/join/'));
  /** Keep the return target when switching to register. */
  protected readonly linkParams = computed(() => (this.returnUrl() ? { returnUrl: safeReturnUrl(this.returnUrl()) } : {}));

  protected readonly busy = signal(false);
  protected readonly error = signal<ErrorText | null>(null);

  protected readonly form = new FormGroup({
    email: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.email] }),
    password: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
  });

  protected async submit(): Promise<void> {
    this.form.markAllAsTouched();
    if (this.form.invalid || this.busy()) return;
    this.busy.set(true);
    this.error.set(null);
    try {
      await this.auth.login(this.form.getRawValue());
      await this.router.navigateByUrl(safeReturnUrl(this.returnUrl()));
    } catch (e) {
      applyServerErrors(this.form, e);
      this.error.set(describeError(e));
    } finally {
      this.busy.set(false);
    }
  }
}
