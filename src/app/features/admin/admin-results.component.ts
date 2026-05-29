import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ApiService } from '../../core/api/api.service';
import { ToastService } from '../../core/notifications/toast.service';
import { ConfirmDialogService } from '../../shared/ui/confirm-dialog.service';

const TOURNAMENT_ID = 'mundial-2026';
/** Clave de localStorage donde se guardan los scores tipeados por el admin
 *  pero no confirmados ("Calcular puntos"). Si el admin recarga durante
 *  un día con varios partidos, no pierde lo que entró. Se limpia al
 *  commitear exitosamente. */
const STAGED_KEY = 'admin-results-staged-v1';

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
              [title]="toCommit().length === 0 ? 'No hay partidos guardados pendientes' : 'Publica el marcador y corre scoring para los ' + toCommit().length + ' partidos'">
        {{ calculating() ? 'Procesando…' : 'Publicar (' + toCommit().length + ')' }}
      </button>
    </header>

    @if (loading()) {
      <p>Cargando partidos…</p>
    } @else if (pending().length === 0) {
      <p class="empty-state">
        No hay partidos pendientes.
        <br>Cuando un partido en vivo termine, marca <strong>"Finalizar"</strong> en
        <a class="link-green" routerLink="/admin/fixtures">/admin/fixtures</a>
        para que aparezca aquí, ingresar el marcador y publicar los puntos.
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
                            [attr.aria-label]="'Restar gol ' + teamName(m.homeTeamId)"
                            [disabled]="homeScore() === 0"
                            (click)="dec('home')"><span aria-hidden="true">−</span></button>
                    <input class="score-stepper__value" type="number" min="0" max="20"
                           inputmode="numeric" autocomplete="off" spellcheck="false"
                           [attr.aria-label]="'Goles ' + teamName(m.homeTeamId)"
                           [value]="homeScore()" (input)="setScore('home', $any($event.target).value)">
                    <button type="button" class="score-stepper__btn"
                            [attr.aria-label]="'Sumar gol ' + teamName(m.homeTeamId)"
                            [disabled]="homeScore() >= 20"
                            (click)="inc('home')"><span aria-hidden="true">+</span></button>
                  </div>
                </div>
                <span class="submit-form__divider">—</span>
                <div class="submit-form__team">
                  <strong>{{ teamName(m.awayTeamId) }}</strong>
                  <div class="score-stepper">
                    <button type="button" class="score-stepper__btn"
                            [attr.aria-label]="'Restar gol ' + teamName(m.awayTeamId)"
                            [disabled]="awayScore() === 0"
                            (click)="dec('away')"><span aria-hidden="true">−</span></button>
                    <input class="score-stepper__value" type="number" min="0" max="20"
                           inputmode="numeric" autocomplete="off" spellcheck="false"
                           [attr.aria-label]="'Goles ' + teamName(m.awayTeamId)"
                           [value]="awayScore()" (input)="setScore('away', $any($event.target).value)">
                    <button type="button" class="score-stepper__btn"
                            [attr.aria-label]="'Sumar gol ' + teamName(m.awayTeamId)"
                            [disabled]="awayScore() >= 20"
                            (click)="inc('away')"><span aria-hidden="true">+</span></button>
                  </div>
                </div>
              </div>

              <div class="submit-form__actions">
                <button type="button" class="btn btn--ghost" (click)="cancelSelect(); $event.stopPropagation()">Cancelar</button>
                <button type="button" class="btn btn--primary" (click)="stage(m); $event.stopPropagation()">Guardar marcador</button>
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
  private confirmDialog = inject(ConfirmDialogService);

  loading = signal(true);
  matches = signal<ResultMatch[]>([]);
  teams = signal<Map<string, string>>(new Map());
  phases = signal<Map<string, string>>(new Map());
  picksByMatch = signal<Map<string, number>>(new Map());

  // Resultados puestos por el admin pero NO escritos en DB todavía. La
  // DB y el scoring se commitean solo cuando se aprieta "Calcular puntos"
  // arriba. Map<matchId, {home, away}>.
  //
  // Persistido en localStorage (`STAGED_KEY`) para que si el admin recarga
  // la pestaña durante un día con varios partidos, no pierde lo tipeado.
  staged = signal<Map<string, StagedScore>>(this.loadStagedFromStorage());

  selectedId = signal<string | null>(null);
  homeScore = signal(0);
  awayScore = signal(0);
  calculating = signal(false);

  // Pending = partidos finalizados (admin clickeó "Finalizar" en /admin/fixtures)
  // pero sin pointsCalculated = true. La 2h-auto-pending se eliminó: el
  // admin debe marcar explícitamente "Finalizar" para que un partido
  // entre en esta cola.
  pending = computed(() =>
    this.matches()
      .filter((m) => m.status === 'FINAL' && !m.pointsCalculated)
      .sort((a, b) => a.kickoffAt.localeCompare(b.kickoffAt)),
  );

  /** True si el partido fue finalizado por admin pero todavía no se
   *  ingresó el marcador. */
  isAwaitingResult(m: ResultMatch): boolean {
    return m.status === 'FINAL' && (m.homeScore == null || m.awayScore == null);
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
    this.persistStaged();
    this.toast.success(`${this.teamName(m.homeTeamId)} ${home}—${away} ${this.teamName(m.awayTeamId)} · guardado para revisión`);
    this.cancelSelect();
  }

  /** Hidrata `staged` desde localStorage en el ctor del signal. Si el JSON
   *  está corrupto, arranca vacío sin throw. */
  private loadStagedFromStorage(): Map<string, StagedScore> {
    if (typeof localStorage === 'undefined') return new Map();
    try {
      const raw = localStorage.getItem(STAGED_KEY);
      if (!raw) return new Map();
      const obj = JSON.parse(raw) as Record<string, StagedScore>;
      return new Map(Object.entries(obj));
    } catch {
      return new Map();
    }
  }

  /** Persiste el Map staged actual. Llamar tras cada stage() y al limpiar. */
  private persistStaged(): void {
    if (typeof localStorage === 'undefined') return;
    try {
      const map = this.staged();
      if (map.size === 0) {
        localStorage.removeItem(STAGED_KEY);
        return;
      }
      const obj: Record<string, StagedScore> = {};
      for (const [k, v] of map) obj[k] = v;
      localStorage.setItem(STAGED_KEY, JSON.stringify(obj));
    } catch {
      /* quota / private mode — ignoramos, el comportamiento queda como antes */
    }
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
    const confirmed = await this.confirmDialog.ask({
      title: 'Calcular puntos',
      message:
        `Vas a calcular los puntos de ${targets.length} partido${targets.length === 1 ? '' : 's'}. ` +
        'Guarda los resultados en la base de datos y procesa los picks de TODOS los usuarios. ' +
        'Idempotente — si la repites no duplica.',
      confirmLabel: 'Calcular puntos',
    });
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
      this.persistStaged();
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
