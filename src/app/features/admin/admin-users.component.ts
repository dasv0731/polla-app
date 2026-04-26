import { Component, OnInit, inject, signal } from '@angular/core';
import { ApiService } from '../../core/api/api.service';

const TOURNAMENT_ID = 'mundial-2026';

interface UserRow {
  sub: string;
  handle: string;
  points: number;
  exactCount: number;
  resultCount: number;
}

@Component({
  standalone: true,
  selector: 'app-admin-users',
  template: `
    <header class="page-header" style="padding: 0 0 var(--space-md);">
      <small>{{ users().length }} usuarios registrados</small>
      <h1 style="font-family: var(--font-display); font-size: 56px; line-height: 1; text-transform: uppercase;">Jugadores</h1>
    </header>

    @if (loading()) {
      <p>Cargando…</p>
    } @else if (users().length === 0) {
      <p class="empty-state">Aún no hay usuarios registrados.</p>
    } @else {
      <div class="standings-wrap">
        <table class="standings standings--group">
          <thead>
            <tr>
              <th>#</th>
              <th>Handle</th>
              <th>Sub (Cognito)</th>
              <th>Pts</th>
              <th>Exactos</th>
              <th>Resultados</th>
            </tr>
          </thead>
          <tbody>
            @for (u of users(); track u.sub; let i = $index) {
              <tr>
                <td class="pos">{{ i + 1 }}</td>
                <td>{{ '@' + u.handle }}</td>
                <td><code style="font-size: var(--fs-xs);">{{ u.sub.slice(0, 8) }}…</code></td>
                <td>{{ u.points }}</td>
                <td>{{ u.exactCount }}</td>
                <td>{{ u.resultCount }}</td>
              </tr>
            }
          </tbody>
        </table>
      </div>
    }
  `,
})
export class AdminUsersComponent implements OnInit {
  private api = inject(ApiService);

  loading = signal(true);
  users = signal<UserRow[]>([]);

  async ngOnInit() {
    try {
      const totals = await this.api.listLeaderboard(TOURNAMENT_ID, 1000);
      const sorted = (totals.data ?? []).sort((a, b) => (b.points ?? 0) - (a.points ?? 0));

      const rows: UserRow[] = await Promise.all(
        sorted.map(async (t) => {
          const u = await this.api.getUser(t.userId);
          return {
            sub: t.userId,
            handle: u.data?.handle ?? t.userId.slice(0, 6),
            points: t.points ?? 0,
            exactCount: t.exactCount ?? 0,
            resultCount: t.resultCount ?? 0,
          };
        }),
      );
      this.users.set(rows);
    } finally {
      this.loading.set(false);
    }
  }
}
