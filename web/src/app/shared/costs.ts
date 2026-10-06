import { CostCategory, CostGroupBy, CostSummary, Money } from '@condo/shared';
import { formatMoney, percentOf } from './money';
import { MONTH_LABELS } from './recurrence';

export const COST_CATEGORIES: CostCategory[] = ['REPAIR', 'MAINTENANCE', 'CLEANING', 'UTILITIES', 'INSURANCE', 'OTHER'];
export const CATEGORY_LABELS: Record<CostCategory, string> = {
  REPAIR: 'Repair',
  MAINTENANCE: 'Maintenance',
  CLEANING: 'Cleaning',
  UTILITIES: 'Utilities',
  INSURANCE: 'Insurance',
  OTHER: 'Other',
};
export const GROUP_LABELS: Record<CostGroupBy, string> = { month: 'Month', category: 'Category', asset: 'Asset', space: 'Place' };

export const RECEIPT_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'application/pdf'];
export const MAX_RECEIPT_BYTES = 10 * 1024 * 1024;

export function validateReceipt(file: { name: string; type: string; size: number }): string | null {
  const okType = file.type ? RECEIPT_TYPES.includes(file.type.toLowerCase()) : /\.(jpe?g|png|webp|heic|heif|pdf)$/i.test(file.name);
  if (!okType) return 'Receipts must be a photo (JPEG, PNG, WebP, HEIC) or a PDF.';
  if (file.size > MAX_RECEIPT_BYTES) return 'Receipts can be at most 10 MB.';
  if (file.size === 0) return 'That file is empty.';
  return null;
}

export interface SummaryBar {
  currency: string;
  text: string;
  /** 0..100, relative to the largest row *in the same currency*. */
  pct: number;
}

export interface SummaryRowView {
  key: string;
  label: string;
  count: number;
  bars: SummaryBar[];
}

/** Human label for a summary row: "2026-09" → "Sep 2026", category code → "Repair", else the server's label. */
export function summaryLabel(groupBy: CostGroupBy, key: string, label: string): string {
  if (groupBy === 'month' && /^\d{4}-\d{2}$/.test(key)) {
    const [y, m] = key.split('-').map(Number);
    return `${MONTH_LABELS[m! - 1]!.slice(0, 3)} ${y}`;
  }
  if (groupBy === 'category') return CATEGORY_LABELS[key as CostCategory] ?? label;
  return label || '(none)';
}

/**
 * Rows ready for CSS bars. Each currency is scaled on its own (bars of € and £ are never compared), and
 * months are listed chronologically while other groupings keep the server's order (largest first).
 */
export function summaryView(s: CostSummary, locale?: string): SummaryRowView[] {
  const max = new Map<string, Money>();
  for (const r of s.rows) {
    for (const t of r.totals) {
      const cur = max.get(t.currency);
      if (!cur || percentOf(cur.amount, t.amount) < 100) max.set(t.currency, t);
    }
  }
  const rows = s.groupBy === 'month' ? [...s.rows].sort((a, b) => a.key.localeCompare(b.key)) : s.rows;
  return rows.map((r) => ({
    key: r.key,
    label: summaryLabel(s.groupBy, r.key, r.label),
    count: r.count,
    bars: r.totals.map((t) => ({
      currency: t.currency,
      text: formatMoney(t, locale),
      pct: Math.max(1, percentOf(t.amount, max.get(t.currency)!.amount)),
    })),
  }));
}

/** Download text as a file (CSV export). */
export function downloadText(text: string, fileName: string, type = 'text/csv;charset=utf-8'): void {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
