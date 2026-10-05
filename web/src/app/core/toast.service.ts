import { Injectable, signal } from '@angular/core';
import { ApiError } from '@condo/shared';
import { describeError } from './errors';

export interface Toast {
  id: number;
  kind: 'error' | 'success' | 'info';
  title: string;
  detail?: string;
}

@Injectable({ providedIn: 'root' })
export class ToastService {
  private seq = 0;
  readonly toasts = signal<Toast[]>([]);

  success(title: string, detail?: string): void {
    this.push({ kind: 'success', title, detail });
  }

  info(title: string, detail?: string): void {
    this.push({ kind: 'info', title, detail });
  }

  /** Shows an API/network error. 401s are skipped: the session-expired flow already redirects to login. */
  error(e: unknown): void {
    if (e instanceof ApiError && e.status === 401) return;
    this.push({ kind: 'error', ...describeError(e) });
  }

  dismiss(id: number): void {
    this.toasts.update((list) => list.filter((t) => t.id !== id));
  }

  private push(t: Omit<Toast, 'id'>): void {
    const id = ++this.seq;
    this.toasts.update((list) => [...list.slice(-3), { ...t, id }]);
    setTimeout(() => this.dismiss(id), t.kind === 'error' ? 8000 : 4000);
  }
}
