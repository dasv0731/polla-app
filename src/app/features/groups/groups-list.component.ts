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
  prize1st: string | null;
  prize2nd: string | null;
  prize3rd: string | null;
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

      @if (loading()) {
        <div class="gh-cards">
          <app-skeleton variant="card" [count]="3" />
        </div>
      } @else if (groups().length === 0) {
        <app-empty-block
          iconName="users"
          title="Sin grupos"
          sub="Crea uno o únete con un código para empezar a competir con tus amigos.">
          <button class="btn-wf btn-wf--primary" type="button" (click)="actions.openCreate()">
            + Crear grupo
          </button>
          <button class="btn-wf" type="button" (click)="actions.openJoin()">
            → Unirme con código
          </button>
        </app-empty-block>
      } @else {
        <!-- TODO(A6): backend lambda myGroupsWithStats reemplazaría el fan-out
             N+1 (getGroup + groupMembers + groupLeaderboard por cada membership). -->

        <!-- Controls: sort + search (>5) + mode filter (mixed modes).
             Aparecen solo si hacen falta para evitar clutter (1-3 grupos). -->
        @if (showControls()) {
          <div class="groups-list__controls">
            @if (showSearch()) {
              <label class="groups-list__search">
                <app-icon name="search" size="sm" [decorative]="true" />
                <input type="search" placeholder="Buscar grupo…"
                  [ngModel]="search()" (ngModelChange)="search.set($event)"
                  aria-label="Buscar grupo por nombre" />
              </label>
            }
            <label class="groups-list__sort">
              <span class="visually-hidden">Ordenar por</span>
              <select [ngModel]="sortKey()" (ngModelChange)="sortKey.set($event)" aria-label="Ordenar grupos">
                <option value="lastActivity">Actividad reciente</option>
                <option value="myRank">Mi posición</option>
                <option value="memberCount">Más miembros</option>
                <option value="created">Más recientes</option>
                <option value="name">Nombre (A-Z)</option>
              </select>
            </label>
            @if (showModeFilter()) {
              <div class="groups-list__mode-filter" role="group" aria-label="Filtrar por modo">
                <button type="button" [attr.aria-pressed]="modeFilter() === 'all'" (click)="modeFilter.set('all')">Todos</button>
                <button type="button" [attr.aria-pressed]="modeFilter() === 'COMPLETE'" (click)="modeFilter.set('COMPLETE')">Completo</button>
                <button type="button" [attr.aria-pressed]="modeFilter() === 'SIMPLE'" (click)="modeFilter.set('SIMPLE')">Simple</button>
              </div>
            }
          </div>
        }

        @if (visibleGroups().length === 0) {
          <app-empty-block iconName="search" title="Sin coincidencias"
            sub="Prueba con otro término o ajusta el filtro." />
        } @else {
          <div class="gh-cards">
            @for (g of visibleGroups(); track g.id) {
              <a class="gh-card" [routerLink]="['/groups', g.id]">
                <div class="gh-card__h">
                  @if (imageUrls()[g.id]) {
                    <img class="gh-card__av gh-card__av--img" [src]="imageUrls()[g.id]!" alt="">
                  } @else {
                    <span class="gh-card__av" [style.background]="avatarGradient(g)">{{ initials(g.name) }}</span>
                  }
                  @if (g.myRank !== null) {
                    <span class="pill" [class]="'pill ' + rankPillClass(g.myRank)">#{{ g.myRank }} de {{ g.members }}</span>
                  } @else {
                    <span class="pill pill--grey">Sin ranking</span>
                  }
                </div>

                <div>
                  <div class="gh-card__n">{{ g.name }}</div>
                  <div class="gh-card__m">
                    <span class="gh-card__chip">
                      <app-icon name="users" size="sm" [decorative]="true" />
                      {{ g.members }} {{ g.members === 1 ? 'jugador' : 'jugadores' }}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span>{{ g.mode === 'COMPLETE' ? 'COMPLETO' : 'SIMPLE' }}</span>
                    @if (g.isAdmin) { <span aria-hidden="true">·</span> <span>Admin</span> }
                  </div>
                </div>

                <div class="gh-card__bar" [attr.aria-hidden]="true">
                  <i [style.width.%]="barPct(g)"></i>
                </div>

                <div class="gh-card__foot">
                  @if (prizeLabel(g); as prize) {
                    <span class="gh-card__prize">Premio: <b>{{ prize }}</b></span>
                  } @else {
                    <span class="gh-card__pts">{{ g.myTotalPts }} pts</span>
                  }
                  @if (g.lastActivity) {
                    <span class="gh-card__activity">Activo {{ relativeTime(g.lastActivity) }}</span>
                  }
                </div>
              </a>
            }

            <!-- Tarjeta de acción: crear / unirse (sin botón en el top bar) -->
            <div class="gh-card gh-card--add">
              <div class="gh-card__add-icon" aria-hidden="true">+</div>
              <div class="gh-card__add-title">Nuevo grupo</div>
              <div class="gh-card__add-actions">
                <button type="button" class="btn-wf btn-wf--primary btn-wf--sm" (click)="actions.openCreate()">
                  Crear grupo
                </button>
                <button type="button" class="btn-wf btn-wf--sm" (click)="actions.openJoin()">
                  Unirme con código
                </button>
              </div>
            </div>
          </div>
        }
      }
    </section>
  `,
  styles: [`
    :host { display: block; }

    .visually-hidden {
      position: absolute; width: 1px; height: 1px;
      padding: 0; margin: -1px; overflow: hidden;
      clip: rect(0, 0, 0, 0); white-space: nowrap; border: 0;
    }

    .groups-list__controls {
      display: flex; flex-wrap: wrap; gap: 10px; margin-bottom: 14px; align-items: center;
    }
    .groups-list__search {
      display: flex; align-items: center; gap: 8px; flex: 1 1 200px; min-width: 0;
      background: var(--wf-paper); border: 1px solid var(--wf-line); border-radius: 8px; padding: 8px 12px;
    }
    .groups-list__search input {
      flex: 1; border: 0; background: transparent; outline: none; font: inherit; color: inherit; min-width: 0;
    }
    .groups-list__sort select {
      background: var(--wf-paper); border: 1px solid var(--wf-line); border-radius: 8px;
      padding: 8px 12px; font: inherit; color: inherit;
    }
    .groups-list__mode-filter { display: inline-flex; border: 1px solid var(--wf-line); border-radius: 8px; overflow: hidden; }
    .groups-list__mode-filter button {
      background: var(--wf-paper); border: 0; padding: 8px 12px; font: inherit; cursor: pointer;
      color: var(--wf-ink-3); min-height: var(--hit-target-min, 44px);
    }
    .groups-list__mode-filter button + button { border-left: 1px solid var(--wf-line); }
    .groups-list__mode-filter button[aria-pressed="true"] {
      background: var(--wf-green-soft); color: var(--wf-green-ink); font-weight: 600;
    }

    /* ---- Card grid (rediseño polla-groups) ---- */
    .gh-cards { display: grid; grid-template-columns: repeat(2, 1fr); gap: 14px; }
    @media (max-width: 767px) { .gh-cards { grid-template-columns: 1fr; } }

    .gh-card {
      background: var(--color-primary-white, #fff);
      border: 1px solid var(--color-line);
      border-radius: 14px;
      padding: 20px;
      display: flex; flex-direction: column; gap: 14px;
      text-decoration: none; color: inherit;
      transition: border-color .2s, transform .2s, box-shadow .2s;
    }
    .gh-card:hover {
      border-color: rgba(2, 204, 116, 0.4);
      transform: translateY(-2px);
      box-shadow: 0 12px 28px rgba(0, 0, 0, 0.06);
    }
    .gh-card__h { display: flex; justify-content: space-between; align-items: flex-start; gap: 10px; }
    .gh-card__av {
      width: 48px; height: 48px; border-radius: 12px; flex-shrink: 0;
      display: grid; place-items: center; color: #fff;
      font-family: var(--font-display); font-size: 22px;
    }
    .gh-card__av--img { object-fit: cover; }
    .gh-card__n { font-family: var(--font-display); font-size: 22px; line-height: 1; }
    .gh-card__m {
      font-size: 12px; color: var(--color-text-muted);
      margin-top: 6px; display: flex; gap: 8px; flex-wrap: wrap; align-items: center;
    }
    .gh-card__chip { display: inline-flex; align-items: center; gap: 4px; }
    .gh-card__bar { height: 4px; background: #f3f4f6; border-radius: 999px; overflow: hidden; }
    .gh-card__bar i { display: block; height: 100%; background: var(--color-primary-green); border-radius: 999px; }
    .gh-card__foot {
      display: flex; justify-content: space-between; align-items: baseline; gap: 8px;
      font-size: 12px; color: var(--color-text-muted); flex-wrap: wrap;
    }
    .gh-card__prize b { color: var(--color-text); font-family: var(--font-display); font-size: 14px; }
    .gh-card__pts { font-family: var(--font-display); color: var(--color-text); }
    .gh-card__activity { font-size: 11px; opacity: 0.85; margin-left: auto; }

    /* Add card */
    .gh-card--add {
      border: 2px dashed rgba(2, 204, 116, 0.3);
      background: linear-gradient(135deg, rgba(2, 204, 116, 0.04), transparent);
      align-items: center; justify-content: center; text-align: center;
      min-height: 180px; gap: 8px;
    }
    .gh-card--add:hover { border-color: var(--color-primary-green); transform: none; box-shadow: none; }
    .gh-card__add-icon {
      font-size: 28px; line-height: 1; color: var(--color-primary-green);
      font-family: var(--font-display);
    }
    .gh-card__add-title {
      font-family: var(--font-display); font-size: 18px; color: var(--color-primary-green);
    }
    .gh-card__add-actions { display: flex; flex-direction: column; gap: 8px; width: 100%; max-width: 220px; margin-top: 4px; }
    .gh-card__add-actions .btn-wf { width: 100%; justify-content: center; }
  `],
})
export class GroupsListComponent implements OnInit {
  private api = inject(ApiService);
  private auth = inject(AuthService);
  actions = inject(GroupActionsService);

  groups = signal<GroupRow[]>([]);
  /** Map de groupId → signed URL del logo. Se popula async post-load. */
  imageUrls = signal<Record<string, string>>({});
  loading = signal(true);

  // Controls
  search = signal('');
  sortKey = signal<SortKey>('lastActivity');
  modeFilter = signal<ModeFilter>('all');

  /** Paleta de gradientes para el avatar (cuando no hay logo). Determinista
   *  por id del grupo para que cada grupo conserve su color. */
  private static readonly GRADIENTS = [
    'linear-gradient(135deg,#067a4a,#02cc74)',
    'linear-gradient(135deg,#3b82f6,#1d4ed8)',
    'linear-gradient(135deg,#f59e0b,#b45309)',
    'linear-gradient(135deg,#8b5cf6,#6d28d9)',
    'linear-gradient(135deg,#ec4899,#be185d)',
    'linear-gradient(135deg,#0ea5e9,#0369a1)',
  ];

  countLabel = computed(() => {
    const n = this.groups().length;
    if (n === 0) return 'Aún no estás en ningún grupo';
    return n === 1 ? '1 grupo activo' : `${n} grupos activos`;
  });

  showControls = computed(() => this.groups().length >= 4);
  showSearch = computed(() => this.groups().length > 5);
  showModeFilter = computed(() => new Set(this.groups().map((g) => g.mode)).size > 1);

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
          (b.lastActivity ?? b.createdAt ?? '').localeCompare(a.lastActivity ?? a.createdAt ?? ''));
        break;
      case 'myRank':
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
      const memberships = (await this.api.myGroups(userId)).data ?? [];
      const enriched = await Promise.all(
        memberships.map(async (m): Promise<GroupRow | null> => {
          const [grp, members, lb] = await Promise.all([
            this.api.getGroup(m.groupId),
            this.api.groupMembers(m.groupId),
            this.api.groupLeaderboard(m.groupId),
          ]);
          if (!grp.data) return null;
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
            } catch { /* ignore */ }
          }

          let lastActivity: string | null = null;
          for (const r of lbData) {
            const ts = (r as { updatedAt?: string | null }).updatedAt ?? null;
            if (ts && (lastActivity === null || ts > lastActivity)) lastActivity = ts;
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
            prize1st: grp.data.prize1st ?? null,
            prize2nd: grp.data.prize2nd ?? null,
            prize3rd: grp.data.prize3rd ?? null,
          };
        }),
      );
      const rows = enriched.filter((x): x is GroupRow => x !== null);
      this.groups.set(rows);
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
      } catch { /* skip — fallback a gradiente */ }
    }
  }

  /** Iniciales (2 letras) del nombre del grupo para el avatar gradiente. */
  initials(name: string): string {
    const clean = (name ?? '').trim();
    if (!clean) return '··';
    const parts = clean.split(/\s+/);
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    return clean.slice(0, 2).toUpperCase();
  }

  /** Gradiente determinista por id del grupo. */
  avatarGradient(g: GroupRow): string {
    let h = 0;
    for (let i = 0; i < g.id.length; i++) h = (h * 31 + g.id.charCodeAt(i)) >>> 0;
    return GroupsListComponent.GRADIENTS[h % GroupsListComponent.GRADIENTS.length]!;
  }

  /** Color del pill de posición: oro #1, bronce top-3, gris el resto. */
  rankPillClass(rank: number): string {
    if (rank === 1) return 'pill--gold';
    if (rank <= 3) return 'pill--bronze';
    return 'pill--grey';
  }

  /** Ancho de la barra = percentil desde arriba (mejor posición → más llena). */
  barPct(g: GroupRow): number {
    if (g.myRank === null || g.members <= 0) return 6;
    const pct = Math.round(((g.members - g.myRank + 1) / g.members) * 100);
    return Math.max(6, Math.min(100, pct));
  }

  /** Premio headline del grupo: suma $ si todos son numéricos, sino el 1° definido. */
  prizeLabel(g: GroupRow): string | null {
    const raws = [g.prize1st, g.prize2nd, g.prize3rd].filter((v): v is string => !!v);
    if (raws.length === 0) return null;
    const nums = raws.map((s) => {
      const m = s.match(/\$\s*(\d[\d.,]*)/);
      return m ? parseFloat(m[1].replace(/,/g, '')) : null;
    });
    if (nums.every((n) => n !== null)) {
      return `$${Math.round((nums as number[]).reduce((a, n) => a + n, 0))}`;
    }
    return raws[0]!;
  }

  formatDate(iso: string): string {
    try {
      return new Date(iso).toLocaleDateString('es-EC', { day: '2-digit', month: 'short' });
    } catch { return '—'; }
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
    } catch { return '—'; }
  }
}
