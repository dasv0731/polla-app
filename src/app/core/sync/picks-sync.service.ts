import { Injectable, computed, inject, signal } from '@angular/core';
import { ApiService } from '../api/api.service';

/**
 * PicksSyncService — local-first sync para todas las picks del user.
 *
 * Patrón: cada edit del user se enquea acá (escribe a localStorage al
 * instante + actualiza un signal reactivo) y el service se encarga
 * SOLO de ir mandando al backend en background, deduplicando por
 * (kind, key) para que ediciones rápidas colapsen, con retry expo
 * en caso de error.
 *
 * Componentes lo usan así:
 *   sync.enqueue('pick', matchId, { home: 2, away: 1 });
 *
 * Y leen el último valor optimista (incluso antes de sincronizar) con:
 *   sync.getPending<{ home: number; away: number }>('pick', matchId);
 *
 * Beneficios:
 *  · UI nunca espera la red — escritura local es síncrona (~0ms).
 *  · Resiliente a red intermitente — los pendientes quedan en
 *    localStorage hasta que el sync logra mandarlos.
 *  · Recuperación tras refresh / browser crash — al boot lee localStorage
 *    y reanuda el sync.
 *  · Cero spinners — el global status se muestra en el topnav.
 *  · Burst-friendly — debounce de 1500ms colapsa N edits en 1 batch.
 *  · Sync paralelo — Promise.allSettled en lugar de batch endpoint
 *    (no necesita cambios en backend).
 *
 * Trade-off: multi-device se sincroniza con server-state (no peer-to-peer);
 * conflictos resueltos last-write-wins. Aceptable para picks (no
 * colaborativos).
 */

const STORAGE_KEY = 'polla-sync-pending-v1';
const SYNC_DEBOUNCE_MS = 1500;
const MAX_BACKOFF_MS = 60_000;

type Kind =
  | 'pick'              // Match score: key = matchId, payload = { home, away }
  | 'special'           // SpecialPick: key = `${userId}:${type}:${mode}`,
                        //   payload = { userId, type, teamId, tournamentId, mode }
  | 'bracket'           // BracketPick (full row): key = `${userId}:${mode}`,
                        //   payload = full upsertBracketPick input
  | 'group-standing'    // GroupStandingPick: key = `${userId}:${mode}:${groupLetter}`,
                        //   payload = full upsertGroupStandingPick input
  | 'best-thirds';      // BestThirdsPick: key = `${userId}:${mode}`,
                        //   payload = full upsertBestThirdsPick input

type EntryStatus = 'pending' | 'syncing' | 'synced';

interface PendingEntry {
  kind: Kind;
  key: string;
  payload: Record<string, unknown>;
  status: EntryStatus;
  attempts: number;
  /** Timestamp de cuando se enqueó por última vez. Si cambia entre que
   *  el sync arranca y termina, NO marcamos la entry como synced
   *  (porque el user re-editó durante el await y queremos re-pushear). */
  enqueuedAt: number;
  lastAttemptAt: number;
}

@Injectable({ providedIn: 'root' })
export class PicksSyncService {
  private api = inject(ApiService);

  /** Estado interno: Map<fullKey, entry> donde fullKey = `${kind}:${key}`. */
  private store = signal<Map<string, PendingEntry>>(new Map());
  private syncing = signal(false);
  private lastError = signal<string | null>(null);
  private syncTimer: ReturnType<typeof setTimeout> | null = null;

  /** Cantidad de pendientes (no-synced) — para badge en topnav. */
  pending = computed(() =>
    [...this.store().values()].filter((e) => e.status !== 'synced').length,
  );

  /** Status agregado para el indicador del topnav. */
  status = computed<'idle' | 'pending' | 'syncing' | 'error'>(() => {
    if (this.syncing()) return 'syncing';
    if (this.lastError()) return 'error';
    if (this.pending() > 0) return 'pending';
    return 'idle';
  });

  errorMessage = this.lastError.asReadonly();

  constructor() {
    this.load();

    if (typeof document !== 'undefined') {
      // Cuando el tab vuelve a focus (user volvió de otra app/pestaña),
      // forzamos sync para flushear lo que se haya quedado.
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible' && this.store().size > 0) {
          void this.flush();
        }
      });
    }

    if (typeof window !== 'undefined') {
      // Best-effort sync antes de cerrar — no bloquea, pero al menos
      // dispara el request. Lo que no termine queda en localStorage para
      // la próxima sesión.
      window.addEventListener('beforeunload', () => {
        if (this.store().size > 0) {
          void this.flush();
        }
      });
    }

    // Si al boot hay pendientes (por refresh / browser cierre previo),
    // sincronizar después de un pequeño delay para no competir con
    // los loads iniciales de la app.
    if (this.store().size > 0) {
      setTimeout(() => void this.flush(), 1500);
    }
  }

  /** Encola un edit. Dedupe por (kind, key) — el último write gana.
   *  Si la entry estaba 'synced' y vuelve a editarse, pasa a 'pending'. */
  enqueue(kind: Kind, key: string, payload: Record<string, unknown>) {
    const fullKey = `${kind}:${key}`;
    // eslint-disable-next-line no-console
    console.log('[sync] enqueue', kind, key, payload);
    this.store.update((prev) => {
      const next = new Map(prev);
      const existing = next.get(fullKey);
      next.set(fullKey, {
        kind, key, payload,
        status: 'pending',
        attempts: existing?.attempts ?? 0,
        enqueuedAt: Date.now(),
        lastAttemptAt: existing?.lastAttemptAt ?? 0,
      });
      return next;
    });
    this.persist();
    this.scheduleSync();
  }

  /** Lee la última payload conocida para (kind, key) — pending O synced.
   *  Es la "fuente de verdad" para inputs/displays mientras la sesión
   *  esté abierta. Tras refresh la app vuelve a leer de DB. */
  getPending<T extends Record<string, unknown>>(kind: Kind, key: string): T | null {
    return (this.store().get(`${kind}:${key}`)?.payload as T) ?? null;
  }

  /** True solo si hay un edit no-sincronizado todavía. Synced retorna false. */
  isPending(kind: Kind, key: string): boolean {
    const entry = this.store().get(`${kind}:${key}`);
    return entry !== undefined && entry.status !== 'synced';
  }

  /** Trigger manual de sync (botón "Sincronizar pendientes" en topnav). */
  syncNow() {
    if (this.syncTimer) {
      clearTimeout(this.syncTimer);
      this.syncTimer = null;
    }
    void this.flush();
  }

  // -------- private --------

  private scheduleSync() {
    if (this.syncTimer) return;   // ya programado
    this.syncTimer = setTimeout(() => {
      this.syncTimer = null;
      void this.flush();
    }, SYNC_DEBOUNCE_MS);
  }

  private async flush() {
    if (this.syncing()) return;
    const toSync = [...this.store().values()].filter((e) => e.status !== 'synced');
    if (toSync.length === 0) return;

    // eslint-disable-next-line no-console
    console.log('[sync] flush start', toSync.length, 'entries');

    this.syncing.set(true);
    this.lastError.set(null);

    // Marcar las entries como 'syncing' antes del await.
    this.store.update((prev) => {
      const next = new Map(prev);
      for (const e of toSync) {
        const fullKey = `${e.kind}:${e.key}`;
        const cur = next.get(fullKey);
        if (cur && cur.status === 'pending') {
          next.set(fullKey, { ...cur, status: 'syncing' });
        }
      }
      return next;
    });

    // Snapshot de enqueuedAt para detectar re-edits durante el await.
    const snapshots = toSync.map((e) => ({ entry: e, ts: e.enqueuedAt }));

    const results = await Promise.allSettled(
      toSync.map((e) => this.dispatch(e)),
    );

    let errorCount = 0;
    let syncedCount = 0;
    this.store.update((prev) => {
      const next = new Map(prev);
      results.forEach((r, i) => {
        const { entry, ts } = snapshots[i]!;
        const fullKey = `${entry.kind}:${entry.key}`;
        const current = next.get(fullKey);
        if (!current) return;
        if (r.status === 'fulfilled') {
          if (current.enqueuedAt === ts) {
            // El user no re-editó durante el await → marcar como synced.
            // Mantenemos la entry para que getPending siga devolviendo el
            // valor correcto a inputs/displays (sin "vuelta a cero").
            next.set(fullKey, { ...current, status: 'synced' });
            syncedCount++;
          } else {
            // El user re-editó: dejamos el nuevo valor 'pending' para
            // que el próximo flush lo mande con el valor latest.
            next.set(fullKey, { ...current, status: 'pending' });
          }
        } else {
          errorCount++;
          // eslint-disable-next-line no-console
          console.warn('[sync] dispatch failed for', fullKey,
            r.status === 'rejected' ? r.reason : null);
          next.set(fullKey, {
            ...current,
            status: 'pending',
            attempts: current.attempts + 1,
            lastAttemptAt: Date.now(),
          });
        }
      });
      return next;
    });

    this.persist();
    if (errorCount > 0) {
      this.lastError.set(`${errorCount} sin sincronizar — reintentando`);
    }
    this.syncing.set(false);

    // eslint-disable-next-line no-console
    console.log('[sync] flush done · synced:', syncedCount, '· errors:', errorCount);

    // Si quedan entries no-synced (errors o re-edits durante sync), retry.
    const stillPending = [...this.store().values()].filter((e) => e.status !== 'synced').length;
    if (stillPending > 0) {
      const maxAttempts = Math.max(
        ...[...this.store().values()]
          .filter((e) => e.status !== 'synced')
          .map((e) => e.attempts),
        0,
      );
      const backoffMs = errorCount > 0
        ? Math.min(MAX_BACKOFF_MS, 2000 * Math.pow(2, Math.min(maxAttempts, 5)))
        : SYNC_DEBOUNCE_MS;
      this.syncTimer = setTimeout(() => {
        this.syncTimer = null;
        void this.flush();
      }, backoffMs);
    }
  }

  /** Dispatcher: traduce (kind, payload) a la mutation correspondiente.
   *  Promise<unknown> success → entry borrada. Throw → retry con backoff. */
  private async dispatch(entry: PendingEntry): Promise<void> {
    const p = entry.payload;
    let res: { errors?: ReadonlyArray<unknown> } | undefined;
    switch (entry.kind) {
      case 'pick': {
        // Payload trae homeTouched/awayTouched (para display) — el API
        // solo necesita los números. Default 0 si por algún motivo
        // un lado vino undefined.
        const home = (p['home'] as number) ?? 0;
        const away = (p['away'] as number) ?? 0;
        res = await this.api.upsertPick(entry.key, home, away);
        break;
      }
      case 'special': {
        res = await this.api.upsertSpecialPick(
          p['userId'] as string,
          p['type'] as 'CHAMPION' | 'RUNNER_UP' | 'DARK_HORSE',
          p['teamId'] as string,
          p['tournamentId'] as string,
          p['mode'] as 'SIMPLE' | 'COMPLETE',
        );
        break;
      }
      case 'bracket': {
        res = await this.api.upsertBracketPick(p as Parameters<ApiService['upsertBracketPick']>[0]);
        break;
      }
      case 'group-standing': {
        res = await this.api.upsertGroupStandingPick(p as Parameters<ApiService['upsertGroupStandingPick']>[0]);
        break;
      }
      case 'best-thirds': {
        res = await this.api.upsertBestThirdsPick(p as Parameters<ApiService['upsertBestThirdsPick']>[0]);
        break;
      }
    }
    if (res && Array.isArray(res.errors) && res.errors.length > 0) {
      throw new Error(`GraphQL: ${JSON.stringify(res.errors[0])}`);
    }
  }

  private persist() {
    try {
      const obj: Record<string, PendingEntry> = {};
      for (const [k, v] of this.store()) obj[k] = v;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(obj));
    } catch {
      /* localStorage full o disabled — degradación silenciosa */
    }
  }

  private load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const obj = JSON.parse(raw) as Record<string, PendingEntry>;
      const map = new Map<string, PendingEntry>();
      for (const [k, v] of Object.entries(obj)) map.set(k, v);
      this.store.set(map);
    } catch {
      /* corrupt — empezamos limpios */
    }
  }
}
