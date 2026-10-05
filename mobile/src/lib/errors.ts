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

/** One-line message for inline form errors. */
export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.problem.detail ?? error.problem.title;
  return describeError(error).message;
}

export function fieldError(error: unknown, field: string): string | undefined {
  return error instanceof ApiError ? error.fieldError(field) : undefined;
}
