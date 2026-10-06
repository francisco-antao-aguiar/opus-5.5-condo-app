import type { Money } from '@condo/shared';

/**
 * Money stays a decimal STRING + ISO 4217 currency end to end (never a JS number). Sums use BigInt
 * scaled to 4 decimals (the server's NUMERIC(19,4)); only the final display goes through Intl.
 */

const SCALE = 4;

/** Minor units for a currency (2 EUR, 0 JPY, 3 BHD), from Intl; 2 if unknown. */
export function currencyDecimals(currency: string): number {
  try {
    return new Intl.NumberFormat('en', { style: 'currency', currency }).resolvedOptions().maximumFractionDigits ?? 2;
  } catch {
    return 2;
  }
}

export function isKnownCurrency(code: string): boolean {
  if (!/^[A-Z]{3}$/.test(code)) return false;
  try {
    new Intl.NumberFormat('en', { style: 'currency', currency: code });
    return true;
  } catch {
    return false;
  }
}

/**
 * Validates what the user typed ("12,5", "1 234.50") for a currency. Returns the normalized decimal
 * string ("12.50"→ kept as typed digits, "12,5" → "12.5") or an error message.
 */
export function parseAmount(input: string, currency: string): { amount: string } | { error: string } {
  const text = input.replace(/\s/g, '').replace(',', '.');
  if (!text) return { error: 'Enter an amount' };
  if (!/^\d+(\.\d+)?$/.test(text)) return { error: 'Use digits and one decimal separator, e.g. 120.50' };
  const decimals = text.includes('.') ? text.split('.')[1].length : 0;
  const allowed = currencyDecimals(currency);
  if (decimals > allowed) {
    return { error: allowed === 0 ? `${currency} has no decimals` : `${currency} allows at most ${allowed} decimals` };
  }
  if (/^0+(\.0+)?$/.test(text)) return { error: 'The amount must be more than zero' };
  return { amount: text.replace(/^0+(?=\d)/, '') };
}

function toScaled(amount: string): bigint {
  const negative = amount.startsWith('-');
  const [int, frac = ''] = amount.replace('-', '').split('.');
  const v = BigInt(int || '0') * 10n ** BigInt(SCALE) + BigInt((frac + '0'.repeat(SCALE)).slice(0, SCALE) || '0');
  return negative ? -v : v;
}

function fromScaled(v: bigint): string {
  const negative = v < 0n;
  const abs = negative ? -v : v;
  const base = 10n ** BigInt(SCALE);
  const frac = (abs % base).toString().padStart(SCALE, '0').replace(/0+$/, '');
  return (negative ? '-' : '') + (abs / base).toString() + (frac ? '.' + frac : '');
}

/** Totals per currency, never mixed. */
export function sumByCurrency(items: Money[]): Money[] {
  const totals = new Map<string, bigint>();
  for (const m of items) totals.set(m.currency, (totals.get(m.currency) ?? 0n) + toScaled(m.amount));
  return [...totals.entries()].map(([currency, v]) => ({ currency, amount: fromScaled(v) }));
}

/** "€1,240.00" in the user's locale. Intl receives the decimal string (exact on engines that support it). */
export function formatMoney(m: Money): string {
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency: m.currency }).format(
      m.amount as unknown as number,
    );
  } catch {
    return `${m.amount} ${m.currency}`;
  }
}

export function formatTotals(totals: Money[]): string {
  return totals.length ? totals.map(formatMoney).join(' · ') : '—';
}
