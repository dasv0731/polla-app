import { Component, EventEmitter, Output, input } from '@angular/core';
import { A11yModule } from '@angular/cdk/a11y';

/**
 * `<app-more-sheet>` — Slide-up sheet from bottom for mobile "Más" menu.
 *
 * Decisión producto (A8a): bottom-nav 5 items fijos + sheet "Más" con
 * items extra (Mundial 2026, Comodines, Notificaciones, Perfil,
 * Admin si aplica).
 *
 * A11y:
 * - role="dialog" + aria-modal="true" + aria-labelledby="more-sheet-title"
 * - cdkTrapFocus + autoCapture
 * - Escape close
 * - Backdrop click close
 *
 * Animation: slide-up entrada (translateY 100% → 0), backdrop fade.
 * Respect prefers-reduced-motion.
 *
 * Usage:
 *   <app-more-sheet [open]="moreOpen()" (close)="moreOpen.set(false)">
 *     <a routerLink="/picks/group-stage/predict">Mundial 2026</a>
 *     <a routerLink="/comodines">Comodines</a>
 *     ...
 *   </app-more-sheet>
 */
@Component({
  standalone: true,
  selector: 'app-more-sheet',
  imports: [A11yModule],
  template: `
    @if (open()) {
      <div class="more-sheet"
           role="dialog"
           aria-modal="true"
           aria-labelledby="more-sheet-title"
           cdkTrapFocus
           [cdkTrapFocusAutoCapture]="true"
           (keydown.escape)="close.emit()">
        <div class="more-sheet__backdrop"
             role="presentation"
             (click)="close.emit()"></div>
        <div class="more-sheet__card">
          <div class="more-sheet__handle" aria-hidden="true"></div>
          <h2 class="more-sheet__title" id="more-sheet-title">Más</h2>
          <div class="more-sheet__items">
            <ng-content />
          </div>
        </div>
      </div>
    }
  `,
  styles: [`
    :host { display: contents; }

    .more-sheet {
      position: fixed;
      inset: 0;
      z-index: var(--z-overlay, 100);
      display: flex;
      flex-direction: column;
      justify-content: flex-end;
      animation: ms-fade-in var(--anim-base, 200ms) var(--easing-enter, ease-out);
    }
    .more-sheet__backdrop {
      position: absolute;
      inset: 0;
      background: var(--modal-backdrop-color, rgba(0,0,0,0.55));
      backdrop-filter: blur(4px);
      -webkit-backdrop-filter: blur(4px);
      cursor: pointer;
    }
    .more-sheet__card {
      position: relative;
      z-index: 1;
      background: var(--color-primary-white, #fff);
      border-radius: var(--modal-radius, 16px) var(--modal-radius, 16px) 0 0;
      box-shadow: 0 -8px 32px rgba(0,0,0,0.18);
      padding: 8px 0 calc(16px + env(safe-area-inset-bottom, 0px));
      max-height: 70vh;
      overflow-y: auto;
      animation: ms-slide-up var(--anim-base, 200ms) var(--easing-enter, ease-out);
    }
    .more-sheet__handle {
      width: 36px;
      height: 4px;
      background: rgba(0,0,0,0.15);
      border-radius: 2px;
      margin: 8px auto 12px;
    }
    .more-sheet__title {
      font-family: var(--font-display, system-ui);
      font-size: 13px;
      letter-spacing: 0.12em;
      text-transform: uppercase;
      color: var(--color-text-muted, rgba(0,0,0,0.5));
      margin: 0 0 8px;
      padding: 0 20px;
      font-weight: 700;
    }
    .more-sheet__items {
      display: flex;
      flex-direction: column;
    }

    @keyframes ms-fade-in {
      from { opacity: 0; }
      to   { opacity: 1; }
    }
    @keyframes ms-slide-up {
      from { transform: translateY(100%); }
      to   { transform: translateY(0); }
    }
    @media (prefers-reduced-motion: reduce) {
      .more-sheet,
      .more-sheet__card {
        animation: none;
      }
    }
  `],
})
export class MoreSheetComponent {
  open = input.required<boolean>();
  @Output() close = new EventEmitter<void>();
}
