import { isDevMode } from '@angular/core';
import type { Routes } from '@angular/router';
import { authGuard } from './core/auth/auth.guard';
import { dirtyFormGuard } from './shared/util/dirty-form.guard';
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
    // Onboarding standalone (sin shell de la app), 3 pasos post-registro.
    path: 'onboarding',
    canActivate: [authGuard],
    loadComponent: () => import('./features/onboarding/onboarding.component').then((m) => m.OnboardingComponent),
  },
  {
    path: '',
    component: ShellComponent,
    canActivate: [authGuard],
    children: [
      { path: '', redirectTo: 'home', pathMatch: 'full' },
      {
        path: 'home',
        loadComponent: () => import('./features/home/home.component').then((m) => m.HomeComponent),
      },
      {
        path: 'picks',
        loadComponent: () => import('./features/picks/picks-list.component').then((m) => m.PicksListComponent),
      },
      {
        path: 'picks/group-stage',
        loadComponent: () => import('./features/picks/picks-tabla-grupos.component').then((m) => m.PicksTablaGruposComponent),
      },
      {
        path: 'picks/group-stage/predict',
        loadComponent: () => import('./features/picks/group-stage-picks.component').then((m) => m.GroupStagePicksComponent),
      },
      {
        path: 'picks/bracket',
        loadComponent: () => import('./features/picks/bracket-picks.component').then((m) => m.BracketPicksComponent),
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
        path: 'groups/:id/invite',
        loadComponent: () => import('./features/groups/group-invite-email.component').then((m) => m.GroupInviteEmailComponent),
      },
      {
        path: 'groups/:id/prizes',
        loadComponent: () => import('./features/groups/group-prizes-edit.component').then((m) => m.GroupPrizesEditComponent),
      },
      {
        path: 'groups/:id/edit',
        canDeactivate: [dirtyFormGuard],
        loadComponent: () => import('./features/groups/group-edit.component').then((m) => m.GroupEditComponent),
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
        path: 'mis-comodines',
        loadComponent: () => import('./features/comodines/comodines-list.component').then((m) => m.ComodinesListComponent),
      },
      {
        path: 'notificaciones',
        loadComponent: () => import('./features/notifications/notifications-list.component').then((m) => m.NotificationsListComponent),
      },
      {
        path: 'profile/special-picks',
        loadComponent: () => import('./features/profile/special-picks.component').then((m) => m.SpecialPicksComponent),
      },
      {
        path: 'admin',
        loadChildren: () => import('./features/admin/admin.routes').then((m) => m.adminRoutes),
      },
    ],
  },
  // Dev-only — visible solo en development builds (isDevMode === true).
  ...(isDevMode() ? [{
    path: 'dev/components',
    loadComponent: () =>
      import('./dev/dev-components.component').then((m) => m.DevComponentsComponent),
  }] : []),
  { path: '**', redirectTo: 'home' },
];
