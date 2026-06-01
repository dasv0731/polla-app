import type { Routes } from '@angular/router';
import { companyAdminGuard } from '../../core/auth/company-admin.guard';
import { EmpresaShellComponent } from './empresa-shell.component';

export const empresaRoutes: Routes = [
  {
    path: 'invitacion',
    loadComponent: () => import('./aceptar-invitacion.component').then((m) => m.AceptarInvitacionComponent),
  },
  {
    path: 'admin-invitacion',
    loadComponent: () => import('./aceptar-admin.component').then((m) => m.AceptarAdminComponent),
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
      { path: '', loadComponent: () => import('./empresa-dashboard.component').then((m) => m.EmpresaDashboardComponent) },
      { path: 'departamentos', loadComponent: () => import('./empresa-departamentos.component').then((m) => m.EmpresaDepartamentosComponent) },
      { path: 'empleados', loadComponent: () => import('./empresa-empleados.component').then((m) => m.EmpresaEmpleadosComponent) },
      { path: 'jefes', loadComponent: () => import('./empresa-jefes.component').then((m) => m.EmpresaJefesComponent) },
      { path: 'premios', loadComponent: () => import('./empresa-premios.component').then((m) => m.EmpresaPremiosComponent) },
      { path: 'branding', loadComponent: () => import('./empresa-branding.component').then((m) => m.EmpresaBrandingComponent) },
      { path: 'trivias', loadComponent: () => import('./empresa-trivias.component').then((m) => m.EmpresaTriviasComponent) },
    ],
  },
];
