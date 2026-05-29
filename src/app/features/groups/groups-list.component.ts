import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../core/api/api.service';
import { AuthService } from '../../core/auth/auth.service';
import { compareRankable } from '../../shared/util/tiebreakers';
import { GroupActionsService } from '../../core/groups/group-actions.service';
import { EmptyBlockComponent } from '../../shared/ui/empty-block/empty-block.component';
import { SkeletonComponent } from '../../shared/ui/skeleton/skeleton.component';
import { IconComponent } from '../../shared/ui/icon/icon.component';
import { getUrl } from 'aws-amplify/storage';

type GameMode = 'SIMPLE' | 'COMPLETE';

type SortKey = 'lastActivity' | 'myRank' | 'memberCount' | 'created' | 'name';
type ModeFilter = 'all' | 'COMPLETE' | 'SIMPLE';

interface GroupRow {
  id: string;
  name: string;
  members: number;
  myRank: number | null;
  myTotalPts: number;
  isAdmin: boolean;
  adminHandle: string | null;
  createdAt: string;
  /** Timestamp más reciente de actividad inferida (last leaderboard updatedAt). */
  lastActivity: string | null;
  mode: GameMode;
  comodinesEnabled: boolean;
  /** Storage key del logo. null si no hay. URL signed se resuelve en
   *  imageUrl signal map. */
  imageKey: string | null;
}

@Component({
  standalone: true,
  selector: 'app-groups-list',
  imports: [RouterLink, FormsModule, EmptyBlockComponent, SkeletonComponent, IconComponent],
  template: `
    <section class="page">
      <header class="page__header" style="margin-bottom:18px;">
        <div>
          <div class="kicker">{{ countLabel() }} · MUNDIAL 2026</div>
          <h1 class="page__title">Mis grupos</h1>
        </div>
      </header>

      <!-- Acciones (crear / unirme): visibles solo en mobile.
           Desktop tiene los mismos botones en el sidebar. Ambos disparan
           los mismos modales globales vía GroupActionsService. -->
      <div class="groups-list-actions">
        <button type="button" class="btn-wf btn-wf--primary"
                (click)="actions.openCreate()">
          + Crear grupo
        </button>
        <button type="button" class="btn-wf"
                (click)="actions.openJoin()">
          → Unirme con código
        </button>
      </div>

      @if (loading()) {
        <!-- Skeleton cards mientras cargamos memberships + leaderboards.
             Reemplaza el "Cargando…" plain text (G11 cross-cutting). -->
        <div class="groups-list">
          <app-skeleton variant="card" [count]="3" />
        </div>
      } @else if (groups().length === 0) {
        <!-- Bug #7 fix: design v3 oculta los topnav buttons en desktop, así que
             un first-time user no veía dónde crear/unirse. Reemplazamos el
             texto "Usa los botones de arriba" con CTAs explícitos visibles
             siempre vía <app-empty-block>. -->
        <app-empty-block
          iconName="users"
          title="Sin grupos"
          sub="Crea uno o únete con un código para empezar a competir con tus panas.">
          <button class="btn-wf btn-wf--primary" type="button"
                  (click)="actions.openCreate()">
            + Crear grupo
          </button>
          <button class="btn-wf" type="button"
                  (click)="actions.openJoin()">
            → Unirme con código
          </button>
        </app-empty-block>
      } @else {
        <!-- TODO(A6): backend lambda myGroupsWithStats reemplazaría el fan-out
             N+1 (getGroup + groupMembers + groupLeaderboard por cada
             membership). En el meantime cacheamos en el client. -->

        <!-- Controls: sort + search (>5) + mode filter (mixed modes).
             Aparecen solo si hacen falta para evitar clutter en el caso
             típico (1-3 grupos). -->
        @if (showControls()) {
          <div class="groups-list__controls">
            @if (showSearch()) {
              <label class="groups-list__search">
                <app-icon name="search" size="sm" decorative />
                <input
                  type="search"
                  placeholder="Buscar grupo…"
                  [ngModel]="search()"
                  (ngModelChange)="search.set($event)"
                  aria-label="Buscar grupo por nombre"
                />
              </label>
            }
            <label class="groups-list__sort">
              <span class="visually-hidden">Ordenar por</span>
              <select
                [ngModel]="sortKey()"
                (ngModelChange)="sortKey.set($event)"
                aria-label="Ordenar grupos">
                <option value="lastActivity">Actividad reciente</option>
                <option value="myRank">Mi posición</option>
                <option value="memberCount">Más miembros</option>
                <option value="created">Más recientes</option>
                <option value="name">Nombre (A-Z)</option>
              </select>
            </label>
            @if (showModeFilter()) {
              <div class="groups-list__mode-filter" role="group" aria-label="Filtrar por modo">
                <button type="button"
                        [attr.aria-pressed]="modeFilter() === 'all'"
                        (click)="modeFilter.set('all')">
                  Todos
                </button>
                <button type="button"
                        [attr.aria-pressed]="modeFilter() === 'COMPLETE'"
                        (click)="modeFilter.set('COMPLETE')">
                  Completo
                </button>
                <button type="button"
                        [attr.aria-pressed]="modeFilter() === 'SIMPLE'"
                        (click)="modeFilter.set('SIMPLE')">
                  Simple
                </button>
              </div>
            }
          </div>
        }

        @if (visibleGroups().length === 0) {
          <app-empty-block
            iconName="search"
            title="Sin coincidencias"
            sub="Probá con otro término o ajustá el filtro." />
        } @else {
          <div class="groups-list">
            @for (g of visibleGroups(); track g.id) {
              <a class="group-card" [routerLink]="['/groups', g.id]">
                @if (imageUrls()[g.id]) {
                  <img class="group-card__icon group-card__icon--image"
                       [src]="imageUrls()[g.id]!" alt=""
                       [attr.aria-label]="g.isAdmin ? 'Admin del grupo' : 'Miembro'">
                } @else {
                  <span class="group-card__icon" [class.group-card__icon--admin]="g.isAdmin"
                        [attr.aria-label]="g.isAdmin ? 'Admin del grupo' : 'Miembro'">
                    {{ icon(g) }}
                  </span>
                }
                <div class="group-card__body">
                  <div class="group-card__name-row">
                    <span class="group-card__name">{{ g.name }}</span>
                    <span class="pill"
                          [class.pill--green]="g.mode === 'COMPLETE'"
                          [class.pill--warn]="g.mode !== 'COMPLETE'">
                      {{ g.mode === 'COMPLETE' ? 'Completo' : 'Simple' }}
                    </span>
                    @if (g.mode === 'COMPLETE' && g.comodinesEnabled) {
                      <span class="pill pill--comodines" title="Comodines habilitados">
                        Comodines
                      </span>
                    }
                  </div>
                  <div class="group-card__meta">
                    {{ g.members }} {{ g.members === 1 ? 'miembro' : 'miembros' }}
                    @if (g.isAdmin) { · Eres <strong>admin</strong> }
                    @else if (g.adminHandle) { · creado por <strong>{{ '@' + g.adminHandle }}</strong> }
                  </div>
                  <div class="group-card__meta group-card__meta--secondary">
                    <span class="group-card__pts">{{ g.myTotalPts }} pts</span>
                    @if (g.lastActivity) {
                      · Activo {{ relativeTime(g.lastActivity) }}
                    } @else if (g.createdAt) {
                      · creado el {{ formatDate(g.createdAt) }}
                    }
                  </div>
                </div>
                <div class="group-card__pos">
                  <div class="num">
                    @if (g.myRank !== null) {
                      #{{ g.myRank }}
                    } @else {
                      <span class="group-card__pos-skeleton" aria-hidden="true">·</span>
                    }
                  </div>
                  <div class="lbl">de {{ g.members }}</div>
                </div>
              </a>
            }
          </div>
        }
      }
    </section>
  `,
  styles: [`
    :host { display: block; }

    .visually-hidden {
      position: absolute;
      width: 1px; height: 1px;
      padding: 0; margin: -1px;
      overflow: hidden; clip: rect(0, 0, 0, 0);
      white-space: nowrap; border: 0;
    }

    /* Acciones para mobile (en desktop quedan ocultas: el sidebar
       ya tiene los mismos botones en "Mis grupos"). */
    .groups-list-actions {
      display: flex;
      flex-direction: column;
      gap: 8px;
      margin-bottom: 18px;
    }
    .groups-list-actions .btn-wf { width: 100%; justify-content: center; }
    @media (min-width: 992px) {
      .groups-list-actions { display: none; }
    }

    .groups-list__controls {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
      margin-bottom: 14px;
      align-items: center;
    }
    .groups-list__search {
      display: flex;
      align-items: center;
      gap: 8px;
      flex: 1 1 200px;
      min-width: 0;
      background: var(--wf-paper);
      border: 1px solid var(--wf-line);
      border-radius: 8px;
      padding: 8px 12px;
    }
    .groups-list__search input {
      flex: 1;
      border: 0;
      background: transparent;
      outline: none;
      font: inherit;
      color: inherit;
      min-width: 0;
    }
    .groups-list__sort select {
      background: var(--wf-paper);
      border: 1px solid var(--wf-line);
      border-radius: 8px;
      padding: 8px 12px;
      font: inherit;
      color: inherit;
    }
    .groups-list__mode-filter {
      display: inline-flex;
      border: 1px solid var(--wf-line);
      border-radius: 8px;
      overflow: hidden;
    }
    .groups-list__mode-filter button {
      background: var(--wf-paper);
      border: 0;
      padding: 8px 12px;
      font: inherit;
      cursor: pointer;
      color: var(--wf-ink-3);
      min-height: var(--hit-target-min, 44px);
    }
    .groups-list__mode-filter button + button { border-left: 1px solid var(--wf-line); }
    .groups-list__mode-filter button[aria-pressed="true"] {
      background: var(--wf-green-soft);
      color: var(--wf-green-ink);
      font-weight: 600;
    }

    .groups-list {
      display: flex;
      flex-direction: column;
      gap: 10px;
    }
    .group-card {
      display: flex;
      align-items: center;
      gap: 14px;
      padding: 14px 16px;
      background: var(--wf-paper);
      border: 1px solid var(--wf-line);
      border-radius: 10px;
      text-decoration: none;
      color: inherit;
      transition: border-color .15s, box-shadow .15s;
    }
    .group-card:hover {
      border-color: var(--wf-green);
      box-shadow: 0 4px 14px rgba(0, 200, 100, .08);
    }
    .group-card__icon {
      width: 40px; height: 40px;
      border-radius: 8px;
      background: var(--wf-fill);
      display: flex; align-items: center; justify-content: center;
      font-family: var(--wf-display);
      font-size: 18px;
      flex-shrink: 0;
    }
    .group-card__icon--admin {
      background: var(--wf-green-soft);
      color: var(--wf-green-ink);
    }
    .group-card__icon--image {
      object-fit: cover;
      background: transparent;
      padding: 0;
    }
    .group-card__body { flex: 1; min-width: 0; }
    .group-card__name-row {
      display: flex;
      align-items: center;
      gap: 8px;
      flex-wrap: wrap;
    }
    .group-card__name {
      font-family: var(--wf-display);
      font-size: 18px;
      letter-spacing: .03em;
    }
    .pill--comodines {
      background: var(--wf-purple-soft, #eee8ff);
      color: var(--wf-purple-ink, #5a40b0);
      border: 1px solid var(--wf-purple-line, #d6c8ff);
    }
    .group-card__meta {
      font-size: 12px;
      color: var(--wf-ink-3);
      margin-top: 4px;
      line-height: 1.5;
    }
    .group-card__meta--secondary { font-size: 11px; opacity: 0.85; }
    .group-card__pts {
      font-family: var(--wf-display);
      color: var(--wf-ink-1);
    }
    .group-card__pos {
      text-align: center;
      flex-shrink: 0;
      min-width: 60px;
    }
    .group-card__pos .num {
      font-family: var(--wf-display);
      font-size: 22px;
      line-height: 1;
    }
    .group-card__pos-skeleton {
      display: inline-block;
      width: 28px; height: 22px;
      background: rgba(0,0,0,.06);
      border-radius: 4px;
      vertical-align: middle;
    }
    .group-card__pos .lbl {
      font-size: 10px;
      color: var(--wf-ink-3);
      text-transform: uppercase;
      letter-spacing: .06em;
      margin-top: 2px;
    }
  `],
})
export class GroupsListComponent implements OnInit {
  private api = inject(ApiService);
  private auth = inject(AuthService);
  actions = inject(GroupActionsService);

  groups = signal<GroupRow[]>([]);
  /** Map de groupId → signed URL del logo. Se popula async post-load
   *  para no bloquear el render de la lista. */
  imageUrls = signal<Record<string, string>>({});
  loading = signal(true);

  // Controls
  search = signal('');
  sortKey = signal<SortKey>('lastActivity');
  modeFilter = signal<ModeFilter>('all');

  countLabel = computed(() => {
    const n = this.groups().length;
    if (n === 0) return 'Aún no estás en ningún grupo';
    return n === 1 ? '1 grupo activo' : `${n} grupos activos`;
  });

  // Mostramos controles desde el grupo 4+; debajo de eso no aportan.
  showControls = computed(() => this.groups().length >= 4);
  showSearch = computed(() => this.groups().length > 5);
  showModeFilter = computed(() => {
    const modes = new Set(this.groups().map((g) => g.mode));
    return modes.size > 1;
  });

  visibleGroups = computed(() => {
    const q = this.search().trim().toLowerCase();
    const filter = this.modeFilter();
    const key = this.sortKey();
    const filtered = this.groups()
      .filter((g) => filter === 'all' || g.mode === filter)
      .filter((g) => !q || g.name.toLowerCase().includes(q));

    const sorted = [...filtered];
    switch (key) {
      case 'lastActivity':
        sorted.sort((a, b) =>
          (b.lastActivity ?? b.createdAt ?? '').localeCompare(a.lastActivity ?? a.createdAt ?? ''),
        );
        break;
      case 'myRank':
        // Nulls al final
        sorted.sort((a, b) => {
          if (a.myRank === null && b.myRank === null) return 0;
          if (a.myRank === null) return 1;
          if (b.myRank === null) return -1;
          return a.myRank - b.myRank;
        });
        break;
      case 'memberCount':
        sorted.sort((a, b) => b.members - a.members);
        break;
      case 'created':
        sorted.sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''));
        break;
      case 'name':
      default:
        sorted.sort((a, b) => a.name.localeCompare(b.name));
        break;
    }
    return sorted;
  });

  async ngOnInit() {
    const userId = this.auth.user()?.sub;
    if (!userId) {
      this.loading.set(false);
      return;
    }
    try {
      // TODO(A6): reemplazar este fan-out N+1 con un endpoint
      // `myGroupsWithStats(userId)` que devuelva membership + group + members count +
      // myRank + myTotalPts + lastActivity en una sola call.
      const memberships = (await this.api.myGroups(userId)).data ?? [];
      const enriched = await Promise.all(
        memberships.map(async (m): Promise<GroupRow | null> => {
          const [grp, members, lb] = await Promise.all([
            this.api.getGroup(m.groupId),
            this.api.groupMembers(m.groupId),
            this.api.groupLeaderboard(m.groupId),
          ]);
          if (!grp.data) return null;
          // Sort §8 — mismo comparator que /ranking para que la posición
          // que mostramos acá coincida con la que el user ve adentro.
          const lbData = lb.data ?? [];
          const sorted = [...lbData].sort(compareRankable);
          const myRank = sorted.findIndex((t) => t.userId === userId);
          const myRow = lbData.find((t) => t.userId === userId);
          const isAdmin = grp.data.adminUserId === userId;

          let adminHandle: string | null = null;
          if (!isAdmin) {
            try {
              const owner = await this.api.getUser(grp.data.adminUserId);
              adminHandle = owner.data?.handle ?? null;
            } catch {
              // ignore
            }
          }

          // Actividad reciente = max(updatedAt) sobre las rows del leaderboard.
          // Es aproximación: refleja último scoring corrido en este grupo.
          let lastActivity: string | null = null;
          for (const r of lbData) {
            const ts = (r as { updatedAt?: string | null }).updatedAt ?? null;
            if (ts && (lastActivity === null || ts > lastActivity)) {
              lastActivity = ts;
            }
          }

          return {
            id: m.groupId,
            name: grp.data.name,
            members: (members.data ?? []).length,
            myRank: myRank >= 0 ? myRank + 1 : null,
            myTotalPts: (myRow?.points as number | undefined) ?? 0,
            isAdmin,
            adminHandle,
            createdAt: grp.data.createdAt,
            lastActivity,
            mode: ((grp.data.mode as GameMode | null | undefined) ?? 'COMPLETE'),
            comodinesEnabled: (grp.data as { comodinesEnabled?: boolean | null }).comodinesEnabled === true,
            imageKey: (grp.data as { imageKey?: string | null }).imageKey ?? null,
          };
        }),
      );
      const rows = enriched.filter((x): x is GroupRow => x !== null);
      this.groups.set(rows);
      // Resolver signed URLs en background. Cada uno es independiente,
      // así si una falla las otras siguen.
      void this.resolveImageUrls(rows);
    } finally {
      this.loading.set(false);
    }
  }

  private async resolveImageUrls(rows: readonly GroupRow[]) {
    for (const r of rows) {
      if (!r.imageKey) continue;
      try {
        const out = await getUrl({ path: r.imageKey, options: { expiresIn: 3600 } });
        this.imageUrls.update((m) => ({ ...m, [r.id]: out.url.toString() }));
      } catch {
        /* skip — fallback a inicial */
      }
    }
  }

  icon(g: GroupRow): string {
    if (g.isAdmin) return '★';
    return (g.name[0] ?? '·').toUpperCase();
  }

  formatDate(iso: string): string {
    try {
      return new Date(iso).toLocaleDateString('es-EC', { day: '2-digit', month: 'short' });
    } catch {
      return '—';
    }
  }

  /** "hace 2 días", "hace 4 h", "hoy". Aproximación, no precisión clock. */
  relativeTime(iso: string): string {
    try {
      const then = new Date(iso).getTime();
      const now = Date.now();
      const diffMs = Math.max(0, now - then);
      const min = Math.floor(diffMs / 60000);
      if (min < 1) return 'ahora';
      if (min < 60) return `hace ${min} min`;
      const hours = Math.floor(min / 60);
      if (hours < 24) return `hace ${hours} h`;
      const days = Math.floor(hours / 24);
      if (days < 7) return `hace ${days} d`;
      const weeks = Math.floor(days / 7);
      if (weeks < 5) return `hace ${weeks} sem`;
      const months = Math.floor(days / 30);
      return `hace ${months} mes${months === 1 ? '' : 'es'}`;
    } catch {
      return '—';
    }
  }
}
