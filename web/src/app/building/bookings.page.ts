import { Component, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { BookingDto, BookingPolicyDto, SpaceDto, UUID } from '@condo/shared';
import { ApiService } from '../core/api.service';
import { describeError, ErrorText } from '../core/errors';
import { ToastService } from '../core/toast.service';
import { BOOKING_STATUS_BADGE, BOOKING_STATUS_LABELS, bookingError, sortForQueue } from '../shared/bookings';
import { copyText } from '../shared/clipboard';
import { formatAgo } from '../shared/issues';
import { ReasonDialogComponent } from '../shared/reason-dialog.component';
import { spacesInTreeOrder } from '../shared/assets';
import { browserTimeZone, formatRange } from '../shared/zoned';
import { BookingCalendarComponent } from './booking-calendar.component';
import { BookingPolicyDialogComponent } from './booking-policy-dialog.component';
import { BuildingContext } from './building-context.service';

type Tab = 'book' | 'mine' | 'approvals' | 'spaces';
type Decision = { booking: BookingDto; kind: 'reject' | 'cancel' };

@Component({
  selector: 'app-bookings-page',
  imports: [RouterLink, BookingCalendarComponent, BookingPolicyDialogComponent, ReasonDialogComponent],
  templateUrl: './bookings.page.html',
})
export class BookingsPage {
  protected readonly ctx = inject(BuildingContext);
  private readonly api = inject(ApiService);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);

  /** ?tab= and ?space= (component input binding). */
  readonly tabParam = input<string>('', { alias: 'tab' });
  readonly space = input<string>();

  protected readonly statusLabels = BOOKING_STATUS_LABELS;
  protected readonly statusBadge = BOOKING_STATUS_BADGE;
  protected readonly browserTz = browserTimeZone();

  protected readonly canManage = computed(() => this.ctx.has('BOOKING_MANAGE'));
  protected readonly canBook = computed(() => this.ctx.has('BOOKING_CREATE'));
  protected readonly tabs = computed<Tab[]>(() => [
    ...(this.canBook() ? (['book', 'mine'] as Tab[]) : []),
    ...(this.canManage() ? (['approvals', 'spaces'] as Tab[]) : []),
  ]);
  protected readonly tab = computed<Tab>(() => {
    const t = this.tabParam() as Tab;
    return this.tabs().includes(t) ? t : (this.tabs()[0] ?? 'book');
  });
  protected readonly tabLabels: Record<Tab, string> = { book: 'Book a space', mine: 'My bookings', approvals: 'Approvals', spaces: 'Bookable spaces' };
  protected readonly tz = computed(() => this.ctx.building()?.timeZone ?? 'Europe/Lisbon');

  protected readonly bookable = signal<BookingPolicyDto[]>([]);
  protected readonly selectedSpaceId = signal('');
  protected readonly selectedPolicy = computed(() => this.bookable().find((p) => p.spaceId === this.selectedSpaceId() && p.enabled) ?? null);
  protected readonly enabledSpaces = computed(() => this.bookable().filter((p) => p.enabled));

  protected readonly mine = signal<BookingDto[]>([]);
  protected readonly queue = signal<BookingDto[]>([]);
  protected readonly loading = signal(false);
  protected readonly error = signal<ErrorText | null>(null);
  protected readonly busyId = signal<UUID | null>(null);
  protected readonly decision = signal<Decision | null>(null);
  protected readonly editingPolicy = signal<{ space: SpaceDto; policy: BookingPolicyDto | null } | null>(null);

  protected readonly pendingCount = computed(() => this.queue().filter((b) => b.status === 'PENDING').length);
  protected readonly commonAreas = computed(() =>
    spacesInTreeOrder(this.ctx.spaces()).filter((o) => o.space.type === 'COMMON_AREA' || this.bookable().some((p) => p.spaceId === o.space.id)),
  );
  protected readonly policyBySpace = computed(() => new Map(this.bookable().map((p) => [p.spaceId, p])));

  constructor() {
    effect(() => {
      const s = this.space() ?? '';
      untracked(() => {
        if (s) this.selectedSpaceId.set(s);
      });
    });
    effect(() => {
      const id = this.ctx.buildingId();
      const tab = this.tab();
      if (id) untracked(() => void this.load(tab));
    });
  }

  private get bid(): UUID {
    return this.ctx.buildingId()!;
  }

  protected range(b: BookingDto): string {
    return formatRange(b.startsAt, b.endsAt, this.tz());
  }

  protected age(b: BookingDto): string {
    return formatAgo(b.createdAt);
  }

  /** Waiting longer than the 48 h reminder threshold. */
  protected waitedLong(b: BookingDto): boolean {
    return Date.now() - new Date(b.createdAt).getTime() > 48 * 3_600_000;
  }

  protected setTab(t: Tab): void {
    void this.router.navigate([], { queryParams: { tab: t }, queryParamsHandling: 'merge' });
  }

  protected async load(tab: Tab = this.tab()): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    const c = this.api.client.bookings;
    try {
      if (tab === 'book' || tab === 'spaces') {
        const list = await c.bookableSpaces(this.bid);
        this.bookable.set(list);
        if (tab === 'book' && !this.selectedPolicy()) this.selectedSpaceId.set(list.find((p) => p.enabled)?.spaceId ?? '');
      }
      if (tab === 'mine' || tab === 'book') this.mine.set(sortForQueue(await c.list(this.bid, { mine: true })));
      if (tab === 'approvals') {
        const from = new Date(Date.now() - 86_400_000).toISOString();
        this.queue.set(sortForQueue(await c.list(this.bid, { status: 'PENDING,CONFIRMED', from })));
      }
    } catch (e) {
      this.error.set(describeError(e));
    } finally {
      this.loading.set(false);
    }
  }

  protected pickSpace(id: string): void {
    this.selectedSpaceId.set(id);
    void this.router.navigate([], { queryParams: { space: id || null }, queryParamsHandling: 'merge', replaceUrl: true });
  }

  protected onRequested(): void {
    void this.api.client.bookings.list(this.bid, { mine: true }).then((l) => this.mine.set(sortForQueue(l)), () => undefined);
  }

  // ---------- decisions ----------

  protected async approve(b: BookingDto): Promise<void> {
    this.busyId.set(b.id);
    try {
      await this.api.client.bookings.approve(this.bid, b.id, {});
      this.toast.success(`Approved: ${b.spaceName}`, this.range(b));
    } catch (e) {
      const err = bookingError(e);
      this.toast.info(err.title, err.detail);
    } finally {
      this.busyId.set(null);
      await this.load();
    }
  }

  protected async decide(d: Decision, note: string): Promise<void> {
    this.busyId.set(d.booking.id);
    try {
      if (d.kind === 'reject') await this.api.client.bookings.reject(this.bid, d.booking.id, { note: note || null });
      else await this.api.client.bookings.cancel(this.bid, d.booking.id, { note: note || null });
      this.toast.success(d.kind === 'reject' ? 'Request rejected' : d.booking.mine && d.booking.status === 'PENDING' ? 'Request withdrawn' : 'Booking cancelled');
      this.decision.set(null);
    } catch (e) {
      const err = bookingError(e);
      this.toast.info(err.title, err.detail);
      this.decision.set(null);
    } finally {
      this.busyId.set(null);
      await this.load();
    }
  }

  protected async copyCalendarLink(): Promise<void> {
    try {
      const { url } = await this.api.client.bookings.calendarLink();
      if (await copyText(url)) this.toast.success('Calendar link copied', 'Add it to your calendar app as a subscription (“From URL”).');
      else this.toast.info('Copy this link into your calendar app', url);
    } catch (e) {
      this.toast.error(e);
    }
  }

  // ---------- policies ----------

  protected editPolicy(space: SpaceDto): void {
    this.editingPolicy.set({ space, policy: this.policyBySpace().get(space.id) ?? null });
  }
}
