import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ApiService } from '../../core/api/api.service';

const TOURNAMENT_ID = 'mundial-2026';
const DAY_MS = 86_400_000;

interface ActivityItem {
  kind: 'result' | 'group' | 'bounce';
  message: string;
  highlight: string;
  detail: string;
  timestamp: number;
}

@Component({
  standalone: true,
  selector: 'app-admin-dashboard',
  imports: [RouterLink],
  template: `
    <header class="admin-main__head">
      <div>
        <small>Admin · Mundial 2026</small>
        <h1>Dashboard</h1>
      </div>
      <p style="font-size: var(--fs-xs); color: var(--color-text-muted); text-transform: uppercase; letter-spacing: 0.08em; font-weight: var(--fw-bold);">
        Última actualización: {{ lastUpdatedLabel() }}
      </p>
    </header>

    @if (loading()) {
      <p>Cargando dashboard…</p>
    } @else {
      <section class="kpi-grid">
        <article class="kpi-card">
          <small>Users registrados</small>
          <div class="kpi-card__value">{{ formatNumber(totalUsers()) }}</div>
          @if (newUsersLast24h() > 0) {
            <span class="kpi-card__delta kpi-card__delta--up">↑ +{{ newUsersLast24h() }} últimas 24h</span>
          } @else {
            <span class="kpi-card__delta" style="color: var(--color-text-muted);">Sin altas en últimas 24h</span>
          }
        </article>

        <article class="kpi-card">
          <small>Picks totales</small>
          <div class="kpi-card__value">{{ formatNumber(totalPicks()) }}</div>
          @if (newPicksLast24h() > 0) {
            <span class="kpi-card__delta kpi-card__delta--up">↑ +{{ newPicksLast24h() }} últimas 24h</span>
          } @else {
            <span class="kpi-card__delta" style="color: var(--color-text-muted);">Sin movimiento últimas 24h</span>
          }
        </article>

        <article class="kpi-card kpi-card--warn">
          <small>Resultados pendientes</small>
          <div class="kpi-card__value">{{ pendingResults() }}</div>
          <span class="kpi-card__delta kpi-card__delta--down">
            {{ pendingResults() === 0 ? 'Todo al día' : (pendingResults() + ' partidos finalizados sin publicar') }}
          </span>
        </article>

        <article class="kpi-card kpi-card--danger">
          <small>SES bounces</small>
          <div class="kpi-card__value">{{ totalBounces() }}</div>
          <span class="kpi-card__delta kpi-card__delta--down">
            {{ totalBounces() === 0 ? 'Sin bounces — todo OK' : 'Acumulado · revisar' }}
          </span>
        </article>
      </section>

      <h2 style="font-family: var(--font-display); font-size: var(--fs-xl); text-transform: uppercase; line-height: 1; margin-bottom: var(--space-md);">
        Acciones rápidas
      </h2>
      <div class="quick-actions">
        <a routerLink="/admin/results" class="quick-action">
          <span class="quick-action__icon">⚽</span>
          <h3>Publicar resultado</h3>
          <p>
            {{ pendingResults() === 0
              ? 'Todos los partidos pasados ya tienen resultado.'
              : pendingResults() + ' partido' + (pendingResults() === 1 ? '' : 's') + ' sin resultado oficial. Dispara recalc de puntos.' }}
          </p>
        </a>
        <a routerLink="/admin/fixtures" class="quick-action">
          <span class="quick-action__icon">📅</span>
          <h3>Editar fixture</h3>
          <p>Cambiar horario, sede o equipos. Aviso si afecta picks ya hechos.</p>
        </a>
        <a routerLink="/admin/special-results" class="quick-action">
          <span class="quick-action__icon">🏆</span>
          <h3>Adjudicar specials</h3>
          <p>Disponible al cierre del torneo. Define campeón, subcampeón y revelación.</p>
        </a>
        <a routerLink="/admin/users" class="quick-action">
          <span class="quick-action__icon">👥</span>
          <h3>Gestionar users</h3>
          <p>Buscar, reset password, marcar emails con bounce.</p>
        </a>
      </div>

      @if (activity().length > 0) {
        <div class="activity">
          <h3>Actividad reciente</h3>
          <ul>
            @for (a of activity(); track a.timestamp + a.message) {
              <li>
                <span class="activity__dot"
                      [class.activity__dot--warn]="a.kind === 'group'"
                      [class.activity__dot--danger]="a.kind === 'bounce'"></span>
                <span>
                  {{ a.message }}
                  <strong>{{ a.highlight }}</strong>
                  @if (a.detail) { · {{ a.detail }} }
                </span>
                <span class="activity__time">{{ relativeTime(a.timestamp) }}</span>
              </li>
            }
          </ul>
        </div>
      }
    }
  `,
})
export class AdminDashboardComponent implements OnInit {
  private api = inject(ApiService);

  loading = signal(true);
  loadedAt = signal(Date.now());

  totalUsers = signal(0);
  newUsersLast24h = signal(0);
  totalPicks = signal(0);
  newPicksLast24h = signal(0);
  pendingResults = signal(0);
  totalBounces = signal(0);

  activity = signal<ActivityItem[]>([]);

  lastUpdatedLabel = computed(() => this.relativeTime(this.loadedAt()));

  async ngOnInit() {
    try {
      const cutoff = Date.now() - DAY_MS;
      const [usersRes, matchesRes, picksRes, groupsRes] = await Promise.all([
        this.api.listUsers(1000),
        this.api.listMatches(TOURNAMENT_ID),
        this.api.listAllPicks(TOURNAMENT_ID, 5000),
        this.api.listGroups(TOURNAMENT_ID, 500),
      ]);

      const users = usersRes.data ?? [];
      const matches = matchesRes.data ?? [];
      const picks = picksRes.data ?? [];
      const groups = groupsRes.data ?? [];

      this.totalUsers.set(users.length);
      this.newUsersLast24h.set(
        users.filter((u) => u.createdAt && Date.parse(u.createdAt) >= cutoff).length,
      );

      this.totalPicks.set(picks.length);
      this.newPicksLast24h.set(
        picks.filter((p) => p.createdAt && Date.parse(p.createdAt) >= cutoff).length,
      );

      const now = Date.now();
      this.pendingResults.set(
        matches.filter((m) =>
          (m.status !== 'FINAL' && Date.parse(m.kickoffAt) < now) ||
          (m.status === 'FINAL' && !m.pointsCalculated),
        ).length,
      );

      this.totalBounces.set(users.filter((u) => u.emailStatus === 'BOUNCED').length);

      // Build activity feed from heuristics: most recent FINAL matches, group creations,
      // and bounced users. Sorted desc by timestamp, top 6.
      const teamsRes = await this.api.listTeams(TOURNAMENT_ID);
      const teamName = new Map<string, string>(
        (teamsRes.data ?? []).map((t) => [t.slug, t.name]),
      );

      const items: ActivityItem[] = [];
      for (const m of matches) {
        if (m.status === 'FINAL' && m.homeScore != null && m.awayScore != null) {
          items.push({
            kind: 'result',
            message: 'Resultado publicado',
            highlight: `${teamName.get(m.homeTeamId) ?? m.homeTeamId} ${m.homeScore}-${m.awayScore} ${teamName.get(m.awayTeamId) ?? m.awayTeamId}`,
            detail: m.pointsCalculated ? 'puntos recalculados' : 'pendiente de scoring',
            timestamp: Date.parse(m.kickoffAt),
          });
        }
      }
      for (const g of groups) {
        items.push({
          kind: 'group',
          message: 'Nuevo grupo creado',
          highlight: `"${g.name}"`,
          detail: '',
          timestamp: g.createdAt ? Date.parse(g.createdAt) : 0,
        });
      }
      for (const u of users) {
        if (u.emailStatus === 'BOUNCED') {
          items.push({
            kind: 'bounce',
            message: 'SES bounce notification:',
            highlight: u.email,
            detail: 'marcado como BOUNCED',
            timestamp: u.createdAt ? Date.parse(u.createdAt) : 0,
          });
        }
      }

      items.sort((a, b) => b.timestamp - a.timestamp);
      this.activity.set(items.slice(0, 6));
    } finally {
      this.loading.set(false);
      this.loadedAt.set(Date.now());
    }
  }

  formatNumber(n: number): string {
    return n.toLocaleString('es-EC');
  }

  relativeTime(ts: number): string {
    const diff = Date.now() - ts;
    if (diff < 60_000) return `hace ${Math.max(1, Math.floor(diff / 1000))} s`;
    if (diff < 3_600_000) return `hace ${Math.floor(diff / 60_000)} min`;
    if (diff < 86_400_000) return `hace ${Math.floor(diff / 3_600_000)} h`;
    const days = Math.floor(diff / 86_400_000);
    return `hace ${days} día${days === 1 ? '' : 's'}`;
  }
}
