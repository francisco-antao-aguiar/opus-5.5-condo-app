import { Component, input, output, signal } from '@angular/core';
import { ModalComponent } from './modal.component';

/** Small "are you sure? why?" dialog: cost deletes, booking rejections and cancellations. */
@Component({
  selector: 'app-reason-dialog',
  imports: [ModalComponent],
  template: `
    <app-modal [title]="title()" (closed)="closed.emit()">
      @if (message()) {
        <p>{{ message() }}</p>
      }
      <label class="field">
        <span>{{ label() }} @if (!required()) {<small class="muted">(optional)</small>}</span>
        <textarea rows="3" maxlength="500" [value]="text()" (input)="text.set($any($event.target).value)" [placeholder]="placeholder()"></textarea>
      </label>
      <div modal-footer>
        <button type="button" class="btn" (click)="closed.emit()">Cancel</button>
        <button type="button" class="btn" [class.btn-danger]="danger()" [class.btn-primary]="!danger()" [disabled]="busy() || (required() && !text().trim())" (click)="confirmed.emit(text().trim())">
          {{ busy() ? 'Working…' : confirmText() }}
        </button>
      </div>
    </app-modal>
  `,
})
export class ReasonDialogComponent {
  readonly title = input.required<string>();
  readonly message = input('');
  readonly label = input('Reason');
  readonly placeholder = input('');
  readonly confirmText = input('Confirm');
  readonly required = input(false);
  readonly danger = input(true);
  readonly busy = input(false);
  readonly closed = output<void>();
  readonly confirmed = output<string>();

  protected readonly text = signal('');
}
