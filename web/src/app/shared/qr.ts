import { UUID } from '@condo/shared';
import { describeError, errorCode, problemOf } from '../core/errors';

// ---------- label sheet ----------

export type LabelSize = 'small' | 'large';

/** A4 portrait layouts: small = 3×8 labels of 70×37 mm, large = 2×4 labels of 105×74 mm. */
export const LABEL_LAYOUTS: Record<LabelSize, { cols: number; rows: number; widthMm: number; heightMm: number; label: string }> = {
  small: { cols: 3, rows: 8, widthMm: 70, heightMm: 37, label: 'Small 3×8' },
  large: { cols: 2, rows: 4, widthMm: 105, heightMm: 74, label: 'Large 2×4' },
};

export function labelsPerPage(size: LabelSize): number {
  const l = LABEL_LAYOUTS[size];
  return l.cols * l.rows;
}

/** Splits labels into printed pages for the chosen size. */
export function paginateLabels<T>(items: readonly T[], size: LabelSize): T[][] {
  const per = labelsPerPage(size);
  const pages: T[][] = [];
  for (let i = 0; i < items.length; i += per) pages.push(items.slice(i, i + per));
  return pages;
}

// ---------- selection ----------

export type SelectionState = 'none' | 'some' | 'all';

export function toggleSelected(selected: ReadonlySet<UUID>, id: UUID): Set<UUID> {
  const next = new Set(selected);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  return next;
}

/** State of the "select all filtered" checkbox for the visible ids. */
export function selectionState(selected: ReadonlySet<UUID>, visible: readonly UUID[]): SelectionState {
  if (!visible.length) return 'none';
  const n = visible.filter((id) => selected.has(id)).length;
  return n === 0 ? 'none' : n === visible.length ? 'all' : 'some';
}

/** Header checkbox: select every visible id, or (when all are already selected) unselect them. Keeps hidden selections. */
export function toggleAllVisible(selected: ReadonlySet<UUID>, visible: readonly UUID[]): Set<UUID> {
  const next = new Set(selected);
  const all = selectionState(selected, visible) === 'all';
  for (const id of visible) {
    if (all) next.delete(id);
    else next.add(id);
  }
  return next;
}

/** Ids travel in the URL (bookmarkable, survives reload) when the list is short enough. */
export const MAX_IDS_IN_URL = 60;

export function idsToParam(ids: readonly UUID[]): string | null {
  return ids.length && ids.length <= MAX_IDS_IN_URL ? ids.join(',') : null;
}

export function parseIdsParam(param: string | null | undefined): UUID[] {
  if (!param) return [];
  const seen = new Set<string>();
  return param
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter((s) => /^[0-9a-f-]{36}$/.test(s) && !seen.has(s) && !!seen.add(s));
}

// ---------- /r/:assetId ----------

export type ResolveErrorKind = 'not-member' | 'expired' | 'not-found' | 'archived' | 'other';

export interface ResolveErrorView {
  kind: ResolveErrorKind;
  title: string;
  detail: string;
}

/** What to show when `qr.resolve` fails. */
export function resolveErrorView(e: unknown): ResolveErrorView {
  const code = errorCode(e);
  const status = problemOf(e)?.status;
  if (code === 'NOT_A_MEMBER') {
    const name = problemOf(e)?.buildingName;
    return {
      kind: 'not-member',
      title: name ? `This item belongs to ${name}` : 'This item belongs to a building you are not in',
      detail: "You're not a member — ask the building's admin for an invite.",
    };
  }
  if (code === 'MEMBERSHIP_EXPIRED') {
    return {
      kind: 'expired',
      title: 'Your membership in this building has expired',
      detail: 'Ask a building admin or manager to extend your access.',
    };
  }
  if (code === 'ASSET_ARCHIVED' || status === 410) {
    return { kind: 'archived', title: 'This item is no longer in use', detail: 'It was removed from the building. If something is wrong here, report it on the place instead.' };
  }
  if (code === 'NOT_FOUND' || status === 404) {
    return { kind: 'not-found', title: "This code isn't linked to anything you can see", detail: 'It may belong to a private space, or the label may be damaged.' };
  }
  const d = describeError(e);
  return { kind: 'other', title: d.title, detail: d.detail ?? 'Please try again.' };
}

export function isMobileUserAgent(ua: string): boolean {
  return /Android|iPhone|iPad|iPod|Mobile/i.test(ua);
}

/** File name for a downloaded label: "qr-lobby-ceiling-light.svg". */
export function qrFileName(name: string): string {
  const slug = name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `qr-${slug || 'asset'}.svg`;
}
