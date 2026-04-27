import { Injectable, computed, inject, signal } from '@angular/core';
import { ApiService } from '../api/api.service';

export type GameMode = 'SIMPLE' | 'COMPLETE';

/**
 * Modos de juego disponibles para el usuario actual, derivados de los grupos
 * privados a los que pertenece. Cargado una vez por sesión después del login.
 *
 * Reglamento §2: cada user tiene una predicción simple y una completa
 * independientes. Esta clase se usa para gatear UI:
 *   - El menú esconde "Picks" (marcadores) si no hay COMPLETE.
 *   - Las pantallas de picks redirigen si el modo solicitado no está
 *     disponible para este user.
 *   - El ranking global filtra por usuarios que tienen al menos un
 *     COMPLETE — `eligibleForGlobalRanking` lo expone como signal.
 */
@Injectable({ providedIn: 'root' })
export class UserModesService {
  private api = inject(ApiService);

  modes = signal<GameMode[]>([]);
  loading = signal(false);

  has = (mode: GameMode) => this.modes().includes(mode);
  hasSimple = computed(() => this.modes().includes('SIMPLE'));
  hasComplete = computed(() => this.modes().includes('COMPLETE'));
  eligibleForGlobalRanking = computed(() => this.hasComplete());

  async load(userId: string): Promise<void> {
    if (!userId) {
      this.modes.set([]);
      return;
    }
    this.loading.set(true);
    try {
      const memberships = await this.api.myGroups(userId);
      const groupIds = (memberships.data ?? []).map((m: { groupId: string }) => m.groupId);
      const set = new Set<GameMode>();
      // Resolvemos los grupos en paralelo para no encadenar latencias por
      // membership. Errores individuales se ignoran (un grupo borrado o sin
      // permisos no debe romper el feed completo).
      await Promise.all(
        groupIds.map(async (gid) => {
          try {
            const g = await this.api.getGroup(gid);
            const mode = g.data?.mode as GameMode | undefined;
            if (mode === 'SIMPLE' || mode === 'COMPLETE') set.add(mode);
          } catch {
            /* skip */
          }
        }),
      );
      this.modes.set(Array.from(set));
    } finally {
      this.loading.set(false);
    }
  }

  reset(): void {
    this.modes.set([]);
  }
}
