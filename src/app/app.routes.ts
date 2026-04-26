import type { Routes } from '@angular/router';
import { authGuard } from './core/auth/auth.guard';
import { ShellComponent } from './shared/layout/shell.component';

export const routes: Routes = [
  {
    path: 'login',
    loadComponent: () => import('./features/auth/login.component').then((m) => m.LoginComponent),
  },
  {
    path: 'register',
    loadComponent: () => import('./features/auth/register.component').then((m) => m.RegisterComponent),
  },
  {
    path: 'forgot-password',
    loadComponent: () => import('./features/auth/forgot-password.component').then((m) => m.ForgotPasswordComponent),
  },
  {
    path: '',
    component: ShellComponent,
    canActivate: [authGuard],
    children: [
      { path: '', redirectTo: 'picks', pathMatch: 'full' },
      {
        path: 'picks',
        loadComponent: () => import('./features/picks/picks-list.component').then((m) => m.PicksListComponent),
      },
      {
        path: 'picks/match/:id',
        loadComponent: () => import('./features/picks/pick-detail.component').then((m) => m.PickDetailComponent),
      },
      {
        path: 'groups',
        loadComponent: () => import('./features/groups/groups-list.component').then((m) => m.GroupsListComponent),
      },
      {
        path: 'groups/new',
        loadComponent: () => import('./features/groups/group-create.component').then((m) => m.GroupCreateComponent),
      },
      {
        path: 'groups/join/:code',
        loadComponent: () => import('./features/groups/group-join.component').then((m) => m.GroupJoinComponent),
      },
      {
        path: 'groups/:id',
        loadComponent: () => import('./features/groups/group-detail.component').then((m) => m.GroupDetailComponent),
      },
    ],
  },
  { path: '**', redirectTo: 'picks' },
];
