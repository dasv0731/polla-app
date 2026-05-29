import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ApiService } from '../../core/api/api.service';
import { ToastService } from '../../core/notifications/toast.service';
import { humanizeError } from '../../core/notifications/domain-errors';
import { ConfirmDialogService } from '../../shared/ui/confirm-dialog.service';

const TOURNAMENT_ID = 'mundial-2026';
const DAY_MS = 86_400_000;

interface ActivityItem {
  kind: 'result' | 'group' | 'bounce';
  message: string;
  highlight: string;
  detail: string;
  timestamp: number;
}

@Component({
  standalone: true,
  selector: 'app-admin-dashboard',
  imports: [RouterLink],
  template: `
    <header class="admin-main__head">
      <div>
        <small>Admin · Mundial 2026</small>
        <h1>Dashboard</h1>
      </div>
      <p style="font-size: var(--fs-xs); color: var(--color-text-muted); text-transform: uppercase; letter-spacing: 0.08em; font-weight: var(--fw-bold);">
        Última actualización: {{ lastUpdatedLabel() }}
      </p>
    </header>

    @if (loading()) {
      <p>Cargando dashboard…</p>
    } @else {
      <!-- Scoring jobs (manual triggers per fase del torneo) -->
      <section style="background: var(--color-primary-white); border: var(--border-grey); border-radius: var(--radius-md); padding: var(--space-md); margin-bottom: var(--space-xl);">
        <h2 style="font-family: var(--font-display); font-size: var(--fs-lg); text-transform: uppercase; line-height: 1; margin-bottom: var(--space-sm);">
          Scoring del torneo
        </h2>
        <p class="form-card__hint" style="margin-bottom: var(--space-md);">
          Disparar después del cierre de cada fase. Idempotente — re-correr no
          duplica puntos. Aplica a las predicciones de TODOS los users
          (en SIMPLE y COMPLETE).
        </p>
        <div style="display: flex; gap: var(--space-md); flex-wrap: wrap;">
          <button class="btn btn--primary" type="button"
                  [disabled]="scoringGroupStage()"
                  (click)="runScoreGroupStage()">
            {{ scoringGroupStage() ? 'Ejecutando…' : 'Score grupos + 3eros' }}
          </button>
          <button class="btn btn--primary" type="button"
                  [disabled]="scoringBracket()"
                  (click)="runScoreBracket()">
            {{ scoringBracket() ? 'Ejecutando…' : 'Score bracket' }}
          </button>
        </div>
        @if (scoringMsg()) {
          <p class="form-card__hint" style="margin-top: var(--space-sm); color: var(--color-primary-green);">
            {{ scoringMsg() }}
          </p>
        }
      </section>

      <!-- Comodines: barridos manuales para fuentes LOYALTY y ENGAGEMENT.
           Trivia source es automática (al scorear cada match). -->
      <section style="background: var(--color-primary-white); border: var(--border-grey); border-radius: var(--radius-md); padding: var(--space-md); margin-bottom: var(--space-xl);">
        <h2 style="font-family: var(--font-display); font-size: var(--fs-lg); text-transform: uppercase; line-height: 1; margin-bottom: var(--space-sm);">
          Comodines · barridos
        </h2>
        <p class="form-card__hint" style="margin-bottom: var(--space-md);">
          Disparar al cumplirse cada ventana del reglamento §comodines.
          Otorga 1 comodín tipo PENDING_TYPE_CHOICE a cada user que califica
          (modo COMPLETE, sin haber recibido la fuente, dentro del techo de 5).
          Idempotente: re-correr no duplica.
        </p>
        <div style="display: flex; gap: var(--space-md); flex-wrap: wrap;">
          <button class="btn btn--primary" type="button"
                  [disabled]="sweepingLoyalty()"
                  (click)="runLoyaltySweep()">
            {{ sweepingLoyalty() ? 'Ejecutando…' : 'Sweep fidelidad temprana (T-7d)' }}
          </button>
          <button class="btn btn--primary" type="button"
                  [disabled]="sweepingEngagement()"
                  (click)="runEngagementSweep()">
            {{ sweepingEngagement() ? 'Ejecutando…' : 'Sweep engagement (final torneo)' }}
          </button>
          <button class="btn btn--ghost" type="button"
                  [disabled]="sweepingExpiry()"
                  (click)="runExpirySweep()">
            {{ sweepingExpiry() ? 'Ejecutando…' : 'Sweep caducidad + recordatorios' }}
          </button>
        </div>
        @if (sweepMsg()) {
          <p class="form-card__hint" style="margin-top: var(--space-sm); color: var(--color-primary-green);">
            {{ sweepMsg() }}
          </p>
        }
      </section>

      <section class="kpi-grid">
        <article class="kpi-card">
          <small>Users registrados</small>
          <div class="kpi-card__value">{{ formatNumber(totalUsers()) }}</div>
          @if (newUsersLast24h() > 0) {
            <span class="kpi-card__delta kpi-card__delta--up"><span aria-hidden="true">↑ </span>+{{ newUsersLast24h() }} últimas 24h</span>
          } @else {
            <span class="kpi-card__delta" style="color: var(--color-text-muted);">Sin altas en últimas 24h</span>
          }
        </article>

        <article class="kpi-card">
          <small>Picks totales</small>
          <div class="kpi-card__value">{{ formatNumber(totalPicks()) }}</div>
          @if (newPicksLast24h() > 0) {
            <span class="kpi-card__delta kpi-card__delta--up"><span aria-hidden="true">↑ </span>+{{ newPicksLast24h() }} últimas 24h</span>
          } @else {
            <span class="kpi-card__delta" style="color: var(--color-text-muted);">Sin movimiento últimas 24h</span>
          }
        </article>

        <article class="kpi-card kpi-card--warn">
          <small>Resultados pendientes</small>
          <div class="kpi-card__value">{{ pendingResults() }}</div>
          <span class="kpi-card__delta kpi-card__delta--down">
            {{ pendingResults() === 0 ? 'Todo al día' : (pendingResults() + ' partidos finalizados sin publicar') }}
          </span>
        </article>

        <a class="kpi-card kpi-card--danger kpi-card--link"
           routerLink="/admin/users"
           [queryParams]="{ status: 'bounced' }">
          <small>SES bounces</small>
          <div class="kpi-card__value">{{ totalBounces() }}</div>
          <span class="kpi-card__delta kpi-card__delta--down">
            {{ totalBounces() === 0 ? 'Sin bounces — todo OK' : 'Ver usuarios afectados →' }}
          </span>
        </a>
      </section>

      <h2 style="font-family: var(--font-display); font-size: var(--fs-xl); text-transform: uppercase; line-height: 1; margin-bottom: var(--space-md);">
        Acciones rápidas
      </h2>
      <div class="quick-actions">
        <a routerLink="/admin/results" class="quick-action">
          <span class="quick-action__icon" aria-hidden="true">⚽</span>
          <h3>Publicar resultado</h3>
          <p>
            {{ pendingResults() === 0
              ? 'Todos los partidos pasados ya tienen resultado.'
              : pendingResults() + ' partido' + (pendingResults() === 1 ? '' : 's') + ' sin resultado oficial. Dispara recalc de puntos.' }}
          </p>
        </a>
        <a routerLink="/admin/fixtures" class="quick-action">
          <span class="quick-action__icon" aria-hidden="true">📅</span>
          <h3>Editar fixture</h3>
          <p>Cambiar horario, sede o equipos. Aviso si afecta picks ya hechos.</p>
        </a>
        <a routerLink="/admin/special-results" class="quick-action">
          <span class="quick-action__icon" aria-hidden="true">🏆</span>
          <h3>Adjudicar specials</h3>
          <p>Disponible al cierre del torneo. Define campeón, subcampeón y revelación.</p>
        </a>
        <a routerLink="/admin/users" class="quick-action">
          <span class="quick-action__icon" aria-hidden="true">👥</span>
          <h3>Gestionar users</h3>
          <p>Buscar, reset password, marcar emails con bounce.</p>
        </a>
      </div>

      <!-- Setup del torneo · pre-kickoff checklist.
           Cada fila linkea a la pantalla donde se completa el paso. -->
      @if (!setupComplete()) {
        <section class="setup-checklist">
          <h2 class="setup-checklist__title">Setup del torneo</h2>
          <p class="setup-checklist__hint">
            Antes del primer kickoff verificá que estos pasos estén completos.
          </p>
          <ul class="setup-list">
            <li>
              <span class="setup-icon"
                    [class.is-ok]="setup().teamsOk"
                    aria-hidden="true">{{ setup().teamsOk ? '✓' : '○' }}</span>
              <a routerLink="/admin/teams">
                <strong>Equipos cargados</strong>
                <small>{{ setup().teamsCount }} / 48</small>
              </a>
            </li>
            <li>
              <span class="setup-icon"
                    [class.is-ok]="setup().groupsAssignedOk"
                    aria-hidden="true">{{ setup().groupsAssignedOk ? '✓' : '○' }}</span>
              <a routerLink="/admin/teams">
                <strong>Equipos en grupos</strong>
                <small>{{ setup().groupsAssignedCount }} / {{ setup().teamsCount || 48 }}</small>
              </a>
            </li>
            <li>
              <span class="setup-icon"
                    [class.is-ok]="setup().fixturesOk"
                    aria-hidden="true">{{ setup().fixturesOk ? '✓' : '○' }}</span>
              <a routerLink="/admin/fixtures">
                <strong>Fixtures fase de grupos</strong>
                <small>{{ setup().groupStageFixtures }} / 72</small>
              </a>
            </li>
            <li>
              <span class="setup-icon"
                    [class.is-ok]="setup().bracketOk"
                    aria-hidden="true">{{ setup().bracketOk ? '✓' : '○' }}</span>
              <a routerLink="/admin/bracket">
                <strong>Posiciones del bracket</strong>
                <small>{{ setup().bracketWithPositionCount }} / {{ setup().bracketTotalCount || '?' }}</small>
              </a>
            </li>
          </ul>
        </section>
      }

      @if (activity().length > 0) {
        <div class="activity">
          <h3>Actividad reciente</h3>
          <ul>
            @for (a of activity(); track a.timestamp + a.message) {
              <li>
                <span class="activity__dot"
                      [class.activity__dot--warn]="a.kind === 'group'"
                      [class.activity__dot--danger]="a.kind === 'bounce'"></span>
                <span>
                  {{ a.message }}
                  <strong>{{ a.highlight }}</strong>
                  @if (a.detail) { · {{ a.detail }} }
                </span>
                <span class="activity__time">{{ relativeTime(a.timestamp) }}</span>
              </li>
            }
          </ul>
        </div>
      }
    }
  `,
  styles: [`
    .setup-checklist {
      background: var(--color-primary-white);
      border: 1px solid var(--color-line);
      border-left: 3px solid var(--color-primary-green);
      border-radius: 12px;
      padding: 18px 20px;
      margin-bottom: var(--space-xl);
    }
    .setup-checklist__title {
      font-family: var(--font-display);
      font-size: var(--fs-lg);
      letter-spacing: 0.04em;
      text-transform: uppercase;
      line-height: 1;
      margin: 0 0 6px;
    }
    .setup-checklist__hint {
      margin: 0 0 14px;
      font-size: 13px;
      color: var(--color-text-muted);
    }
    .setup-list { list-style: none; padding: 0; margin: 0; display: grid; gap: 8px; }
    .setup-list li { display: flex; align-items: center; gap: 12px; }
    .setup-list a {
      flex: 1;
      display: flex;
      align-items: baseline;
      justify-content: space-between;
      gap: 8px;
      padding: 10px 12px;
      text-decoration: none;
      color: var(--color-primary-black);
      background: rgba(0,0,0,0.02);
      border-radius: 8px;
      transition: background 0.15s ease;
    }
    .setup-list a:hover { background: rgba(2, 204, 116, 0.08); }
    .setup-list a:focus-visible {
      outline: 2px solid var(--color-primary-green);
      outline-offset: 2px;
    }
    .setup-list strong { font-size: 14px; font-weight: 600; }
    .setup-list small { font-size: 12px; color: var(--color-text-muted); font-variant-numeric: tabular-nums; }
    .setup-icon {
      width: 26px; height: 26px;
      display: grid; place-items: center;
      border-radius: 50%;
      background: rgba(0,0,0,0.06);
      color: var(--color-text-muted);
      font-weight: 700;
      flex-shrink: 0;
    }
    .setup-icon.is-ok {
      background: rgba(2, 204, 116, 0.18);
      color: var(--color-primary-green);
    }
  `],
})
export class AdminDashboardComponent implements OnInit {
  private toast = inject(ToastService);
  private confirmDialog = inject(ConfirmDialogService);
  scoringGroupStage = signal(false);
  scoringBracket = signal(false);
  scoringMsg = signal<string | null>(null);

  sweepingLoyalty = signal(false);
  sweepingEngagement = signal(false);
  sweepingExpiry = signal(false);
  sweepMsg = signal<string | null>(null);

  async runLoyaltySweep() {
    const ok = await this.confirmDialog.ask({
      title: 'Sweep · comodín de fidelidad',
      message:
        'Otorga el comodín de fidelidad a los users que tienen TODAS sus predicciones llenas. ' +
        'Se recomienda correrlo a 7 días del kickoff del torneo.',
      confirmLabel: 'Ejecutar sweep',
    });
    if (!ok) return;
    this.sweepingLoyalty.set(true);
    this.sweepMsg.set(null);
    try {
      const res = await this.api.runLoyaltySweep(TOURNAMENT_ID);
      if (res?.errors && res.errors.length > 0) {
        this.toast.error(res.errors[0]?.message ?? 'Error en loyalty sweep');
        return;
      }
      const g = res?.data?.granted ?? 0;
      const s = res?.data?.skipped ?? 0;
      this.sweepMsg.set(`Loyalty: ${g} comodines otorgados · ${s} users skipeados (no califican o ya tienen).`);
      this.toast.success('Sweep fidelidad completado');
    } catch (e) {
      this.toast.error(humanizeError(e));
    } finally {
      this.sweepingLoyalty.set(false);
    }
  }

  async runEngagementSweep() {
    const ok = await this.confirmDialog.ask({
      title: 'Sweep · comodín de engagement',
      message:
        'Otorga el comodín de engagement a los users con ≥80% de marcadores predichos antes ' +
        'del kickoff. Se corre al cierre del torneo.',
      confirmLabel: 'Ejecutar sweep',
    });
    if (!ok) return;
    this.sweepingEngagement.set(true);
    this.sweepMsg.set(null);
    try {
      const res = await this.api.runEngagementSweep(TOURNAMENT_ID);
      if (res?.errors && res.errors.length > 0) {
        this.toast.error(res.errors[0]?.message ?? 'Error en engagement sweep');
        return;
      }
      const g = res?.data?.granted ?? 0;
      const s = res?.data?.skipped ?? 0;
      this.sweepMsg.set(`Engagement: ${g} comodines otorgados · ${s} users skipeados.`);
      this.toast.success('Sweep engagement completado');
    } catch (e) {
      this.toast.error(humanizeError(e));
    } finally {
      this.sweepingEngagement.set(false);
    }
  }

  async runExpirySweep() {
    const ok = await this.confirmDialog.ask({
      title: 'Sweep · caducidad de comodines',
      message:
        'Marca como EXPIRED los comodines no asignados que pasaron su ventana y emite los ' +
        'recordatorios 24 h antes. Idempotente — re-correr no duplica.',
      confirmLabel: 'Ejecutar sweep',
    });
    if (!ok) return;
    this.sweepingExpiry.set(true);
    this.sweepMsg.set(null);
    try {
      const res = await this.api.expireComodines(TOURNAMENT_ID);
      if (res?.errors && res.errors.length > 0) {
        this.toast.error(res.errors[0]?.message ?? 'Error en expiry sweep');
        return;
      }
      const exp = res?.data?.expired ?? 0;
      const rem = res?.data?.reminders ?? 0;
      this.sweepMsg.set(`Caducidad: ${exp} expirados · ${rem} recordatorios 24h emitidos.`);
      this.toast.success('Sweep caducidad completado');
    } catch (e) {
      this.toast.error(humanizeError(e));
    } finally {
      this.sweepingExpiry.set(false);
    }
  }

  async runScoreGroupStage() {
    const ok = await this.confirmDialog.ask({
      title: 'Scoring · fase de grupos',
      message:
        'Calcula el scoring de fase de grupos + mejores 3eros para TODOS los users. ' +
        'Idempotente — no duplica.',
      confirmLabel: 'Calcular scoring',
    });
    if (!ok) return;
    this.scoringGroupStage.set(true);
    this.scoringMsg.set(null);
    try {
      const res = await this.api.scoreGroupStage(TOURNAMENT_ID);
      if (res?.errors && res.errors.length > 0) {
        this.toast.error(res.errors[0]?.message ?? 'Error en scoreGroupStage');
        // eslint-disable-next-line no-console
        console.error('[scoreGroupStage] errors:', res.errors);
        return;
      }
      const standings = res?.data?.standingsScored ?? 0;
      const thirds = res?.data?.thirdsScored ?? 0;
      this.scoringMsg.set(`Standings: ${standings} picks · Best 3eros: ${thirds} picks`);
      this.toast.success('Scoring grupos completado');
    } catch (e) {
      this.toast.error(humanizeError(e));
    } finally {
      this.scoringGroupStage.set(false);
    }
  }

  async runScoreBracket() {
    const ok = await this.confirmDialog.ask({
      title: 'Scoring · bracket',
      message:
        'Calcula el scoring de bracket (octavos→campeón) para TODOS los users. Idempotente.',
      confirmLabel: 'Calcular scoring',
    });
    if (!ok) return;
    this.scoringBracket.set(true);
    this.scoringMsg.set(null);
    try {
      const res = await this.api.scoreBracket(TOURNAMENT_ID);
      if (res?.errors && res.errors.length > 0) {
        this.toast.error(res.errors[0]?.message ?? 'Error en scoreBracket');
        // eslint-disable-next-line no-console
        console.error('[scoreBracket] errors:', res.errors);
        return;
      }
      const scored = res?.data?.scored ?? 0;
      this.scoringMsg.set(`Bracket scoring: ${scored} picks`);
      this.toast.success('Scoring bracket completado');
    } catch (e) {
      this.toast.error(humanizeError(e));
    } finally {
      this.scoringBracket.set(false);
    }
  }

  private api = inject(ApiService);

  loading = signal(true);
  loadedAt = signal(Date.now());

  totalUsers = signal(0);
  newUsersLast24h = signal(0);
  totalPicks = signal(0);
  newPicksLast24h = signal(0);
  pendingResults = signal(0);
  totalBounces = signal(0);

  /** Pre-kickoff checklist. Cada flag indica si el paso está completo
   *  según el state actual de la DB. */
  setup = signal<{
    teamsCount: number;
    teamsOk: boolean;
    groupsAssignedCount: number;
    groupsAssignedOk: boolean;
    groupStageFixtures: number;
    fixturesOk: boolean;
    bracketTotalCount: number;
    bracketWithPositionCount: number;
    bracketOk: boolean;
  }>({
    teamsCount: 0, teamsOk: false,
    groupsAssignedCount: 0, groupsAssignedOk: false,
    groupStageFixtures: 0, fixturesOk: false,
    bracketTotalCount: 0, bracketWithPositionCount: 0, bracketOk: false,
  });
  setupComplete = computed(() => {
    const s = this.setup();
    return s.teamsOk && s.groupsAssignedOk && s.fixturesOk && s.bracketOk;
  });

  activity = signal<ActivityItem[]>([]);

  lastUpdatedLabel = computed(() => this.relativeTime(this.loadedAt()));

  async ngOnInit() {
    try {
      const cutoff = Date.now() - DAY_MS;
      const [usersRes, matchesRes, picksRes, groupsRes] = await Promise.all([
        this.api.listUsers(1000),
        this.api.listMatches(TOURNAMENT_ID),
        this.api.listAllPicks(TOURNAMENT_ID, 5000),
        this.api.listGroups(TOURNAMENT_ID, 500),
      ]);

      const users = usersRes.data ?? [];
      const matches = matchesRes.data ?? [];
      const picks = picksRes.data ?? [];
      const groups = groupsRes.data ?? [];

      this.totalUsers.set(users.length);
      this.newUsersLast24h.set(
        users.filter((u) => u.createdAt && Date.parse(u.createdAt) >= cutoff).length,
      );

      this.totalPicks.set(picks.length);
      this.newPicksLast24h.set(
        picks.filter((p) => p.createdAt && Date.parse(p.createdAt) >= cutoff).length,
      );

      const now = Date.now();
      this.pendingResults.set(
        matches.filter((m) =>
          (m.status !== 'FINAL' && Date.parse(m.kickoffAt) < now) ||
          (m.status === 'FINAL' && !m.pointsCalculated),
        ).length,
      );

      this.totalBounces.set(users.filter((u) => u.emailStatus === 'BOUNCED').length);

      // Build activity feed from heuristics: most recent FINAL matches, group creations,
      // and bounced users. Sorted desc by timestamp, top 6.
      const teamsRes = await this.api.listTeams(TOURNAMENT_ID);
      const teamsList = teamsRes.data ?? [];
      const teamName = new Map<string, string>(
        teamsList.map((t) => [t.slug, t.name]),
      );

      // Setup checklist derivado del state DB.
      // Mundial 2026: 48 equipos, 12 grupos × 6 partidos = 72 fixtures de
      // fase de grupos, + 32 partidos eliminatorios = bracket. El bracket
      // total se infiere del schema phases (los partidos con phase.order
      // >= 2 deberían tener bracketPosition). Para no cargar phases acá
      // (y mantener el ngOnInit ligero), usamos heurística: matches con
      // bracketPosition != null son knockout; el "expected" del bracket
      // se infiere del subset de matches que NO son de grupos.
      const teamsCount = teamsList.length;
      const groupsAssignedCount = teamsList.filter((t) => !!t.groupLetter).length;
      const matchesWithoutBracket = matches.filter((m) => m.bracketPosition == null);
      const matchesWithBracket = matches.filter((m) => m.bracketPosition != null);
      // Si hay phases, lo correcto sería filtrar por phase.order. Como
      // heurística sin cargar phases: contamos fixtures sin bracketPosition
      // como "fase de grupos" (los partidos del knockout siempre deben
      // tener bracketPosition seteado).
      const groupStageFixtures = matchesWithoutBracket.length;
      const bracketWithPositionCount = matchesWithBracket.length;
      // Total esperado del bracket: total de matches - 72 de fase de grupos,
      // o si todavía no hay 72, asumimos 32 (R32 → F en Mundial 2026).
      const bracketTotalCount = Math.max(matches.length - 72, 32);

      this.setup.set({
        teamsCount,
        teamsOk: teamsCount >= 48,
        groupsAssignedCount,
        groupsAssignedOk: teamsCount > 0 && groupsAssignedCount === teamsCount,
        groupStageFixtures,
        fixturesOk: groupStageFixtures >= 72,
        bracketTotalCount,
        bracketWithPositionCount,
        bracketOk: bracketWithPositionCount >= 32,
      });

      const items: ActivityItem[] = [];
      for (const m of matches) {
        if (m.status === 'FINAL' && m.homeScore != null && m.awayScore != null) {
          items.push({
            kind: 'result',
            message: 'Resultado publicado',
            highlight: `${teamName.get(m.homeTeamId) ?? m.homeTeamId} ${m.homeScore}-${m.awayScore} ${teamName.get(m.awayTeamId) ?? m.awayTeamId}`,
            detail: m.pointsCalculated ? 'puntos recalculados' : 'pendiente de scoring',
            timestamp: Date.parse(m.kickoffAt),
          });
        }
      }
      for (const g of groups) {
        items.push({
          kind: 'group',
          message: 'Nuevo grupo creado',
          highlight: `"${g.name}"`,
          detail: '',
          timestamp: g.createdAt ? Date.parse(g.createdAt) : 0,
        });
      }
      for (const u of users) {
        if (u.emailStatus === 'BOUNCED') {
          items.push({
            kind: 'bounce',
            message: 'SES bounce notification:',
            highlight: u.email,
            detail: 'marcado como BOUNCED',
            timestamp: u.createdAt ? Date.parse(u.createdAt) : 0,
          });
        }
      }

      items.sort((a, b) => b.timestamp - a.timestamp);
      this.activity.set(items.slice(0, 6));
    } finally {
      this.loading.set(false);
      this.loadedAt.set(Date.now());
    }
  }

  formatNumber(n: number): string {
    return n.toLocaleString('es-EC');
  }

  relativeTime(ts: number): string {
    const diff = Date.now() - ts;
    if (diff < 60_000) return `hace ${Math.max(1, Math.floor(diff / 1000))} s`;
    if (diff < 3_600_000) return `hace ${Math.floor(diff / 60_000)} min`;
    if (diff < 86_400_000) return `hace ${Math.floor(diff / 3_600_000)} h`;
    const days = Math.floor(diff / 86_400_000);
    return `hace ${days} día${days === 1 ? '' : 's'}`;
  }
}
