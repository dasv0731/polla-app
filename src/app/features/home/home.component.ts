import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ApiService } from '../../core/api/api.service';
import { AuthService } from '../../core/auth/auth.service';
import { UserModesService } from '../../core/user/user-modes.service';
import { getUrl } from 'aws-amplify/storage';

const TOURNAMENT_ID = 'mundial-2026';
const NEWS_HUB_URL = 'https://golgana.net/news';

interface UpcomingMatch {
  id: string;
  phaseOrder: number;
  homeName: string;
  awayName: string;
  homeFlag: string;
  awayFlag: string;
  kickoffAt: string;
  kickoffLabel: string;
  countdown: string;
  isLive: boolean;
  hasPick: boolean;
}

interface ArticleCard {
  id: string;
  title: string;
  externalUrl: string;
  publishedAt: string;
  resolvedImageUrl: string | null;
  relativeTime: string;
}

interface GroupRow {
  id: string;
  name: string;
  mode: 'SIMPLE' | 'COMPLETE';
  position: number | null;
  totalMembers: number;
}

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [RouterLink],
  template: `
    <section class="page home">

      <header class="home-greet">
        <div class="kicker">MUNDIAL 2026 · GOLGANA</div>
        <h1>Hola, {{ '@' + (handle() ?? 'jugador') }}</h1>
      </header>

      <!-- 1. HERO: próximo partido -->
      @if (heroMatch(); as m) {
        <a [routerLink]="['/picks/match', m.id]" class="hero-match">
          <div class="hero-match__time">
            @if (m.isLive) {
              <span class="hero-match__live">● EN VIVO</span>
            } @else {
              <span>{{ m.kickoffLabel }} · faltan {{ m.countdown }}</span>
            }
          </div>
          <div class="hero-match__teams">
            <div class="hero-match__team">
              @if (m.homeFlag) {
                <span class="fi fi-{{ m.homeFlag.toLowerCase() }} hero-match__flag"></span>
              }
              <span class="hero-match__name">{{ m.homeName }}</span>
            </div>
            <span class="hero-match__vs">VS</span>
            <div class="hero-match__team hero-match__team--right">
              <span class="hero-match__name">{{ m.awayName }}</span>
              @if (m.awayFlag) {
                <span class="fi fi-{{ m.awayFlag.toLowerCase() }} hero-match__flag"></span>
              }
            </div>
          </div>
          <div class="hero-match__cta">
            {{ m.hasPick ? 'Editar mi pick' : 'Hacer mi pick' }} →
          </div>
        </a>
      } @else if (loading()) {
        <div class="hero-match hero-match--skel">
          <div class="hero-match__time">Cargando…</div>
        </div>
      } @else {
        <div class="hero-match hero-match--empty">
          <div class="hero-match__time">Mundial 2026</div>
          <p class="text-mute">Próximamente — el torneo arranca pronto.</p>
        </div>
      }

      <!-- 2. STATS ROW -->
      <div class="home-stats">
        <div class="home-stat">
          <div class="home-stat__num">{{ totals().points }}</div>
          <div class="home-stat__lbl">Mi puntaje</div>
        </div>
        <div class="home-stat">
          <div class="home-stat__num">
            {{ totals().globalRank ? '#' + totals().globalRank : '—' }}
          </div>
          <div class="home-stat__lbl">Ranking global</div>
        </div>
        <div class="home-stat">
          <div class="home-stat__num">{{ pendingPicksCount() }}</div>
          <div class="home-stat__lbl">Picks pendientes</div>
        </div>
      </div>

      <!-- 3. DOS COLUMNAS: mis grupos + editorial -->
      <div class="home-two-col">

        <section class="home-block">
          <header class="home-block__head">
            <h2>Mis grupos</h2>
            <a routerLink="/groups" class="home-block__more">Ver todos →</a>
          </header>
          @if (myGroupsList().length === 0) {
            <p class="home-block__empty">Aún no estás en ningún grupo.</p>
            <a routerLink="/groups/new" class="btn-wf btn-wf--primary">Crear grupo →</a>
          } @else {
            <ul class="group-mini-list">
              @for (g of myGroupsList(); track g.id) {
                <li>
                  <a [routerLink]="['/groups', g.id]" class="group-mini">
                    <span class="group-mini__name">{{ g.name }}</span>
                    <span class="group-mini__pos">
                      @if (g.position) {
                        #{{ g.position }} / {{ g.totalMembers }}
                      } @else {
                        — / {{ g.totalMembers }}
                      }
                    </span>
                  </a>
                </li>
              }
            </ul>
          }
        </section>

        <section class="home-block">
          <header class="home-block__head">
            <h2>📰 Noticias del torneo</h2>
          </header>
          @if (articlesLoading()) {
            <p class="text-mute">Cargando…</p>
          } @else if (articles().length === 0) {
            <p class="home-block__empty">Próximamente noticias del Mundial.</p>
          } @else {
            <ul class="article-list">
              @for (a of articles(); track a.id) {
                <li>
                  <a [href]="a.externalUrl" target="_blank" rel="noopener noreferrer"
                     class="article-card">
                    @if (a.resolvedImageUrl) {
                      <img [src]="a.resolvedImageUrl" [alt]="a.title" class="article-card__img">
                    } @else {
                      <div class="article-card__img article-card__img--placeholder">📰</div>
                    }
                    <div class="article-card__body">
                      <div class="article-card__title">{{ a.title }}</div>
                      <div class="article-card__meta">{{ a.relativeTime }} · ↗</div>
                    </div>
                  </a>
                </li>
              }
            </ul>
            <a [href]="newsHubUrl" target="_blank" rel="noopener noreferrer"
               class="home-block__more">Ver todas en golgana.net →</a>
          }
        </section>
      </div>

      <!-- 4. PRÓXIMOS PARTIDOS (4) -->
      <section class="home-block">
        <header class="home-block__head">
          <h2>Próximos partidos</h2>
          <a routerLink="/picks" class="home-block__more">Ver lista completa →</a>
        </header>
        @if (upcoming().length === 0) {
          <p class="home-block__empty">No hay partidos programados próximamente.</p>
        } @else {
          <ul class="upcoming-list">
            @for (m of upcomingTail(); track m.id) {
              <li>
                <a [routerLink]="['/picks/match', m.id]" class="upcoming-row">
                  <span class="upcoming-row__time">{{ m.kickoffLabel }}</span>
                  <span class="upcoming-row__teams">
                    {{ m.homeName }} vs {{ m.awayName }}
                  </span>
                  <span class="upcoming-row__status"
                        [class.is-picked]="m.hasPick"
                        [class.is-pending]="!m.hasPick">
                    {{ m.hasPick ? '✓ pick' : 'pendiente' }}
                  </span>
                </a>
              </li>
            }
          </ul>
        }
      </section>

    </section>
  `,
  styles: [`
    :host { display: block; }

    .home-greet { margin-bottom: 24px; }
    .home-greet h1 { margin: 4px 0 0; font-family: var(--wf-display); font-size: clamp(24px, 4vw, 36px); }

    .hero-match {
      display: block;
      background: linear-gradient(135deg, var(--wf-green-soft) 0%, var(--wf-paper) 100%);
      border: 2px solid var(--wf-green);
      border-radius: 14px;
      padding: 22px;
      margin-bottom: 32px;
      text-decoration: none; color: inherit;
      transition: transform 200ms, box-shadow 200ms;
    }
    .hero-match:hover { transform: translateY(-2px); box-shadow: 0 12px 32px rgba(0,200,100,0.16); }
    .hero-match--skel, .hero-match--empty { background: var(--wf-fill); border-color: var(--wf-line); }
    .hero-match__time { font-size: 12px; letter-spacing: .12em; color: var(--wf-ink-3); text-transform: uppercase; margin-bottom: 14px; }
    .hero-match__live { color: var(--wf-danger); font-weight: 700; animation: pulse 1.2s infinite; }
    @keyframes pulse { 50% { opacity: .55; } }
    .hero-match__teams { display: grid; grid-template-columns: 1fr auto 1fr; align-items: center; gap: 14px; margin-bottom: 18px; }
    .hero-match__team { display: flex; align-items: center; gap: 10px; }
    .hero-match__team--right { justify-content: flex-end; }
    .hero-match__flag { font-size: 32px; }
    .hero-match__name { font-family: var(--wf-display); font-size: clamp(18px, 3vw, 28px); font-weight: 700; }
    .hero-match__vs { font-family: var(--wf-display); font-size: 14px; color: var(--wf-ink-3); letter-spacing: .12em; }
    .hero-match__cta { font-weight: 700; color: var(--wf-green-ink); }

    .home-stats { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-bottom: 32px; }
    .home-stat { background: var(--wf-paper); border: 1px solid var(--wf-line); border-radius: 12px; padding: 18px; text-align: center; }
    .home-stat__num { font-family: var(--wf-display); font-size: clamp(28px, 5vw, 48px); font-weight: 800; line-height: 1; font-variant-numeric: tabular-nums; }
    .home-stat__lbl { font-size: 11px; letter-spacing: .08em; color: var(--wf-ink-3); text-transform: uppercase; margin-top: 8px; }

    .home-two-col { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; margin-bottom: 32px; }
    @media (max-width: 768px) { .home-two-col { grid-template-columns: 1fr; } }

    .home-block { background: var(--wf-paper); border: 1px solid var(--wf-line); border-radius: 12px; padding: 18px; }
    .home-block__head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
    .home-block__head h2 { font-family: var(--wf-display); font-size: 16px; letter-spacing: .06em; margin: 0; }
    .home-block__more { font-size: 12px; color: var(--wf-green-ink); text-decoration: none; }
    .home-block__empty { font-size: 13px; color: var(--wf-ink-3); margin: 0; }

    .group-mini-list { list-style: none; padding: 0; margin: 0; display: grid; gap: 6px; }
    .group-mini { display: flex; justify-content: space-between; padding: 10px; border-radius: 8px; background: var(--wf-fill); text-decoration: none; color: inherit; transition: background 150ms; }
    .group-mini:hover { background: var(--wf-green-soft); }
    .group-mini__name { font-weight: 600; }
    .group-mini__pos { font-size: 12px; color: var(--wf-ink-3); font-variant-numeric: tabular-nums; }

    .article-list { list-style: none; padding: 0; margin: 0 0 10px; display: grid; gap: 10px; }
    .article-card { display: grid; grid-template-columns: 80px 1fr; gap: 12px; padding: 8px; border-radius: 8px; text-decoration: none; color: inherit; transition: background 150ms; }
    .article-card:hover { background: var(--wf-fill); }
    .article-card__img { width: 80px; height: 60px; object-fit: cover; border-radius: 6px; }
    .article-card__img--placeholder { display: flex; align-items: center; justify-content: center; background: var(--wf-fill); font-size: 24px; }
    .article-card__title { font-weight: 600; font-size: 14px; line-height: 1.3; }
    .article-card__meta { font-size: 11px; color: var(--wf-ink-3); margin-top: 4px; }

    .upcoming-list { list-style: none; padding: 0; margin: 0; display: grid; gap: 6px; }
    .upcoming-row { display: grid; grid-template-columns: 110px 1fr auto; gap: 10px; padding: 8px 10px; border-radius: 8px; text-decoration: none; color: inherit; align-items: center; transition: background 150ms; }
    .upcoming-row:hover { background: var(--wf-fill); }
    .upcoming-row__time { font-size: 11px; letter-spacing: .06em; color: var(--wf-ink-3); text-transform: uppercase; }
    .upcoming-row__status { font-size: 11px; font-weight: 600; }
    .upcoming-row__status.is-picked { color: var(--wf-green-ink); }
    .upcoming-row__status.is-pending { color: var(--wf-warn); }
  `],
})
export class HomeComponent implements OnInit {
  private auth = inject(AuthService);
  private api = inject(ApiService);
  private userModes = inject(UserModesService);

  readonly newsHubUrl = NEWS_HUB_URL;

  handle = computed(() => this.auth.user()?.handle ?? null);

  loading = signal(true);
  articlesLoading = signal(true);
  upcoming = signal<UpcomingMatch[]>([]);
  heroMatch = computed<UpcomingMatch | null>(() => this.upcoming()[0] ?? null);
  upcomingTail = computed<UpcomingMatch[]>(() => this.upcoming().slice(1, 5));
  articles = signal<ArticleCard[]>([]);
  myGroupsList = signal<GroupRow[]>([]);
  totals = signal<{ points: number; globalRank: number | null }>({ points: 0, globalRank: null });
  pendingPicksCount = signal(0);

  async ngOnInit() {
    void this.loadMatchesAndStats();
    void this.loadArticles();
    void this.loadGroups();
  }

  private async loadMatchesAndStats() {
    this.loading.set(true);
    try {
      const userId = this.auth.user()?.sub ?? '';
      const [matchesRes, teamsRes, totalRes, leaderboardRes] = await Promise.all([
        this.api.listMatches(TOURNAMENT_ID),
        this.api.listTeams(TOURNAMENT_ID),
        userId ? this.api.myTotal(userId, TOURNAMENT_ID) : Promise.resolve({ data: [] as readonly unknown[] }),
        this.api.listLeaderboard(TOURNAMENT_ID, 200),
      ]);

      // Load user picks (separate to avoid one failure killing everything).
      let userPickIds = new Set<string>();
      if (userId) {
        try {
          const picksRes = await this.api.myPicks(userId);
          userPickIds = new Set(
            (picksRes.data ?? [])
              .filter((p): p is NonNullable<typeof p> => !!p && !!p.matchId)
              .map((p) => p.matchId),
          );
        } catch { /* ignore */ }
      }

      const teamMap = new Map<string, { name: string; flag: string }>(
        (teamsRes.data ?? [])
          .filter((t): t is NonNullable<typeof t> => !!t && !!t.slug)
          .map((t) => [t.slug, { name: t.name ?? t.slug, flag: t.flagCode ?? '' }]),
      );

      const now = Date.now();
      const all = (matchesRes.data ?? [])
        .filter((m): m is NonNullable<typeof m> => !!m && !!m.kickoffAt && !!m.id);

      const upcomingList: UpcomingMatch[] = all
        .filter((m) => new Date(m.kickoffAt!).getTime() > now - 2 * 3600 * 1000)
        .sort((a, b) => new Date(a.kickoffAt!).getTime() - new Date(b.kickoffAt!).getTime())
        .slice(0, 5)
        .map((m) => {
          const ko = new Date(m.kickoffAt!);
          const home = teamMap.get(m.homeTeamId) ?? { name: m.homeTeamId, flag: '' };
          const away = teamMap.get(m.awayTeamId) ?? { name: m.awayTeamId, flag: '' };
          const isLive = m.status === 'IN_PROGRESS' || m.status === 'LIVE';
          return {
            id: m.id,
            phaseOrder: (m as { phaseOrder?: number }).phaseOrder ?? 0,
            homeName: home.name, awayName: away.name,
            homeFlag: home.flag, awayFlag: away.flag,
            kickoffAt: m.kickoffAt!,
            kickoffLabel: this.formatKickoff(ko),
            countdown: this.formatCountdown(ko, now),
            isLive,
            hasPick: userPickIds.has(m.id),
          };
        });

      this.upcoming.set(upcomingList);

      const totalRow = ((totalRes.data ?? []) as ReadonlyArray<{ points?: number }>)[0];
      const sorted = ((leaderboardRes.data ?? []) as ReadonlyArray<{ userId: string; points?: number }>)
        .slice().sort((a, b) => (b.points ?? 0) - (a.points ?? 0));
      const rankIdx = sorted.findIndex((t) => t.userId === userId);

      this.totals.set({
        points: totalRow?.points ?? 0,
        globalRank: rankIdx >= 0 ? rankIdx + 1 : null,
      });

      const cutoff = now + 48 * 3600 * 1000;
      const pending = all.filter((m) => {
        const ko = new Date(m.kickoffAt!).getTime();
        return ko > now && ko < cutoff && !userPickIds.has(m.id);
      });
      this.pendingPicksCount.set(pending.length);
    } catch (e) {
      console.warn('[home] load matches/stats failed', e);
    } finally {
      this.loading.set(false);
    }
  }

  private async loadArticles() {
    this.articlesLoading.set(true);
    try {
      const res = await this.api.listPublishedArticles(4);
      const rows = (res.data ?? []).slice();
      const enriched: ArticleCard[] = await Promise.all(rows.map(async (a) => {
        let resolvedImageUrl: string | null = null;
        if (a.imageKey) {
          try {
            const { url } = await getUrl({ path: a.imageKey, options: { expiresIn: 3600 } });
            resolvedImageUrl = url.toString();
          } catch { /* ignore */ }
        }
        return {
          id: a.id, title: a.title, externalUrl: a.externalUrl, publishedAt: a.publishedAt,
          resolvedImageUrl, relativeTime: this.formatRelative(a.publishedAt),
        };
      }));
      this.articles.set(enriched);
    } catch (e) {
      console.warn('[home] load articles failed', e);
    } finally {
      this.articlesLoading.set(false);
    }
  }

  private async loadGroups() {
    const userId = this.auth.user()?.sub ?? '';
    if (!userId) return;
    try {
      const groups = this.userModes.groups();
      const top = groups.slice(0, 5);
      // For each group, count members + find user's position.
      const rows = await Promise.all(top.map(async (g): Promise<GroupRow> => {
        try {
          const lbRes = await this.api.groupLeaderboard(g.id);
          const sorted = ((lbRes.data ?? []) as ReadonlyArray<{ userId: string; points?: number }>)
            .slice().sort((a, b) => (b.points ?? 0) - (a.points ?? 0));
          const idx = sorted.findIndex((m) => m.userId === userId);
          return {
            id: g.id, name: g.name, mode: g.mode,
            position: idx >= 0 ? idx + 1 : null,
            totalMembers: sorted.length,
          };
        } catch {
          return { id: g.id, name: g.name, mode: g.mode, position: null, totalMembers: 0 };
        }
      }));
      this.myGroupsList.set(rows);
    } catch (e) {
      console.warn('[home] load groups failed', e);
    }
  }

  private formatKickoff(d: Date): string {
    const today = new Date();
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const time = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    if (d.toDateString() === today.toDateString()) return `HOY ${time}`;
    if (d.toDateString() === tomorrow.toDateString()) return `MAÑANA ${time}`;
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    return `${day}/${month} ${time}`;
  }

  private formatCountdown(target: Date, nowMs: number): string {
    const diff = target.getTime() - nowMs;
    if (diff < 0) return 'EN VIVO';
    const h = Math.round(diff / 3600_000);
    if (h < 1) {
      const mins = Math.max(1, Math.round(diff / 60_000));
      return `${mins} min`;
    }
    if (h < 24) return `${h}h`;
    const d = Math.round(h / 24);
    return d === 1 ? '1 día' : `${d} días`;
  }

  private formatRelative(iso: string): string {
    const diff = Date.now() - new Date(iso).getTime();
    const h = Math.round(diff / 3600_000);
    if (h < 1) return 'hace minutos';
    if (h < 24) return `hace ${h}h`;
    const d = Math.round(h / 24);
    if (d < 7) return d === 1 ? 'hace 1 día' : `hace ${d} días`;
    return new Date(iso).toLocaleDateString();
  }
}
