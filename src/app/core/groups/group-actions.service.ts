import { Injectable, signal } from '@angular/core';

/**
 * Estado global para los modales "Crear grupo" y "Unirme con código".
 * Cualquier componente puede abrirlos llamando openCreate() / openJoin().
 * Los modales mismos viven en `shared/layout/group-actions-modals.component`
 * y están montados en el ShellComponent.
 */
@Injectable({ providedIn: 'root' })
export class GroupActionsService {
  createOpen = signal(false);
  joinOpen   = signal(false);

  openCreate() { this.createOpen.set(true); this.joinOpen.set(false); }
  openJoin()   { this.joinOpen.set(true);   this.createOpen.set(false); }
  closeAll()   { this.createOpen.set(false); this.joinOpen.set(false); }
}
