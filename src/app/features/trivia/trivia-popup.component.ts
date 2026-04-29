import { Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { ApiService } from '../../core/api/api.service';
import { AuthService } from '../../core/auth/auth.service';
import { UserModesService } from '../../core/user/user-modes.service';

const TOURNAMENT_ID = 'mundial-2026';
const POLL_MS = 60_000;
const POST_FINAL_WINDOW_MS = 10 * 60_000;

type Opt = 'A' | 'B' | 'C' | 'D';

interface ActiveQuestion {
  id: string;
  matchId: string;
  prompt: string;
  optionA: string; optionB: string; optionC: string; optionD: string;
  homeTeam: string; awayTeam: string;
}

/**
 * Popup de trivia global persistente. Se monta en el ShellComponent
 * (visible en toda la app autenticada). Cada 60s busca preguntas
 * activas (matches LIVE o FINAL hace <10 min) que el user no haya
 * contestado y muestra una a la vez.
 *
 * Requisito spec: solo modo COMPLETE (las trivias scorean en COMPLETE).
 * SIMPLE-only users no ven el popup.
 *
 * Dismiss: ✕ oculta para esta sesión (en memoria; al reload reaparece
 * si todavía hay activa).
 */
@Component({
  standalone: true,
  selector: 'app-trivia-popup',
  template: `
    @if (current(); as q) {
      <div class="trivia-popup" role="dialog" aria-live="polite">
        <header class="trivia-popup__head">
          <span class="trivia-popup__kicker">
            ⚡ Trivia · {{ q.homeTeam }} vs {{ q.awayTeam }}
          </span>
          <button type="button" class="trivia-popup__x"
                  (click)="dismiss()" title="Ocultar">×</button>
        </header>
        <p class="trivia-popup__prompt">{{ q.prompt }}</p>
        <div class="trivia-popup__opts">
          @for (opt of OPTS; track opt.key) {
            <button type="button" class="trivia-popup__opt"
                    [disabled]="submitting()"
                    [class.is-selected]="picked() === opt.key"
                    (click)="answer(q, opt.key)">
              <strong>{{ opt.key }}</strong> {{ q[opt.field] }}
            </button>
          }
        </div>
        @if (msg()) {
          <p class="trivia-popup__msg">{{ msg() }}</p>
        }
      </div>
    }
  `,
  styles: [`
    .trivia-popup {
      position: fixed;
      bottom: var(--space-lg);
      left: var(--space-lg);
      z-index: 60;
      width: 360px;
      max-width: calc(100vw - 2 * var(--space-lg));
      background: var(--color-primary-white);
      border: 1px solid rgba(0,0,0,0.08);
      border-left: 3px solid var(--color-primary-green);
      border-radius: var(--radius-md);
      padding: var(--space-md);
      box-shadow: 0 8px 32px rgba(0,0,0,0.12);
      animation: trivia-pop 200ms cubic-bezier(0.2, 0.9, 0.3, 1.4);
    }
    @keyframes trivia-pop {
      from { transform: translateY(20px); opacity: 0; }
      to   { transform: translateY(0); opacity: 1; }
    }
    .trivia-popup__head {
      display: flex; justify-content: space-between; align-items: flex-start;
      gap: var(--space-sm);
      margin-bottom: var(--space-sm);
    }
    .trivia-popup__kicker {
      font-size: var(--fs-xs);
      text-transform: uppercase;
      letter-spacing: 0.06em;
      font-weight: var(--fw-bold);
      color: var(--color-primary-green);
      line-height: 1.3;
    }
    .trivia-popup__x {
      background: transparent; border: 0;
      cursor: pointer; font-size: 22px; line-height: 1;
      color: var(--color-text-muted);
      padding: 0; margin: -4px -4px 0 0;
    }
    .trivia-popup__prompt {
      font-size: var(--fs-sm);
      line-height: 1.4;
      margin-bottom: var(--space-sm);
      font-weight: var(--fw-semibold);
    }
    .trivia-popup__opts {
      display: grid; gap: 4px;
    }
    .trivia-popup__opt {
      text-align: left;
      background: var(--color-primary-grey, #f4f4f4);
      border: 0;
      padding: 8px 10px;
      border-radius: var(--radius-sm);
      cursor: pointer;
      font: inherit;
      font-size: var(--fs-sm);
      transition: background 100ms;
    }
    .trivia-popup__opt:hover:not(:disabled) {
      background: rgba(0, 200, 100, 0.10);
    }
    .trivia-popup__opt.is-selected {
      background: var(--color-primary-green);
      color: var(--color-primary-white);
    }
    .trivia-popup__opt strong { margin-right: 6px; }
    .trivia-popup__opt:disabled { opacity: 0.6; cursor: not-allowed; }
    .trivia-popup__msg {
      font-size: var(--fs-xs);
      color: var(--color-primary-green);
      margin-top: var(--space-sm);
    }

    @media (max-width: 480px) {
      .trivia-popup {
        left: var(--space-sm);
        right: var(--space-sm);
        bottom: var(--space-sm);
        width: auto;
      }
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

  /** Cola de preguntas activas no contestadas */
  private queue = signal<ActiveQuestion[]>([]);
  /** IDs dismissed esta sesión */
  private dismissed = signal<Set<string>>(new Set());

  current = computed<ActiveQuestion | null>(() => {
    const dismissed = this.dismissed();
    return this.queue().find((q) => !dismissed.has(q.id)) ?? null;
  });

  picked = signal<Opt | null>(null);
  submitting = signal(false);
  msg = signal<string | null>(null);

  private pollTimer: ReturnType<typeof setInterval> | undefined;

  async ngOnInit() {
    // Solo COMPLETE-mode users (las trivias scorean solo en COMPLETE).
    if (!this.userModes.hasComplete()) return;
    await this.refresh();
    this.pollTimer = setInterval(() => void this.refresh(), POLL_MS);
  }

  ngOnDestroy() {
    if (this.pollTimer) clearInterval(this.pollTimer);
  }

  dismiss() {
    const cur = this.current();
    if (!cur) return;
    this.dismissed.update((s) => {
      const n = new Set(s);
      n.add(cur.id);
      return n;
    });
    this.picked.set(null);
    this.msg.set(null);
  }

  async answer(q: ActiveQuestion, opt: Opt) {
    if (this.submitting()) return;
    const userId = this.auth.user()?.sub;
    if (!userId) return;
    this.picked.set(opt);
    this.submitting.set(true);
    this.msg.set(null);
    try {
      await this.api.upsertTriviaAnswer({
        userId, questionId: q.id, matchId: q.matchId, selectedOption: opt,
      });
      this.msg.set('Respuesta enviada — la veremos cuando termine el partido.');
      // Quitar la pregunta de la cola tras 1.5s para que el user vea el feedback
      setTimeout(() => {
        this.queue.update((arr) => arr.filter((x) => x.id !== q.id));
        this.picked.set(null);
        this.msg.set(null);
      }, 1500);
    } catch (err) {
      this.msg.set('No se pudo guardar. Intenta de nuevo.');
      // eslint-disable-next-line no-console
      console.warn('[trivia-popup] answer failed', err);
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

      // Match "live trivia window" = no FINAL OR FINAL hace <10min.
      const now = Date.now();
      const liveMatches = (matchesRes.data ?? []).filter((m) => {
        if (m.status === 'FINAL') {
          const upd = m.updatedAt ? Date.parse(m.updatedAt) : 0;
          return now < upd + POST_FINAL_WINDOW_MS;
        }
        // Solo dentro de 0..3h post-kickoff (heurístico para no sondear
        // matches lejanos en el futuro).
        const k = Date.parse(m.kickoffAt);
        return now >= k && now < k + 3 * 60 * 60_000;
      });

      if (liveMatches.length === 0) {
        this.queue.set([]);
        return;
      }

      // Para cada match en ventana, traer questions + mis answers.
      const collected: ActiveQuestion[] = [];
      for (const m of liveMatches) {
        const [qRes, aRes] = await Promise.all([
          this.api.listTriviaByMatch(m.id),
          this.api.myTriviaAnswers(userId, m.id),
        ]);
        const answeredQids = new Set(((aRes.data ?? []) as Array<{ questionId: string }>).map((a) => a.questionId));
        for (const q of (qRes.data ?? []) as Array<{
          id: string; prompt: string;
          optionA: string; optionB: string; optionC: string; optionD: string;
        }>) {
          if (answeredQids.has(q.id)) continue;
          collected.push({
            id: q.id, matchId: m.id, prompt: q.prompt,
            optionA: q.optionA, optionB: q.optionB,
            optionC: q.optionC, optionD: q.optionD,
            homeTeam: teamMap.get(m.homeTeamId) ?? m.homeTeamId,
            awayTeam: teamMap.get(m.awayTeamId) ?? m.awayTeamId,
          });
        }
      }
      this.queue.set(collected);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn('[trivia-popup] refresh failed', err);
    }
  }
}
