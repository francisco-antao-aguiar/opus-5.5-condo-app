import { Component, computed, effect, inject, input, output, signal, untracked } from '@angular/core';
import { Availability, BookingDto, BookingPolicyDto, UUID } from '@condo/shared';
import { ApiService } from '../core/api.service';
import { describeError, ErrorText } from '../core/errors';
import { ToastService } from '../core/toast.service';
import { bookingError } from '../shared/bookings';
import { DayColumn, RangePick, buildWeek, durationText, pickRange, weekBounds } from '../shared/slots';
import { addDays, browserTimeZone, formatLocalDate, formatRange, startOfWeek, todayIn } from '../shared/zoned';

interface Anchor {
  day: number;
  cell: number;
}

/** Week calendar for one bookable space: pick a free range, read the rules, request it. */
@Component({
  selector: 'app-booking-calendar',
  template: `
    <div class="cal-head row gap wrap">
      <button type="button" class="btn btn-sm" [disabled]="weekStart() <= thisWeek()" (click)="shift(-7)">‹ Previous</button>
      <strong class="grow center">{{ weekLabel() }}</strong>
      <button type="button" class="btn btn-sm" (click)="shift(7)">Next ›</button>
    </div>
    @if (tz() !== browserTz) {
      <p class="muted small center">Times are in the building's time zone ({{ tz() }}).</p>
    }
    <div class="cal-legend small muted">
      <span><i class="lg lg-free"></i> free</span>
      <span><i class="lg lg-pending"></i> requested (waiting for approval)</span>
      <span><i class="lg lg-confirmed"></i> booked</span>
      <span><i class="lg lg-mine"></i> yours</span>
    </div>

    @if (error(); as e) {
      <div class="alert alert-error" role="alert"><strong>{{ e.title }}</strong>@if (e.detail) {<p>{{ e.detail }}</p>}</div>
    }

    <div class="cal-grid" [class.busy]="loading()">
      @for (d of days(); track d.date; let di = $index) {
        <div class="cal-day">
          <div class="cal-day-head" [class.today]="d.date === today()">{{ dayLabel(d.date) }}</div>
          @for (c of d.cells; track c.start.getTime(); let ci = $index) {
            <button
              type="button"
              class="cal-cell"
              [class]="'cal-cell s-' + c.state"
              [class.sel]="isSelected(di, ci)"
              [class.anchor]="anchor()?.day === di && anchor()?.cell === ci"
              [disabled]="c.state !== 'free'"
              [attr.aria-label]="dayLabel(d.date) + ' ' + c.label + ' ' + c.state"
              (click)="clickCell(di, ci)"
            >
              {{ c.label }}
            </button>
          } @empty {
            <p class="cal-closed muted small">Closed</p>
          }
        </div>
      }
    </div>

    @if (pickError()) {
      <p class="field-error">{{ pickError() }}</p>
    } @else if (!range()) {
      <p class="muted small">
        Click a free start time, then the last slot you need ({{ dur(policy().minMinutes) }}–{{ dur(policy().maxMinutes) }}, in {{ policy().slotMinutes }}-minute steps).
      </p>
    }

    @if (range(); as r) {
      @if (r.ok) {
        <div class="card request-card">
          <h3>Request {{ policy().spaceName }}: {{ rangeText(r) }} <span class="muted small">({{ dur(r.minutes) }})</span></h3>
          @if (policy().rulesText) {
            <div class="rules">
              <strong>House rules</strong>
              <p class="pre">{{ policy().rulesText }}</p>
            </div>
            <label class="check">
              <input type="checkbox" [checked]="accepted()" (change)="accepted.set($any($event.target).checked)" />
              <span>I've read the house rules</span>
            </label>
          }
          <label class="field">
            <span>Note for the admin <small class="muted">(optional)</small></span>
            <input type="text" maxlength="500" [value]="note()" (input)="note.set($any($event.target).value)" placeholder="e.g. Birthday, about 20 people" />
          </label>
          <p class="muted small">Every request is reviewed by a building admin. The time is held for you meanwhile.</p>
          <div class="actions">
            <button type="button" class="btn" (click)="clear()">Change time</button>
            <button type="button" class="btn btn-primary" [disabled]="busy() || (!!policy().rulesText && !accepted())" (click)="request(r)">
              {{ busy() ? 'Sending…' : 'Request booking' }}
            </button>
          </div>
        </div>
      }
    }
  `,
})
export class BookingCalendarComponent {
  private readonly api = inject(ApiService);
  private readonly toast = inject(ToastService);

  readonly buildingId = input.required<UUID>();
  readonly policy = input.required<BookingPolicyDto>();
  readonly requested = output<BookingDto>();

  protected readonly browserTz = browserTimeZone();
  protected readonly tz = computed(() => this.policy().timeZone);
  protected readonly today = computed(() => todayIn(this.tz()));
  protected readonly thisWeek = computed(() => startOfWeek(this.today()));
  protected readonly weekStart = signal('');
  protected readonly availability = signal<Availability | null>(null);
  protected readonly loading = signal(false);
  protected readonly error = signal<ErrorText | null>(null);
  protected readonly now = signal(new Date());

  protected readonly anchor = signal<Anchor | null>(null);
  protected readonly focus = signal<Anchor | null>(null);
  protected readonly note = signal('');
  protected readonly accepted = signal(false);
  protected readonly busy = signal(false);

  /** The policy from availability is the freshest; fall back to the input. */
  private readonly effectivePolicy = computed(() => this.availability()?.policy ?? this.policy());
  protected readonly days = computed<DayColumn[]>(() =>
    this.weekStart() ? buildWeek(this.effectivePolicy(), this.tz(), this.weekStart(), this.availability()?.busy ?? [], this.now()) : [],
  );
  protected readonly range = computed<RangePick | null>(() => {
    const a = this.anchor();
    const f = this.focus();
    if (!a || !f || a.day !== f.day) return null;
    return pickRange(this.days()[a.day]!, a.cell, f.cell, this.effectivePolicy());
  });
  protected readonly pickError = computed(() => {
    const r = this.range();
    return r && !r.ok ? r.error : null;
  });
  protected readonly weekLabel = computed(() => {
    const s = this.weekStart();
    if (!s) return '';
    return `${formatLocalDate(s, { day: 'numeric', month: 'short' })} – ${formatLocalDate(addDays(s, 6), { day: 'numeric', month: 'short', year: 'numeric' })}`;
  });
  protected readonly dur = durationText;

  private seq = 0;
  private endPicked = false;

  constructor() {
    effect(() => {
      const start = this.thisWeek();
      this.policy().spaceId; // reset when the space changes
      untracked(() => {
        this.weekStart.set(start);
        this.clear();
      });
    });
    effect(() => {
      const w = this.weekStart();
      const p = this.policy();
      if (w) untracked(() => void this.load(p.spaceId, w));
    });
  }

  private async load(spaceId: UUID, weekStart: string): Promise<void> {
    const seq = ++this.seq;
    this.loading.set(true);
    this.error.set(null);
    try {
      const { from, to } = weekBounds(weekStart, this.tz());
      const a = await this.api.client.bookings.availability(this.buildingId(), spaceId, from, to);
      if (seq !== this.seq) return;
      this.availability.set(a);
      this.now.set(new Date());
    } catch (e) {
      if (seq === this.seq) this.error.set(describeError(e));
    } finally {
      if (seq === this.seq) this.loading.set(false);
    }
  }

  protected shift(days: number): void {
    this.clear();
    this.weekStart.update((w) => addDays(w, days));
  }

  protected dayLabel(date: string): string {
    return formatLocalDate(date, { weekday: 'short', day: 'numeric', month: 'short' });
  }

  protected clickCell(day: number, cell: number): void {
    const a = this.anchor();
    if (!a || a.day !== day || this.endPicked) {
      // First click (or a new selection): start here. A single slot may already satisfy the minimum.
      this.anchor.set({ day, cell });
      this.focus.set({ day, cell });
      this.endPicked = false;
      return;
    }
    // Second click on the same day: the end of the range.
    this.focus.set({ day, cell });
    this.endPicked = true;
  }

  protected isSelected(day: number, cell: number): boolean {
    const a = this.anchor();
    const f = this.focus();
    if (!a || !f || a.day !== day) return false;
    return cell >= Math.min(a.cell, f.cell) && cell <= Math.max(a.cell, f.cell);
  }

  protected rangeText(r: Extract<RangePick, { ok: true }>): string {
    return formatRange(r.startsAt, r.endsAt, this.tz());
  }

  protected clear(): void {
    this.endPicked = false;
    this.anchor.set(null);
    this.focus.set(null);
    this.accepted.set(false);
  }

  protected async request(r: Extract<RangePick, { ok: true }>): Promise<void> {
    this.busy.set(true);
    try {
      const b = await this.api.client.bookings.request(this.buildingId(), {
        spaceId: this.policy().spaceId,
        startsAt: r.startsAt.toISOString(),
        endsAt: r.endsAt.toISOString(),
        note: this.note().trim() || null,
      });
      this.toast.success('Request sent', 'Waiting for an admin to approve. We’ll notify you.');
      this.note.set('');
      this.clear();
      this.requested.emit(b);
      void this.load(this.policy().spaceId, this.weekStart());
    } catch (e) {
      const err = bookingError(e);
      this.toast.info(err.title, err.detail);
      void this.load(this.policy().spaceId, this.weekStart());
    } finally {
      this.busy.set(false);
    }
  }
}
