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
    <header class="admin-main__head">
      <div>
        <small>Admin · {{ pending().length }} {{ pending().length === 1 ? 'partido pendiente' : 'partidos pendientes' }}</small>
        <h1>Publicar resultado</h1>
      </div>
    </header>

    @if (loading()) {
      <p>Cargando partidos pendientes…</p>
    } @else if (pending().length === 0 && unscored().length === 0) {
      <p class="empty-state">
        No hay partidos pendientes de resultado o scoring.
        <br>Cuando un partido pase su kickoff, aparecerá aquí.
      </p>
    } @else {
      @if (pending().length > 0) {
        <h2 style="font-family: var(--font-display); font-size: var(--fs-xl); text-transform: uppercase; line-height: 1; margin-bottom: var(--space-md);">
          Partidos sin resultado
        </h2>

        <div class="pending-list">
          @for (m of pending(); track m.id) {
            <article class="pending-row" [class.pending-row--selected]="selectedId() === m.id"
                     (click)="select(m)">
              <div class="pending-row__teams">
                <span class="pending-row__team">{{ teamName(m.homeTeamId) }}</span>
                <span class="pending-row__sep">vs</span>
                <span class="pending-row__team">{{ teamName(m.awayTeamId) }}</span>
                <p class="pending-row__meta">
                  {{ shortId(m.id) }} · {{ phaseName(m.phaseId) }}
                  @if (m.venue) { · {{ m.venue }} }
                  · finalizó {{ relativeFromKickoff(m.kickoffAt) }}
                </p>
              </div>
              @if (selectedId() === m.id) {
                <span class="pending-row__selected-tag">↓ Seleccionado</span>
              } @else {
                <button class="btn btn--ghost btn--sm" type="button" (click)="select(m); $event.stopPropagation()">
                  Seleccionar
                </button>
              }
            </article>
          }
        </div>
      }

      @let sel = selectedMatch();
      @if (sel !== null) {
        <h2 style="font-family: var(--font-display); font-size: var(--fs-xl); text-transform: uppercase; line-height: 1; margin-bottom: var(--space-md);">
          Resultado del partido seleccionado
        </h2>

        <form class="submit-form" (ngSubmit)="publish(sel); $event.preventDefault()">
          <h2>{{ teamName(sel.homeTeamId) }} vs {{ teamName(sel.awayTeamId) }}</h2>
          <p class="submit-form__lead">
            Al publicar, se dispara <code>score-match</code> Lambda que recalcula puntos para
            <strong>{{ formatNumber(picksFor(sel.id)) }}</strong> {{ picksFor(sel.id) === 1 ? 'pick' : 'picks' }}.
            Operación idempotente — se puede re-correr.
          </p>

          <div class="submit-form__teams">
            <div class="submit-form__team">
              <strong>{{ teamName(sel.homeTeamId) }}</strong>
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
              <strong>{{ teamName(sel.awayTeamId) }}</strong>
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
            <h4>Optimistic locking</h4>
            <p>
              Match version: <code>v={{ sel.version }}</code> · Conflict 409 si otro admin actualiza.
            </p>
          </div>

          <div class="submit-form__actions">
            <button type="button" class="btn btn--ghost" [disabled]="publishing()" (click)="cancelSelect()">Cancelar</button>
            <button type="submit" class="btn btn--primary" [disabled]="publishing()">
              {{ publishing() ? 'Publicando…' : ('Publicar resultado · v=' + (sel.version + 1)) }}
            </button>
          </div>

          @if (publishing()) {
            <div class="polling-status">
              <div class="polling-status__spinner"></div>
              <div>
                <p>Procesando picks...</p>
                <p>pointsCalculated: <code>false</code> · score-match Lambda corriendo</p>
              </div>
            </div>
          }
        </form>
      }

      @if (unscored().length > 0) {
        <section style="margin-top: var(--space-2xl);">
          <h2 style="font-family: var(--font-display); font-size: var(--fs-xl); text-transform: uppercase; line-height: 1; color: var(--color-lost); margin-bottom: var(--space-sm);">
            FINAL sin scoring
          </h2>
          <p style="color: var(--color-text-muted); margin-bottom: var(--space-md);">
            Estos partidos están en FINAL pero los puntos no se calcularon. Re-corre el scoring manualmente.
          </p>
          <div style="display: grid; gap: var(--space-md);">
            @for (m of unscored(); track m.id) {
              <article class="form-card" style="max-width: 100%; display: grid; grid-template-columns: 1fr auto; gap: var(--space-md); align-items: center;">
                <div>
                  <h3 style="font-family: var(--font-display); font-size: var(--fs-md); text-transform: uppercase; line-height: 1;">
                    {{ teamName(m.homeTeamId) }} {{ m.homeScore }} — {{ m.awayScore }} {{ teamName(m.awayTeamId) }}
                  </h3>
                  <p class="form-card__hint" style="margin-top: 4px;">
                    {{ shortId(m.id) }} · finalizó {{ relativeFromKickoff(m.kickoffAt) }}
                  </p>
                </div>
                <button class="btn btn--ghost" type="button"
                        [disabled]="rescoring()[m.id]"
                        (click)="scoreOnly(m)">
                  {{ rescoring()[m.id] ? 'Calculando…' : 'Calcular puntos' }}
                </button>
              </article>
            }
          </div>
        </section>
      }
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
  rescoring = signal<Record<string, boolean>>({});

  pending = computed(() =>
    this.matches()
      .filter((m) => m.status !== 'FINAL' && Date.parse(m.kickoffAt) < Date.now())
      .sort((a, b) => a.kickoffAt.localeCompare(b.kickoffAt)),
  );

  unscored = computed(() =>
    this.matches()
      .filter((m) => m.status === 'FINAL' && !m.pointsCalculated)
      .sort((a, b) => a.kickoffAt.localeCompare(b.kickoffAt)),
  );

  selectedMatch = computed(() => {
    const id = this.selectedId();
    return id ? (this.matches().find((m) => m.id === id) ?? null) : null;
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

      // Auto-select the oldest pending match if nothing chosen yet.
      if (this.selectedId() === null && this.pending().length > 0) {
        this.select(this.pending()[0]!);
      } else if (this.selectedId() && !this.matches().some((m) => m.id === this.selectedId())) {
        this.selectedId.set(null);
      }
    } finally {
      this.loading.set(false);
    }
  }

  select(m: ResultMatch) {
    this.selectedId.set(m.id);
    this.homeScore.set(m.homeScore ?? 0);
    this.awayScore.set(m.awayScore ?? 0);
  }

  cancelSelect() {
    this.selectedId.set(null);
    this.homeScore.set(0);
    this.awayScore.set(0);
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
  formatNumber(n: number): string { return n.toLocaleString('es-EC'); }

  relativeFromKickoff(iso: string): string {
    const diff = Date.now() - Date.parse(iso);
    if (diff < 0) return 'aún no termina';
    if (diff < 3_600_000) return `hace ${Math.max(1, Math.floor(diff / 60_000))} min`;
    if (diff < 86_400_000) return `hace ${Math.floor(diff / 3_600_000)}h`;
    return `hace ${Math.floor(diff / 86_400_000)} días`;
  }

  async publish(m: ResultMatch) {
    this.publishing.set(true);
    try {
      await this.api.updateMatchResult(m.id, this.homeScore(), this.awayScore(), m.version);
      const res = await this.api.scoreMatch(m.id);
      const updated = res.data?.updated ?? 0;
      this.toast.success(
        `Publicado · ${updated} pick${updated === 1 ? '' : 's'} actualizado${updated === 1 ? '' : 's'}`,
      );
      this.cancelSelect();
      void this.load();
    } catch (e) {
      this.toast.error(humanizeError(e));
    } finally {
      this.publishing.set(false);
    }
  }

  async scoreOnly(m: ResultMatch) {
    this.rescoring.update((p) => ({ ...p, [m.id]: true }));
    try {
      const res = await this.api.scoreMatch(m.id);
      const updated = res.data?.updated ?? 0;
      this.toast.success(`Scoring corrido · ${updated} pick${updated === 1 ? '' : 's'} actualizado${updated === 1 ? '' : 's'}`);
      void this.load();
    } catch (e) {
      this.toast.error(humanizeError(e));
    } finally {
      this.rescoring.update((p) => ({ ...p, [m.id]: false }));
    }
  }
}

function clamp(n: number): number {
  if (!Number.isFinite(n) || n < 0) return 0;
  if (n > 20) return 20;
  return Math.trunc(n);
}
