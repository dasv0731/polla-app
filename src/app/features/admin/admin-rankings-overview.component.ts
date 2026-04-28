import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { ApiService } from '../../core/api/api.service';

const TOURNAMENT_ID = 'mundial-2026';
const PAGE_SIZE = 25;

interface Row {
  userId: string;
  handle: string;
  totalPts: number;
  exactCount: number;
  resultCount: number;
  // Breakdown por fuente (todos forman parte del totalPts en UserTournamentTotal):
  matchPts: number;
  standingsPts: number;
  bracketPts: number;
  premundialPts: number;
  triviaPts: number;
  // Contadores de aciertos
  matchCorrect: number;
  matchExact: number;
}

@Component({
  standalone: true,
  selector: 'app-admin-rankings-overview',
  template: `
    <header class="admin-main__head">
      <div>
        <small>Admin · ranking global con breakdown</small>
        <h1>Rankings (detallado)</h1>
      </div>
    </header>

    @if (loading()) {
      <p>Calculando agregados…</p>
    } @else if (rows().length === 0) {
      <p class="empty-state">No hay datos de ranking aún.</p>
    } @else {
      <p style="font-size: var(--fs-sm); color: var(--color-text-muted); margin-bottom: var(--space-md);">
        {{ rows().length }} usuarios · solo modo COMPLETE entra al ranking global.
        Página {{ page() + 1 }} de {{ totalPages() }}.
      </p>

      <div class="standings-wrap" style="overflow-x: auto;">
        <table class="standings standings--group" style="min-width: 900px;">
          <thead>
            <tr>
              <th>#</th>
              <th>Usuario</th>
              <th title="Puntos totales en UserTournamentTotal">Total</th>
              <th title="Puntos de marcadores de partido (Pick)">Marcadores</th>
              <th title="Picks con marcador exacto / total picks scoreados">Exactos</th>
              <th title="Picks con resultado correcto (1·X·2)">Resultados</th>
              <th title="GroupStandingPick + BestThirdsPick">Fase grupos</th>
              <th title="BracketPick — eliminatorias">Bracket</th>
              <th title="SpecialPick — campeón / subcampeón / revelación">Pre-mundial</th>
              <th title="TriviaAnswer correctas durante LIVE">Trivia</th>
            </tr>
          </thead>
          <tbody>
            @for (r of pagedRows(); track r.userId; let i = $index) {
              <tr>
                <td class="pos">{{ pageStart() + i + 1 }}</td>
                <td>&#64;{{ r.handle }}</td>
                <td><strong>{{ r.totalPts }}</strong></td>
                <td>{{ r.matchPts }}</td>
                <td>{{ r.matchExact }}</td>
                <td>{{ r.matchCorrect }}</td>
                <td>{{ r.standingsPts }}</td>
                <td>{{ r.bracketPts }}</td>
                <td>{{ r.premundialPts }}</td>
                <td>{{ r.triviaPts }}</td>
              </tr>
            }
          </tbody>
        </table>
      </div>

      <div style="display: flex; justify-content: flex-end; gap: var(--space-sm); margin-top: var(--space-md);">
        <button class="btn btn--ghost btn--sm" type="button"
                [disabled]="page() === 0"
                (click)="prevPage()">← Anterior</button>
        <button class="btn btn--ghost btn--sm" type="button"
                [disabled]="page() >= totalPages() - 1"
                (click)="nextPage()">Siguiente →</button>
      </div>

      <p style="margin-top: var(--space-md); font-size: var(--fs-xs); color: var(--color-text-muted);">
        Suma de columnas (Marcadores + Fase grupos + Bracket + Pre-mundial + Trivia) puede no
        cuadrar exacto con Total si Lambdas de scoring corrieron en momentos distintos —
        re-correr "Calcular puntos" reconcilia.
      </p>
    }
  `,
})
export class AdminRankingsOverviewComponent implements OnInit {
  private api = inject(ApiService);

  loading = signal(true);
  rows = signal<Row[]>([]);
  page = signal(0);

  pageStart = computed(() => this.page() * PAGE_SIZE);
  totalPages = computed(() => Math.max(1, Math.ceil(this.rows().length / PAGE_SIZE)));
  pagedRows = computed(() => this.rows().slice(this.pageStart(), this.pageStart() + PAGE_SIZE));

  async ngOnInit() {
    this.loading.set(true);
    try {
      const [totalsRes, picksRes, standingsRes, thirdsRes, bracketsRes, specialsRes, triviaRes, usersRes] =
        await Promise.all([
          this.api.listAllTournamentTotals(TOURNAMENT_ID),
          this.api.listAllPicks(TOURNAMENT_ID, 5000),
          this.api.listAllStandings(TOURNAMENT_ID),
          this.api.listAllBestThirds(TOURNAMENT_ID),
          this.api.listAllBrackets(TOURNAMENT_ID),
          this.api.listAllSpecials(TOURNAMENT_ID),
          this.api.listAllTriviaAnswers(5000),
          this.api.listUsers(2000),
        ]);

      const handles = new Map<string, string>();
      for (const u of (usersRes.data ?? []) as Array<{ sub: string; handle: string }>) {
        handles.set(u.sub, u.handle);
      }

      const acc = new Map<string, Row>();
      const ensure = (uid: string): Row => {
        let r = acc.get(uid);
        if (!r) {
          r = {
            userId: uid,
            handle: handles.get(uid) ?? `user-${uid.slice(0, 6)}`,
            totalPts: 0, exactCount: 0, resultCount: 0,
            matchPts: 0, standingsPts: 0, bracketPts: 0, premundialPts: 0, triviaPts: 0,
            matchCorrect: 0, matchExact: 0,
          };
          acc.set(uid, r);
        }
        return r;
      };

      for (const t of (totalsRes.data ?? []) as Array<{ userId: string; points?: number; exactCount?: number; resultCount?: number }>) {
        const r = ensure(t.userId);
        r.totalPts = t.points ?? 0;
        r.exactCount = t.exactCount ?? 0;
        r.resultCount = t.resultCount ?? 0;
      }
      for (const p of (picksRes.data ?? []) as Array<{ userId: string; pointsEarned?: number | null; exactScore?: boolean | null; correctResult?: boolean | null }>) {
        const r = ensure(p.userId);
        r.matchPts += p.pointsEarned ?? 0;
        if (p.exactScore) r.matchExact++;
        if (p.correctResult) r.matchCorrect++;
      }
      for (const s of (standingsRes.data ?? []) as Array<{ userId: string; pointsEarned?: number | null }>) {
        ensure(s.userId).standingsPts += s.pointsEarned ?? 0;
      }
      for (const t of (thirdsRes.data ?? []) as Array<{ userId: string; pointsEarned?: number | null }>) {
        ensure(t.userId).standingsPts += t.pointsEarned ?? 0;
      }
      for (const b of (bracketsRes.data ?? []) as Array<{ userId: string; pointsEarned?: number | null }>) {
        ensure(b.userId).bracketPts += b.pointsEarned ?? 0;
      }
      for (const sp of (specialsRes.data ?? []) as Array<{ userId: string; pointsEarned?: number | null }>) {
        ensure(sp.userId).premundialPts += sp.pointsEarned ?? 0;
      }
      for (const ta of (triviaRes.data ?? []) as Array<{ userId: string; pointsEarned?: number | null }>) {
        ensure(ta.userId).triviaPts += ta.pointsEarned ?? 0;
      }

      const out = [...acc.values()].sort((a, b) =>
        b.totalPts - a.totalPts ||
        b.matchExact - a.matchExact ||
        b.matchCorrect - a.matchCorrect ||
        a.handle.localeCompare(b.handle),
      );
      this.rows.set(out);
    } finally {
      this.loading.set(false);
    }
  }

  prevPage() { this.page.update((p) => Math.max(0, p - 1)); }
  nextPage() { this.page.update((p) => Math.min(this.totalPages() - 1, p + 1)); }
}
