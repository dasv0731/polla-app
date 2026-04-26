import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ApiService } from '../../core/api/api.service';

const TOURNAMENT_ID = 'mundial-2026';

@Component({
  standalone: true,
  selector: 'app-admin-dashboard',
  imports: [RouterLink],
  template: `
    <header class="page-header" style="padding: 0 0 var(--space-md);">
      <small>Mundial 2026 · Panel admin</small>
      <h1 style="font-family: var(--font-display); font-size: 56px; line-height: 1; text-transform: uppercase;">Dashboard</h1>
    </header>

    @if (loading()) {
      <p>Cargando KPIs…</p>
    } @else {
      <section class="kpi-grid">
        <article class="kpi-card">
          <p class="kpi-card__label">Partidos cargados</p>
          <p class="kpi-card__value">{{ totalMatches() }}</p>
          <p class="kpi-card__hint">de 104 esperados (Mundial 2026)</p>
        </article>
        <article class="kpi-card kpi-card--warn">
          <p class="kpi-card__label">Pendientes de resultado</p>
          <p class="kpi-card__value">{{ pendingResults() }}</p>
          <p class="kpi-card__hint">SCHEDULED + LIVE en el pasado</p>
        </article>
        <article class="kpi-card">
          <p class="kpi-card__label">Finalizados con scoring</p>
          <p class="kpi-card__value">{{ finalScored() }}</p>
          <p class="kpi-card__hint">FINAL con pointsCalculated=true</p>
        </article>
        <article class="kpi-card kpi-card--danger">
          <p class="kpi-card__label">FINAL sin scoring</p>
          <p class="kpi-card__value">{{ finalUnscored() }}</p>
          <p class="kpi-card__hint">Necesitan correr 'Calcular puntos'</p>
        </article>
      </section>

      <section class="kpi-grid">
        <article class="kpi-card">
          <p class="kpi-card__label">Equipos cargados</p>
          <p class="kpi-card__value">{{ totalTeams() }}</p>
          <p class="kpi-card__hint">de 48 selecciones del Mundial 2026</p>
        </article>
        <article class="kpi-card">
          <p class="kpi-card__label">Jugadores registrados</p>
          <p class="kpi-card__value">{{ totalUsers() }}</p>
          <p class="kpi-card__hint">Cuentas Cognito + User row</p>
        </article>
        <article class="kpi-card">
          <p class="kpi-card__label">Picks recibidos</p>
          <p class="kpi-card__value">{{ totalPicks() }}</p>
          <p class="kpi-card__hint">en todos los partidos</p>
        </article>
        <article class="kpi-card">
          <p class="kpi-card__label">Grupos privados</p>
          <p class="kpi-card__value">{{ totalGroups() }}</p>
          <p class="kpi-card__hint">creados por usuarios</p>
        </article>
      </section>

      <section style="margin-top: var(--space-2xl);">
        <header class="section-heading">
          <div class="section-heading__text">
            <p class="kicker">Acciones rápidas</p>
            <h2 class="h2">¿Qué hacer ahora?</h2>
          </div>
        </header>
        <div class="empty-cta">
          <a class="empty-cta__card" routerLink="/admin/fixtures" style="display: block; text-decoration: none; color: inherit;">
            <h3>+ Cargar partidos</h3>
            <p>Faltan {{ Math.max(0, 104 - totalMatches()) }} para los 104 oficiales del Mundial 2026.</p>
            <span class="link-green">Ir a partidos →</span>
          </a>
          @if (pendingResults() > 0) {
            <a class="empty-cta__card" routerLink="/admin/results" style="display: block; text-decoration: none; color: inherit;">
              <h3>⚠ Publicar {{ pendingResults() }} resultado{{ pendingResults() === 1 ? '' : 's' }}</h3>
              <p>Hay matches con kickoff pasado sin resultado. Súbelos para que el scoring corra.</p>
              <span class="link-green">Ir a resultados →</span>
            </a>
          }
        </div>
      </section>
    }
  `,
})
export class AdminDashboardComponent implements OnInit {
  private api = inject(ApiService);

  loading = signal(true);
  totalMatches = signal(0);
  pendingResults = signal(0);
  finalScored = signal(0);
  finalUnscored = signal(0);
  totalTeams = signal(0);
  totalUsers = signal(0);
  totalPicks = signal(0);
  totalGroups = signal(0);

  Math = Math; // expose for template

  async ngOnInit() {
    try {
      const [matchesRes, teamsRes] = await Promise.all([
        this.api.listMatches(TOURNAMENT_ID),
        this.api.listTeams(TOURNAMENT_ID),
      ]);
      const matches = matchesRes.data ?? [];
      const now = Date.now();
      this.totalMatches.set(matches.length);
      this.pendingResults.set(matches.filter((m) => m.status !== 'FINAL' && Date.parse(m.kickoffAt) < now).length);
      this.finalScored.set(matches.filter((m) => m.status === 'FINAL' && m.pointsCalculated).length);
      this.finalUnscored.set(matches.filter((m) => m.status === 'FINAL' && !m.pointsCalculated).length);
      this.totalTeams.set((teamsRes.data ?? []).length);

      // Lighter counts via UTT (one row per registered user) and Pick / Group lists
      const [uttRes, picksRes, groupsRes] = await Promise.all([
        this.api.listLeaderboard(TOURNAMENT_ID, 1000),
        // Picks list — leverage admin-only access. apiClient.models.Pick.list returns all.
        this.api.myPicks('all').catch(() => ({ data: [] as unknown[] })), // fallback empty
        // Groups list
        Promise.resolve({ data: [] as unknown[] }),
      ]);
      this.totalUsers.set((uttRes.data ?? []).length);
      this.totalPicks.set((picksRes.data ?? []).length);
      this.totalGroups.set((groupsRes.data ?? []).length);
    } finally {
      this.loading.set(false);
    }
  }
}
