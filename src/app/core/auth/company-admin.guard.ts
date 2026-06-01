import { inject } from '@angular/core';
import { Router, type CanActivateFn } from '@angular/router';
import { AuthService } from './auth.service';
import { ApiService } from '../api/api.service';

/** Acceso a /empresa: super-admin o company-admin de ≥1 empresa. */
export const companyAdminGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const api = inject(ApiService);
  const router = inject(Router);
  const u = auth.user() ?? (await auth.loadUser());
  if (!u) return router.createUrlTree(['/login']);
  if (u.isAdmin) return true;
  try {
    const res = await api.listMyCompanyAdminships(u.sub);
    if ((res.data ?? []).length > 0) return true;
  } catch { /* sin acceso */ }
  return router.createUrlTree(['/home']);
};
