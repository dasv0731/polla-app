import { Component, inject } from '@angular/core';
import { A11yModule } from '@angular/cdk/a11y';
import { ConfirmDialogService } from './confirm-dialog.service';

/**
 * Modal de confirmación accesible (focus trap + Escape + role=dialog +
 * aria-labelledby) que reemplaza a `window.confirm` para acciones
 * destructivas o de impacto. Se controla via `ConfirmDialogService.ask()`.
 *
 * Montado una sola vez en `<app-root>`, vive sobre todo y funciona tanto en
 * shell autenticado como en auth-shell.
 */
@Component({
  standalone: true,
  selector: 'app-confirm-dialog',
  imports: [A11yModule],
  template: `
    @if (svc.pending(); as p) {
      <div class="confirm-overlay"
           role="dialog" aria-modal="true"
           aria-labelledby="confirm-dialog-title"
           aria-describedby="confirm-dialog-msg"
           cdkTrapFocus
           [cdkTrapFocusAutoCapture]="true"
           (keydown.escape)="svc.cancel()">
        <div class="confirm-backdrop" role="presentation"
             (click)="svc.cancel()"></div>
        <div class="confirm-card">
          <h2 id="confirm-dialog-title" class="confirm-card__title">{{ p.title }}</h2>
          <p id="confirm-dialog-msg" class="confirm-card__msg">{{ p.message }}</p>
          <div class="confirm-card__actions">
            <button type="button" class="confirm-btn"
                    (click)="svc.cancel()">{{ p.cancelLabel ?? 'Cancelar' }}</button>
            <button type="button"
                    class="confirm-btn confirm-btn--primary"
                    [class.confirm-btn--danger]="!!p.danger"
                    (click)="svc.confirm()">{{ p.confirmLabel ?? 'Confirmar' }}</button>
          </div>
        </div>
      </div>
    }
  `,
  styles: [`
    :host { display: contents; }

    .confirm-overlay {
      position: fixed; inset: 0;
      z-index: 1000;
      display: grid; place-items: center;
      padding: 16px;
    }
    .confirm-backdrop {
      position: absolute; inset: 0;
      background: rgba(0,0,0,0.55);
      backdrop-filter: blur(2px);
      cursor: pointer;
    }
    .confirm-card {
      position: relative;
      background: var(--color-primary-white);
      border-radius: 14px;
      padding: 24px;
      width: min(420px, calc(100vw - 32px));
      box-shadow: 0 20px 60px rgba(0,0,0,0.35);
      overscroll-behavior: contain;
    }
    .confirm-card__title {
      margin: 0 0 8px;
      font-family: var(--font-display);
      font-size: 22px;
      letter-spacing: 0.02em;
      line-height: 1.2;
      color: var(--color-primary-black);
    }
    .confirm-card__msg {
      margin: 0 0 18px;
      font-size: 14px;
      color: var(--color-text-muted);
      line-height: 1.5;
    }
    .confirm-card__actions {
      display: flex; gap: 8px; justify-content: flex-end;
    }
    .confirm-btn {
      padding: 10px 16px;
      border-radius: 8px;
      font-family: var(--font-primary);
      font-weight: 600;
      font-size: 13px;
      background: transparent;
      border: 1px solid var(--color-line);
      color: var(--color-primary-black);
      cursor: pointer;
      transition: background 0.15s ease, border-color 0.15s ease, color 0.15s ease;
    }
    .confirm-btn:hover {
      background: rgba(0,0,0,0.04);
    }
    .confirm-btn:focus-visible {
      outline: 2px solid var(--color-primary-green);
      outline-offset: 2px;
    }
    .confirm-btn--primary {
      background: var(--color-primary-green);
      border-color: var(--color-primary-green);
      color: var(--color-primary-white);
    }
    .confirm-btn--primary:hover {
      background: #029960;
      border-color: #029960;
    }
    .confirm-btn--danger {
      background: var(--color-lost);
      border-color: var(--color-lost);
      color: var(--color-primary-white);
    }
    .confirm-btn--danger:hover {
      background: #c0392b;
      border-color: #c0392b;
    }
  `],
})
export class ConfirmDialogComponent {
  svc = inject(ConfirmDialogService);
}
