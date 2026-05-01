import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { getUrl } from 'aws-amplify/storage';
import { ApiService } from '../../core/api/api.service';
import { AuthService } from '../../core/auth/auth.service';
import { UserModesService } from '../../core/user/user-modes.service';
import { TimeService } from '../../core/time/time.service';
import { PickCardComponent } from './pick-card.component';
import { SponsorRedeemComponent } from './sponsor-redeem.component';

type BannerSlot = 'banner1' | 'banner2' | 'banner3';
interface SponsorBanner {
  sponsorId: string;
  sponsorName: string;
  url: string | null;
}

const TOURNAMENT_ID = 'mundial-2026';

interface MatchWithMeta {
  id: string;
  kickoffAt: string;
  phaseId: string;
  homeTeamId: string;
  awayTeamId: string;
  homeScore?: number | null;
  awayScore?: number | null;
  status?: string;
  phaseLabel: string;
  homeTeamName: string;
  awayTeamName: string;
  homeFlag: string;
  awayFlag: string;
  homeCrestUrl: string | null;
  awayCrestUrl: string | null;
  pick: {
    homeScorePred: number;
    awayScorePred: number;
    pointsEarned?: number | null;
    exactScore?: boolean | null;
    correctResult?: boolean | null;
  } | null;
}

interface Totals {
  points: number;
  exactCount: number;
  resultCount: number;
  globalRank: number | null;
}

interface DayBlock {
  dateKey: string;
  label: string;
  matches: MatchWithMeta[];
}

@Component({
  standalone: true,
  selector: 'app-picks-list',
  imports: [PickCardComponent, RouterLink, RouterLinkActive, SponsorRedeemComponent],
  template: `
    <section class="page">

      <!-- Header con stats -->
      <header class="page__header">
        <div>
          <div class="kicker">MUNDIAL 2026 · TU POLLA</div>
          <h1 class="page__title">Mis picks</h1>
        </div>
        <div class="page__stats">
          <div class="page__stat">
            <div class="num">{{ totals().points }}</div>
            <div class="lbl">pts</div>
          </div>
          <div class="page__stat">
            <div class="num">{{ totals().exactCount }}</div>
            <div class="lbl">exactos</div>
          </div>
          <div class="page__stat">
            <div class="num">{{ totals().resultCount }}</div>
            <div class="lbl">resultados</div>
          </div>
          <div class="page__stat">
            <div class="num">{{ totals().globalRank ? '#' + totals().globalRank : '—' }}</div>
            <div class="lbl">global</div>
          </div>
        </div>
      </header>

      <!-- Page tabs (Cronológico / Tabla grupos / Bracket) -->
      <nav class="page-tabs" aria-label="Vistas de picks">
        <a class="page-tabs__item" routerLink="/picks"
           routerLinkActive="is-active" [routerLinkActiveOptions]="{exact: true}">
          Cronológico
        </a>
        <a class="page-tabs__item" routerLink="/picks/group-stage"
           routerLinkActive="is-active">
          Tabla grupos
        </a>
        <a class="page-tabs__item" routerLink="/picks/bracket"
           routerLinkActive="is-active">
          Bracket
        </a>
      </nav>

      <!-- Layout 2 cols (rail solo desktop ≥1200) -->
      <div class="picks-layout">

        <div>

          <!-- Sub seg (Próximos / Jugados) -->
          <div class="picks-sub">
            <div class="seg" style="max-width:300px;" role="tablist">
              <button type="button" class="seg__item"
                      [class.is-active]="tab() === 'upcoming'"
                      (click)="tab.set('upcoming')">
                Próximos · {{ upcomingCount() }}
              </button>
              <button type="button" class="seg__item"
                      [class.is-active]="tab() === 'played'"
                      (click)="tab.set('played')">
                Jugados · {{ playedCount() }}
              </button>
            </div>
          </div>

          @if (!hasComplete()) {
            <div class="hint-banner">
              <strong>Modo completo no activo.</strong>
              Podés ver el calendario, pero los marcadores que predigás
              acá no contarán hasta que estés en un grupo modo completo.
              <a routerLink="/groups/new" class="link-green">Crear grupo →</a>
            </div>
          }
          @if (loading()) {
            <p class="loading-msg">Cargando partidos…</p>
          } @else if (tab() === 'upcoming') {
            @if (visibleDays().length === 0) {
              <div class="empty-block">
                <h3>No hay partidos próximos en este rango</h3>
                <p>
                  @if (allUpcomingDays().length > 0) {
                    Probá cargando los próximos días.
                  } @else {
                    Ya jugaste todos los partidos del torneo o el admin no
                    cargó más fixtures.
                  }
                </p>
              </div>
            }
            @for (day of visibleDays(); track day.dateKey) {
              <div class="day-kicker">📅 {{ day.label }} · {{ day.matches.length }} {{ day.matches.length === 1 ? 'partido' : 'partidos' }}</div>
              @for (m of day.matches; track m.id) {
                <app-pick-card
                  [match]="m"
                  [phaseLabel]="m.phaseLabel"
                  [existingPick]="m.pick"
                  [pointsEarned]="m.pick?.pointsEarned" />
              }
            }
            @if (canLoadMore()) {
              <button class="btn-wf btn-wf--block" type="button"
                      (click)="loadNextTwoDays()" style="margin-top:14px;">
                Próximos 2 días →
              </button>
            }
          } @else {
            <!-- Jugados: lista plana por fecha desc -->
            @if (playedMatches().length === 0) {
              <div class="empty-block">
                <h3>Aún no jugaste partidos</h3>
                <p>Tus picks jugados aparecerán acá con el resultado y los puntos.</p>
              </div>
            } @else {
              @for (m of playedMatches(); track m.id) {
                <app-pick-card
                  [match]="m"
                  [phaseLabel]="m.phaseLabel"
                  [existingPick]="m.pick"
                  [pointsEarned]="m.pick?.pointsEarned" />
              }
            }
          }

          <!-- Banners de sponsors: 3 hileras, una por slot. Solo visible
               si hay sponsors con imagen en ese slot. -->
          @for (slot of bannerSlotKeys; track slot) {
            @let banners = sponsorBannersForSlot(slot);
            @if (banners.length > 0) {
              <section class="sponsor-banner-row">
                @for (b of banners; track b.sponsorId) {
                  <div class="sponsor-banner-tile" [title]="b.sponsorName">
                    @if (b.url) {
                      <img [src]="b.url" [alt]="b.sponsorName" loading="lazy">
                    } @else {
                      <div class="sponsor-banner-tile__placeholder">{{ b.sponsorName }}</div>
                    }
                  </div>
                }
              </section>
            }
          }

        </div>

        <!-- Right rail (desktop ≥1200) -->
        <aside>

          @if (primaryPrizeGroup(); as p) {
            <div class="rail-section">
              <div class="rail-premios">
                <div class="rail-premios__head">
                  <span class="rail-premios__icon">🏆</span>
                  <div>
                    <div class="kicker" style="color:#7a5d00;">PREMIOS · {{ p.groupName.toUpperCase() }}</div>
                    <div class="rail-premios__total">{{ p.totalLabel }}</div>
                  </div>
                </div>
                <div style="background:var(--wf-paper);padding:8px 0;">
                  @if (p.prize1st) {
                    <div class="rail-premios__row">
                      <span style="font-size:14px;">🥇</span>
                      <span class="text-bold">1° lugar</span>
                      <span class="amount">{{ p.prize1st }}</span>
                    </div>
                  }
                  @if (p.prize2nd) {
                    <div class="rail-premios__row">
                      <span style="font-size:14px;">🥈</span>
                      <span class="text-bold">2° lugar</span>
                      <span class="amount">{{ p.prize2nd }}</span>
                    </div>
                  }
                  @if (p.prize3rd) {
                    <div class="rail-premios__row">
                      <span style="font-size:14px;">🥉</span>
                      <span class="text-bold">3° lugar</span>
                      <span class="amount">{{ p.prize3rd }}</span>
                    </div>
                  }
                </div>
              </div>
            </div>
          }

          <div class="rail-section">
            <h3 class="rail-section__title">Sponsors</h3>
            <app-sponsor-redeem />
          </div>

        </aside>
      </div>

    </section>

    <!-- FAB de canjear código (mobile) -->
    <button type="button" class="canjear-fab" (click)="scrollToCanjear()"
            title="Canjear código de sponsor">
      🎁 <span>Canjear código</span>
    </button>
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

    .hint-banner {
      padding: 12px 14px;
      background: var(--wf-warn-soft);
      border: 1px solid rgba(212, 165, 0, 0.4);
      border-radius: 10px;
      font-size: 12px;
      line-height: 1.5;
      color: #7a5d00;
      margin-bottom: 14px;
    }
    .hint-banner strong { color: #3a2c00; }
    .hint-banner a { margin-left: 6px; }

    .link-green {
      color: var(--wf-green-ink);
      font-weight: 700;
      text-decoration: none;
    }

    /* Sponsor banners (preservados del layout previo) */
    .sponsor-banner-row {
      display: flex;
      gap: 8px;
      overflow-x: auto;
      padding: 12px 0;
      margin-top: 18px;
    }
    .sponsor-banner-tile {
      flex: 0 0 auto;
      width: 280px;
      height: 84px;
      background: var(--wf-paper);
      border: 1px solid var(--wf-line);
      border-radius: 8px;
      overflow: hidden;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .sponsor-banner-tile img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }
    .sponsor-banner-tile__placeholder {
      font-size: 12px;
      color: var(--wf-ink-3);
      text-align: center;
      padding: 0 12px;
    }

    /* FAB mobile para canjear código */
    .canjear-fab {
      position: fixed;
      bottom: 76px;
      left: 16px;
      z-index: 50;
      background: var(--wf-warn);
      color: white;
      border: 0;
      padding: 10px 14px;
      border-radius: 999px;
      box-shadow: 0 6px 16px rgba(0,0,0,0.18);
      cursor: pointer;
      font-size: 12px;
      font-weight: 700;
      display: flex;
      align-items: center;
      gap: 6px;
    }
    @media (min-width: 992px) {
      .canjear-fab { display: none; } /* en desktop ya está en el rail */
    }
  `],
})
export class PicksListComponent implements OnInit {
  private api = inject(ApiService);
  private auth = inject(AuthService);
  private userModes = inject(UserModesService);
  private time = inject(TimeService);

  tab = signal<'upcoming' | 'played'>('upcoming');
  matches = signal<MatchWithMeta[]>([]);
  loading = signal(true);
  totals = signal<Totals>({ points: 0, exactCount: 0, resultCount: 0, globalRank: null });
  hasComplete = computed(() => this.userModes.hasComplete());

  daysWindow = signal(2);

  myGroupsList = computed(() => this.userModes.groups());
  myPrizes = computed(() =>
    this.myGroupsList()
      .filter((g) => !!(g.prize1st || g.prize2nd || g.prize3rd))
      .map((g) => ({
        groupId: g.id, groupName: g.name,
        prize1st: g.prize1st, prize2nd: g.prize2nd, prize3rd: g.prize3rd,
      })),
  );

  /** Primer grupo del user con premios definidos — para mostrar en el rail. */
  primaryPrizeGroup = computed(() => {
    const p = this.myPrizes()[0];
    if (!p) return null;
    return { ...p, totalLabel: this.totalLabel(p.prize1st, p.prize2nd, p.prize3rd) };
  });

  bannerSlotKeys: BannerSlot[] = ['banner1', 'banner2', 'banner3'];
  private banners = signal<Record<BannerSlot, SponsorBanner[]>>({
    banner1: [], banner2: [], banner3: [],
  });
  sponsorBannersForSlot(slot: BannerSlot): SponsorBanner[] {
    return this.banners()[slot] ?? [];
  }

  scrollToCanjear() {
    // En mobile el rail está oculto: el bloque de canjear no existe en
    // el DOM. Llevamos al user a una sección visible o abrimos el redeem
    // como página independiente. Por ahora hacemos scroll al final.
    window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
  }

  upcomingCount = computed(() => this.matches().filter((m) => !this.time.isPast(m.kickoffAt)).length);
  playedCount = computed(() => this.matches().filter((m) => this.time.isPast(m.kickoffAt)).length);

  private upcomingSorted = computed(() =>
    this.matches()
      .filter((m) => !this.time.isPast(m.kickoffAt))
      .sort((a, b) => a.kickoffAt.localeCompare(b.kickoffAt)),
  );

  playedMatches = computed(() =>
    this.matches()
      .filter((m) => this.time.isPast(m.kickoffAt))
      .sort((a, b) => b.kickoffAt.localeCompare(a.kickoffAt)),
  );

  allUpcomingDays = computed<DayBlock[]>(() => {
    const byDate = new Map<string, MatchWithMeta[]>();
    for (const m of this.upcomingSorted()) {
      const key = this.dateKey(m.kickoffAt);
      const arr = byDate.get(key) ?? [];
      arr.push(m);
      byDate.set(key, arr);
    }
    const days: DayBlock[] = [];
    for (const [dateKey, matches] of byDate) {
      days.push({ dateKey, label: this.dayLabel(dateKey), matches });
    }
    return days.sort((a, b) => a.dateKey.localeCompare(b.dateKey));
  });

  visibleDays = computed<DayBlock[]>(() =>
    this.allUpcomingDays().slice(0, this.daysWindow()),
  );

  canLoadMore = computed(() => this.daysWindow() < this.allUpcomingDays().length);

  loadNextTwoDays() {
    this.daysWindow.update((n) => n + 2);
  }

  private dateKey(iso: string): string {
    const d = new Date(iso);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }
  private dayLabel(dateKey: string): string {
    const [y, m, d] = dateKey.split('-').map(Number);
    const date = new Date(y!, m! - 1, d!);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    if (date.getTime() === today.getTime()) return 'Hoy';
    if (date.getTime() === tomorrow.getTime()) return 'Mañana';
    return date.toLocaleDateString('es-EC', {
      weekday: 'long', day: '2-digit', month: 'long',
    });
  }

  /** Suma $X de los 3 premios; si alguno no es numérico cae a "N premios". */
  private totalLabel(p1: string | null, p2: string | null, p3: string | null): string {
    const raws = [p1, p2, p3].filter((v): v is string => !!v);
    if (raws.length === 0) return 'Sin definir';
    const numbers = raws.map((s) => {
      const m = s.match(/\$\s*(\d[\d.,]*)/);
      return m ? parseFloat(m[1].replace(/,/g, '')) : null;
    });
    if (numbers.every((n) => n !== null)) {
      const sum = (numbers as number[]).reduce((a, n) => a + n, 0);
      return `$${Math.round(sum)} en juego`;
    }
    return `${raws.length} ${raws.length === 1 ? 'premio' : 'premios'}`;
  }

  async ngOnInit() {
    const userId = this.auth.user()?.sub;
    if (!userId) {
      this.loading.set(false);
      return;
    }

    try {
      const [matchesRes, picksRes, phasesRes, teamsRes, totalsRes, leaderboardRes] = await Promise.all([
        this.api.listMatches(TOURNAMENT_ID),
        this.api.myPicks(userId),
        this.api.listPhases(TOURNAMENT_ID),
        this.api.listTeams(TOURNAMENT_ID),
        this.api.myTotal(userId, TOURNAMENT_ID),
        this.api.listLeaderboard(TOURNAMENT_ID, 200),
      ]);

      const phaseLabels = new Map<string, string>(
        (phasesRes.data ?? []).map((p) => [p.id, p.name]),
      );
      const teamMap = new Map<string, { name: string; flagCode: string; crestUrl: string | null }>(
        (teamsRes.data ?? []).map((t) => [t.slug, {
          name: t.name,
          flagCode: t.flagCode,
          crestUrl: t.crestUrl ?? null,
        }]),
      );
      const pickByMatch = new Map(
        (picksRes.data ?? []).map((p) => [
          p.matchId,
          {
            homeScorePred: p.homeScorePred,
            awayScorePred: p.awayScorePred,
            pointsEarned: p.pointsEarned,
            exactScore: p.exactScore,
            correctResult: p.correctResult,
          },
        ]),
      );

      const enriched: MatchWithMeta[] = (matchesRes.data ?? [])
        .map((m) => {
          const home = teamMap.get(m.homeTeamId);
          const away = teamMap.get(m.awayTeamId);
          return {
            id: m.id,
            kickoffAt: m.kickoffAt,
            phaseId: m.phaseId,
            homeTeamId: m.homeTeamId,
            awayTeamId: m.awayTeamId,
            homeScore: m.homeScore,
            awayScore: m.awayScore,
            status: m.status ?? undefined,
            phaseLabel: phaseLabels.get(m.phaseId) ?? '',
            homeTeamName: home?.name ?? m.homeTeamId,
            awayTeamName: away?.name ?? m.awayTeamId,
            homeFlag: home?.flagCode ?? '',
            awayFlag: away?.flagCode ?? '',
            homeCrestUrl: home?.crestUrl ?? null,
            awayCrestUrl: away?.crestUrl ?? null,
            pick: pickByMatch.get(m.id) ?? null,
          };
        })
        .sort((a, b) => a.kickoffAt.localeCompare(b.kickoffAt));

      this.matches.set(enriched);

      const myTotal = (totalsRes.data ?? [])[0];
      const sorted = (leaderboardRes.data ?? []).sort((a, b) => (b.points ?? 0) - (a.points ?? 0));
      const rankIdx = sorted.findIndex((t) => t.userId === userId);
      this.totals.set({
        points: myTotal?.points ?? 0,
        exactCount: myTotal?.exactCount ?? 0,
        resultCount: myTotal?.resultCount ?? 0,
        globalRank: rankIdx >= 0 ? rankIdx + 1 : null,
      });
    } finally {
      this.loading.set(false);
    }

    void this.loadSponsorBanners();
  }

  private async loadSponsorBanners() {
    try {
      const res = await this.api.listSponsors(200);
      const all: Record<BannerSlot, SponsorBanner[]> = { banner1: [], banner2: [], banner3: [] };
      for (const s of res.data ?? []) {
        const keys = (s.bannerKeys ?? []) as Array<string | null>;
        for (const slot of this.bannerSlotKeys) {
          const idx = slot === 'banner1' ? 0 : slot === 'banner2' ? 1 : 2;
          const key = keys[idx];
          if (key) {
            all[slot].push({ sponsorId: s.id, sponsorName: s.name, url: null });
          }
        }
      }
      this.banners.set(all);

      // Resolve signed URLs in background (best-effort)
      for (const slot of this.bannerSlotKeys) {
        for (let i = 0; i < all[slot].length; i++) {
          const item = all[slot][i];
          const sponsor = (res.data ?? []).find((x) => x.id === item.sponsorId);
          if (!sponsor) continue;
          const idx = slot === 'banner1' ? 0 : slot === 'banner2' ? 1 : 2;
          const key = (sponsor.bannerKeys ?? [])[idx];
          if (!key) continue;
          try {
            const out = await getUrl({ key, options: { accessLevel: 'guest' } });
            const updated = { ...all };
            updated[slot] = [...updated[slot]];
            updated[slot][i] = { ...item, url: out.url.toString() };
            all[slot] = updated[slot];
            this.banners.set({ ...all });
          } catch {
            /* ignore single-asset failure */
          }
        }
      }
    } catch {
      /* ignore — banners are best-effort */
    }
  }
}
