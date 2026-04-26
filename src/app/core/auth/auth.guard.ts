import { inject } from '@angular/core';
import { Router, type CanActivateFn } from '@angular/router';
import { AuthService } from './auth.service';

export const authGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  const u = auth.user() ?? (await auth.loadUser());
  if (!u) {
    return router.createUrlTree(['/login']);
  }
  return true;
};
