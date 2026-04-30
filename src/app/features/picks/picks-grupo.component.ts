import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ApiService } from '../../core/api/api.service';
import { AuthService } from '../../core/auth/auth.service';
import { TimeService } from '../../core/time/time.service';
import { ToastService } from '../../core/notifications/toast.service';
import { humanizeError } from '../../core/notifications/domain-errors';
import { TeamFlagComponent } from '../../shared/ui/team-flag.component';

const TOURNAMENT_ID = 'mundial-2026';

const GROUP_LETTERS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L'];

interface TeamInfo { slug: string; name: string; flagCode: string; groupLetter: string | null; crestUrl: string | null; }
interface MatchItem {
  id: string; phaseId: string; homeTeamId: string; awayTeamId: string;
  kickoffAt: string; status?: string;
  homeScore?: number | null; awayScore?: number | null;
}
interface PickRow {
  homeScorePred: number; awayScorePred: number;
  pointsEarned?: number | null; exactScore?: boolean | null; correctResult?: boolean | null;
}

interface StandingRow {
  team: TeamInfo;
  played: number; won: number; drawn: number; lost: number;
  points: number; goalDiff: number;
}

interface GroupCardData {
  letter: string;
  teams: TeamInfo[];
  standings: StandingRow[];
  matchesInGroup: MatchItem[];
  played: number;
  total: number;
  myPicksCount: number;
  pendingCount: number;
  isTbd: boolean;
}

interface PendingEdit {
  matchId: string;
  home: number;
  away: number;
}

@Component({
  standalone: true,
  selector: 'app-picks-grupo',
  imports: [RouterLink, TeamFlagComponent],
  template: `
    <header class="page-header">
      <div class="page-header__top">
        <div class="page-header__title">
          <small>Mundial 2026 · 12 grupos · 72 partidos de fase de grupos</small>
          <h1>Picks por grupo</h1>
        </div>
      </div>

      <div class="page-header__controls">
        <div class="view-mode-toggle">
          <a class="view-mode-toggle__option" routerLink="/picks">📅 Cronológico</a>
          <button class="view-mode-toggle__option is-active" type="button">🏆 Por grupo</button>
          <button class="view-mode-toggle__option" type="button" disabled>🌳 Llaves</button>
        </div>
        <p style="margin-left: auto; font-size: var(--fs-sm); color: var(--color-text-muted);">
          Click en un grupo para hacer/editar los picks de esa fase.
        </p>
      </div>
    </header>

    @if (loading()) {
      <p style="padding: var(--space-2xl); text-align: center;">Cargando…</p>
    } @else {
      <div class="container-app groups-list">
        @for (g of groups(); track g.letter) {
          @if (!g.isTbd) {
            <section class="group-block" [id]="'grupo-' + g.letter.toLowerCase()">
              <header class="group-block__header">
                <h2>Grupo {{ g.letter }}</h2>
                <span class="group-block__meta">
                  {{ g.played }} / {{ g.total }} jugados
                  @if (g.pendingCount > 0) {
                    · <span style="color: var(--color-lost);">{{ g.pendingCount }} pick{{ g.pendingCount === 1 ? '' : 's' }} pendiente{{ g.pendingCount === 1 ? '' : 's' }}</span>
                  } @else if (g.myPicksCount > 0) {
                    · {{ g.myPicksCount }} pick{{ g.myPicksCount === 1 ? '' : 's' }} hechos
                  }
                </span>
              </header>

              <div class="group-block__body">
                <!-- LEFT: matches con score inputs -->
                <div class="group-block__matches">
                  <h3 class="group-block__col-head">Partidos</h3>
                  @for (m of g.matchesInGroup; track m.id) {
                    @let isFinal = m.status === 'FINAL' && m.homeScore != null && m.awayScore != null;
                    @let isPast = time.isPast(m.kickoffAt);
                    @let pick = picksByMatch().get(m.id);

                    <article class="gm-row"
                             [class.gm-row--final]="isFinal"
                             [class.gm-row--locked]="isPast && !isFinal">
                      <div class="gm-row__top">
                        <span class="gm-row__date">{{ time.formatKickoff(m.kickoffAt) }}</span>
                        @if (isFinal && pick?.pointsEarned != null) {
                          <strong style="color: var(--color-primary-green);">+{{ pick?.pointsEarned ?? 0 }} pts</strong>
                        } @else if (isFinal) {
                          <strong>FT</strong>
                        } @else if (isPast) {
                          <strong style="color: var(--color-lost);">Cerrado</strong>
                        } @else {
                          <span style="font-size: var(--fs-xs); color: var(--color-text-muted);">{{ time.timeUntil(m.kickoffAt) }}</span>
                        }
                      </div>

                      <div class="gm-row__teams">
                        <app-team-flag [flagCode]="teamFlagCode(m.homeTeamId)" [crestUrl]="teamCrest(m.homeTeamId)"
                                       [name]="teamName(m.homeTeamId)" [size]="22" />
                        <span class="gm-row__team-name">{{ teamName(m.homeTeamId) }}</span>

                        @if (isFinal) {
                          <span class="gm-row__final">{{ m.homeScore }}—{{ m.awayScore }}</span>
                        } @else if (isPast) {
                          <span class="gm-row__vs">vs</span>
                        } @else {
                          <div class="gm-row__inputs">
                            <button type="button" class="gm-step"
                                    [disabled]="(getEditHome(m.id) ?? 0) <= 0"
                                    (click)="editScore(m.id, 'home', -1)">−</button>
                            <span class="gm-score">{{ displayScore(m.id, 'home', pick) }}</span>
                            <button type="button" class="gm-step"
                                    (click)="editScore(m.id, 'home', 1)"
                                    [disabled]="(getEditHome(m.id) ?? 0) >= 20">+</button>
                            <span class="gm-sep">—</span>
                            <button type="button" class="gm-step"
                                    [disabled]="(getEditAway(m.id) ?? 0) <= 0"
                                    (click)="editScore(m.id, 'away', -1)">−</button>
                            <span class="gm-score">{{ displayScore(m.id, 'away', pick) }}</span>
                            <button type="button" class="gm-step"
                                    (click)="editScore(m.id, 'away', 1)"
                                    [disabled]="(getEditAway(m.id) ?? 0) >= 20">+</button>
                          </div>
                        }

                        <span class="gm-row__team-name gm-row__team-name--right">{{ teamName(m.awayTeamId) }}</span>
                        <app-team-flag [flagCode]="teamFlagCode(m.awayTeamId)" [crestUrl]="teamCrest(m.awayTeamId)"
                                       [name]="teamName(m.awayTeamId)" [size]="22" />
                      </div>

                      @if (isFinal && pick) {
                        <p class="gm-row__pick"
                           [style.color]="(pick?.pointsEarned ?? 0) > 0 ? 'var(--color-primary-green)' : 'var(--color-text-muted)'">
                          Tu pick: {{ pick?.homeScorePred }}-{{ pick?.awayScorePred }}
                          @if (pick?.exactScore) { · Exacto }
                          @else if (pick?.correctResult) { · Resultado OK }
                          @else { · Falló }
                        </p>
                      }
                    </article>
                  }
                  @if (g.matchesInGroup.length === 0) {
                    <p style="color: var(--color-text-muted); padding: var(--space-md); font-size: var(--fs-sm);">
                      Calendario aún no publicado.
                    </p>
                  }
                </div>

                <!-- RIGHT: standings -->
                <div class="group-block__standings">
                  <h3 class="group-block__col-head">Tabla</h3>
                  <table class="standings standings--group">
                    <thead>
                      <tr>
                        <th>#</th><th></th><th>Selección</th>
                        <th title="Partidos jugados">PJ</th>
                        <th title="Diferencia de gol">DG</th>
                        <th>Pts</th>
                      </tr>
                    </thead>
                    <tbody>
                      @for (row of g.standings; track row.team.slug; let i = $index) {
                        <tr>
                          <td class="pos">{{ row.played > 0 ? (i + 1) : '—' }}</td>
                          <td>
                            <app-team-flag [flagCode]="row.team.flagCode" [crestUrl]="row.team.crestUrl"
                                           [name]="row.team.name" [size]="20" />
                          </td>
                          <td>{{ row.team.name }}</td>
                          <td>{{ row.played }}</td>
                          <td>{{ row.goalDiff > 0 ? '+' + row.goalDiff : row.goalDiff }}</td>
                          <td><strong>{{ row.points }}</strong></td>
                        </tr>
                      }
                    </tbody>
                  </table>
                </div>
              </div>
            </section>
          } @else {
            <section class="group-block group-block--tbd">
              <header class="group-block__header">
                <h2>Grupo {{ g.letter }}</h2>
                <span class="group-block__meta">Por sortear</span>
              </header>
            </section>
          }
        }
      </div>

      <!-- Sticky save bar -->
      @if (dirtyCount() > 0) {
        <div class="save-bar">
          <button class="btn btn--primary" type="button"
                  [disabled]="saving()" (click)="saveAllPicks()">
            {{ saving() ? 'Guardando…' : 'Guardar ' + dirtyCount() + ' pick' + (dirtyCount() === 1 ? '' : 's') }}
          </button>
        </div>
      }
    }
  `,
  styles: [`
    .groups-list { display: grid; gap: var(--space-2xl); padding-bottom: 100px; }
    .group-block {
      background: var(--color-primary-white);
      border: 1px solid var(--wf-line);
      border-radius: 12px;
      padding: var(--space-md);
    }
    .group-block--tbd { opacity: 0.6; }
    .group-block__header {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      flex-wrap: wrap;
      gap: var(--space-sm);
      padding-bottom: var(--space-sm);
      margin-bottom: var(--space-md);
      border-bottom: 1px solid var(--wf-line-2);
    }
    .group-block__header h2 {
      font-family: var(--font-display);
      font-size: 24px;
      letter-spacing: 0.04em;
      line-height: 1.05;
    }
    .group-block__meta {
      font-size: 11px;
      color: var(--color-text-muted);
      letter-spacing: 0;
      text-transform: none;
    }

    .group-block__body {
      display: grid;
      grid-template-columns: 1fr;
      gap: var(--space-lg);
    }
    @media (min-width: 992px) {
      .group-block__body { grid-template-columns: 1fr 1fr; }
    }

    .group-block__col-head {
      font-size: 9px;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      margin-bottom: var(--space-sm);
      color: var(--color-text-muted);
      font-weight: 700;
    }

    .group-block__matches { display: grid; gap: var(--space-xs); align-content: start; }

    .gm-row {
      display: grid;
      gap: 6px;
      padding: var(--space-sm) var(--space-md);
      border-radius: 8px;
      background: var(--wf-fill);
      border: 1px solid var(--wf-line);
    }
    .gm-row--final { background: rgba(0,200,100,0.08); }
    .gm-row--locked { opacity: 0.7; }
    .gm-row__top {
      display: flex; justify-content: space-between; align-items: center;
      gap: var(--space-sm);
      font-size: var(--fs-xs);
      text-transform: uppercase;
      letter-spacing: 0.06em;
      color: var(--color-text-muted);
    }
    .gm-row__teams {
      display: grid;
      grid-template-columns: 22px 1fr auto 1fr 22px;
      gap: 8px;
      align-items: center;
      font-size: var(--fs-sm);
    }
    .gm-row__team-name { font-weight: var(--fw-semibold); }
    .gm-row__team-name--right { text-align: right; }
    .gm-row__final {
      font-family: var(--font-display);
      font-size: var(--fs-lg);
      text-align: center;
      color: var(--color-primary-black);
    }
    .gm-row__vs {
      font-family: var(--font-display);
      font-size: var(--fs-md);
      text-align: center;
      color: var(--color-text-muted);
    }
    .gm-row__inputs {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      justify-content: center;
    }
    .gm-step {
      width: 22px; height: 22px;
      border: 1px solid rgba(0,0,0,0.15);
      background: var(--color-primary-white);
      color: var(--color-primary-black);
      border-radius: 4px;
      cursor: pointer;
      font-weight: var(--fw-bold);
      font-size: var(--fs-sm);
      line-height: 1;
    }
    .gm-step:disabled { opacity: 0.4; cursor: not-allowed; }
    .gm-score {
      min-width: 18px; text-align: center;
      font-family: var(--font-display);
      font-size: var(--fs-md);
    }
    .gm-sep { color: var(--color-text-muted); padding: 0 4px; }
    .gm-row__pick {
      font-size: var(--fs-xs);
      text-transform: uppercase;
      letter-spacing: 0.06em;
      font-weight: var(--fw-bold);
      margin-top: 4px;
    }

    .group-block__standings table { width: 100%; }
    .group-block__standings .pos {
      font-family: var(--font-display);
      font-size: var(--fs-md);
    }

    .save-bar {
      position: fixed;
      bottom: 0; left: 0; right: 0;
      padding: var(--space-md);
      background: rgba(255,255,255,0.96);
      backdrop-filter: blur(8px);
      border-top: 1px solid var(--color-primary-grey);
      display: flex;
      justify-content: center;
      z-index: 50;
      box-shadow: 0 -4px 12px rgba(0,0,0,0.06);
    }
    .save-bar .btn { min-width: 240px; }
  `],
})
export class PicksGrupoComponent implements OnInit {
  private api = inject(ApiService);
  private auth = inject(AuthService);
  time = inject(TimeService);
  private toast = inject(ToastService);

  loading = signal(true);
  saving = signal(false);

  teams = signal<Map<string, TeamInfo>>(new Map());
  matches = signal<MatchItem[]>([]);
  picks = signal<PickRow[]>([]);
  pickByMatchId = signal<Map<string, PickRow & { matchId: string }>>(new Map());

  // Pending edits (in-modal drafts before saving)
  pendingEdits = signal<Map<string, PendingEdit>>(new Map());

  picksByMatch = computed(() => this.pickByMatchId());

  groups = computed<GroupCardData[]>(() => {
    const teamMap = this.teams();
    const matches = this.matches();
    const picks = this.pickByMatchId();
    return GROUP_LETTERS.map((letter) => {
      const teamsInGroup = Array.from(teamMap.values())
        .filter((t) => t.groupLetter === letter);
      const matchesInGroup = matches.filter((m) => {
        const homeG = teamMap.get(m.homeTeamId)?.groupLetter;
        const awayG = teamMap.get(m.awayTeamId)?.groupLetter;
        return homeG === letter && awayG === letter;
      });
      const standings = this.computeStandings(teamsInGroup, matchesInGroup);
      const played = matchesInGroup.filter((m) => m.status === 'FINAL').length;
      const myPicksCount = matchesInGroup.filter((m) => picks.has(m.id)).length;
      const pendingCount = matchesInGroup
        .filter((m) => !this.time.isPast(m.kickoffAt) && !picks.has(m.id))
        .length;
      return {
        letter,
        teams: teamsInGroup,
        standings,
        matchesInGroup: matchesInGroup.sort((a, b) => a.kickoffAt.localeCompare(b.kickoffAt)),
        played,
        total: matchesInGroup.length || 6,
        myPicksCount,
        pendingCount,
        isTbd: teamsInGroup.length === 0,
      };
    });
  });

  dirtyCount = computed(() => this.pendingEdits().size);

  async ngOnInit() {
    const userId = this.auth.user()?.sub;
    if (!userId) { this.loading.set(false); return; }
    try {
      const [teamsRes, matchesRes, picksRes] = await Promise.all([
        this.api.listTeams(TOURNAMENT_ID),
        this.api.listMatches(TOURNAMENT_ID),
        this.api.myPicks(userId),
      ]);
      const tm = new Map<string, TeamInfo>();
      for (const t of teamsRes.data ?? []) {
        tm.set(t.slug, {
          slug: t.slug,
          name: t.name,
          flagCode: t.flagCode,
          groupLetter: t.groupLetter ?? null,
          crestUrl: t.crestUrl ?? null,
        });
      }
      this.teams.set(tm);

      this.matches.set((matchesRes.data ?? []).map((m) => ({
        id: m.id, phaseId: m.phaseId, homeTeamId: m.homeTeamId, awayTeamId: m.awayTeamId,
        kickoffAt: m.kickoffAt, status: m.status ?? undefined,
        homeScore: m.homeScore, awayScore: m.awayScore,
      })));

      const map = new Map<string, PickRow & { matchId: string }>();
      for (const p of picksRes.data ?? []) {
        map.set(p.matchId, {
          matchId: p.matchId,
          homeScorePred: p.homeScorePred, awayScorePred: p.awayScorePred,
          pointsEarned: p.pointsEarned, exactScore: p.exactScore, correctResult: p.correctResult,
        });
      }
      this.pickByMatchId.set(map);
    } finally {
      this.loading.set(false);
    }
  }

  editScore(matchId: string, side: 'home' | 'away', delta: number) {
    const existing = this.pendingEdits().get(matchId)
      ?? this.editFromPick(matchId);
    const nextHome = side === 'home' ? clamp(existing.home + delta) : existing.home;
    const nextAway = side === 'away' ? clamp(existing.away + delta) : existing.away;
    this.pendingEdits.update((m) => {
      const copy = new Map(m);
      copy.set(matchId, { matchId, home: nextHome, away: nextAway });
      return copy;
    });
  }

  private editFromPick(matchId: string): PendingEdit {
    const p = this.pickByMatchId().get(matchId);
    return { matchId, home: p?.homeScorePred ?? 0, away: p?.awayScorePred ?? 0 };
  }

  getEditHome(matchId: string): number | null {
    return this.pendingEdits().get(matchId)?.home
      ?? this.pickByMatchId().get(matchId)?.homeScorePred
      ?? null;
  }
  getEditAway(matchId: string): number | null {
    return this.pendingEdits().get(matchId)?.away
      ?? this.pickByMatchId().get(matchId)?.awayScorePred
      ?? null;
  }
  displayScore(matchId: string, side: 'home' | 'away', pick: PickRow | undefined): string {
    const edit = this.pendingEdits().get(matchId);
    if (edit) return String(side === 'home' ? edit.home : edit.away);
    if (pick) return String(side === 'home' ? pick.homeScorePred : pick.awayScorePred);
    return '—';
  }

  async saveAllPicks() {
    const edits = Array.from(this.pendingEdits().values());
    if (edits.length === 0) return;
    this.saving.set(true);
    let ok = 0, fail = 0;
    for (const e of edits) {
      try {
        await this.api.upsertPick(e.matchId, e.home, e.away);
        ok++;
        // optimistically update local picks
        this.pickByMatchId.update((m) => {
          const copy = new Map(m);
          copy.set(e.matchId, {
            matchId: e.matchId,
            homeScorePred: e.home, awayScorePred: e.away,
            pointsEarned: null, exactScore: null, correctResult: null,
          });
          return copy;
        });
      } catch (err) {
        fail++;
        this.toast.error(humanizeError(err));
      }
    }
    this.pendingEdits.set(new Map());
    if (ok > 0) this.toast.success(`${ok} pick${ok === 1 ? '' : 's'} guardado${ok === 1 ? '' : 's'}`);
    this.saving.set(false);
  }

  // ---- helpers ----
  teamName(slug: string): string { return this.teams().get(slug)?.name ?? slug; }
  teamFlagCode(slug: string): string { return this.teams().get(slug)?.flagCode ?? ''; }
  teamCrest(slug: string): string | null { return this.teams().get(slug)?.crestUrl ?? null; }
  flagClass(code: string): string { return code ? `flag--${code.toLowerCase()}` : 'flag'; }

  private computeStandings(teams: TeamInfo[], matches: MatchItem[]): StandingRow[] {
    const stats = new Map<string, StandingRow>();
    for (const t of teams) {
      stats.set(t.slug, { team: t, played: 0, won: 0, drawn: 0, lost: 0, points: 0, goalDiff: 0 });
    }
    for (const m of matches) {
      if (m.status !== 'FINAL' || m.homeScore == null || m.awayScore == null) continue;
      const home = stats.get(m.homeTeamId);
      const away = stats.get(m.awayTeamId);
      if (!home || !away) continue;
      home.played++; away.played++;
      home.goalDiff += m.homeScore - m.awayScore;
      away.goalDiff += m.awayScore - m.homeScore;
      if (m.homeScore > m.awayScore) {
        home.won++; home.points += 3; away.lost++;
      } else if (m.homeScore < m.awayScore) {
        away.won++; away.points += 3; home.lost++;
      } else {
        home.drawn++; away.drawn++; home.points += 1; away.points += 1;
      }
    }
    return Array.from(stats.values()).sort((a, b) => {
      if (b.points !== a.points) return b.points - a.points;
      if (b.goalDiff !== a.goalDiff) return b.goalDiff - a.goalDiff;
      return a.team.name.localeCompare(b.team.name);
    });
  }
}

function clamp(n: number): number {
  if (n < 0) return 0;
  if (n > 20) return 20;
  return n;
}
