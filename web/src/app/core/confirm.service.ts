import { Injectable, signal } from '@angular/core';

export interface ConfirmRequest {
  title: string;
  message?: string;
  confirmText?: string;
  danger?: boolean;
}

interface OpenConfirm extends ConfirmRequest {
  resolve: (ok: boolean) => void;
}

/** Promise-based confirmation dialog, rendered once by the root component. */
@Injectable({ providedIn: 'root' })
export class ConfirmService {
  readonly current = signal<OpenConfirm | null>(null);

  ask(req: ConfirmRequest): Promise<boolean> {
    this.current()?.resolve(false);
    return new Promise((resolve) => this.current.set({ ...req, resolve }));
  }

  answer(ok: boolean): void {
    const c = this.current();
    this.current.set(null);
    c?.resolve(ok);
  }
}
