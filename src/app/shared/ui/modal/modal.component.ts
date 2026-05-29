import { Component, EventEmitter, computed, input, Output } from '@angular/core';
import { A11yModule } from '@angular/cdk/a11y';
import type { ModalSize } from './modal-size';

/**
 * `<app-modal>` — Sistema unificado de modales para toda la app.
 *
 * Reemplaza 4 sistemas paralelos (.picks-modal, .edit-profile-modal,
 * .prefs-modal, .confirm-backdrop) con un solo component que consume
 * design tokens de A1.
 *
 * Slots:
 * - [slot="body"] — contenido principal
 * - [slot="footer"] — actions footer (Cancelar / Confirmar / etc.)
 *
 * A11y:
 * - role="dialog" + aria-modal="true"
 * - aria-labelledby (auto-id del title)
 * - aria-describedby (auto-id del description si provisto — benchmark de
 *   ConfirmDialogComponent, ahora aplicado a todos los modales)
 * - cdkTrapFocus + autoCapture
 * - Escape close
 * - Backdrop click close
 *
 * Animation: scale+fade entrada (var(--anim-base, 200ms)). Respeta
 * prefers-reduced-motion.
 */
@Component({
  standalone: true,
  selector: 'app-modal',
  imports: [A11yModule],
  template: `
    @if (open()) {
      <div class="app-modal"
           [class]="sizeClass()"
           role="dialog"
           aria-modal="true"
           [attr.aria-labelledby]="titleId()"
           [attr.aria-describedby]="description() ? descId() : null"
           cdkTrapFocus
           [cdkTrapFocusAutoCapture]="true"
           (keydown.escape)="close.emit()">
        <div class="app-modal__backdrop" role="presentation"
             (click)="close.emit()"></div>
        <div class="app-modal__card">
          <header class="app-modal__head">
            <h2 class="app-modal__title" [id]="titleId()">{{ title() }}</h2>
            @if (description(); as desc) {
              <p class="app-modal__desc" [id]="descId()">{{ desc }}</p>
            }
            <button type="button" class="app-modal__close"
                    aria-label="Cerrar"
                    (click)="close.emit()">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
                   stroke="currentColor" stroke-width="2" stroke-linecap="round"
                   stroke-linejoin="round" aria-hidden="true">
                <path d="M18 6 6 18M6 6l12 12"/>
              </svg>
            </button>
          </header>
          <div class="app-modal__body">
            <ng-content select="[slot=body]" />
          </div>
          <footer class="app-modal__foot">
            <ng-content select="[slot=footer]" />
          </footer>
        </div>
      </div>
    }
  `,
  styles: [`
    :host { display: contents; }

    .app-modal {
      position: fixed;
      inset: 0;
      z-index: var(--z-modal, 1000);
      display: grid;
      place-items: center;
      padding: 16px;
      animation: app-modal-fade-in var(--anim-base, 200ms) var(--easing-enter, ease-out);
    }
    .app-modal__backdrop {
      position: absolute;
      inset: 0;
      background: var(--modal-backdrop-color, rgba(0,0,0,0.75));
      backdrop-filter: blur(var(--modal-backdrop-blur, 6px));
      -webkit-backdrop-filter: blur(var(--modal-backdrop-blur, 6px));
      cursor: pointer;
    }
    .app-modal__card {
      position: relative;
      z-index: 1;
      background: var(--color-primary-white, #fff);
      border-radius: var(--modal-radius, 16px);
      box-shadow: 0 24px 64px rgba(0,0,0,0.32);
      width: 100%;
      max-height: 90vh;
      overflow-y: auto;
      overscroll-behavior: contain;
      animation: app-modal-scale-in var(--anim-base, 200ms) var(--easing-enter, ease-out);
    }
    .app-modal--sm .app-modal__card {
      max-width: var(--modal-max-width-sm, 380px);
      padding: var(--modal-padding-sm, 20px);
    }
    .app-modal--md .app-modal__card {
      max-width: var(--modal-max-width-md, 480px);
      padding: var(--modal-padding, 28px);
    }
    .app-modal--lg .app-modal__card {
      max-width: var(--modal-max-width-lg, 640px);
      padding: var(--modal-padding-lg, 36px);
    }
    .app-modal__head {
      display: flex;
      align-items: flex-start;
      gap: 12px;
      margin-bottom: 16px;
      position: relative;
    }
    .app-modal__title {
      flex: 1;
      margin: 0;
      font-family: var(--font-display, system-ui);
      font-size: 20px;
      letter-spacing: 0.02em;
      line-height: 1.2;
      color: var(--color-primary-black, #0a0a0a);
    }
    .app-modal__desc {
      flex-basis: 100%;
      margin: 8px 0 0;
      font-size: 13px;
      color: var(--color-text-muted, rgba(0,0,0,0.5));
      line-height: 1.5;
    }
    .app-modal__close {
      background: transparent;
      border: 0;
      padding: 4px;
      cursor: pointer;
      color: var(--color-text-muted, rgba(0,0,0,0.5));
      flex-shrink: 0;
      border-radius: 4px;
    }
    .app-modal__close:hover {
      color: var(--color-primary-black, #0a0a0a);
      background: rgba(0,0,0,0.05);
    }
    .app-modal__close:focus-visible {
      outline: 2px solid var(--color-primary-green, #02CC74);
      outline-offset: 2px;
    }
    .app-modal__body { margin-bottom: 16px; }
    .app-modal__foot {
      display: flex;
      gap: 8px;
      justify-content: flex-end;
      flex-wrap: wrap;
    }
    .app-modal__foot:empty { display: none; }

    @keyframes app-modal-fade-in {
      from { opacity: 0; }
      to   { opacity: 1; }
    }
    @keyframes app-modal-scale-in {
      from { transform: scale(0.96); opacity: 0; }
      to   { transform: scale(1);    opacity: 1; }
    }
    @media (prefers-reduced-motion: reduce) {
      .app-modal,
      .app-modal__card {
        animation: none;
      }
    }
  `],
})
export class ModalComponent {
  open = input.required<boolean>();
  title = input.required<string>();
  description = input<string>();
  size = input<ModalSize>('md');

  @Output() close = new EventEmitter<void>();

  private uniqueId = Math.random().toString(36).slice(2, 9);

  titleId = computed(() => `app-modal-title-${this.uniqueId}`);
  descId = computed(() => `app-modal-desc-${this.uniqueId}`);
  sizeClass = computed(() => `app-modal app-modal--${this.size()}`);
}
