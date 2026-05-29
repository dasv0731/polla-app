import { Component, inject } from '@angular/core';
import { ModalComponent } from './modal/modal.component';
import { ConfirmDialogService } from './confirm-dialog.service';

/**
 * Modal de confirmación accesible (focus trap + Escape + role=dialog +
 * aria-labelledby + aria-describedby) que reemplaza a `window.confirm`
 * para acciones destructivas o de impacto. Se controla via
 * `ConfirmDialogService.ask()`.
 *
 * A2: consume `<app-modal>` shared. Preserva API (svc.pending() signal).
 */
@Component({
  standalone: true,
  selector: 'app-confirm-dialog',
  imports: [ModalComponent],
  template: `
    @if (svc.pending(); as p) {
      <app-modal
        [open]="true"
        [title]="p.title"
        [description]="p.message"
        size="sm"
        (close)="svc.cancel()">
        <div slot="footer">
          <button type="button"
                  class="confirm-btn"
                  (click)="svc.cancel()">
            {{ p.cancelLabel ?? 'Cancelar' }}
          </button>
          <button type="button"
                  class="confirm-btn confirm-btn--primary"
                  [class.confirm-btn--danger]="!!p.danger"
                  (click)="svc.confirm()">
            {{ p.confirmLabel ?? 'Confirmar' }}
          </button>
        </div>
      </app-modal>
    }
  `,
  styles: [`
    :host { display: contents; }

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
    .confirm-btn:hover { background: rgba(0,0,0,0.04); }
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
