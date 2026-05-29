import { inject } from '@angular/core';
import { CanDeactivateFn } from '@angular/router';
import { ConfirmDialogService } from '../ui/confirm-dialog.service';

/**
 * Componente con tracking de cambios pendientes. Cualquier componente que
 * implemente este contrato puede usarse con `dirtyFormGuard` para confirmar
 * antes de navegar si hay edits sin guardar.
 */
export interface DirtyAware {
  isDirty(): boolean;
}

/**
 * CanDeactivate functional guard: si el componente está dirty, abre el
 * `ConfirmDialogComponent` y resuelve a true/false según la respuesta.
 *
 * Después de un save exitoso, los componentes deben dejar de estar dirty
 * (resetear su snapshot o navegar antes de que el guard corra). Si el
 * componente no implementa `isDirty`, el guard permite la navegación.
 */
export const dirtyFormGuard: CanDeactivateFn<DirtyAware> = (component) => {
  if (typeof component?.isDirty !== 'function' || !component.isDirty()) {
    return true;
  }
  const confirmDialog = inject(ConfirmDialogService);
  return confirmDialog.ask({
    title: 'Salir sin guardar',
    message: 'Tienes cambios sin guardar. Si sales ahora se pierden.',
    confirmLabel: 'Salir sin guardar',
    cancelLabel: 'Seguir editando',
    danger: true,
  });
};
