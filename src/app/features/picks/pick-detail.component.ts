import { Component, Input, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ApiService } from '../../core/api/api.service';
import { AuthService } from '../../core/auth/auth.service';
import { TimeService } from '../../core/time/time.service';
import { ToastService } from '../../core/notifications/toast.service';
import { apiClient } from '../../core/api/client';
import { TeamFlagComponent } from '../../shared/ui/team-flag.component';
import { PicksSyncService } from '../../core/sync/picks-sync.service';

/** Mismo payload que en picks-list — touched flags por lado para que
 *  un edit de un solo input no contamine visualmente el otro. */
interface PickPayload extends Record<string, unknown> {
  home: number;
  away: number;
  homeTouched: boolean;
  awayTouched: boolean;
}

interface MatchData {
  id: string;
  tournamentId: string;
  phaseId: string;
  homeTeamId: string;
  awayTeamId: string;
  kickoffAt: string;
  status: string;
  homeScore?: number | null;
  awayScore?: number | null;
}

interface PickData {
  homeScorePred: number;
  awayScorePred: number;
  pointsEarned?: number | null;
  exactScore?: boolean | null;
  correctResult?: boolean | null;
}

interface TeamInfo { name: string; flagCode: string; crestUrl: string | null; }
interface PhaseInfo { name: string; multiplier: number; }
interface AggregateStats { exactPct: number; resultPct: number; total: number; }

@Component({
  standalone: true,
  selector: 'app-pick-detail',
  imports: [RouterLink, TeamFlagComponent],
  template: `
    @let m = match();
    @let p = pick();

    @if (loading()) {
      <p style="padding: var(--space-2xl); text-align: center;">Cargando partido…</p>
    } @else if (m !== null) {
      <!-- HERO -->
      <section class="mh">
        <div class="mh__content">
          @if (isFinal()) {
            <div class="mh__top">
              <span class="mh__ft">FT · Final</span>
              <span class="mh__competition">Mundial 2026 · {{ phaseName() ?? '—' }}</span>
            </div>

            <div class="mh__teams">
              <div class="mh__side" [class.mh__side--winner]="(m.homeScore ?? 0) > (m.awayScore ?? 0)">
                <app-team-flag [flagCode]="teamFlag(m.homeTeamId)" [crestUrl]="teamCrest(m.homeTeamId)" [name]="teamName(m.homeTeamId)" [size]="80" />
                <strong>{{ teamName(m.homeTeamId) }}</strong>
                <small>{{ resultLabel('home') }}</small>
              </div>
              <div class="mh__vs">
                <div class="mh__score">{{ m.homeScore }} — {{ m.awayScore }}</div>
              </div>
              <div class="mh__side" [class.mh__side--winner]="(m.awayScore ?? 0) > (m.homeScore ?? 0)">
                <app-team-flag [flagCode]="teamFlag(m.awayTeamId)" [crestUrl]="teamCrest(m.awayTeamId)" [name]="teamName(m.awayTeamId)" [size]="80" />
                <strong>{{ teamName(m.awayTeamId) }}</strong>
                <small>{{ resultLabel('away') }}</small>
              </div>
            </div>
          } @else {
            <p class="mh__competition">Mundial 2026 · {{ phaseName() ?? 'Por definir' }}</p>
            <div class="mh__teams">
              <div class="mh__side">
                <app-team-flag [flagCode]="teamFlag(m.homeTeamId)" [crestUrl]="teamCrest(m.homeTeamId)" [name]="teamName(m.homeTeamId)" [size]="80" />
                <strong>{{ teamName(m.homeTeamId) }}</strong>
              </div>
              <div class="mh__vs">
                <span class="mh__status">{{ statusLabel() }}</span>
                <div class="mh__time">
                  {{ kickoffTime() }}
                  <small>{{ kickoffDay() }}</small>
                </div>

                <!-- Pick inline en el banner. Auto-save con debounce.
                     Si el partido está past (kickoff alcanzado), readonly. -->
                <div class="mh__pick">
                  <span class="mh__pick-label">Tu pick</span>
                  <div class="mh__pick-inputs">
                    <input type="text" inputmode="numeric" maxlength="1"
                           class="mh__pick-input"
                           [value]="home() ?? ''"
                           [disabled]="isPast()"
                           [attr.aria-label]="'Goles ' + teamName(m.homeTeamId)"
                           (input)="onBannerInput('home', $event)">
                    <span class="mh__pick-sep">—</span>
                    <input type="text" inputmode="numeric" maxlength="1"
                           class="mh__pick-input"
                           [value]="away() ?? ''"
                           [disabled]="isPast()"
                           [attr.aria-label]="'Goles ' + teamName(m.awayTeamId)"
                           (input)="onBannerInput('away', $event)">
                  </div>
                  @if (isPast()) {
                    <span class="mh__pick-state mh__pick-state--locked">Cerrado · kickoff alcanzado</span>
                  } @else if (saving()) {
                    <span class="mh__pick-state">Guardando…</span>
                  } @else if (pick()) {
                    <span class="mh__pick-state mh__pick-state--ok">✓ Guardado</span>
                  } @else {
                    <span class="mh__pick-state mh__pick-state--muted">Sin pick · escribí un marcador</span>
                  }
                </div>
              </div>
              <div class="mh__side">
                <app-team-flag [flagCode]="teamFlag(m.awayTeamId)" [crestUrl]="teamCrest(m.awayTeamId)" [name]="teamName(m.awayTeamId)" [size]="80" />
                <strong>{{ teamName(m.awayTeamId) }}</strong>
              </div>
            </div>

            @if (!isPast()) {
              <div class="countdown" style="max-width: 480px; margin-inline: auto;">
                <div class="countdown__cell"><span class="countdown__value">{{ days() }}</span><span class="countdown__label">Días</span></div>
                <div class="countdown__cell"><span class="countdown__value">{{ hours() }}</span><span class="countdown__label">Horas</span></div>
                <div class="countdown__cell"><span class="countdown__value">{{ mins() }}</span><span class="countdown__label">Min</span></div>
                <div class="countdown__cell"><span class="countdown__value">{{ secs() }}</span><span class="countdown__label">Seg</span></div>
              </div>
            }
          }
        </div>
      </section>

      <div class="container">
        <nav class="breadcrumb">
          <a routerLink="/picks">Mis picks</a>
          <span class="breadcrumb__sep">/</span>
          <span aria-current="page">{{ teamName(m.homeTeamId) }} {{ isFinal() ? m.homeScore + '-' + m.awayScore : 'vs' }} {{ teamName(m.awayTeamId) }}</span>
        </nav>

        @if (isFinal()) {
          <!-- PICK VS RESULT -->
          <section>
            <div class="pick-vs-result">
              <div class="pick-vs-result__head">
                <p class="pick-vs-result__verdict"
                   [class.pick-vs-result__verdict--miss]="verdictKind() === 'miss'"
                   [class.pick-vs-result__verdict--none]="verdictKind() === 'none'">
                  {{ verdictText() }}
                </p>
                <p class="pick-vs-result__sub">{{ verdictSub() }}</p>
                <div class="pick-vs-result__pts">
                  +{{ p?.pointsEarned ?? 0 }}<small>Puntos ganados</small>
                </div>
              </div>

              <div class="pick-vs-result__cells">
                <div class="pvr-cell">
                  <small>Tu pick</small>
                  @if (p) {
                    <strong>{{ p.homeScorePred }} — {{ p.awayScorePred }}</strong>
                  } @else {
                    <strong>—</strong>
                  }
                </div>
                <div class="pvr-cell pvr-cell--match">
                  <small>Resultado real</small>
                  <strong>{{ m.homeScore }} — {{ m.awayScore }}</strong>
                </div>
              </div>

              @if (p) {
                <div class="breakdown">
                  <h3>Cómo se calculan tus puntos</h3>
                  <div class="breakdown-row">
                    <span class="breakdown-row__label">Resultado correcto (1·X·2)</span>
                    <span class="breakdown-row__check"
                          [class.breakdown-row__check--ok]="p.correctResult"
                          [class.breakdown-row__check--ko]="!p.correctResult">
                      {{ p.correctResult ? '✓' : '✗' }}
                    </span>
                    <span class="breakdown-row__pts">{{ p.correctResult ? '+3 pts' : '+0 pts' }}</span>
                  </div>
                  <div class="breakdown-row">
                    <span class="breakdown-row__label">Marcador exacto</span>
                    <span class="breakdown-row__check"
                          [class.breakdown-row__check--ok]="p.exactScore"
                          [class.breakdown-row__check--ko]="!p.exactScore">
                      {{ p.exactScore ? '✓' : '✗' }}
                    </span>
                    <span class="breakdown-row__pts">{{ p.exactScore ? '+2 pts' : '+0 pts' }}</span>
                  </div>
                  <div class="breakdown-row">
                    <span class="breakdown-row__label">Multiplicador ({{ phaseName() ?? '—' }})</span>
                    <span></span>
                    <span class="breakdown-row__pts">x{{ phaseMultiplier() ?? 1 }}</span>
                  </div>
                  <div class="breakdown-total">
                    <span>Total</span>
                    <span style="color: var(--color-primary-green);">+{{ p.pointsEarned ?? 0 }} pts</span>
                  </div>
                </div>
              }
            </div>
          </section>

          @if (stats(); as s) {
            <section style="margin: var(--space-2xl) 0;">
              <header class="section-heading" style="margin-bottom: var(--space-md);">
                <div class="section-heading__text">
                  <p class="kicker">Polla en vivo</p>
                  <h2 class="h2">Cómo le fue al resto</h2>
                </div>
              </header>
              <div class="pick-aggregate">
                <h3 class="pick-aggregate__title">{{ s.total }} picks recibidos</h3>
                <div class="pick-aggregate__row">
                  <div class="pick-aggregate__label">
                    <span>Acertaron resultado</span>
                    <span class="pick-aggregate__pct">{{ s.resultPct }}%</span>
                  </div>
                  <div class="pick-aggregate__bar">
                    <div class="pick-aggregate__fill" [style.width.%]="s.resultPct"></div>
                  </div>
                </div>
                <div class="pick-aggregate__row">
                  <div class="pick-aggregate__label">
                    <span>Acertaron marcador exacto</span>
                    <span class="pick-aggregate__pct">{{ s.exactPct }}%</span>
                  </div>
                  <div class="pick-aggregate__bar">
                    <div class="pick-aggregate__fill" [style.width.%]="s.exactPct"></div>
                  </div>
                </div>
              </div>
            </section>
          }
        } @else {
          <!-- DATOS DEL PARTIDO (el pick form duplicado se removió;
               el banner del hero ya tiene los inputs de marcador) -->
          <section>
            <header class="section-heading" style="margin-bottom: var(--space-md);">
              <div class="section-heading__text">
                <p class="kicker">Datos del partido</p>
                <h2 class="h2">Sobre {{ teamName(m.homeTeamId) }} vs {{ teamName(m.awayTeamId) }}</h2>
              </div>
            </header>
            <div class="match-info">
              <div class="match-info__item"><small>Fase</small><strong>{{ phaseName() ?? '—' }}</strong></div>
              <div class="match-info__item"><small>Multiplicador</small><strong>x{{ phaseMultiplier() ?? 1 }} · max {{ (phaseMultiplier() ?? 1) * 5 }} pts</strong></div>
              <div class="match-info__item"><small>Kickoff</small><strong>{{ time.formatKickoff(m.kickoffAt) }}</strong></div>
              <div class="match-info__item"><small>Estadio</small><strong>Por confirmar</strong></div>
              <div class="match-info__item"><small>Sede</small><strong>—</strong></div>
              <div class="match-info__item"><small>Árbitro</small><strong>Por confirmar</strong></div>
            </div>
          </section>
        }

        <!-- CTA Volver a mis picks (al final, ambos modos) -->
        <div class="back-cta">
          <a routerLink="/picks" class="btn-wf btn-wf--primary">‹ Volver a mis picks</a>
        </div>
      </div>
    } @else {
      <p style="padding: var(--space-2xl); text-align: center;">Partido no encontrado.</p>
    }
  `,
  styles: [`
    .back-cta {
      display: flex;
      justify-content: center;
      margin: var(--space-2xl) 0 var(--space-xl);
    }
    .back-cta .btn-wf { min-width: 220px; justify-content: center; }

    .mh__pick {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 6px;
      margin-top: 12px;
      padding-top: 12px;
      border-top: 1px solid rgba(255, 255, 255, 0.18);
    }
    .mh__pick-label {
      font-size: 11px;
      letter-spacing: .08em;
      text-transform: uppercase;
      opacity: 0.85;
    }
    .mh__pick-inputs {
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .mh__pick-input {
      width: 50px;
      height: 54px;
      padding: 0;
      border-radius: 8px;
      border: 2px solid rgba(255, 255, 255, 0.3);
      background: rgba(255, 255, 255, 0.1);
      color: white;
      font-family: var(--wf-display);
      font-size: 28px;
      text-align: center;
      -moz-appearance: textfield;
    }
    .mh__pick-input::-webkit-outer-spin-button,
    .mh__pick-input::-webkit-inner-spin-button {
      -webkit-appearance: none;
      margin: 0;
    }
    .mh__pick-input:focus {
      outline: none;
      border-color: white;
      background: rgba(255, 255, 255, 0.2);
    }
    .mh__pick-input:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
    .mh__pick-sep {
      font-family: var(--wf-display);
      font-size: 24px;
      opacity: 0.7;
    }
    .mh__pick-state {
      font-size: 11px;
      font-weight: 600;
      letter-spacing: .04em;
    }
    .mh__pick-state--ok     { color: #9eff9e; }
    .mh__pick-state--muted  { opacity: 0.7; }
    .mh__pick-state--locked { color: #ffb3b3; }
  `],
})
export class PickDetailComponent implements OnInit, OnDestroy {
  @Input() id!: string;

  private api = inject(ApiService);
  private auth = inject(AuthService);
  time = inject(TimeService);
  private toast = inject(ToastService);
  sync = inject(PicksSyncService);

  match = signal<MatchData | null>(null);
  pick = signal<PickData | null>(null);
  stats = signal<AggregateStats | null>(null);
  loading = signal(true);
  saving = signal(false);
  savedAt = signal<string | null>(null);

  home = signal<number | null>(null);
  away = signal<number | null>(null);

  private teams = signal<Map<string, TeamInfo>>(new Map());
  private phase = signal<PhaseInfo | null>(null);

  // Live tick for the countdown + lock state
  private now = signal(Date.now());
  private timer: ReturnType<typeof setInterval> | undefined;

  isFinal = computed(() => {
    const m = this.match();
    return m?.status === 'FINAL' && m.homeScore != null && m.awayScore != null;
  });
  isPast = computed(() => {
    const m = this.match();
    return m ? this.now() >= Date.parse(m.kickoffAt) : false;
  });

  canSave = computed(() => this.home() !== null && this.away() !== null);

  // Countdown components
  private msUntil = computed(() => {
    const m = this.match();
    return m ? Math.max(0, Date.parse(m.kickoffAt) - this.now()) : 0;
  });
  days = computed(() => pad(Math.floor(this.msUntil() / 86_400_000)));
  hours = computed(() => pad(Math.floor((this.msUntil() % 86_400_000) / 3_600_000)));
  mins = computed(() => pad(Math.floor((this.msUntil() % 3_600_000) / 60_000)));
  secs = computed(() => pad(Math.floor((this.msUntil() % 60_000) / 1000)));

  statusLabel = computed(() => {
    if (this.isPast()) return 'Cerrado';
    const ms = this.msUntil();
    if (ms < 24 * 3600_000) return 'Cierra hoy';
    if (ms < 48 * 3600_000) return 'Cierra mañana';
    return 'Programado';
  });

  kickoffTime = computed(() => {
    const m = this.match();
    if (!m) return '';
    return new Date(m.kickoffAt).toLocaleTimeString('es-EC', {
      timeZone: 'America/Guayaquil',
      hour: '2-digit', minute: '2-digit', hour12: false,
    });
  });
  kickoffDay = computed(() => {
    const m = this.match();
    if (!m) return '';
    return new Date(m.kickoffAt).toLocaleDateString('es-EC', {
      timeZone: 'America/Guayaquil',
      weekday: 'short', day: '2-digit', month: 'short',
    });
  });

  verdictKind = computed<'exact' | 'result' | 'miss' | 'none'>(() => {
    const p = this.pick();
    if (!p) return 'none';
    if (p.exactScore) return 'exact';
    if (p.correctResult) return 'result';
    return 'miss';
  });
  verdictText = computed(() => {
    switch (this.verdictKind()) {
      case 'exact': return '¡Marcador exacto!';
      case 'result': return 'Resultado correcto';
      case 'miss': return 'No acertaste';
      case 'none': return 'Sin pick';
    }
  });
  verdictSub = computed(() => {
    const mult = this.phaseMultiplier() ?? 1;
    const phase = this.phaseName() ?? 'la fase';
    switch (this.verdictKind()) {
      case 'exact': return `Acertaste el resultado y el marcador exacto. Multiplicador de ${phase} x${mult}.`;
      case 'result': return `Acertaste el ganador, no el marcador. Multiplicador x${mult}.`;
      case 'miss': return 'El resultado fue distinto al que predijiste.';
      case 'none': return 'No registraste pick antes del kickoff.';
    }
  });

  phaseName = computed(() => this.phase()?.name);
  phaseMultiplier = computed(() => this.phase()?.multiplier);

  teamName(slug: string): string { return this.teams().get(slug)?.name ?? slug; }
  teamFlag(slug: string): string { return this.teams().get(slug)?.flagCode ?? ''; }
  teamCrest(slug: string): string | null { return this.teams().get(slug)?.crestUrl ?? null; }
  flagClass(slug: string): string {
    const code = this.teams().get(slug)?.flagCode;
    return code ? `flag--${code.toLowerCase()}` : 'flag';
  }

  resultLabel(side: 'home' | 'away'): string {
    const m = this.match();
    if (!m || m.homeScore == null || m.awayScore == null) return '';
    if (m.homeScore === m.awayScore) return 'Empate';
    if (side === 'home') return m.homeScore > m.awayScore ? 'Victoria' : 'Derrota';
    return m.awayScore > m.homeScore ? 'Victoria' : 'Derrota';
  }

  ngOnInit() {
    this.timer = setInterval(() => this.now.set(Date.now()), 1000);
    void this.load();
  }
  ngOnDestroy() { if (this.timer) clearInterval(this.timer); }

  inc(side: 'home' | 'away') {
    const sig = side === 'home' ? this.home : this.away;
    const v = sig() ?? 0;
    if (v < 20) sig.set(v + 1);
  }
  dec(side: 'home' | 'away') {
    const sig = side === 'home' ? this.home : this.away;
    const v = sig() ?? 0;
    if (v > 0) sig.set(v - 1);
  }

  /** Input handler del picker en el banner. Encola al sync service
   *  con tracking de touched flags por lado. El sync hace debounce
   *  global 1500ms + retry. UI optimista al instante. */
  onBannerInput(side: 'home' | 'away', event: Event) {
    if (this.isPast()) return;
    const input = event.target as HTMLInputElement;
    const raw = input.value.replace(/[^0-9]/g, '').slice(-1);
    const v = raw === '' ? 0 : Math.max(0, Math.min(9, parseInt(raw, 10)));
    if (raw !== input.value) input.value = raw;
    const sig = side === 'home' ? this.home : this.away;
    sig.set(v);

    // Estado actual incluyendo touched flags previos (sync) o flags
    // implícitos true si la pick venía de DB.
    const cur = this.currentPickPayload();
    const next: PickPayload = {
      home: side === 'home' ? v : cur.home,
      away: side === 'away' ? v : cur.away,
      homeTouched: side === 'home' ? true : cur.homeTouched,
      awayTouched: side === 'away' ? true : cur.awayTouched,
    };
    this.sync.enqueue('pick', this.id, next);
  }

  private currentPickPayload(): PickPayload {
    const pending = this.sync.getPending<PickPayload>('pick', this.id);
    if (pending) return pending;
    const p = this.pick();
    return {
      home: p?.homeScorePred ?? 0,
      away: p?.awayScorePred ?? 0,
      homeTouched: !!p,
      awayTouched: !!p,
    };
  }

  private async load() {
    try {
      const m = await this.api.getMatch(this.id);
      const matchItem = m.data ? {
        id: m.data.id,
        tournamentId: m.data.tournamentId,
        phaseId: m.data.phaseId,
        homeTeamId: m.data.homeTeamId,
        awayTeamId: m.data.awayTeamId,
        kickoffAt: m.data.kickoffAt,
        status: m.data.status ?? 'SCHEDULED',
        homeScore: m.data.homeScore,
        awayScore: m.data.awayScore,
      } : null;
      this.match.set(matchItem);
      if (!matchItem) return;

      // Teams + phase
      const [teamsRes, phasesRes] = await Promise.all([
        this.api.listTeams(matchItem.tournamentId),
        this.api.listPhases(matchItem.tournamentId),
      ]);
      const tm = new Map<string, TeamInfo>();
      for (const t of teamsRes.data ?? []) {
        tm.set(t.slug, { name: t.name, flagCode: t.flagCode, crestUrl: t.crestUrl ?? null });
      }
      this.teams.set(tm);

      const phase = (phasesRes.data ?? []).find((p) => p.id === matchItem.phaseId);
      if (phase) this.phase.set({ name: phase.name, multiplier: phase.multiplier });

      // My pick — primero leemos del sync (pending/synced en localStorage)
      // y caemos a la API si no hay nada local. Esto cubre el caso típico:
      // user editó el pick en /picks → 1.5s después navega a /picks/match/X
      // antes de que el sync flushee → API aún no tiene el valor → sin esta
      // capa el banner del hero saldría vacío.
      const userId = this.auth.user()?.sub;
      const pending = this.sync.getPending<PickPayload>('pick', this.id);
      if (pending && (pending.homeTouched || pending.awayTouched)) {
        const pickData: PickData = {
          homeScorePred: pending.home,
          awayScorePred: pending.away,
          pointsEarned: null, exactScore: null, correctResult: null,
        };
        this.pick.set(pickData);
        if (pending.homeTouched) this.home.set(pending.home);
        if (pending.awayTouched) this.away.set(pending.away);
      }
      if (userId) {
        const myPicks = await this.api.myPicks(userId);
        const found = (myPicks.data ?? []).find((p) => p.matchId === this.id);
        if (found && !pending) {
          const pickData: PickData = {
            homeScorePred: found.homeScorePred,
            awayScorePred: found.awayScorePred,
            pointsEarned: found.pointsEarned,
            exactScore: found.exactScore,
            correctResult: found.correctResult,
          };
          this.pick.set(pickData);
          this.home.set(pickData.homeScorePred);
          this.away.set(pickData.awayScorePred);
        } else if (found && this.pick()) {
          // Sync tenía valor pero el server tiene metadata adicional (pointsEarned, etc).
          this.pick.update((cur) => cur ? {
            ...cur,
            pointsEarned: found.pointsEarned ?? cur.pointsEarned,
            exactScore: found.exactScore ?? cur.exactScore,
            correctResult: found.correctResult ?? cur.correctResult,
          } : null);
        }
      }

      // Aggregate (only if final)
      if (this.isFinal()) {
        const matchPicks = await apiClient.models.Pick.list({
          filter: { matchId: { eq: this.id } },
        });
        const items = matchPicks.data ?? [];
        if (items.length > 0) {
          const exact = items.filter((p) => p.exactScore === true).length;
          const result = items.filter((p) => p.correctResult === true).length;
          this.stats.set({
            exactPct: Math.round((exact / items.length) * 100),
            resultPct: Math.round((result / items.length) * 100),
            total: items.length,
          });
        }
      }
    } finally {
      this.loading.set(false);
    }
  }

  /** Botón explícito "Guardar" — encola al sync (mismo path que el
   *  banner inline) y dispara syncNow para flush inmediato. */
  save() {
    const h = this.home();
    const a = this.away();
    if (h === null || a === null) {
      this.toast.error('Ingresa ambos marcadores');
      return;
    }
    this.sync.enqueue('pick', this.id, {
      home: h, away: a, homeTouched: true, awayTouched: true,
    });
    this.savedAt.set(`Guardado a las ${new Date().toLocaleTimeString('es-EC', { hour: '2-digit', minute: '2-digit' })}`);
    this.pick.set({
      homeScorePred: h, awayScorePred: a,
      pointsEarned: null, exactScore: null, correctResult: null,
    });
    this.toast.success('Pick guardado');
    this.sync.syncNow();
  }
}

function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}
