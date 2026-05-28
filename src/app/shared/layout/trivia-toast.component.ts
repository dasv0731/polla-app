import { Component, computed, inject } from '@angular/core';
import { TriviaModalService } from '../../core/trivia/trivia-modal.service';

/**
 * Top banner que aparece (margin-left 64px en desktop, alineado con el área
 * principal a la derecha del sidebar negro) cuando hay preguntas live no
 * respondidas. Click en "Responder" abre el modal de trivia. Se oculta
 * automáticamente cuando no hay trivia activa.
 *
 * Lee `pendingCount` desde `TriviaModalService`, que es actualizado por el
 * effect del popup cada vez que la cola live cambia o el tick reactivo
 * avanza un segundo (para reflejar preguntas que recién se publican).
 */
@Component({
  standalone: true,
  selector: 'app-trivia-toast',
  template: `
    @if (visible()) {
      <div class="trivia-toast" role="status" aria-live="polite">
        <span class="trivia-toast__dot" aria-hidden="true"></span>
        <span class="trivia-toast__text">
          Nueva trivia disponible · {{ count() }}
          {{ count() === 1 ? 'pregunta' : 'preguntas' }} para ganar comodín ·
        </span>
        <a class="trivia-toast__link" (click)="open()">Responder →</a>
      </div>
    }
  `,
  styles: [`
    :host { display: contents; }

    .trivia-toast {
      margin-left: 64px;
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
    @keyframes trivia-toast-pulse {
      0%, 100% { transform: scale(1); opacity: 1; }
      50%      { transform: scale(1.5); opacity: 0.6; }
    }
    .trivia-toast__link {
      color: var(--color-primary-green);
      font-weight: 600;
      text-decoration: none;
      cursor: pointer;
    }
  `],
})
export class TriviaToastComponent {
  private trivia = inject(TriviaModalService);

  count = computed(() => this.trivia.pendingCount());
  /** Se oculta cuando el modal ya está abierto (para no duplicar prompts)
   *  o cuando no hay preguntas pendientes. */
  visible = computed(() => this.count() > 0 && !this.trivia.isOpen());

  open() { this.trivia.open(); }
}
