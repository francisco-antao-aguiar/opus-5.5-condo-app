import { Component, inject, input, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../core/auth.service';
import { applyServerErrors, describeError, ErrorText } from '../core/errors';
import { FieldErrorComponent } from '../shared/field-error.component';

@Component({
  selector: 'app-login-page',
  imports: [ReactiveFormsModule, RouterLink, FieldErrorComponent],
  template: `
    <section class="auth-card card">
      <h1>Sign in</h1>
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
      <p class="muted center">No account? <a routerLink="/register">Create one</a></p>
    </section>
  `,
})
export class LoginPage {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  /** Query params (component input binding). */
  readonly returnUrl = input<string>();
  readonly expired = input<string>();

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
      const target = this.returnUrl();
      await this.router.navigateByUrl(target && target.startsWith('/') && !target.startsWith('//') ? target : '/buildings');
    } catch (e) {
      applyServerErrors(this.form, e);
      this.error.set(describeError(e));
    } finally {
      this.busy.set(false);
    }
  }
}
