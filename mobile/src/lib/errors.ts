import { ApiError, NetworkError } from '@condo/shared';

export type ErrorKind = 'offline' | 'notMember' | 'expired' | 'notFound' | 'forbidden' | 'generic';

export interface ErrorInfo {
  kind: ErrorKind;
  title: string;
  message: string;
}

export function describeError(error: unknown): ErrorInfo {
  if (error instanceof NetworkError) {
    return {
      kind: 'offline',
      title: "You're offline",
      message: "We couldn't reach the server. Check your connection and try again.",
    };
  }
  if (error instanceof ApiError) {
    switch (error.problem.code) {
      case 'NOT_A_MEMBER':
        return {
          kind: 'notMember',
          title: "You're not a member of this building",
          message: 'Ask a building admin or manager for an invitation.',
        };
      case 'MEMBERSHIP_EXPIRED':
        return {
          kind: 'expired',
          title: 'Your membership has expired',
          message: 'Your access to this building ended. Ask an admin or manager to extend it.',
        };
    }
    if (error.status === 404) {
      return { kind: 'notFound', title: 'Not found', message: error.message || 'This item no longer exists.' };
    }
    if (error.status === 403) {
      return { kind: 'forbidden', title: "You can't do that", message: error.message };
    }
    return { kind: 'generic', title: 'Something went wrong', message: error.message };
  }
  return {
    kind: 'generic',
    title: 'Something went wrong',
    message: error instanceof Error ? error.message : 'Unexpected error.',
  };
}

/** Friendly copy for codes the UI handles specially; anything else uses the server's detail. */
const FRIENDLY: Partial<Record<string, string>> = {
  CONFLICT: 'Someone else changed this — showing the latest.',
  LAST_ADMIN: 'A building needs at least one admin. Make someone else admin first.',
  ROLE_RANK_EXCEEDED: "You can't give someone a role above your own.",
  INVITATION_NOT_FOUND: "We couldn't find that invitation. Check the code and try again.",
  INVITATION_INVALID: 'This invitation no longer works: whoever sent it can no longer invite people here.',
  INVITATION_EXPIRED: 'This invitation has expired. Ask for a new one.',
  INVITATION_REVOKED: 'This invitation was cancelled by the person who sent it.',
  INVITATION_EXHAUSTED: 'This invitation has already been used.',
  ALREADY_MEMBER: "You're already a member of this building.",
  TOO_MANY_ATTEMPTS: 'Too many attempts. Wait a few minutes and try again.',
  SPACE_HAS_ASSETS: 'This space still has assets (lights, doors…) inside it. Move or archive them first.',
  SPACE_HAS_OPEN_ISSUES: 'This space (or a space inside it) still has open issues. Resolve them first.',
  DUPLICATE_ISSUE: 'This problem has already been reported.',
  INVALID_PROBLEM_TYPE: "That problem isn't offered for this asset any more. Pick another one or use “Other”.",
  INVALID_TRANSITION: "That status change isn't possible any more — showing the latest.",
  ISSUE_MERGED: 'This issue was merged into another one — showing the latest.',
  BOOKING_CONFLICT: 'Someone just requested this slot. Pick another time.',
  BOOKING_LIMIT: 'Your unit already has the maximum number of upcoming bookings for this space.',
  BOOKING_CANCEL_CUTOFF: "It's too close to the start to cancel this booking yourself. Ask an admin.",
  NOT_BOOKABLE: "This space can't be booked (any more).",
  INVALID_STATE: 'This changed meanwhile — showing the latest.',
  INVALID_AMOUNT: "That amount isn't valid for the currency.",
  UNKNOWN_CURRENCY: 'Unknown currency code. Use a 3-letter ISO code like EUR.',
  SPACE_HAS_PLANS: 'This space has maintenance plans. Move or remove them first (web).',
  SPACE_HAS_BOOKINGS: 'This space has upcoming bookings. Cancel them first.',
  PHOTO_LIMIT: 'An issue can have at most 5 photos.',
  FILE_TOO_LARGE: 'That photo is too large (max 10 MB).',
  UNSUPPORTED_MEDIA_TYPE: 'Only JPEG, PNG, WebP or HEIC photos can be attached.',
  ASSET_ARCHIVED: 'This asset is archived. Restore it before editing.',
  UNKNOWN_ASSET_TYPE: "That asset type doesn't exist any more. Pick another one.",
};

/** 409 from an update that carried a stale `version`. */
export function isConflict(error: unknown): boolean {
  // Only the code: other 409s (EMAIL_TAKEN, ALREADY_MEMBER…) are not version conflicts.
  return error instanceof ApiError && error.problem.code === 'CONFLICT';
}

/** One-line message for inline form errors. */
export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    return FRIENDLY[error.problem.code] ?? error.problem.detail ?? error.problem.title;
  }
  return describeError(error).message;
}

export function fieldError(error: unknown, field: string): string | undefined {
  return error instanceof ApiError ? error.fieldError(field) : undefined;
}
