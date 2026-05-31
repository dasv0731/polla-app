import type { Routes } from '@angular/router';
import { companyAdminGuard } from '../../core/auth/company-admin.guard';
import { EmpresaShellComponent } from './empresa-shell.component';

export const empresaRoutes: Routes = [
  {
    path: 'invitacion',
    loadComponent: () => import('./aceptar-invitacion.component').then((m) => m.AceptarInvitacionComponent),
  },
  {
    path: '',
    canActivate: [companyAdminGuard],
    loadComponent: () => import('./empresa-home.component').then((m) => m.EmpresaHomeComponent),
  },
  {
    path: ':id',
    component: EmpresaShellComponent,
    canActivate: [companyAdminGuard],
    children: [
      { path: '', loadComponent: () => import('./empresa-resumen.component').then((m) => m.EmpresaResumenComponent) },
      { path: 'departamentos', loadComponent: () => import('./empresa-departamentos.component').then((m) => m.EmpresaDepartamentosComponent) },
      { path: 'jefes', loadComponent: () => import('./empresa-jefes.component').then((m) => m.EmpresaJefesComponent) },
      { path: 'premios', loadComponent: () => import('./empresa-premios.component').then((m) => m.EmpresaPremiosComponent) },
      { path: 'branding', loadComponent: () => import('./empresa-branding.component').then((m) => m.EmpresaBrandingComponent) },
    ],
  },
];
