import { Component, computed, effect, inject, input, OnInit, output, signal, untracked } from '@angular/core';
import { AssetDto, LocalDate, MaintenancePlanDto, RecurrenceUnit, SaveMaintenancePlanRequest, UUID, Weekday } from '@condo/shared';
import { ApiService } from '../core/api.service';
import { CONFLICT_RELOADED, describeError, ErrorText, isConflict, problemOf } from '../core/errors';
import { ToastService } from '../core/toast.service';
import { SpaceOption } from '../shared/assets';
import { ModalComponent } from '../shared/modal.component';
import {
  MONTH_LABELS,
  RecurrenceForm,
  UNIT_LABELS,
  WEEKDAYS,
  WEEKDAY_LABELS,
  changeUnit,
  defaultRecurrenceForm,
  describeRecurrence,
  fromRecurrence,
  recurrenceError,
  toRecurrence,
  toggleWeekday,
} from '../shared/recurrence';
import { formatLocalDate } from '../shared/zoned';

const UNITS: RecurrenceUnit[] = ['ONCE', 'DAY', 'WEEK', 'MONTH', 'YEAR'];
const UNIT_NOUN: Record<RecurrenceUnit, string> = { ONCE: '', DAY: 'day(s)', WEEK: 'week(s)', MONTH: 'month(s)', YEAR: 'year(s)' };

/** Create / edit a maintenance plan, with a live "next 5 dates" preview from the server. */
@Component({
  selector: 'app-plan-dialog',
  imports: [ModalComponent],
  template: `
    <app-modal [title]="plan() ? 'Edit maintenance plan' : 'New maintenance plan'" [wide]="true" (closed)="closed.emit()">
      <div class="grid-2">
        <label class="field">
          <span>Title</span>
          <input type="text" maxlength="200" [value]="title()" (input)="title.set($any($event.target).value)" placeholder="e.g. Elevator inspection" />
        </label>
        <div class="field">
          <span>What is it for?</span>
          <div class="row gap wrap">
            <label class="check"><input type="radio" name="target" [checked]="targetKind() === 'asset'" (change)="targetKind.set('asset')" /> <span>An item</span></label>
            <label class="check"><input type="radio" name="target" [checked]="targetKind() === 'space'" (change)="targetKind.set('space')" /> <span>A place</span></label>
          </div>
          @if (targetKind() === 'asset') {
            <select [value]="assetId()" (change)="assetId.set($any($event.target).value)" aria-label="Item">
              <option value="" [selected]="!assetId()">Choose an item…</option>
              @for (a of assets(); track a.id) {
                <option [value]="a.id" [selected]="a.id === assetId()">{{ a.name }} — {{ a.spacePath || a.spaceName }}</option>
              }
            </select>
          } @else {
            <select [value]="spaceId()" (change)="spaceId.set($any($event.target).value)" aria-label="Place">
              <option value="" [selected]="!spaceId()">Choose a place…</option>
              @for (o of spaces(); track o.space.id) {
                <option [value]="o.space.id" [selected]="o.space.id === spaceId()">{{ o.label }}</option>
              }
            </select>
          }
        </div>
      </div>

      <label class="field">
        <span>Description <small class="muted">(optional)</small></span>
        <textarea rows="2" maxlength="2000" [value]="description()" (input)="description.set($any($event.target).value)"></textarea>
      </label>

      <div class="field">
        <span>Checklist <small class="muted">(optional — shown on every task)</small></span>
        @for (line of checklist(); track $index) {
          <div class="row gap checklist-line">
            <input type="text" class="grow" maxlength="200" [value]="line" (input)="setLine($index, $any($event.target).value)" [attr.aria-label]="'Checklist item ' + ($index + 1)" />
            <button type="button" class="btn-icon" aria-label="Remove line" (click)="removeLine($index)">✕</button>
          </div>
        }
        <div><button type="button" class="btn btn-sm" (click)="addLine()">＋ Add line</button></div>
      </div>

      <fieldset class="field recurrence">
        <legend>Repeats</legend>
        <div class="segmented" role="group" aria-label="Repeat unit">
          @for (u of units; track u) {
            <button type="button" [class.active]="rec().unit === u" (click)="setUnit(u)">{{ unitLabels[u] }}</button>
          }
        </div>
        @if (rec().unit !== 'ONCE') {
          <div class="row gap wrap rec-row">
            <span>Every</span>
            <input type="number" class="input-narrow" min="1" max="365" [value]="rec().every" (input)="patchRec({ every: +$any($event.target).value })" aria-label="Every N" />
            <span>{{ unitNoun[rec().unit] }}</span>
            @if (rec().unit === 'WEEK') {
              <span>on</span>
              @for (w of weekdays; track w) {
                <button type="button" class="chip" [class.selected]="rec().weekdays.includes(w)" (click)="toggleDay(w)">{{ weekdayLabels[w] }}</button>
              }
            }
            @if (rec().unit === 'MONTH' || rec().unit === 'YEAR') {
              <span>on day</span>
              <input type="number" class="input-narrow" min="1" max="31" [value]="rec().dayOfMonth" (input)="patchRec({ dayOfMonth: +$any($event.target).value })" aria-label="Day of month" />
            }
            @if (rec().unit === 'YEAR') {
              <span>of</span>
              <select [value]="rec().month" (change)="patchRec({ month: +$any($event.target).value })" aria-label="Month">
                @for (m of months; track $index) {
                  <option [value]="$index + 1" [selected]="rec().month === $index + 1">{{ m }}</option>
                }
              </select>
            }
          </div>
          @if (rec().dayOfMonth > 28 && (rec().unit === 'MONTH' || rec().unit === 'YEAR')) {
            <small class="muted">Shorter months use their last day.</small>
          }
        }
        @if (recError(); as e) {
          <p class="field-error">{{ e }}</p>
        }
      </fieldset>

      <div class="grid-3">
        <label class="field">
          <span>{{ rec().unit === 'ONCE' ? 'Due on' : 'Starts on' }}</span>
          <input type="date" [value]="startsOn()" (input)="startsOn.set($any($event.target).value)" />
        </label>
        <label class="field">
          <span>Ends on <small class="muted">(optional)</small></span>
          <input type="date" [value]="endsOn()" [min]="startsOn()" [disabled]="rec().unit === 'ONCE'" (input)="endsOn.set($any($event.target).value)" />
        </label>
        <label class="field">
          <span>Create the task <small class="muted">(days before due)</small></span>
          <input type="number" min="0" max="90" [value]="leadDays()" (input)="leadDays.set(+$any($event.target).value)" />
        </label>
      </div>
      <label class="field">
        <span>Who does it <small class="muted">(optional note, e.g. “Schindler, contract #123”)</small></span>
        <input type="text" maxlength="200" [value]="assigneeNote()" (input)="assigneeNote.set($any($event.target).value)" />
      </label>

      <div class="preview-box" aria-live="polite">
        <strong>{{ previewText() }}</strong>
        @if (previewLoading()) {
          <span class="muted small"> · updating…</span>
        }
        @if (previewDates().length) {
          <ol class="preview-dates">
            @for (d of previewDates(); track d) {
              <li>{{ fmtDate(d) }}</li>
            }
          </ol>
        } @else if (previewError()) {
          <p class="field-error">{{ previewError() }}</p>
        }
      </div>

      @if (error(); as e) {
        <div class="alert alert-error" role="alert"><strong>{{ e.title }}</strong>@if (e.detail) {<p>{{ e.detail }}</p>}</div>
      }

      <div modal-footer>
        <button type="button" class="btn" (click)="closed.emit()">Cancel</button>
        <button type="button" class="btn btn-primary" [disabled]="busy() || !!formError()" [title]="formError() ?? ''" (click)="save()">
          {{ busy() ? 'Saving…' : plan() ? 'Save plan' : 'Create plan' }}
        </button>
      </div>
    </app-modal>
  `,
})
export class PlanDialogComponent implements OnInit {
  private readonly api = inject(ApiService);
  private readonly toast = inject(ToastService);

  readonly buildingId = input.required<UUID>();
  readonly plan = input<MaintenancePlanDto | null>(null);
  readonly assets = input.required<AssetDto[]>();
  readonly spaces = input.required<SpaceOption[]>();
  /** Building-local "today", the default start date. */
  readonly today = input.required<LocalDate>();
  readonly closed = output<void>();
  readonly saved = output<MaintenancePlanDto>();

  protected readonly units = UNITS;
  protected readonly unitLabels = UNIT_LABELS;
  protected readonly unitNoun = UNIT_NOUN;
  protected readonly weekdays = WEEKDAYS;
  protected readonly weekdayLabels = WEEKDAY_LABELS;
  protected readonly months = MONTH_LABELS;
  protected readonly fmtDate = (d: LocalDate) => formatLocalDate(d);

  protected readonly title = signal('');
  protected readonly targetKind = signal<'asset' | 'space'>('asset');
  protected readonly assetId = signal('');
  protected readonly spaceId = signal('');
  protected readonly description = signal('');
  protected readonly checklist = signal<string[]>([]);
  protected readonly rec = signal<RecurrenceForm>(defaultRecurrenceForm());
  protected readonly startsOn = signal('');
  protected readonly endsOn = signal('');
  protected readonly leadDays = signal(7);
  protected readonly assigneeNote = signal('');
  private version: number | undefined;

  protected readonly busy = signal(false);
  protected readonly error = signal<ErrorText | null>(null);
  protected readonly previewDates = signal<LocalDate[]>([]);
  protected readonly previewText = signal('');
  protected readonly previewLoading = signal(false);
  protected readonly previewError = signal<string | null>(null);

  protected readonly recError = computed(() => recurrenceError(this.rec()));
  protected readonly formError = computed(() => {
    if (!this.title().trim()) return 'Give the plan a title.';
    if (this.targetKind() === 'asset' ? !this.assetId() : !this.spaceId()) return 'Choose what it is for.';
    if (!this.startsOn()) return 'Pick a start date.';
    if (this.endsOn() && this.endsOn() < this.startsOn()) return 'The end date is before the start.';
    if (!(this.leadDays() >= 0 && this.leadDays() <= 90)) return 'Lead time must be 0 to 90 days.';
    return this.recError();
  });

  private previewTimer: ReturnType<typeof setTimeout> | undefined;
  private previewSeq = 0;

  constructor() {
    // Debounced live preview of the next 5 due dates.
    effect(() => {
      const recurrence = toRecurrence(this.rec());
      const startsOn = this.startsOn();
      const endsOn = this.rec().unit === 'ONCE' ? '' : this.endsOn();
      const invalid = this.recError() || !startsOn;
      this.previewText.set(describeRecurrence(recurrence));
      untracked(() => {
        clearTimeout(this.previewTimer);
        if (invalid) {
          this.previewDates.set([]);
          return;
        }
        this.previewTimer = setTimeout(() => void this.loadPreview(recurrence, startsOn, endsOn || null), 350);
      });
    });
  }

  ngOnInit(): void {
    const p = this.plan();
    if (p) {
      this.title.set(p.title);
      this.targetKind.set(p.assetId ? 'asset' : 'space');
      this.assetId.set(p.assetId ?? '');
      this.spaceId.set(p.spaceId ?? '');
      this.description.set(p.description ?? '');
      this.checklist.set([...p.checklist]);
      this.rec.set(fromRecurrence(p.recurrence, p.startsOn));
      this.startsOn.set(p.startsOn);
      this.endsOn.set(p.endsOn ?? '');
      this.leadDays.set(p.leadDays);
      this.assigneeNote.set(p.assigneeNote ?? '');
      this.version = p.version;
    } else {
      this.startsOn.set(this.today());
      this.rec.set(defaultRecurrenceForm(this.today()));
    }
  }

  private async loadPreview(recurrence: ReturnType<typeof toRecurrence>, startsOn: LocalDate, endsOn: LocalDate | null): Promise<void> {
    const seq = ++this.previewSeq;
    this.previewLoading.set(true);
    try {
      const res = await this.api.client.maintenance.preview(this.buildingId(), { recurrence, startsOn, endsOn, count: 5 });
      if (seq !== this.previewSeq) return;
      this.previewDates.set(res.dates);
      this.previewText.set(res.recurrenceText);
      this.previewError.set(res.dates.length ? null : 'No dates in that range.');
    } catch (e) {
      if (seq !== this.previewSeq) return;
      this.previewDates.set([]);
      this.previewError.set(problemOf(e)?.detail ?? describeError(e).title);
    } finally {
      if (seq === this.previewSeq) this.previewLoading.set(false);
    }
  }

  protected patchRec(patch: Partial<RecurrenceForm>): void {
    this.rec.update((r) => ({ ...r, ...patch }));
  }

  protected setUnit(u: RecurrenceUnit): void {
    this.rec.update((r) => changeUnit(r, u, this.startsOn() || undefined));
  }

  protected toggleDay(w: Weekday): void {
    this.rec.update((r) => ({ ...r, weekdays: toggleWeekday(r.weekdays, w) }));
  }

  protected addLine(): void {
    this.checklist.update((l) => [...l, '']);
  }

  protected setLine(i: number, v: string): void {
    this.checklist.update((l) => l.map((x, idx) => (idx === i ? v : x)));
  }

  protected removeLine(i: number): void {
    this.checklist.update((l) => l.filter((_, idx) => idx !== i));
  }

  private request(): SaveMaintenancePlanRequest {
    const asset = this.targetKind() === 'asset';
    return {
      assetId: asset ? this.assetId() : null,
      spaceId: asset ? null : this.spaceId(),
      title: this.title().trim(),
      description: this.description().trim() || null,
      checklist: this.checklist().map((l) => l.trim()).filter(Boolean),
      recurrence: toRecurrence(this.rec()),
      startsOn: this.startsOn(),
      endsOn: this.rec().unit === 'ONCE' ? null : this.endsOn() || null,
      leadDays: this.leadDays(),
      assigneeNote: this.assigneeNote().trim() || null,
      ...(this.version !== undefined ? { version: this.version } : {}),
    };
  }

  protected async save(): Promise<void> {
    if (this.formError() || this.busy()) return;
    this.busy.set(true);
    this.error.set(null);
    const p = this.plan();
    try {
      const saved = p
        ? await this.api.client.maintenance.update(this.buildingId(), p.id, this.request())
        : await this.api.client.maintenance.create(this.buildingId(), this.request());
      this.toast.success(p ? 'Plan saved' : 'Plan created', saved.nextDueOn ? `Next due ${formatLocalDate(saved.nextDueOn)}` : undefined);
      this.saved.emit(saved);
      this.closed.emit();
    } catch (e) {
      if (p && isConflict(e)) {
        // Someone else changed it: show their version and let the user redo the change.
        try {
          const fresh = await this.api.client.maintenance.get(this.buildingId(), p.id);
          this.version = fresh.version;
          this.toast.info(CONFLICT_RELOADED, 'Your edits are still in the form — save again to overwrite.');
        } catch (e2) {
          this.error.set(describeError(e2));
        }
      } else {
        this.error.set(describeError(e));
      }
    } finally {
      this.busy.set(false);
    }
  }
}
