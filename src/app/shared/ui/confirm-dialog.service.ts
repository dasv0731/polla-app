import { Injectable, signal } from '@angular/core';

export interface ConfirmOptions {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Estiliza el botón primario en rojo para acciones destructivas. */
  danger?: boolean;
}

interface PendingDialog extends ConfirmOptions {
  resolve: (confirmed: boolean) => void;
}

/**
 * Servicio global para pedir confirmación al usuario en vez de `window.confirm`.
 * Renderiza la modal vía `<app-confirm-dialog>` montado en el root (app.component).
 *
 * Uso:
 *   const ok = await this.confirmDialog.ask({
 *     title: 'Eliminar grupo',
 *     message: 'Esta acción no se puede deshacer.',
 *     confirmLabel: 'Eliminar',
 *     danger: true,
 *   });
 *   if (!ok) return;
 */
@Injectable({ providedIn: 'root' })
export class ConfirmDialogService {
  readonly pending = signal<PendingDialog | null>(null);

  ask(opts: ConfirmOptions): Promise<boolean> {
    const prev = this.pending();
    if (prev) prev.resolve(false);
    return new Promise<boolean>((resolve) => {
      this.pending.set({ ...opts, resolve });
    });
  }

  confirm(): void {
    const p = this.pending();
    if (!p) return;
    this.pending.set(null);
    p.resolve(true);
  }

  cancel(): void {
    const p = this.pending();
    if (!p) return;
    this.pending.set(null);
    p.resolve(false);
  }
}
