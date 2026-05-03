import { Component, HostListener, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { ActivatedRoute, Router, RouterLink, RouterLinkActive } from '@angular/router';
import { TeamFlagComponent } from '../../shared/ui/team-flag.component';
import { ApiService } from '../../core/api/api.service';
import { AuthService } from '../../core/auth/auth.service';
import { UserModesService } from '../../core/user/user-modes.service';
import { ToastService } from '../../core/notifications/toast.service';
import { TimeService } from '../../core/time/time.service';
import { humanizeError } from '../../core/notifications/domain-errors';
import { RailModalsService } from '../../core/layout/rail-modals.service';
import { PicksSyncService } from '../../core/sync/picks-sync.service';

type GameMode = 'SIMPLE' | 'COMPLETE';

interface KnockoutMatch {
  id: string;
  phaseOrder: number;        // 2=R32(16avos), 3=R16(octavos), 4=cuartos, 5=semis, 6=final+3er
  homeTeamId: string;
  awayTeamId: string;
  kickoffAt: string;
  bracketPosition: number | null;
  status: string | null;
  homeScore: number | null;
  awayScore: number | null;
}

interface TeamLite {
  slug: string;
  name: string;
  flagCode: string;
}

const TOURNAMENT_ID = 'mundial-2026';
const STORAGE_KEY = (userId: string, mode: GameMode) => `polla-bracket-winners-${mode}-${userId}`;

/**
 * Bracket en formato wireframe Mundial 2026: tournament tree con 16avos
 * a ambos lados. 9 columnas: 16avos · Octavos · Cuartos · Semis · FINAL ·
 * Semis · Cuartos · Octavos · 16avos.
 *
 * Mapping bracketPosition → side:
 *  - 16avos (8+8): pos 1-8 izq, 9-16 der
 *  - Octavos (4+4): pos 1-4 izq, 5-8 der
 *  - Cuartos (2+2): pos 1-2 izq, 3-4 der
 *  - Semis (1+1):   pos 1 izq, 2 der
 *  - Final (1):     centro (bracketPosition 1)
 *  - 3er puesto (bracketPosition 2 dentro de phase 6): no se muestra
 *    en el grid (no scorea, queda fuera del visual del wireframe).
 */
@Component({
  standalone: true,
  selector: 'app-bracket-picks',
  imports: [RouterLink, RouterLinkActive, NgTemplateOutlet, TeamFlagComponent],
  template: `
    <section class="page">

      <!-- Header con stats (mismo patrón que /picks y /picks/group-stage) -->
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

      <div class="page__rail-actions">
        <button type="button" class="page__rail-action" (click)="rail.openPremios()">
          🏆 <span>Premios</span>
        </button>
        <button type="button" class="page__rail-action page__rail-action--alt"
                (click)="rail.openComodines()">
          🎁 <span>Comodines</span>
        </button>
      </div>

      <nav class="page-tabs" aria-label="Vistas de picks">
        <a class="page-tabs__item" routerLink="/picks"
           routerLinkActive="is-active" [routerLinkActiveOptions]="{exact: true}">Cronológico</a>
        <a class="page-tabs__item" routerLink="/picks/group-stage"
           routerLinkActive="is-active">Tabla grupos</a>
        <a class="page-tabs__item is-active" routerLink="/picks/bracket">Bracket</a>
      </nav>

      <!-- Mode switch (si el user tiene > 1 modo) -->
      @if (availableModes().length > 1) {
        <div class="seg" style="max-width:280px;margin-bottom:14px;">
          @for (m of availableModes(); track m) {
            <button type="button" class="seg__item"
                    [class.is-active]="mode() === m"
                    (click)="switchMode(m)">
              {{ m === 'COMPLETE' ? 'Modo completo' : 'Modo simple' }}
            </button>
          }
        </div>
      }

      <!-- Intro: descripción + status + edit -->
      <div class="bracket-intro">
        <p>
          Tu predicción de la fase eliminatoria.
          <b>+15 pts</b> por cada llave acertada · <b>+30 pts</b> por el campeón.
          @if (bracketLocked()) {
            <br><span class="text-mute">Bracket cerrado · {{ bracketLockFormatted() }}.</span>
          } @else if (bracketLockFormatted()) {
            <br><span class="text-mute">Cierra al kickoff de la 1ª llave · {{ bracketLockFormatted() }}.</span>
          }
        </p>
        <div class="bracket-intro__actions">
          @if (saveStatus() === 'saving') {
            <span class="pill">⏳ Guardando…</span>
          } @else if (saveStatus() === 'saved') {
            <span class="pill pill--green">✓ Bracket guardado</span>
          } @else if (saveStatus() === 'dirty') {
            <span class="pill pill--warn">● Cambios sin guardar</span>
          } @else if (saveStatus() === 'error') {
            <span class="pill" style="background:rgba(195,51,51,0.1);color:#c33;border-color:rgba(195,51,51,0.3);">⚠ Error</span>
          }
          <span class="text-mute" style="font-size:11px;">
            {{ pickedCount() }} / {{ totalKnockoutMatches() }}
          </span>
        </div>
      </div>

      <!-- Filter pills (visual; "Tu camino" hace dim al resto) -->
      <div class="bracket-filter">
        <button type="button" class="bracket-filter__pill"
                [class.is-active]="filter() === 'mine'"
                (click)="filter.set('mine')">Tu camino</button>
        <button type="button" class="bracket-filter__pill"
                [class.is-active]="filter() === 'all'"
                (click)="filter.set('all')">Todos</button>
      </div>

      @if (loading()) {
        <p class="loading-msg">Cargando bracket…</p>
      } @else if (availableModes().length === 0) {
        <div class="empty-block">
          <h3>Sin grupos privados</h3>
          <p>Necesitas pertenecer a al menos un grupo privado para usar el bracket.</p>
          <a class="btn-wf btn-wf--primary" routerLink="/groups/new">Crear un grupo →</a>
        </div>
      } @else if (hasNoKnockoutMatches()) {
        <div class="empty-block">
          <h3>Las llaves todavía no están armadas</h3>
          <p>
            El admin carga las llaves después de que termine la fase de grupos.
            Vuelve cuando estén disponibles.
          </p>
        </div>
      } @else {
        <!-- Grid del bracket: 9 columnas (16avos a ambos extremos) -->
        <div class="bracket-scroll">
          <div class="bracket-grid">

            <!-- Row 1: headers -->
            <div class="bracket-col-h">16avos</div>
            <div class="bracket-col-h">Octavos</div>
            <div class="bracket-col-h">Cuartos</div>
            <div class="bracket-col-h">Semis</div>
            <div class="bracket-col-h">Final</div>
            <div class="bracket-col-h">Semis</div>
            <div class="bracket-col-h">Cuartos</div>
            <div class="bracket-col-h">Octavos</div>
            <div class="bracket-col-h">16avos</div>

            <!-- Row 2: columnas con matches -->

            <!-- 16avos izq -->
            <div class="bracket-col bracket-col--16avos">
              @for (m of matchesIn(2, 'left'); track m.id) {
                <ng-container *ngTemplateOutlet="matchTpl; context: {$implicit: m, prefix: 'R32'}"></ng-container>
              }
            </div>

            <!-- Octavos izq -->
            <div class="bracket-col">
              @for (m of matchesIn(3, 'left'); track m.id) {
                <ng-container *ngTemplateOutlet="matchTpl; context: {$implicit: m, prefix: 'O'}"></ng-container>
              }
            </div>

            <!-- Cuartos izq -->
            <div class="bracket-col bracket-col--cuartos">
              @for (m of matchesIn(4, 'left'); track m.id) {
                <ng-container *ngTemplateOutlet="matchTpl; context: {$implicit: m, prefix: 'C'}"></ng-container>
              }
            </div>

            <!-- Semis izq -->
            <div class="bracket-col bracket-col--semis">
              @for (m of matchesIn(5, 'left'); track m.id) {
                <ng-container *ngTemplateOutlet="matchTpl; context: {$implicit: m, prefix: 'S'}"></ng-container>
              }
            </div>

            <!-- FINAL (centro) -->
            <div class="bracket-col bracket-col--final">
              @let fm = finalMatch();
              @if (fm) {
                <div class="bracket-final-card">
                  <div class="bracket-final-card__title">🏆 FINAL</div>
                  <ng-container *ngTemplateOutlet="slotTpl; context: {match: fm, side: 'home'}"></ng-container>
                  <ng-container *ngTemplateOutlet="slotTpl; context: {match: fm, side: 'away'}"></ng-container>
                  @let champ = champion();
                  @if (champ) {
                    <div class="bracket-final-card__champion">
                      CAMPEÓN · {{ champ }}
                    </div>
                  }
                </div>
              } @else {
                <div class="bracket-final-card">
                  <div class="bracket-final-card__title">🏆 FINAL</div>
                  <div class="text-mute" style="text-align:center;font-size:11px;padding:8px 4px;">
                    Aún sin definir
                  </div>
                </div>
              }
            </div>

            <!-- Semis der -->
            <div class="bracket-col bracket-col--semis">
              @for (m of matchesIn(5, 'right'); track m.id) {
                <ng-container *ngTemplateOutlet="matchTpl; context: {$implicit: m, prefix: 'S'}"></ng-container>
              }
            </div>

            <!-- Cuartos der -->
            <div class="bracket-col bracket-col--cuartos">
              @for (m of matchesIn(4, 'right'); track m.id) {
                <ng-container *ngTemplateOutlet="matchTpl; context: {$implicit: m, prefix: 'C'}"></ng-container>
              }
            </div>

            <!-- Octavos der -->
            <div class="bracket-col">
              @for (m of matchesIn(3, 'right'); track m.id) {
                <ng-container *ngTemplateOutlet="matchTpl; context: {$implicit: m, prefix: 'O'}"></ng-container>
              }
            </div>

            <!-- 16avos der -->
            <div class="bracket-col bracket-col--16avos">
              @for (m of matchesIn(2, 'right'); track m.id) {
                <ng-container *ngTemplateOutlet="matchTpl; context: {$implicit: m, prefix: 'R32'}"></ng-container>
              }
            </div>

          </div>
        </div>

        <!-- Leyenda -->
        <div class="bracket-legend">
          <span class="bracket-legend__item">
            <span class="bracket-legend__icon bracket-legend__icon--mine"></span>
            Tu predicción
          </span>
          <span class="bracket-legend__item">
            <span class="bracket-legend__icon bracket-legend__icon--win"></span>
            Ganador (real / proyectado)
          </span>
          <span class="text-mute">
            ·
            @if (bracketLocked()) { Bloqueado, solo lectura. }
            @else { Click en un equipo para elegirlo como ganador. }
          </span>
        </div>
      }

      <!-- Templates compartidos -->
      <ng-template #matchTpl let-m let-prefix="prefix">
        <div class="bracket-match" [style.opacity]="dimmedFor(m) ? 0.4 : 1">
          <span class="bracket-match__label">{{ prefix }}{{ m.bracketPosition }}</span>
          <ng-container *ngTemplateOutlet="slotTpl; context: {match: m, side: 'home'}"></ng-container>
          <ng-container *ngTemplateOutlet="slotTpl; context: {match: m, side: 'away'}"></ng-container>
        </div>
      </ng-template>

      <ng-template #slotTpl let-match="match" let-side="side">
        @let teamId = displayedTeam(match, side);
        @let team = teamMap().get(teamId);
        @let isEmpty = !teamId;
        @let isMine = !isEmpty && winners().get(match.id) === teamId;
        @let isWinner = !isEmpty && realWinner(match) === teamId;
        @let userPicked = winners().has(match.id);
        @let isDiscarded = userPicked && !isEmpty && !isMine && !isWinner;
        @let score = side === 'home' ? match.homeScore : match.awayScore;
        <button type="button" class="bracket-slot"
                [class.bracket-slot--win]="isWinner"
                [class.bracket-slot--mine]="isMine"
                [class.bracket-slot--discarded]="isDiscarded"
                [class.bracket-slot--locked]="bracketLocked()"
                [class.bracket-slot--empty]="isEmpty"
                [disabled]="bracketLocked() || isEmpty"
                (click)="pickWinner(match.id, teamId)">
          @if (isEmpty) {
            <span class="bracket-slot__team bracket-slot__placeholder">
              Pick fase anterior
            </span>
          } @else {
            <span class="bracket-slot__team">
              <app-team-flag
                [flagCode]="team?.flagCode ?? ''"
                [name]="team?.name ?? null"
                [size]="14" />
              {{ team?.name || teamId }}
            </span>
          }
          <span class="bracket-slot__score">{{ score != null ? score : '' }}</span>
        </button>
      </ng-template>
    </section>
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
  `],
})
export class BracketPicksComponent implements OnInit, OnDestroy {
  private api = inject(ApiService);
  private auth = inject(AuthService);
  private userModes = inject(UserModesService);
  private toast = inject(ToastService);
  private time = inject(TimeService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  rail = inject(RailModalsService);
  sync = inject(PicksSyncService);

  loading = signal(true);
  availableModes = computed(() => this.userModes.modes());
  mode = signal<GameMode | null>(null);

  teams = signal<TeamLite[]>([]);
  teamMap = signal<Map<string, TeamLite>>(new Map());

  matches = signal<KnockoutMatch[]>([]);
  /** matchId → ganador elegido (slug del team). */
  winners = signal<Map<string, string>>(new Map());

  filter = signal<'mine' | 'all'>('all');

  /** Estado del save derivado del sync. Reemplaza el viejo saveStatus
   *  signal local (idle/dirty/saving/saved/error). Lee del sync para
   *  esta key específica del bracket del user en el modo actual. */
  saveStatus = computed<'idle' | 'dirty' | 'saving' | 'saved' | 'error'>(() => {
    const m = this.mode();
    if (!m || !this.currentUserId) return 'idle';
    const key = `${this.currentUserId}:${m}`;
    if (this.sync.isPending('bracket', key)) {
      return this.sync.status() === 'syncing' ? 'saving' : 'dirty';
    }
    if (this.sync.getPending('bracket', key)) return 'saved';
    return 'idle';
  });
  private serverId: string | null = null;
  private currentUserId = '';

  // Totals (para el header de stats)
  totals = signal<{ points: number; exactCount: number; resultCount: number; globalRank: number | null }>(
    { points: 0, exactCount: 0, resultCount: 0, globalRank: null },
  );

  hasNoKnockoutMatches = computed(() => this.matches().length === 0);
  totalKnockoutMatches = computed(() => this.matches().length);
  pickedCount = computed(() => this.winners().size);

  // Lock: bracket cierra al kickoff del primer partido eliminatorio.
  private nowTick = signal(Date.now());
  private lockTicker: ReturnType<typeof setInterval> | undefined;
  bracketLockAt = computed<string | null>(() => {
    const ms = this.matches();
    if (ms.length === 0) return null;
    let min = ms[0]!.kickoffAt;
    for (const m of ms) if (m.kickoffAt < min) min = m.kickoffAt;
    return min;
  });
  bracketLocked = computed(() => {
    const at = this.bracketLockAt();
    if (!at) return false;
    return this.nowTick() >= Date.parse(at);
  });
  bracketLockFormatted = computed(() => {
    const at = this.bracketLockAt();
    return at ? this.time.formatKickoff(at) : null;
  });

  finalMatch = computed<KnockoutMatch | null>(() => {
    return this.matches().find((m) => m.phaseOrder === 6 && m.bracketPosition === 1) ?? null;
  });

  /** El campeón es el ganador elegido del partido de la Final. */
  champion = computed<string | null>(() => {
    const fm = this.finalMatch();
    if (!fm) return null;
    const champSlug = this.winners().get(fm.id);
    if (!champSlug) return null;
    const team = this.teamMap().get(champSlug);
    return team ? team.name : champSlug;
  });

  /** Los equipos que el user predijo como ganadores en cada match.
   *  Se usa para el filtro "Tu camino": dim los matches donde NINGÚN
   *  equipo está en este set. */
  myAdvancers = computed<Set<string>>(() => {
    const out = new Set<string>();
    for (const slug of this.winners().values()) out.add(slug);
    return out;
  });

  /** Para el filter "Tu camino": un match es "tuyo" si elegiste a uno
   *  de los 2 equipos como ganador (en este match O en una ronda anterior
   *  que llevó a este match). Simplificado: si home o away están en
   *  myAdvancers, es parte de tu camino. */
  dimmedFor(m: KnockoutMatch): boolean {
    if (this.filter() !== 'mine') return false;
    const set = this.myAdvancers();
    return !set.has(m.homeTeamId) && !set.has(m.awayTeamId);
  }

  flagEmoji(code: string): string {
    if (!code || code.length < 2) return '';
    const A = 0x1F1E6;
    const a = code.toUpperCase().charCodeAt(0);
    const b = code.toUpperCase().charCodeAt(1);
    if (Number.isNaN(a) || Number.isNaN(b)) return '';
    return String.fromCodePoint(A + (a - 65), A + (b - 65));
  }

  /** Devuelve los matches de la fase, filtrados por lado del bracket
   *  según bracketPosition (mid = total/2). */
  matchesIn(phaseOrder: number, side: 'left' | 'right'): KnockoutMatch[] {
    // El partido por el 3er puesto (phase 6 bracketPosition 2) lo filtramos
    // del visual: no aparece en el bracket tree.
    const all = this.matches()
      .filter((m) => m.phaseOrder === phaseOrder)
      .filter((m) => !(phaseOrder === 6 && m.bracketPosition !== 1))
      .sort((a, b) => (a.bracketPosition ?? 999) - (b.bracketPosition ?? 999));
    if (all.length === 0) return [];
    if (phaseOrder === 6) return all; // solo la Final, pero Final va al col central, no aquí
    const mid = Math.ceil(all.length / 2);
    return side === 'left' ? all.slice(0, mid) : all.slice(mid);
  }

  /** Para un match con resultado FINAL, devuelve el slug del team que ganó.
   *  Empate (penales/etc) → ningún winner determinado; null. */
  realWinner(m: KnockoutMatch): string | null {
    if (m.status !== 'FINAL') return null;
    if (m.homeScore == null || m.awayScore == null) return null;
    if (m.homeScore > m.awayScore) return m.homeTeamId;
    if (m.awayScore > m.homeScore) return m.awayTeamId;
    return null;
  }

  /** Match de la fase anterior cuyo ganador alimenta el slot indicado.
   *  Convención del bracket Mundial 2026: R{N} pos K es alimentado por
   *  R{N-1} pos 2K-1 (home) y 2K (away). R32 (phaseOrder=2) no tiene
   *  padre dentro del knockout. */
  private parentOf(match: KnockoutMatch, side: 'home' | 'away'): KnockoutMatch | null {
    if (match.phaseOrder <= 2) return null;
    if (match.bracketPosition == null) return null;
    const parentPhase = match.phaseOrder - 1;
    const parentPos = side === 'home'
      ? match.bracketPosition * 2 - 1
      : match.bracketPosition * 2;
    return this.matches().find((m) =>
      m.phaseOrder === parentPhase && m.bracketPosition === parentPos,
    ) ?? null;
  }

  /** Equipo a renderizar en el slot. STRICT: si el padre no tiene
   *  winner picked (y no jugó realmente), el slot está vacío.
   *
   *  Esto garantiza que al des-elegir en una fase aguas arriba, todas
   *  las fases siguientes queden en blanco — sin caer al pre-set del
   *  admin que coincidentemente podría mostrar el mismo equipo y dar
   *  la sensación de que el cascade no funcionó. */
  displayedTeam(match: KnockoutMatch, side: 'home' | 'away'): string {
    return this.computeDisplayed(match, side, this.winners());
  }

  private computeDisplayed(
    match: KnockoutMatch,
    side: 'home' | 'away',
    winners: Map<string, string>,
  ): string {
    const parent = this.parentOf(match, side);
    if (parent) {
      // Padre ya jugó → resultado real prevalece sobre cualquier predicción.
      if (parent.status === 'FINAL') {
        const real = this.realWinner(parent);
        if (real) return real;
      }
      const w = winners.get(parent.id);
      return w ?? '';   // strict: vacío cuando no hay winner upstream
    }
    // R32 (sin padre en knockout) usa el setup del admin.
    return side === 'home' ? match.homeTeamId : match.awayTeamId;
  }


  async ngOnInit() {
    this.currentUserId = this.auth.user()?.sub ?? '';
    if (!this.currentUserId) {
      this.loading.set(false);
      return;
    }
    this.lockTicker = setInterval(() => this.nowTick.set(Date.now()), 30_000);

    const requested = this.route.snapshot.queryParamMap.get('mode') as GameMode | null;
    const modes = this.availableModes();
    if (requested && modes.includes(requested)) this.mode.set(requested);
    else if (modes.includes('COMPLETE')) this.mode.set('COMPLETE');
    else if (modes.length > 0) this.mode.set(modes[0]!);
    if (!this.mode()) {
      this.loading.set(false);
      return;
    }
    await this.loadForMode();
  }

  ngOnDestroy(): void {
    if (this.lockTicker) clearInterval(this.lockTicker);
    // No flush en unmount: el sync service ya tiene en localStorage
    // cualquier cambio pending y los flushea con su propio debounce
    // global (sobrevive al unmount).
  }

  async switchMode(m: GameMode) {
    if (this.mode() === m) return;
    this.mode.set(m);
    this.serverId = null;
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { mode: m },
      queryParamsHandling: 'merge',
    });
    await this.loadForMode();
  }

  async loadForMode() {
    const m = this.mode();
    if (!m) return;
    this.loading.set(true);
    try {
      const [teamsRes, matchesRes, phasesRes, bracketRes, totalsRes, leaderboardRes] = await Promise.all([
        this.api.listTeams(TOURNAMENT_ID),
        this.api.listMatches(TOURNAMENT_ID),
        this.api.listPhases(TOURNAMENT_ID),
        this.api.getBracketPick(this.currentUserId, TOURNAMENT_ID, m),
        this.api.myTotal(this.currentUserId, TOURNAMENT_ID),
        this.api.listLeaderboard(TOURNAMENT_ID, 200),
      ]);

      const list = (teamsRes.data ?? [])
        .filter((t): t is NonNullable<typeof t> => !!t && !!t.slug)
        .map((t) => ({ slug: t.slug, name: t.name, flagCode: t.flagCode }))
        .sort((a, b) => a.name.localeCompare(b.name));
      this.teams.set(list);
      const tmap = new Map<string, TeamLite>();
      for (const t of list) tmap.set(t.slug, t);
      this.teamMap.set(tmap);

      const phaseOrderById = new Map<string, number>();
      for (const p of (phasesRes.data ?? [])) {
        if (!p || !p.id) continue;
        phaseOrderById.set(p.id, p.order);
      }

      const knockouts: KnockoutMatch[] = (matchesRes.data ?? [])
        .filter((mm): mm is NonNullable<typeof mm> => !!mm && !!mm.id)
        .map((mm) => ({
          id: mm.id,
          phaseOrder: phaseOrderById.get(mm.phaseId) ?? 0,
          homeTeamId: mm.homeTeamId,
          awayTeamId: mm.awayTeamId,
          kickoffAt: mm.kickoffAt,
          bracketPosition: mm.bracketPosition ?? null,
          status: mm.status ?? null,
          homeScore: mm.homeScore ?? null,
          awayScore: mm.awayScore ?? null,
        }))
        .filter((k) => k.phaseOrder >= 2 && k.phaseOrder <= 6);
      this.matches.set(knockouts);

      // Reconstruir winners: prioridad localStorage > DB row
      let winnersState = new Map<string, string>();
      const dbRow = (bracketRes.data ?? [])[0];
      if (dbRow) {
        this.serverId = dbRow.id;
        const winnerSets: Record<number, Set<string>> = {
          2: new Set((dbRow.octavos ?? []).filter((s: string | null): s is string => !!s)),
          3: new Set((dbRow.cuartos ?? []).filter((s: string | null): s is string => !!s)),
          4: new Set((dbRow.semis   ?? []).filter((s: string | null): s is string => !!s)),
          5: new Set((dbRow.final   ?? []).filter((s: string | null): s is string => !!s)),
          6: dbRow.champion ? new Set([dbRow.champion]) : new Set<string>(),
        };
        for (const km of knockouts) {
          const set = winnerSets[km.phaseOrder];
          if (!set) continue;
          if (set.has(km.homeTeamId)) winnersState.set(km.id, km.homeTeamId);
          else if (set.has(km.awayTeamId)) winnersState.set(km.id, km.awayTeamId);
        }
      }

      const lsRaw = localStorage.getItem(STORAGE_KEY(this.currentUserId, m));
      if (lsRaw) {
        try {
          const parsed = JSON.parse(lsRaw) as Record<string, string>;
          winnersState = new Map(Object.entries(parsed));
        } catch { /* corrupt */ }
      }

      this.winners.set(winnersState);
      // saveStatus es ahora computed desde sync state — no se setea acá.

      // Totals + global rank
      const myTotal = (totalsRes.data ?? [])[0];
      const sorted = (leaderboardRes.data ?? []).sort((a, b) => (b.points ?? 0) - (a.points ?? 0));
      const rankIdx = sorted.findIndex((t) => t.userId === this.currentUserId);
      this.totals.set({
        points: myTotal?.points ?? 0,
        exactCount: myTotal?.exactCount ?? 0,
        resultCount: myTotal?.resultCount ?? 0,
        globalRank: rankIdx >= 0 ? rankIdx + 1 : null,
      });
    } finally {
      this.loading.set(false);
    }
  }

  pickWinner(matchId: string, teamSlug: string) {
    if (this.bracketLocked()) return;
    if (!teamSlug) return;   // slot vacío (chain upstream no determinada)
    this.winners.update((prev) => {
      const next = new Map(prev);
      if (next.get(matchId) === teamSlug) {
        next.delete(matchId);   // re-click → des-elige
      } else {
        next.set(matchId, teamSlug);
      }
      // Cascade limpia toda la rama descendiente del match cambiado.
      // Si el user picked X como ganador en R32, y luego en R16/R8/etc.
      // tenía picks que dependían de X (vía la chain de winners), esos
      // picks downstream quedan stale y deben borrarse — incluso si
      // coincidentemente la admin pre-set del Match next-round usa el
      // mismo team slug que el viejo winner.
      this.cascadeClear(matchId, next);
      return next;
    });
    this.persistLocal();
    this.enqueueBracketSave();
  }

  /** Recorre la rama descendiente del match (child → grand-child → …)
   *  y borra cada pick stale. Como computeDisplayed ya es strict (vacío
   *  cuando upstream no tiene winner), comparamos directamente w vs
   *  el nuevo home/away. */
  private cascadeClear(matchId: string, winners: Map<string, string>) {
    const m = this.matches().find((x) => x.id === matchId);
    if (!m || m.bracketPosition == null) return;
    const childPhase = m.phaseOrder + 1;
    if (childPhase > 6) return;
    const childPos = Math.ceil(m.bracketPosition / 2);
    const child = this.matches().find(
      (x) => x.phaseOrder === childPhase && x.bracketPosition === childPos,
    );
    if (!child) return;
    const homeId = this.computeDisplayed(child, 'home', winners);
    const awayId = this.computeDisplayed(child, 'away', winners);
    const w = winners.get(child.id);
    if (w && w !== homeId && w !== awayId) {
      winners.delete(child.id);
    }
    // Recurse SIEMPRE: aunque el child quede válido (su away viene de
    // otra rama no afectada), el grand-child puede tener pick stale.
    this.cascadeClear(child.id, winners);
  }

  private persistLocal() {
    const m = this.mode();
    if (!this.currentUserId || !m) return;
    try {
      const obj: Record<string, string> = {};
      for (const [k, v] of this.winners()) obj[k] = v;
      localStorage.setItem(STORAGE_KEY(this.currentUserId, m), JSON.stringify(obj));
    } catch { /* localStorage full or disabled */ }
  }

  /** Construye el payload completo de BracketPick (toda la fila con
   *  todos los winners por fase) y lo encola al sync. El sync hace
   *  debounce, retry y persistencia. Reemplaza el viejo scheduleSave
   *  + saveAll local. */
  private enqueueBracketSave() {
    const m = this.mode();
    if (!m) return;
    if (this.bracketLocked()) return;

    const winnersByPhase: Record<number, string[]> = { 2: [], 3: [], 4: [], 5: [], 6: [] };
    const sortedMatches = [...this.matches()].sort((a, b) => {
      if (a.phaseOrder !== b.phaseOrder) return a.phaseOrder - b.phaseOrder;
      return (a.bracketPosition ?? 999) - (b.bracketPosition ?? 999);
    });
    for (const km of sortedMatches) {
      const winner = this.winners().get(km.id);
      if (!winner) continue;
      const arr = winnersByPhase[km.phaseOrder];
      if (arr) arr.push(winner);
    }

    const payload = {
      id: this.serverId ?? undefined,
      userId: this.currentUserId,
      tournamentId: TOURNAMENT_ID,
      mode: m,
      octavos:  winnersByPhase[2] ?? [],
      cuartos:  winnersByPhase[3] ?? [],
      semis:    winnersByPhase[4] ?? [],
      final:    winnersByPhase[5] ?? [],
      champion: (winnersByPhase[6] ?? [])[0] ?? '',
    };

    this.sync.enqueue('bracket', `${this.currentUserId}:${m}`, payload);
  }

  @HostListener('document:keydown.escape')
  onEscape() {
    // Reservado para futuros modales si se agregan acá.
  }
}
