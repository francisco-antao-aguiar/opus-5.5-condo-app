import { Component, input } from '@angular/core';
import { AbstractControl } from '@angular/forms';

/** Shows the first error of a control once touched; `server` errors (from the API) always show. */
@Component({
  selector: 'app-field-error',
  template: `
    @if (message(); as m) {
      <p class="field-error" role="alert">{{ m }}</p>
    }
  `,
})
export class FieldErrorComponent {
  readonly control = input.required<AbstractControl>();
  readonly label = input('This field');

  message(): string | null {
    const c = this.control();
    const e = c.errors;
    if (!e) return null;
    if (e['server']) return String(e['server']);
    if (!c.touched) return null;
    if (e['required']) return `${this.label()} is required.`;
    if (e['email']) return 'Enter a valid email address.';
    if (e['minlength']) return `${this.label()} must be at least ${e['minlength'].requiredLength} characters.`;
    if (e['maxlength']) return `${this.label()} must be at most ${e['maxlength'].requiredLength} characters.`;
    if (e['min']) return `${this.label()} must be at least ${e['min'].min}.`;
    if (e['max']) return `${this.label()} must be at most ${e['max'].max}.`;
    return `${this.label()} is invalid.`;
  }
}
