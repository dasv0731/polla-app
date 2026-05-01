import { Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { ApiService } from '../../core/api/api.service';
import { AuthService } from '../../core/auth/auth.service';
import { compareRankable } from '../../shared/util/tiebreakers';

const TOURNAMENT_ID = 'mundial-2026';

interface RankRow {
  userId: string;
  handle: string;
  points: number;
  exactCount: number;
  resultCount: number;
  /** Lista corta de grupos del usuario (para mostrar bajo el handle). null si no se cargó. */
  groupsLabel: string | null;
  /**
   * Delta de posición vs el snapshot anterior (positivo = subió, negativo = bajó).
   * null si no hay snapshot previo / aún no se ejecutó el job semanal.
   *
   * BACKEND TODO (ver comentario `RANK_SNAPSHOT_DESIGN` abajo).
   */
  deltaPosition: number | null;
}

type Scope = 'global' | 'mis-grupos';

/**
 * RANK_SNAPSHOT_DESIGN — pendiente de implementar en el backend.
 *
 * Para mostrar deltas (▲/▼ N) reales en el ranking necesitamos guardar
 * snapshots periódicos de la posición de cada usuario.
 *
 * Schema (modelo nuevo en `amplify/data/resource.ts`):
 *
 *   RankSnapshot: a.model({
 *     userId:       a.string().required(),
 *     tournamentId: a.string().required(),
 *     weekKey:      a.string().required(),   // ISO week, ej. "2026-W23"
 *     position:     a.integer().required(),
 *     points:       a.integer().required(),
 *     snapshotAt:   a.datetime().required(),
 *   })
 *   .identifier(['userId', 'tournamentId', 'weekKey'])
 *   .secondaryIndexes((idx) => [
 *     idx('tournamentId').sortKeys(['weekKey']).queryField('rankSnapshotsByWeek'),
 *   ])
 *   .authorization((allow) => [allow.authenticated().to(['read'])]);
 *
 * Job (lambda scheduled, ej. `amplify/functions/rank-snapshot-weekly/`):
 *
 *  - Trigger: EventBridge cron `cron(0 5 ? * MON *)` (lunes 00:00 ET).
 *  - Para cada torneo activo:
 *      1) listLeaderboard(tournamentId) ordenado.
 *      2) Para cada user: upsert RankSnapshot con position = índice + 1.
 *  - Idempotente vía PK compuesta (userId, tournamentId, weekKey).
 *
 * API (acá en `api.service.ts`):
 *
 *   getMyDelta(userId, tournamentId): última snapshot del user
 *     vs su posición actual. Devuelve `previousPosition - currentPosition`.
 *
 *   listDeltas(tournamentId, weekKey): para el render del ranking,
 *     trae todos los snapshots de la última semana en una sola query.
 *
 * Mientras esto no exista, el front-end usa un fallback de localStorage:
 * guarda la posición actual al cargar y la próxima vez calcula
 * `previousLocal - current` para mostrar tu delta personal. Para los
 * demás users el delta queda null hasta que el job esté en producción.
 */
const SNAPSHOT_KEY = (userId: string, scope: Scope) => `polla-rank-snapshot-${scope}-${userId}`;

@Component({
  standalone: true,
  selector: 'app-ranking',
  imports: [RouterLink],
  template: `
    <section class="page">

      <!-- Header (mobile: solo título; desktop: título izq + badge der) -->
      <header class="page__header">
        <div>
          <div class="kicker">MUNDIAL 2026 · {{ scopeLabelHeader() }}</div>
          <h1 class="page__title">Ranking</h1>
          <p class="text-sm text-mute" style="margin:4px 0 0;">
            {{ totalPlayers() }} jugadores · actualizado {{ updatedAgo() }}
          </p>
        </div>
        @if (myRank() !== null) {
          <div class="rank-pos-badge">
            <div class="kicker">TU POSICIÓN</div>
            <div class="num">#{{ myRank() }}</div>
            @let md = myDelta();
            @if (md !== null && md !== 0) {
              <div class="delta">
                {{ md > 0 ? '▲ subiste ' + md : '▼ bajaste ' + (-md) }}
                {{ Math.abs(md) === 1 ? 'puesto' : 'puestos' }}
              </div>
            } @else {
              <div class="delta">{{ scope() === 'global' ? 'Ranking global' : 'En tus grupos' }}</div>
            }
          </div>
        }
      </header>

      <!-- Hero card (mobile only) -->
      @if (myRank() !== null) {
        <div class="rank-hero">
          <div class="rank-hero__top">
            <div>
              <div class="rank-hero__kicker">Tu posición {{ scope() === 'global' ? 'global' : 'en tus grupos' }}</div>
              <div class="rank-hero__pos">#{{ myRank() }}</div>
              @let mdh = myDelta();
              @if (mdh !== null && mdh !== 0) {
                <div class="rank-hero__delta">
                  {{ mdh > 0 ? '▲ subiste ' + mdh : '▼ bajaste ' + (-mdh) }}
                  {{ Math.abs(mdh) === 1 ? 'puesto' : 'puestos' }} esta semana
                </div>
              }
            </div>
            <div class="rank-hero__pts">
              <div class="num">{{ myPoints() }}</div>
              <div class="lbl">pts</div>
            </div>
          </div>
          <div class="rank-hero__stats">
            <div>
              <span class="num">{{ myExacts() }}</span>
              <span class="lbl">exactos</span>
            </div>
            <div>
              <span class="num">{{ myResults() }}</span>
              <span class="lbl">resultados</span>
            </div>
            <span class="meta">de {{ totalPlayers() }}</span>
          </div>
        </div>
      }

      <!-- Filtros: Global / Mis grupos -->
      <div class="rank-filters">
        <div class="seg" role="tablist">
          <button type="button" class="seg__item"
                  [class.is-active]="scope() === 'global'"
                  (click)="setScope('global')">Global</button>
          <button type="button" class="seg__item"
                  [class.is-active]="scope() === 'mis-grupos'"
                  (click)="setScope('mis-grupos')">Mis grupos</button>
        </div>
      </div>

      @if (loading()) {
        <p class="loading-msg">Cargando ranking…</p>
      } @else if (currentList().length === 0) {
        <div class="empty-block">
          <h3>
            @if (scope() === 'mis-grupos') { Sin grupos privados }
            @else { Aún no hay datos de ranking }
          </h3>
          <p>
            @if (scope() === 'mis-grupos') {
              Únete a un grupo o crea uno para ver tu ranking interno.
            } @else {
              El ranking se actualiza cuando se publican los resultados de los partidos.
            }
          </p>
          @if (scope() === 'mis-grupos') {
            <a class="btn-wf btn-wf--primary" routerLink="/groups/new">Crear un grupo →</a>
          }
        </div>
      } @else {

        <!-- Podio top 3 -->
        @if (top3().length >= 3) {
          <section class="rank-podium-section">
            <h2 class="rank-podium-section__kicker">🏆 Top 3</h2>
            <div class="rank-podium">
              @let p2 = top3()[1];
              @let p1 = top3()[0];
              @let p3 = top3()[2];
              <!-- Plata -->
              <div class="rank-podium__card rank-podium__card--silver">
                <span class="medal">🥈</span>
                <span class="avatar">{{ initial(p2.handle) }}</span>
                <div class="handle">{{ '@' + p2.handle }}</div>
                <div class="group">{{ p2.groupsLabel ?? '' }}</div>
                <div class="pts">{{ p2.points }} pts</div>
              </div>
              <!-- Oro -->
              <div class="rank-podium__card rank-podium__card--gold">
                <span class="medal">🥇</span>
                <span class="avatar">{{ initial(p1.handle) }}</span>
                <div class="handle">{{ '@' + p1.handle }}</div>
                <div class="group">{{ p1.groupsLabel ?? '' }}</div>
                <div class="pts">{{ p1.points }} pts</div>
              </div>
              <!-- Bronce -->
              <div class="rank-podium__card rank-podium__card--bronze">
                <span class="medal">🥉</span>
                <span class="avatar">{{ initial(p3.handle) }}</span>
                <div class="handle">{{ '@' + p3.handle }}</div>
                <div class="group">{{ p3.groupsLabel ?? '' }}</div>
                <div class="pts">{{ p3.points }} pts</div>
              </div>
            </div>
          </section>
        }

        <!-- ============== MOBILE: secciones separadas ============== -->

        @if (nearMeRows().length > 0 && myRank() !== null) {
          <section class="rank-section rank-only-mobile">
            <div class="rank-section__head">
              <h2 class="rank-section__title">Cerca de ti</h2>
            </div>
            <div class="rank-list">
              @for (r of nearMeRows(); track r.userId) {
                <div class="rank-row" [class.is-me]="r.userId === currentUserId">
                  <div class="rank-row__pos">{{ positionOf(r) }}</div>
                  <div class="rank-row__avatar">{{ initial(r.handle) }}</div>
                  <div class="rank-row__body">
                    <div class="rank-row__top">
                      <span class="rank-row__handle">
                        {{ '@' + r.handle }}@if (r.userId === currentUserId) { <span class="text-mute"> · tú</span> }
                      </span>
                      @if (r.deltaPosition !== null && r.deltaPosition !== 0) {
                        <span class="rank-row__delta"
                              [class.rank-row__delta--up]="r.deltaPosition > 0"
                              [class.rank-row__delta--down]="r.deltaPosition < 0">
                          {{ r.deltaPosition > 0 ? '▲' + r.deltaPosition : '▼' + (-r.deltaPosition) }}
                        </span>
                      }
                    </div>
                    @if (r.groupsLabel) {
                      <div class="rank-row__group">{{ r.groupsLabel }}</div>
                    }
                  </div>
                  <div class="rank-row__pts">
                    <div class="num">{{ r.points }}</div>
                    <div class="lbl">pts</div>
                  </div>
                </div>
              }
            </div>
          </section>
        }

        <section class="rank-section rank-only-mobile">
          <div class="rank-section__head">
            <h2 class="rank-section__title">Top general</h2>
            @if (mobileTopVisibleCount() < currentList().length) {
              <button type="button" class="rank-section__link"
                      (click)="loadMoreMobile()">Ver más →</button>
            }
          </div>
          <div class="rank-list">
            @for (r of mobileTopRows(); track r.userId; let i = $index) {
              <div class="rank-row" [class.is-me]="r.userId === currentUserId">
                <div class="rank-row__pos"
                     [class.rank-row__pos--medal]="i < 3">
                  {{ i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : (i + 1) }}
                </div>
                <div class="rank-row__avatar">{{ initial(r.handle) }}</div>
                <div class="rank-row__body">
                  <div class="rank-row__top">
                    <span class="rank-row__handle">{{ '@' + r.handle }}</span>
                    @if (r.deltaPosition !== null && r.deltaPosition !== 0) {
                      <span class="rank-row__delta"
                            [class.rank-row__delta--up]="r.deltaPosition > 0"
                            [class.rank-row__delta--down]="r.deltaPosition < 0">
                        {{ r.deltaPosition > 0 ? '▲' + r.deltaPosition : '▼' + (-r.deltaPosition) }}
                      </span>
                    }
                  </div>
                  @if (r.groupsLabel) {
                    <div class="rank-row__group">{{ r.groupsLabel }}</div>
                  }
                </div>
                <div class="rank-row__pts">
                  <div class="num">{{ r.points }}</div>
                  <div class="lbl">pts</div>
                </div>
              </div>
            }
          </div>
        </section>

        <!-- ============== DESKTOP: tabla completa ============== -->

        <div class="rank-table-wrap rank-only-desk">
          <table class="rank-table-full">
            <thead>
              <tr>
                <th>#</th>
                <th>Jugador</th>
                <th class="center">Pts</th>
                <th class="center">Exactos</th>
                <th class="center">Result.</th>
              </tr>
            </thead>
            <tbody>
              <!-- Top 7 -->
              @for (r of desktopTopRows(); track r.userId; let i = $index) {
                <tr [class.top3]="i < 3" [class.is-me]="r.userId === currentUserId">
                  <td>
                    <div class="rank-table-full__pos-content">
                      @if (i < 3) {
                        <span class="medal">{{ i === 0 ? '🥇' : i === 1 ? '🥈' : '🥉' }}</span>
                      } @else {
                        <span class="num">{{ i + 1 }}</span>
                      }
                      @if (r.deltaPosition !== null && r.deltaPosition !== 0) {
                        <span class="delta"
                              [class.delta--up]="r.deltaPosition > 0"
                              [class.delta--down]="r.deltaPosition < 0">
                          {{ r.deltaPosition > 0 ? '▲' + r.deltaPosition : '▼' + (-r.deltaPosition) }}
                        </span>
                      }
                    </div>
                  </td>
                  <td>
                    <div class="rank-table-full__player">
                      <span class="av">{{ initial(r.handle) }}</span>
                      <div>
                        <div class="name">
                          {{ '@' + r.handle }}@if (r.userId === currentUserId) { <span class="you"> · tú</span> }
                        </div>
                        @if (r.groupsLabel) {
                          <div class="group">{{ r.groupsLabel }}</div>
                        }
                      </div>
                    </div>
                  </td>
                  <td class="pts-cell">{{ r.points }}</td>
                  <td class="num-cell">{{ r.exactCount }}</td>
                  <td class="num-cell">{{ r.resultCount }}</td>
                </tr>
              }

              @if (showGapRow()) {
                <tr class="gap-row">
                  <td colspan="5">· · · {{ gapCount() }} jugadores más · · ·</td>
                </tr>
              }

              <!-- Posiciones cercanas a ti (desktop) -->
              @if (myRank() !== null && !meInTop7()) {
                @for (r of desktopNearMeRows(); track r.userId) {
                  <tr [class.is-me]="r.userId === currentUserId">
                    <td>
                      <div class="rank-table-full__pos-content">
                        <span class="num">{{ positionOf(r) }}</span>
                        @if (r.deltaPosition !== null && r.deltaPosition !== 0) {
                          <span class="delta"
                                [class.delta--up]="r.deltaPosition > 0"
                                [class.delta--down]="r.deltaPosition < 0">
                            {{ r.deltaPosition > 0 ? '▲' + r.deltaPosition : '▼' + (-r.deltaPosition) }}
                          </span>
                        }
                      </div>
                    </td>
                    <td>
                      <div class="rank-table-full__player">
                        <span class="av">{{ initial(r.handle) }}</span>
                        <div>
                          <div class="name">
                            {{ '@' + r.handle }}@if (r.userId === currentUserId) { <span class="you"> · tú</span> }
                          </div>
                          @if (r.groupsLabel) {
                            <div class="group">{{ r.groupsLabel }}</div>
                          }
                        </div>
                      </div>
                    </td>
                    <td class="pts-cell">{{ r.points }}</td>
                    <td class="num-cell">{{ r.exactCount }}</td>
                    <td class="num-cell">{{ r.resultCount }}</td>
                  </tr>
                }
              }
            </tbody>
          </table>
          <div class="rank-table-foot">
            <span>
              Mostrando 1–{{ desktopTopRows().length }}
              @if (myRank() !== null && !meInTop7()) { + posiciones cercanas a ti }
              · {{ totalPlayers() }} total
            </span>
            <div class="rank-table-foot__pagi">
              <button type="button" class="btn-wf btn-wf--sm"
                      (click)="scrollToTop()">Ir al top →</button>
            </div>
          </div>
        </div>

      }

    </section>
  `,
  styles: [`
    :host { display: block; }

    .empty-block {
      padding: 24px;
      text-align: center;
      background: var(--wf-paper);
      border: 1px dashed var(--wf-line);
      border-radius: 10px;
    }
    .empty-block h3 {
      font-family: var(--wf-display);
      font-size: 18px;
      letter-spacing: .04em;
      margin: 0 0 8px;
    }
    .empty-block p {
      color: var(--wf-ink-3);
      font-size: 13px;
      margin: 0 0 12px;
      line-height: 1.5;
    }
    .loading-msg {
      padding: 32px;
      text-align: center;
      color: var(--wf-ink-3);
      font-size: 14px;
    }
  `],
})
export class RankingComponent implements OnInit, OnDestroy {
  private api = inject(ApiService);
  private auth = inject(AuthService);
  private route = inject(ActivatedRoute);

  /** Math expuesto al template para Math.abs() en pluralización de deltas. */
  protected readonly Math = Math;

  scope = signal<Scope>('global');
  loading = signal(true);
  loadedAt = signal<number>(Date.now());

  /** Snapshot local "última vez que vi mi posición". Se hidrata en
   *  ngOnInit y se persiste cuando se cambia de scope o al destruir.
   *  Solo es fallback hasta que el job de RankSnapshot esté en producción. */
  private localSnapshot = signal<Map<Scope, number>>(new Map());

  global = signal<RankRow[]>([]);
  /** Unión deduplicada de los miembros de todos los grupos del usuario,
   *  ordenada por puntos. */
  misGruposList = signal<RankRow[]>([]);

  currentUserId = '';
  currentHandle = signal<string | null>(null);

  /** Mobile "Top general": cuántas filas mostrar inicialmente / al expandir. */
  mobileTopVisibleCount = signal(5);

  // ---------- Lista activa según scope ----------
  currentList = computed<RankRow[]>(() => {
    return this.scope() === 'mis-grupos' ? this.misGruposList() : this.global();
  });

  totalPlayers = computed(() => this.currentList().length);

  myRank = computed<number | null>(() => {
    const i = this.currentList().findIndex((r) => r.userId === this.currentUserId);
    return i >= 0 ? i + 1 : null;
  });
  myRow = computed<RankRow | null>(() =>
    this.currentList().find((r) => r.userId === this.currentUserId) ?? null,
  );
  myPoints = computed(() => this.myRow()?.points ?? 0);
  myExacts = computed(() => this.myRow()?.exactCount ?? 0);
  myResults = computed(() => this.myRow()?.resultCount ?? 0);

  /**
   * Delta de mi posición: prefiere el campo `deltaPosition` que viene del
   * row (cuando el backend de RankSnapshot esté listo) y cae al snapshot
   * de localStorage como fallback.
   */
  myDelta = computed<number | null>(() => {
    const me = this.myRow();
    if (!me) return null;
    if (me.deltaPosition !== null) return me.deltaPosition;
    const previous = this.localSnapshot().get(this.scope());
    const current = this.myRank();
    if (previous == null || current == null) return null;
    return previous - current;  // positivo = subió (rank menor)
  });

  top3 = computed<RankRow[]>(() => this.currentList().slice(0, 3));

  /** Top 7 para la tabla desktop. */
  desktopTopRows = computed<RankRow[]>(() => this.currentList().slice(0, 7));

  meInTop7 = computed(() => {
    const r = this.myRank();
    return r !== null && r <= 7;
  });

  /** Para la lista mobile "Top general": top N (con expansión vía botón). */
  mobileTopRows = computed<RankRow[]>(() =>
    this.currentList().slice(0, this.mobileTopVisibleCount()),
  );

  /** "Cerca de ti": 2 antes y 2 después de mi posición. */
  nearMeRows = computed<RankRow[]>(() => {
    const list = this.currentList();
    const rank = this.myRank();
    if (!rank) return [];
    const myIdx = rank - 1;
    const start = Math.max(0, myIdx - 2);
    const end = Math.min(list.length, myIdx + 3);
    return list.slice(start, end);
  });

  /** Para la tabla desktop: nearby después del top 7. */
  desktopNearMeRows = computed<RankRow[]>(() => {
    const list = this.currentList();
    const rank = this.myRank();
    if (!rank || rank <= 7) return [];
    const myIdx = rank - 1;
    const start = Math.max(7, myIdx - 1);
    const end = Math.min(list.length, myIdx + 2);
    return list.slice(start, end);
  });

  /** Mostrar la fila "gap" entre top 7 y cerca-de-ti si hay distancia. */
  showGapRow = computed(() => {
    const rank = this.myRank();
    if (!rank || rank <= 7) return false;
    return rank - 7 > 1;
  });

  gapCount = computed(() => {
    const rank = this.myRank();
    if (!rank) return 0;
    const start = Math.max(7, rank - 1 - 1);
    return Math.max(0, start - 7);
  });

  updatedAgo = computed(() => {
    const minutes = Math.max(1, Math.floor((Date.now() - this.loadedAt()) / 60_000));
    return minutes < 60 ? `hace ${minutes} min` : `hace ${Math.floor(minutes / 60)} h`;
  });

  scopeLabelHeader = computed(() =>
    this.scope() === 'mis-grupos' ? 'EN TUS GRUPOS' : 'TODOS LOS JUGADORES',
  );

  initial(handle: string): string {
    return (handle?.[0] ?? '?').toUpperCase();
  }

  positionOf(r: RankRow): number {
    const idx = this.currentList().findIndex((x) => x.userId === r.userId);
    return idx >= 0 ? idx + 1 : 0;
  }

  loadMoreMobile() {
    this.mobileTopVisibleCount.update((n) => Math.min(n + 10, this.currentList().length));
  }

  scrollToTop() {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  /** Cambio de scope: persiste el snapshot del scope actual antes de saltar. */
  setScope(s: Scope) {
    if (this.scope() === s) return;
    this.persistMySnapshot();
    this.scope.set(s);
    this.mobileTopVisibleCount.set(5);
  }

  /** Guarda mi posición actual en localStorage para que la próxima visita
   *  pueda calcular el delta. Solo hasta que RankSnapshot esté en backend. */
  private persistMySnapshot() {
    if (!this.currentUserId) return;
    const rank = this.myRank();
    if (rank == null) return;
    try {
      localStorage.setItem(SNAPSHOT_KEY(this.currentUserId, this.scope()), String(rank));
    } catch { /* localStorage full / disabled */ }
  }

  /** Hidrata el snapshot local desde localStorage al montar. */
  private hydrateLocalSnapshots() {
    if (!this.currentUserId) return;
    const map = new Map<Scope, number>();
    for (const s of ['global', 'mis-grupos'] as Scope[]) {
      try {
        const raw = localStorage.getItem(SNAPSHOT_KEY(this.currentUserId, s));
        if (raw) {
          const n = parseInt(raw, 10);
          if (!Number.isNaN(n)) map.set(s, n);
        }
      } catch { /* ignore */ }
    }
    this.localSnapshot.set(map);
  }

  async ngOnInit() {
    this.currentUserId = this.auth.user()?.sub ?? '';
    this.currentHandle.set(this.auth.user()?.handle ?? null);
    this.hydrateLocalSnapshots();

    const qpScope = this.route.snapshot.queryParamMap.get('scope');
    if (qpScope === 'global' || qpScope === 'mis-grupos') {
      this.scope.set(qpScope as Scope);
    } else if (qpScope === 'grupos') {
      this.scope.set('mis-grupos');
    }

    try {
      const lb = await this.api.listLeaderboard(TOURNAMENT_ID, 500);
      const sorted = [...(lb.data ?? [])].sort(compareRankable);

      // Resolver handles en paralelo (cap a 1 fetch por usuario).
      const handles = new Map<string, string>();
      await Promise.all(
        sorted.map(async (t) => {
          const u = await this.api.getUser(t.userId);
          handles.set(t.userId, u.data?.handle ?? t.userId.slice(0, 6));
        }),
      );

      const globalRows: RankRow[] = sorted.map((t) => ({
        userId: t.userId,
        handle: handles.get(t.userId) ?? t.userId.slice(0, 6),
        points: t.points ?? 0,
        exactCount: t.exactCount ?? 0,
        resultCount: t.resultCount ?? 0,
        groupsLabel: null,
        // BACKEND TODO (RANK_SNAPSHOT_DESIGN): cuando RankSnapshot esté
        // poblado, plug-in acá `previousPosition - currentPosition` por user.
        // Mientras tanto null → el front cae al fallback localStorage para
        // el delta del usuario actual (los demás quedan sin delta).
        deltaPosition: null,
      }));
      this.global.set(globalRows);

      // Mis grupos: pulla los miembros de los grupos del user,
      // crea unión deduplicada, etiqueta cada user con sus grupos.
      if (this.currentUserId) {
        await this.loadMisGruposList(globalRows);
      }
    } finally {
      this.loading.set(false);
      this.loadedAt.set(Date.now());
    }
  }

  ngOnDestroy() {
    // Persistir mi posición al salir de la página: queda disponible para
    // calcular el delta vs próxima visita. Funciona mientras no haya
    // backend de RankSnapshot.
    this.persistMySnapshot();
  }

  private async loadMisGruposList(globalRows: RankRow[]) {
    try {
      const memberships = await this.api.myGroups(this.currentUserId);
      const myGroupIds = (memberships.data ?? []).map((m: { groupId: string }) => m.groupId);
      if (myGroupIds.length === 0) {
        this.misGruposList.set([]);
        return;
      }

      // Por cada grupo, traer miembros + nombre del grupo.
      const groupNamesById = new Map<string, string>();
      const userToGroupNames = new Map<string, Set<string>>();

      await Promise.all(
        myGroupIds.map(async (gid: string) => {
          const [grp, members] = await Promise.all([
            this.api.getGroup(gid),
            this.api.groupMembers(gid),
          ]);
          if (grp.data) groupNamesById.set(gid, grp.data.name);
          for (const mem of (members.data ?? []) as Array<{ userId: string }>) {
            const set = userToGroupNames.get(mem.userId) ?? new Set<string>();
            if (grp.data) set.add(grp.data.name);
            userToGroupNames.set(mem.userId, set);
          }
        }),
      );

      const globalById = new Map(globalRows.map((r) => [r.userId, r]));
      const merged: RankRow[] = [];
      for (const [userId, names] of userToGroupNames.entries()) {
        const base = globalById.get(userId);
        const groupsLabel = [...names].slice(0, 3).join(' · ');
        if (base) {
          merged.push({ ...base, groupsLabel });
        } else {
          // User en grupo pero sin total registrado todavía (0 pts).
          merged.push({
            userId,
            handle: userId.slice(0, 6),
            points: 0,
            exactCount: 0,
            resultCount: 0,
            groupsLabel,
            deltaPosition: null,
          });
        }
      }
      merged.sort((a, b) => b.points - a.points);
      this.misGruposList.set(merged);

      // Para los rows globales que están en mis grupos, también seteamos label.
      const updated = this.global().map((r) => {
        const names = userToGroupNames.get(r.userId);
        if (!names) return r;
        return { ...r, groupsLabel: [...names].slice(0, 3).join(' · ') };
      });
      this.global.set(updated);
    } catch {
      // Best-effort — si falla, "Mis grupos" queda vacío y muestra empty-block.
      this.misGruposList.set([]);
    }
  }
}
