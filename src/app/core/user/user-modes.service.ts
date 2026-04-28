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
export interface UserGroup {
  id: string;
  name: string;
  mode: GameMode;
}

@Injectable({ providedIn: 'root' })
export class UserModesService {
  private api = inject(ApiService);

  modes = signal<GameMode[]>([]);
  groups = signal<UserGroup[]>([]);
  loading = signal(false);

  has = (mode: GameMode) => this.modes().includes(mode);
  hasSimple = computed(() => this.modes().includes('SIMPLE'));
  hasComplete = computed(() => this.modes().includes('COMPLETE'));
  eligibleForGlobalRanking = computed(() => this.hasComplete());

  groupsByMode = computed(() => {
    const out: Record<GameMode, UserGroup[]> = { SIMPLE: [], COMPLETE: [] };
    for (const g of this.groups()) out[g.mode].push(g);
    return out;
  });

  async load(userId: string): Promise<void> {
    if (!userId) {
      this.modes.set([]);
      this.groups.set([]);
      return;
    }
    this.loading.set(true);
    try {
      const memberships = await this.api.myGroups(userId);
      const groupIds = (memberships.data ?? []).map((m: { groupId: string }) => m.groupId);

      // Resolvemos los grupos en paralelo para no encadenar latencias por
      // membership. Errores individuales se ignoran (un grupo borrado o sin
      // permisos no debe romper el feed completo).
      const resolved: UserGroup[] = [];
      await Promise.all(
        groupIds.map(async (gid) => {
          try {
            const g = await this.api.getGroup(gid);
            if (!g.data) return;
            const mode = g.data.mode as GameMode | undefined;
            if (mode !== 'SIMPLE' && mode !== 'COMPLETE') return;
            resolved.push({ id: g.data.id, name: g.data.name, mode });
          } catch {
            /* skip */
          }
        }),
      );
      resolved.sort((a, b) => a.name.localeCompare(b.name));
      this.groups.set(resolved);

      const modeSet = new Set<GameMode>();
      for (const g of resolved) modeSet.add(g.mode);
      this.modes.set(Array.from(modeSet));
    } finally {
      this.loading.set(false);
    }
  }

  reset(): void {
    this.modes.set([]);
    this.groups.set([]);
  }
}
