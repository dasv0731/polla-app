import { Component, Input, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ApiService } from '../../core/api/api.service';
import { AuthService } from '../../core/auth/auth.service';
import { TimeService } from '../../core/time/time.service';
import { ToastService } from '../../core/notifications/toast.service';
import { humanizeError } from '../../core/notifications/domain-errors';
import { apiClient } from '../../core/api/client';

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

interface TeamInfo { name: string; flagCode: string; }
interface PhaseInfo { name: string; multiplier: number; }
interface AggregateStats { exactPct: number; resultPct: number; total: number; }

@Component({
  standalone: true,
  selector: 'app-pick-detail',
  imports: [RouterLink],
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
                <span class="flag" [class]="flagClass(m.homeTeamId)"></span>
                <strong>{{ teamName(m.homeTeamId) }}</strong>
                <small>{{ resultLabel('home') }}</small>
              </div>
              <div class="mh__vs">
                <div class="mh__score">{{ m.homeScore }} — {{ m.awayScore }}</div>
              </div>
              <div class="mh__side" [class.mh__side--winner]="(m.awayScore ?? 0) > (m.homeScore ?? 0)">
                <span class="flag" [class]="flagClass(m.awayTeamId)"></span>
                <strong>{{ teamName(m.awayTeamId) }}</strong>
                <small>{{ resultLabel('away') }}</small>
              </div>
            </div>
          } @else {
            <p class="mh__competition">Mundial 2026 · {{ phaseName() ?? 'Por definir' }}</p>
            <div class="mh__teams">
              <div class="mh__side">
                <span class="flag" [class]="flagClass(m.homeTeamId)"></span>
                <strong>{{ teamName(m.homeTeamId) }}</strong>
              </div>
              <div class="mh__vs">
                <span class="mh__status">{{ statusLabel() }}</span>
                <div class="mh__time">
                  {{ kickoffTime() }}
                  <small>{{ kickoffDay() }}</small>
                </div>
              </div>
              <div class="mh__side">
                <span class="flag" [class]="flagClass(m.awayTeamId)"></span>
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
          <!-- PICK FORM PROMINENT -->
          <section>
            <form class="pick-form" (ngSubmit)="save()">
              <h2>Tu pick</h2>
              <p class="pick-form__lead">
                Predice el marcador <strong>al final del tiempo reglamentario</strong>.
                Editable hasta el kickoff.
              </p>

              <div class="pick-form__teams">
                <div class="pick-form__team">
                  <span class="flag" [class]="flagClass(m.homeTeamId)"></span>
                  <strong>{{ teamName(m.homeTeamId) }}</strong>
                </div>
                <span class="pick-form__divider">VS</span>
                <div class="pick-form__team">
                  <span class="flag" [class]="flagClass(m.awayTeamId)"></span>
                  <strong>{{ teamName(m.awayTeamId) }}</strong>
                </div>
              </div>

              <div class="pick-form__inputs">
                <div class="score-input">
                  <div class="score-input__field">
                    <div class="score-input__stepper">
                      <button class="score-input__btn" type="button"
                              [disabled]="(home() ?? 0) <= 0 || isPast()"
                              (click)="dec('home')">−</button>
                      <input class="score-input__value" type="text" [value]="home() ?? '—'" readonly>
                      <button class="score-input__btn" type="button"
                              [disabled]="(home() ?? 0) >= 20 || isPast()"
                              (click)="inc('home')">+</button>
                    </div>
                    <span class="score-input__label">{{ teamName(m.homeTeamId) }}</span>
                  </div>
                </div>
                <span class="score-input__sep">—</span>
                <div class="score-input">
                  <div class="score-input__field">
                    <div class="score-input__stepper">
                      <button class="score-input__btn" type="button"
                              [disabled]="(away() ?? 0) <= 0 || isPast()"
                              (click)="dec('away')">−</button>
                      <input class="score-input__value" type="text" [value]="away() ?? '—'" readonly>
                      <button class="score-input__btn" type="button"
                              [disabled]="(away() ?? 0) >= 20 || isPast()"
                              (click)="inc('away')">+</button>
                    </div>
                    <span class="score-input__label">{{ teamName(m.awayTeamId) }}</span>
                  </div>
                </div>
              </div>

              <div class="pick-form__actions">
                <button type="submit" class="btn btn--primary btn--lg"
                        [disabled]="saving() || !canSave() || isPast()">
                  {{ saving() ? 'Guardando…' : (p ? 'Actualizar pick' : 'Guardar pick') }}
                </button>
                <a routerLink="/picks" class="btn btn--ghost">Volver al listado</a>
              </div>
              @if (savedAt()) {
                <p class="pick-form__hint">{{ savedAt() }}</p>
              } @else if (isPast()) {
                <p class="pick-form__hint" style="color: var(--color-lost);">
                  Ventana cerrada — el partido ya empezó.
                </p>
              } @else {
                <p class="pick-form__hint">Auto-guarda cada vez que confirmas el marcador.</p>
              }
            </form>
          </section>

          <!-- DATOS DEL PARTIDO -->
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
      </div>
    } @else {
      <p style="padding: var(--space-2xl); text-align: center;">Partido no encontrado.</p>
    }
  `,
})
export class PickDetailComponent implements OnInit, OnDestroy {
  @Input() id!: string;

  private api = inject(ApiService);
  private auth = inject(AuthService);
  time = inject(TimeService);
  private toast = inject(ToastService);

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
        tm.set(t.slug, { name: t.name, flagCode: t.flagCode });
      }
      this.teams.set(tm);

      const phase = (phasesRes.data ?? []).find((p) => p.id === matchItem.phaseId);
      if (phase) this.phase.set({ name: phase.name, multiplier: phase.multiplier });

      // My pick
      const userId = this.auth.user()?.sub;
      if (userId) {
        const myPicks = await this.api.myPicks(userId);
        const found = (myPicks.data ?? []).find((p) => p.matchId === this.id);
        if (found) {
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

  async save() {
    const h = this.home();
    const a = this.away();
    if (h === null || a === null) {
      this.toast.error('Ingresa ambos marcadores');
      return;
    }
    this.saving.set(true);
    try {
      await this.api.upsertPick(this.id, h, a);
      this.savedAt.set(`Guardado a las ${new Date().toLocaleTimeString('es-EC', { hour: '2-digit', minute: '2-digit' })}`);
      this.pick.set({
        homeScorePred: h, awayScorePred: a,
        pointsEarned: null, exactScore: null, correctResult: null,
      });
      this.toast.success('Pick guardado');
    } catch (e) {
      this.toast.error(humanizeError(e));
    } finally {
      this.saving.set(false);
    }
  }
}

function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}
