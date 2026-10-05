import { Component, computed, input, output, signal } from '@angular/core';
import { IssueStatus } from '@condo/shared';
import { statusLabel, transitionLabel } from '../shared/issues';
import { ModalComponent } from '../shared/modal.component';

export interface TransitionRequest {
  issueId: string;
  number: number;
  title: string;
  from: IssueStatus;
  to: IssueStatus;
  /** Optimistic-locking version from the issue (detail) or summary (board); stale → 409 CONFLICT. */
  version?: number;
}

/** "Resolve #12 Flickering?" with an optional comment. */
@Component({
  selector: 'app-transition-dialog',
  imports: [ModalComponent],
  template: `
    <app-modal [title]="heading()" (closed)="closed.emit()">
      <p class="muted">
        #{{ request().number }} {{ request().title }}: {{ label(request().from) }} → <strong>{{ label(request().to) }}</strong>
      </p>
      <label class="field">
        <span>Comment <small class="muted">(optional, shown on the timeline to everyone affected)</small></span>
        <textarea rows="3" maxlength="2000" [value]="comment()" (input)="comment.set($any($event.target).value)" placeholder="e.g. Technician booked for Thursday"></textarea>
      </label>
      <div modal-footer>
        <button type="button" class="btn" (click)="closed.emit()">Cancel</button>
        <button type="button" class="btn btn-primary" [disabled]="busy()" (click)="confirmed.emit(comment().trim() || null)">
          {{ busy() ? 'Saving…' : action() }}
        </button>
      </div>
    </app-modal>
  `,
})
export class TransitionDialogComponent {
  readonly request = input.required<TransitionRequest>();
  readonly busy = input(false);
  readonly closed = output<void>();
  readonly confirmed = output<string | null>();

  protected readonly comment = signal('');
  protected readonly label = statusLabel;
  protected readonly action = computed(() => transitionLabel(this.request().from, this.request().to));
  protected readonly heading = computed(() => `${this.action()} issue #${this.request().number}?`);
}
