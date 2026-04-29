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

@Component({
  standalone: true,
  selector: 'app-picks-list',
  imports: [PickCardComponent, RouterLink, SponsorRedeemComponent],
  template: `
    <header class="page-header">
      <div class="page-header__top">
        <div class="page-header__title">
          <small>Mundial 2026 · Tu polla</small>
          <h1>Mis picks</h1>
        </div>
        <div class="page-header__counts">
          <div><strong>{{ totals().points }}</strong><small>Pts totales</small></div>
          <div><strong>{{ totals().exactCount }}</strong><small>Exactos</small></div>
          <div><strong>{{ totals().resultCount }}</strong><small>Resultados</small></div>
          <div><strong>{{ totals().globalRank ? '#' + totals().globalRank : '—' }}</strong><small>Ranking global</small></div>
        </div>
      </div>

      <div class="page-header__controls">
        <div class="view-mode-toggle" role="tablist" aria-label="Modo de vista">
          <button class="view-mode-toggle__option is-active" type="button">📅 Cronológico</button>
          <a class="view-mode-toggle__option" routerLink="/picks/by-group">🏆 Por grupo</a>
          <button class="view-mode-toggle__option" type="button" disabled title="Próximamente">🌳 Llaves</button>
        </div>

        <nav class="subnav" role="tablist" aria-label="Tabs de picks" style="margin-left: auto;">
          <button type="button"
                  [class.is-active]="tab() === 'upcoming'"
                  (click)="tab.set('upcoming')">
            Próximos<span class="subnav__count">{{ upcomingCount() }}</span>
          </button>
          <button type="button"
                  [class.is-active]="tab() === 'played'"
                  (click)="tab.set('played')">
            Jugados<span class="subnav__count">{{ playedCount() }}</span>
          </button>
        </nav>
      </div>
    </header>

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
    } @else if (visible().length === 0) {
      <div class="empty-state">
        <h3>{{ tab() === 'upcoming' ? 'No hay partidos próximos' : 'Aún no jugaste partidos' }}</h3>
        <p>
          @if (tab() === 'upcoming') {
            Cuando admin cargue los fixtures, aparecerán aquí.
          } @else {
            Tus picks jugados aparecerán acá con el resultado y los puntos.
          }
        </p>
      </div>
    } @else {
      <section class="picks-grid">
        @for (m of visible(); track m.id) {
          <app-pick-card
            [match]="m"
            [phaseLabel]="m.phaseLabel"
            [existingPick]="m.pick"
            [pointsEarned]="m.pick?.pointsEarned" />
        }
      </section>
    }

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
    <section style="max-width: 720px; margin: var(--space-2xl) auto 0;">
      <app-sponsor-redeem />
    </section>
  `,
  styles: [`
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
      background: var(--color-primary-grey, #f4f4f4);
      border-radius: var(--radius-md);
      overflow: hidden;
      scroll-snap-align: start;
      box-shadow: 0 2px 6px rgba(0,0,0,0.06);
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

  // Banners de sponsors agrupados por slot. Resolved-async desde S3
  // via Amplify Storage signed URLs.
  bannerSlotKeys: BannerSlot[] = ['banner1', 'banner2', 'banner3'];
  private banners = signal<Record<BannerSlot, SponsorBanner[]>>({
    banner1: [], banner2: [], banner3: [],
  });
  sponsorBannersForSlot(slot: BannerSlot): SponsorBanner[] {
    return this.banners()[slot] ?? [];
  }

  upcomingCount = computed(() => this.matches().filter((m) => !this.time.isPast(m.kickoffAt)).length);
  playedCount = computed(() => this.matches().filter((m) => this.time.isPast(m.kickoffAt)).length);
  visible = computed(() =>
    this.matches().filter((m) =>
      this.tab() === 'upcoming' ? !this.time.isPast(m.kickoffAt) : this.time.isPast(m.kickoffAt),
    ),
  );

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
