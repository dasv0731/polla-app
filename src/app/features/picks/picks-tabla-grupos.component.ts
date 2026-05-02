import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { ApiService } from '../../core/api/api.service';
import { AuthService } from '../../core/auth/auth.service';
import { TimeService } from '../../core/time/time.service';
import { ToastService } from '../../core/notifications/toast.service';
import { humanizeError } from '../../core/notifications/domain-errors';

const TOURNAMENT_ID = 'mundial-2026';
const SAVE_DEBOUNCE_MS = 600;

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
  imports: [RouterLink, RouterLinkActive],
  template: `
    <section class="page">

      <!-- Header (mismo patrón que /picks) -->
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
          <button type="button" class="seg__item"
                  [class.is-active]="view() === 'pred'"
                  (click)="view.set('pred')">Mi predicción</button>
        </div>
      </div>

      @if (view() === 'pred') {
        <div class="empty-block">
          <h3>Tu predicción de tabla final</h3>
          <p>
            Arrastra equipos en el editor para predecir cómo terminará cada grupo.
            La predicción cierra al kickoff inaugural.
          </p>
          <a class="btn-wf btn-wf--primary" routerLink="/picks/group-stage/predict">
            ✏ Editar mi predicción →
          </a>
        </div>
      } @else if (loading()) {
        <p class="loading-msg">Cargando tabla…</p>
      } @else {
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
                    <th class="center">PJ</th>
                    <th class="center">DG</th>
                    <th class="center">PTS</th>
                  </tr>
                </thead>
                <tbody>
                  @for (r of g.rows; track r.team.slug; let i = $index) {
                    <tr [class.qualify]="i < 2">
                      <td class="pos">{{ i + 1 }}</td>
                      <td>
                        @if (r.team.flagCode) {
                          <span class="fi fi-{{ r.team.flagCode.toLowerCase() }} flag-inline"></span>
                        }
                        <span class="text-bold">{{ r.team.name }}</span>
                      </td>
                      <td class="num-cell">{{ r.played }}</td>
                      <td class="num-cell">{{ r.gd > 0 ? '+' + r.gd : r.gd }}</td>
                      <td class="pts-cell">{{ r.pts }}</td>
                    </tr>
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
          @if (groups().length > 0) {
            <span>· La tabla se actualiza a medida que se publican resultados.</span>
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
                @let isPlayed = m.status === 'FINAL';
                @let isLive = m.status === 'IN_PROGRESS' || m.status === 'LIVE';
                @let isUpcoming = !isPlayed && !isLive;
                @let saving = savingMatch() === m.id;

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
                      } @else {
                        <span class="pill">PRÓX · {{ countdown(m.kickoffAt) }}</span>
                      }
                    </div>
                    <div class="match" style="padding:0;">
                      <div class="match__team">
                        @if (teamFlag(m.homeTeamId)) {
                          <span class="fi fi-{{ teamFlag(m.homeTeamId) }} flag"></span>
                        }
                        {{ teamName(m.homeTeamId) }}
                      </div>

                      <div class="score">
                        @if (isUpcoming) {
                          <input type="number" class="score__input" min="0" max="9"
                                 [value]="pick?.homeScorePred ?? ''"
                                 placeholder="0"
                                 (input)="onScoreInput(m.id, 'home', $event)"
                                 [attr.aria-label]="'Goles ' + teamName(m.homeTeamId)">
                          <span>—</span>
                          <input type="number" class="score__input" min="0" max="9"
                                 [value]="pick?.awayScorePred ?? ''"
                                 placeholder="0"
                                 (input)="onScoreInput(m.id, 'away', $event)"
                                 [attr.aria-label]="'Goles ' + teamName(m.awayTeamId)">
                        } @else if (isLive) {
                          <div class="score__num score__num--filled">{{ m.homeScore ?? 0 }}</div>
                          <span>—</span>
                          <div class="score__num score__num--filled">{{ m.awayScore ?? 0 }}</div>
                        } @else {
                          <div class="score__num score__num--filled">{{ m.homeScore }}</div>
                          <span>—</span>
                          <div class="score__num score__num--filled">{{ m.awayScore }}</div>
                        }
                      </div>

                      <div class="match__team match__team--right">
                        {{ teamName(m.awayTeamId) }}
                        @if (teamFlag(m.awayTeamId)) {
                          <span class="fi fi-{{ teamFlag(m.awayTeamId) }} flag"></span>
                        }
                      </div>
                    </div>

                    @if (isUpcoming && pick) {
                      <div class="match-card__pills">
                        <span class="pill pill--green">{{ saving ? 'Guardando…' : '✓ Guardado' }}</span>
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
  private toast = inject(ToastService);

  view = signal<'real' | 'pred'>('real');
  loading = signal(true);

  totals = signal<Totals>({ points: 0, exactCount: 0, resultCount: 0, globalRank: null });

  groups = signal<GroupBlock[]>([]);
  pickByMatch = signal<Map<string, PickLite>>(new Map());

  /** Letra del grupo abierto en el modal (null = cerrado). */
  openGroup = signal<string | null>(null);

  /** matchId actualmente guardando (para mostrar "Guardando…"). */
  savingMatch = signal<string | null>(null);
  private debounceTimer = new Map<string, ReturnType<typeof setTimeout>>();
  /** Edits pending per match: lo último que el user tipeó pero aún no se llamó upsert. */
  private pendingEdits = new Map<string, { home: number; away: number }>();

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

  countdown(iso: string): string {
    const ms = new Date(iso).getTime() - Date.now();
    if (ms < 0) return 'jugando';
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
    // Antes de cerrar, vaciamos cualquier debounce pendiente para evitar
    // perder un edit que el user tipeó al cerrar rápido.
    for (const [matchId, t] of this.debounceTimer.entries()) {
      clearTimeout(t);
      void this.flushSave(matchId);
    }
    this.debounceTimer.clear();
    this.openGroup.set(null);
  }

  onScoreInput(matchId: string, side: 'home' | 'away', event: Event) {
    const input = event.target as HTMLInputElement;
    const raw = input.value.replace(/[^0-9]/g, '').slice(0, 1);
    const v = raw === '' ? 0 : Math.max(0, Math.min(9, parseInt(raw, 10)));
    if (raw !== '' && raw !== input.value) input.value = raw;

    const cur = this.pendingEdits.get(matchId) ?? this.scoresFor(matchId);
    const next = side === 'home' ? { home: v, away: cur.away } : { home: cur.home, away: v };
    this.pendingEdits.set(matchId, next);

    // Debounced save
    const existing = this.debounceTimer.get(matchId);
    if (existing) clearTimeout(existing);
    this.debounceTimer.set(
      matchId,
      setTimeout(() => void this.flushSave(matchId), SAVE_DEBOUNCE_MS),
    );
  }

  private scoresFor(matchId: string): { home: number; away: number } {
    const p = this.pickByMatch().get(matchId);
    return { home: p?.homeScorePred ?? 0, away: p?.awayScorePred ?? 0 };
  }

  private async flushSave(matchId: string) {
    const edit = this.pendingEdits.get(matchId);
    if (!edit) return;
    this.pendingEdits.delete(matchId);
    this.debounceTimer.delete(matchId);
    this.savingMatch.set(matchId);
    try {
      await this.api.upsertPick(matchId, edit.home, edit.away);
      // Update local cache so el pill "Guardado" se muestra y la próxima
      // edición parta del valor recién persistido.
      const map = new Map(this.pickByMatch());
      const prev = map.get(matchId);
      map.set(matchId, {
        matchId,
        homeScorePred: edit.home,
        awayScorePred: edit.away,
        pointsEarned: prev?.pointsEarned ?? null,
        exactScore: prev?.exactScore ?? null,
        correctResult: prev?.correctResult ?? null,
      });
      this.pickByMatch.set(map);
    } catch (e) {
      this.toast.error(humanizeError(e));
    } finally {
      this.savingMatch.set(null);
    }
  }

  async ngOnInit() {
    const userId = this.auth.user()?.sub;
    if (!userId) {
      this.loading.set(false);
      return;
    }
    try {
      const [matchesRes, teamsRes, picksRes, totalsRes, leaderboardRes] = await Promise.all([
        this.api.listMatches(TOURNAMENT_ID),
        this.api.listTeams(TOURNAMENT_ID),
        this.api.myPicks(userId),
        this.api.myTotal(userId, TOURNAMENT_ID),
        this.api.listLeaderboard(TOURNAMENT_ID, 200),
      ]);

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
