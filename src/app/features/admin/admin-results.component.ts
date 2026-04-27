import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { ApiService } from '../../core/api/api.service';
import { ToastService } from '../../core/notifications/toast.service';
import { humanizeError } from '../../core/notifications/domain-errors';

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

@Component({
  standalone: true,
  selector: 'app-admin-results',
  template: `
    <header class="admin-main__head" style="display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: var(--space-md);">
      <div>
        <small>Admin · {{ pending().length }} {{ pending().length === 1 ? 'partido pendiente' : 'partidos pendientes' }}</small>
        <h1>Publicar resultado</h1>
      </div>
      <button class="btn btn--primary" type="button"
              [disabled]="calculating() || unscored().length === 0"
              (click)="calculatePointsAll()"
              [title]="unscored().length === 0 ? 'No hay partidos con resultado guardado pendientes de scoring' : 'Corre score-match Lambda para los ' + unscored().length + ' partidos guardados'">
        {{ calculating() ? 'Calculando…' : 'Calcular puntos (' + unscored().length + ')' }}
      </button>
    </header>

    @if (loading()) {
      <p>Cargando partidos…</p>
    } @else if (pending().length === 0) {
      <p class="empty-state">
        No hay partidos pendientes — todos tienen resultado y puntos calculados.
      </p>
    } @else {
      <div class="pending-list">
        @for (m of pending(); track m.id) {
          <article class="pending-row" [class.pending-row--selected]="selectedId() === m.id"
                   (click)="select(m)">
            <div class="pending-row__teams">
              <span class="pending-row__team">{{ teamName(m.homeTeamId) }}</span>
              @if (hasScore(m)) {
                <strong class="pending-row__score">{{ m.homeScore }} — {{ m.awayScore }}</strong>
              } @else {
                <span class="pending-row__sep">vs</span>
              }
              <span class="pending-row__team">{{ teamName(m.awayTeamId) }}</span>
              <p class="pending-row__meta">
                {{ shortId(m.id) }} · {{ phaseName(m.phaseId) }}
                @if (m.venue) { · {{ m.venue }} }
                · {{ kickoffLabel(m.kickoffAt) }}
                @if (hasScore(m) && !m.pointsCalculated) {
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
                {{ hasScore(m) ? 'Editar' : 'Seleccionar' }}
              </button>
            }
          </article>

          @if (selectedId() === m.id) {
            <form class="submit-form" style="margin-bottom: var(--space-md);"
                  (ngSubmit)="publish(m); $event.preventDefault()"
                  (click)="$event.stopPropagation()">
              <h2>{{ teamName(m.homeTeamId) }} vs {{ teamName(m.awayTeamId) }}</h2>
              <p class="submit-form__lead">
                Guarda el resultado del partido. Después usa el botón
                <strong>"Calcular puntos"</strong> de arriba para procesar los picks.
              </p>

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

              <div class="submit-form__lock">
                <h4>Versión actual</h4>
                <p>
                  Match version: <code>v={{ m.version }}</code> · Conflict 409 si otro admin actualiza.
                </p>
              </div>

              @if (publishError()) {
                <p class="form-card__hint" style="color: var(--color-lost);">{{ publishError() }}</p>
              }

              <div class="submit-form__actions">
                <button type="button" class="btn btn--ghost" [disabled]="publishing()" (click)="cancelSelect(); $event.stopPropagation()">Cancelar</button>
                <button type="submit" class="btn btn--primary" [disabled]="publishing()">
                  {{ publishing() ? 'Guardando…' : (hasScore(m) ? 'Actualizar resultado · v=' + (m.version + 1) : 'Publicar resultado · v=' + (m.version + 1)) }}
                </button>
              </div>
            </form>
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

  selectedId = signal<string | null>(null);
  homeScore = signal(0);
  awayScore = signal(0);
  publishing = signal(false);
  publishError = signal<string | null>(null);
  calculating = signal(false);

  // Pending = todos los partidos que aún no están "cerrados".
  // Un partido queda fuera de la lista solo cuando tiene score Y
  // pointsCalculated=true (es decir, completamente procesado).
  pending = computed(() =>
    this.matches()
      .filter((m) => !(this.hasScore(m) && m.pointsCalculated))
      .sort((a, b) => a.kickoffAt.localeCompare(b.kickoffAt)),
  );

  // Unscored = score guardado pero scoring Lambda no corrido. El botón
  // header "Calcular puntos (N)" cuenta esto y los procesa en bloque.
  unscored = computed(() =>
    this.matches().filter((m) => this.hasScore(m) && !m.pointsCalculated),
  );

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

      // Si el row seleccionado se quedó fuera de la lista (porque ahora ya
      // está scored), limpiamos la selección.
      if (this.selectedId() && !this.pending().some((m) => m.id === this.selectedId())) {
        this.cancelSelect();
      }
    } finally {
      this.loading.set(false);
    }
  }

  hasScore(m: ResultMatch): boolean {
    return m.homeScore !== null && m.awayScore !== null;
  }

  select(m: ResultMatch) {
    this.publishError.set(null);
    if (this.selectedId() === m.id) {
      this.cancelSelect();
      return;
    }
    this.selectedId.set(m.id);
    this.homeScore.set(m.homeScore ?? 0);
    this.awayScore.set(m.awayScore ?? 0);
  }

  cancelSelect() {
    this.selectedId.set(null);
    this.homeScore.set(0);
    this.awayScore.set(0);
    this.publishError.set(null);
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
      // Future
      return d.toLocaleString('es-EC', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
    }
    if (diff < 3_600_000) return `hace ${Math.max(1, Math.floor(diff / 60_000))} min`;
    if (diff < 86_400_000) return `hace ${Math.floor(diff / 3_600_000)}h`;
    return `hace ${Math.floor(diff / 86_400_000)} días`;
  }

  async publish(m: ResultMatch) {
    this.publishing.set(true);
    this.publishError.set(null);
    try {
      const res = await this.api.updateMatchResult(
        m.id,
        this.homeScore(),
        this.awayScore(),
        m.version,
        m.status,
      );
      if (res?.errors && res.errors.length > 0) {
        // eslint-disable-next-line no-console
        console.error('[updateMatchResult] GraphQL errors:', res.errors);
        this.publishError.set(res.errors[0]!.message ?? 'No se pudo guardar el resultado');
        return;
      }
      this.toast.success('Resultado guardado · usa "Calcular puntos" para procesar picks');
      this.cancelSelect();
      void this.load();
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('[publish] threw:', e);
      this.publishError.set(humanizeError(e));
    } finally {
      this.publishing.set(false);
    }
  }

  async calculatePointsAll() {
    const targets = this.unscored();
    if (targets.length === 0) return;
    this.calculating.set(true);
    let totalUpdated = 0;
    let errored = 0;
    try {
      for (const m of targets) {
        try {
          const res = await this.api.scoreMatch(m.id);
          totalUpdated += res.data?.updated ?? 0;
        } catch (e) {
          // eslint-disable-next-line no-console
          console.error(`[scoreMatch ${m.id}] failed`, e);
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
