import { Injectable, signal, effect, Injector, inject, runInInjectionContext } from '@angular/core';

/**
 * Preferencias del usuario backed by localStorage.
 *
 * Estas son client-side puras — no hay schema de Cognito/AppSync para
 * preferencias todavía. Si en el futuro queremos sincronizarlas
 * server-side (e.g. para que persistan entre dispositivos), se agrega
 * una mutation y este servicio dispara el sync además del set local.
 *
 * Cada flag es un signal — los componentes que dependen de una
 * preferencia (e.g. `reduceMotion` en el tour overlay) leen el signal
 * y reaccionan automáticamente cuando cambia.
 */

export interface UserPrefs {
  /** Reproduce sonidos cortos en notificaciones / triviales acertadas. */
  sounds: boolean;
  /** Auto-abre el modal de trivia cuando un partido entra LIVE en el feed. */
  autoOpenTrivia: boolean;
  /** Reduce animaciones de la app (tour, transiciones). Accesibilidad. */
  reduceMotion: boolean;
  /** Mostrar kickoffs en hora local del browser (default true). Si false,
   *  se usa la hora local del estadio (venue tz). */
  localKickoffTime: boolean;
}

const DEFAULTS: UserPrefs = {
  sounds: true,
  autoOpenTrivia: true,
  reduceMotion: false,
  localKickoffTime: true,
};

const STORAGE_KEY = 'polla.prefs.v1';

@Injectable({ providedIn: 'root' })
export class PreferencesService {
  private injector = inject(Injector);

  prefs = signal<UserPrefs>(this.load());

  constructor() {
    // Persiste a localStorage cada vez que el signal cambia.
    runInInjectionContext(this.injector, () => {
      effect(() => {
        const v = this.prefs();
        try { localStorage.setItem(STORAGE_KEY, JSON.stringify(v)); }
        catch { /* quota exceeded o private mode — no persiste */ }
      });
    });
  }

  /** Setter individual con merge sobre los valores existentes. */
  set<K extends keyof UserPrefs>(key: K, value: UserPrefs[K]) {
    this.prefs.update((p) => ({ ...p, [key]: value }));
  }

  reset() {
    this.prefs.set({ ...DEFAULTS });
  }

  private load(): UserPrefs {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return { ...DEFAULTS };
      const parsed = JSON.parse(raw) as Partial<UserPrefs>;
      return { ...DEFAULTS, ...parsed };
    } catch {
      return { ...DEFAULTS };
    }
  }
}
