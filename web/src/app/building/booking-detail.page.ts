import { Component, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { RouterLink } from '@angular/router';
import { BookingDto, UUID } from '@condo/shared';
import { ApiService } from '../core/api.service';
import { describeError, errorCode, ErrorText } from '../core/errors';
import { ToastService } from '../core/toast.service';
import { BOOKING_STATUS_BADGE, BOOKING_STATUS_LABELS, bookingError } from '../shared/bookings';
import { formatAgo } from '../shared/issues';
import { ReasonDialogComponent } from '../shared/reason-dialog.component';
import { formatInZone, formatRange } from '../shared/zoned';
import { BuildingContext } from './building-context.service';

/** /buildings/:id/bookings/:bookingId — where booking notifications link to. */
@Component({
  selector: 'app-booking-detail-page',
  imports: [RouterLink, ReasonDialogComponent],
  template: `
    <p class="breadcrumb"><a [routerLink]="['/buildings', ctx.buildingId(), 'bookings']" [queryParams]="{ tab: ctx.has('BOOKING_MANAGE') && !booking()?.mine ? 'approvals' : 'mine' }">‹ Bookings</a></p>
    @if (loading()) {
      <p class="muted">Loading booking…</p>
    } @else if (error(); as e) {
      <div class="alert alert-error" role="alert"><strong>{{ e.title }}</strong>@if (e.detail) {<p>{{ e.detail }}</p>}</div>
    } @else if (booking(); as b) {
      <section class="card booking-detail">
        <div class="row gap wrap">
          <h1 class="grow">{{ b.spaceName }}</h1>
          <span [class]="'badge ' + badge[b.status]">{{ labels[b.status] }}</span>
        </div>
        <p class="booking-when"><strong>{{ range(b) }}</strong> <span class="muted small">({{ tz() }})</span></p>
        <dl class="kv">
          @if (b.requestedByName) {
            <dt>Requested by</dt>
            <dd>{{ b.requestedByName }}@if (b.unitName) { · {{ b.unitName }}} · {{ ago(b.createdAt) }}</dd>
          }
          @if (b.note) {
            <dt>Note</dt>
            <dd>“{{ b.note }}”</dd>
          }
          @if (b.decidedByName) {
            <dt>{{ b.status === 'CANCELLED' ? 'Cancelled by' : 'Decided by' }}</dt>
            <dd>{{ b.decidedByName }}@if (b.decidedAt) { · {{ when(b.decidedAt) }}}</dd>
          }
          @if (b.decisionNote) {
            <dt>Reason</dt>
            <dd>“{{ b.decisionNote }}”</dd>
          }
        </dl>
        @if (b.status === 'PENDING' && b.mine) {
          <p class="alert alert-info">Waiting for an admin to approve. You'll get a notification when it's decided.</p>
        }
        <div class="actions">
          @if (b.canDecide && b.status === 'PENDING') {
            <button type="button" class="btn btn-primary" [disabled]="busy()" (click)="approve(b)">Approve</button>
            <button type="button" class="btn btn-danger" [disabled]="busy()" (click)="decision.set('reject')">Reject…</button>
          }
          @if (b.canCancel && (b.status === 'PENDING' || b.status === 'CONFIRMED')) {
            <button type="button" class="btn btn-danger" [disabled]="busy()" (click)="decision.set('cancel')">{{ b.mine && b.status === 'PENDING' ? 'Withdraw' : 'Cancel booking' }}</button>
          }
        </div>
      </section>
    } @else {
      <section class="full-page">
        <h1>Booking not found</h1>
        <p class="muted">It may belong to someone else, or it was removed.</p>
      </section>
    }

    @if (decision(); as kind) {
      <app-reason-dialog
        [title]="kind === 'reject' ? 'Reject this request?' : 'Cancel this booking?'"
        [label]="booking()?.mine ? 'Note' : 'Reason (shown to the requester)'"
        [confirmText]="kind === 'reject' ? 'Reject' : 'Cancel booking'"
        [busy]="busy()"
        (confirmed)="decide(kind, $event)"
        (closed)="decision.set(null)"
      />
    }
  `,
})
export class BookingDetailPage {
  protected readonly ctx = inject(BuildingContext);
  private readonly api = inject(ApiService);
  private readonly toast = inject(ToastService);

  readonly bookingId = input.required<string>();

  protected readonly labels = BOOKING_STATUS_LABELS;
  protected readonly badge = BOOKING_STATUS_BADGE;
  protected readonly booking = signal<BookingDto | null>(null);
  protected readonly loading = signal(true);
  protected readonly error = signal<ErrorText | null>(null);
  protected readonly busy = signal(false);
  protected readonly decision = signal<'reject' | 'cancel' | null>(null);
  protected readonly tz = computed(() => this.ctx.building()?.timeZone ?? 'Europe/Lisbon');
  protected readonly ago = formatAgo;

  constructor() {
    effect(() => {
      const id = this.bookingId();
      const b = this.ctx.buildingId();
      if (b && id) untracked(() => void this.load());
    });
  }

  private get bid(): UUID {
    return this.ctx.buildingId()!;
  }

  protected range(b: BookingDto): string {
    return formatRange(b.startsAt, b.endsAt, this.tz());
  }

  protected when(i: string): string {
    return formatInZone(i, this.tz());
  }

  protected async load(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      this.booking.set(await this.api.client.bookings.get(this.bid, this.bookingId()));
    } catch (e) {
      // 404 (not mine / not visible) renders the "not found" state; anything else is an error.
      this.booking.set(null);
      if (errorCode(e) !== 'NOT_FOUND') this.error.set(describeError(e));
    } finally {
      this.loading.set(false);
    }
  }

  protected async approve(b: BookingDto): Promise<void> {
    this.busy.set(true);
    try {
      this.booking.set(await this.api.client.bookings.approve(this.bid, b.id, {}));
      this.toast.success('Approved');
    } catch (e) {
      const err = bookingError(e);
      this.toast.info(err.title, err.detail);
      await this.load();
    } finally {
      this.busy.set(false);
    }
  }

  protected async decide(kind: 'reject' | 'cancel', note: string): Promise<void> {
    const b = this.booking();
    if (!b) return;
    this.busy.set(true);
    try {
      const updated = kind === 'reject' ? await this.api.client.bookings.reject(this.bid, b.id, { note: note || null }) : await this.api.client.bookings.cancel(this.bid, b.id, { note: note || null });
      this.booking.set(updated);
      this.toast.success(kind === 'reject' ? 'Request rejected' : b.mine && b.status === 'PENDING' ? 'Request withdrawn' : 'Booking cancelled');
    } catch (e) {
      const err = bookingError(e);
      this.toast.info(err.title, err.detail);
      await this.load();
    } finally {
      this.busy.set(false);
      this.decision.set(null);
    }
  }
}
