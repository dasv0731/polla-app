import { Injectable, signal } from '@angular/core';

/**
 * Estado global del modal de "pick rápido". El rail derecho (y cualquier
 * otra superficie) puede abrirlo para que el user ingrese el marcador de un
 * partido sin navegar a la página de detalle. El modal mismo vive en
 * `shared/layout/quick-pick-modal.component`, montado en el shell.
 *
 * Espejo del patrón de `RedeemModalService`.
 */
export interface QuickPickTarget {
  matchId: string;
  homeName: string;
  awayName: string;
  homeFlag: string;
  awayFlag: string;
  homeInitials: string;
  awayInitials: string;
  kickoffAt?: string | null;
  /** Pick existente (si lo hay) para prefill cuando no hay pending en sync. */
  pick?: { home: number; away: number } | null;
}

@Injectable({ providedIn: 'root' })
export class QuickPickModalService {
  target = signal<QuickPickTarget | null>(null);

  open(t: QuickPickTarget) { this.target.set(t); }
  close() { this.target.set(null); }
}
