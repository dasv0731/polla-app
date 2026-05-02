import { Injectable, signal } from '@angular/core';

/**
 * Estado global del modal "Canjear código de sponsor". Cualquier
 * componente puede abrirlo (sidebar, rail, profile). El modal mismo
 * vive en `shared/layout/redeem-modal.component`, montado en el shell.
 */
@Injectable({ providedIn: 'root' })
export class RedeemModalService {
  isOpen = signal(false);

  open()  { this.isOpen.set(true); }
  close() { this.isOpen.set(false); }
}
