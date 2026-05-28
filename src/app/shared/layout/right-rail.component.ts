import { Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ApiService } from '../../core/api/api.service';
import { AuthService } from '../../core/auth/auth.service';
import { getUrl } from 'aws-amplify/storage';

const TOURNAMENT_ID = 'mundial-2026';
const NEWS_HUB_URL = 'https://golgana.net/news';

interface NextMatchVm {
  id: string;
  homeName: string;
  awayName: string;
  homeFlag: string;
  awayFlag: string;
  kickoffAt: string;
  venue: string | null;
  phaseLabel: string;
  countdown: { d: string; h: string; m: string; s: string };
  isLive: boolean;
  myPick: { home: number; away: number; winnerName: string | null } | null;
}

interface UpcomingPickRow {
  id: string;
  dateLabel: string;
  matchLabel: string;
  hasPick: boolean;
  pickLabel: string | null;
  countdownLabel: string | null;
}

interface NewsItemVm {
  id: string;
  title: string;
  externalUrl: string;
  resolvedImageUrl: string | null;
  relativeTime: string;
}

/**
 * Aside derecho design-v3, sticky a 320px en desktop ≥1100px. Tres bloques
 * verticales: próximo partido (dark card con countdown + flags + mi pick),
 * siguientes picks (4 filas hacia /picks/match/:id) y noticias (hero card +
 * 3 rows desde Article.listPublishedArticles). Se colapsa a bloque normal
 * debajo del main en tablet/mobile.
 */
@Component({
  standalone: true,
  selector: 'app-right-rail',
  imports: [RouterLink],
  template: `
    <aside class="side">

      @if (nextMatch(); as m) {
        <div class="np">
          <div class="np__bg"></div>
          <div class="np__in">
            <div class="np__top">
              <span class="np__live">{{ m.isLive ? '● EN VIVO' : 'Próximo' }}</span>
              <span class="np__tag">{{ m.phaseLabel }}</span>
            </div>
            <div class="np__hl">El <em>próximo</em> partido</div>
            <div class="np__sub">{{ m.venue ?? 'Sede por confirmar' }}</div>

            @if (!m.isLive) {
              <div class="np__cd">
                <div class="np__cd__c"><div class="np__cd__n">{{ m.countdown.d }}</div><div class="np__cd__l">Días</div></div>
                <div class="np__cd__c"><div class="np__cd__n">{{ m.countdown.h }}</div><div class="np__cd__l">Hrs</div></div>
                <div class="np__cd__c"><div class="np__cd__n">{{ m.countdown.m }}</div><div class="np__cd__l">Min</div></div>
                <div class="np__cd__c"><div class="np__cd__n">{{ m.countdown.s }}</div><div class="np__cd__l">Seg</div></div>
              </div>
            }

            <div class="np__t">
              <div class="np__tm np__tm--home">
                <div class="np__fl">
                  @if (m.homeFlag) {
                    <span class="fi fi-{{ m.homeFlag.toLowerCase() }}"></span>
                  } @else {
                    🏳️
                  }
                </div>
                <div class="np__n">{{ m.homeName }}</div>
              </div>
              <div class="np__vs"><div class="np__vs__l">VS</div></div>
              <div class="np__tm">
                <div class="np__fl">
                  @if (m.awayFlag) {
                    <span class="fi fi-{{ m.awayFlag.toLowerCase() }}"></span>
                  } @else {
                    🏳️
                  }
                </div>
                <div class="np__n">{{ m.awayName }}</div>
              </div>
            </div>

            @if (m.myPick) {
              <div class="np__pk">
                <div>
                  <span class="np__pk__l">Tu pick</span>
                  <strong>{{ m.myPick.home }} – {{ m.myPick.away }}
                    @if (m.myPick.winnerName) { <em>{{ m.myPick.winnerName }}</em> }
                  </strong>
                </div>
                <a class="np__pk__e" [routerLink]="['/picks/match', m.id]">Editar</a>
              </div>
            } @else {
              <a class="np__pk np__pk--cta" [routerLink]="['/picks/match', m.id]">
                <div>
                  <span class="np__pk__l">Sin pick</span>
                  <strong>Hacer pick →</strong>
                </div>
              </a>
            }

            <a class="np__cta" [routerLink]="['/picks/match', m.id]">Ver previa completa →</a>
          </div>
        </div>
      }

      @if (upcoming().length > 0) {
        <div class="up">
          <div class="up__h">
            <span>Siguientes picks</span>
            <a routerLink="/picks">Ver todos →</a>
          </div>
          @for (r of upcoming(); track r.id) {
            <a class="up__r" [routerLink]="['/picks/match', r.id]">
              <div class="up__r__h">
                <span>{{ r.dateLabel }} · {{ r.matchLabel }}</span>
                @if (r.hasPick) {
                  <span class="ok">✓ Pick</span>
                } @else {
                  <span class="pe">⚠ {{ r.countdownLabel }}</span>
                }
              </div>
              <div class="up__r__t" [class.m]="!r.hasPick">
                {{ r.hasPick ? r.pickLabel : 'Pendiente' }}
              </div>
            </a>
          }
        </div>
      }

      @if (newsHero(); as hero) {
        <div class="news">
          <a [href]="hero.externalUrl" target="_blank" rel="noopener noreferrer" class="news__hero">
            @if (hero.resolvedImageUrl) {
              <img [src]="hero.resolvedImageUrl" [alt]="hero.title">
            } @else {
              <img src="assets/news-placeholder.svg" [alt]="hero.title">
            }
            <div class="news__hero__b">
              <div class="news__hero__k">Destacada · {{ hero.relativeTime }}</div>
              <div class="news__hero__t">{{ hero.title }}</div>
            </div>
          </a>
          @if (newsList().length > 0) {
            <div class="news__list">
              @for (a of newsList(); track a.id) {
                <a [href]="a.externalUrl" target="_blank" rel="noopener noreferrer" class="news__row">
                  <div class="news__row__img"
                       [style.backgroundImage]="a.resolvedImageUrl ? 'url(' + a.resolvedImageUrl + ')' : null"></div>
                  <div class="news__row__b">
                    <div class="news__row__k">{{ a.relativeTime }}</div>
                    <div class="news__row__t">{{ a.title }}</div>
                  </div>
                </a>
              }
              <a [href]="newsHubUrl" target="_blank" rel="noopener noreferrer" class="news__more">Ver todas →</a>
            </div>
          }
        </div>
      }
    </aside>
  `,
  styles: [`
    :host { display: contents; }

    .side {
      position: sticky;
      top: 24px;
      align-self: start;
      display: flex;
      flex-direction: column;
      gap: 14px;
      max-height: calc(100vh - 48px);
      overflow-y: auto;
    }
    /* Sin esto los hijos heredan flex-shrink:1 y la dark card .np se
       aplasta a 1px de alto cuando todos los bloques juntos exceden
       max-height. Con shrink:0 mantienen su alto natural y .side
       scrollea internamente. */
    .side > * { flex-shrink: 0; }
    .side::-webkit-scrollbar { width: 4px; }
    .side::-webkit-scrollbar-thumb { background: rgba(0,0,0,0.15); border-radius: 99px; }

    @media (max-width: 1099px) {
      .side { position: static; max-height: none; overflow: visible; }
    }

    /* Next match — see polla-v3.html .np */
    .np {
      background: #0a0a0a;
      color: #fff;
      border-radius: 18px;
      position: relative;
      overflow: hidden;
      border: 1px solid rgba(2,204,116,0.3);
      box-shadow: 0 12px 40px rgba(0,0,0,0.18);
    }
    .np__bg {
      position: absolute; inset: 0; z-index: 0;
      background: linear-gradient(160deg, #0a0a0a 0%, #0a3d20 55%, #067a4a 120%);
    }
    .np__bg::before {
      content: ""; position: absolute; inset: 0;
      background:
        radial-gradient(80% 50% at 50% 0%, rgba(2,204,116,0.5), transparent 65%),
        radial-gradient(60% 60% at 100% 100%, rgba(2,204,116,0.2), transparent 60%);
    }
    .np__in { position: relative; z-index: 1; padding: 22px; }
    .np__top { display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px; }
    .np__live {
      display: inline-flex; align-items: center; gap: 8px;
      background: rgba(2,204,116,0.18);
      border: 1px solid rgba(2,204,116,0.4);
      border-radius: 999px;
      padding: 5px 12px;
      font-size: 10px; letter-spacing: 0.14em; text-transform: uppercase;
      font-weight: 700;
      color: var(--color-primary-green);
    }
    .np__tag { font-size: 10px; color: rgba(255,255,255,0.55); letter-spacing: 0.08em; }
    .np__hl { font-family: var(--font-display); font-size: 20px; line-height: 1.1; color: #fff; margin-bottom: 4px; }
    .np__hl em { font-style: normal; color: var(--color-primary-green); }
    .np__sub { font-size: 11px; color: rgba(255,255,255,0.55); margin-bottom: 16px; }

    .np__cd { display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; margin-bottom: 18px; }
    .np__cd__c {
      background: rgba(255,255,255,0.05);
      border: 1px solid rgba(255,255,255,0.12);
      border-radius: 10px;
      padding: 10px 0 8px;
      text-align: center;
    }
    .np__cd__n { font-family: var(--font-display); font-size: 26px; line-height: 1; color: #fff; }
    .np__cd__l { font-size: 9px; letter-spacing: 0.14em; text-transform: uppercase; color: rgba(255,255,255,0.5); margin-top: 4px; font-weight: 600; }

    .np__t {
      display: grid; grid-template-columns: 1fr auto 1fr; gap: 14px;
      align-items: center; padding: 18px 4px;
      border-top: 1px solid rgba(255,255,255,0.08);
      border-bottom: 1px solid rgba(255,255,255,0.08);
      margin-bottom: 14px;
      background: rgba(255,255,255,0.02);
    }
    .np__tm { text-align: center; display: flex; flex-direction: column; gap: 8px; align-items: center; }
    .np__fl {
      width: 54px; height: 54px;
      border-radius: 50%;
      background: rgba(255,255,255,0.08);
      display: grid; place-items: center;
      font-size: 32px;
      border: 2px solid rgba(255,255,255,0.18);
    }
    .np__tm--home .np__fl { border-color: rgba(2,204,116,0.5); box-shadow: 0 0 0 4px rgba(2,204,116,0.12); }
    .np__n { font-family: var(--font-display); font-size: 17px; line-height: 1; color: #fff; }
    .np__vs { display: flex; flex-direction: column; align-items: center; gap: 3px; }
    .np__vs__l { font-family: var(--font-display); font-size: 20px; color: var(--color-primary-green); line-height: 1; }

    .np__pk {
      display: flex; justify-content: space-between; align-items: center;
      padding: 12px 14px;
      background: linear-gradient(90deg, rgba(2,204,116,0.22), rgba(2,204,116,0.08));
      border: 1px solid rgba(2,204,116,0.45);
      border-radius: 10px;
      margin-bottom: 8px;
      text-decoration: none;
      color: inherit;
    }
    .np__pk__l { font-size: 10px; letter-spacing: 0.12em; text-transform: uppercase; color: rgba(255,255,255,0.7); font-weight: 600; display: block; margin-bottom: 2px; }
    .np__pk strong { font-family: var(--font-display); font-size: 22px; color: #fff; display: flex; align-items: center; gap: 6px; }
    .np__pk strong em { font-style: normal; font-size: 11px; letter-spacing: 0.06em; text-transform: uppercase; font-family: var(--font-primary); font-weight: 700; background: rgba(2,204,116,0.35); padding: 3px 8px; border-radius: 5px; }
    .np__pk__e {
      color: var(--color-primary-green);
      font-size: 11px; text-decoration: none; font-weight: 700;
      letter-spacing: 0.08em; text-transform: uppercase;
      padding: 6px 10px;
      background: rgba(2,204,116,0.15);
      border: 1px solid rgba(2,204,116,0.3);
      border-radius: 6px;
      transition: background 0.15s ease, border-color 0.15s ease;
    }
    .np__pk__e:hover { background: rgba(2,204,116,0.25); border-color: rgba(2,204,116,0.5); }
    .np__pk__e:focus-visible {
      outline: 2px solid var(--color-primary-green);
      outline-offset: 2px;
      background: rgba(2,204,116,0.25);
    }
    .np__cta {
      display: flex; align-items: center; justify-content: center; gap: 6px;
      width: 100%; padding: 10px;
      background: transparent;
      border: 1px solid rgba(255,255,255,0.15);
      border-radius: 8px;
      color: rgba(255,255,255,0.8);
      text-decoration: none;
      font-size: 11px;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      font-weight: 600;
      box-sizing: border-box;
      transition: border-color 0.15s ease, background 0.15s ease, color 0.15s ease;
    }
    .np__cta:hover { border-color: rgba(255,255,255,0.35); background: rgba(255,255,255,0.05); color: #fff; }
    .np__cta:focus-visible {
      outline: 2px solid var(--color-primary-green);
      outline-offset: 2px;
      color: #fff;
    }

    /* Upcoming picks */
    .up {
      background: #fff;
      border: 1px solid var(--color-line);
      border-radius: 14px;
      padding: 16px;
    }
    .up__h {
      font-size: 11px; letter-spacing: 0.16em; text-transform: uppercase;
      color: var(--color-text-muted);
      margin-bottom: 10px;
      display: flex; justify-content: space-between;
    }
    .up__h a { color: var(--color-primary-green); font-weight: 600; text-decoration: none; }
    .up__r {
      padding: 8px 0;
      border-bottom: 1px solid rgba(0,0,0,0.06);
      text-decoration: none;
      color: inherit;
      display: flex; flex-direction: column; gap: 3px;
    }
    .up__r:last-child { border-bottom: 0; }
    .up__r__h { display: flex; justify-content: space-between; font-size: 10px; color: var(--color-text-muted); }
    .up__r__h .ok { color: var(--color-primary-green); font-weight: 700; }
    .up__r__h .pe { color: #dc2626; font-weight: 700; }
    .up__r__t { font-family: var(--font-display); font-size: 13px; }
    .up__r__t.m { color: var(--color-text-muted); }

    /* News */
    .news { display: flex; flex-direction: column; gap: 10px; }
    .news__hero {
      background: #0a0a0a;
      border-radius: 12px;
      overflow: hidden;
      text-decoration: none;
      color: #fff;
      position: relative;
      aspect-ratio: 5 / 3;
      display: flex;
      align-items: end;
    }
    .news__hero img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; opacity: 0.55; }
    .news__hero::before {
      content: ""; position: absolute; inset: 0;
      background: linear-gradient(to top, rgba(0,0,0,0.95) 0%, transparent 60%);
      z-index: 1;
    }
    .news__hero__b { position: relative; z-index: 2; padding: 14px; }
    .news__hero__k { font-size: 10px; letter-spacing: 0.14em; text-transform: uppercase; color: var(--color-primary-green); font-weight: 700; margin-bottom: 5px; }
    .news__hero__t { font-family: var(--font-display); font-size: 16px; line-height: 1.1; }
    .news__list {
      background: #fff;
      border: 1px solid var(--color-line);
      border-radius: 12px;
      padding: 4px 14px;
    }
    .news__row {
      display: flex; gap: 10px;
      padding: 11px 0;
      border-bottom: 1px solid rgba(0,0,0,0.05);
      text-decoration: none;
      color: inherit;
    }
    .news__row:last-of-type { border-bottom: 0; }
    .news__row__img {
      width: 46px; height: 46px;
      border-radius: 7px;
      background: linear-gradient(135deg, #0a3d20, #067a4a) center/cover no-repeat;
      flex-shrink: 0;
    }
    .news__row__b { flex: 1; min-width: 0; }
    .news__row__k { font-size: 9px; letter-spacing: 0.14em; text-transform: uppercase; color: var(--color-primary-green); font-weight: 700; margin-bottom: 3px; }
    .news__row__t { font-family: var(--font-display); font-size: 13px; line-height: 1.15; }
    .news__more {
      display: block; padding: 11px 0;
      text-align: center;
      font-size: 11px;
      letter-spacing: 0.12em;
      text-transform: uppercase;
      color: var(--color-primary-green);
      text-decoration: none;
      font-weight: 600;
    }
  `],
})
export class RightRailComponent implements OnInit, OnDestroy {
  private api = inject(ApiService);
  private auth = inject(AuthService);

  readonly newsHubUrl = NEWS_HUB_URL;

  nextMatch = signal<NextMatchVm | null>(null);
  upcoming = signal<UpcomingPickRow[]>([]);
  newsHero = signal<NewsItemVm | null>(null);
  newsList = signal<NewsItemVm[]>([]);

  private tickerId?: ReturnType<typeof setInterval>;
  private rawNext: { kickoffAt: string } | null = null;

  async ngOnInit() {
    void this.loadNextAndUpcoming();
    void this.loadNews();
    this.tickerId = setInterval(() => this.refreshCountdown(), 1000);
  }

  ngOnDestroy(): void {
    if (this.tickerId) clearInterval(this.tickerId);
  }

  private async loadNextAndUpcoming() {
    const userId = this.auth.user()?.sub ?? '';
    let nextLoaded = false;
    let upcomingLoaded = false;
    try {
      const [matchesRes, teamsRes, picksRes] = await Promise.all([
        this.api.listMatches(TOURNAMENT_ID),
        this.api.listTeams(TOURNAMENT_ID),
        userId
          ? this.api.myPicks(userId)
          : Promise.resolve({ data: [] as ReadonlyArray<{ matchId: string; homeScorePred: number; awayScorePred: number }> }),
      ]);

      const teamMap = new Map<string, { name: string; flag: string }>();
      for (const t of (teamsRes.data ?? [])) {
        if (t?.slug) teamMap.set(t.slug, { name: t.name ?? t.slug, flag: t.flagCode ?? '' });
      }
      const pickMap = new Map<string, { home: number; away: number }>();
      for (const p of ((picksRes.data ?? []) as ReadonlyArray<{ matchId: string; homeScorePred: number; awayScorePred: number }>)) {
        pickMap.set(p.matchId, { home: p.homeScorePred, away: p.awayScorePred });
      }

      const now = Date.now();
      type MRow = {
        id: string;
        kickoffAt: string;
        homeTeamId: string;
        awayTeamId: string;
        status?: string | null;
        venue?: string | null;
      };
      const all = ((matchesRes.data ?? []) as ReadonlyArray<MRow>)
        .filter((m): m is MRow => !!m?.id && !!m?.kickoffAt)
        .filter((m) => new Date(m.kickoffAt).getTime() > now - 2 * 3600 * 1000)
        .sort((a, b) => new Date(a.kickoffAt).getTime() - new Date(b.kickoffAt).getTime());

      const first = all[0];
      if (first) {
        const ko = new Date(first.kickoffAt);
        const home = teamMap.get(first.homeTeamId) ?? { name: first.homeTeamId, flag: '' };
        const away = teamMap.get(first.awayTeamId) ?? { name: first.awayTeamId, flag: '' };
        const myPick = pickMap.get(first.id);
        const isLive = first.status === 'IN_PROGRESS' || first.status === 'LIVE';
        let winnerName: string | null = null;
        if (myPick) {
          if (myPick.home > myPick.away) winnerName = home.name;
          else if (myPick.away > myPick.home) winnerName = away.name;
        }
        this.rawNext = { kickoffAt: first.kickoffAt };
        this.nextMatch.set({
          id: first.id,
          homeName: home.name,
          awayName: away.name,
          homeFlag: home.flag,
          awayFlag: away.flag,
          kickoffAt: first.kickoffAt,
          venue: first.venue ?? null,
          phaseLabel: 'Mundial 2026',
          countdown: this.computeCountdown(ko.getTime(), now),
          isLive,
          myPick: myPick ? { home: myPick.home, away: myPick.away, winnerName } : null,
        });
        nextLoaded = true;
      }

      const upcomingRows: UpcomingPickRow[] = all.slice(1, 5).map((m) => {
        const ko = new Date(m.kickoffAt);
        const home = teamMap.get(m.homeTeamId) ?? { name: m.homeTeamId, flag: '' };
        const away = teamMap.get(m.awayTeamId) ?? { name: m.awayTeamId, flag: '' };
        const myPick = pickMap.get(m.id);
        return {
          id: m.id,
          dateLabel: this.formatShortDate(ko),
          matchLabel: `${this.shortCode(home.name)} vs ${this.shortCode(away.name)}`,
          hasPick: !!myPick,
          pickLabel: myPick
            ? `${myPick.home}-${myPick.away} ${myPick.home >= myPick.away ? home.name : away.name}`
            : null,
          countdownLabel: !myPick ? this.formatCountdownLabel(ko.getTime() - Date.now()) : null,
        };
      });
      this.upcoming.set(upcomingRows);
      if (upcomingRows.length > 0) upcomingLoaded = true;
    } catch (e) {
      console.warn('[right-rail] load next/upcoming failed', e);
    }
    // Fallback: si la API no devolvió un próximo partido o una lista de
    // upcoming (caso típico de sandbox sin fixtures), sembramos mocks
    // para que ambos bloques sean visibles. Cuando el admin cargue
    // partidos reales, este fallback no se activa.
    if (!nextLoaded) {
      const seed = this.seedNextMatch();
      this.rawNext = { kickoffAt: seed.kickoffAt };
      this.nextMatch.set(seed);
    }
    if (!upcomingLoaded) {
      this.upcoming.set(this.seedUpcoming());
    }
  }

  /** Próximo partido mock — visible cuando no hay fixtures cargados. */
  private seedNextMatch(): NextMatchVm {
    const ko = new Date(Date.now() + 3 * 86_400_000 + 5 * 3_600_000);
    return {
      id: 'seed-next',
      homeName: 'México',
      awayName: 'Argentina',
      homeFlag: 'mx',
      awayFlag: 'ar',
      kickoffAt: ko.toISOString(),
      venue: 'Estadio Azteca · Ciudad de México',
      phaseLabel: 'Mundial 2026 · Grupo A',
      countdown: this.computeCountdown(ko.getTime(), Date.now()),
      isLive: false,
      myPick: null,
    };
  }

  /** Lista de siguientes picks mock — 4 filas. */
  private seedUpcoming(): UpcomingPickRow[] {
    const now = Date.now();
    const items: Array<{ home: string; away: string; hoursAhead: number; hasPick: boolean; pickH?: number; pickA?: number }> = [
      { home: 'Brasil', away: 'España', hoursAhead: 28, hasPick: true, pickH: 2, pickA: 1 },
      { home: 'Francia', away: 'Inglaterra', hoursAhead: 50, hasPick: false },
      { home: 'Países Bajos', away: 'Croacia', hoursAhead: 74, hasPick: true, pickH: 1, pickA: 1 },
      { home: 'Portugal', away: 'Uruguay', hoursAhead: 96, hasPick: false },
    ];
    return items.map((m, i) => {
      const ko = new Date(now + m.hoursAhead * 3_600_000);
      return {
        id: `seed-up-${i}`,
        dateLabel: this.formatShortDate(ko),
        matchLabel: `${this.shortCode(m.home)} vs ${this.shortCode(m.away)}`,
        hasPick: m.hasPick,
        pickLabel: m.hasPick
          ? `${m.pickH}-${m.pickA} ${m.pickH! >= m.pickA! ? m.home : m.away}`
          : null,
        countdownLabel: m.hasPick ? null : this.formatCountdownLabel(m.hoursAhead * 3_600_000),
      };
    });
  }

  private async loadNews() {
    let enriched: NewsItemVm[] = [];
    try {
      const res = await this.api.listPublishedArticles(4);
      const rows = ((res.data ?? []) as ReadonlyArray<{
        id: string; title: string; externalUrl: string; imageKey?: string | null; publishedAt: string;
      }>).slice();
      enriched = await Promise.all(rows.map(async (a): Promise<NewsItemVm> => {
        let resolvedImageUrl: string | null = null;
        if (a.imageKey) {
          try {
            const { url } = await getUrl({ path: a.imageKey, options: { expiresIn: 3600 } });
            resolvedImageUrl = url.toString();
          } catch { /* ignore */ }
        }
        return {
          id: a.id,
          title: a.title,
          externalUrl: a.externalUrl,
          resolvedImageUrl,
          relativeTime: this.formatRelative(a.publishedAt),
        };
      }));
    } catch (e) {
      console.warn('[right-rail] load news failed', e);
    }
    // Fallback a noticias seed para que el bloque tenga contenido visible
    // hasta que el admin publique noticias reales o conectemos una fuente
    // externa (RSS / news API). Remover cuando haya feed productivo.
    if (enriched.length === 0) {
      enriched = this.seedNews();
    }
    this.newsHero.set(enriched[0] ?? null);
    this.newsList.set(enriched.slice(1));
  }

  /** Noticias mock — visibles hasta que existan Article reales en DB. */
  private seedNews(): NewsItemVm[] {
    const now = Date.now();
    const items: Array<{ title: string; hoursAgo: number }> = [
      { title: 'Sorteo confirmado: México estrena el Mundial en Estadio Azteca', hoursAgo: 4 },
      { title: 'Mbappé llega tocado al microciclo de Francia: alerta en la concentración', hoursAgo: 14 },
      { title: 'Argentina anuncia su lista preliminar de 35 con sorpresas', hoursAgo: 28 },
      { title: 'Análisis: el grupo de la muerte que nadie quiere enfrentar', hoursAgo: 50 },
    ];
    return items.map((item, idx) => ({
      id: `seed-${idx}`,
      title: item.title,
      externalUrl: NEWS_HUB_URL,
      resolvedImageUrl: null,
      relativeTime: this.formatRelative(new Date(now - item.hoursAgo * 3_600_000).toISOString()),
    }));
  }

  private refreshCountdown() {
    if (!this.rawNext) return;
    const ko = new Date(this.rawNext.kickoffAt).getTime();
    const now = Date.now();
    const cur = this.nextMatch();
    if (!cur || cur.isLive) return;
    if (ko - now <= 0) return;
    this.nextMatch.set({ ...cur, countdown: this.computeCountdown(ko, now) });
  }

  private computeCountdown(targetMs: number, nowMs: number) {
    const diff = Math.max(0, targetMs - nowMs);
    const d = Math.floor(diff / 86_400_000);
    const h = Math.floor((diff % 86_400_000) / 3_600_000);
    const m = Math.floor((diff % 3_600_000) / 60_000);
    const s = Math.floor((diff % 60_000) / 1000);
    const p2 = (n: number) => (n < 10 ? '0' : '') + n;
    return { d: String(d), h: p2(h), m: p2(m), s: p2(s) };
  }

  private static readonly shortDateFmt = new Intl.DateTimeFormat('es-EC', {
    timeZone: 'America/Guayaquil',
    day: '2-digit',
    month: '2-digit',
  });
  private static readonly fallbackDateFmt = new Intl.DateTimeFormat('es-EC', {
    timeZone: 'America/Guayaquil',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
  private static readonly relativeFmt = new Intl.RelativeTimeFormat('es-EC', {
    numeric: 'auto',
    style: 'long',
  });

  private formatShortDate(d: Date): string {
    return RightRailComponent.shortDateFmt.format(d);
  }

  /** 3-letter uppercase shortcode (used in "ARG vs BRA" labels). */
  private shortCode(name: string): string {
    return name.slice(0, 3).toUpperCase();
  }

  private formatCountdownLabel(diffMs: number): string {
    if (diffMs < 0) return 'cerrado';
    const minutes = Math.round(diffMs / 60_000);
    if (minutes < 60) return RightRailComponent.relativeFmt.format(minutes, 'minute');
    const hours = Math.round(diffMs / 3_600_000);
    if (hours < 24) return RightRailComponent.relativeFmt.format(hours, 'hour');
    return RightRailComponent.relativeFmt.format(Math.round(hours / 24), 'day');
  }

  private formatRelative(iso: string): string {
    const diff = new Date(iso).getTime() - Date.now();
    const minutes = Math.round(diff / 60_000);
    if (Math.abs(minutes) < 60) return RightRailComponent.relativeFmt.format(minutes, 'minute');
    const hours = Math.round(diff / 3_600_000);
    if (Math.abs(hours) < 24) return RightRailComponent.relativeFmt.format(hours, 'hour');
    const days = Math.round(hours / 24);
    if (Math.abs(days) < 7) return RightRailComponent.relativeFmt.format(days, 'day');
    return RightRailComponent.fallbackDateFmt.format(new Date(iso));
  }
}
