import { inject } from '@angular/core';
import { Router, type CanActivateFn } from '@angular/router';
import { AuthService } from './auth.service';

export const authGuard: CanActivateFn = async (_route, state) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  const u = auth.user() ?? (await auth.loadUser());
  if (!u) {
    // Preserva la URL solicitada para que el flow de login/register pueda
    // devolver al user a donde quería ir (clave para deep-links tipo
    // `/groups/join/:code` — si no, perdemos el código de invitación).
    return router.createUrlTree(['/login'], {
      queryParams: { returnUrl: state.url },
    });
  }
  return true;
};
