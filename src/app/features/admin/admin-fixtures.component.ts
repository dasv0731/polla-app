import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ApiService } from '../../core/api/api.service';
import { ToastService } from '../../core/notifications/toast.service';
import { humanizeError } from '../../core/notifications/domain-errors';
import { apiClient } from '../../core/api/client';

const TOURNAMENT_ID = 'mundial-2026';

interface MatchRow {
  id: string;
  phaseId: string;
  homeTeamId: string;
  awayTeamId: string;
  kickoffAt: string;
  status: string;
  homeScore?: number | null;
  awayScore?: number | null;
  pointsCalculated: boolean;
}

@Component({
  standalone: true,
  selector: 'app-admin-fixtures',
  imports: [RouterLink],
  template: `
    <header class="page-header" style="padding: 0 0 var(--space-md); display: flex; justify-content: space-between; align-items: baseline; flex-wrap: wrap; gap: var(--space-md);">
      <div>
        <small>{{ matches().length }} partidos cargados · {{ totalScheduled() }} programados</small>
        <h1 style="font-family: var(--font-display); font-size: 56px; line-height: 1; text-transform: uppercase;">Partidos</h1>
      </div>
      <a class="btn btn--primary" routerLink="/admin/fixtures/new">+ Nuevo partido</a>
    </header>

    <div class="data-toolbar">
      <div class="data-toolbar__filter">
        <label for="filter-phase">Fase</label>
        <select id="filter-phase" [value]="phaseFilter()" (change)="phaseFilter.set($any($event.target).value)">
          <option value="">Todas</option>
          @for (p of phases(); track p.id) {
            <option [value]="p.id">{{ p.name }}</option>
          }
        </select>
      </div>
      <div class="data-toolbar__filter">
        <label for="filter-status">Estado</label>
        <select id="filter-status" [value]="statusFilter()" (change)="statusFilter.set($any($event.target).value)">
          <option value="">Todos</option>
          <option value="SCHEDULED">Programados</option>
          <option value="LIVE">En vivo</option>
          <option value="FINAL">Finalizados</option>
        </select>
      </div>
      <div class="data-toolbar__spacer"></div>
      <span style="font-size: var(--fs-xs); color: var(--color-text-muted); text-transform: uppercase; letter-spacing: 0.08em;">
        Mostrando {{ visible().length }} de {{ matches().length }}
      </span>
    </div>

    @if (loading()) {
      <p>Cargando partidos…</p>
    } @else if (visible().length === 0) {
      <p class="empty-state">
        @if (matches().length === 0) {
          Aún no hay partidos cargados.
          <br><a routerLink="/admin/fixtures/new" class="link-green">Crea el primero →</a>
        } @else {
          Ningún partido coincide con el filtro.
        }
      </p>
    } @else {
      <div class="standings-wrap">
        <table class="standings standings--group">
          <thead>
            <tr>
              <th>Fase</th>
              <th>Local</th>
              <th>Visitante</th>
              <th>Kickoff</th>
              <th>Estado</th>
              <th>Marcador</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            @for (m of visible(); track m.id) {
              <tr>
                <td>{{ phaseName(m.phaseId) }}</td>
                <td>{{ teamName(m.homeTeamId) }}</td>
                <td>{{ teamName(m.awayTeamId) }}</td>
                <td>{{ formatKickoff(m.kickoffAt) }}</td>
                <td>
                  <span class="match-status match-status--{{ m.status.toLowerCase() }}">
                    {{ statusLabel(m.status) }}
                  </span>
                </td>
                <td>
                  @if (m.homeScore != null && m.awayScore != null) {
                    <strong>{{ m.homeScore }} — {{ m.awayScore }}</strong>
                    @if (!m.pointsCalculated && m.status === 'FINAL') {
                      <small style="color: var(--color-lost); display: block;">sin scoring</small>
                    }
                  } @else {
                    —
                  }
                </td>
                <td>
                  <a class="link-green" [routerLink]="['/admin/fixtures', m.id, 'edit']">Editar</a>
                  ·
                  <a class="link-green" style="color: var(--color-lost); cursor: pointer;" (click)="del(m, $event)">Borrar</a>
                </td>
              </tr>
            }
          </tbody>
        </table>
      </div>
    }
  `,
})
export class AdminFixturesComponent implements OnInit {
  private api = inject(ApiService);
  private toast = inject(ToastService);

  loading = signal(true);
  matches = signal<MatchRow[]>([]);
  phases = signal<{ id: string; name: string; multiplier: number }[]>([]);
  teams = signal<Map<string, string>>(new Map());

  phaseFilter = signal('');
  statusFilter = signal('');

  visible = computed(() => {
    return this.matches().filter((m) => {
      if (this.phaseFilter() && m.phaseId !== this.phaseFilter()) return false;
      if (this.statusFilter() && m.status !== this.statusFilter()) return false;
      return true;
    });
  });

  totalScheduled = computed(() => this.matches().filter((m) => m.status === 'SCHEDULED').length);

  async ngOnInit() { await this.load(); }

  async load() {
    this.loading.set(true);
    try {
      const [matchesRes, phasesRes, teamsRes] = await Promise.all([
        this.api.listMatches(TOURNAMENT_ID),
        this.api.listPhases(TOURNAMENT_ID),
        this.api.listTeams(TOURNAMENT_ID),
      ]);
      const tm = new Map<string, string>();
      for (const t of teamsRes.data ?? []) tm.set(t.slug, t.name);
      this.teams.set(tm);
      this.phases.set((phasesRes.data ?? []).map((p) => ({ id: p.id, name: p.name, multiplier: p.multiplier })));
      this.matches.set(
        (matchesRes.data ?? [])
          .map((m) => ({
            id: m.id, phaseId: m.phaseId, homeTeamId: m.homeTeamId, awayTeamId: m.awayTeamId,
            kickoffAt: m.kickoffAt, status: m.status ?? 'SCHEDULED',
            homeScore: m.homeScore, awayScore: m.awayScore,
            pointsCalculated: m.pointsCalculated ?? false,
          }))
          .sort((a, b) => a.kickoffAt.localeCompare(b.kickoffAt)),
      );
    } finally {
      this.loading.set(false);
    }
  }

  teamName(slug: string): string { return this.teams().get(slug) ?? slug; }
  phaseName(id: string): string { return this.phases().find((p) => p.id === id)?.name ?? '—'; }

  formatKickoff(iso: string): string {
    return new Date(iso).toLocaleString('es-EC', {
      timeZone: 'America/Guayaquil',
      day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false,
    });
  }

  statusLabel(s: string): string {
    if (s === 'SCHEDULED') return 'Programado';
    if (s === 'LIVE') return 'En vivo';
    if (s === 'FINAL') return 'Final';
    return s;
  }

  async del(m: MatchRow, event: Event) {
    event.preventDefault();
    if (!confirm(`¿Borrar el partido ${this.teamName(m.homeTeamId)} vs ${this.teamName(m.awayTeamId)}? También se borran los picks.`)) {
      return;
    }
    try {
      await apiClient.models.Match.delete({ id: m.id });
      this.toast.success('Partido borrado');
      void this.load();
    } catch (e) {
      this.toast.error(humanizeError(e));
    }
  }
}
