import { Component, Input, OnInit, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ApiService } from '../../core/api/api.service';

const TOURNAMENT_ID = 'mundial-2026';

type Opt = 'A' | 'B' | 'C' | 'D';

interface MatchInfo {
  id: string;
  homeTeamId: string; awayTeamId: string;
  kickoffAt: string; status: string;
  homeScore: number | null; awayScore: number | null;
  venue: string | null;
}

interface PickRow {
  id: string;
  userId: string;
  homeScorePred: number;
  awayScorePred: number;
}

interface TriviaQ {
  id: string;
  prompt: string;
  optionA: string; optionB: string; optionC: string; optionD: string;
  correctOption: Opt;
  publishedAt: string;
}

interface TriviaA {
  id: string;
  userId: string;
  questionId: string;
  selectedOption: Opt;
}

interface OptionStat {
  opt: Opt;
  text: string;
  count: number;
  pct: number;
  isCorrect: boolean;
}

interface QuestionStats {
  q: TriviaQ;
  totalAnswers: number;
  options: OptionStat[];
  correctCount: number;
  correctPct: number;
}

@Component({
  standalone: true,
  selector: 'app-admin-match-stats',
  imports: [RouterLink],
  template: `
    <header class="page-header" style="padding: 0 0 var(--space-md);">
      <small>
        <a routerLink="/admin/fixtures" style="color: var(--color-primary-green);">← Partidos</a>
      </small>
      <h1 style="font-family: var(--font-display); font-size: 56px; line-height: 1; text-transform: uppercase;">
        Estadísticas
      </h1>
      @if (match()) {
        <p style="margin-top: var(--space-sm); color: var(--color-text-muted);">
          {{ teamName(match()!.homeTeamId) }}
          @if (match()!.homeScore !== null && match()!.awayScore !== null) {
            <strong> {{ match()!.homeScore }} — {{ match()!.awayScore }} </strong>
          } @else {
            vs
          }
          {{ teamName(match()!.awayTeamId) }}
          · {{ formatDate(match()!.kickoffAt) }}
          @if (match()!.venue) { · {{ match()!.venue }} }
          · <strong>{{ statusLabel(match()!.status) }}</strong>
        </p>
        <div style="display: flex; gap: var(--space-md); margin-top: var(--space-md); flex-wrap: wrap;">
          <a class="btn btn--ghost btn--sm" [routerLink]="['/admin/fixtures', matchId, 'edit']">Editar partido</a>
          <a class="btn btn--ghost btn--sm" [routerLink]="['/admin/fixtures', matchId, 'trivia']">Editar trivia</a>
        </div>
      }
    </header>

    @if (loading()) {
      <p>Cargando estadísticas…</p>
    } @else {
      <!-- ========== PICKS DE MARCADOR ========== -->
      <section style="margin-bottom: var(--space-2xl);">
        <h2 style="font-family: var(--font-display); font-size: var(--fs-xl); text-transform: uppercase; line-height: 1; margin-bottom: var(--space-md);">
          Picks de marcador
        </h2>
        @if (totalPicks() === 0) {
          <p class="empty-state">Nadie hizo pick para este partido.</p>
        } @else {
          <div class="kpi-row">
            <article class="kpi-card">
              <small>Total picks</small>
              <div class="kpi-card__value">{{ totalPicks() }}</div>
            </article>
            <article class="kpi-card">
              <small>Marcador más popular</small>
              <div class="kpi-card__value">{{ popularScoreline() ?? '—' }}</div>
              @if (popularScoreCount() > 0) {
                <small>{{ popularScoreCount() }} picks ({{ popularScorePct() }}%)</small>
              }
            </article>
          </div>

          <h3 style="font-family: var(--font-display); font-size: var(--fs-lg); text-transform: uppercase; margin: var(--space-lg) 0 var(--space-sm);">
            Distribución 1·X·2
          </h3>
          <div style="display: grid; gap: var(--space-sm);">
            @for (b of buckets(); track b.label) {
              <div>
                <div style="display: flex; justify-content: space-between; margin-bottom: 4px;">
                  <span>{{ b.label }}</span>
                  <strong>{{ b.count }} ({{ b.pct }}%)</strong>
                </div>
                <div class="bar"><div class="bar__fill" [style.width]="b.pct + '%'"></div></div>
              </div>
            }
          </div>
        }
      </section>

      <!-- ========== TRIVIA OVERVIEW ========== -->
      <section style="margin-bottom: var(--space-2xl);">
        <h2 style="font-family: var(--font-display); font-size: var(--fs-xl); text-transform: uppercase; line-height: 1; margin-bottom: var(--space-md);">
          Trivia
        </h2>
        @if (questions().length === 0) {
          <p class="empty-state">No hay preguntas cargadas para este partido.</p>
        } @else {
          <div class="kpi-row">
            <article class="kpi-card">
              <small>Preguntas en el banco</small>
              <div class="kpi-card__value">{{ questions().length }}</div>
            </article>
            <article class="kpi-card">
              <small>Users que respondieron al menos 1</small>
              <div class="kpi-card__value">{{ uniqueAnswerers() }}</div>
            </article>
            <article class="kpi-card">
              <small>Total respuestas</small>
              <div class="kpi-card__value">{{ triviaAnswers().length }}</div>
            </article>
          </div>

          <h3 style="font-family: var(--font-display); font-size: var(--fs-lg); text-transform: uppercase; margin: var(--space-lg) 0 var(--space-sm);">
            ¿Cuántas preguntas respondieron?
          </h3>
          <table class="standings standings--group">
            <thead>
              <tr>
                <th>Respondieron</th>
                <th>Users</th>
                <th>%</th>
              </tr>
            </thead>
            <tbody>
              @for (h of answerHistogram(); track h.count) {
                <tr>
                  <td><strong>{{ h.count }}</strong> de {{ questions().length }}</td>
                  <td>{{ h.users }}</td>
                  <td>{{ h.pct }}%</td>
                </tr>
              }
            </tbody>
          </table>
          <p style="margin-top: var(--space-xs); font-size: var(--fs-xs); color: var(--color-text-muted);">
            Base: {{ uniqueAnswerers() }} users con al menos una respuesta.
          </p>

          <!-- ========== POR PREGUNTA ========== -->
          <h3 style="font-family: var(--font-display); font-size: var(--fs-lg); text-transform: uppercase; margin: var(--space-2xl) 0 var(--space-md);">
            Por pregunta
          </h3>
          @for (qs of questionStats(); track qs.q.id) {
            <article class="form-card" style="max-width: 100%; margin-bottom: var(--space-md);">
              <header style="margin-bottom: var(--space-md);">
                <strong style="font-family: var(--font-display); font-size: var(--fs-md); text-transform: uppercase; line-height: 1.1;">
                  {{ qs.q.prompt }}
                </strong>
                <small style="display: block; color: var(--color-text-muted); margin-top: 4px;">
                  Sale {{ formatDate(qs.q.publishedAt) }} ·
                  {{ qs.totalAnswers }} respuestas ·
                  {{ qs.correctCount }} acertaron ({{ qs.correctPct }}%)
                </small>
              </header>
              <div style="display: grid; gap: var(--space-sm);">
                @for (op of qs.options; track op.opt) {
                  <div>
                    <div style="display: flex; justify-content: space-between; margin-bottom: 4px;">
                      <span>
                        <strong>{{ op.opt }}.</strong> {{ op.text }}
                        @if (op.isCorrect) {
                          <span style="color: var(--color-primary-green); font-weight: 600;"> · CORRECTA</span>
                        }
                      </span>
                      <strong>{{ op.count }} ({{ op.pct }}%)</strong>
                    </div>
                    <div class="bar">
                      <div class="bar__fill"
                           [class.bar__fill--correct]="op.isCorrect"
                           [style.width]="op.pct + '%'"></div>
                    </div>
                  </div>
                }
              </div>
            </article>
          }
        }
      </section>
    }
  `,
  styles: [`
    .kpi-row {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
      gap: var(--space-md);
    }
    .kpi-card {
      background: var(--color-primary-white);
      border: var(--border-grey);
      border-radius: var(--radius-md);
      padding: var(--space-md);
    }
    .kpi-card small {
      display: block;
      font-size: var(--fs-xs);
      color: var(--color-text-muted);
      text-transform: uppercase;
      letter-spacing: 0.06em;
      margin-bottom: 4px;
    }
    .kpi-card__value {
      font-family: var(--font-display);
      font-size: var(--fs-3xl);
      line-height: 1;
    }
    .bar {
      height: 18px;
      background: var(--color-primary-grey, #f4f4f4);
      border-radius: 4px;
      overflow: hidden;
    }
    .bar__fill {
      height: 100%;
      background: var(--color-primary-green);
      transition: width 200ms;
    }
    .bar__fill--correct { background: var(--color-primary-green); }
    .bar:has(.bar__fill:not(.bar__fill--correct)) .bar__fill {
      background: rgba(0, 0, 0, 0.4);
    }
  `],
})
export class AdminMatchStatsComponent implements OnInit {
  @Input() matchId!: string;

  private api = inject(ApiService);

  loading = signal(true);
  match = signal<MatchInfo | null>(null);
  teams = signal<Map<string, string>>(new Map());
  picks = signal<PickRow[]>([]);
  questions = signal<TriviaQ[]>([]);
  triviaAnswers = signal<TriviaA[]>([]);

  totalPicks = computed(() => this.picks().length);

  // 1·X·2 buckets
  buckets = computed(() => {
    const total = this.picks().length;
    let home = 0, draw = 0, away = 0;
    for (const p of this.picks()) {
      if (p.homeScorePred > p.awayScorePred) home++;
      else if (p.homeScorePred < p.awayScorePred) away++;
      else draw++;
    }
    if (total === 0) return [];
    const m = this.match();
    const homeName = m ? this.teamName(m.homeTeamId) : 'Local';
    const awayName = m ? this.teamName(m.awayTeamId) : 'Visitante';
    return [
      { label: `${homeName} gana`, count: home, pct: Math.round((home / total) * 100) },
      { label: 'Empate', count: draw, pct: Math.round((draw / total) * 100) },
      { label: `${awayName} gana`, count: away, pct: Math.round((away / total) * 100) },
    ];
  });

  popularScoreCount = signal(0);
  popularScoreline = computed(() => {
    const counts = new Map<string, number>();
    for (const p of this.picks()) {
      const k = `${p.homeScorePred}-${p.awayScorePred}`;
      counts.set(k, (counts.get(k) ?? 0) + 1);
    }
    if (counts.size === 0) return null;
    let best = ''; let bestN = 0;
    for (const [k, n] of counts) if (n > bestN) { best = k; bestN = n; }
    this.popularScoreCount.set(bestN);
    return best;
  });
  popularScorePct = computed(() => {
    const t = this.totalPicks();
    return t === 0 ? 0 : Math.round((this.popularScoreCount() / t) * 100);
  });

  uniqueAnswerers = computed(() => {
    const set = new Set<string>();
    for (const a of this.triviaAnswers()) set.add(a.userId);
    return set.size;
  });

  // Histograma: cuántos users respondieron N preguntas, con N de 1 a total.
  answerHistogram = computed(() => {
    const total = this.questions().length;
    if (total === 0) return [];
    const perUser = new Map<string, Set<string>>();
    for (const a of this.triviaAnswers()) {
      const set = perUser.get(a.userId) ?? new Set<string>();
      set.add(a.questionId);
      perUser.set(a.userId, set);
    }
    const buckets = new Map<number, number>();
    for (const set of perUser.values()) {
      const n = set.size;
      buckets.set(n, (buckets.get(n) ?? 0) + 1);
    }
    const totalUsers = perUser.size;
    const rows: Array<{ count: number; users: number; pct: number }> = [];
    for (let i = total; i >= 1; i--) {
      const users = buckets.get(i) ?? 0;
      rows.push({
        count: i,
        users,
        pct: totalUsers === 0 ? 0 : Math.round((users / totalUsers) * 100),
      });
    }
    return rows;
  });

  questionStats = computed<QuestionStats[]>(() => {
    return this.questions().map((q): QuestionStats => {
      const ans = this.triviaAnswers().filter((a) => a.questionId === q.id);
      const total = ans.length;
      const counts: Record<Opt, number> = { A: 0, B: 0, C: 0, D: 0 };
      for (const a of ans) counts[a.selectedOption]++;
      const opts: OptionStat[] = (['A', 'B', 'C', 'D'] as Opt[]).map((o) => ({
        opt: o,
        text: this.optText(q, o),
        count: counts[o],
        pct: total === 0 ? 0 : Math.round((counts[o] / total) * 100),
        isCorrect: q.correctOption === o,
      }));
      const correctCount = counts[q.correctOption];
      return {
        q, totalAnswers: total, options: opts,
        correctCount,
        correctPct: total === 0 ? 0 : Math.round((correctCount / total) * 100),
      };
    });
  });

  async ngOnInit() { await this.load(); }

  async load() {
    this.loading.set(true);
    try {
      const [mRes, tRes, pRes, qRes, aRes] = await Promise.all([
        this.api.getMatch(this.matchId),
        this.api.listTeams(TOURNAMENT_ID),
        this.api.listPicksByMatch(this.matchId),
        this.api.listTriviaByMatch(this.matchId),
        this.api.listTriviaAnswersByMatch(this.matchId),
      ]);

      if (mRes.data) {
        this.match.set({
          id: mRes.data.id,
          homeTeamId: mRes.data.homeTeamId,
          awayTeamId: mRes.data.awayTeamId,
          kickoffAt: mRes.data.kickoffAt,
          status: mRes.data.status ?? 'SCHEDULED',
          homeScore: mRes.data.homeScore ?? null,
          awayScore: mRes.data.awayScore ?? null,
          venue: (mRes.data as { venue?: string | null }).venue ?? null,
        });
      }

      const tm = new Map<string, string>();
      for (const t of tRes.data ?? []) tm.set(t.slug, t.name);
      this.teams.set(tm);

      this.picks.set(
        ((pRes.data ?? []) as Array<{ id: string; userId: string; homeScorePred: number; awayScorePred: number }>).map((p) => ({
          id: p.id, userId: p.userId,
          homeScorePred: p.homeScorePred, awayScorePred: p.awayScorePred,
        })),
      );

      this.questions.set(
        (qRes.data ?? []).map((q): TriviaQ => ({
          id: q.id,
          prompt: q.prompt,
          optionA: q.optionA, optionB: q.optionB, optionC: q.optionC, optionD: q.optionD,
          correctOption: (q.correctOption ?? 'A') as Opt,
          publishedAt: q.publishedAt,
        })).sort((a, b) => a.publishedAt.localeCompare(b.publishedAt)),
      );

      this.triviaAnswers.set(
        ((aRes.data ?? []) as Array<{ id: string; userId: string; questionId: string; selectedOption: string }>).map((a) => ({
          id: a.id, userId: a.userId, questionId: a.questionId,
          selectedOption: a.selectedOption as Opt,
        })),
      );
    } finally {
      this.loading.set(false);
    }
  }

  teamName(slug: string): string { return this.teams().get(slug) ?? slug; }
  optText(q: TriviaQ, o: Opt): string {
    return o === 'A' ? q.optionA : o === 'B' ? q.optionB : o === 'C' ? q.optionC : q.optionD;
  }
  formatDate(iso: string): string {
    try {
      return new Date(iso).toLocaleString('es-EC', {
        timeZone: 'America/Guayaquil',
        day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
      });
    } catch { return iso; }
  }
  statusLabel(s: string): string {
    if (s === 'SCHEDULED') return 'Programado';
    if (s === 'LIVE') return 'En vivo';
    if (s === 'FINAL') return 'Finalizado';
    return s;
  }
}
