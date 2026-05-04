import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ApiService } from '../../core/api/api.service';
import { ToastService } from '../../core/notifications/toast.service';
import { humanizeError } from '../../core/notifications/domain-errors';
import { apiClient } from '../../core/api/client';
import { effectiveStatus } from '../../shared/util/match-status';

const TOURNAMENT_ID = 'mundial-2026';
const DAY_MS = 86_400_000;

interface MatchRow {
  id: string;
  phaseId: string;
  homeTeamId: string;
  awayTeamId: string;
  kickoffAt: string;
  status: 'SCHEDULED' | 'LIVE' | 'FINAL';
  homeScore: number | null;
  awayScore: number | null;
  pointsCalculated: boolean;
  venue: string | null;
  matchday: string | null;
  version: number;
  updatedAt: string | null;
}

@Component({
  standalone: true,
  selector: 'app-admin-fixtures',
  imports: [FormsModule, RouterLink],
  template: `
    <header class="admin-main__head">
      <div>
        <small>Admin</small>
        <h1>Fixtures</h1>
      </div>
      <a class="btn btn--primary" routerLink="/admin/fixtures/new">+ Nuevo fixture</a>
    </header>

    <div class="warn-banner">
      <span class="warn-banner__icon">!</span>
      <div>
        <strong>Atención</strong>
        <p>
          Editar fixtures con picks ya hechos requiere re-cálculo. Solo cambios menores
          (sede, hora) son seguros — cambios de equipos requieren coordinación.
        </p>
      </div>
    </div>

    @if (loading()) {
      <p>Cargando partidos…</p>
    } @else {
      <div class="admin-filters">
        <select [(ngModel)]="phaseFilter">
          <option value="">Todas las fases</option>
          @for (p of phases(); track p.id) {
            <option [value]="p.id">{{ p.name }}</option>
          }
        </select>
        <select [(ngModel)]="matchdayFilter">
          <option value="">Todas las jornadas</option>
          @for (md of matchdayOptions(); track md) {
            <option [value]="md">{{ md }}</option>
          }
        </select>
        <select [(ngModel)]="statusFilter">
          <option value="">Todos los status</option>
          <option value="SCHEDULED">SCHEDULED</option>
          <option value="LIVE">LIVE</option>
          <option value="FINAL">FINAL</option>
        </select>
        <input type="text" [(ngModel)]="search" placeholder="Buscar equipo..." style="flex: 1; min-width: 200px;">
        <span style="font-size: var(--fs-xs); color: var(--color-text-muted); margin-left: auto; text-transform: uppercase; letter-spacing: 0.08em;">
          Mostrando {{ visible().length }} de {{ matches().length }}
        </span>
      </div>

      @if (matches().length === 0) {
        <p class="empty-state">
          Aún no hay partidos cargados.
          <br><a routerLink="/admin/fixtures/new" class="link-green">Crea el primero →</a>
        </p>
      } @else if (visible().length === 0) {
        <p class="empty-state">Ningún partido coincide con los filtros.</p>
      } @else {
        <div class="fixtures-table">
          <div class="fixtures-table__scroll">
            <table>
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Fase</th>
                  <th>Local</th>
                  <th>Visitante</th>
                  <th>Kickoff</th>
                  <th>Sede</th>
                  <th>Status</th>
                  <th>Score</th>
                  <th>Picks</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                @for (m of visible(); track m.id) {
                  <tr [class.is-live]="liveStatus(m) === 'LIVE'">
                    <td><code>{{ shortId(m.id) }}</code></td>
                    <td>{{ phaseName(m.phaseId) }}</td>
                    <td>
                      {{ teamName(m.homeTeamId) }}@if (recentlyEdited(m)) {<span title="Modificado en últimas 24h">*</span>}
                    </td>
                    <td>
                      {{ teamName(m.awayTeamId) }}@if (recentlyEdited(m)) {<span title="Modificado en últimas 24h">*</span>}
                    </td>
                    <td>{{ formatKickoff(m.kickoffAt) }}</td>
                    <td>{{ m.venue || '—' }}</td>
                    <td><span class="fix-status fix-status--{{ liveStatus(m).toLowerCase() }}">{{ statusLabel(liveStatus(m)) }}</span></td>
                    <td>
                      @if (m.homeScore != null && m.awayScore != null) {
                        <strong>{{ m.homeScore }}-{{ m.awayScore }}</strong>
                        @if (m.status === 'FINAL' && !m.pointsCalculated) {
                          <small style="color: var(--color-lost); display: block;">sin scoring</small>
                        }
                      } @else {
                        —
                      }
                    </td>
                    <td>{{ formatNumber(picksByMatch().get(m.id) ?? 0) }}</td>
                    <td>
                      <a class="fix-action fix-action--edit" [routerLink]="['/admin/fixtures', m.id, 'edit']">Editar</a>
                      ·
                      <a class="fix-action" [routerLink]="['/admin/fixtures', m.id, 'trivia']">Trivia</a>
                      ·
                      <a class="fix-action" [routerLink]="['/admin/fixtures', m.id, 'stats']">Stats</a>
                      @if (canFinalize(m)) {
                        ·
                        <button type="button" class="fix-action fix-action--finalize"
                                [disabled]="finalizingId() === m.id"
                                (click)="finalize(m)">
                          {{ finalizingId() === m.id ? 'Finalizando…' : 'Finalizar' }}
                        </button>
                      }
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        </div>

        @if (anyRecentlyEdited()) {
          <p style="margin-top: var(--space-md); font-size: var(--fs-xs); color: var(--color-text-muted); text-transform: uppercase; letter-spacing: 0.08em;">
            * con asterisco: fixture modificado en las últimas 24h. Picks afectados notificados.
          </p>
        }
      }
    }
  `,
})
export class AdminFixturesComponent implements OnInit {
  private api = inject(ApiService);
  private toast = inject(ToastService);

  loading = signal(true);
  finalizingId = signal<string | null>(null);
  matches = signal<MatchRow[]>([]);
  phases = signal<{ id: string; name: string; multiplier: number; order: number }[]>([]);
  teams = signal<Map<string, string>>(new Map());
  picksByMatch = signal<Map<string, number>>(new Map());

  phaseFilter = '';
  matchdayFilter = '';
  statusFilter = '';
  search = '';

  private phaseFilterSig = signal('');
  private matchdayFilterSig = signal('');
  private statusFilterSig = signal('');
  private searchSig = signal('');

  /** Lista de matchdays únicos detectados en los matches cargados,
   *  para el dropdown del filtro. */
  matchdayOptions = computed(() => {
    const set = new Set<string>();
    for (const m of this.matches()) {
      if (m.matchday) set.add(m.matchday);
    }
    return [...set].sort();
  });

  visible = computed(() => {
    const ph = this.phaseFilterSig();
    const md = this.matchdayFilterSig();
    const st = this.statusFilterSig();
    const q = this.searchSig().trim().toLowerCase();
    return this.matches().filter((m) => {
      if (ph && m.phaseId !== ph) return false;
      if (md && m.matchday !== md) return false;
      // Filtramos sobre el status efectivo: si el usuario elige "LIVE",
      // queremos los partidos que en este momento están EN VIVO según
      // hora — no los que el admin marcó manualmente como LIVE en DB.
      if (st && this.liveStatus(m) !== st) return false;
      if (q) {
        const home = this.teamName(m.homeTeamId).toLowerCase();
        const away = this.teamName(m.awayTeamId).toLowerCase();
        if (!home.includes(q) && !away.includes(q)) return false;
      }
      return true;
    });
  });

  liveStatus(m: { status: string; kickoffAt: string }): 'SCHEDULED' | 'LIVE' | 'FINAL' {
    return effectiveStatus(m.status, m.kickoffAt);
  }

  anyRecentlyEdited = computed(() => this.matches().some((m) => this.recentlyEdited(m)));

  async ngOnInit() {
    await this.load();
  }

  ngDoCheck() {
    if (this.phaseFilter !== this.phaseFilterSig()) this.phaseFilterSig.set(this.phaseFilter);
    if (this.matchdayFilter !== this.matchdayFilterSig()) this.matchdayFilterSig.set(this.matchdayFilter);
    if (this.statusFilter !== this.statusFilterSig()) this.statusFilterSig.set(this.statusFilter);
    if (this.search !== this.searchSig()) this.searchSig.set(this.search);
  }

  async load() {
    this.loading.set(true);
    try {
      const [matchesRes, phasesRes, teamsRes, picksRes] = await Promise.all([
        this.api.listMatches(TOURNAMENT_ID),
        this.api.listPhases(TOURNAMENT_ID),
        this.api.listTeams(TOURNAMENT_ID),
        this.api.listAllPicks(TOURNAMENT_ID, 5000),
      ]);

      const tm = new Map<string, string>();
      for (const t of teamsRes.data ?? []) tm.set(t.slug, t.name);
      this.teams.set(tm);

      this.phases.set(
        (phasesRes.data ?? [])
          .map((p) => ({ id: p.id, name: p.name, multiplier: p.multiplier, order: p.order }))
          .sort((a, b) => a.order - b.order),
      );

      this.matches.set(
        (matchesRes.data ?? [])
          .map((m) => ({
            id: m.id,
            phaseId: m.phaseId,
            homeTeamId: m.homeTeamId,
            awayTeamId: m.awayTeamId,
            kickoffAt: m.kickoffAt,
            status: (m.status ?? 'SCHEDULED') as MatchRow['status'],
            homeScore: m.homeScore ?? null,
            awayScore: m.awayScore ?? null,
            pointsCalculated: m.pointsCalculated ?? false,
            venue: (m as { venue?: string | null }).venue ?? null,
            matchday: (m as { matchday?: string | null }).matchday ?? null,
            version: m.version ?? 1,
            updatedAt: m.updatedAt ?? null,
          }))
          .sort((a, b) => a.kickoffAt.localeCompare(b.kickoffAt)),
      );

      const counts = new Map<string, number>();
      for (const p of picksRes.data ?? []) {
        counts.set(p.matchId, (counts.get(p.matchId) ?? 0) + 1);
      }
      this.picksByMatch.set(counts);
    } finally {
      this.loading.set(false);
    }
  }

  teamName(slug: string): string { return this.teams().get(slug) ?? slug; }
  phaseName(id: string): string { return this.phases().find((p) => p.id === id)?.name ?? '—'; }

  shortId(id: string): string {
    // GraphQL IDs are long ULIDs; expose only the suffix as `m-XXXX` for the table.
    const tail = id.slice(-4).toLowerCase();
    return `m-${tail}`;
  }

  formatKickoff(iso: string): string {
    return new Date(iso).toLocaleString('es-EC', {
      timeZone: 'America/Guayaquil',
      day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false,
    });
  }

  formatNumber(n: number): string { return n.toLocaleString('es-EC'); }

  statusLabel(s: string): string {
    if (s === 'LIVE') return 'EN VIVO';
    return s;
  }

  isPast(iso: string): boolean { return Date.parse(iso) < Date.now(); }

  recentlyEdited(m: MatchRow): boolean {
    if (m.version <= 1) return false;
    if (!m.updatedAt) return false;
    return Date.now() - Date.parse(m.updatedAt) < DAY_MS;
  }

  /** Solo se muestra el botón "Finalizar" para partidos LIVE — kickoff ya
   *  pasó y status DB no es FINAL todavía. SCHEDULED-future no aplica
   *  (el partido ni siquiera empezó); FINAL ya está finalizado. */
  canFinalize(m: MatchRow): boolean {
    return this.liveStatus(m) === 'LIVE' && m.status !== 'FINAL';
  }

  async finalize(m: MatchRow) {
    if (!this.canFinalize(m)) return;
    if (!confirm(
      `¿Marcar como finalizado?\n\n${this.teamName(m.homeTeamId)} vs ${this.teamName(m.awayTeamId)}\n\n` +
      `El partido pasará a /admin/results para que ingreses el marcador y publiques los puntos.`,
    )) return;
    this.finalizingId.set(m.id);
    try {
      const res = await this.api.markMatchFinished(m.id, m.version);
      if (res?.errors && res.errors.length > 0) {
        // eslint-disable-next-line no-console
        console.error(`[markMatchFinished ${m.id}] errors:`, res.errors);
        this.toast.error(res.errors[0]?.message ?? 'No se pudo finalizar');
        return;
      }
      this.toast.success('Partido finalizado · entra en /admin/results');
      void this.load();
    } catch (e) {
      this.toast.error(humanizeError(e));
    } finally {
      this.finalizingId.set(null);
    }
  }

  async del(m: MatchRow, event: Event) {
    event.preventDefault();
    if (!confirm(`¿Borrar el partido ${this.teamName(m.homeTeamId)} vs ${this.teamName(m.awayTeamId)}? También se borran los picks.`)) return;
    try {
      await apiClient.models.Match.delete({ id: m.id });
      this.toast.success('Partido borrado');
      void this.load();
    } catch (e) {
      this.toast.error(humanizeError(e));
    }
  }
}

