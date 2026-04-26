import { Component, Input, OnInit, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ApiService } from '../../core/api/api.service';
import { AuthService } from '../../core/auth/auth.service';
import { apiClient } from '../../core/api/client';
import { PickCardComponent } from './pick-card.component';

interface MatchData {
  id: string;
  tournamentId: string;
  phaseId: string;
  homeTeamId: string;
  awayTeamId: string;
  kickoffAt: string;
  status: string;
  homeScore?: number | null;
  awayScore?: number | null;
}

interface PickData {
  homeScorePred: number;
  awayScorePred: number;
  pointsEarned?: number | null;
  exactScore?: boolean | null;
  correctResult?: boolean | null;
}

@Component({
  standalone: true,
  selector: 'app-pick-detail',
  imports: [PickCardComponent, RouterLink],
  template: `
    <section class="container">
      <a routerLink="/picks" class="back-link">← Volver a picks</a>

      @let m = match();
      @let s = stats();

      @if (loading()) {
        <p>Cargando partido…</p>
      } @else if (m !== null) {
        <app-pick-card [match]="m" [existingPick]="pick()" [pointsEarned]="pick()?.pointsEarned" />

        @if (locked() && s !== null) {
          <section class="pick-aggregate">
            <h3 class="pick-aggregate__title">Agregado de picks</h3>
            <div class="pick-aggregate__row">
              <span>Marcador exacto</span>
              <div class="pick-aggregate__bar"><div class="pick-aggregate__fill" [style.width.%]="s.exactPct"></div></div>
              <span>{{ s.exactPct }}%</span>
            </div>
            <div class="pick-aggregate__row">
              <span>Resultado</span>
              <div class="pick-aggregate__bar"><div class="pick-aggregate__fill" [style.width.%]="s.resultPct"></div></div>
              <span>{{ s.resultPct }}%</span>
            </div>
            <p class="pick-aggregate__total">Sobre {{ s.total }} picks de jugadores.</p>
          </section>
        }
      } @else {
        <p>Partido no encontrado.</p>
      }
    </section>
  `,
})
export class PickDetailComponent implements OnInit {
  @Input() id!: string;

  private api = inject(ApiService);
  private auth = inject(AuthService);

  match = signal<MatchData | null>(null);
  pick = signal<PickData | null>(null);
  stats = signal<{ exactPct: number; resultPct: number; total: number } | null>(null);
  loading = signal(true);

  locked = computed(() => {
    const m = this.match();
    return m ? Date.now() >= Date.parse(m.kickoffAt) : false;
  });

  async ngOnInit() {
    try {
      const m = await this.api.getMatch(this.id);
      const matchItem = m.data ? {
        id: m.data.id,
        tournamentId: m.data.tournamentId,
        phaseId: m.data.phaseId,
        homeTeamId: m.data.homeTeamId,
        awayTeamId: m.data.awayTeamId,
        kickoffAt: m.data.kickoffAt,
        status: m.data.status ?? 'SCHEDULED',
        homeScore: m.data.homeScore,
        awayScore: m.data.awayScore,
      } : null;
      this.match.set(matchItem);

      const userId = this.auth.user()?.sub;
      if (userId) {
        const myPicks = await this.api.myPicks(userId);
        const found = (myPicks.data ?? []).find((p) => p.matchId === this.id);
        if (found) {
          this.pick.set({
            homeScorePred: found.homeScorePred,
            awayScorePred: found.awayScorePred,
            pointsEarned: found.pointsEarned,
            exactScore: found.exactScore,
            correctResult: found.correctResult,
          });
        }
      }

      if (this.locked()) {
        const matchPicks = await apiClient.models.Pick.list({
          filter: { matchId: { eq: this.id } },
        });
        const items = matchPicks.data ?? [];
        if (items.length > 0) {
          const exact = items.filter((p) => p.exactScore === true).length;
          const result = items.filter((p) => p.correctResult === true).length;
          this.stats.set({
            exactPct: Math.round((exact / items.length) * 100),
            resultPct: Math.round((result / items.length) * 100),
            total: items.length,
          });
        }
      }
    } finally {
      this.loading.set(false);
    }
  }
}
