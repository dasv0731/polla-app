import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ApiService } from '../../core/api/api.service';
import { AuthService } from '../../core/auth/auth.service';
import { UserModesService } from '../../core/user/user-modes.service';
import { TourOverlayComponent } from '../onboarding/tour-overlay.component';

const TOURNAMENT_ID = 'mundial-2026';

interface UpcomingMatch {
  id: string;
  homeName: string;
  awayName: string;
  homeFlag: string;        // ISO-2 (lowercase)
  awayFlag: string;
  kickoffLabel: string;    // "HOY 14:00"
  countdown: string;       // "en 3h" / "en 2d"
  isLive: boolean;
}

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [RouterLink, TourOverlayComponent],
  template: `
    <app-tour-overlay />
    <section class="page">

      <header class="home-greet">
        <div class="kicker">Hola, {{ '@' + (handle() ?? 'jugador') }}</div>
        <h1>¿Qué hacemos hoy?</h1>
      </header>

      <!-- Hub: 4 accesos directos -->
      <div class="hub-grid">

        <a routerLink="/picks" class="hub-tile hub-tile--accent">
          <div class="hub-tile__icon">⚽</div>
          <div>
            <div class="hub-tile__title">Picks</div>
            <div class="hub-tile__sub">{{ picksSub() }}</div>
          </div>
          @if (upcomingTodayCount() > 0) {
            <span class="hub-tile__badge">{{ upcomingTodayCount() }}</span>
          }
        </a>

        <a routerLink="/groups" class="hub-tile">
          <div class="hub-tile__icon">👥</div>
          <div>
            <div class="hub-tile__title">Grupos</div>
            <div class="hub-tile__sub">{{ groupsSub() }}</div>
          </div>
        </a>

        <a routerLink="/ranking" class="hub-tile">
          <div class="hub-tile__icon">🏆</div>
          <div>
            <div class="hub-tile__title">Ranking</div>
            <div class="hub-tile__sub">{{ rankingSub() }}</div>
          </div>
        </a>

        @if (hasComplete()) {
          <a routerLink="/mis-comodines" class="hub-tile">
            <div class="hub-tile__icon">🎁</div>
            <div>
              <div class="hub-tile__title">Comodines</div>
              <div class="hub-tile__sub">Para potenciar tus picks</div>
            </div>
          </a>
        } @else {
          <a routerLink="/profile/special-picks" class="hub-tile">
            <div class="hub-tile__icon">⭐</div>
            <div>
              <div class="hub-tile__title">Picks especiales</div>
              <div class="hub-tile__sub">Campeón, subcampeón…</div>
            </div>
          </a>
        }

      </div>

      <!-- Próximos partidos -->
      <section class="home-section">
        <header class="home-section__h">
          <h2>Próximos partidos</h2>
          <a routerLink="/picks">Ver todos →</a>
        </header>

        <div class="home-matches">
          @if (loading()) {
            <p class="home-empty">Cargando…</p>
          } @else if (upcoming().length === 0) {
            <p class="home-empty">No hay partidos programados próximamente.</p>
          } @else {
            @for (m of upcoming(); track m.id) {
              <a class="match-card" [routerLink]="['/picks/match', m.id]">
                <div class="match-card__head">
                  <span>{{ m.kickoffLabel }}</span>
                  @if (m.isLive) {
                    <span class="text-bold" style="color: var(--wf-danger);">EN VIVO</span>
                  } @else {
                    <span class="text-mute">{{ m.countdown }}</span>
                  }
                </div>
                <div class="match-row">
                  <div class="match-row__team">
                    @if (m.homeFlag) {
                      <span class="fi fi-{{ m.homeFlag.toLowerCase() }} match-row__flag"></span>
                    }
                    <span>{{ m.homeName }}</span>
                  </div>
                  <div class="match-row__score">— vs —</div>
                  <div class="match-row__team match-row__team--right">
                    <span>{{ m.awayName }}</span>
                    @if (m.awayFlag) {
                      <span class="fi fi-{{ m.awayFlag.toLowerCase() }} match-row__flag"></span>
                    }
                  </div>
                </div>
              </a>
            }
          }
        </div>
      </section>

    </section>
  `,
  styles: [`
    :host { display: block; }

    .home-empty {
      font-size: 13px;
      color: var(--wf-ink-3);
      padding: 12px 14px;
      background: var(--wf-paper);
      border: 1px dashed var(--wf-line);
      border-radius: 10px;
      text-align: center;
      margin: 0;
    }

    .match-card {
      display: block;
      background: var(--wf-paper);
      border: 1px solid var(--wf-line);
      border-radius: 10px;
      padding: 12px;
      text-decoration: none;
      color: inherit;
      transition: border-color .15s, box-shadow .15s;
    }
    .match-card:hover {
      border-color: var(--wf-green);
      box-shadow: 0 4px 12px rgba(0,200,100,.08);
    }
    .match-card__head {
      display: flex;
      justify-content: space-between;
      font-size: 11px;
      color: var(--wf-ink-3);
      margin-bottom: 8px;
    }
    .match-row {
      display: grid;
      grid-template-columns: 1fr auto 1fr;
      align-items: center;
      gap: 10px;
    }
    .match-row__team {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 13px;
      font-weight: 600;
    }
    .match-row__team--right { justify-content: flex-end; }
    .match-row__flag {
      font-size: 18px;
      width: 24px;
      flex-shrink: 0;
    }
    .match-row__score {
      font-family: var(--wf-display);
      font-size: 16px;
      color: var(--wf-ink-3);
      letter-spacing: .05em;
    }
  `],
})
export class HomeComponent implements OnInit {
  private auth = inject(AuthService);
  private api = inject(ApiService);
  private userModes = inject(UserModesService);

  handle = computed(() => this.auth.user()?.handle ?? null);
  hasComplete = computed(() => this.userModes.hasComplete());
  myGroupsCount = computed(() => this.userModes.groups().length);

  loading = signal(true);
  upcoming = signal<UpcomingMatch[]>([]);
  upcomingTodayCount = signal(0);

  picksSub = computed(() => {
    const today = this.upcomingTodayCount();
    if (today > 0) return today === 1 ? '1 partido hoy' : `${today} partidos hoy`;
    if (this.upcoming().length > 0) return 'Próximos: ver lista';
    return 'Hacer mis picks';
  });

  groupsSub = computed(() => {
    const n = this.myGroupsCount();
    if (n === 0) return 'Crea o únete a uno';
    return n === 1 ? '1 grupo activo' : `${n} grupos activos`;
  });

  rankingSub = computed(() =>
    this.userModes.eligibleForGlobalRanking() ? 'Ver mi posición' : 'Solo modo completo',
  );

  async ngOnInit() {
    this.loading.set(true);
    try {
      const [matchesRes, teamsRes] = await Promise.all([
        this.api.listMatches(TOURNAMENT_ID),
        this.api.listTeams(TOURNAMENT_ID),
      ]);
      const teamMap = new Map<string, { name: string; flag: string }>(
        (teamsRes.data ?? [])
          .filter((t): t is NonNullable<typeof t> => !!t && !!t.slug)
          .map((t) => [
            t.slug,
            { name: t.name ?? t.slug, flag: t.flagCode ?? '' },
          ]),
      );

      const now = Date.now();
      const todayKey = new Date().toDateString();

      const all = (matchesRes.data ?? []).filter(
        (m): m is NonNullable<typeof m> => !!m && !!m.kickoffAt && !!m.id,
      );
      const todayCount = all.filter((m) => {
        const ko = new Date(m.kickoffAt!);
        return ko.toDateString() === todayKey && ko.getTime() >= now - 2 * 3600 * 1000;
      }).length;
      this.upcomingTodayCount.set(todayCount);

      const upcoming = all
        .filter((m) => new Date(m.kickoffAt!).getTime() > now - 2 * 3600 * 1000)
        .sort((a, b) =>
          new Date(a.kickoffAt!).getTime() - new Date(b.kickoffAt!).getTime(),
        )
        .slice(0, 2)
        .map((m) => {
          const ko = new Date(m.kickoffAt!);
          const home = teamMap.get(m.homeTeamId) ?? { name: m.homeTeamId, flag: '' };
          const away = teamMap.get(m.awayTeamId) ?? { name: m.awayTeamId, flag: '' };
          const isLive = m.status === 'IN_PROGRESS' || m.status === 'LIVE';
          return {
            id: m.id,
            homeName: home.name,
            awayName: away.name,
            homeFlag: home.flag,
            awayFlag: away.flag,
            kickoffLabel: this.formatKickoff(ko),
            countdown: this.formatCountdown(ko, now),
            isLive,
          };
        });

      this.upcoming.set(upcoming);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn('[home] failed to load upcoming matches', e);
    } finally {
      this.loading.set(false);
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
    if (h < 1) return 'pronto';
    if (h < 24) return `en ${h}h`;
    const d = Math.round(h / 24);
    return d === 1 ? 'mañana' : `en ${d}d`;
  }
}
