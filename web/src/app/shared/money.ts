import { Money } from '@condo/shared';

/**
 * Money helpers. Amounts are decimal STRINGS (never JS numbers): arithmetic goes through BigInt at a
 * fixed scale, and formatting passes the string straight to Intl.NumberFormat (which accepts decimal strings).
 */

export const COMMON_CURRENCIES = ['EUR', 'GBP', 'USD', 'CHF', 'BRL'];

/** Minor-unit digits of a currency: EUR 2, JPY 0, BHD 3. Null for an unknown code. */
let knownCurrencies: Set<string> | null | undefined;

/** ISO 4217 codes this engine knows (Intl accepts any well-formed code, so check the list when available). */
function isKnownCurrency(code: string): boolean {
  if (knownCurrencies === undefined) {
    const intl = Intl as unknown as { supportedValuesOf?: (k: string) => string[] };
    try {
      knownCurrencies = intl.supportedValuesOf ? new Set(intl.supportedValuesOf('currency')) : null;
    } catch {
      knownCurrencies = null;
    }
  }
  return knownCurrencies ? knownCurrencies.has(code) : true;
}

export function currencyDecimals(currency: string): number | null {
  if (!/^[A-Z]{3}$/.test(currency) || !isKnownCurrency(currency)) return null;
  try {
    return new Intl.NumberFormat('en', { style: 'currency', currency }).resolvedOptions().maximumFractionDigits ?? 2;
  } catch {
    return null;
  }
}

export function isValidCurrency(code: string): boolean {
  return currencyDecimals(code) !== null;
}

export type AmountParse = { ok: true; amount: string } | { ok: false; error: string };

/**
 * Parses what a person typed into a canonical decimal string for `currency`:
 * accepts "120", "120.5", "120,50", "1 234.50", "1,234.50", "1.234,50", "1.234.567"; rejects negatives, letters,
 * more decimals than the currency allows, and an ambiguous single group like "1,234". Zero is rejected (a cost of nothing isn't a cost).
 */
export function parseAmount(input: string, currency: string): AmountParse {
  const decimals = currencyDecimals(currency);
  if (decimals === null) return { ok: false, error: `Unknown currency “${currency}”.` };
  let s = input.trim().replace(/[\s  ']/g, '');
  if (!s) return { ok: false, error: 'Enter an amount.' };
  if (s.startsWith('-')) return { ok: false, error: 'The amount must be positive.' };
  if (!/^[0-9.,]+$/.test(s)) return { ok: false, error: 'Use digits only, e.g. 120.50.' };

  // The last separator followed by 1..3 digits (and not a thousands group) is the decimal separator.
  const lastDot = s.lastIndexOf('.');
  const lastComma = s.lastIndexOf(',');
  const sepIdx = Math.max(lastDot, lastComma);
  let intPart = s;
  let fracPart = '';
  if (sepIdx >= 0) {
    const sep = s[sepIdx]!;
    const tail = s.slice(sepIdx + 1);
    const other = sep === '.' ? ',' : '.';
    const sepCount = s.split(sep).length - 1;
    // "1.234.567": several groups of three → thousands grouping. A single "1,234" is ambiguous
    // (one thousand two hundred… or 1.234?) unless the currency really has 3 decimals: ask instead of guessing.
    const grouped = tail.length === 3 && !s.includes(other) && sepCount > 1;
    if (tail.length === 3 && !s.includes(other) && sepCount === 1 && decimals !== 3) {
      return { ok: false, error: `Ambiguous amount: write it without thousands separators (e.g. ${s.split(sep).join('')}).` };
    }
    if (grouped) {
      intPart = s.split(sep).join('');
    } else {
      intPart = s.slice(0, sepIdx).split(other).join('').split(sep).join('');
      fracPart = tail;
    }
  }
  if (!/^\d+$/.test(intPart || '0') || (fracPart && !/^\d+$/.test(fracPart))) return { ok: false, error: 'That amount looks malformed.' };
  if (fracPart.length > decimals) {
    return { ok: false, error: decimals === 0 ? `${currency} has no decimals.` : `${currency} allows at most ${decimals} decimals.` };
  }
  intPart = intPart.replace(/^0+(?=\d)/, '') || '0';
  const amount = decimals > 0 ? `${intPart}.${fracPart.padEnd(decimals, '0')}` : intPart;
  if (/^0(\.0+)?$/.test(amount)) return { ok: false, error: 'The amount must be greater than zero.' };
  if (intPart.length > 15) return { ok: false, error: 'That amount is too large.' };
  return { ok: true, amount };
}

/** "120.50" EUR → "€120.50" (en) / "120,50 €" (pt-PT). Never goes through a float. */
export function formatMoney(m: Money, locale?: string): string {
  try {
    const fmt = new Intl.NumberFormat(locale, { style: 'currency', currency: m.currency });
    // format() accepts decimal strings (Intl.NumberFormat v3) — exact, no float rounding.
    return fmt.format(m.amount as unknown as number);
  } catch {
    return `${m.amount} ${m.currency}`;
  }
}

/** "€1,240.00 · £85.00" — one figure per currency, never summed across currencies. */
export function formatTotals(totals: readonly Money[], locale?: string): string {
  return totals.length ? totals.map((t) => formatMoney(t, locale)).join(' · ') : '—';
}

// ---------- exact decimal arithmetic ----------

const SCALE = 4; // the server stores NUMERIC(19,4)

export function toMinor(amount: string): bigint {
  const neg = amount.trim().startsWith('-');
  const [i = '0', f = ''] = amount.trim().replace(/^[-+]/, '').split('.');
  const v = BigInt(i || '0') * 10n ** BigInt(SCALE) + BigInt((f + '0'.repeat(SCALE)).slice(0, SCALE) || '0');
  return neg ? -v : v;
}

export function fromMinor(v: bigint, decimals: number): string {
  const neg = v < 0n;
  const abs = neg ? -v : v;
  const base = 10n ** BigInt(SCALE);
  const int = abs / base;
  const frac = (abs % base).toString().padStart(SCALE, '0').slice(0, Math.max(0, decimals));
  return `${neg ? '-' : ''}${int}${decimals > 0 ? '.' + frac.padEnd(decimals, '0') : ''}`;
}

/** Sums amounts per currency (exactly), keeping first-seen currency order. */
export function sumByCurrency(items: readonly Money[]): Money[] {
  const sums = new Map<string, bigint>();
  for (const m of items) sums.set(m.currency, (sums.get(m.currency) ?? 0n) + toMinor(m.amount));
  return [...sums].map(([currency, v]) => ({ currency, amount: fromMinor(v, currencyDecimals(currency) ?? 2) }));
}

/** a/b as a percentage with one decimal, computed on BigInts (for bar widths). */
export function percentOf(part: string, whole: string): number {
  const w = toMinor(whole);
  if (w <= 0n) return 0;
  return Number((toMinor(part) * 1000n) / w) / 10;
}
