import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { ApiError } from '@condo/shared';
import { AuthService } from './auth.service';

/** Protected routes: requires a stored session and loads /me once. */
export const authGuard: CanActivateFn = async (_route, state) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  const toLogin = () => router.createUrlTree(['/login'], { queryParams: { returnUrl: state.url } });

  if (!auth.hasSession()) return toLogin();
  if (auth.me()) return true;
  try {
    await auth.loadMe();
    return true;
  } catch (e) {
    // 401 after a failed refresh: the session is gone. Network/5xx: let the page render and report it.
    if (e instanceof ApiError && e.status === 401) return toLogin();
    return true;
  }
};

/** Login/register: skip them when already signed in. */
export const guestGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  return auth.hasSession() ? inject(Router).createUrlTree(['/buildings']) : true;
};
