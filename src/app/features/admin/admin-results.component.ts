import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../core/api/api.service';
import { ToastService } from '../../core/notifications/toast.service';
import { humanizeError } from '../../core/notifications/domain-errors';

const TOURNAMENT_ID = 'mundial-2026';

interface PendingMatch {
  id: string;
  homeTeamId: string;
  awayTeamId: string;
  kickoffAt: string;
  status: string;
  homeScore?: number | null;
  awayScore?: number | null;
  pointsCalculated: boolean;
  version: number;
}

@Component({
  standalone: true,
  selector: 'app-admin-results',
  imports: [FormsModule],
  template: `
    <header class="page-header" style="padding: 0 0 var(--space-md);">
      <small>Mundial 2026 · Publicación de resultados</small>
      <h1 style="font-family: var(--font-display); font-size: 56px; line-height: 1; text-transform: uppercase;">Resultados</h1>
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
        <section style="margin-bottom: var(--space-2xl);">
          <header class="section-heading">
            <div class="section-heading__text">
              <p class="kicker">Pendientes de resultado</p>
              <h2 class="h2">{{ pending().length }} partido{{ pending().length === 1 ? '' : 's' }}</h2>
            </div>
          </header>
          <div style="display: grid; gap: var(--space-md);">
            @for (m of pending(); track m.id) {
              <article class="form-card" style="max-width: 100%;">
                <h3 style="font-family: var(--font-display); font-size: var(--fs-xl); text-transform: uppercase; line-height: 1; margin-bottom: var(--space-sm);">
                  {{ teamName(m.homeTeamId) }} vs {{ teamName(m.awayTeamId) }}
                </h3>
                <p class="form-card__lead">Kickoff: {{ formatKickoff(m.kickoffAt) }}</p>
                <div style="display: grid; grid-template-columns: 1fr 1fr auto; gap: var(--space-md); align-items: end;">
                  <div class="form-card__field" style="margin: 0;">
                    <label class="form-card__label">{{ teamName(m.homeTeamId) }}</label>
                    <input class="form-card__input" type="number" min="0" max="20"
                           [value]="getHome(m.id)"
                           (input)="setScore(m.id, 'home', $any($event.target).value)">
                  </div>
                  <div class="form-card__field" style="margin: 0;">
                    <label class="form-card__label">{{ teamName(m.awayTeamId) }}</label>
                    <input class="form-card__input" type="number" min="0" max="20"
                           [value]="getAway(m.id)"
                           (input)="setScore(m.id, 'away', $any($event.target).value)">
                  </div>
                  <button class="btn btn--primary" type="button"
                          [disabled]="processing()[m.id]"
                          (click)="publish(m)">
                    {{ processing()[m.id] ? 'Publicando…' : 'Publicar resultado' }}
                  </button>
                </div>
                <p class="form-card__hint" style="margin-top: var(--space-sm);">
                  Al publicar, se marca FINAL y se ejecuta el scoring automáticamente.
                </p>
              </article>
            }
          </div>
        </section>
      }

      @if (unscored().length > 0) {
        <section>
          <header class="section-heading">
            <div class="section-heading__text">
              <p class="kicker" style="color: var(--color-lost);">FINAL sin scoring</p>
              <h2 class="h2">{{ unscored().length }} pendiente{{ unscored().length === 1 ? '' : 's' }} de cálculo</h2>
            </div>
          </header>
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
                  <p class="form-card__hint" style="margin-top: 4px;">{{ formatKickoff(m.kickoffAt) }}</p>
                </div>
                <button class="btn btn--ghost" type="button"
                        [disabled]="processing()[m.id]"
                        (click)="scoreOnly(m)">
                  {{ processing()[m.id] ? 'Calculando…' : 'Calcular puntos' }}
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
  matches = signal<PendingMatch[]>([]);
  teams = signal<Map<string, string>>(new Map());
  scoreEdits = signal<Map<string, { home: number; away: number }>>(new Map());
  processing = signal<Record<string, boolean>>({});

  pending = signal<PendingMatch[]>([]);
  unscored = signal<PendingMatch[]>([]);

  async ngOnInit() { await this.load(); }

  async load() {
    this.loading.set(true);
    try {
      const [matchesRes, teamsRes] = await Promise.all([
        this.api.listMatches(TOURNAMENT_ID),
        this.api.listTeams(TOURNAMENT_ID),
      ]);
      const tm = new Map<string, string>();
      for (const t of teamsRes.data ?? []) tm.set(t.slug, t.name);
      this.teams.set(tm);

      const items = (matchesRes.data ?? []).map((m): PendingMatch => ({
        id: m.id, homeTeamId: m.homeTeamId, awayTeamId: m.awayTeamId,
        kickoffAt: m.kickoffAt, status: m.status ?? 'SCHEDULED',
        homeScore: m.homeScore, awayScore: m.awayScore,
        pointsCalculated: m.pointsCalculated ?? false,
        version: m.version ?? 1,
      }));
      this.matches.set(items);

      const now = Date.now();
      this.pending.set(items
        .filter((m) => m.status !== 'FINAL' && Date.parse(m.kickoffAt) < now)
        .sort((a, b) => a.kickoffAt.localeCompare(b.kickoffAt)));
      this.unscored.set(items
        .filter((m) => m.status === 'FINAL' && !m.pointsCalculated)
        .sort((a, b) => a.kickoffAt.localeCompare(b.kickoffAt)));
    } finally {
      this.loading.set(false);
    }
  }

  teamName(slug: string): string { return this.teams().get(slug) ?? slug; }

  formatKickoff(iso: string): string {
    return new Date(iso).toLocaleString('es-EC', {
      timeZone: 'America/Guayaquil',
      day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false,
    });
  }

  getHome(id: string): number | null {
    return this.scoreEdits().get(id)?.home ?? null;
  }
  getAway(id: string): number | null {
    return this.scoreEdits().get(id)?.away ?? null;
  }
  setScore(id: string, side: 'home' | 'away', value: string) {
    const n = Number.parseInt(value, 10);
    if (!Number.isFinite(n)) return;
    this.scoreEdits.update((m) => {
      const copy = new Map(m);
      const cur = copy.get(id) ?? { home: 0, away: 0 };
      copy.set(id, side === 'home' ? { ...cur, home: n } : { ...cur, away: n });
      return copy;
    });
  }

  private setProcessing(id: string, val: boolean) {
    this.processing.update((p) => ({ ...p, [id]: val }));
  }

  async publish(m: PendingMatch) {
    const edit = this.scoreEdits().get(m.id);
    if (!edit) {
      this.toast.error('Ingresa el marcador antes de publicar');
      return;
    }
    this.setProcessing(m.id, true);
    try {
      await this.api.updateMatchResult(m.id, edit.home, edit.away, m.version);
      // Trigger scoring
      const res = await this.api.scoreMatch(m.id);
      const updated = res.data?.updated ?? 0;
      this.toast.success(`Publicado · ${updated} pick${updated === 1 ? '' : 's'} actualizado${updated === 1 ? '' : 's'}`);
      void this.load();
    } catch (e) {
      this.toast.error(humanizeError(e));
    } finally {
      this.setProcessing(m.id, false);
    }
  }

  async scoreOnly(m: PendingMatch) {
    this.setProcessing(m.id, true);
    try {
      const res = await this.api.scoreMatch(m.id);
      const updated = res.data?.updated ?? 0;
      this.toast.success(`Scoring corrido · ${updated} pick${updated === 1 ? '' : 's'} actualizado${updated === 1 ? '' : 's'}`);
      void this.load();
    } catch (e) {
      this.toast.error(humanizeError(e));
    } finally {
      this.setProcessing(m.id, false);
    }
  }
}
