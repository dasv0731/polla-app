import { Component } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';

@Component({
  standalone: true,
  selector: 'app-admin-shell',
  imports: [RouterLink, RouterLinkActive, RouterOutlet],
  template: `
    <div class="admin-shell">
      <aside class="admin-sidebar">
        <h2 class="admin-sidebar__title">Admin · Polla</h2>
        <a routerLink="/admin" routerLinkActive="is-active" [routerLinkActiveOptions]="{ exact: true }">
          📊 Dashboard
        </a>
        <a routerLink="/admin/fixtures" routerLinkActive="is-active">⚽ Partidos</a>
        <a routerLink="/admin/results" routerLinkActive="is-active">🏆 Resultados</a>
        <a routerLink="/admin/teams" routerLinkActive="is-active">🏳️ Equipos</a>
        <a routerLink="/admin/special-results" routerLinkActive="is-active">★ Especiales</a>
        <a routerLink="/admin/users" routerLinkActive="is-active">👥 Jugadores</a>
      </aside>
      <main class="admin-content">
        <router-outlet />
      </main>
    </div>
  `,
})
export class AdminShellComponent {}
