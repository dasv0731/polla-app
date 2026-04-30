import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
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
  url: string | null;     // null mientras se resuelve la signed URL
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
  dateKey: string;          // YYYY-MM-DD
  label: string;            // "Hoy", "Mañana", "lunes 14 jun"
  matches: MatchWithMeta[];
}

@Component({
  standalone: true,
  selector: 'app-picks-list',
  imports: [PickCardComponent, RouterLink, SponsorRedeemComponent],
  template: `
    <header class="picks-list__header">
      <div class="picks-list__header-top">
        <div>
          <span class="wf-kicker">MUNDIAL 2026 · TU POLLA</span>
          <h1 class="picks-list__h1">Mis picks</h1>
        </div>
        <div class="picks-list__stats">
          <div><strong>{{ totals().points }}</strong><small>Pts</small></div>
          <div><strong>{{ totals().exactCount }}</strong><small>Exactos</small></div>
          <div><strong>{{ totals().resultCount }}</strong><small>Resultados</small></div>
          <div><strong>{{ totals().globalRank ? '#' + totals().globalRank : '—' }}</strong><small>Global</small></div>
        </div>
      </div>

      <div class="wf-tabs wf-tabs--scroll" role="tablist" aria-label="Modo de vista">
        <span class="wf-tabs__item is-active">📅 Cronológico</span>
        <a class="wf-tabs__item" routerLink="/picks/by-group">🏆 Por grupo</a>
        <span class="wf-tabs__item" style="opacity: 0.4; pointer-events: none;">🌳 Llaves</span>
      </div>

      <div class="picks-list__seg-wrap">
        <div class="wf-seg" role="tablist" aria-label="Tabs de picks">
          <button type="button" class="wf-seg__item"
                  [class.is-active]="tab() === 'upcoming'"
                  (click)="tab.set('upcoming')">
            Próximos · {{ upcomingCount() }}
          </button>
          <button type="button" class="wf-seg__item"
                  [class.is-active]="tab() === 'played'"
                  (click)="tab.set('played')">
            Jugados · {{ playedCount() }}
          </button>
        </div>
      </div>
    </header>

    <div class="picks-layout">
      <!-- MAIN COLUMN: cronológico por días -->
      <div class="picks-layout__main">
        @if (!hasComplete()) {
          <div class="empty-state">
            <h3>Modo completo no disponible</h3>
            <p>
              Los picks de marcador (1 partido = 1 marcador con multiplicadores por fase)
              son del <strong>modo completo</strong>. Para usarlos, necesitas pertenecer a
              al menos un grupo en modo completo.
            </p>
            <p>
              <a class="btn btn--primary" routerLink="/groups/new">Crear un grupo →</a>
            </p>
            <p style="margin-top: var(--space-md); font-size: var(--fs-sm); color: var(--color-text-muted);">
              Si tu grupo es <strong>modo simple</strong>, las predicciones de tabla, llaves
              y campeón sí cuentan. Las encuentras en
              <a class="link-green" routerLink="/picks/group-stage">Tabla de grupos</a>.
            </p>
          </div>
        } @else if (loading()) {
          <div class="empty-state"><h3>Cargando…</h3></div>
        } @else if (tab() === 'upcoming') {
          @if (visibleDays().length === 0) {
            <div class="empty-state">
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
            <section class="day-block">
              <header class="day-block__head">
                <h2>📅 {{ day.label }}</h2>
                <small>{{ day.matches.length }} partido{{ day.matches.length === 1 ? '' : 's' }}</small>
              </header>
              <div class="day-block__matches">
                @for (m of day.matches; track m.id) {
                  <app-pick-card
                    [match]="m"
                    [phaseLabel]="m.phaseLabel"
                    [existingPick]="m.pick"
                    [pointsEarned]="m.pick?.pointsEarned" />
                }
              </div>
            </section>
          }
          @if (canLoadMore()) {
            <button class="btn btn--ghost btn--block" type="button"
                    (click)="loadNextTwoDays()" style="width: 100%; margin-top: var(--space-md);">
              Próximos 2 días →
            </button>
          }
        } @else {
          <!-- Jugados — flat reverse-chrono -->
          @if (playedMatches().length === 0) {
            <div class="empty-state">
              <h3>Aún no jugaste partidos</h3>
              <p>Tus picks jugados aparecerán acá con el resultado y los puntos.</p>
            </div>
          } @else {
            <section class="picks-grid">
              @for (m of playedMatches(); track m.id) {
                <app-pick-card
                  [match]="m"
                  [phaseLabel]="m.phaseLabel"
                  [existingPick]="m.pick"
                  [pointsEarned]="m.pick?.pointsEarned" />
              }
            </section>
          }
        }
      </div>

      <!-- SIDEBAR -->
      <aside class="picks-layout__sidebar">
        @if (myPrizes().length > 0) {
          <section class="sidebar-card sidebar-card--prizes">
            <h3>🏆 Premios</h3>
            @for (p of myPrizes(); track p.groupId) {
              <article class="sidebar-prize">
                <strong>{{ p.groupName }}</strong>
                <ul>
                  @if (p.prize1st) { <li>🥇 {{ p.prize1st }}</li> }
                  @if (p.prize2nd) { <li>🥈 {{ p.prize2nd }}</li> }
                  @if (p.prize3rd) { <li>🥉 {{ p.prize3rd }}</li> }
                </ul>
              </article>
            }
          </section>
        }

        <section class="sidebar-card">
          <h3>Mis grupos</h3>
          @if (myGroupsList().length === 0) {
            <p style="color: var(--color-text-muted); font-size: var(--fs-sm);">
              Aún no estás en ningún grupo.
            </p>
          } @else {
            <ul class="sidebar-groups">
              @for (g of myGroupsList(); track g.id) {
                <li>
                  <a [routerLink]="['/groups', g.id]">
                    <span>{{ g.name }}</span>
                    <small [class.is-complete]="g.mode === 'COMPLETE'">
                      {{ g.mode === 'COMPLETE' ? 'Completo' : 'Simple' }}
                    </small>
                  </a>
                </li>
              }
            </ul>
          }
        </section>

        <a class="sidebar-card sidebar-card--cta" routerLink="/groups/new">
          <strong>+ Crear grupo</strong>
          <small>Arma uno privado con tus amigos</small>
        </a>

        <a class="sidebar-card sidebar-card--cta" routerLink="/groups" fragment="unirme">
          <strong>→ Unirme con código</strong>
          <small>¿Te invitaron? Pega el código de 6 caracteres</small>
        </a>
      </aside>
    </div>

    <!-- Banners de sponsors: 3 hileras, una por slot. Cada hilera muestra
         las imágenes subidas por los sponsors en ese slot. Si no hay
         sponsors con un slot dado, esa sección se oculta. -->
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

    <!-- Bloque de canje de códigos sponsor: visible para todos los users
         logueados (independiente del modo del grupo). -->
    <section id="canjear-codigo" style="max-width: 720px; margin: var(--space-2xl) auto 0;">
      <app-sponsor-redeem />
    </section>

    <!-- FAB persistente bottom-right para canjear código rápido -->
    <button type="button" class="canjear-fab" (click)="scrollToCanjear()"
            title="Canjear código de sponsor">
      🎁 <span>Canjear código</span>
    </button>
  `,
  styles: [`
    /* Wireframe-style header (sustituye a .page-header) */
    .picks-list__header {
      max-width: 1200px;
      margin: 0 auto;
      padding: var(--space-md) var(--section-x-mobile) 0;
    }
    .picks-list__header-top {
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
      gap: var(--space-md);
      flex-wrap: wrap;
      margin-bottom: var(--space-md);
    }
    .picks-list__h1 {
      font-family: var(--wf-display);
      font-size: var(--fs-2xl);
      letter-spacing: 0.04em;
      line-height: 1;
      margin: 4px 0 0;
      text-transform: none;
    }
    .picks-list__stats {
      display: flex;
      gap: var(--space-md);
      align-items: flex-end;
    }
    .picks-list__stats > div {
      text-align: center;
    }
    .picks-list__stats strong {
      display: block;
      font-family: var(--wf-display);
      font-size: var(--fs-lg);
      line-height: 1;
    }
    .picks-list__stats small {
      font-size: 9px;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: var(--wf-ink-3);
      font-weight: 700;
    }
    .picks-list__seg-wrap {
      margin-top: var(--space-md);
      max-width: 320px;
    }
    @media (min-width: 992px) {
      .picks-list__seg-wrap { max-width: 360px; }
    }

    .sponsor-banner-row {
      display: flex;
      gap: var(--space-sm);
      overflow-x: auto;
      padding: var(--space-sm) 0;
      margin: var(--space-md) auto 0;
      max-width: 1100px;
      scroll-snap-type: x mandatory;
    }
    .sponsor-banner-tile {
      flex: 0 0 auto;
      width: 280px;
      aspect-ratio: 16 / 9;
      background: var(--wf-fill);
      border: 1px solid var(--wf-line);
      border-radius: 12px;
      overflow: hidden;
      scroll-snap-align: start;
      box-shadow: 0 2px 6px rgba(0,0,0,0.04);
    }
    .sponsor-banner-tile img {
      width: 100%;
      height: 100%;
      object-fit: contain;
      display: block;
    }
    .sponsor-banner-tile__placeholder {
      width: 100%;
      height: 100%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-family: var(--font-display);
      font-size: var(--fs-xl);
      text-transform: uppercase;
      letter-spacing: 0.04em;
      color: var(--color-text-muted);
    }

    .picks-layout {
      display: grid;
      grid-template-columns: 1fr;
      gap: var(--space-lg);
      padding: 0 var(--section-x-mobile);
      max-width: 1200px;
      margin: 0 auto;
    }
    @media (min-width: 992px) {
      .picks-layout { grid-template-columns: minmax(0, 1fr) 320px; }
    }
    .picks-layout__main { display: grid; gap: var(--space-md); align-content: start; }
    .picks-layout__sidebar {
      display: grid;
      gap: var(--space-md);
      align-content: start;
    }
    @media (min-width: 992px) {
      .picks-layout__sidebar { position: sticky; top: var(--space-lg); }
    }

    .day-block {
      background: var(--color-primary-white);
      border: var(--border-grey);
      border-radius: var(--radius-md);
      padding: var(--space-md);
    }
    .day-block__head {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      margin-bottom: var(--space-md);
      padding-bottom: var(--space-sm);
      border-bottom: 1px solid var(--color-primary-grey);
    }
    .day-block__head h2 {
      font-family: var(--font-display);
      font-size: var(--fs-2xl);
      text-transform: uppercase;
      line-height: 1;
    }
    .day-block__head small {
      font-size: var(--fs-xs);
      color: var(--color-text-muted);
      text-transform: uppercase;
      letter-spacing: 0.06em;
    }
    .day-block__matches { display: grid; gap: var(--space-sm); }

    .sidebar-card {
      background: var(--color-primary-white);
      border: 1px solid var(--wf-line);
      border-radius: 12px;
      padding: var(--space-md);
      display: block;
      text-decoration: none;
      color: inherit;
    }
    .sidebar-card h3 {
      font-family: var(--font-display);
      font-size: 18px;
      letter-spacing: 0.04em;
      line-height: 1.05;
      margin-bottom: var(--space-sm);
    }
    .sidebar-card--prizes {
      background: linear-gradient(135deg, #fff8d6, #fff3a0);
      border: 1px solid rgba(212, 165, 0, 0.4);
    }
    .sidebar-prize {
      padding: var(--space-xs) 0;
      border-bottom: 1px solid rgba(0,0,0,0.05);
    }
    .sidebar-prize:last-child { border-bottom: 0; }
    .sidebar-prize strong {
      display: block;
      font-size: var(--fs-sm);
      margin-bottom: 4px;
    }
    .sidebar-prize ul {
      list-style: none; padding: 0; margin: 0;
      font-size: var(--fs-sm); line-height: 1.6;
    }
    .sidebar-groups {
      list-style: none; padding: 0; margin: 0;
      display: grid; gap: 4px;
    }
    .sidebar-groups a {
      display: flex; justify-content: space-between; align-items: center;
      padding: 6px 8px;
      border-radius: var(--radius-sm);
      text-decoration: none;
      color: inherit;
      transition: background 100ms;
    }
    .sidebar-groups a:hover { background: rgba(0,200,100,0.06); }
    .sidebar-groups small {
      font-size: var(--fs-xs);
      text-transform: uppercase;
      letter-spacing: 0.04em;
      color: var(--color-text-muted);
      padding: 2px 6px;
      border-radius: 999px;
      background: rgba(0,0,0,0.06);
    }
    .sidebar-groups small.is-complete {
      background: var(--color-primary-green);
      color: var(--color-primary-white);
    }
    .sidebar-card--cta {
      transition: transform 100ms, box-shadow 100ms;
    }
    .sidebar-card--cta:hover {
      transform: translateY(-2px);
      box-shadow: 0 4px 12px rgba(0,200,100,0.15);
      border-color: var(--color-primary-green);
    }
    .sidebar-card--cta strong {
      display: block;
      font-size: var(--fs-md);
      color: var(--color-primary-green);
      margin-bottom: 2px;
    }
    .sidebar-card--cta small {
      font-size: var(--fs-xs);
      color: var(--color-text-muted);
      line-height: 1.4;
    }

    .canjear-fab {
      position: fixed;
      bottom: 80px;
      right: var(--space-md);
      z-index: 50;
      background: var(--wf-ink);
      color: white;
      border: 0;
      border-radius: 999px;
      padding: 10px 16px;
      font: inherit;
      font-weight: 700;
      font-size: 12px;
      cursor: pointer;
      box-shadow: 0 6px 16px rgba(0,0,0,0.18);
      display: inline-flex;
      align-items: center;
      gap: 6px;
      transition: transform 100ms, box-shadow 100ms;
    }
    .canjear-fab:hover {
      transform: translateY(-2px);
      box-shadow: 0 8px 22px rgba(0,0,0,0.25);
    }
    @media (min-width: 992px) {
      .canjear-fab { bottom: var(--space-lg); right: var(--space-lg); }
    }
    @media (max-width: 480px) {
      .canjear-fab span { display: none; }
      .canjear-fab { padding: 12px 14px; font-size: 14px; }
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

  // Cronológico por días: cargamos HOY+MAÑANA por default; botón
  // "Próximos 2 días" extiende ventana de 2 en 2.
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

  // Banners de sponsors agrupados por slot. Resolved-async desde S3
  // via Amplify Storage signed URLs.
  bannerSlotKeys: BannerSlot[] = ['banner1', 'banner2', 'banner3'];
  private banners = signal<Record<BannerSlot, SponsorBanner[]>>({
    banner1: [], banner2: [], banner3: [],
  });
  sponsorBannersForSlot(slot: BannerSlot): SponsorBanner[] {
    return this.banners()[slot] ?? [];
  }

  scrollToCanjear() {
    const el = document.getElementById('canjear-codigo');
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    // Auto-focus en el input del bloque tras un breve delay para mejor UX
    setTimeout(() => {
      const input = el?.querySelector<HTMLInputElement>('.sr__input');
      input?.focus();
    }, 400);
  }

  upcomingCount = computed(() => this.matches().filter((m) => !this.time.isPast(m.kickoffAt)).length);
  playedCount = computed(() => this.matches().filter((m) => this.time.isPast(m.kickoffAt)).length);

  /** Próximos partidos sortidos por kickoff asc */
  private upcomingSorted = computed(() =>
    this.matches()
      .filter((m) => !this.time.isPast(m.kickoffAt))
      .sort((a, b) => a.kickoffAt.localeCompare(b.kickoffAt)),
  );

  /** Jugados sortidos por kickoff desc (más recientes primero) */
  playedMatches = computed(() =>
    this.matches()
      .filter((m) => this.time.isPast(m.kickoffAt))
      .sort((a, b) => b.kickoffAt.localeCompare(a.kickoffAt)),
  );

  /** Todos los días (con al menos 1 partido) próximos, agrupados */
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

  /** Sólo los primeros N días (paginación incremental) */
  visibleDays = computed<DayBlock[]>(() =>
    this.allUpcomingDays().slice(0, this.daysWindow()),
  );

  canLoadMore = computed(() => this.daysWindow() < this.allUpcomingDays().length);

  loadNextTwoDays() {
    this.daysWindow.update((n) => n + 2);
  }

  private dateKey(iso: string): string {
    // YYYY-MM-DD en zona local del usuario para agrupar correctamente.
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

      // Totals + global rank
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

    // Carga de banners de sponsors (best-effort, no bloquea UI)
    void this.loadSponsorBanners();
  }

  private async loadSponsorBanners() {
    try {
      const res = await this.api.listSponsors(50);
      const sponsors = ((res.data ?? []) as Array<{
        id: string; name: string;
        banner1?: string | null; banner2?: string | null; banner3?: string | null;
      }>);

      const buckets: Record<BannerSlot, SponsorBanner[]> = {
        banner1: [], banner2: [], banner3: [],
      };

      // Pre-llenar buckets con placeholders (url=null) para que la UI
      // muestre algo mientras se resuelven las signed URLs.
      for (const s of sponsors) {
        for (const slot of this.bannerSlotKeys) {
          const key = (s as Record<BannerSlot, string | null | undefined>)[slot];
          if (key) {
            buckets[slot].push({ sponsorId: s.id, sponsorName: s.name, url: null });
          }
        }
      }
      this.banners.set({ ...buckets });

      // Resolver URLs en paralelo
      await Promise.all(
        sponsors.flatMap((s) =>
          this.bannerSlotKeys.map(async (slot) => {
            const key = (s as Record<BannerSlot, string | null | undefined>)[slot];
            if (!key) return;
            try {
              const u = await getUrl({ path: key, options: { expiresIn: 3600 } });
              this.banners.update((cur) => {
                const next = { ...cur };
                next[slot] = next[slot].map((b) =>
                  b.sponsorId === s.id ? { ...b, url: u.url.toString() } : b,
                );
                return next;
              });
            } catch { /* skip silenciosamente */ }
          }),
        ),
      );
    } catch {
      // Sin sponsors o sin permiso — la UI omite las secciones cuando
      // los buckets quedan vacíos.
    }
  }
}
