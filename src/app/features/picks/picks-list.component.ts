import { Component, OnDestroy, OnInit, ViewChild, computed, inject, signal } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { Router, RouterLink, RouterLinkActive } from '@angular/router';
import { getUrl } from 'aws-amplify/storage';
import { ApiService } from '../../core/api/api.service';
import { AuthService } from '../../core/auth/auth.service';
import { UserModesService } from '../../core/user/user-modes.service';
import { TimeService } from '../../core/time/time.service';
import { TeamFlagComponent } from '../../shared/ui/team-flag.component';
import { TriviaModalService } from '../../core/trivia/trivia-modal.service';
import { RailModalsService } from '../../core/layout/rail-modals.service';
import { PicksSyncService } from '../../core/sync/picks-sync.service';
import { RandomizerModalComponent } from './randomizer-modal.component';

/** Payload del sync para picks de marcador. Tracking explícito de
 *  `homeTouched/awayTouched` separa "valor que el user editó" de
 *  "valor default 0 que mandamos al API por requerimiento". El input
 *  visualmente solo muestra valor si su side está tocado. */
interface PickPayload extends Record<string, unknown> {
  home: number;
  away: number;
  homeTouched: boolean;
  awayTouched: boolean;
}

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

interface TriviaInfo {
  count: number;
  title: string;
  sub: string;
  branded: boolean;
}

@Component({
  standalone: true,
  selector: 'app-picks-list',
  imports: [NgTemplateOutlet, RouterLink, RouterLinkActive, TeamFlagComponent, RandomizerModalComponent],
  template: `
    <section class="page">

      <!-- Header con stats -->
      <header class="page__header">
        <div>
          <div class="kicker">MUNDIAL 2026 · GOLGANA</div>
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

      <!-- Botón Aleatorio: abre modal con selector de partidos + sliders
           para asignar marcadores random masivamente. -->
      <div class="picks-actions">
        <button type="button" class="btn-wf btn-wf--ink"
                (click)="openRandomizer()">
          🎲 Aleatorio
        </button>
      </div>

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

      <!-- Contenido principal · el rail (premios/comodines/canjear) vive
           globalmente en el shell, no acá. -->
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
            @for (day of visibleDays(); track day.dateKey; let dayIdx = $index) {
              <div class="day-kicker">📅 {{ day.label }} · {{ day.matches.length }} {{ day.matches.length === 1 ? 'partido' : 'partidos' }}</div>
              @for (m of day.matches; track m.id) {
                <ng-container *ngTemplateOutlet="cardTpl; context: {$implicit: m}"></ng-container>
              }
              @if (dayIdx === 0 && visibleDays().length > 1) {
                <div class="ad-feed ad-feed--coca">
                  <span class="ad-feed__badge">AD</span>
                  <span class="ad-feed__icon">🥤</span>
                  <div class="ad-feed__body">
                    <div class="ad-feed__title">Coca-Cola refresca tu Mundial</div>
                    <div class="ad-feed__sponsor">COCA-COLA · Patrocinador oficial</div>
                  </div>
                  <a href="#" class="ad-feed__cta" (click)="$event.preventDefault()">Ver promo</a>
                </div>
              }
              @if (dayIdx === 2) {
                <div class="ad-feed ad-feed--adidas">
                  <span class="ad-feed__badge">AD</span>
                  <span class="ad-feed__icon">👟</span>
                  <div class="ad-feed__body">
                    <div class="ad-feed__title">adidas — Equípate para el Mundial</div>
                    <div class="ad-feed__sponsor">ADIDAS · Sponsor oficial</div>
                  </div>
                  <a href="#" class="ad-feed__cta" (click)="$event.preventDefault()">Ver colección</a>
                </div>
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
                <ng-container *ngTemplateOutlet="cardTpl; context: {$implicit: m}"></ng-container>
              }
            }
          }

          <!-- Template del match-card · score editable inline para próximos
               (auto-save con debounce); click en area no-input → detalle. -->
          <ng-template #cardTpl let-m>
            @let trivia = triviaInfo(m.id);
            @let upcoming = m.status !== 'FINAL' && !isLive(m);
            @let pickPending = sync.isPending('pick', m.id);
            @let pickValue = sync.getPending('pick', m.id);
            @let hasAnyPick = !!m.pick || !!pickValue;
            <article class="match-card"
                     [class.match-card--accent]="!!trivia"
                     [class.match-card--dim]="m.pick === null && isPlayed(m)">
              <div class="match-card__body">
                <div class="match-card__head">
                  <span>{{ formatKickoff(m.kickoffAt) }}@if (m.phaseLabel) { · {{ m.phaseLabel }} }</span>
                  @if (isLive(m)) {
                    <span class="live">EN VIVO</span>
                  } @else if (isAwaitingResult(m)) {
                    <span class="pill" style="background:rgba(212,165,0,0.15);color:#7a5d00;border-color:rgba(212,165,0,0.3);">Esperando resultado</span>
                  } @else if (isPlayed(m)) {
                    <span class="text-mute">Final</span>
                  } @else {
                    <span class="text-mute">{{ countdown(m.kickoffAt) }}</span>
                  }
                </div>
                <div class="match" style="padding:0;">
                  <div class="match__team">
                    <app-team-flag
                      [flagCode]="m.homeFlag"
                      [crestUrl]="m.homeCrestUrl"
                      [name]="m.homeTeamName"
                      [size]="22" />
                    {{ m.homeTeamName }}
                  </div>
                  <div class="score" (click)="$event.stopPropagation()">
                    @if (upcoming) {
                      <input type="text" inputmode="numeric" maxlength="1"
                             class="score__input"
                             [value]="scoreInputValue(m, 'home')"
                             placeholder="0"
                             [attr.aria-label]="'Goles ' + m.homeTeamName"
                             (click)="$event.stopPropagation()"
                             (input)="onScoreInput(m.id, 'home', $event)">
                      <span>—</span>
                      <input type="text" inputmode="numeric" maxlength="1"
                             class="score__input"
                             [value]="scoreInputValue(m, 'away')"
                             placeholder="0"
                             [attr.aria-label]="'Goles ' + m.awayTeamName"
                             (click)="$event.stopPropagation()"
                             (input)="onScoreInput(m.id, 'away', $event)">
                    } @else {
                      <div class="score__num"
                           [class.score__num--filled]="hasFilledScore(m, 'home')">
                        {{ scoreDisplay(m, 'home') }}
                      </div>
                      <span>—</span>
                      <div class="score__num"
                           [class.score__num--filled]="hasFilledScore(m, 'away')">
                        {{ scoreDisplay(m, 'away') }}
                      </div>
                    }
                  </div>
                  <div class="match__team match__team--right">
                    {{ m.awayTeamName }}
                    <app-team-flag
                      [flagCode]="m.awayFlag"
                      [crestUrl]="m.awayCrestUrl"
                      [name]="m.awayTeamName"
                      [size]="22" />
                  </div>
                </div>
                <!-- Tu pick visible en cards en vivo / jugados (donde
                     el score muestra el real, no el del user). En upcoming
                     ya se ve directo en el input. -->
                @if (m.pick && (isLive(m) || isPlayed(m) || isAwaitingResult(m))) {
                  <div class="match-card__mypick">
                    Tu pick: <strong>{{ m.pick.homeScorePred }}—{{ m.pick.awayScorePred }}</strong>
                  </div>
                }
                <div class="match-card__pills">
                  @if (m.pick && isPlayed(m) && m.pick.exactScore) {
                    <span class="pill pill--green">✓ Exacto · +{{ m.pick.pointsEarned ?? 0 }}</span>
                  } @else if (m.pick && isPlayed(m) && m.pick.correctResult) {
                    <span class="pill pill--green">✓ Resultado · +{{ m.pick.pointsEarned ?? 0 }}</span>
                  } @else if (m.pick && isPlayed(m)) {
                    <span class="pill">Sin pts</span>
                  } @else if (upcoming && hasAnyPick) {
                    @if (pickPending) {
                      <span class="pill" style="background:rgba(212,165,0,0.15);color:#7a5d00;border-color:rgba(212,165,0,0.3);">● Pendiente</span>
                    } @else {
                      <span class="pill pill--green">✓ Guardado</span>
                    }
                  } @else if (upcoming) {
                    <span class="pill">Sin pick</span>
                  }
                </div>
                <!-- Botón "Ver detalles": navegar al partido. Antes el
                     click era en TODO el card body, lo cual generaba
                     mistakes (clicks en input no podían no propagar bien). -->
                <div class="match-card__cta">
                  <a class="match-card__detail-link"
                     [routerLink]="['/picks/match', m.id]">
                    Ver detalles →
                  </a>
                </div>
              </div>
              @if (trivia) {
                <button type="button" class="match-trivia"
                        (click)="openTrivia(m.id, $event)">
                  <span class="match-trivia__icon">⚡</span>
                  <div class="match-trivia__body">
                    <div class="match-trivia__title">{{ trivia.title }}</div>
                    <div class="match-trivia__sub">{{ trivia.sub }}</div>
                  </div>
                  <span class="btn-wf btn-wf--sm btn-wf--ink">Jugar</span>
                </button>
              }
            </article>
          </ng-template>

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

    </section>

    <!-- FAB de canjear código (mobile) -->
    <button type="button" class="canjear-fab" (click)="scrollToCanjear()"
            title="Canjear código de sponsor">
      🎁 <span>Canjear código</span>
    </button>

    <!-- Modal de "Picks aleatorios" (oculto hasta que openRandomizer fire) -->
    <app-randomizer-modal #rnd [matches]="randomizableMatches()" />
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
export class PicksListComponent implements OnInit, OnDestroy {

  ngOnDestroy() {
    if (this.triviaTickTimer) clearInterval(this.triviaTickTimer);
  }
  private api = inject(ApiService);
  private auth = inject(AuthService);
  private userModes = inject(UserModesService);
  private time = inject(TimeService);
  private router = inject(Router);
  private triviaModal = inject(TriviaModalService);
  rail = inject(RailModalsService);
  sync = inject(PicksSyncService);

  @ViewChild('rnd') randomizer?: RandomizerModalComponent;

  /** Lista de partidos que el modal Aleatorio puede randomizar (form
   *  esperado: solo metadata mínima, no el match-meta enriquecido). */
  randomizableMatches = computed(() =>
    this.matches().map((m) => ({
      id: m.id,
      kickoffAt: m.kickoffAt,
      status: m.status ?? null,
      homeTeamId: m.homeTeamId,
      awayTeamId: m.awayTeamId,
    })),
  );

  openRandomizer() {
    this.randomizer?.show();
  }

  /** Abre el modal de trivia scoped al match dado (evita el routerLink
   *  al /picks/trivia/:id legacy — la trivia ahora siempre es modal). */
  openTrivia(matchId: string, event: Event) {
    event.stopPropagation();   // evita que el card-body navegue al detail
    this.triviaModal.openForMatch(matchId);
  }

  // Sync de marcadores ahora vive en PicksSyncService (local-first +
  // batch sync). Acá solo llamamos sync.enqueue / sync.getPending /
  // sync.isPending. No más pendingEdits, debounceTimer, ni savingMatch
  // por componente.

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

  /** Mapa matchId → preguntas de trivia del torneo. Pre-cargado en
   *  ngOnInit para que el row inline `match-trivia` se renderice sin
   *  fetch adicional por card. */
  private triviaByMatch = signal<Map<string, Array<{
    id: string;
    explanation: string | null;
    publishedAt: string;
  }>>>(new Map());

  /** Tick para re-evaluar `triviaInfo` sin refrescar la página: cada
   *  30s recheca cuáles preguntas tienen publishedAt <= now. */
  private nowTick = signal(Date.now());
  private triviaTickTimer: ReturnType<typeof setInterval> | undefined;

  bannerSlotKeys: BannerSlot[] = ['banner1', 'banner2', 'banner3'];
  private banners = signal<Record<BannerSlot, SponsorBanner[]>>({
    banner1: [], banner2: [], banner3: [],
  });
  sponsorBannersForSlot(slot: BannerSlot): SponsorBanner[] {
    return this.banners()[slot] ?? [];
  }

  scrollToCanjear() {
    // El canjear inline vive ahora en /mis-comodines (slot al final del
    // grid). Navegamos allá; el form ya está visible en esa página.
    void this.router.navigate(['/mis-comodines'], { fragment: 'card-canjear' });
  }

  // ---------- Helpers para el match-card inline ----------
  /** EN VIVO: kickoff ya pasó y status DB no es FINAL. Cubre tanto los
   *  SCHEDULED-pasados (admin no marcó nada) como los LIVE (admin manual). */
  isLive(m: MatchWithMeta): boolean {
    if (m.status === 'FINAL') return false;
    return Date.parse(m.kickoffAt) <= Date.now();
  }
  isPlayed(m: MatchWithMeta): boolean {
    // Solo consideramos "jugado" cuando hay marcador publicado. FINAL
    // sin score = "esperando resultado", aún no es jugado en UI sense.
    return m.status === 'FINAL' && m.homeScore != null && m.awayScore != null;
  }
  /** Admin marcó "Finalizar" pero todavía no ingresó el marcador. */
  isAwaitingResult(m: MatchWithMeta): boolean {
    return m.status === 'FINAL' && (m.homeScore == null || m.awayScore == null);
  }
  hasFilledScore(m: MatchWithMeta, side: 'home' | 'away'): boolean {
    if (this.isPlayed(m) || this.isLive(m)) {
      const v = side === 'home' ? m.homeScore : m.awayScore;
      return v != null;
    }
    if (m.pick) {
      const v = side === 'home' ? m.pick.homeScorePred : m.pick.awayScorePred;
      return v != null;
    }
    return false;
  }
  scoreDisplay(m: MatchWithMeta, side: 'home' | 'away'): string {
    if (this.isPlayed(m) || this.isLive(m)) {
      const v = side === 'home' ? m.homeScore : m.awayScore;
      return v != null ? String(v) : '—';
    }
    if (m.pick) {
      return String(side === 'home' ? m.pick.homeScorePred : m.pick.awayScorePred);
    }
    return '—';
  }
  formatKickoff(iso: string): string {
    return this.time.formatKickoff(iso);
  }
  countdown(iso: string): string {
    // Lee nowTick para que el countdown re-evalúe cada 30s (lo cambio
    // a 1s abajo si la pregunta tarda < 1h). Sin nowTick, el binding
    // solo se actualiza cuando otra cosa dispara CD.
    const tick = this.nowTick();
    const ms = new Date(iso).getTime() - tick;
    if (ms < 0) return '—';   // si kickoff pasó, isLive() catchéa este caso primero
    if (ms < 3_600_000) {
      // Menos de 1h → contador regresivo MM:SS para precisión visual
      const totalSec = Math.floor(ms / 1000);
      const mm = Math.floor(totalSec / 60);
      const ss = totalSec % 60;
      return `en ${mm}:${String(ss).padStart(2, '0')}`;
    }
    const h = Math.round(ms / 3_600_000);
    if (h < 24) return `en ${h}h`;
    const d = Math.round(h / 24);
    return d === 1 ? 'mañana' : `en ${d}d`;
  }
  flagEmoji(code: string): string {
    if (!code || code.length < 2) return '';
    const A = 0x1F1E6;
    const a = code.toUpperCase().charCodeAt(0);
    const b = code.toUpperCase().charCodeAt(1);
    if (Number.isNaN(a) || Number.isNaN(b)) return '';
    return String.fromCodePoint(A + (a - 65), A + (b - 65));
  }

  /** Click en area no-input del card → navega al detail. */
  goToMatch(id: string) {
    void this.router.navigate(['/picks/match', id]);
  }

  /** Edit del marcador → enqueue al sync service (local-first).
   *
   *  Tracking de "touched" por lado: solo el side que el user editó
   *  se considera tocado. El otro lado conserva su flag previo (o
   *  false si nunca se tocó). Así, si user edita SOLO home, el input
   *  away no se rellena con "0" automáticamente — sigue mostrando
   *  empty/placeholder.
   *
   *  Slice(-1) toma el ÚLTIMO dígito tipeado: previene que con un
   *  "0" existente y typear "1", input.value "01" se reduzca a "0"
   *  en lugar de "1". */
  onScoreInput(matchId: string, side: 'home' | 'away', event: Event) {
    const input = event.target as HTMLInputElement;
    const raw = input.value.replace(/[^0-9]/g, '').slice(-1);
    const v = raw === '' ? 0 : Math.max(0, Math.min(9, parseInt(raw, 10)));
    if (raw !== input.value) input.value = raw;

    const cur = this.currentScores(matchId);
    const next: PickPayload = {
      home: side === 'home' ? v : cur.home,
      away: side === 'away' ? v : cur.away,
      homeTouched: side === 'home' ? true : cur.homeTouched,
      awayTouched: side === 'away' ? true : cur.awayTouched,
    };
    // eslint-disable-next-line no-console
    console.log('[picks-list] onScoreInput', { matchId, side, raw, v, cur, next });
    this.sync.enqueue('pick', matchId, next);
  }

  private currentScores(matchId: string): PickPayload {
    const pending = this.sync.getPending<PickPayload>('pick', matchId);
    if (pending) return pending;
    const m = this.matches().find((x) => x.id === matchId);
    const p = m?.pick;
    // Si la pick viene de DB, ambos lados se consideran "tocados"
    // (ya fueron guardados conscientemente).
    return {
      home: p?.homeScorePred ?? 0,
      away: p?.awayScorePred ?? 0,
      homeTouched: !!p,
      awayTouched: !!p,
    };
  }

  /** Para [value] del input. Si el side NO está tocado en sync ni
   *  hay pick en DB, devuelve '' (placeholder "0" se mantiene). */
  scoreInputValue(m: MatchWithMeta, side: 'home' | 'away'): number | string {
    const pending = this.sync.getPending<PickPayload>('pick', m.id);
    if (pending) {
      const touched = side === 'home' ? pending.homeTouched : pending.awayTouched;
      if (touched) return side === 'home' ? pending.home : pending.away;
    }
    const v = side === 'home' ? m.pick?.homeScorePred : m.pick?.awayScorePred;
    return v ?? '';
  }

  /** Devuelve info de trivia para el row inline si hay preguntas YA
   *  PUBLICADAS (publishedAt <= now) para el match. Lee nowTick para
   *  re-evaluar reactivamente cada 30s. */
  triviaInfo(matchId: string): TriviaInfo | null {
    const now = this.nowTick();
    const list = this.triviaByMatch().get(matchId);
    if (!list || list.length === 0) return null;
    const published = list.filter((q) => Date.parse(q.publishedAt) <= now);
    if (published.length === 0) return null;
    const sponsor = parseSponsor(published[0]?.explanation ?? null);
    const points = published.length * 10;
    return {
      count: published.length,
      title: published.length === 1
        ? `Trivia · +${points} pts si aciertas`
        : `Trivia · +${points} pts si aciertas las ${published.length}`,
      sub: sponsor
        ? `Patrocinada por ${sponsor.name}`
        : 'Versión sin publicidad',
      branded: !!sponsor,
    };
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
    // Tick cada 1s para que: (a) `triviaInfo` re-evalúe publishedAt
    // sin refresh y (b) el countdown MM:SS de matches < 1h al kickoff
    // se actualice en tiempo real. CPU cost: trivial — re-eval de un
    // par de filters sobre arrays chicos.
    this.triviaTickTimer = setInterval(() => this.nowTick.set(Date.now()), 1000);

    const userId = this.auth.user()?.sub;
    if (!userId) {
      this.loading.set(false);
      return;
    }

    try {
      const [matchesRes, picksRes, phasesRes, teamsRes, totalsRes, leaderboardRes, triviaRes] = await Promise.all([
        this.api.listMatches(TOURNAMENT_ID),
        this.api.myPicks(userId),
        this.api.listPhases(TOURNAMENT_ID),
        this.api.listTeams(TOURNAMENT_ID),
        this.api.myTotal(userId, TOURNAMENT_ID),
        this.api.listLeaderboard(TOURNAMENT_ID, 200),
        this.api.listTriviaByTournament(TOURNAMENT_ID),
      ]);

      // Map matchId → preguntas de trivia para el row inline.
      // Incluimos publishedAt para que `triviaInfo` filtre lo que ya
      // está disponible (no aparece "Trivia" antes de tiempo).
      const triviaMap = new Map<string, Array<{ id: string; explanation: string | null; publishedAt: string }>>();
      const triviaList = (triviaRes.data ?? []).filter(
        (q): q is { id: string; matchId: string; explanation: string | null; publishedAt: string } =>
          !!q && !!q.matchId && !!q.publishedAt,
      );
      for (const q of triviaList) {
        const arr = triviaMap.get(q.matchId) ?? [];
        arr.push({ id: q.id, explanation: q.explanation ?? null, publishedAt: q.publishedAt });
        triviaMap.set(q.matchId, arr);
      }
      this.triviaByMatch.set(triviaMap);

      const phaseLabels = new Map<string, string>(
        (phasesRes.data ?? [])
          .filter((p): p is { id: string; name: string } => !!p && !!p.id)
          .map((p) => [p.id, p.name]),
      );
      const teamMap = new Map<string, { name: string; flagCode: string; crestUrl: string | null }>(
        (teamsRes.data ?? [])
          .filter((t): t is NonNullable<typeof t> => !!t && !!t.slug)
          .map((t) => [t.slug, {
            name: t.name,
            flagCode: t.flagCode,
            crestUrl: t.crestUrl ?? null,
          }]),
      );
      const pickByMatch = new Map(
        (picksRes.data ?? [])
          .filter((p): p is NonNullable<typeof p> => !!p && !!p.matchId)
          .map((p) => [
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
        .filter((m): m is NonNullable<typeof m> => !!m && !!m.id && !!m.kickoffAt)
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

/**
 * Parsea el prefijo `[BRAND:<nombre>:<icono>]` del campo `explanation`
 * de una TriviaQuestion. Esta es la convención temporal hasta que el
 * schema agregue un campo `sponsorId` real (ver
 * docs/sponsor-trivia-schema-migration.md).
 */
function parseSponsor(explanation: string | null): { name: string; icon: string } | null {
  if (!explanation) return null;
  const m = explanation.match(/^\s*\[BRAND:([^:\]]+):([^\]]+)\]\s*/);
  return m ? { name: m[1].trim(), icon: m[2].trim() } : null;
}
