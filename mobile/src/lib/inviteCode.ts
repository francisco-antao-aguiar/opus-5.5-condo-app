import { normalizeInviteCode } from '@condo/shared';

export const INVITE_CODE_LENGTH = 8;

/**
 * Pulls an invite code out of whatever the user typed or pasted: a bare code in any case,
 * "ABCD-EFGH", or a full link (https://…/join/ABCDEFGH, buildingapp://join/abcd-efgh).
 */
export function extractInviteCode(input: string): string {
  const fromLink = /join\/([A-Za-z0-9-]+)/.exec(input);
  return normalizeInviteCode(fromLink ? fromLink[1] : input).slice(0, INVITE_CODE_LENGTH);
}

/** Formats a (partial) code while typing: "ABCDE" → "ABCD-E". */
export function formatPartialInviteCode(code: string): string {
  const c = normalizeInviteCode(code).slice(0, INVITE_CODE_LENGTH);
  return c.length > 4 ? `${c.slice(0, 4)}-${c.slice(4)}` : c;
}

export function isCompleteInviteCode(code: string): boolean {
  return normalizeInviteCode(code).length === INVITE_CODE_LENGTH;
}
