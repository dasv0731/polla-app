import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { ApiService } from '../../core/api/api.service';
import { AuthService } from '../../core/auth/auth.service';
import { TimeService } from '../../core/time/time.service';
import { PickCardComponent } from './pick-card.component';

const TOURNAMENT_ID = 'mundial-2026';

interface MatchWithMeta {
  id: string;
  kickoffAt: string;
  phaseId: string;
  homeTeamId: string;
  awayTeamId: string;
  homeScore?: number | null;
  awayScore?: number | null;
  status?: string;
  phaseLabel: string;
  homeTeamName: string;
  awayTeamName: string;
  pick: {
    homeScorePred: number;
    awayScorePred: number;
    pointsEarned?: number | null;
    exactScore?: boolean | null;
    correctResult?: boolean | null;
  } | null;
}

@Component({
  standalone: true,
  selector: 'app-picks-list',
  imports: [PickCardComponent],
  template: `
    <section class="container">
      <h1>Mundial 2026 — Mis picks</h1>

      <div class="view-mode-toggle">
        <button class="view-mode-toggle__btn"
                [class.is-active]="tab() === 'upcoming'"
                (click)="tab.set('upcoming')">Próximos ({{ upcomingCount() }})</button>
        <button class="view-mode-toggle__btn"
                [class.is-active]="tab() === 'played'"
                (click)="tab.set('played')">Jugados ({{ playedCount() }})</button>
      </div>

      @if (loading()) {
        <p>Cargando partidos…</p>
      } @else if (visible().length === 0) {
        <p>No hay partidos en esta vista.</p>
      } @else {
        <div class="picks-stack">
          @for (m of visible(); track m.id) {
            <app-pick-card
              [match]="m"
              [phaseLabel]="m.phaseLabel"
              [existingPick]="m.pick"
              [pointsEarned]="m.pick?.pointsEarned" />
          }
        </div>
      }
    </section>
  `,
})
export class PicksListComponent implements OnInit {
  private api = inject(ApiService);
  private auth = inject(AuthService);
  private time = inject(TimeService);

  tab = signal<'upcoming' | 'played'>('upcoming');
  matches = signal<MatchWithMeta[]>([]);
  loading = signal(true);

  upcomingCount = computed(() => this.matches().filter((m) => !this.time.isPast(m.kickoffAt)).length);
  playedCount = computed(() => this.matches().filter((m) => this.time.isPast(m.kickoffAt)).length);
  visible = computed(() =>
    this.matches().filter((m) =>
      this.tab() === 'upcoming' ? !this.time.isPast(m.kickoffAt) : this.time.isPast(m.kickoffAt),
    ),
  );

  async ngOnInit() {
    const userId = this.auth.user()?.sub;
    if (!userId) {
      this.loading.set(false);
      return;
    }

    try {
      const [matchesRes, picksRes, phasesRes, teamsRes] = await Promise.all([
        this.api.listMatches(TOURNAMENT_ID),
        this.api.myPicks(userId),
        this.api.listPhases(TOURNAMENT_ID),
        this.api.listTeams(TOURNAMENT_ID),
      ]);

      const phaseLabels = new Map<string, string>(
        (phasesRes.data ?? []).map((p) => [p.id, p.name]),
      );
      const teamNames = new Map<string, string>(
        (teamsRes.data ?? []).map((t) => [t.slug, t.name]),
      );
      const pickByMatch = new Map(
        (picksRes.data ?? []).map((p) => [
          p.matchId,
          {
            homeScorePred: p.homeScorePred,
            awayScorePred: p.awayScorePred,
            pointsEarned: p.pointsEarned,
            exactScore: p.exactScore,
            correctResult: p.correctResult,
          },
        ]),
      );

      const enriched: MatchWithMeta[] = (matchesRes.data ?? [])
        .map((m) => ({
          id: m.id,
          kickoffAt: m.kickoffAt,
          phaseId: m.phaseId,
          homeTeamId: m.homeTeamId,
          awayTeamId: m.awayTeamId,
          homeScore: m.homeScore,
          awayScore: m.awayScore,
          status: m.status ?? undefined,
          phaseLabel: phaseLabels.get(m.phaseId) ?? '',
          homeTeamName: teamNames.get(m.homeTeamId) ?? m.homeTeamId,
          awayTeamName: teamNames.get(m.awayTeamId) ?? m.awayTeamId,
          pick: pickByMatch.get(m.id) ?? null,
        }))
        .sort((a, b) => a.kickoffAt.localeCompare(b.kickoffAt));

      this.matches.set(enriched);
    } finally {
      this.loading.set(false);
    }
  }
}
