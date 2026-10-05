import { ApiError, NetworkError } from '@condo/shared';
import {
  idsToParam,
  isMobileUserAgent,
  labelsPerPage,
  paginateLabels,
  parseIdsParam,
  qrFileName,
  resolveErrorView,
  selectionState,
  toggleAllVisible,
  toggleSelected,
} from './qr';

const range = (n: number) => Array.from({ length: n }, (_, i) => i);
const uuid = (i: number) => `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`;

describe('label pagination', () => {
  it('fits 24 small or 8 large labels per A4 page', () => {
    expect(labelsPerPage('small')).toBe(24);
    expect(labelsPerPage('large')).toBe(8);
  });

  it('chunks labels into pages by size', () => {
    expect(paginateLabels(range(50), 'small').map((p) => p.length)).toEqual([24, 24, 2]);
    expect(paginateLabels(range(24), 'small').map((p) => p.length)).toEqual([24]);
    expect(paginateLabels(range(9), 'large').map((p) => p.length)).toEqual([8, 1]);
    expect(paginateLabels([], 'small')).toEqual([]);
    expect(paginateLabels(range(3), 'large')[0]).toEqual([0, 1, 2]);
  });
});

describe('selection', () => {
  it('toggles one id', () => {
    const s = toggleSelected(new Set(), 'a');
    expect([...s]).toEqual(['a']);
    expect([...toggleSelected(s, 'a')]).toEqual([]);
  });

  it('reports none / some / all for the visible ids', () => {
    expect(selectionState(new Set(), ['a', 'b'])).toBe('none');
    expect(selectionState(new Set(['a']), ['a', 'b'])).toBe('some');
    expect(selectionState(new Set(['a', 'b', 'z']), ['a', 'b'])).toBe('all');
    expect(selectionState(new Set(['a']), [])).toBe('none');
  });

  it('"select all filtered" adds the visible ids, or removes them when all were selected, keeping hidden ones', () => {
    const hidden = new Set(['z']);
    const all = toggleAllVisible(hidden, ['a', 'b']);
    expect([...all].sort()).toEqual(['a', 'b', 'z']);
    expect([...toggleAllVisible(all, ['a', 'b'])]).toEqual(['z']);
    expect([...toggleAllVisible(new Set(['a']), ['a', 'b'])].sort()).toEqual(['a', 'b']);
  });

  it('puts short selections in the URL and parses them back defensively', () => {
    expect(idsToParam([uuid(1), uuid(2)])).toBe(`${uuid(1)},${uuid(2)}`);
    expect(idsToParam([])).toBeNull();
    expect(idsToParam(range(61).map(uuid))).toBeNull();
    expect(parseIdsParam(`${uuid(1)}, ${uuid(1).toUpperCase()},junk,,${uuid(2)}`)).toEqual([uuid(1), uuid(2)]);
    expect(parseIdsParam(undefined)).toEqual([]);
  });
});

describe('resolveErrorView', () => {
  const err = (status: number, code: string, extra: object = {}) => new ApiError(status, { title: 't', status, code, ...extra });

  it('names the building for non-members', () => {
    const v = resolveErrorView(err(403, 'NOT_A_MEMBER', { buildingName: 'Casa do Pátio' }));
    expect(v.kind).toBe('not-member');
    expect(v.title).toBe('This item belongs to Casa do Pátio');
    expect(v.detail).toContain('ask the building');
    expect(resolveErrorView(err(403, 'NOT_A_MEMBER')).title).toContain('a building you are not in');
  });

  it('maps expired membership, archived and not found', () => {
    expect(resolveErrorView(err(403, 'MEMBERSHIP_EXPIRED')).kind).toBe('expired');
    expect(resolveErrorView(err(410, 'ASSET_ARCHIVED'))).toMatchObject({ kind: 'archived', title: 'This item is no longer in use' });
    expect(resolveErrorView(err(410, 'HTTP_410')).kind).toBe('archived');
    expect(resolveErrorView(err(404, 'NOT_FOUND')).title).toBe("This code isn't linked to anything you can see");
  });

  it('falls back to the generic description', () => {
    expect(resolveErrorView(new NetworkError(new Error('x')))).toMatchObject({ kind: 'other', title: "Can't reach the server." });
  });
});

describe('misc', () => {
  it('detects mobile user agents', () => {
    expect(isMobileUserAgent('Mozilla/5.0 (Linux; Android 14; Pixel 8) Mobile Safari')).toBe(true);
    expect(isMobileUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)')).toBe(true);
    expect(isMobileUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/130')).toBe(false);
  });

  it('makes safe SVG file names', () => {
    expect(qrFileName('Lobby ceiling light')).toBe('qr-lobby-ceiling-light.svg');
    expect(qrFileName('Portão da garagem #2')).toBe('qr-portao-da-garagem-2.svg');
    expect(qrFileName('!!!')).toBe('qr-asset.svg');
  });
});
