import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { TriviaModalService } from '../../core/trivia/trivia-modal.service';
import { IconComponent } from '../ui/icon/icon.component';

const DISMISS_STORAGE_KEY = 'trivia-toast-dismissed-until';
const DISMISS_COOLDOWN_MS = 60 * 60 * 1000; // 1h

/**
 * Top banner que aparece (margin-left 64px en desktop, alineado con el área
 * principal a la derecha del sidebar negro) cuando hay preguntas live no
 * respondidas. Click en "Responder" abre el modal de trivia. Se oculta
 * automáticamente cuando no hay trivia activa.
 *
 * A8d polish:
 * - `<a>` sin href → `<button>` para semantics + keyboard.
 * - Unicode → SVG icons (arrow-right, close).
 * - Pulse animation respeta prefers-reduced-motion.
 * - Dismiss button con cooldown de 1h vía localStorage.
 * - `--sidebar-w` ya consumido (A3 fix).
 * - Wording dinámico según sponsor (sponsor → "+gana comodín", base → "+10 pts").
 *   TODO(trivia-sponsor): conectar sponsor info cuando TriviaModalService la
 *   exponga (actualmente sólo `pendingCount`).
 */
@Component({
  standalone: true,
  selector: 'app-trivia-toast',
  imports: [IconComponent],
  template: `
    @if (visible()) {
      <div class="trivia-toast" role="status" aria-live="polite">
        <span class="trivia-toast__dot" aria-hidden="true"></span>
        <span class="trivia-toast__text">
          Nueva trivia disponible · {{ count() }}
          {{ count() === 1 ? 'pregunta' : 'preguntas' }} · {{ rewardLabel() }}
        </span>
        <button type="button" class="trivia-toast__link" (click)="open()">
          <span>Responder</span>
          <app-icon name="arrow-right" size="sm" />
        </button>
        <button
          type="button"
          class="trivia-toast__close"
          (click)="dismiss()"
          aria-label="Cerrar">
          <app-icon name="close" size="sm" />
        </button>
      </div>
    }
  `,
  styles: [`
    :host { display: contents; }

    .trivia-toast {
      margin-left: var(--sidebar-w);
      margin-bottom: 6px;
      transition: margin-left 0.2s ease;
      background: #0a0a0a;
      color: #fff;
      border-bottom: 1px solid rgba(2,204,116,0.4);
      padding: 8px 24px;
      text-align: center;
      font-size: 12px;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 10px;
      cursor: default;
    }
    @media (max-width: 767px) {
      .trivia-toast {
        margin-left: 0;
        font-size: 11px;
        padding: 8px 14px;
      }
    }
    .trivia-toast__dot {
      width: 8px; height: 8px;
      border-radius: 50%;
      background: var(--color-primary-green);
      animation: trivia-toast-pulse 1.5s infinite;
    }
    @media (prefers-reduced-motion: reduce) {
      .trivia-toast__dot {
        animation: none;
      }
    }
    @keyframes trivia-toast-pulse {
      0%, 100% { transform: scale(1); opacity: 1; }
      50%      { transform: scale(1.5); opacity: 0.6; }
    }
    .trivia-toast__link,
    .trivia-toast__close {
      background: transparent;
      border: 0;
      padding: 0;
      color: var(--color-primary-green);
      font-weight: 600;
      font-size: inherit;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 4px;
    }
    .trivia-toast__link:focus-visible,
    .trivia-toast__close:focus-visible {
      outline: 2px solid var(--color-primary-green);
      outline-offset: 2px;
      border-radius: 4px;
    }
    .trivia-toast__close {
      color: rgba(255,255,255,0.7);
      margin-left: 6px;
    }
    .trivia-toast__close:hover {
      color: #fff;
    }
  `],
})
export class TriviaToastComponent implements OnInit {
  private trivia = inject(TriviaModalService);

  count = computed(() => this.trivia.pendingCount());

  /** TODO(trivia-sponsor): sponsor-aware wording cuando service lo exponga. */
  private isSponsored = signal(false);
  rewardLabel = computed(() =>
    this.isSponsored() ? 'gana comodín' : '+10 pts'
  );

  private dismissedUntil = signal<number>(0);

  /** Se oculta cuando el modal ya está abierto (para no duplicar prompts),
   *  cuando no hay preguntas pendientes, o cuando el user dismisseó hace <1h. */
  visible = computed(() =>
    this.count() > 0
    && !this.trivia.isOpen()
    && Date.now() >= this.dismissedUntil()
  );

  ngOnInit() {
    try {
      const raw = localStorage.getItem(DISMISS_STORAGE_KEY);
      const until = raw ? Number.parseInt(raw, 10) : 0;
      if (Number.isFinite(until) && until > Date.now()) {
        this.dismissedUntil.set(until);
      }
    } catch {
      // localStorage disabled / SSR / private mode — no cooldown.
    }
  }

  open() { this.trivia.open(); }

  dismiss() {
    const until = Date.now() + DISMISS_COOLDOWN_MS;
    this.dismissedUntil.set(until);
    try {
      localStorage.setItem(DISMISS_STORAGE_KEY, String(until));
    } catch {
      // ignore
    }
  }
}
