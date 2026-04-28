import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { ApiService } from '../../core/api/api.service';
import { AuthService } from '../../core/auth/auth.service';
import { GroupLeaderboardComponent, type LeaderboardRow } from '../groups/group-leaderboard.component';
import { compareRankable } from '../../shared/util/tiebreakers';

const TOURNAMENT_ID = 'mundial-2026';
const PAGE_SIZE = 20;

interface UserGroup { id: string; name: string; members: number; }

@Component({
  standalone: true,
  selector: 'app-ranking',
  imports: [GroupLeaderboardComponent],
  template: `
    <header class="page-header">
      <div class="page-header__top">
        <div class="page-header__title">
          <small>Mundial 2026 · {{ totalPlayers() }} jugador{{ totalPlayers() === 1 ? '' : 'es' }} activo{{ totalPlayers() === 1 ? '' : 's' }}</small>
          <h1>Ranking</h1>
        </div>
        <span class="page-header__refresh">EN VIVO · hace {{ updatedAgo() }}</span>
      </div>

      <div class="page-header__controls">
        <div class="view-mode-toggle" role="tablist" aria-label="Ámbito del ranking">
          <button class="view-mode-toggle__option" type="button"
                  [class.is-active]="scope() === 'global'"
                  (click)="scope.set('global')">🌐 Global</button>
          <button class="view-mode-toggle__option" type="button"
                  [class.is-active]="scope() === 'grupos'"
                  (click)="scope.set('grupos')">★ Solo mis grupos</button>
        </div>
        @if (myRank() !== null) {
          <p style="margin-left: auto; font-size: var(--fs-sm); color: var(--color-text-muted);">
            Mi posición: <strong style="color: var(--color-primary-green);">#{{ myRank() }} global</strong>
          </p>
        }
      </div>
    </header>

    <div class="container-app">
      @if (loading()) {
        <p>Cargando ranking…</p>
      } @else if (scope() === 'global') {
        <!-- GLOBAL VIEW -->
        @if (global().length === 0) {
          <p class="empty-state">Aún no hay datos de ranking.</p>
        } @else {
          <div class="standings-wrap">
            <app-group-leaderboard [rows]="visiblePage()" [currentUserId]="currentUserId" />
          </div>

          @if (totalPages() > 1) {
            <nav class="pagination" aria-label="Navegación de páginas">
              <button class="pagination__btn" type="button"
                      [disabled]="page() === 1"
                      (click)="page.set(page() - 1)">« Anterior</button>
              @for (p of pageNumbers(); track p) {
                @if (p === -1) {
                  <span class="pagination__sep">…</span>
                } @else {
                  <button class="pagination__btn" type="button"
                          [class.is-active]="page() === p"
                          (click)="page.set(p)">{{ p }}</button>
                }
              }
              <button class="pagination__btn" type="button"
                      [disabled]="page() === totalPages()"
                      (click)="page.set(page() + 1)">Siguiente »</button>
            </nav>
          }

          @if (myRank() !== null && !inCurrentPage()) {
            <div class="my-position-sticky" role="status">
              <span class="my-position-sticky__pos">#{{ myRank() }}</span>
              <div class="my-position-sticky__handle">
                {{ '@' + (currentHandle() ?? 'tu') }}
                <small>Tu posición global</small>
              </div>
              <span class="my-position-sticky__pts">{{ myPoints() }} pts</span>
            </div>
          }
        }
      } @else {
        <!-- SOLO MIS GRUPOS -->
        @if (userGroups().length === 0) {
          <p class="empty-state">
            Aún no estás en ningún grupo. Únete o crea uno para ver rankings privados.
          </p>
        } @else {
          <div class="group-tabs" role="tablist">
            @for (g of userGroups(); track g.id) {
              <button type="button"
                      [class.is-active]="selectedGroupId() === g.id"
                      (click)="selectedGroupId.set(g.id)">
                {{ g.name }} ({{ g.members }})
              </button>
            }
          </div>

          <div class="standings-wrap">
            <app-group-leaderboard [rows]="groupRows()" [currentUserId]="currentUserId" />
          </div>
        }
      }
    </div>
  `,
})
export class RankingComponent implements OnInit {
  private api = inject(ApiService);
  private auth = inject(AuthService);

  scope = signal<'global' | 'grupos'>('global');
  global = signal<LeaderboardRow[]>([]);
  loading = signal(true);
  loadedAt = signal<number>(Date.now());

  page = signal(1);
  totalPages = computed(() => Math.max(1, Math.ceil(this.global().length / PAGE_SIZE)));
  visiblePage = computed(() => {
    const start = (this.page() - 1) * PAGE_SIZE;
    return this.global().slice(start, start + PAGE_SIZE);
  });

  pageNumbers = computed(() => {
    const total = this.totalPages();
    const cur = this.page();
    if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
    if (cur <= 3) return [1, 2, 3, -1, total];
    if (cur >= total - 2) return [1, -1, total - 2, total - 1, total];
    return [1, -1, cur - 1, cur, cur + 1, -1, total];
  });

  totalPlayers = computed(() => this.global().length);
  myRank = computed(() => {
    const i = this.global().findIndex((r) => r.userId === this.currentUserId);
    return i >= 0 ? i + 1 : null;
  });
  myPoints = computed(() => this.global().find((r) => r.userId === this.currentUserId)?.points ?? 0);
  inCurrentPage = computed(() => {
    const rank = this.myRank();
    if (rank === null) return true;
    const start = (this.page() - 1) * PAGE_SIZE + 1;
    const end = start + PAGE_SIZE - 1;
    return rank >= start && rank <= end;
  });

  updatedAgo = computed(() => {
    const minutes = Math.max(1, Math.floor((Date.now() - this.loadedAt()) / 60_000));
    return minutes < 60 ? `${minutes} min` : `${Math.floor(minutes / 60)} h`;
  });

  // 'Solo mis grupos' state
  userGroups = signal<UserGroup[]>([]);
  selectedGroupId = signal<string | null>(null);
  groupRowsMap = signal<Map<string, LeaderboardRow[]>>(new Map());
  groupRows = computed(() => {
    const id = this.selectedGroupId();
    return id ? this.groupRowsMap().get(id) ?? [] : [];
  });

  currentUserId = '';
  currentHandle = signal<string | null>(null);

  async ngOnInit() {
    this.currentUserId = this.auth.user()?.sub ?? '';
    this.currentHandle.set(this.auth.user()?.handle ?? null);
    try {
      const lb = await this.api.listLeaderboard(TOURNAMENT_ID, 500);
      const sorted = [...(lb.data ?? [])].sort(compareRankable);

      const handles = new Map<string, string>();
      await Promise.all(
        sorted.map(async (t) => {
          const u = await this.api.getUser(t.userId);
          handles.set(t.userId, u.data?.handle ?? t.userId.slice(0, 6));
        }),
      );

      this.global.set(
        sorted.map((t): LeaderboardRow => ({
          userId: t.userId,
          handle: handles.get(t.userId) ?? t.userId.slice(0, 6),
          points: t.points ?? 0,
          exactCount: t.exactCount ?? 0,
          resultCount: t.resultCount ?? 0,
        })),
      );

      // Pre-load user's groups for the 'grupos' tab
      if (this.currentUserId) {
        const memberships = await this.api.myGroups(this.currentUserId);
        const groupsList = await Promise.all(
          (memberships.data ?? []).map(async (m): Promise<UserGroup | null> => {
            const [grp, members, lb] = await Promise.all([
              this.api.getGroup(m.groupId),
              this.api.groupMembers(m.groupId),
              this.api.groupLeaderboard(m.groupId),
            ]);
            if (!grp.data) return null;

            // Resolve handles for the group's leaderboard rows
            const groupHandles = new Map<string, string>();
            for (const memberRow of members.data ?? []) {
              const cached = handles.get(memberRow.userId);
              if (cached) {
                groupHandles.set(memberRow.userId, cached);
              } else {
                const u = await this.api.getUser(memberRow.userId);
                groupHandles.set(memberRow.userId, u.data?.handle ?? memberRow.userId.slice(0, 6));
              }
            }
            const sortedG = [...(lb.data ?? [])].sort(compareRankable);
            const rows: LeaderboardRow[] = sortedG.map((t) => ({
              userId: t.userId,
              handle: groupHandles.get(t.userId) ?? t.userId.slice(0, 6),
              points: t.points ?? 0,
              exactCount: t.exactCount ?? 0,
              resultCount: t.resultCount ?? 0,
            }));
            this.groupRowsMap.update((m) => {
              const copy = new Map(m);
              copy.set(m.size === 0 ? grp.data!.id : grp.data!.id, rows);
              return copy;
            });
            return { id: grp.data.id, name: grp.data.name, members: (members.data ?? []).length };
          }),
        );
        const valid = groupsList.filter((g): g is UserGroup => g !== null);
        this.userGroups.set(valid);
        if (valid.length > 0) this.selectedGroupId.set(valid[0]!.id);
      }
    } finally {
      this.loading.set(false);
      this.loadedAt.set(Date.now());
    }
  }
}
