import { Component, Input, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ApiService } from '../../core/api/api.service';
import { AuthService } from '../../core/auth/auth.service';
import { UserModesService } from '../../core/user/user-modes.service';
import { ToastService } from '../../core/notifications/toast.service';
import { humanizeError } from '../../core/notifications/domain-errors';

const TOURNAMENT_ID = 'mundial-2026';
const POST_MATCH_REVEAL_DELAY_MS = 10 * 60_000;   // 10 min después de FINAL → revealed

type Opt = 'A' | 'B' | 'C' | 'D';

interface TriviaQuestion {
  id: string;
  prompt: string;
  optionA: string; optionB: string; optionC: string; optionD: string;
  correctOption: Opt;
  publishedAt: string;
  timerSeconds: number;
  explanation: string | null;
}

interface UserAnswer {
  id: string;
  questionId: string;
  selectedOption: Opt;
  isCorrect: boolean | null;
  pointsEarned: number | null;
  answeredAt: string;
}

interface MatchInfo {
  id: string;
  status: 'SCHEDULED' | 'LIVE' | 'FINAL';
  homeTeamId: string; awayTeamId: string;
  kickoffAt: string;
  // No tenemos finalAt en el schema, así que el "10 min after FINAL" lo
  // derivamos desde updatedAt como aproximación. Mientras el match no
  // sea FINAL no entramos en reveal mode.
  updatedAt?: string | null;
}

@Component({
  standalone: true,
  selector: 'app-trivia',
  imports: [RouterLink],
  template: `
    <header class="page-header">
      <div class="page-header__title">
        <small>
          @if (match()) {
            <a [routerLink]="['/torneo/mundial-2026/partido', matchId]" class="link-green">
              ← Detalle del partido
            </a>
          } @else {
            Trivia
          }
        </small>
        <h1>Trivia del partido</h1>
      </div>
      @if (match()) {
        <p style="margin-top: var(--space-sm); color: var(--color-text-muted); font-size: var(--fs-sm);">
          {{ teamName(match()!.homeTeamId) }} vs {{ teamName(match()!.awayTeamId) }}
          @if (matchPhase() === 'pre-live') {
            · <strong>aún no empieza</strong>
          } @else if (matchPhase() === 'live') {
            · <strong style="color: var(--color-primary-green);">EN VIVO</strong>
          } @else if (matchPhase() === 'final-locked') {
            · partido terminado, contestaciones lockeadas
          } @else if (matchPhase() === 'reveal') {
            · curiosidad post-partido
          }
        </p>
      }
    </header>

    @if (loading()) {
      <p style="padding: var(--space-2xl); text-align: center;">Cargando…</p>
    } @else if (questions().length === 0) {
      <p class="empty-state">Este partido no tiene trivia cargada.</p>
    } @else {
      <main class="container-app" style="max-width: 720px; padding-top: var(--space-md);">

        @if (matchPhase() === 'pre-live') {
          <div class="info-box">
            <strong>La trivia abre cuando empiece el partido.</strong>
            <p>
              {{ questions().length }} preguntas pre-cargadas. Cuando el primer partido arranque,
              cada una aparece automáticamente en su momento programado. Tienes
              <strong>2 minutos</strong> para responder cada una con scoring (1 pt si aciertas,
              solo modo completo).
            </p>
          </div>
        }

        @if (matchPhase() === 'live' && !hasComplete()) {
          <div class="info-box" style="border-left-color: #d99b00;">
            <strong>Modo simple — sin scoring</strong>
            <p>
              Las respuestas en vivo solo se scorean para usuarios con grupo modo completo.
              Cuando termine el partido (10 min después del silbatazo final) podrás ver las
              preguntas y respuestas como curiosidad, sin scoring.
            </p>
          </div>
        }

        <!-- LIVE: preguntas visibles ahora -->
        @if (matchPhase() === 'live' || matchPhase() === 'final-locked') {
          @for (q of liveQuestions(); track q.id) {
            @let userAns = answerMap().get(q.id);
            @let secsLeft = secondsLeftFor(q);
            @let locked = secsLeft <= 0;
            <article class="qcard" [class.qcard--locked]="locked">
              <header class="qcard__head">
                <span class="qcard__num">Pregunta {{ questionIndex(q) + 1 }}</span>
                @if (!locked) {
                  <span class="qcard__timer" [class.qcard__timer--low]="secsLeft <= 30">
                    ⏱ {{ formatTimer(secsLeft) }}
                  </span>
                } @else {
                  <span class="qcard__timer qcard__timer--locked">🔒 cerrada</span>
                }
              </header>
              <p class="qcard__prompt">{{ q.prompt }}</p>
              <ul class="qcard__opts">
                @for (opt of opts; track opt) {
                  <li>
                    <button type="button"
                            class="qcard__opt"
                            [class.qcard__opt--selected]="userAns?.selectedOption === opt"
                            [disabled]="locked || saving()[q.id] || (matchPhase() === 'live' && !hasComplete())"
                            (click)="pick(q, opt)">
                      <span class="qcard__opt-letter">{{ opt }}</span>
                      <span class="qcard__opt-text">{{ optionText(q, opt) }}</span>
                      @if (userAns?.selectedOption === opt) {
                        <span class="qcard__opt-check">✓</span>
                      }
                    </button>
                  </li>
                }
              </ul>
              @if (locked && userAns) {
                <p class="qcard__locked-msg">
                  Respuesta lockeada como <strong>{{ userAns.selectedOption }}</strong>.
                  Veremos si acertaste cuando se revele post-match.
                </p>
              }
            </article>
          }

          @if (liveQuestions().length === 0) {
            <p class="empty-state" style="margin-top: var(--space-md);">
              Por ahora no hay preguntas activas. Estate atento — las próximas salen automáticas.
            </p>
          }
        }

        <!-- POST-MATCH REVEAL -->
        @if (matchPhase() === 'reveal') {
          <p class="form-card__hint" style="margin-bottom: var(--space-md);">
            Partido cerrado. Aquí está el banco completo con la respuesta correcta + explicación.
            @if (userScore() !== null) {
              Acertaste <strong>{{ userScore() }}</strong> de {{ questions().length }}
              ({{ scoringMode() === 'COMPLETE' ? '+' + userScore() + ' pts en tu UserTotal' : 'sin scoring · solo curiosidad' }}).
            }
          </p>

          @for (q of sortedQuestions(); track q.id) {
            @let userAns = answerMap().get(q.id);
            <details class="qreveal">
              <summary class="qreveal__summary">
                <span>{{ q.prompt }}</span>
                @if (userAns) {
                  <span class="qreveal__badge"
                        [class.qreveal__badge--ok]="userAns.selectedOption === q.correctOption"
                        [class.qreveal__badge--bad]="userAns.selectedOption !== q.correctOption">
                    @if (userAns.selectedOption === q.correctOption) { ✓ Acertaste }
                    @else { ✕ Tu pick: {{ userAns.selectedOption }} }
                  </span>
                } @else {
                  <span class="qreveal__badge qreveal__badge--skip">Sin responder</span>
                }
              </summary>
              <ul class="qreveal__opts">
                @for (opt of opts; track opt) {
                  <li class="qreveal__opt"
                      [class.qreveal__opt--correct]="opt === q.correctOption"
                      [class.qreveal__opt--user-wrong]="userAns?.selectedOption === opt && opt !== q.correctOption">
                    <span class="qreveal__opt-letter">{{ opt }}</span>
                    <span>{{ optionText(q, opt) }}</span>
                    @if (opt === q.correctOption) { <strong style="color: var(--color-primary-green);">CORRECTA</strong> }
                    @else if (userAns?.selectedOption === opt) { <strong style="color: var(--color-lost);">tu pick</strong> }
                  </li>
                }
              </ul>
              @if (q.explanation) {
                <p class="qreveal__expl"><strong>Por qué:</strong> {{ q.explanation }}</p>
              }
            </details>
          }
        }
      </main>
    }
  `,
  styles: [`
    .info-box {
      background: var(--color-primary-white);
      border: var(--border-grey);
      border-left: 4px solid var(--color-primary-green);
      padding: var(--space-md) var(--space-lg);
      border-radius: var(--radius-sm);
      margin-bottom: var(--space-lg);
    }
    .info-box strong { display: block; margin-bottom: var(--space-xs); }
    .info-box p { color: var(--color-text-muted); font-size: var(--fs-sm); line-height: 1.5; }

    .qcard {
      background: var(--color-primary-white);
      border: var(--border-grey);
      border-radius: var(--radius-md);
      padding: var(--space-lg);
      margin-bottom: var(--space-md);
    }
    .qcard--locked { opacity: 0.85; }
    .qcard__head {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: var(--space-sm);
      flex-wrap: wrap;
      gap: var(--space-sm);
    }
    .qcard__num {
      font-size: var(--fs-xs);
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: var(--color-text-muted);
    }
    .qcard__timer {
      font-family: ui-monospace, SFMono-Regular, monospace;
      font-size: var(--fs-md);
      font-weight: 600;
      padding: 4px 10px;
      border-radius: 999px;
      background: rgba(0, 200, 100, 0.15);
      color: var(--color-primary-green);
    }
    .qcard__timer--low {
      background: rgba(220, 50, 50, 0.15);
      color: var(--color-lost, #c33);
      animation: pulse 1s infinite;
    }
    .qcard__timer--locked {
      background: rgba(0,0,0,0.08);
      color: var(--color-text-muted);
    }
    @keyframes pulse {
      0%,100% { opacity: 1; }
      50% { opacity: 0.5; }
    }
    .qcard__prompt {
      font-family: var(--font-display);
      font-size: var(--fs-xl);
      line-height: 1.1;
      text-transform: uppercase;
      margin-bottom: var(--space-md);
    }
    .qcard__opts {
      list-style: none;
      padding: 0;
      margin: 0;
      display: grid;
      gap: var(--space-sm);
    }
    .qcard__opt {
      display: grid;
      grid-template-columns: 28px 1fr auto;
      gap: var(--space-sm);
      align-items: center;
      padding: var(--space-sm) var(--space-md);
      width: 100%;
      background: var(--color-primary-grey, #f4f4f4);
      border: 2px solid transparent;
      border-radius: var(--radius-sm);
      cursor: pointer;
      font: inherit;
      text-align: left;
      transition: border-color 100ms, background 100ms;
    }
    .qcard__opt:hover:not(:disabled) {
      border-color: rgba(0,0,0,0.18);
    }
    .qcard__opt:disabled {
      cursor: not-allowed;
      opacity: 0.7;
    }
    .qcard__opt--selected {
      background: rgba(0, 200, 100, 0.14) !important;
      border-color: var(--color-primary-green) !important;
      font-weight: 600;
    }
    .qcard__opt-letter {
      font-family: var(--font-display);
      font-size: var(--fs-md);
      text-align: center;
    }
    .qcard__opt-check {
      color: var(--color-primary-green);
      font-weight: bold;
    }
    .qcard__locked-msg {
      margin-top: var(--space-md);
      font-size: var(--fs-sm);
      color: var(--color-text-muted);
      padding: var(--space-sm);
      background: rgba(0,0,0,0.04);
      border-radius: var(--radius-sm);
    }

    /* Reveal */
    .qreveal {
      background: var(--color-primary-white);
      border: var(--border-grey);
      border-radius: var(--radius-sm);
      margin-bottom: var(--space-sm);
      overflow: hidden;
    }
    .qreveal__summary {
      cursor: pointer;
      padding: var(--space-md);
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: var(--space-md);
      font-weight: 600;
      list-style: none;
    }
    .qreveal__summary::-webkit-details-marker { display: none; }
    .qreveal__badge {
      flex-shrink: 0;
      font-size: var(--fs-xs);
      text-transform: uppercase;
      letter-spacing: 0.06em;
      padding: 4px 10px;
      border-radius: 999px;
      font-weight: 600;
    }
    .qreveal__badge--ok {
      background: var(--color-primary-green);
      color: var(--color-primary-white);
    }
    .qreveal__badge--bad {
      background: var(--color-lost, #c33);
      color: var(--color-primary-white);
    }
    .qreveal__badge--skip {
      background: rgba(0,0,0,0.08);
      color: var(--color-text-muted);
    }
    .qreveal__opts {
      list-style: none;
      padding: 0 var(--space-md) var(--space-md);
      margin: 0;
      display: grid;
      gap: 6px;
    }
    .qreveal__opt {
      display: grid;
      grid-template-columns: 24px 1fr auto;
      gap: var(--space-sm);
      align-items: center;
      padding: 8px 10px;
      border-radius: var(--radius-sm);
      background: rgba(0,0,0,0.04);
      font-size: var(--fs-sm);
    }
    .qreveal__opt--correct {
      background: rgba(0, 200, 100, 0.16);
    }
    .qreveal__opt--user-wrong {
      background: rgba(220, 50, 50, 0.14);
    }
    .qreveal__opt-letter { font-family: var(--font-display); text-align: center; }
    .qreveal__expl {
      padding: var(--space-md);
      background: rgba(0,0,0,0.03);
      margin: 0 var(--space-md) var(--space-md);
      border-radius: var(--radius-sm);
      font-size: var(--fs-sm);
      color: var(--color-text-muted);
    }
  `],
})
export class TriviaComponent implements OnInit, OnDestroy {
  @Input() matchId!: string;

  private api = inject(ApiService);
  private auth = inject(AuthService);
  private userModes = inject(UserModesService);
  private toast = inject(ToastService);

  opts: Opt[] = ['A', 'B', 'C', 'D'];

  loading = signal(true);
  saving = signal<Record<string, boolean>>({});

  match = signal<MatchInfo | null>(null);
  teams = signal<Map<string, string>>(new Map());
  questions = signal<TriviaQuestion[]>([]);
  answers = signal<UserAnswer[]>([]);

  // tick reactive — updates every second
  now = signal(Date.now());
  private tickId: ReturnType<typeof setInterval> | null = null;

  hasComplete = computed(() => this.userModes.hasComplete());
  hasSimple = computed(() => this.userModes.hasSimple());

  scoringMode = computed<'COMPLETE' | 'SIMPLE' | null>(() => {
    if (this.hasComplete()) return 'COMPLETE';
    if (this.hasSimple()) return 'SIMPLE';
    return null;
  });

  answerMap = computed(() => {
    const m = new Map<string, UserAnswer>();
    for (const a of this.answers()) m.set(a.questionId, a);
    return m;
  });

  sortedQuestions = computed(() =>
    [...this.questions()].sort((a, b) => a.publishedAt.localeCompare(b.publishedAt)),
  );

  // Preguntas que están publicadas (publishedAt <= now). Incluye lockeadas.
  liveQuestions = computed(() => {
    const now = this.now();
    return this.sortedQuestions().filter((q) => Date.parse(q.publishedAt) <= now);
  });

  matchPhase = computed<'pre-live' | 'live' | 'final-locked' | 'reveal'>(() => {
    const m = this.match();
    if (!m) return 'pre-live';
    const now = this.now();
    const kickoff = Date.parse(m.kickoffAt);
    if (m.status !== 'FINAL') {
      return now >= kickoff ? 'live' : 'pre-live';
    }
    // FINAL: si los 10 min ya pasaron desde updatedAt → reveal, si no → final-locked.
    const finalTs = m.updatedAt ? Date.parse(m.updatedAt) : kickoff + 2 * 3600_000;
    return now >= finalTs + POST_MATCH_REVEAL_DELAY_MS ? 'reveal' : 'final-locked';
  });

  userScore = computed(() => {
    if (this.matchPhase() !== 'reveal') return null;
    let correct = 0;
    for (const a of this.answers()) {
      const q = this.questions().find((x) => x.id === a.questionId);
      if (q && a.selectedOption === q.correctOption) correct++;
    }
    return correct;
  });

  questionIndex(q: TriviaQuestion): number {
    return this.sortedQuestions().findIndex((x) => x.id === q.id);
  }

  secondsLeftFor(q: TriviaQuestion): number {
    const closeMs = Date.parse(q.publishedAt) + q.timerSeconds * 1000;
    return Math.max(0, Math.ceil((closeMs - this.now()) / 1000));
  }

  formatTimer(secs: number): string {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }

  teamName(slug: string): string { return this.teams().get(slug) ?? slug; }
  optionText(q: TriviaQuestion, opt: Opt): string {
    return opt === 'A' ? q.optionA : opt === 'B' ? q.optionB : opt === 'C' ? q.optionC : q.optionD;
  }

  async ngOnInit() {
    this.tickId = setInterval(() => this.now.set(Date.now()), 1000);
    await this.load();
  }

  ngOnDestroy() {
    if (this.tickId) clearInterval(this.tickId);
  }

  async load() {
    this.loading.set(true);
    try {
      const userId = this.auth.user()?.sub ?? '';
      const [mRes, tRes, qRes, aRes] = await Promise.all([
        this.api.getMatch(this.matchId),
        this.api.listTeams(TOURNAMENT_ID),
        this.api.listTriviaByMatch(this.matchId),
        userId ? this.api.myTriviaAnswers(userId, this.matchId) : Promise.resolve({ data: [] }),
      ]);

      if (mRes.data) {
        this.match.set({
          id: mRes.data.id,
          status: (mRes.data.status ?? 'SCHEDULED') as MatchInfo['status'],
          homeTeamId: mRes.data.homeTeamId,
          awayTeamId: mRes.data.awayTeamId,
          kickoffAt: mRes.data.kickoffAt,
          updatedAt: (mRes.data as { updatedAt?: string | null }).updatedAt ?? null,
        });
      }

      const tm = new Map<string, string>();
      for (const t of tRes.data ?? []) tm.set(t.slug, t.name);
      this.teams.set(tm);

      this.questions.set(
        (qRes.data ?? []).map((q): TriviaQuestion => ({
          id: q.id,
          prompt: q.prompt,
          optionA: q.optionA, optionB: q.optionB, optionC: q.optionC, optionD: q.optionD,
          correctOption: (q.correctOption ?? 'A') as Opt,
          publishedAt: q.publishedAt,
          timerSeconds: q.timerSeconds ?? 120,
          explanation: q.explanation ?? null,
        })),
      );

      this.answers.set(
        ((aRes.data ?? []) as Array<{ id: string; questionId: string; selectedOption: string; isCorrect?: boolean | null; pointsEarned?: number | null; answeredAt: string }>).map((a): UserAnswer => ({
          id: a.id,
          questionId: a.questionId,
          selectedOption: a.selectedOption as Opt,
          isCorrect: a.isCorrect ?? null,
          pointsEarned: a.pointsEarned ?? null,
          answeredAt: a.answeredAt,
        })),
      );
    } finally {
      this.loading.set(false);
    }
  }

  async pick(q: TriviaQuestion, opt: Opt) {
    if (this.secondsLeftFor(q) <= 0) return;          // timer cerrado
    if (this.matchPhase() === 'live' && !this.hasComplete()) {
      this.toast.error('Solo modo completo puede responder en vivo. Espera al post-match para verla.');
      return;
    }
    const userId = this.auth.user()?.sub;
    if (!userId) {
      this.toast.error('Necesitas estar logueado');
      return;
    }
    const existing = this.answerMap().get(q.id);
    this.saving.update((s) => ({ ...s, [q.id]: true }));
    try {
      const res = await this.api.upsertTriviaAnswer({
        id: existing?.id,
        userId,
        questionId: q.id,
        matchId: this.matchId,
        selectedOption: opt,
      });
      if (res?.errors && res.errors.length > 0) {
        // eslint-disable-next-line no-console
        console.error('[upsertTriviaAnswer] errors:', res.errors);
        this.toast.error(res.errors[0]!.message ?? 'No se pudo guardar la respuesta');
        return;
      }
      // Actualización optimista
      const newAns: UserAnswer = {
        id: res?.data?.id ?? existing?.id ?? '',
        questionId: q.id,
        selectedOption: opt,
        isCorrect: null, pointsEarned: null,
        answeredAt: new Date().toISOString(),
      };
      this.answers.update((prev) => {
        const i = prev.findIndex((a) => a.questionId === q.id);
        if (i >= 0) {
          const next = [...prev];
          next[i] = { ...next[i]!, ...newAns, id: next[i]!.id };
          return next;
        }
        return [...prev, newAns];
      });
    } catch (e) {
      this.toast.error(humanizeError(e));
    } finally {
      this.saving.update((s) => ({ ...s, [q.id]: false }));
    }
  }
}
