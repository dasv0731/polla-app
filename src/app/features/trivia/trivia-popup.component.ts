import { Component, OnDestroy, OnInit, computed, effect, inject, signal } from '@angular/core';
import { ApiService } from '../../core/api/api.service';
import { AuthService } from '../../core/auth/auth.service';
import { UserModesService } from '../../core/user/user-modes.service';
import { TriviaModalService } from '../../core/trivia/trivia-modal.service';

const TOURNAMENT_ID = 'mundial-2026';
const POLL_MS = 60_000;
const POST_FINAL_WINDOW_MS = 10 * 60_000;

type Opt = 'A' | 'B' | 'C' | 'D';

interface SponsorMeta {
  name: string;
  icon: string;
}

interface ActiveQuestion {
  id: string;
  matchId: string;
  prompt: string;
  optionA: string; optionB: string; optionC: string; optionD: string;
  homeTeam: string; awayTeam: string;
  /** Respuesta correcta — usada para el reveal post-save / post-timer. */
  correctOption: Opt;
  /** Segundos de timer (default 120) — el modal arranca contador y
   *  auto-revela cuando llega a 0 si el user no contestó aún. */
  timerSeconds: number;
  /** Cuándo se publicó la pregunta (publishedAt) — el timer cuenta
   *  desde acá, no desde que el user abrió el modal. */
  publishedAt: string;
  /** Si la trivia está patrocinada, sponsor info parseada del prefijo
   *  [BRAND:<name>:<icon>] del campo `explanation`. null = sin marca. */
  sponsor: SponsorMeta | null;
  /** El resto del explanation (sin el prefijo de marca) — se muestra
   *  en el reveal post-respuesta. */
  cleanExplanation: string;
}

/**
 * Modal global de trivia. Variantes visuales:
 *   · `trivia-modal--marca`: pregunta patrocinada (sponsor parseado de
 *     [BRAND:<name>:<icon>] al inicio del explanation).
 *   · `trivia-modal--sinad`: sin sponsor (header oscuro limpio).
 *
 * Estados internos por pregunta:
 *   1) Answering: user elige una opción (CSS neutro/azul, NO check verde).
 *   2) Revealed: tras click en "Responder" o expiración del timer, se
 *      muestra la opción correcta (verde) y la pick errónea del user (rojo)
 *      + bloque de explicación. Botón cambia a "Siguiente →" / "Cerrar".
 *
 * Apertura:
 *   - FAB pill (visible cuando hay preguntas live no respondidas) → `open()`.
 *   - Inline "Jugar" en picks-list → `openForMatch(matchId)`.
 */
@Component({
  standalone: true,
  selector: 'app-trivia-popup',
  template: `
    @if (showFab()) {
      <button type="button" class="trivia-fab"
              aria-label="Jugar trivia"
              (click)="modal.open()">
        <span class="trivia-fab__icon">⚡</span>
        <span>Trivia · +10 pts</span>
        @if (queueRemaining() > 1) {
          <span class="trivia-fab__time">{{ queueRemaining() }}</span>
        }
      </button>
    }

    @if (modal.isOpen() && current(); as q) {
      <div class="trivia-modal is-open"
           [class.trivia-modal--marca]="q.sponsor !== null"
           [class.trivia-modal--sinad]="q.sponsor === null"
           role="dialog" aria-modal="true">
        <button type="button" class="trivia-modal__close-overlay"
                aria-label="Cerrar" (click)="closeModal()"></button>
        <div class="trivia-modal__card">

          @if (q.sponsor; as s) {
            <div class="trivia-sponsor">
              <div class="trivia-sponsor__left">
                <div class="trivia-sponsor__logo">{{ s.icon }}</div>
                <div>
                  <div class="trivia-sponsor__kicker">PRESENTADA POR</div>
                  <div class="trivia-sponsor__name">{{ s.name }}</div>
                </div>
              </div>
              <span class="trivia-sponsor__ad">PUBLICIDAD</span>
            </div>
          }

          <div class="trivia-head">
            <div class="trivia-head__left">
              <span class="trivia-head__icon">⚡</span>
              <div>
                <div class="trivia-head__title">TRIVIA · {{ q.homeTeam }} vs {{ q.awayTeam }}</div>
                <div class="trivia-head__sub">+10 pts si aciertas</div>
              </div>
            </div>
            <div class="trivia-head__right">
              @if (!revealed() && secondsLeft() > 0) {
                <span class="trivia-timer"
                      [class.trivia-timer--low]="secondsLeft() <= 15">
                  ⏱ {{ formatTimer(secondsLeft()) }}
                </span>
              }
              <button type="button" class="trivia-head__close"
                      aria-label="Cerrar" (click)="closeModal()">✕</button>
            </div>
          </div>

          <div class="trivia-body">
            <div class="trivia-step">
              @if (visibleQueue().length > 1) {
                PREGUNTA {{ currentIndex() + 1 }} DE {{ visibleQueue().length }}
              } @else {
                PREGUNTA
              }
            </div>

            <h2 class="trivia-question">{{ q.prompt }}</h2>

            <div class="trivia-options">
              @for (opt of OPTS; track opt.key) {
                @let userPicked = picked() === opt.key;
                @let isCorrect = revealed() && opt.key === q.correctOption;
                @let isUserWrong = revealed() && userPicked && opt.key !== q.correctOption;
                <button type="button" class="trivia-option"
                        [class.is-selected]="userPicked && !revealed()"
                        [class.trivia-option--correct]="isCorrect"
                        [class.trivia-option--wrong]="isUserWrong"
                        [disabled]="submitting() || revealed()"
                        (click)="select(opt.key)">
                  <span class="trivia-option__letter">{{ opt.key }}</span>
                  <span class="trivia-option__text">{{ q[opt.field] }}</span>
                  @if (isCorrect) {
                    <span class="trivia-option__badge trivia-option__badge--correct">✓</span>
                  } @else if (isUserWrong) {
                    <span class="trivia-option__badge trivia-option__badge--wrong">✕</span>
                  }
                </button>
              }
            </div>

            @if (revealed()) {
              @if (picked() === q.correctOption) {
                <div class="trivia-reveal trivia-reveal--ok">
                  ✓ ¡Acertaste! +10 pts
                </div>
              } @else if (picked() && picked() !== q.correctOption) {
                <div class="trivia-reveal trivia-reveal--bad">
                  ✕ Respuesta correcta: <strong>{{ q.correctOption }}</strong>
                </div>
              } @else {
                <div class="trivia-reveal trivia-reveal--skip">
                  ⏱ Tiempo agotado · Respuesta correcta: <strong>{{ q.correctOption }}</strong>
                </div>
              }
              @if (q.cleanExplanation) {
                <p class="trivia-explanation"><strong>Por qué:</strong> {{ q.cleanExplanation }}</p>
              }
            } @else if (msg()) {
              <p class="trivia-msg">{{ msg() }}</p>
            }

            <div class="trivia-actions">
              @if (!revealed()) {
                <button type="button" class="trivia-skip" (click)="skip()">↶ Saltar</button>
                <button type="button" class="trivia-next"
                        [disabled]="picked() === null || submitting()"
                        (click)="answer()">
                  {{ submitting() ? 'Enviando…' : 'Responder' }}
                </button>
              } @else {
                @let isLast = currentIndex() >= visibleQueue().length - 1;
                <span></span>
                <button type="button" class="trivia-next" (click)="advance()">
                  {{ isLast ? 'Cerrar' : 'Siguiente →' }}
                </button>
              }
            </div>
          </div>

          @if (q.sponsor) {
            <div class="trivia-foot">
              <span class="trivia-foot__text">Trivia patrocinada · acierta y gana un comodín</span>
            </div>
          }

        </div>
      </div>
    }
  `,
  styles: [`
    .trivia-msg {
      margin-top: 12px;
      padding: 8px 10px;
      background: var(--wf-fill);
      border-radius: 6px;
      font-size: 12px;
      color: var(--wf-ink-2);
      text-align: center;
    }
  `],
})
export class TriviaPopupComponent implements OnInit, OnDestroy {
  private api = inject(ApiService);
  private auth = inject(AuthService);
  private userModes = inject(UserModesService);
  modal = inject(TriviaModalService);

  OPTS = [
    { key: 'A' as Opt, field: 'optionA' as const },
    { key: 'B' as Opt, field: 'optionB' as const },
    { key: 'C' as Opt, field: 'optionC' as const },
    { key: 'D' as Opt, field: 'optionD' as const },
  ];

  /** Cola completa cargada en background (live matches con triv no contestada). */
  private allQueue = signal<ActiveQuestion[]>([]);
  /** Cola scoped: cuando el modal se abrió `openForMatch(id)`, cargamos
   *  preguntas de ese match aunque no esté "live" — el user clickeó
   *  explícitamente "Jugar" en la fila inline y espera ver la pregunta. */
  private scopedQueue = signal<ActiveQuestion[]>([]);
  private dismissed = signal<Set<string>>(new Set());

  /** Cola visible: scoped si hay scope, sino allQueue.
   *  Filtra:
   *    · dismissed (saltadas/respondidas en esta sesión)
   *    · publishedAt > now (preguntas que aún no salieron). Re-evalúa
   *      vía nowMs (tick 1s) así una pregunta aparece en cuanto le
   *      llega el momento sin que el user tenga que refrescar. */
  visibleQueue = computed(() => {
    const dismissed = this.dismissed();
    const scope = this.modal.scopedMatchId();
    const source = scope ? this.scopedQueue() : this.allQueue();
    const now = this.nowMs();
    return source.filter((q) =>
      !dismissed.has(q.id) && Date.parse(q.publishedAt) <= now,
    );
  });

  /** Pregunta actual: la primera no dismisseada de visibleQueue. */
  current = computed<ActiveQuestion | null>(() => {
    const idx = this.activeIndex();
    return this.visibleQueue()[idx] ?? null;
  });

  /** Index de la pregunta visible actual. Se controla con advance(). */
  private activeIndex = signal(0);
  currentIndex = computed(() => this.activeIndex());

  queueRemaining = computed(() => this.visibleQueue().length);

  /** FAB: visible solo si hay al menos una pregunta YA PUBLICADA
   *  (publishedAt <= now) en la cola live, Y el modal está cerrado.
   *  No basta con que la pregunta exista en DB — debe estar liberada
   *  en el momento. */
  showFab = computed(() => {
    if (this.modal.isOpen()) return false;
    const now = this.nowMs();
    return this.allQueue().some((q) => Date.parse(q.publishedAt) <= now);
  });

  picked = signal<Opt | null>(null);
  submitting = signal(false);
  msg = signal<string | null>(null);
  revealed = signal(false);

  /** Tick reactivo cada 1s para el timer countdown. */
  private nowMs = signal(Date.now());
  private tickTimer: ReturnType<typeof setInterval> | undefined;

  /** Segundos restantes del timer de la pregunta actual. */
  secondsLeft = computed(() => {
    const q = this.current();
    if (!q) return 0;
    const closeMs = Date.parse(q.publishedAt) + q.timerSeconds * 1000;
    return Math.max(0, Math.ceil((closeMs - this.nowMs()) / 1000));
  });

  private pollTimer: ReturnType<typeof setInterval> | undefined;

  constructor() {
    // Effect: cuando service.refreshTick cambia (modal se abre o re-abre),
    // resetear estado de la pregunta y recargar scopedQueue si aplica.
    effect(() => {
      this.modal.refreshTick();   // dependency
      const scope = this.modal.scopedMatchId();
      if (this.modal.isOpen()) {
        this.activeIndex.set(0);
        this.resetQuestionState();
        if (scope) {
          void this.loadScopedQueue(scope);
        }
      }
    });

    // Effect: auto-reveal cuando el timer llega a 0 (sin haber respondido).
    effect(() => {
      if (this.modal.isOpen() && this.current() && this.secondsLeft() === 0 && !this.revealed()) {
        this.revealed.set(true);
      }
    });
  }

  async ngOnInit() {
    if (this.userModes.hasComplete()) {
      await this.refreshAll();
      this.pollTimer = setInterval(() => void this.refreshAll(), POLL_MS);
    }
    this.tickTimer = setInterval(() => this.nowMs.set(Date.now()), 1000);
  }

  ngOnDestroy() {
    if (this.pollTimer) clearInterval(this.pollTimer);
    if (this.tickTimer) clearInterval(this.tickTimer);
  }

  closeModal() {
    this.modal.close();
    this.resetQuestionState();
  }

  private resetQuestionState() {
    this.picked.set(null);
    this.msg.set(null);
    this.revealed.set(false);
  }

  select(opt: Opt) {
    if (this.revealed()) return;   // bloqueado tras reveal
    this.picked.set(opt);
  }

  skip() {
    const cur = this.current();
    if (!cur) return;
    this.dismissed.update((s) => {
      const n = new Set(s);
      n.add(cur.id);
      return n;
    });
    this.resetQuestionState();
    if (this.queueRemaining() === 0) this.closeModal();
  }

  /** "Responder" → save → reveal correct + explanation. */
  async answer() {
    const cur = this.current();
    const opt = this.picked();
    if (!cur || !opt || this.submitting() || this.revealed()) return;
    const userId = this.auth.user()?.sub;
    if (!userId) return;

    this.submitting.set(true);
    this.msg.set(null);
    try {
      await this.api.upsertTriviaAnswer({
        userId, questionId: cur.id, matchId: cur.matchId, selectedOption: opt,
      });
      this.revealed.set(true);
    } catch (err) {
      this.msg.set('No se pudo guardar. Intenta de nuevo.');
      // eslint-disable-next-line no-console
      console.warn('[trivia] answer failed', err);
    } finally {
      this.submitting.set(false);
    }
  }

  /** "Siguiente →" o "Cerrar" tras el reveal. */
  advance() {
    const cur = this.current();
    if (cur) {
      // Marca la actual como dismissed para que no vuelva a aparecer
      // — server ya tiene la respuesta y no debería reaparecer en el
      // próximo poll, pero la dismissed local protege contra timing.
      this.dismissed.update((s) => {
        const n = new Set(s);
        n.add(cur.id);
        return n;
      });
    }
    this.resetQuestionState();
    if (this.queueRemaining() === 0) {
      this.closeModal();
    }
    // Quedarse en index 0: visibleQueue ya filtra dismissed, así que la
    // siguiente pregunta es la nueva primera.
    this.activeIndex.set(0);
  }

  formatTimer(secs: number): string {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }

  /** Carga la cola "live" (todas las preguntas no contestadas de matches en vivo). */
  private async refreshAll() {
    const userId = this.auth.user()?.sub;
    if (!userId) return;
    if (!this.userModes.hasComplete()) {
      this.allQueue.set([]);
      return;
    }
    try {
      const [matchesRes, teamsRes] = await Promise.all([
        this.api.listMatches(TOURNAMENT_ID),
        this.api.listTeams(TOURNAMENT_ID),
      ]);
      const teamMap = new Map<string, string>();
      for (const t of teamsRes.data ?? []) teamMap.set(t.slug, t.name);

      const now = Date.now();
      const liveMatches = (matchesRes.data ?? []).filter((m) => {
        if (m.status === 'FINAL') {
          const upd = m.updatedAt ? Date.parse(m.updatedAt) : 0;
          return now < upd + POST_FINAL_WINDOW_MS;
        }
        const k = Date.parse(m.kickoffAt);
        return now >= k && now < k + 3 * 60 * 60_000;
      });

      if (liveMatches.length === 0) {
        this.allQueue.set([]);
        return;
      }

      const collected: ActiveQuestion[] = [];
      for (const m of liveMatches) {
        const list = await this.collectForMatch(m, userId, teamMap);
        collected.push(...list);
      }
      this.allQueue.set(collected);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn('[trivia] refreshAll failed', err);
    }
  }

  /** Carga preguntas de UN match específico — usado al abrir scoped. */
  private async loadScopedQueue(matchId: string) {
    const userId = this.auth.user()?.sub;
    if (!userId) return;
    try {
      const [mRes, teamsRes] = await Promise.all([
        this.api.getMatch(matchId),
        this.api.listTeams(TOURNAMENT_ID),
      ]);
      if (!mRes.data) {
        this.scopedQueue.set([]);
        return;
      }
      const teamMap = new Map<string, string>();
      for (const t of teamsRes.data ?? []) teamMap.set(t.slug, t.name);
      const list = await this.collectForMatch(mRes.data, userId, teamMap);
      this.scopedQueue.set(list);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn('[trivia] loadScopedQueue failed', err);
      this.scopedQueue.set([]);
    }
  }

  private async collectForMatch(
    m: { id: string; homeTeamId: string; awayTeamId: string },
    userId: string,
    teamMap: Map<string, string>,
  ): Promise<ActiveQuestion[]> {
    const [qRes, aRes] = await Promise.all([
      this.api.listTriviaByMatch(m.id),
      this.api.myTriviaAnswers(userId, m.id),
    ]);
    const answeredQids = new Set(
      ((aRes.data ?? []) as Array<{ questionId: string }>).map((a) => a.questionId),
    );
    const out: ActiveQuestion[] = [];
    for (const q of (qRes.data ?? []) as Array<{
      id: string; prompt: string;
      optionA: string; optionB: string; optionC: string; optionD: string;
      correctOption?: string | null;
      publishedAt: string;
      timerSeconds?: number | null;
      explanation: string | null;
    }>) {
      if (answeredQids.has(q.id)) continue;
      const parsed = parseSponsor(q.explanation);
      out.push({
        id: q.id, matchId: m.id, prompt: q.prompt,
        optionA: q.optionA, optionB: q.optionB,
        optionC: q.optionC, optionD: q.optionD,
        correctOption: ((q.correctOption ?? 'A') as Opt),
        timerSeconds: q.timerSeconds ?? 120,
        publishedAt: q.publishedAt,
        homeTeam: teamMap.get(m.homeTeamId) ?? m.homeTeamId,
        awayTeam: teamMap.get(m.awayTeamId) ?? m.awayTeamId,
        sponsor: parsed.sponsor,
        cleanExplanation: parsed.cleanExplanation,
      });
    }
    return out;
  }
}

/**
 * Parsea el prefijo [BRAND:<name>:<icon>] del campo explanation.
 * - Con prefijo: `[BRAND:Coca-Cola:🥤] Esta es la explicación.`
 *   → { sponsor: { name: "Coca-Cola", icon: "🥤" }, cleanExplanation: "Esta es la explicación." }
 * - Sin prefijo: `Texto explicación normal`
 *   → { sponsor: null, cleanExplanation: "Texto explicación normal" }
 */
function parseSponsor(explanation: string | null | undefined): {
  sponsor: SponsorMeta | null;
  cleanExplanation: string;
} {
  if (!explanation) return { sponsor: null, cleanExplanation: '' };
  const m = explanation.match(/^\s*\[BRAND:([^:\]]+):([^\]]+)\]\s*(.*)$/s);
  if (!m) return { sponsor: null, cleanExplanation: explanation };
  return {
    sponsor: { name: m[1].trim(), icon: m[2].trim() },
    cleanExplanation: m[3].trim(),
  };
}
