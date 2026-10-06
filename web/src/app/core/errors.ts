import { AbstractControl, FormGroup } from '@angular/forms';
import { ApiError, ApiProblem, NetworkError } from '@condo/shared';

/** Friendly headlines for stable backend error codes. The server's `detail` is shown underneath. */
const FRIENDLY: Record<string, string> = {
  VALIDATION_FAILED: 'Please check the highlighted fields.',
  NOT_A_MEMBER: "You're not a member of this building.",
  MEMBERSHIP_EXPIRED: 'Your membership in this building has expired.',
  PERMISSION_DENIED: "You don't have permission to do that.",
  NOT_FOUND: 'Not found. It may have been deleted.',
  STRUCTURE_NOT_EMPTY: 'This building already has structure.',
  SPACE_HAS_CHILDREN: 'This space still has children.',
  INVALID_MOVE: "A space can't be moved inside itself or its descendants.",
  INVALID_HIERARCHY: "That space type isn't allowed there.",
  LAST_ADMIN: 'A building must always keep at least one active admin.',
  ROLE_RANK_EXCEEDED: "You can't grant a role above your own, or change a member who outranks you.",
  EMAIL_TAKEN: 'An account with this email already exists.',
  INVALID_CREDENTIALS: 'Wrong email or password.',
  CONFLICT: 'Someone else changed this in the meantime. Reload and try again.',
  INVITATION_NOT_FOUND: "We couldn't find that invitation code.",
  INVITATION_EXPIRED: 'This invitation has expired.',
  INVITATION_REVOKED: 'This invitation was revoked.',
  INVITATION_EXHAUSTED: 'This invitation was already used.',
  INVITATION_INVALID: 'This invitation is no longer valid. Ask for a new one.',
  ALREADY_MEMBER: "You're already a member of this building.",
  TOO_MANY_ATTEMPTS: 'Too many attempts. Please wait a few minutes.',
  INVALID_UNIT: 'Pick a unit (a space of type Unit).',
  UNKNOWN_ASSET_TYPE: "That asset type doesn't exist.",
  SPACE_HAS_ASSETS: 'This space still has active assets. Archive or move them first.',
  ASSET_ARCHIVED: 'This asset is archived. Restore it before editing.',
  BUILT_IN_PROBLEM_TYPE: 'Built-in problems can only be hidden or shown, not renamed or re-sorted.',
  DUPLICATE_PROBLEM_TYPE: 'That problem already exists for this asset type.',
  DUPLICATE_ISSUE: 'This problem was already reported.',
  INVALID_PROBLEM_TYPE: "That problem isn't offered for this item any more. Pick another one.",
  INVALID_TRANSITION: "That status change isn't possible from the issue's current status.",
  INVALID_MERGE: "These issues can't be merged.",
  ISSUE_MERGED: 'This issue was merged into another one.',
  SPACE_HAS_OPEN_ISSUES: 'This space still has open issues. Resolve them first.',
  PHOTO_LIMIT: 'This issue already has the maximum number of photos.',
  FILE_TOO_LARGE: 'That file is too large (max 10 MB).',
  UNSUPPORTED_MEDIA_TYPE: 'That file type isn’t supported here.',
  INVALID_TIME_ZONE: 'Unknown time zone.',
  UNKNOWN_CURRENCY: 'Unknown currency code.',
  INVALID_AMOUNT: "That amount isn't valid for its currency.",
  INVALID_RECURRENCE: "That repeat pattern isn't valid.",
  SPACE_HAS_PLANS: 'This space still has active maintenance plans. Move or pause them first.',
  SPACE_HAS_BOOKINGS: 'This space has upcoming bookings. Cancel them first.',
  NOT_BOOKABLE: "This space can't be booked right now.",
  BOOKING_CONFLICT: 'That time is already requested or booked.',
  BOOKING_RULES: "That time doesn't fit this space's booking rules.",
  BOOKING_LIMIT: 'Your unit already has the maximum number of active bookings here.',
  BOOKING_CANCEL_CUTOFF: "It's too late to cancel this booking online.",
  INVALID_STATE: 'This was already decided or cancelled. Refresh to see the latest.',
};

/** Shown after a 409 CONFLICT, once the page has refetched the latest data. */
export const CONFLICT_RELOADED = 'Someone else changed this — reloaded the latest version';

export function isConflict(e: unknown): boolean {
  return errorCode(e) === 'CONFLICT';
}

export function problemOf(e: unknown): ApiProblem | null {
  return e instanceof ApiError ? e.problem : null;
}

export function errorCode(e: unknown): string | null {
  return problemOf(e)?.code ?? null;
}

export interface ErrorText {
  title: string;
  detail?: string;
}

export function describeError(e: unknown): ErrorText {
  if (e instanceof ApiError) {
    const p = e.problem;
    const title = FRIENDLY[p.code] ?? p.detail ?? p.title ?? 'Request failed';
    const detail = p.detail && p.detail !== title ? p.detail : undefined;
    return { title, detail };
  }
  if (e instanceof NetworkError) {
    return { title: "Can't reach the server.", detail: 'Check your connection and try again.' };
  }
  return { title: 'Something went wrong.', detail: e instanceof Error ? e.message : undefined };
}

/**
 * Copies VALIDATION_FAILED field errors onto matching controls as `{ server: message }`.
 * Returns the messages that matched no control, so the caller can show them elsewhere.
 */
export function applyServerErrors(form: FormGroup, e: unknown, prefix = ''): string[] {
  const unmatched: string[] = [];
  for (const fe of problemOf(e)?.errors ?? []) {
    if (prefix && !fe.field.startsWith(prefix)) continue;
    const control: AbstractControl | null = form.get(fe.field.slice(prefix.length));
    if (control) {
      control.setErrors({ ...(control.errors ?? {}), server: fe.message });
      control.markAsTouched();
    } else {
      unmatched.push(`${fe.field}: ${fe.message}`);
    }
  }
  return unmatched;
}
