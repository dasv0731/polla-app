import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ApiService } from '../../core/api/api.service';
import { AuthService } from '../../core/auth/auth.service';
import { UserModesService } from '../../core/user/user-modes.service';
import { ToastService } from '../../core/notifications/toast.service';
import { humanizeError } from '../../core/notifications/domain-errors';

type GameMode = 'SIMPLE' | 'COMPLETE';

interface KnockoutMatch {
  id: string;
  phaseOrder: number;
  homeTeamId: string;
  awayTeamId: string;
  kickoffAt: string;
  bracketPosition: number | null;
  venue: string | null;
}

interface PhaseDef {
  order: number;
  label: string;
  expectedMatches: number;
  // Cuál array del BracketPick recibe los ganadores de esta ronda.
  // Ganador de R32 → octavos; ganador de R16 → cuartos; ...; ganador de Final → champion.
  feedsField: 'octavos' | 'cuartos' | 'semis' | 'final' | 'champion';
  pointsLabel: string;
}

const PHASES: PhaseDef[] = [
  { order: 2, label: 'Dieciseisavos (R32)', expectedMatches: 16, feedsField: 'octavos',  pointsLabel: '3 pts/equipo correcto en octavos' },
  { order: 3, label: 'Octavos (R16)',       expectedMatches: 8,  feedsField: 'cuartos',  pointsLabel: '6 pts/equipo correcto en cuartos' },
  { order: 4, label: 'Cuartos',             expectedMatches: 4,  feedsField: 'semis',    pointsLabel: '8 pts/equipo correcto en semis' },
  { order: 5, label: 'Semifinales',         expectedMatches: 2,  feedsField: 'final',    pointsLabel: '10 pts/finalista correcto' },
  // Order 6 incluye Final + 3er puesto. El bracketPosition=1 (la Final)
  // determina al campeón; el 3er puesto se muestra pero no se score (aún).
  { order: 6, label: 'Final + 3er puesto',  expectedMatches: 2,  feedsField: 'champion', pointsLabel: '15 pts si campeón correcto (Final = bracketPosition 1)' },
];

const TOURNAMENT_ID = 'mundial-2026';
const STORAGE_KEY = (userId: string, mode: GameMode) => `polla-bracket-winners-${mode}-${userId}`;

interface TeamLite { slug: string; name: string; flagCode: string; }

@Component({
  standalone: true,
  selector: 'app-bracket-picks',
  imports: [RouterLink],
  template: `
    <header class="page-header">
      <small>Predicciones · llaves eliminatorias</small>
      <h1>Bracket</h1>

      @if (availableModes().length === 0 && !modesLoading()) {
        <p class="form-card__hint" style="color: var(--color-lost);">
          Necesitas pertenecer a al menos un grupo privado.
          <a class="link-green" routerLink="/groups/new">Crea uno →</a>
        </p>
      } @else if (availableModes().length > 1) {
        <div style="display: flex; gap: var(--space-sm); margin-top: var(--space-md); flex-wrap: wrap;">
          @for (m of availableModes(); track m) {
            <button class="btn" type="button"
                    [class.btn--primary]="mode() === m"
                    [class.btn--ghost]="mode() !== m"
                    (click)="switchMode(m)">
              {{ m === 'COMPLETE' ? 'Modo completo' : 'Modo simple' }}
            </button>
          }
        </div>
      } @else if (mode()) {
        <p class="form-card__hint" style="margin-top: var(--space-sm);">
          Predicción <strong>{{ mode() === 'COMPLETE' ? 'modo completo' : 'modo simple' }}</strong>.
        </p>
      }

      @if (mode()) {
        <p class="form-card__hint">
          El admin define las llaves a partir de los resultados de la fase de grupos.
          Tu trabajo: <strong>elegir el ganador de cada partido</strong>. Doble contabilidad —
          un equipo bien puesto desde octavos hasta campeón suma 3+6+8+10+15 = 42 pts.
        </p>
      }
    </header>

    @if (loading()) {
      <p style="padding: var(--space-2xl); text-align: center;">Cargando…</p>
    } @else if (mode() && hasNoKnockoutMatches()) {
      <div class="empty-state" style="padding: var(--space-2xl); text-align: center;">
        <h3>Las llaves todavía no están armadas</h3>
        <p>
          El admin carga las llaves después de que termine la fase de grupos
          (entre el último partido de grupos y el primero de octavos).
          Vuelve cuando las llaves estén disponibles.
        </p>
      </div>
    } @else if (mode()) {
      <main class="bp-main">
        @for (phase of PHASES; track phase.order) {
          @let matches = matchesByPhase(phase.order);
          @if (matches.length > 0) {
            <section class="bp-phase">
              <header class="bp-phase__head">
                <h2>{{ phase.label }}</h2>
                <small>{{ matches.length }} {{ matches.length === 1 ? 'partido' : 'partidos' }} · {{ phase.pointsLabel }}</small>
              </header>

              <div class="bp-matches">
                @for (m of matches; track m.id) {
                  @let pickedSlug = winners().get(m.id);
                  <article class="bp-match">
                    <button type="button"
                            class="bp-team-btn"
                            [class.bp-team-btn--win]="pickedSlug === m.homeTeamId"
                            [class.bp-team-btn--lose]="pickedSlug && pickedSlug !== m.homeTeamId"
                            (click)="pickWinner(m.id, m.homeTeamId)">
                      <span class="bp-team-btn__flag fi" [class]="'fi-' + (teamMap().get(m.homeTeamId)?.flagCode || '').toLowerCase()"></span>
                      <span class="bp-team-btn__name">{{ teamMap().get(m.homeTeamId)?.name || m.homeTeamId }}</span>
                      @if (pickedSlug === m.homeTeamId) { <span class="bp-team-btn__win">✓</span> }
                    </button>

                    <span class="bp-vs">vs</span>

                    <button type="button"
                            class="bp-team-btn"
                            [class.bp-team-btn--win]="pickedSlug === m.awayTeamId"
                            [class.bp-team-btn--lose]="pickedSlug && pickedSlug !== m.awayTeamId"
                            (click)="pickWinner(m.id, m.awayTeamId)">
                      <span class="bp-team-btn__flag fi" [class]="'fi-' + (teamMap().get(m.awayTeamId)?.flagCode || '').toLowerCase()"></span>
                      <span class="bp-team-btn__name">{{ teamMap().get(m.awayTeamId)?.name || m.awayTeamId }}</span>
                      @if (pickedSlug === m.awayTeamId) { <span class="bp-team-btn__win">✓</span> }
                    </button>

                    @if (m.venue) {
                      <small class="bp-match__venue">{{ m.venue }}</small>
                    }
                  </article>
                }
              </div>
            </section>
          }
        }

        <footer class="bp-foot">
          @if (saveError()) {
            <p class="form-card__hint" style="color: var(--color-lost);">{{ saveError() }}</p>
          }
          <p class="form-card__hint">
            Tu predicción se guarda automáticamente en este navegador.
            Al pulsar "Guardar en la base", se sube al servidor.
            <strong>{{ pickedCount() }}</strong> de <strong>{{ totalKnockoutMatches() }}</strong> partidos elegidos.
          </p>
          <button class="btn btn--primary" type="button"
                  [disabled]="saving()"
                  (click)="saveAll()">
            {{ saving() ? 'Guardando…' : 'Guardar en la base' }}
          </button>
          @if (lastSavedAt()) {
            <p class="form-card__hint" style="margin-top: var(--space-sm);">
              Último guardado: {{ formatDate(lastSavedAt()!) }}
            </p>
          }
        </footer>
      </main>
    }
  `,
  styles: [`
    .bp-main {
      display: grid;
      gap: var(--space-xl);
      padding: 0 var(--section-x-mobile, var(--space-md));
    }
    .bp-phase {
      background: var(--color-primary-white);
      border: var(--border-grey);
      border-radius: var(--radius-md);
      padding: var(--space-md);
    }
    .bp-phase__head {
      margin-bottom: var(--space-md);
    }
    .bp-phase__head h2 {
      font-family: var(--font-display);
      font-size: var(--fs-lg);
      text-transform: uppercase;
      line-height: 1;
    }
    .bp-phase__head small {
      display: block;
      color: var(--color-text-muted);
      font-size: var(--fs-xs);
      text-transform: uppercase;
      letter-spacing: 0.06em;
      margin-top: 4px;
    }
    .bp-matches {
      display: grid;
      gap: var(--space-sm);
    }
    .bp-match {
      display: grid;
      grid-template-columns: 1fr 40px 1fr;
      align-items: center;
      gap: var(--space-sm);
      padding: var(--space-sm);
      background: var(--color-primary-grey, #f4f4f4);
      border-radius: var(--radius-sm);
      position: relative;
    }
    .bp-vs {
      text-align: center;
      font-size: var(--fs-xs);
      color: var(--color-text-muted);
      text-transform: uppercase;
      letter-spacing: 0.08em;
    }
    .bp-team-btn {
      display: grid;
      grid-template-columns: 24px 1fr auto;
      align-items: center;
      gap: 8px;
      padding: 10px 12px;
      background: var(--color-primary-white);
      border: 2px solid rgba(0,0,0,0.08);
      border-radius: var(--radius-sm);
      cursor: pointer;
      font: inherit;
      text-align: left;
      font-size: var(--fs-sm);
      transition: border-color 100ms, background 100ms, opacity 100ms;
    }
    .bp-team-btn:hover {
      border-color: rgba(0,0,0,0.25);
    }
    .bp-team-btn--win {
      border-color: var(--color-primary-green);
      background: rgba(0, 200, 100, 0.12);
      font-weight: 600;
    }
    .bp-team-btn--lose {
      opacity: 0.45;
    }
    .bp-team-btn__flag { width: 20px; height: 20px; border-radius: 3px; }
    .bp-team-btn__name {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .bp-team-btn__win {
      color: var(--color-primary-green);
      font-weight: bold;
    }
    .bp-match__venue {
      grid-column: 1 / -1;
      text-align: center;
      font-size: 10px;
      color: var(--color-text-muted);
      text-transform: uppercase;
      letter-spacing: 0.06em;
    }
    .bp-foot {
      display: grid;
      gap: var(--space-sm);
      padding: var(--space-md);
      background: var(--color-primary-white);
      border: var(--border-grey);
      border-radius: var(--radius-md);
    }
    @media (max-width: 600px) {
      .bp-match { grid-template-columns: 1fr; }
      .bp-vs { display: none; }
    }
  `],
})
export class BracketPicksComponent implements OnInit {
  private api = inject(ApiService);
  private auth = inject(AuthService);
  private userModes = inject(UserModesService);
  private toast = inject(ToastService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);

  PHASES = PHASES;

  loading = signal(true);
  modesLoading = signal(true);
  saving = signal(false);
  saveError = signal<string | null>(null);
  lastSavedAt = signal<string | null>(null);

  availableModes = computed(() => this.userModes.modes());
  mode = signal<GameMode | null>(null);

  teams = signal<TeamLite[]>([]);
  teamMap = signal<Map<string, TeamLite>>(new Map());

  matches = signal<KnockoutMatch[]>([]);
  // matchId → ganador (slug)
  winners = signal<Map<string, string>>(new Map());

  private serverId: string | null = null;
  private currentUserId = '';

  hasNoKnockoutMatches = computed(() => this.matches().length === 0);
  totalKnockoutMatches = computed(() => this.matches().length);
  pickedCount = computed(() => this.winners().size);

  matchesByPhase(order: number): KnockoutMatch[] {
    return this.matches()
      .filter((m) => m.phaseOrder === order)
      .sort((a, b) => {
        const ap = a.bracketPosition ?? 999;
        const bp = b.bracketPosition ?? 999;
        if (ap !== bp) return ap - bp;
        return a.kickoffAt.localeCompare(b.kickoffAt);
      });
  }

  async ngOnInit() {
    this.currentUserId = this.auth.user()?.sub ?? '';
    if (!this.currentUserId) {
      this.toast.error('Necesitas estar logueado');
      this.modesLoading.set(false);
      this.loading.set(false);
      return;
    }
    this.modesLoading.set(false);

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
      const [teamsRes, matchesRes, phasesRes, bracketRes] = await Promise.all([
        this.api.listTeams(TOURNAMENT_ID),
        this.api.listMatches(TOURNAMENT_ID),
        this.api.listPhases(TOURNAMENT_ID),
        this.api.getBracketPick(this.currentUserId, TOURNAMENT_ID, m),
      ]);

      const list = (teamsRes.data ?? [])
        .map((t) => ({ slug: t.slug, name: t.name, flagCode: t.flagCode }))
        .sort((a, b) => a.name.localeCompare(b.name));
      this.teams.set(list);
      const tmap = new Map<string, TeamLite>();
      for (const t of list) tmap.set(t.slug, t);
      this.teamMap.set(tmap);

      // Solo nos importan partidos de fases eliminatorias (order 2..6).
      // Necesitamos el order de cada Phase para filtrar.
      const phaseOrderById = new Map<string, number>();
      for (const p of phasesRes.data ?? []) phaseOrderById.set(p.id, p.order);

      const knockouts: KnockoutMatch[] = (matchesRes.data ?? [])
        .map((mm) => ({
          id: mm.id,
          phaseOrder: phaseOrderById.get(mm.phaseId) ?? 0,
          homeTeamId: mm.homeTeamId,
          awayTeamId: mm.awayTeamId,
          kickoffAt: mm.kickoffAt,
          bracketPosition: mm.bracketPosition ?? null,
          venue: (mm as { venue?: string | null }).venue ?? null,
        }))
        .filter((k) => k.phaseOrder >= 2 && k.phaseOrder <= 6);
      this.matches.set(knockouts);

      // Estado inicial de winners: leemos lo que esté en localStorage; si no
      // hay nada, lo derivamos del row guardado en DB (si existe).
      let winnersState = new Map<string, string>();
      const dbRow = (bracketRes.data ?? [])[0];
      if (dbRow) {
        this.serverId = dbRow.id;
        // Reconstruir aproximado: para cada match, si su ganador (según
        // octavos/cuartos/etc) está entre las dos selecciones, lo marcamos.
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

      // Sobreescribir con localStorage si existe (más fresco)
      const lsRaw = localStorage.getItem(STORAGE_KEY(this.currentUserId, m));
      if (lsRaw) {
        try {
          const parsed = JSON.parse(lsRaw) as Record<string, string>;
          winnersState = new Map(Object.entries(parsed));
        } catch { /* corrupt */ }
      }

      this.winners.set(winnersState);
    } finally {
      this.loading.set(false);
    }
  }

  pickWinner(matchId: string, teamSlug: string) {
    this.winners.update((prev) => {
      const next = new Map(prev);
      if (next.get(matchId) === teamSlug) {
        next.delete(matchId);   // click el mismo team de nuevo → des-elige
      } else {
        next.set(matchId, teamSlug);
      }
      return next;
    });
    this.persistLocal();
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

  formatDate(iso: string): string {
    try {
      return new Date(iso).toLocaleString('es-EC', {
        day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
      });
    } catch { return iso; }
  }

  async saveAll() {
    const m = this.mode();
    if (!m) return;
    this.saveError.set(null);
    this.saving.set(true);
    try {
      // Iteramos partidos ordenados por bracketPosition (mismo orden que la
      // UI). Para la fase 6 esto importa: el seed la llama "Final + 3er"
      // con 2 partidos — bracketPosition=1 es la Final y bracketPosition=2
      // el 3er puesto. El campeón es el ganador de la Final, no del 3ero.
      const winnersByPhase: Record<number, string[]> = { 2: [], 3: [], 4: [], 5: [], 6: [] };
      const sortedMatches = [...this.matches()].sort((a, b) => {
        if (a.phaseOrder !== b.phaseOrder) return a.phaseOrder - b.phaseOrder;
        const ap = a.bracketPosition ?? 999;
        const bp = b.bracketPosition ?? 999;
        return ap - bp;
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
        octavos:  winnersByPhase[2] ?? [],   // R32 winners → en octavos
        cuartos:  winnersByPhase[3] ?? [],   // R16 winners → en cuartos
        semis:    winnersByPhase[4] ?? [],   // QF winners → en semis
        final:    winnersByPhase[5] ?? [],   // SF winners → en final (los 2 finalistas)
        // bracketPosition=1 es la Final (orden 6), su ganador es el campeón.
        champion: (winnersByPhase[6] ?? [])[0] ?? '',
      };

      const res = await this.api.upsertBracketPick(payload);
      if (res?.errors && res.errors.length > 0) {
        // eslint-disable-next-line no-console
        console.error('[upsertBracketPick] errors:', res.errors);
        this.saveError.set(res.errors[0]!.message ?? 'No se pudo guardar el bracket');
        return;
      }
      if (res?.data?.id) this.serverId = res.data.id;
      this.lastSavedAt.set(new Date().toISOString());
      this.toast.success('Bracket guardado');
    } catch (e) {
      this.saveError.set(humanizeError(e));
    } finally {
      this.saving.set(false);
    }
  }
}
