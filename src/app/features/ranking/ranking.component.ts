import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { ApiService } from '../../core/api/api.service';
import { AuthService } from '../../core/auth/auth.service';
import { GroupLeaderboardComponent, type LeaderboardRow } from '../groups/group-leaderboard.component';

const TOURNAMENT_ID = 'mundial-2026';

@Component({
  standalone: true,
  selector: 'app-ranking',
  imports: [GroupLeaderboardComponent],
  template: `
    <section class="container">
      <h1>Ranking</h1>

      <div class="view-mode-toggle">
        <button class="view-mode-toggle__btn"
                [class.is-active]="scope() === 'global'"
                (click)="scope.set('global')">Global</button>
        <button class="view-mode-toggle__btn"
                [class.is-active]="scope() === 'my-groups'"
                (click)="scope.set('my-groups')">Solo mis grupos</button>
      </div>

      @if (loading()) {
        <p>Cargando ranking…</p>
      } @else if (visibleRows().length === 0) {
        <p>Aún no hay datos en este ranking.</p>
      } @else {
        <app-group-leaderboard [rows]="visibleRows()" [currentUserId]="currentUserId" />
        @if (myRank() !== null && !inTop()) {
          <p class="ranking__me">
            Tú estás en posición #{{ myRank() }} con {{ myPoints() }} pts.
          </p>
        }
      }
    </section>
  `,
})
export class RankingComponent implements OnInit {
  private api = inject(ApiService);
  private auth = inject(AuthService);

  scope = signal<'global' | 'my-groups'>('global');
  global = signal<LeaderboardRow[]>([]);
  myGroupUserIds = signal<Set<string>>(new Set());
  loading = signal(true);
  currentUserId = '';

  visibleRows = computed(() => {
    const rows = this.global();
    if (this.scope() === 'global') return rows.slice(0, 100);
    const ids = this.myGroupUserIds();
    return rows.filter((r) => ids.has(r.userId));
  });

  myRank = computed(() => {
    const i = this.global().findIndex((r) => r.userId === this.currentUserId);
    return i >= 0 ? i + 1 : null;
  });
  myPoints = computed(() => this.global().find((r) => r.userId === this.currentUserId)?.points ?? 0);
  inTop = computed(() => (this.myRank() ?? 999) <= 100);

  async ngOnInit() {
    this.currentUserId = this.auth.user()?.sub ?? '';
    try {
      const lb = await this.api.listLeaderboard(TOURNAMENT_ID, 200);
      const sorted = (lb.data ?? []).sort((a, b) => (b.points ?? 0) - (a.points ?? 0));

      const handles = new Map<string, string>();
      await Promise.all(
        sorted.slice(0, 100).map(async (t) => {
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

      // Build my-groups user union
      if (this.currentUserId) {
        const memberships = await this.api.myGroups(this.currentUserId);
        const userIds = new Set<string>();
        for (const m of memberships.data ?? []) {
          const lbg = await this.api.groupLeaderboard(m.groupId);
          for (const row of lbg.data ?? []) userIds.add(row.userId);
        }
        this.myGroupUserIds.set(userIds);
      }
    } finally {
      this.loading.set(false);
    }
  }
}
