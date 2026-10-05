import { normalizeInviteCode, parseAssetCode } from '@condo/shared';

/**
 * What a scanned (or typed) code leads to, as an app route, or null if it isn't ours:
 *   asset label: https://…/r/{id}, buildingapp://report/asset/{id} or a bare id → /report/asset/{id}
 *   invitation:  …/join/{code} link or an 8-character code (any case, optional dash) → /join/{CODE}
 */
export function routeForScannedCode(text: string): string | null {
  const assetId = parseAssetCode(text);
  if (assetId) return `/report/asset/${assetId}`;
  const trimmed = text.trim();
  const link = /\/join\/([A-Za-z0-9-]+)\/?(?:[?#]|$)/.exec(trimmed);
  const candidate = link ? link[1] : /^[A-Za-z0-9]{4}-?[A-Za-z0-9]{4}$/.test(trimmed) ? trimmed : null;
  if (candidate) {
    const code = normalizeInviteCode(candidate);
    if (code.length === 8) return `/join/${code}`;
  }
  return null;
}
