import { Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { ApiService } from '../../core/api/api.service';
import { AuthService } from '../../core/auth/auth.service';
import { UserModesService } from '../../core/user/user-modes.service';

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
  /** Si la trivia está patrocinada, sponsor info parseada del prefijo
   *  [BRAND:<name>:<icon>] del campo `explanation`. null = sin marca. */
  sponsor: SponsorMeta | null;
  /** El resto del explanation (sin el prefijo de marca). */
  cleanExplanation: string;
}

/**
 * UX nueva (wireframe Mundial 2026): FAB pill flotante + modal.
 * - El FAB aparece cuando hay al menos una pregunta activa no contestada.
 * - Click en el FAB abre el modal. Modal tiene variantes:
 *     · `trivia-modal--marca`: cuando la pregunta está patrocinada
 *       (sponsor parseado del prefijo [BRAND:<name>:<icon>] en explanation).
 *     · `trivia-modal--sinad`: cuando no hay sponsor (header oscuro limpio).
 *
 * Convención temporal hasta que el modelo TriviaQuestion tenga `sponsorId`:
 * El admin guarda el `explanation` con prefijo `[BRAND:Coca-Cola:🥤] Texto…`
 * y el front lo parsea para decidir qué variante de modal mostrar.
 */
@Component({
  standalone: true,
  selector: 'app-trivia-popup',
  template: `
    @if (current(); as q) {
      <!-- FAB pill (visible permanentemente mientras haya pregunta activa) -->
      <button type="button" class="trivia-fab"
              aria-label="Jugar trivia"
              (click)="openModal()">
        <span class="trivia-fab__icon">⚡</span>
        <span>Trivia · +10 pts</span>
        @if (queueRemaining() > 1) {
          <span class="trivia-fab__time">{{ queueRemaining() }}</span>
        }
      </button>

      <!-- Modal (con variante marca/sinad) -->
      <div class="trivia-modal"
           [class.is-open]="modalOpen()"
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
              <button type="button" class="trivia-head__close"
                      aria-label="Cerrar" (click)="closeModal()">✕</button>
            </div>
          </div>

          <div class="trivia-body">
            <div class="trivia-step">PREGUNTA {{ currentIndex() + 1 }} DE {{ queue().length }}</div>

            <h2 class="trivia-question">{{ q.prompt }}</h2>

            <div class="trivia-options">
              @for (opt of OPTS; track opt.key) {
                <button type="button" class="trivia-option"
                        [class.is-selected]="picked() === opt.key"
                        [disabled]="submitting()"
                        (click)="select(opt.key)">
                  <span class="trivia-option__letter">{{ opt.key }}</span>
                  <span class="trivia-option__text">{{ q[opt.field] }}</span>
                  <span class="trivia-option__check">✓</span>
                </button>
              }
            </div>

            @if (msg()) {
              <p class="trivia-msg">{{ msg() }}</p>
            }

            <div class="trivia-actions">
              <button type="button" class="trivia-skip" (click)="skip()">↶ Saltar</button>
              <button type="button" class="trivia-next"
                      [disabled]="picked() === null || submitting()"
                      (click)="confirm()">
                {{ submitting() ? 'Enviando…' : 'Confirmar →' }}
              </button>
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

  OPTS = [
    { key: 'A' as Opt, field: 'optionA' as const },
    { key: 'B' as Opt, field: 'optionB' as const },
    { key: 'C' as Opt, field: 'optionC' as const },
    { key: 'D' as Opt, field: 'optionD' as const },
  ];

  queue = signal<ActiveQuestion[]>([]);
  private dismissed = signal<Set<string>>(new Set());

  /** Cola sin las dismisseadas. */
  private visibleQueue = computed(() => {
    const dismissed = this.dismissed();
    return this.queue().filter((q) => !dismissed.has(q.id));
  });

  current = computed<ActiveQuestion | null>(() => this.visibleQueue()[0] ?? null);
  currentIndex = computed(() => {
    const cur = this.current();
    if (!cur) return 0;
    return this.queue().findIndex((q) => q.id === cur.id);
  });
  queueRemaining = computed(() => this.visibleQueue().length);

  modalOpen = signal(false);
  picked = signal<Opt | null>(null);
  submitting = signal(false);
  msg = signal<string | null>(null);

  private pollTimer: ReturnType<typeof setInterval> | undefined;

  async ngOnInit() {
    if (!this.userModes.hasComplete()) return;
    await this.refresh();
    this.pollTimer = setInterval(() => void this.refresh(), POLL_MS);
  }

  ngOnDestroy() {
    if (this.pollTimer) clearInterval(this.pollTimer);
  }

  openModal() {
    this.modalOpen.set(true);
    this.picked.set(null);
    this.msg.set(null);
  }
  closeModal() {
    this.modalOpen.set(false);
  }

  select(opt: Opt) {
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
    this.picked.set(null);
    this.msg.set(null);
    if (this.queueRemaining() === 0) {
      this.closeModal();
    }
  }

  async confirm() {
    const cur = this.current();
    const opt = this.picked();
    if (!cur || !opt || this.submitting()) return;
    const userId = this.auth.user()?.sub;
    if (!userId) return;

    this.submitting.set(true);
    this.msg.set(null);
    try {
      await this.api.upsertTriviaAnswer({
        userId, questionId: cur.id, matchId: cur.matchId, selectedOption: opt,
      });
      this.msg.set('✓ Respuesta enviada');
      setTimeout(() => {
        this.queue.update((arr) => arr.filter((x) => x.id !== cur.id));
        this.picked.set(null);
        this.msg.set(null);
        if (this.queueRemaining() === 0) this.closeModal();
      }, 1200);
    } catch (err) {
      this.msg.set('No se pudo guardar. Intenta de nuevo.');
      // eslint-disable-next-line no-console
      console.warn('[trivia] answer failed', err);
    } finally {
      this.submitting.set(false);
    }
  }

  private async refresh() {
    const userId = this.auth.user()?.sub;
    if (!userId) return;
    if (!this.userModes.hasComplete()) {
      this.queue.set([]);
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
        this.queue.set([]);
        return;
      }

      const collected: ActiveQuestion[] = [];
      for (const m of liveMatches) {
        const [qRes, aRes] = await Promise.all([
          this.api.listTriviaByMatch(m.id),
          this.api.myTriviaAnswers(userId, m.id),
        ]);
        const answeredQids = new Set(
          ((aRes.data ?? []) as Array<{ questionId: string }>).map((a) => a.questionId),
        );
        for (const q of (qRes.data ?? []) as Array<{
          id: string; prompt: string;
          optionA: string; optionB: string; optionC: string; optionD: string;
          explanation: string | null;
        }>) {
          if (answeredQids.has(q.id)) continue;
          const parsed = parseSponsor(q.explanation);
          collected.push({
            id: q.id, matchId: m.id, prompt: q.prompt,
            optionA: q.optionA, optionB: q.optionB,
            optionC: q.optionC, optionD: q.optionD,
            homeTeam: teamMap.get(m.homeTeamId) ?? m.homeTeamId,
            awayTeam: teamMap.get(m.awayTeamId) ?? m.awayTeamId,
            sponsor: parsed.sponsor,
            cleanExplanation: parsed.cleanExplanation,
          });
        }
      }
      this.queue.set(collected);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn('[trivia] refresh failed', err);
    }
  }
}

/**
 * Parsea el prefijo [BRAND:<name>:<icon>] del campo explanation.
 * - Con prefijo: `[BRAND:Coca-Cola:🥤] Esta es la explicación.`
 *   → { sponsor: { name: "Coca-Cola", icon: "🥤" }, cleanExplanation: "Esta es la explicación." }
 * - Sin prefijo: `Texto explicación normal`
 *   → { sponsor: null, cleanExplanation: "Texto explicación normal" }
 *
 * Esta es una convención temporal mientras TriviaQuestion no tiene el
 * campo `sponsorId` en el schema. Cuando se agregue, este parser puede
 * sustituirse por una resolución real al modelo Sponsor.
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
