import { Component, computed, inject, input, OnInit, output, signal } from '@angular/core';
import { BookingPolicyDto, OpeningHours, SaveBookingPolicyRequest, UUID, Weekday } from '@condo/shared';
import { ApiService } from '../core/api.service';
import { CONFLICT_RELOADED, describeError, ErrorText, isConflict } from '../core/errors';
import { ToastService } from '../core/toast.service';
import { copyHoursToAll, defaultPolicy, policyError } from '../shared/bookings';
import { ModalComponent } from '../shared/modal.component';
import { WEEKDAYS, WEEKDAY_LABELS } from '../shared/recurrence';

/** Make a common area bookable and edit its rules, with an opening-hours grid per weekday. */
@Component({
  selector: 'app-booking-policy-dialog',
  imports: [ModalComponent],
  template: `
    <app-modal [title]="'Booking · ' + spaceName()" [wide]="true" (closed)="closed.emit()">
      <label class="check">
        <input type="checkbox" [checked]="p().enabled" (change)="patch({ enabled: $any($event.target).checked })" />
        <span><strong>Members can request this space</strong></span>
      </label>
      @if (existing() && !p().enabled) {
        <p class="alert alert-warn small">Turning booking off keeps existing bookings; new requests are refused.</p>
      }

      <div class="grid-3">
        <label class="field">
          <span>Slot length (min)</span>
          <select [value]="p().slotMinutes" (change)="patch({ slotMinutes: +$any($event.target).value })">
            @for (m of [15, 30, 60, 120]; track m) {
              <option [value]="m" [selected]="m === p().slotMinutes">{{ m }}</option>
            }
          </select>
        </label>
        <label class="field">
          <span>Shortest booking (min)</span>
          <input type="number" [step]="p().slotMinutes" [min]="p().slotMinutes" [value]="p().minMinutes" (input)="patch({ minMinutes: +$any($event.target).value })" />
        </label>
        <label class="field">
          <span>Longest booking (min)</span>
          <input type="number" [step]="p().slotMinutes" [min]="p().minMinutes" [value]="p().maxMinutes" (input)="patch({ maxMinutes: +$any($event.target).value })" />
        </label>
        <label class="field">
          <span>Book up to (days ahead)</span>
          <input type="number" min="1" max="365" [value]="p().advanceDays" (input)="patch({ advanceDays: +$any($event.target).value })" />
        </label>
        <label class="field">
          <span>Active bookings per unit <small class="muted">(empty = no limit)</small></span>
          <input type="number" min="1" [value]="p().maxActivePerUnit ?? ''" (input)="patch({ maxActivePerUnit: $any($event.target).value === '' ? null : +$any($event.target).value })" />
        </label>
        <label class="field">
          <span>Residents can cancel until (h before)</span>
          <input type="number" min="0" [value]="p().cancelCutoffHours" (input)="patch({ cancelCutoffHours: +$any($event.target).value })" />
        </label>
      </div>

      <fieldset class="field">
        <legend>Opening hours <small class="muted">({{ timeZone() }})</small></legend>
        <table class="hours-grid">
          <tbody>
            @for (d of weekdays; track d) {
              <tr>
                <th scope="row">{{ weekdayLabels[d] }}</th>
                <td>
                  @for (r of p().openingHours[d] ?? []; track $index; let ri = $index) {
                    <span class="hours-range">
                      <input type="time" [value]="r[0]" (change)="setTime(d, ri, 0, $any($event.target).value)" [attr.aria-label]="d + ' opens'" />
                      –
                      <input type="time" [value]="r[1] === '24:00' ? '23:59' : r[1]" (change)="setTime(d, ri, 1, $any($event.target).value)" [attr.aria-label]="d + ' closes'" />
                      <button type="button" class="btn-icon" aria-label="Remove range" (click)="removeRange(d, ri)">✕</button>
                    </span>
                  } @empty {
                    <span class="muted small">Closed</span>
                  }
                </td>
                <td class="cell-actions">
                  <button type="button" class="btn btn-sm" (click)="addRange(d)">＋</button>
                  @if (d === 'MON') {
                    <button type="button" class="btn btn-sm" (click)="copyMonday()">Copy to all days</button>
                  }
                </td>
              </tr>
            }
          </tbody>
        </table>
        <small class="muted">Pick 23:59 to mean “until midnight”.</small>
      </fieldset>

      <label class="field">
        <span>House rules <small class="muted">(shown before every request)</small></span>
        <textarea rows="4" maxlength="4000" [value]="p().rulesText ?? ''" (input)="patch({ rulesText: $any($event.target).value || null })" placeholder="e.g. Leave the room clean. Music off by 23:00."></textarea>
      </label>

      @if (formError(); as fe) {
        <p class="field-error">{{ fe }}</p>
      }
      @if (error(); as e) {
        <div class="alert alert-error" role="alert"><strong>{{ e.title }}</strong>@if (e.detail) {<p>{{ e.detail }}</p>}</div>
      }
      <div modal-footer>
        <button type="button" class="btn" (click)="closed.emit()">Cancel</button>
        <button type="button" class="btn btn-primary" [disabled]="busy() || !!formError()" (click)="save()">{{ busy() ? 'Saving…' : 'Save' }}</button>
      </div>
    </app-modal>
  `,
})
export class BookingPolicyDialogComponent implements OnInit {
  private readonly api = inject(ApiService);
  private readonly toast = inject(ToastService);

  readonly buildingId = input.required<UUID>();
  readonly spaceId = input.required<UUID>();
  readonly spaceName = input.required<string>();
  readonly timeZone = input('Europe/Lisbon');
  /** Current policy, or null to create one. */
  readonly existing = input<BookingPolicyDto | null>(null);
  readonly closed = output<void>();
  readonly saved = output<BookingPolicyDto>();

  protected readonly weekdays = WEEKDAYS;
  protected readonly weekdayLabels = WEEKDAY_LABELS;
  protected readonly p = signal<SaveBookingPolicyRequest>(defaultPolicy());
  protected readonly busy = signal(false);
  protected readonly error = signal<ErrorText | null>(null);
  protected readonly formError = computed(() => policyError(this.p()));

  ngOnInit(): void {
    const e = this.existing();
    if (e) {
      this.p.set({
        enabled: e.enabled,
        slotMinutes: e.slotMinutes,
        minMinutes: e.minMinutes,
        maxMinutes: e.maxMinutes,
        openingHours: structuredClone(e.openingHours),
        advanceDays: e.advanceDays,
        maxActivePerUnit: e.maxActivePerUnit,
        cancelCutoffHours: e.cancelCutoffHours,
        rulesText: e.rulesText,
        version: e.version,
      });
    }
  }

  protected patch(v: Partial<SaveBookingPolicyRequest>): void {
    this.p.update((p) => ({ ...p, ...v }));
  }

  private setHours(fn: (h: OpeningHours) => void): void {
    this.p.update((p) => {
      const hours = structuredClone(p.openingHours);
      fn(hours);
      return { ...p, openingHours: hours };
    });
  }

  protected setTime(d: Weekday, ri: number, which: 0 | 1, value: string): void {
    const v = which === 1 && value === '23:59' ? '24:00' : value;
    this.setHours((h) => {
      const r = h[d]?.[ri];
      if (r) r[which] = v;
    });
  }

  protected addRange(d: Weekday): void {
    this.setHours((h) => {
      const list = h[d] ?? [];
      const last = list[list.length - 1];
      list.push(last ? [last[1] === '24:00' ? '23:00' : last[1], '24:00'] : ['10:00', '22:00']);
      h[d] = list;
    });
  }

  protected removeRange(d: Weekday, ri: number): void {
    this.setHours((h) => {
      h[d] = (h[d] ?? []).filter((_, i) => i !== ri);
      if (!h[d]!.length) delete h[d];
    });
  }

  protected copyMonday(): void {
    this.p.update((p) => ({ ...p, openingHours: copyHoursToAll(p.openingHours, 'MON') }));
  }

  protected async save(): Promise<void> {
    if (this.formError() || this.busy()) return;
    this.busy.set(true);
    this.error.set(null);
    try {
      const saved = await this.api.client.bookings.savePolicy(this.buildingId(), this.spaceId(), this.p());
      this.toast.success(saved.enabled ? `${this.spaceName()} is bookable` : `Booking turned off for ${this.spaceName()}`);
      this.saved.emit(saved);
      this.closed.emit();
    } catch (e) {
      if (isConflict(e)) {
        try {
          const fresh = await this.api.client.bookings.getPolicy(this.buildingId(), this.spaceId());
          this.patch({ version: fresh.version });
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
