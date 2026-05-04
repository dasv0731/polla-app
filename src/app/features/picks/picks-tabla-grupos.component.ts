import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { ApiService } from '../../core/api/api.service';
import { AuthService } from '../../core/auth/auth.service';
import { TimeService } from '../../core/time/time.service';
import { TeamFlagComponent } from '../../shared/ui/team-flag.component';
import { RailModalsService } from '../../core/layout/rail-modals.service';
import { PicksSyncService } from '../../core/sync/picks-sync.service';

const TOURNAMENT_ID = 'mundial-2026';

/** Mismo payload que en picks-list — touched flags por lado para que
 *  un edit de un solo input no contamine visualmente el otro. */
interface PickPayload extends Record<string, unknown> {
  home: number;
  away: number;
  homeTouched: boolean;
  awayTouched: boolean;
}

interface TeamLite {
  slug: string;
  name: string;
  flagCode: string;
  groupLetter: string | null;
}

interface MatchLite {
  id: string;
  kickoffAt: string;
  homeTeamId: string;
  awayTeamId: string;
  homeScore: number | null;
  awayScore: number | null;
  status: string | null;
}

interface PickLite {
  matchId: string;
  homeScorePred: number;
  awayScorePred: number;
  pointsEarned: number | null;
  exactScore: boolean | null;
  correctResult: boolean | null;
}

interface StandingsRow {
  team: TeamLite;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  gf: number;
  ga: number;
  gd: number;
  pts: number;
}

interface GroupBlock {
  letter: string;
  rows: StandingsRow[];     // ordenadas por pts/gd/gf
  matches: MatchLite[];     // los 6 partidos del grupo
  played: number;           // partidos jugados (para meta header del modal)
  myPoints: number;         // mis pts en este grupo (suma pointsEarned de matches con pick)
}

interface Totals {
  points: number;
  exactCount: number;
  resultCount: number;
  globalRank: number | null;
}

@Component({
  standalone: true,
  selector: 'app-picks-tabla-grupos',
  imports: [RouterLink, RouterLinkActive, TeamFlagComponent],
  template: `
    <section class="page">

      <!-- Header (mismo patrón que /picks) -->
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
        <a class="page-tabs__item is-active" routerLink="/picks/group-stage">Tabla grupos</a>
        <a class="page-tabs__item" routerLink="/picks/bracket"
           routerLinkActive="is-active">Bracket</a>
      </nav>

      <!-- Intro: descripción + seg (Tabla real / Mi predicción) -->
      <div class="picks-tabla-intro">
        <div class="picks-tabla-intro__text">
          {{ groups().length }} grupos · clasifican los <b>2 primeros</b> de cada grupo a octavos.
        </div>
        <div class="seg" style="min-width:240px;">
          <button type="button" class="seg__item"
                  [class.is-active]="view() === 'real'"
                  (click)="view.set('real')">Tabla real</button>
          <a class="seg__item"
             [class.is-active]="view() === 'pred'"
             routerLink="/picks/group-stage/predict">Mi predicción</a>
        </div>
      </div>

      @if (loading()) {
        <p class="loading-msg">Cargando tabla…</p>
      } @else if (view() === 'pred' && !hasAnyPrediction()) {
        <div class="empty-block">
          <h3>Aún no tienes predicción de tabla</h3>
          <p>
            Arrastra equipos en el editor para predecir cómo terminará cada grupo.
            La predicción cierra al kickoff inaugural.
          </p>
          <a class="btn-wf btn-wf--primary" routerLink="/picks/group-stage/predict">
            ✏ Hacer mi predicción →
          </a>
        </div>
      } @else {
        @if (view() === 'pred') {
          <div style="display:flex;justify-content:flex-end;margin-bottom:10px;">
            <a class="btn-wf btn-wf--sm" routerLink="/picks/group-stage/predict">
              ✏ Editar mi predicción →
            </a>
          </div>
        }
        <div class="standings-grid">
          @for (g of groups(); track g.letter) {
            <div class="standings-card">
              <div class="standings-card__head">
                <div class="standings-card__title">GRUPO {{ g.letter }}</div>
                <span class="standings-card__meta">Top 2 clasifican</span>
              </div>
              <table class="standings-card__table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Selección</th>
                    @if (view() === 'real') {
                      <th class="center">PJ</th>
                      <th class="center">DG</th>
                      <th class="center">PTS</th>
                    } @else {
                      <th class="center">PJ</th>
                      <th class="center">PTS</th>
                    }
                  </tr>
                </thead>
                <tbody>
                  @if (view() === 'real') {
                    @for (r of g.rows; track r.team.slug; let i = $index) {
                      <tr [class.qualify]="i < 2">
                        <td class="pos">{{ i + 1 }}</td>
                        <td>
                          <app-team-flag
                            [flagCode]="r.team.flagCode"
                            [name]="r.team.name"
                            [size]="18" />
                          <span class="text-bold" style="margin-left:6px;">{{ r.team.name }}</span>
                        </td>
                        <td class="num-cell">{{ r.played }}</td>
                        <td class="num-cell">{{ r.gd > 0 ? '+' + r.gd : r.gd }}</td>
                        <td class="pts-cell">{{ r.pts }}</td>
                      </tr>
                    }
                  } @else {
                    @let predRows = predRowsFor(g.letter);
                    @if (predRows.length > 0) {
                      @for (t of predRows; track t.slug; let i = $index) {
                        @let stats = statsFor(g, t.slug);
                        <tr [class.qualify]="i < 2">
                          <td class="pos">{{ i + 1 }}</td>
                          <td>
                            <app-team-flag
                              [flagCode]="t.flagCode"
                              [name]="t.name"
                              [size]="18" />
                            <span class="text-bold" style="margin-left:6px;">{{ t.name }}</span>
                          </td>
                          <td class="num-cell">{{ stats.played }}</td>
                          <td class="pts-cell">{{ stats.pts }}</td>
                        </tr>
                      }
                    } @else {
                      <tr>
                        <td colspan="4" style="text-align:center;color:var(--wf-ink-3);font-size:11px;padding:14px 8px;">
                          Sin predicción para este grupo
                        </td>
                      </tr>
                    }
                  }
                </tbody>
              </table>
              <div class="standings-card__footer">
                <button type="button" class="btn-wf btn-wf--block btn-wf--sm"
                        style="justify-content:center;"
                        (click)="openGroupModal(g.letter)">
                  ⚽ Hacer picks del Grupo {{ g.letter }} · {{ g.matches.length }} partidos →
                </button>
              </div>
            </div>
          }
        </div>

        <div class="picks-tabla-legend">
          <span class="picks-tabla-legend__item">
            <span class="picks-tabla-legend__bar"></span>
            Clasifica a octavos
          </span>
          @if (view() === 'real') {
            <span>· La tabla se actualiza a medida que se publican resultados.</span>
          } @else {
            <span>· Tu predicción · cierra al kickoff inaugural.</span>
          }
        </div>
      }

    </section>

    <!-- Modal: hacer picks de un grupo -->
    @if (openGroup(); as gLetter) {
      @let modalGroup = groupByLetter(gLetter);
      @if (modalGroup) {
        <div class="picks-modal is-open" role="dialog" aria-modal="true">
          <button type="button" class="picks-modal__close-overlay"
                  (click)="closeModal()" aria-label="Cerrar"></button>
          <div class="picks-modal__card">
            <header class="picks-modal__head">
              <div>
                <div class="title">Hacer picks · Grupo {{ modalGroup.letter }}</div>
                <div class="meta">
                  {{ modalGroup.played }} / {{ modalGroup.matches.length }} jugados
                  @if (modalGroup.myPoints > 0) { · +{{ modalGroup.myPoints }} pts }
                </div>
              </div>
              <button type="button" class="close" (click)="closeModal()" aria-label="Cerrar">✕</button>
            </header>

            <div class="picks-modal__body">
              @for (m of modalGroup.matches; track m.id) {
                @let pick = pickByMatch().get(m.id);
                @let kickoffPast = isKickoffPast(m.kickoffAt);
                @let isLive = m.status !== 'FINAL' && kickoffPast;
                @let isAwaiting = m.status === 'FINAL' && (m.homeScore == null || m.awayScore == null);
                @let isPlayed = m.status === 'FINAL' && m.homeScore != null && m.awayScore != null;
                @let isUpcoming = m.status !== 'FINAL' && !kickoffPast;
                @let pickPending = sync.isPending('pick', m.id);
                @let pickValue = sync.getPending('pick', m.id);
                @let hasAnyPick = !!pick || !!pickValue;

                <article class="match-card" [class.match-card--accent]="isLive">
                  <div class="match-card__body">
                    <div class="match-card__head">
                      <span>{{ formatKickoff(m.kickoffAt) }}</span>
                      @if (isPlayed) {
                        @if (pick?.exactScore) {
                          <span class="pill pill--green">✓ Exacto · +{{ pick?.pointsEarned ?? 0 }}</span>
                        } @else if (pick?.correctResult) {
                          <span class="pill pill--green">✓ Resultado · +{{ pick?.pointsEarned ?? 0 }}</span>
                        } @else if (pick) {
                          <span class="pill">Sin pts</span>
                        } @else {
                          <span class="pill">Sin pick</span>
                        }
                      } @else if (isLive) {
                        <span class="pill pill--live">EN VIVO</span>
                      } @else if (isAwaiting) {
                        <span class="pill" style="background:rgba(212,165,0,0.15);color:#7a5d00;border-color:rgba(212,165,0,0.3);">Esperando resultado</span>
                      } @else {
                        <span class="pill">PRÓX · {{ countdown(m.kickoffAt) }}</span>
                      }
                    </div>
                    <div class="match" style="padding:0;">
                      <div class="match__team">
                        <app-team-flag
                          [flagCode]="teamFlag(m.homeTeamId)"
                          [name]="teamName(m.homeTeamId)"
                          [size]="22" />
                        {{ teamName(m.homeTeamId) }}
                      </div>

                      <div class="score">
                        @if (isUpcoming) {
                          <input type="text" inputmode="numeric" maxlength="1"
                                 class="score__input"
                                 [value]="bannerScore(m.id, 'home')"
                                 placeholder="0"
                                 (input)="onScoreInput(m.id, 'home', $event)"
                                 [attr.aria-label]="'Goles ' + teamName(m.homeTeamId)">
                          <span>—</span>
                          <input type="text" inputmode="numeric" maxlength="1"
                                 class="score__input"
                                 [value]="bannerScore(m.id, 'away')"
                                 placeholder="0"
                                 (input)="onScoreInput(m.id, 'away', $event)"
                                 [attr.aria-label]="'Goles ' + teamName(m.awayTeamId)">
                        } @else if (isLive || isAwaiting) {
                          <div class="score__num">{{ m.homeScore ?? '—' }}</div>
                          <span>—</span>
                          <div class="score__num">{{ m.awayScore ?? '—' }}</div>
                        } @else {
                          <div class="score__num score__num--filled">{{ m.homeScore }}</div>
                          <span>—</span>
                          <div class="score__num score__num--filled">{{ m.awayScore }}</div>
                        }
                      </div>

                      <div class="match__team match__team--right">
                        {{ teamName(m.awayTeamId) }}
                        <app-team-flag
                          [flagCode]="teamFlag(m.awayTeamId)"
                          [name]="teamName(m.awayTeamId)"
                          [size]="22" />
                      </div>
                    </div>

                    @if (isUpcoming && hasAnyPick) {
                      <div class="match-card__pills">
                        @if (pickPending) {
                          <span class="pill" style="background:rgba(212,165,0,0.15);color:#7a5d00;border-color:rgba(212,165,0,0.3);">● Pendiente</span>
                        } @else {
                          <span class="pill pill--green">✓ Guardado</span>
                        }
                      </div>
                    } @else if (isLive && pick) {
                      <div class="match-card__pills">
                        <span class="pill">Tu pick: {{ pick.homeScorePred }}-{{ pick.awayScorePred }}</span>
                      </div>
                    }
                  </div>
                </article>
              }

              @if (modalGroup.matches.length === 0) {
                <p class="empty-msg">Aún no hay partidos cargados para este grupo.</p>
              }
            </div>

            <footer class="picks-modal__foot">
              <span class="meta">Auto-guardado al cambiar</span>
              <button type="button" class="btn-wf btn-wf--sm btn-wf--primary"
                      (click)="closeModal()">Listo</button>
            </footer>
          </div>
        </div>
      }
    }
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
    .empty-msg {
      padding: 24px;
      text-align: center;
      color: var(--wf-ink-3);
      font-size: 13px;
    }

    .loading-msg {
      padding: 32px;
      text-align: center;
      color: var(--wf-ink-3);
      font-size: 14px;
    }
  `],
})
export class PicksTablaGruposComponent implements OnInit {
  private api = inject(ApiService);
  private auth = inject(AuthService);
  private time = inject(TimeService);
  rail = inject(RailModalsService);
  sync = inject(PicksSyncService);

  view = signal<'real' | 'pred'>('real');
  loading = signal(true);

  totals = signal<Totals>({ points: 0, exactCount: 0, resultCount: 0, globalRank: null });

  groups = signal<GroupBlock[]>([]);
  pickByMatch = signal<Map<string, PickLite>>(new Map());

  /** Predicción del user por grupo: groupLetter → [pos1Slug..pos4Slug].
   *  Se carga en ngOnInit (prefiriendo COMPLETE > SIMPLE). */
  private predByGroup = signal<Map<string, string[]>>(new Map());

  hasAnyPrediction = computed(() => this.predByGroup().size > 0);

  /** Stats reales (PJ, PTS) del team en su grupo — para mostrar al lado
   *  de la predicción del user en el view 'pred', así puede ver cómo va
   *  contra la realidad. */
  statsFor(g: GroupBlock, slug: string): { played: number; pts: number } {
    const r = g.rows.find((x) => x.team.slug === slug);
    return r ? { played: r.played, pts: r.pts } : { played: 0, pts: 0 };
  }

  /** Para el view 'pred': ordena teams del grupo según pos1..pos4
   *  guardados, resolviendo el slug a TeamLite. */
  predRowsFor(letter: string): TeamLite[] {
    const order = this.predByGroup().get(letter);
    if (!order || order.length === 0) return [];
    const out: TeamLite[] = [];
    for (const slug of order) {
      const t = this.teamMap.get(slug);
      if (t) out.push(t);
    }
    return out;
  }

  /** Letra del grupo abierto en el modal (null = cerrado). */
  openGroup = signal<string | null>(null);

  // Sync de marcadores ahora vive en PicksSyncService — local-first +
  // batch sync 1500ms. No más debounceTimer ni pendingEdits locales.

  private teamMap = new Map<string, TeamLite>();

  groupByLetter(letter: string): GroupBlock | null {
    return this.groups().find((g) => g.letter === letter) ?? null;
  }

  teamName(slug: string): string { return this.teamMap.get(slug)?.name ?? slug; }
  teamFlag(slug: string): string {
    const fc = this.teamMap.get(slug)?.flagCode ?? '';
    return fc.toLowerCase();
  }

  formatKickoff(iso: string): string {
    return this.time.formatKickoff(iso);
  }

  isKickoffPast(iso: string): boolean {
    return Date.parse(iso) <= Date.now();
  }

  countdown(iso: string): string {
    const ms = new Date(iso).getTime() - Date.now();
    if (ms < 0) return '—';
    const h = Math.round(ms / 3600_000);
    if (h < 1) return 'pronto';
    if (h < 24) return `en ${h}h`;
    const d = Math.round(h / 24);
    return d === 1 ? 'mañana' : `en ${d}d`;
  }

  openGroupModal(letter: string) {
    this.openGroup.set(letter);
  }
  closeModal() {
    // El sync service ya tiene en localStorage cualquier edit pendiente
    // y los flushea con su propio debounce. No hay que coordinar nada
    // al cerrar el modal — los pending sobreviven al close/reopen.
    this.openGroup.set(null);
  }

  /** Edit del marcador → enqueue al sync con tracking de touched
   *  por lado. Si user solo edita home, el away input NO se rellena
   *  con "0" automáticamente — sigue mostrando placeholder. */
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
    this.sync.enqueue('pick', matchId, next);
  }

  private currentScores(matchId: string): PickPayload {
    const pending = this.sync.getPending<PickPayload>('pick', matchId);
    if (pending) return pending;
    const p = this.pickByMatch().get(matchId);
    return {
      home: p?.homeScorePred ?? 0,
      away: p?.awayScorePred ?? 0,
      homeTouched: !!p,
      awayTouched: !!p,
    };
  }

  /** Para [value] del input. Si el side NO está tocado, devuelve ''
   *  (placeholder "0" se mantiene). */
  bannerScore(matchId: string, side: 'home' | 'away'): number | string {
    const pending = this.sync.getPending<PickPayload>('pick', matchId);
    if (pending) {
      const touched = side === 'home' ? pending.homeTouched : pending.awayTouched;
      if (touched) return side === 'home' ? pending.home : pending.away;
    }
    const p = this.pickByMatch().get(matchId);
    const v = side === 'home' ? p?.homeScorePred : p?.awayScorePred;
    return v ?? '';
  }

  async ngOnInit() {
    const userId = this.auth.user()?.sub;
    if (!userId) {
      this.loading.set(false);
      return;
    }
    try {
      const [matchesRes, teamsRes, picksRes, totalsRes, leaderboardRes,
             predCompleteRes, predSimpleRes] = await Promise.all([
        this.api.listMatches(TOURNAMENT_ID),
        this.api.listTeams(TOURNAMENT_ID),
        this.api.myPicks(userId),
        this.api.myTotal(userId, TOURNAMENT_ID),
        this.api.listLeaderboard(TOURNAMENT_ID, 200),
        this.api.listGroupStandingPicks(userId, 'COMPLETE'),
        this.api.listGroupStandingPicks(userId, 'SIMPLE'),
      ]);

      // Predicción de tabla por grupo: prefiero COMPLETE; si no hay,
      // caigo a SIMPLE. Luego de cargar teamMap (más abajo), los slugs
      // se resuelven a TeamLite via predRowsFor().
      type PredRow = { groupLetter: string; pos1: string; pos2: string; pos3: string; pos4: string };
      const predList = ((predCompleteRes.data ?? []) as PredRow[]).filter(
        (p) => !!p && !!p.groupLetter,
      );
      const predFallback = ((predSimpleRes.data ?? []) as PredRow[]).filter(
        (p) => !!p && !!p.groupLetter,
      );
      const predMap = new Map<string, string[]>();
      const completeLetters = new Set(predList.map((p) => p.groupLetter));
      for (const p of predList) {
        predMap.set(p.groupLetter, [p.pos1, p.pos2, p.pos3, p.pos4]);
      }
      // Solo agrega SIMPLE para grupos donde no haya COMPLETE.
      for (const p of predFallback) {
        if (!completeLetters.has(p.groupLetter)) {
          predMap.set(p.groupLetter, [p.pos1, p.pos2, p.pos3, p.pos4]);
        }
      }
      this.predByGroup.set(predMap);

      // Build team map + group teams by letter
      const byLetter = new Map<string, TeamLite[]>();
      for (const t of (teamsRes.data ?? [])) {
        if (!t || !t.slug) continue;
        const team: TeamLite = {
          slug: t.slug,
          name: t.name ?? t.slug,
          flagCode: t.flagCode ?? '',
          groupLetter: t.groupLetter ?? null,
        };
        this.teamMap.set(t.slug, team);
        const letter = team.groupLetter;
        if (!letter) continue;
        const arr = byLetter.get(letter) ?? [];
        arr.push(team);
        byLetter.set(letter, arr);
      }

      // Picks map (para mostrar mi pick en cada partido)
      const pickMap = new Map<string, PickLite>();
      for (const p of (picksRes.data ?? [])) {
        if (!p || !p.matchId) continue;
        pickMap.set(p.matchId, {
          matchId: p.matchId,
          homeScorePred: p.homeScorePred,
          awayScorePred: p.awayScorePred,
          pointsEarned: p.pointsEarned ?? null,
          exactScore: p.exactScore ?? null,
          correctResult: p.correctResult ?? null,
        });
      }
      this.pickByMatch.set(pickMap);

      // Build standings + matches per group
      const groupBlocks: GroupBlock[] = [];
      for (const [letter, teams] of [...byLetter.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
        const teamSlugs = new Set(teams.map((t) => t.slug));
        const matches: MatchLite[] = (matchesRes.data ?? [])
          .filter((m): m is NonNullable<typeof m> =>
            !!m && !!m.id && teamSlugs.has(m.homeTeamId) && teamSlugs.has(m.awayTeamId))
          .map((m) => ({
            id: m.id,
            kickoffAt: m.kickoffAt,
            homeTeamId: m.homeTeamId,
            awayTeamId: m.awayTeamId,
            homeScore: m.homeScore ?? null,
            awayScore: m.awayScore ?? null,
            status: m.status ?? null,
          }))
          .sort((a, b) => a.kickoffAt.localeCompare(b.kickoffAt));

        const rows = computeStandings(teams, matches);

        let played = 0;
        let myPoints = 0;
        for (const m of matches) {
          if (m.status === 'FINAL') played++;
          const p = pickMap.get(m.id);
          if (p?.pointsEarned) myPoints += p.pointsEarned;
        }

        groupBlocks.push({ letter, rows, matches, played, myPoints });
      }
      this.groups.set(groupBlocks);

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
  }
}

/**
 * Calcula la tabla de un grupo a partir de sus equipos y los partidos
 * jugados (status FINAL). Equipos sin partidos arrancan en 0 y aparecen
 * al final tras los que sumaron pts.
 *
 * Tiebreaker: pts → diferencia de gol → goles a favor → orden alfabético.
 */
function computeStandings(teams: TeamLite[], matches: MatchLite[]): StandingsRow[] {
  const rows = new Map<string, StandingsRow>();
  for (const t of teams) {
    rows.set(t.slug, {
      team: t,
      played: 0, wins: 0, draws: 0, losses: 0,
      gf: 0, ga: 0, gd: 0, pts: 0,
    });
  }
  for (const m of matches) {
    if (m.status !== 'FINAL') continue;
    if (m.homeScore == null || m.awayScore == null) continue;
    const h = rows.get(m.homeTeamId);
    const a = rows.get(m.awayTeamId);
    if (!h || !a) continue;
    h.played++; a.played++;
    h.gf += m.homeScore; h.ga += m.awayScore;
    a.gf += m.awayScore; a.ga += m.homeScore;
    if (m.homeScore > m.awayScore) {
      h.wins++; h.pts += 3;
      a.losses++;
    } else if (m.homeScore < m.awayScore) {
      a.wins++; a.pts += 3;
      h.losses++;
    } else {
      h.draws++; a.draws++;
      h.pts++; a.pts++;
    }
  }
  for (const r of rows.values()) r.gd = r.gf - r.ga;
  return [...rows.values()].sort((x, y) => {
    if (y.pts !== x.pts) return y.pts - x.pts;
    if (y.gd !== x.gd) return y.gd - x.gd;
    if (y.gf !== x.gf) return y.gf - x.gf;
    return x.team.name.localeCompare(y.team.name);
  });
}
