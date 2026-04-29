import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ApiService } from '../../core/api/api.service';
import { ToastService } from '../../core/notifications/toast.service';

const TOURNAMENT_ID = 'mundial-2026';

interface ResultMatch {
  id: string;
  homeTeamId: string;
  awayTeamId: string;
  kickoffAt: string;
  status: 'SCHEDULED' | 'LIVE' | 'FINAL';
  homeScore: number | null;
  awayScore: number | null;
  pointsCalculated: boolean;
  version: number;
  phaseId: string;
  venue: string | null;
}

interface StagedScore { home: number; away: number; }

@Component({
  standalone: true,
  selector: 'app-admin-results',
  imports: [RouterLink],
  template: `
    <header class="admin-main__head" style="display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: var(--space-md);">
      <div>
        <small>Admin · {{ pending().length }} {{ pending().length === 1 ? 'partido pendiente' : 'partidos pendientes' }}</small>
        <h1>Publicar resultado</h1>
      </div>
      <button class="btn btn--primary" type="button"
              [disabled]="calculating() || toCommit().length === 0"
              (click)="calculatePointsAll()"
              [title]="toCommit().length === 0 ? 'No hay partidos guardados pendientes' : 'Guarda en DB y corre scoring para los ' + toCommit().length + ' partidos'">
        {{ calculating() ? 'Procesando…' : 'Calcular puntos (' + toCommit().length + ')' }}
      </button>
    </header>

    @if (loading()) {
      <p>Cargando partidos…</p>
    } @else if (pending().length === 0) {
      <p class="empty-state">
        No hay partidos pendientes.
        <br>Marca un partido como <strong>FINAL</strong> en
        <a class="link-green" routerLink="/admin/fixtures">/admin/fixtures</a>
        para verlo aquí.
      </p>
    } @else {
      <div class="pending-list">
        @for (m of pending(); track m.id) {
          @let staged = stagedScoreOf(m);
          @let displayScore = staged ?? (hasDbScore(m) ? { home: m.homeScore!, away: m.awayScore! } : null);

          <article class="pending-row" [class.pending-row--selected]="selectedId() === m.id"
                   (click)="select(m)">
            <div class="pending-row__teams">
              <span class="pending-row__team">{{ teamName(m.homeTeamId) }}</span>
              @if (displayScore) {
                <strong class="pending-row__score">{{ displayScore.home }} — {{ displayScore.away }}</strong>
              } @else {
                <span class="pending-row__sep">vs</span>
              }
              <span class="pending-row__team">{{ teamName(m.awayTeamId) }}</span>
              <p class="pending-row__meta">
                {{ shortId(m.id) }} · {{ phaseName(m.phaseId) }}
                @if (m.venue) { · {{ m.venue }} }
                · {{ kickoffLabel(m.kickoffAt) }}
                @if (isAwaitingResult(m)) {
                  · <strong style="color: var(--color-lost); background: rgba(220,50,50,0.10); padding: 2px 6px; border-radius: 999px;">⏱ Esperando resultado</strong>
                }
                @if (staged) {
                  · <strong style="color: var(--color-text-muted);">guardado para revisión</strong>
                }
                @if (!staged && hasDbScore(m) && !m.pointsCalculated) {
                  · <strong style="color: var(--color-lost);">sin scoring</strong>
                }
                @if (m.pointsCalculated) {
                  · <strong style="color: var(--color-primary-green);">scoring OK</strong>
                }
              </p>
            </div>
            @if (selectedId() === m.id) {
              <span class="pending-row__selected-tag">↓ Seleccionado</span>
            } @else {
              <button class="btn btn--ghost btn--sm" type="button"
                      (click)="select(m); $event.stopPropagation()">
                {{ displayScore ? 'Editar' : 'Seleccionar' }}
              </button>
            }
          </article>

          @if (selectedId() === m.id) {
            <div class="submit-form" style="margin-bottom: var(--space-md);"
                 (click)="$event.stopPropagation()">
              <h2>{{ teamName(m.homeTeamId) }} vs {{ teamName(m.awayTeamId) }}</h2>

              <div class="submit-form__teams">
                <div class="submit-form__team">
                  <strong>{{ teamName(m.homeTeamId) }}</strong>
                  <div class="score-stepper">
                    <button type="button" class="score-stepper__btn"
                            [disabled]="homeScore() === 0"
                            (click)="dec('home')">−</button>
                    <input class="score-stepper__value" type="number" min="0" max="20"
                           [value]="homeScore()" (input)="setScore('home', $any($event.target).value)">
                    <button type="button" class="score-stepper__btn"
                            [disabled]="homeScore() >= 20"
                            (click)="inc('home')">+</button>
                  </div>
                </div>
                <span class="submit-form__divider">—</span>
                <div class="submit-form__team">
                  <strong>{{ teamName(m.awayTeamId) }}</strong>
                  <div class="score-stepper">
                    <button type="button" class="score-stepper__btn"
                            [disabled]="awayScore() === 0"
                            (click)="dec('away')">−</button>
                    <input class="score-stepper__value" type="number" min="0" max="20"
                           [value]="awayScore()" (input)="setScore('away', $any($event.target).value)">
                    <button type="button" class="score-stepper__btn"
                            [disabled]="awayScore() >= 20"
                            (click)="inc('away')">+</button>
                  </div>
                </div>
              </div>

              <div class="submit-form__actions">
                <button type="button" class="btn btn--ghost" (click)="cancelSelect(); $event.stopPropagation()">Cancelar</button>
                <button type="button" class="btn btn--primary" (click)="stage(m); $event.stopPropagation()">Guardar</button>
              </div>
            </div>
          }
        }
      </div>
    }
  `,
})
export class AdminResultsComponent implements OnInit {
  private api = inject(ApiService);
  private toast = inject(ToastService);

  loading = signal(true);
  matches = signal<ResultMatch[]>([]);
  teams = signal<Map<string, string>>(new Map());
  phases = signal<Map<string, string>>(new Map());
  picksByMatch = signal<Map<string, number>>(new Map());

  // Resultados puestos por el admin pero NO escritos en DB todavía. La
  // DB y el scoring se commitean solo cuando se aprieta "Calcular puntos"
  // arriba. Map<matchId, {home, away}>.
  staged = signal<Map<string, StagedScore>>(new Map());

  selectedId = signal<string | null>(null);
  homeScore = signal(0);
  awayScore = signal(0);
  calculating = signal(false);

  // Pending = un partido necesita atención del admin para publicar.
  // Dos casos:
  //   1. Status FINAL pero pointsCalculated=false (ya pusiste el score,
  //      falta correr scoreMatch).
  //   2. Status != FINAL pero ya pasaron 2h del kickoff ("Esperando
  //      resultado" — el partido en realidad terminó pero todavía no
  //      ingresaste score). El user lo ve "EN VIVO" en su feed.
  pending = computed(() => {
    const now = Date.now();
    const matchEndMs = (iso: string) => Date.parse(iso) + 2 * 60 * 60_000;
    return this.matches()
      .filter((m) => {
        if (m.status === 'FINAL' && !m.pointsCalculated) return true;
        if (m.status !== 'FINAL' && now >= matchEndMs(m.kickoffAt)) return true;
        return false;
      })
      .sort((a, b) => a.kickoffAt.localeCompare(b.kickoffAt));
  });

  /** True si el partido ya terminó (kickoff+2h) pero status no es FINAL */
  isAwaitingResult(m: ResultMatch): boolean {
    if (m.status === 'FINAL') return false;
    return Date.now() >= Date.parse(m.kickoffAt) + 2 * 60 * 60_000;
  }

  // Partidos a comitear cuando se dispare "Calcular puntos":
  // los pending que tienen score (staged en memoria o ya guardado en DB).
  // Si el admin no entró score para un FINAL, no lo procesamos.
  toCommit = computed(() => {
    const stagedMap = this.staged();
    return this.pending().filter((m) => stagedMap.has(m.id) || this.hasDbScore(m));
  });

  async ngOnInit() { await this.load(); }

  async load() {
    this.loading.set(true);
    try {
      const [matchesRes, teamsRes, phasesRes, picksRes] = await Promise.all([
        this.api.listMatches(TOURNAMENT_ID),
        this.api.listTeams(TOURNAMENT_ID),
        this.api.listPhases(TOURNAMENT_ID),
        this.api.listAllPicks(TOURNAMENT_ID, 5000),
      ]);

      const tm = new Map<string, string>();
      for (const t of teamsRes.data ?? []) tm.set(t.slug, t.name);
      this.teams.set(tm);

      const pm = new Map<string, string>();
      for (const p of phasesRes.data ?? []) pm.set(p.id, p.name);
      this.phases.set(pm);

      this.matches.set(
        (matchesRes.data ?? []).map((m): ResultMatch => ({
          id: m.id,
          homeTeamId: m.homeTeamId,
          awayTeamId: m.awayTeamId,
          kickoffAt: m.kickoffAt,
          status: (m.status ?? 'SCHEDULED') as ResultMatch['status'],
          homeScore: m.homeScore ?? null,
          awayScore: m.awayScore ?? null,
          pointsCalculated: m.pointsCalculated ?? false,
          version: m.version ?? 1,
          phaseId: m.phaseId,
          venue: (m as { venue?: string | null }).venue ?? null,
        })),
      );

      const counts = new Map<string, number>();
      for (const p of picksRes.data ?? []) {
        counts.set(p.matchId, (counts.get(p.matchId) ?? 0) + 1);
      }
      this.picksByMatch.set(counts);

      if (this.selectedId() && !this.pending().some((m) => m.id === this.selectedId())) {
        this.cancelSelect();
      }
    } finally {
      this.loading.set(false);
    }
  }

  hasDbScore(m: ResultMatch): boolean {
    return m.homeScore !== null && m.awayScore !== null;
  }

  stagedScoreOf(m: ResultMatch): StagedScore | null {
    return this.staged().get(m.id) ?? null;
  }

  select(m: ResultMatch) {
    if (this.selectedId() === m.id) {
      this.cancelSelect();
      return;
    }
    this.selectedId.set(m.id);
    // Pre-fill con staged si existe, si no con DB, si no 0/0.
    const staged = this.staged().get(m.id);
    if (staged) {
      this.homeScore.set(staged.home);
      this.awayScore.set(staged.away);
    } else {
      this.homeScore.set(m.homeScore ?? 0);
      this.awayScore.set(m.awayScore ?? 0);
    }
  }

  cancelSelect() {
    this.selectedId.set(null);
    this.homeScore.set(0);
    this.awayScore.set(0);
  }

  /**
   * Stage del resultado en memoria. NO toca DB. Se ve en el row para
   * revisión visual y se queda editable hasta que se commitee con
   * "Calcular puntos".
   */
  stage(m: ResultMatch) {
    const home = this.homeScore();
    const away = this.awayScore();
    this.staged.update((prev) => {
      const next = new Map(prev);
      next.set(m.id, { home, away });
      return next;
    });
    this.toast.success(`${this.teamName(m.homeTeamId)} ${home}—${away} ${this.teamName(m.awayTeamId)} · guardado para revisión`);
    this.cancelSelect();
  }

  setScore(side: 'home' | 'away', value: string) {
    const n = clamp(Number.parseInt(value, 10));
    if (side === 'home') this.homeScore.set(n); else this.awayScore.set(n);
  }
  inc(side: 'home' | 'away') {
    if (side === 'home') this.homeScore.update((n) => clamp(n + 1));
    else this.awayScore.update((n) => clamp(n + 1));
  }
  dec(side: 'home' | 'away') {
    if (side === 'home') this.homeScore.update((n) => clamp(n - 1));
    else this.awayScore.update((n) => clamp(n - 1));
  }

  picksFor(matchId: string): number { return this.picksByMatch().get(matchId) ?? 0; }
  teamName(slug: string): string { return this.teams().get(slug) ?? slug; }
  phaseName(id: string): string { return this.phases().get(id) ?? '—'; }
  shortId(id: string): string { return `m-${id.slice(-4).toLowerCase()}`; }

  kickoffLabel(iso: string): string {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '—';
    const diff = Date.now() - d.getTime();
    if (diff < 0) {
      return d.toLocaleString('es-EC', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
    }
    if (diff < 3_600_000) return `hace ${Math.max(1, Math.floor(diff / 60_000))} min`;
    if (diff < 86_400_000) return `hace ${Math.floor(diff / 3_600_000)}h`;
    return `hace ${Math.floor(diff / 86_400_000)} días`;
  }

  /**
   * Único punto donde tocamos la DB y disparamos scoring. Para cada
   * partido a comitear: si hay un score staged distinto del DB, hacemos
   * updateMatchResult; luego corremos scoreMatch Lambda.
   */
  async calculatePointsAll() {
    const targets = this.toCommit();
    if (targets.length === 0) return;
    const stagedMap = this.staged();
    const confirmed = confirm(
      `¿Calcular los puntos de ${targets.length} partido${targets.length === 1 ? '' : 's'}?\n\n` +
      `Esto guarda los resultados en la base de datos y procesa los picks de TODOS los usuarios. ` +
      `La operación es idempotente — si la repites no duplica.`,
    );
    if (!confirmed) return;
    this.calculating.set(true);
    let totalUpdated = 0;
    let errored = 0;
    try {
      for (const m of targets) {
        try {
          // 1) Si hay staged score distinto del DB, escribirlo.
          const staged = stagedMap.get(m.id);
          const finalHome = staged ? staged.home : m.homeScore!;
          const finalAway = staged ? staged.away : m.awayScore!;
          const dbDiffers = m.homeScore !== finalHome || m.awayScore !== finalAway || m.status !== 'FINAL';
          if (dbDiffers) {
            const upd = await this.api.updateMatchResult(m.id, finalHome, finalAway, m.version, m.status);
            if (upd?.errors && upd.errors.length > 0) {
              // eslint-disable-next-line no-console
              console.error(`[updateMatchResult ${m.id}] errors:`, upd.errors);
              errored++;
              continue;
            }
          }
          // 2) Lambda scoring.
          const res = await this.api.scoreMatch(m.id);
          totalUpdated += res.data?.updated ?? 0;
        } catch (e) {
          // eslint-disable-next-line no-console
          console.error(`[calculatePointsAll ${m.id}] threw:`, e);
          errored++;
        }
      }
      if (errored > 0) {
        this.toast.error(`${targets.length - errored}/${targets.length} OK · ${errored} fallaron — ver consola`);
      } else {
        this.toast.success(
          `Puntos calculados · ${totalUpdated} pick${totalUpdated === 1 ? '' : 's'} en ${targets.length} partido${targets.length === 1 ? '' : 's'}`,
        );
      }
      // Limpiar staged y recargar desde DB para reflejar el estado real.
      this.staged.set(new Map());
      void this.load();
    } finally {
      this.calculating.set(false);
    }
  }
}

function clamp(n: number): number {
  if (!Number.isFinite(n) || n < 0) return 0;
  if (n > 20) return 20;
  return Math.trunc(n);
}
