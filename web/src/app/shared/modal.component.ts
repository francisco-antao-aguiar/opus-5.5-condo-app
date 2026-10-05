import { Component, input, output } from '@angular/core';

/** Minimal modal shell: backdrop + panel with title, projected body and an optional footer slot. */
@Component({
  selector: 'app-modal',
  host: { '(document:keydown.escape)': 'closed.emit()' },
  template: `
    <div class="modal-backdrop" (click)="closed.emit()"></div>
    <div class="modal" role="dialog" aria-modal="true" [attr.aria-label]="title()" [class.modal-wide]="wide()">
      <header class="modal-head">
        <h2>{{ title() }}</h2>
        <button type="button" class="btn-icon" aria-label="Close" (click)="closed.emit()">✕</button>
      </header>
      <div class="modal-body"><ng-content /></div>
      <footer class="modal-foot"><ng-content select="[modal-footer]" /></footer>
    </div>
  `,
})
export class ModalComponent {
  readonly title = input.required<string>();
  readonly wide = input(false);
  readonly closed = output<void>();
}
