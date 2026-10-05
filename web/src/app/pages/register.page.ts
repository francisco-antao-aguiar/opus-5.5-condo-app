import { Component, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../core/auth.service';
import { applyServerErrors, describeError, errorCode, ErrorText } from '../core/errors';
import { FieldErrorComponent } from '../shared/field-error.component';

@Component({
  selector: 'app-register-page',
  imports: [ReactiveFormsModule, RouterLink, FieldErrorComponent],
  template: `
    <section class="auth-card card">
      <h1>Create account</h1>
      @if (error(); as e) {
        <div class="alert alert-error" role="alert"><strong>{{ e.title }}</strong>@if (e.detail) {<p>{{ e.detail }}</p>}</div>
      }
      <form [formGroup]="form" (ngSubmit)="submit()" novalidate>
        <label class="field">
          <span>Email</span>
          <input type="email" formControlName="email" autocomplete="email" />
          <app-field-error [control]="form.controls.email" label="Email" />
        </label>
        <label class="field">
          <span>Display name</span>
          <input type="text" formControlName="displayName" autocomplete="name" />
          <app-field-error [control]="form.controls.displayName" label="Display name" />
        </label>
        <label class="field">
          <span>Password <small class="muted">(at least 8 characters)</small></span>
          <input type="password" formControlName="password" autocomplete="new-password" />
          <app-field-error [control]="form.controls.password" label="Password" />
        </label>
        <button type="submit" class="btn btn-primary btn-block" [disabled]="busy()">{{ busy() ? 'Creating…' : 'Create account' }}</button>
      </form>
      <p class="muted center">Already registered? <a routerLink="/login">Sign in</a></p>
    </section>
  `,
})
export class RegisterPage {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  protected readonly busy = signal(false);
  protected readonly error = signal<ErrorText | null>(null);

  protected readonly form = new FormGroup({
    email: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.email] }),
    displayName: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.maxLength(100)] }),
    password: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.minLength(8)] }),
  });

  protected async submit(): Promise<void> {
    this.form.markAllAsTouched();
    if (this.form.invalid || this.busy()) return;
    this.busy.set(true);
    this.error.set(null);
    try {
      const v = this.form.getRawValue();
      await this.auth.register({ ...v, displayName: v.displayName.trim() });
      await this.router.navigate(['/buildings']);
    } catch (e) {
      applyServerErrors(this.form, e);
      if (errorCode(e) === 'EMAIL_TAKEN') {
        this.form.controls.email.setErrors({ server: 'This email is already registered.' });
      }
      this.error.set(describeError(e));
    } finally {
      this.busy.set(false);
    }
  }
}
