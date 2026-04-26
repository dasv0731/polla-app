import type { Routes } from '@angular/router';
import { adminGuard } from '../../core/auth/admin.guard';
import { AdminShellComponent } from './admin-shell.component';

export const adminRoutes: Routes = [
  {
    path: '',
    component: AdminShellComponent,
    canActivate: [adminGuard],
    children: [
      {
        path: '',
        loadComponent: () => import('./admin-dashboard.component').then((m) => m.AdminDashboardComponent),
      },
      {
        path: 'fixtures',
        loadComponent: () => import('./admin-fixtures.component').then((m) => m.AdminFixturesComponent),
      },
      {
        path: 'fixtures/new',
        loadComponent: () => import('./admin-fixture-edit.component').then((m) => m.AdminFixtureEditComponent),
      },
      {
        path: 'fixtures/:id/edit',
        loadComponent: () => import('./admin-fixture-edit.component').then((m) => m.AdminFixtureEditComponent),
      },
      {
        path: 'results',
        loadComponent: () => import('./admin-results.component').then((m) => m.AdminResultsComponent),
      },
      {
        path: 'teams',
        loadComponent: () => import('./admin-teams.component').then((m) => m.AdminTeamsComponent),
      },
      {
        path: 'special-results',
        loadComponent: () => import('./admin-special-results.component').then((m) => m.AdminSpecialResultsComponent),
      },
      {
        path: 'users',
        loadComponent: () => import('./admin-users.component').then((m) => m.AdminUsersComponent),
      },
    ],
  },
];
