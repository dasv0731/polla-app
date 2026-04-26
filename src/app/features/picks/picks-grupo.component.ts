import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { ApiService } from '../../core/api/api.service';
import { AuthService } from '../../core/auth/auth.service';
import { TimeService } from '../../core/time/time.service';
import { ToastService } from '../../core/notifications/toast.service';
import { humanizeError } from '../../core/notifications/domain-errors';

const TOURNAMENT_ID = 'mundial-2026';

const GROUP_LETTERS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L'];

interface TeamInfo { slug: string; name: string; flagCode: string; groupLetter: string | null; }
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
  imports: [RouterLink],
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
      <section class="groups-grid">
        @for (g of groups(); track g.letter) {
          <button class="group-card" type="button"
                  [disabled]="g.isTbd"
                  (click)="openGroup(g.letter)"
                  style="text-align: left; cursor: pointer;">
            <header class="group-card__header">
              <span class="group-card__letter">{{ g.letter }}</span>
              <span class="group-card__meta">
                @if (g.isTbd) { Por sortear }
                @else { {{ g.played }} / {{ g.total }} jugados }
              </span>
            </header>
            <div class="group-card__teams">
              @for (row of g.standings; track row.team.slug; let i = $index) {
                <div class="group-card__team">
                  <span class="group-card__team-pos">{{ row.played > 0 ? (i + 1) : '—' }}</span>
                  <span class="flag" [class]="flagClass(row.team.flagCode)"></span>
                  <span class="group-card__team-name">{{ row.team.name }}</span>
                  <span class="group-card__team-played">{{ row.played }}</span>
                  <span class="group-card__team-pts">{{ row.points }}</span>
                </div>
              }
              @for (i of fillTbd(g.standings.length); track i) {
                <div class="group-card__team">
                  <span class="group-card__team-pos">—</span>
                  <span class="flag"></span>
                  <span class="group-card__team-name">TBD</span>
                  <span class="group-card__team-played">—</span>
                  <span class="group-card__team-pts">—</span>
                </div>
              }
            </div>
            <footer class="group-card__footer">
              @if (g.isTbd) {
                <span>—</span>
              } @else {
                <span [style.color]="g.pendingCount > 0 ? 'var(--color-lost)' : null">
                  {{ g.myPicksCount }} picks
                  @if (g.pendingCount > 0) { · {{ g.pendingCount }} pendientes }
                </span>
              }
              <span class="group-card__cta">Ver →</span>
            </footer>
          </button>
        }
      </section>
    }

    <!-- Modal -->
    @if (selectedGroup(); as letter) {
      <div class="modal-backdrop" style="opacity:1; pointer-events:auto;" (click)="closeGroup()"></div>
      <div class="modal" role="dialog" aria-modal="true"
           style="opacity:1; pointer-events:auto; transform: translate(-50%, -50%) scale(1);">
        <header class="modal__header">
          <div>
            <p style="font-size: var(--fs-xs); color: var(--color-text-muted); text-transform: uppercase; letter-spacing: 0.08em; font-weight: var(--fw-bold);">
              Grupo {{ letter }} · {{ selectedGroupData()?.matchesInGroup?.length ?? 0 }} partidos
            </p>
            <h3 class="modal__title">Picks del Grupo {{ letter }}</h3>
          </div>
          <button class="modal__close" type="button" (click)="closeGroup()" aria-label="Cerrar">×</button>
        </header>
        <div class="modal__body">
          @let g = selectedGroupData();
          @if (g !== null) {
            <div class="standings-wrap" style="margin-bottom: var(--space-lg);">
              <table class="standings standings--group">
                <thead>
                  <tr>
                    <th>#</th><th>Equipo</th><th>J</th><th>G</th><th>E</th><th>P</th><th>Pts</th>
                  </tr>
                </thead>
                <tbody>
                  @for (row of g.standings; track row.team.slug; let i = $index) {
                    <tr>
                      <td class="pos">{{ i + 1 }}</td>
                      <td>
                        <span class="flag" [class]="flagClass(row.team.flagCode)"
                              style="display: inline-block; vertical-align: middle; margin-right: 6px; width: 24px; height: 24px;"></span>
                        {{ row.team.name }}
                      </td>
                      <td>{{ row.played }}</td>
                      <td>{{ row.won }}</td>
                      <td>{{ row.drawn }}</td>
                      <td>{{ row.lost }}</td>
                      <td><strong>{{ row.points }}</strong></td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>

            <h4 style="font-family: var(--font-display); font-size: var(--fs-md); text-transform: uppercase; margin-bottom: var(--space-md);">
              {{ g.matchesInGroup.length }} partidos del grupo
            </h4>

            <div style="display: flex; flex-direction: column; gap: var(--space-sm);">
              @for (m of g.matchesInGroup; track m.id) {
                @let isFinal = m.status === 'FINAL' && m.homeScore != null && m.awayScore != null;
                @let isPast = time.isPast(m.kickoffAt);
                @let pick = picksByMatch().get(m.id);

                <article class="pick-card"
                         [class.pick-card--saved]="pick !== undefined && !isPast"
                         [class.pick-card--open]="pick === undefined && !isPast"
                         [class.pick-card--locked]="isPast"
                         style="padding: var(--space-md);">
                  <div class="pick-card__header">
                    <span class="pick-card__phase">{{ time.formatKickoff(m.kickoffAt) }}</span>
                    @if (isFinal && pick?.pointsEarned != null) {
                      <span style="color: var(--color-primary-green); font-weight: var(--fw-bold);">
                        FT · +{{ pick?.pointsEarned ?? 0 }} pts
                      </span>
                    } @else if (isFinal) {
                      <span>FT</span>
                    } @else if (isPast) {
                      <span style="color: var(--color-lost);">Cerrado</span>
                    } @else {
                      <span>{{ time.timeUntil(m.kickoffAt) }}</span>
                    }
                  </div>

                  <div class="pick-card__teams" style="grid-template-columns: 1fr auto 1fr;">
                    <div class="pick-card__team">
                      <span class="flag" [class]="teamFlagClass(m.homeTeamId)" style="width: 32px; height: 32px;"></span>
                      <span class="pick-card__team-name">{{ teamName(m.homeTeamId) }}</span>
                    </div>

                    @if (isFinal) {
                      <div class="pick-card__center" style="font-family: var(--font-display); font-size: var(--fs-2xl);">
                        {{ m.homeScore }} — {{ m.awayScore }}
                      </div>
                    } @else if (isPast) {
                      <div class="pick-card__center">EN VIVO</div>
                    } @else {
                      <div class="score-input" style="gap: var(--space-sm);">
                        <div class="score-input__field">
                          <div class="score-input__stepper">
                            <button class="score-input__btn" type="button"
                                    [disabled]="(getEditHome(m.id) ?? 0) <= 0"
                                    (click)="editScore(m.id, 'home', -1)">−</button>
                            <input class="score-input__value" type="text"
                                   [value]="displayScore(m.id, 'home', pick)" readonly>
                            <button class="score-input__btn" type="button"
                                    [disabled]="(getEditHome(m.id) ?? 0) >= 20"
                                    (click)="editScore(m.id, 'home', 1)">+</button>
                          </div>
                        </div>
                        <span class="score-input__sep">vs</span>
                        <div class="score-input__field">
                          <div class="score-input__stepper">
                            <button class="score-input__btn" type="button"
                                    [disabled]="(getEditAway(m.id) ?? 0) <= 0"
                                    (click)="editScore(m.id, 'away', -1)">−</button>
                            <input class="score-input__value" type="text"
                                   [value]="displayScore(m.id, 'away', pick)" readonly>
                            <button class="score-input__btn" type="button"
                                    [disabled]="(getEditAway(m.id) ?? 0) >= 20"
                                    (click)="editScore(m.id, 'away', 1)">+</button>
                          </div>
                        </div>
                      </div>
                    }

                    <div class="pick-card__team">
                      <span class="flag" [class]="teamFlagClass(m.awayTeamId)" style="width: 32px; height: 32px;"></span>
                      <span class="pick-card__team-name">{{ teamName(m.awayTeamId) }}</span>
                    </div>
                  </div>

                  @if (isFinal && pick) {
                    <div class="pick-card__footer">
                      <span style="font-weight: var(--fw-bold); font-size: var(--fs-xs); text-transform: uppercase; letter-spacing: 0.08em;"
                            [style.color]="(pick?.pointsEarned ?? 0) > 0 ? 'var(--color-primary-green)' : 'var(--color-text-muted)'">
                        Tu pick: {{ pick?.homeScorePred }}-{{ pick?.awayScorePred }}
                        @if (pick?.exactScore) { · Marcador exacto }
                        @else if (pick?.correctResult) { · Resultado correcto }
                        @else { · Falló }
                      </span>
                    </div>
                  }
                </article>
              }
              @if (g.matchesInGroup.length === 0) {
                <p style="text-align: center; color: var(--color-text-muted); padding: var(--space-lg);">
                  Aún no hay partidos cargados para este grupo.
                </p>
              }
            </div>
          }
        </div>
        <footer class="modal__footer">
          <button class="btn btn--ghost" type="button" (click)="closeGroup()">Cerrar</button>
          <button class="btn btn--primary" type="button" (click)="saveAllPicks()" [disabled]="saving() || dirtyCount() === 0">
            {{ saving() ? 'Guardando…' : (dirtyCount() === 0 ? 'Sin cambios' : 'Guardar ' + dirtyCount() + ' pick' + (dirtyCount() === 1 ? '' : 's')) }}
          </button>
        </footer>
      </div>
    }
  `,
})
export class PicksGrupoComponent implements OnInit {
  private api = inject(ApiService);
  private auth = inject(AuthService);
  time = inject(TimeService);
  private toast = inject(ToastService);
  private router = inject(Router);

  loading = signal(true);
  saving = signal(false);
  selectedGroup = signal<string | null>(null);

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

  selectedGroupData = computed<GroupCardData | null>(() => {
    const l = this.selectedGroup();
    if (!l) return null;
    return this.groups().find((g) => g.letter === l) ?? null;
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

  openGroup(letter: string) {
    this.selectedGroup.set(letter);
    this.pendingEdits.set(new Map());
  }
  closeGroup() {
    if (this.dirtyCount() > 0 && !confirm('Tienes picks sin guardar. ¿Cerrar de todas formas?')) {
      return;
    }
    this.selectedGroup.set(null);
    this.pendingEdits.set(new Map());
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
    if (fail === 0) this.selectedGroup.set(null);
    this.saving.set(false);
  }

  // ---- helpers ----
  teamName(slug: string): string { return this.teams().get(slug)?.name ?? slug; }
  teamFlagClass(slug: string): string {
    const code = this.teams().get(slug)?.flagCode;
    return code ? `flag--${code.toLowerCase()}` : 'flag';
  }
  flagClass(code: string): string { return `flag--${code.toLowerCase()}`; }

  fillTbd(currentLen: number): number[] {
    const need = Math.max(0, 4 - currentLen);
    return Array.from({ length: need }, (_, i) => i);
  }

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
