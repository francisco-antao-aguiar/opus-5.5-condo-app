import { BookingPolicyDto, BusySlot, CostSummary } from '@condo/shared';
import { summaryLabel, summaryView, validateReceipt } from './costs';
import { currencyDecimals, formatMoney, formatTotals, parseAmount, percentOf, sumByCurrency } from './money';
import { changeUnit, defaultRecurrenceForm, describeRecurrence, fromRecurrence, recurrenceError, toRecurrence, toggleWeekday, weekdayOf } from './recurrence';
import { buildWeek, pickRange, weekBounds } from './slots';
import { addDays, formatRange, localParts, startOfWeek, zonedToUtc } from './zoned';

describe('recurrence builder ↔ Recurrence', () => {
  const base = { every: 2, weekdays: ['FRI', 'MON'] as const, dayOfMonth: 15, month: 3 };

  it('sends only the fields of the chosen unit', () => {
    expect(toRecurrence({ ...base, weekdays: [...base.weekdays], unit: 'ONCE' })).toEqual({ unit: 'ONCE' });
    expect(toRecurrence({ ...base, weekdays: [...base.weekdays], unit: 'DAY' })).toEqual({ unit: 'DAY', every: 2 });
    expect(toRecurrence({ ...base, weekdays: [...base.weekdays], unit: 'WEEK' })).toEqual({ unit: 'WEEK', every: 2, weekdays: ['MON', 'FRI'] });
    expect(toRecurrence({ ...base, weekdays: [...base.weekdays], unit: 'MONTH' })).toEqual({ unit: 'MONTH', every: 2, dayOfMonth: 15 });
    expect(toRecurrence({ ...base, weekdays: [...base.weekdays], unit: 'YEAR' })).toEqual({ unit: 'YEAR', every: 2, month: 3, dayOfMonth: 15 });
  });

  it('round-trips a saved recurrence, defaulting unused fields from the start date', () => {
    const f = fromRecurrence({ unit: 'MONTH', every: 6, dayOfMonth: 1 }, '2026-10-07');
    expect(f).toEqual({ unit: 'MONTH', every: 6, dayOfMonth: 1, month: 10, weekdays: ['WED'] });
    expect(toRecurrence(f)).toEqual({ unit: 'MONTH', every: 6, dayOfMonth: 1 });
    expect(fromRecurrence({ unit: 'ONCE' }).every).toBe(1);
  });

  it('seeds defaults from the start date and validates', () => {
    expect(defaultRecurrenceForm('2027-01-15')).toEqual({ unit: 'MONTH', every: 1, weekdays: ['FRI'], dayOfMonth: 15, month: 1 });
    expect(recurrenceError({ ...defaultRecurrenceForm(), unit: 'WEEK', weekdays: [] })).toContain('weekday');
    expect(recurrenceError({ ...defaultRecurrenceForm(), every: 0 })).toContain('1 to 365');
    expect(recurrenceError({ ...defaultRecurrenceForm(), dayOfMonth: 32 })).toContain('1 to 31');
    expect(recurrenceError({ ...defaultRecurrenceForm(), unit: 'ONCE', every: 0 })).toBeNull();
  });

  it('changing the unit resets every N and the fields the new unit does not use', () => {
    const sixMonthly = { unit: 'MONTH' as const, every: 6, weekdays: ['MON', 'TUE'] as ('MON' | 'TUE')[], dayOfMonth: 31, month: 7 };
    expect(changeUnit(sixMonthly, 'WEEK', '2026-10-09')).toEqual({ unit: 'WEEK', every: 1, weekdays: ['FRI'], dayOfMonth: 9, month: 10 });
    expect(toRecurrence(changeUnit(sixMonthly, 'WEEK', '2026-10-09'))).toEqual({ unit: 'WEEK', every: 1, weekdays: ['FRI'] });
    expect(toRecurrence(changeUnit(sixMonthly, 'YEAR', '2026-10-09'))).toEqual({ unit: 'YEAR', every: 1, month: 10, dayOfMonth: 9 });
    expect(changeUnit(sixMonthly, 'DAY')).toMatchObject({ unit: 'DAY', every: 1, weekdays: ['MON'], dayOfMonth: 1, month: 1 });
    expect(changeUnit(sixMonthly, 'MONTH')).toBe(sixMonthly); // same unit: untouched
  });

  it('describes recurrences and toggles weekdays in order', () => {
    expect(describeRecurrence({ unit: 'MONTH', every: 6, dayOfMonth: 1 })).toBe('Every 6 months on day 1');
    expect(describeRecurrence({ unit: 'WEEK', every: 1, weekdays: ['MON', 'THU'] })).toBe('Every week on Mon, Thu');
    expect(describeRecurrence({ unit: 'YEAR', every: 1, month: 1, dayOfMonth: 15 })).toBe('Every year on 15 January');
    expect(toggleWeekday(['FRI'], 'MON')).toEqual(['MON', 'FRI']);
    expect(toggleWeekday(['MON', 'FRI'], 'MON')).toEqual(['FRI']);
    expect(weekdayOf('2026-10-06')).toBe('TUE');
  });
});

describe('money', () => {
  it('knows each currency’s decimals', () => {
    expect(currencyDecimals('EUR')).toBe(2);
    expect(currencyDecimals('JPY')).toBe(0);
    expect(currencyDecimals('BHD')).toBe(3);
    expect(currencyDecimals('eur')).toBeNull();
    expect(currencyDecimals('XYZ1')).toBeNull();
  });

  it('parses typed amounts into canonical decimal strings', () => {
    expect(parseAmount('120', 'EUR')).toEqual({ ok: true, amount: '120.00' });
    expect(parseAmount('120,5', 'EUR')).toEqual({ ok: true, amount: '120.50' });
    expect(parseAmount('1 234.56', 'EUR')).toEqual({ ok: true, amount: '1234.56' });
    expect(parseAmount('1.234,56', 'EUR')).toEqual({ ok: true, amount: '1234.56' });
    expect(parseAmount('1,234.56', 'USD')).toEqual({ ok: true, amount: '1234.56' });
    expect(parseAmount('1.234.567', 'EUR')).toEqual({ ok: true, amount: '1234567.00' });
    expect(parseAmount('0.1', 'GBP')).toEqual({ ok: true, amount: '0.10' });
    expect(parseAmount('5000', 'JPY')).toEqual({ ok: true, amount: '5000' });
    expect(parseAmount('1.250', 'BHD')).toEqual({ ok: true, amount: '1.250' });
    expect(parseAmount('007.50', 'EUR')).toEqual({ ok: true, amount: '7.50' });
  });

  it('rejects bad amounts with a reason', () => {
    expect(parseAmount('12.3456', 'EUR')).toMatchObject({ ok: false, error: 'EUR allows at most 2 decimals.' });
    expect(parseAmount('1,234', 'EUR')).toMatchObject({ ok: false, error: expect.stringContaining('Ambiguous') });
    expect(parseAmount('12.5', 'JPY')).toMatchObject({ ok: false, error: 'JPY has no decimals.' });
    expect(parseAmount('-3', 'EUR').ok).toBe(false);
    expect(parseAmount('12a', 'EUR').ok).toBe(false);
    expect(parseAmount('0,00', 'EUR')).toMatchObject({ ok: false, error: 'The amount must be greater than zero.' });
    expect(parseAmount('', 'EUR').ok).toBe(false);
    expect(parseAmount('10', 'ZZZ').ok).toBe(false);
  });

  it('formats from strings without float rounding, per currency', () => {
    expect(formatMoney({ amount: '1234.50', currency: 'EUR' }, 'en-GB')).toBe('€1,234.50');
    expect(formatMoney({ amount: '5000', currency: 'JPY' }, 'en-US')).toBe('¥5,000');
    expect(formatMoney({ amount: '12345678901234.57', currency: 'USD' }, 'en-US')).toBe('$12,345,678,901,234.57');
    expect(formatTotals([{ amount: '10.00', currency: 'EUR' }, { amount: '5.00', currency: 'GBP' }], 'en-GB')).toBe('€10.00 · £5.00');
    expect(formatTotals([])).toBe('—');
  });

  it('sums exactly per currency, never across currencies', () => {
    expect(
      sumByCurrency([
        { amount: '0.10', currency: 'EUR' },
        { amount: '0.20', currency: 'EUR' },
        { amount: '3', currency: 'JPY' },
        { amount: '85.00', currency: 'GBP' },
        { amount: '1.70', currency: 'EUR' },
      ]),
    ).toEqual([
      { amount: '2.00', currency: 'EUR' },
      { amount: '3', currency: 'JPY' },
      { amount: '85.00', currency: 'GBP' },
    ]);
    expect(percentOf('25.00', '100.00')).toBe(25);
    expect(percentOf('1', '0')).toBe(0);
  });
});

describe('cost summary display', () => {
  const summary: CostSummary = {
    groupBy: 'month',
    rows: [
      { key: '2026-09', label: '2026-09', count: 2, totals: [{ amount: '50.00', currency: 'EUR' }, { amount: '10.00', currency: 'GBP' }] },
      { key: '2026-08', label: '2026-08', count: 3, totals: [{ amount: '200.00', currency: 'EUR' }] },
    ],
    totals: [{ amount: '250.00', currency: 'EUR' }, { amount: '10.00', currency: 'GBP' }],
  };

  it('orders months chronologically and scales bars per currency', () => {
    const v = summaryView(summary, 'en-GB');
    expect(v.map((r) => r.label)).toEqual(['Aug 2026', 'Sep 2026']);
    expect(v[0]!.bars).toEqual([{ currency: 'EUR', text: '€200.00', pct: 100 }]);
    expect(v[1]!.bars).toEqual([
      { currency: 'EUR', text: '€50.00', pct: 25 },
      { currency: 'GBP', text: '£10.00', pct: 100 },
    ]);
  });

  it('labels categories and keeps server order for other groupings', () => {
    expect(summaryLabel('category', 'REPAIR', 'REPAIR')).toBe('Repair');
    expect(summaryLabel('asset', 'id', '')).toBe('(none)');
    const v = summaryView({ groupBy: 'category', rows: [{ key: 'OTHER', label: 'OTHER', count: 1, totals: [{ amount: '1.00', currency: 'EUR' }] }, { key: 'CLEANING', label: 'CLEANING', count: 1, totals: [{ amount: '0.004', currency: 'EUR' }] }], totals: [] });
    expect(v.map((r) => r.label)).toEqual(['Other', 'Cleaning']);
    expect(v[1]!.bars[0]!.pct).toBe(1); // tiny values still get a visible sliver
  });

  it('validates receipts', () => {
    expect(validateReceipt({ name: 'r.pdf', type: 'application/pdf', size: 1000 })).toBeNull();
    expect(validateReceipt({ name: 'r.jpg', type: 'image/jpeg', size: 11 * 1024 * 1024 })).toContain('10 MB');
    expect(validateReceipt({ name: 'r.docx', type: 'application/msword', size: 10 })).toContain('PDF');
  });
});

describe('time zones', () => {
  it('converts local wall times in the building zone, independent of the browser', () => {
    expect(zonedToUtc('2026-07-01', '10:00', 'Europe/Lisbon')!.toISOString()).toBe('2026-07-01T09:00:00.000Z');
    expect(zonedToUtc('2026-01-15', '10:00', 'Europe/Lisbon')!.toISOString()).toBe('2026-01-15T10:00:00.000Z');
    expect(zonedToUtc('2026-07-01', '10:00', 'America/Sao_Paulo')!.toISOString()).toBe('2026-07-01T13:00:00.000Z');
    expect(localParts(new Date('2026-07-01T23:30:00Z'), 'Europe/Lisbon')).toEqual({ date: '2026-07-02', time: '00:30', weekday: 'THU' });
  });

  it('handles DST: the spring gap does not exist, the autumn hour resolves to its first occurrence', () => {
    // Lisbon: 2026-03-29 01:00 → 02:00 (gap), 2026-10-25 02:00 → 01:00 (repeat).
    expect(zonedToUtc('2026-03-29', '01:30', 'Europe/Lisbon')).toBeNull();
    expect(zonedToUtc('2026-03-29', '02:00', 'Europe/Lisbon')!.toISOString()).toBe('2026-03-29T01:00:00.000Z');
    expect(zonedToUtc('2026-10-25', '01:30', 'Europe/Lisbon')!.toISOString()).toBe('2026-10-25T00:30:00.000Z');
  });

  it('does local-date arithmetic and formats ranges in the building zone', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(startOfWeek('2026-10-08')).toBe('2026-10-05');
    expect(startOfWeek('2026-10-05')).toBe('2026-10-05');
    expect(formatRange('2026-10-10T17:00:00Z', '2026-10-10T19:00:00Z', 'Europe/Lisbon')).toBe('Sat 10 Oct, 18:00–20:00');
  });
});

describe('booking slot grid', () => {
  const policy: Pick<BookingPolicyDto, 'openingHours' | 'slotMinutes' | 'advanceDays' | 'minMinutes' | 'maxMinutes'> = {
    openingHours: { MON: [['10:00', '12:00']], SAT: [['00:00', '04:00']], SUN: [['00:00', '04:00']] },
    slotMinutes: 60,
    advanceDays: 60,
    minMinutes: 60,
    maxMinutes: 120,
  };
  const now = new Date('2026-03-20T00:00:00Z');

  it('lays out open-hour cells per local day and marks busy, mine, past and too-far', () => {
    const busy: BusySlot[] = [
      { startsAt: '2026-03-23T10:00:00Z', endsAt: '2026-03-23T11:00:00Z', status: 'PENDING', mine: false },
      { startsAt: '2026-03-23T11:00:00Z', endsAt: '2026-03-23T12:00:00Z', status: 'CONFIRMED', mine: true },
    ];
    const week = buildWeek(policy, 'Europe/Lisbon', '2026-03-23', busy, now);
    expect(week).toHaveLength(7);
    expect(week[0]!.weekday).toBe('MON');
    expect(week[0]!.cells.map((c) => [c.label, c.state])).toEqual([
      ['10:00', 'pending'],
      ['11:00', 'mine'],
    ]);
    expect(week[1]!.cells).toEqual([]); // Tuesday closed
    const later = buildWeek(policy, 'Europe/Lisbon', '2026-03-16', [], new Date('2026-03-16T10:30:00Z'), 1);
    expect(later[0]!.cells.map((c) => c.state)).toEqual(['past', 'free']);
    const far = buildWeek({ ...policy, advanceDays: 1 }, 'Europe/Lisbon', '2026-03-23', [], now, 1);
    expect(far[0]!.cells.every((c) => c.state === 'too-far')).toBe(true);
  });

  it('skips the nonexistent hour on the spring-forward day and keeps real-time slot ends', () => {
    // Sunday 2026-03-29 in Lisbon: 01:00 jumps to 02:00.
    const sunday = buildWeek(policy, 'Europe/Lisbon', '2026-03-29', [], now, 1)[0]!;
    expect(sunday.cells.map((c) => c.label)).toEqual(['00:00', '02:00', '03:00']);
    expect(sunday.cells[0]!.end.toISOString()).toBe('2026-03-29T01:00:00.000Z');
    expect(sunday.cells[1]!.start.toISOString()).toBe('2026-03-29T01:00:00.000Z'); // 02:00 WEST
    // 00:00 → 02:00 is back-to-back in real time even though the wall clock skips an hour.
    expect(pickRange(sunday, 0, 1, policy)).toMatchObject({ ok: true, minutes: 120 });
  });

  it('validates a picked range', () => {
    const saturday = buildWeek(policy, 'Europe/Lisbon', '2026-03-28', [], now, 1)[0]!;
    expect(pickRange(saturday, 2, 0, policy)).toMatchObject({ ok: false, error: 'Book at most 2 h.' });
    const r = pickRange(saturday, 1, 2, policy);
    expect(r).toMatchObject({ ok: true, minutes: 120 });
    const monday = buildWeek(policy, 'Europe/Lisbon', '2026-03-23', [{ startsAt: '2026-03-23T11:00:00Z', endsAt: '2026-03-23T12:00:00Z', status: 'PENDING', mine: false }], now, 1)[0]!;
    expect(pickRange(monday, 0, 1, policy)).toMatchObject({ ok: false, error: 'Part of that time is already taken.' });
    const twoRanges = buildWeek({ ...policy, openingHours: { MON: [['10:00', '11:00'], ['12:00', '13:00']] } }, 'Europe/Lisbon', '2026-03-23', [], now, 1)[0]!;
    expect(pickRange(twoRanges, 0, 1, policy)).toMatchObject({ ok: false, error: 'The space is closed for part of that time.' });
  });

  it('computes week bounds as instants of local midnights', () => {
    expect(weekBounds('2026-03-23', 'Europe/Lisbon')).toEqual({ from: '2026-03-23T00:00:00.000Z', to: '2026-03-29T23:00:00.000Z' });
  });
});
