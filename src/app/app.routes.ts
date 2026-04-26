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
    // Join via shared code — standalone layout (auth-shell), not the
    // site-header shell. Auth-gated; bounces to /register otherwise.
    path: 'groups/join/:code',
    canActivate: [authGuard],
    loadComponent: () => import('./features/groups/group-join.component').then((m) => m.GroupJoinComponent),
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
        path: 'picks/by-group',
        loadComponent: () => import('./features/picks/picks-grupo.component').then((m) => m.PicksGrupoComponent),
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
        path: 'groups/:id/invite',
        loadComponent: () => import('./features/groups/group-invite-email.component').then((m) => m.GroupInviteEmailComponent),
      },
      {
        path: 'groups/:id',
        loadComponent: () => import('./features/groups/group-detail.component').then((m) => m.GroupDetailComponent),
      },
      {
        path: 'ranking',
        loadComponent: () => import('./features/ranking/ranking.component').then((m) => m.RankingComponent),
      },
      {
        path: 'profile',
        loadComponent: () => import('./features/profile/profile.component').then((m) => m.ProfileComponent),
      },
      {
        path: 'profile/special-picks',
        loadComponent: () => import('./features/profile/special-picks.component').then((m) => m.SpecialPicksComponent),
      },
    ],
  },
  { path: '**', redirectTo: 'picks' },
];
