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
};

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
