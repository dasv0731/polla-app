import { Component, Input, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ApiService } from '../../core/api/api.service';
import { AuthService } from '../../core/auth/auth.service';
import { TimeService } from '../../core/time/time.service';
import { ToastService } from '../../core/notifications/toast.service';
import { UserModesService } from '../../core/user/user-modes.service';
import { apiClient } from '../../core/api/client';
import { TeamFlagComponent } from '../../shared/ui/team-flag.component';
import { PicksSyncService } from '../../core/sync/picks-sync.service';
import { SkeletonComponent } from '../../shared/ui/skeleton/skeleton.component';
import { IconComponent } from '../../shared/ui/icon/icon.component';

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
interface PhaseInfo { name: string; multiplier: number; order: number; }
interface AggregateStats { exactPct: number; resultPct: number; total: number; }

@Component({
  standalone: true,
  selector: 'app-pick-detail',
  imports: [RouterLink, TeamFlagComponent, SkeletonComponent, IconComponent],
  template: `
    @let m = match();
    @let p = pick();

    @if (loading()) {
      <div style="padding: var(--space-xl); max-width: 720px; margin: 0 auto;">
        <app-skeleton variant="card" [count]="1" />
        <div style="margin-top: var(--space-md);">
          <app-skeleton variant="text" [count]="3" />
        </div>
      </div>
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
                    <input type="text" inputmode="numeric" maxlength="2"
                           class="mh__pick-input"
                           autocomplete="off" spellcheck="false"
                           [value]="home() ?? ''"
                           [disabled]="isPast()"
                           [attr.aria-label]="'Goles ' + teamName(m.homeTeamId)"
                           (input)="onBannerInput('home', $event)">
                    <span class="mh__pick-sep">—</span>
                    <input type="text" inputmode="numeric" maxlength="2"
                           class="mh__pick-input"
                           autocomplete="off" spellcheck="false"
                           [value]="away() ?? ''"
                           [disabled]="isPast()"
                           [attr.aria-label]="'Goles ' + teamName(m.awayTeamId)"
                           (input)="onBannerInput('away', $event)">
                  </div>
                  @if (isPast()) {
                    <span class="mh__pick-state mh__pick-state--locked">
                      <app-icon name="lock" size="sm" />Cerrado · kickoff alcanzado
                    </span>
                  } @else if (saving()) {
                    <span class="mh__pick-state">Guardando…</span>
                  } @else if (pick()) {
                    <span class="mh__pick-state mh__pick-state--ok">
                      <app-icon name="check" size="sm" />Guardado
                    </span>
                  } @else {
                    <span class="mh__pick-state mh__pick-state--muted">Sin pick · escribe un marcador</span>
                  }
                </div>
              </div>
              <div class="mh__side">
                <app-team-flag [flagCode]="teamFlag(m.awayTeamId)" [crestUrl]="teamCrest(m.awayTeamId)" [name]="teamName(m.awayTeamId)" [size]="80" />
                <strong>{{ teamName(m.awayTeamId) }}</strong>
              </div>
            </div>

            @if (!isPast()) {
              <!-- Countdown contextual:
                   - >1 día: "En N días" simple
                   - 1 día: "Mañana"
                   - <24h: full D/H/M/S grid -->
              @if (countdownMode() === 'simple') {
                <div class="countdown-simple" role="timer">
                  <span class="countdown-simple__icon"><app-icon name="clock" size="sm" /></span>
                  {{ countdownSimpleLabel() }}
                </div>
              } @else {
                <div class="countdown" style="max-width: 480px; margin-inline: auto;">
                  <div class="countdown__cell"><span class="countdown__value">{{ days() }}</span><span class="countdown__label">Días</span></div>
                  <div class="countdown__cell"><span class="countdown__value">{{ hours() }}</span><span class="countdown__label">Horas</span></div>
                  <div class="countdown__cell"><span class="countdown__value">{{ mins() }}</span><span class="countdown__label">Min</span></div>
                  <div class="countdown__cell"><span class="countdown__value">{{ secs() }}</span><span class="countdown__label">Seg</span></div>
                </div>
              }
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
                   [class.pick-vs-result__verdict--hit]="verdictKind() === 'exact' || verdictKind() === 'result'"
                   [class.pick-vs-result__verdict--miss]="verdictKind() === 'miss'"
                   [class.pick-vs-result__verdict--none]="verdictKind() === 'none'">
                  @if (verdictKind() === 'exact' || verdictKind() === 'result') {
                    <app-icon name="check" size="md" />
                  } @else if (verdictKind() === 'miss') {
                    <app-icon name="close" size="md" />
                  }
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
                  <p style="font-size:11px;color:var(--wf-ink-3);margin:0 0 8px;">
                    Tier de acierto (excluyente — solo el más alto cuenta) × multiplicador de fase.
                  </p>
                  <div class="breakdown-row">
                    <span class="breakdown-row__label">Marcador exacto</span>
                    <span class="breakdown-row__check"
                          [class.breakdown-row__check--ok]="p.exactScore"
                          [class.breakdown-row__check--ko]="!p.exactScore">
                      {{ p.exactScore ? '✓' : '✗' }}
                    </span>
                    <span class="breakdown-row__pts">{{ p.exactScore ? '5 pts base' : '—' }}</span>
                  </div>
                  <div class="breakdown-row">
                    <span class="breakdown-row__label">Diferencia + resultado</span>
                    <span class="breakdown-row__check"
                          [class.breakdown-row__check--ok]="isDiffTier(p)">
                      {{ isDiffTier(p) ? '✓' : '—' }}
                    </span>
                    <span class="breakdown-row__pts">3 pts base</span>
                  </div>
                  <div class="breakdown-row">
                    <span class="breakdown-row__label">Solo resultado (V/E/D)</span>
                    <span class="breakdown-row__check"
                          [class.breakdown-row__check--ok]="isResultOnlyTier(p)">
                      {{ isResultOnlyTier(p) ? '✓' : '—' }}
                    </span>
                    <span class="breakdown-row__pts">1 pt base</span>
                  </div>
                  <div class="breakdown-row">
                    <span class="breakdown-row__label">Multiplicador ({{ phaseName() ?? '—' }})</span>
                    <span></span>
                    <span class="breakdown-row__pts">×{{ phaseMultiplier() }}</span>
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
          <!-- DATOS DEL PARTIDO compactos · eliminamos los 3 placeholders
               (Estadio/Sede/Árbitro) que duplicaban "Por confirmar". Solo
               quedan los 3 hechos reales: fase + multiplicador + kickoff. -->
          <section>
            <header class="section-heading" style="margin-bottom: var(--space-md);">
              <div class="section-heading__text">
                <p class="kicker">Datos del partido</p>
                <h2 class="h2">Sobre {{ teamName(m.homeTeamId) }} vs {{ teamName(m.awayTeamId) }}</h2>
              </div>
            </header>
            <div class="match-info match-info--compact">
              <div class="match-info__item"><small>Fase</small><strong>{{ phaseName() ?? '—' }}</strong></div>
              <div class="match-info__item"><small>Multiplicador</small><strong>x{{ phaseMultiplier() }} · max {{ (phaseMultiplier()) * 5 }} pts</strong></div>
              <div class="match-info__item"><small>Kickoff</small><strong>{{ time.formatKickoff(m.kickoffAt) }}</strong></div>
            </div>
            <!-- TODO(A6): forma reciente + H2H + picks distribution requieren backend.
                 Hidden hasta que el endpoint esté disponible. -->
          </section>
        }

        <!-- Post-match: link al ranking del grupo + share -->
        @if (isFinal()) {
          <section class="post-match-actions">
            @if (primaryGroup(); as g) {
              <a class="post-match-link" [routerLink]="['/groups', g.id]">
                <app-icon name="trophy" size="sm" />
                Ver mi ranking en {{ g.name }}
                <span aria-hidden="true">→</span>
              </a>
            }
            <button type="button" class="post-match-share" (click)="shareResult()">
              <app-icon name="arrow-right" size="sm" />
              Compartir resultado
            </button>
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
    .mh__pick-input:focus-visible {
      outline: none;
      border-color: white;
      background: rgba(255, 255, 255, 0.2);
      box-shadow: 0 0 0 3px rgba(255, 255, 255, 0.3);
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
    .mh__pick-state {
      display: inline-flex;
      align-items: center;
      gap: 4px;
    }
    .mh__pick-state--ok     { color: #9eff9e; }
    .mh__pick-state--muted  { opacity: 0.7; }
    .mh__pick-state--locked { color: #ffb3b3; }

    /* Countdown contextual simple (>1 día) */
    .countdown-simple {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 8px 16px;
      background: rgba(255, 255, 255, 0.12);
      border: 1px solid rgba(255, 255, 255, 0.2);
      border-radius: 999px;
      font-size: 14px;
      font-weight: 600;
      letter-spacing: 0.04em;
      margin: 12px auto 0;
    }
    .countdown-simple__icon {
      display: inline-flex;
      opacity: 0.85;
    }

    /* Verdict --hit variant (asimetría fix vs --miss/--none ya existentes) */
    .pick-vs-result__verdict {
      display: inline-flex;
      align-items: center;
      gap: 6px;
    }
    .pick-vs-result__verdict--hit {
      color: var(--color-win, #02cc74);
    }

    /* Match-info compact (3 items reales, no placeholders) */
    .match-info--compact {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: var(--space-sm);
    }
    @media (max-width: 600px) {
      .match-info--compact { grid-template-columns: 1fr; }
    }

    /* Post-match actions: link al grupo + share */
    .post-match-actions {
      display: flex;
      gap: var(--space-md);
      flex-wrap: wrap;
      justify-content: center;
      margin: var(--space-xl) 0;
    }
    .post-match-link,
    .post-match-share {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 10px 16px;
      background: var(--color-primary-green);
      color: #fff;
      border: 0;
      border-radius: 8px;
      font-weight: 600;
      font-size: 13px;
      text-decoration: none;
      cursor: pointer;
      font-family: inherit;
    }
    .post-match-link:hover,
    .post-match-share:hover { filter: brightness(0.95); }
    .post-match-share {
      background: transparent;
      color: var(--color-primary-green);
      border: 1px solid var(--color-primary-green);
    }
    .post-match-share:hover { background: rgba(2,204,116,0.05); filter: none; }
    .post-match-link:focus-visible,
    .post-match-share:focus-visible {
      outline: 2px solid var(--color-primary-green);
      outline-offset: 2px;
    }
  `],
})
export class PickDetailComponent implements OnInit, OnDestroy {
  @Input() id!: string;

  private api = inject(ApiService);
  private auth = inject(AuthService);
  time = inject(TimeService);
  private toast = inject(ToastService);
  sync = inject(PicksSyncService);
  private userModes = inject(UserModesService);

  /** Primer grupo del user (para link "Ver mi ranking en X" post-match). */
  primaryGroup = computed(() => this.userModes.groups()[0] ?? null);

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

  /** Countdown contextual:
   *  - >1 día: simple ("En N días")
   *  - 1 día: simple ("Mañana")
   *  - <24h: detail (D/H/M/S grid completa) */
  countdownMode = computed<'simple' | 'detail'>(() =>
    this.msUntil() >= 86_400_000 ? 'simple' : 'detail',
  );
  countdownSimpleLabel = computed(() => {
    const ms = this.msUntil();
    const days = Math.floor(ms / 86_400_000);
    if (days === 1) return 'Mañana';
    return `En ${days} días`;
  });

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
    const mult = this.phaseMultiplier();
    const phase = this.phaseName() ?? 'la fase';
    switch (this.verdictKind()) {
      case 'exact': return `Acertaste el resultado y el marcador exacto. Multiplicador de ${phase} x${mult}.`;
      case 'result': return `Acertaste el ganador, no el marcador. Multiplicador x${mult}.`;
      case 'miss': return 'El resultado fue distinto al que predijiste.';
      case 'none': return 'No registraste pick antes del kickoff.';
    }
  });

  /** Determina qué tier de acierto matchea el pointsEarned actual.
   *  Permite checkear cuál de los 3 tiers (exacto/diff/solo-resultado)
   *  fue el que aplicó al pick. */
  isDiffTier(p: PickData): boolean {
    if (p.exactScore) return false;
    if (!p.correctResult) return false;
    const expected = 3 * this.phaseMultiplier();
    return Math.abs((p.pointsEarned ?? 0) - expected) < 0.01;
  }
  isResultOnlyTier(p: PickData): boolean {
    if (p.exactScore) return false;
    if (!p.correctResult) return false;
    const expected = 1 * this.phaseMultiplier();
    return Math.abs((p.pointsEarned ?? 0) - expected) < 0.01;
  }

  phaseName = computed(() => this.phase()?.name);
  /** Multiplicador real usado en scoring (mapeado por phase.order, no
   *  el legacy phase.multiplier de DB). Reglamento §5 v2:
   *    grupos x1 · R32 x1.5 · octavos x2 · cuartos x2.5 · semis x3 · final x4 */
  phaseMultiplier = computed(() => {
    const ord = this.phase()?.order ?? 0;
    switch (ord) {
      case 1: return 1;
      case 2: return 1.5;
      case 3: return 2;
      case 4: return 2.5;
      case 5: return 3;
      case 6: return 4;
      default: return 1;
    }
  });

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
    // Bug #6 fix: aceptamos 2 dígitos (0-99) para marcadores 10+.
    const raw = input.value.replace(/[^0-9]/g, '').slice(-2);
    const v = raw === '' ? 0 : Math.max(0, Math.min(99, parseInt(raw, 10)));
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
      if (phase) this.phase.set({ name: phase.name, multiplier: phase.multiplier, order: phase.order });

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

  /** Share result post-match · uses Web Share API si disponible, sino
   *  copia al clipboard como fallback. */
  async shareResult() {
    const m = this.match();
    const p = this.pick();
    if (!m) return;
    const home = this.teamName(m.homeTeamId);
    const away = this.teamName(m.awayTeamId);
    const realScore = `${m.homeScore}-${m.awayScore}`;
    const myScore = p ? `${p.homeScorePred}-${p.awayScorePred}` : 'sin pick';
    const pts = p?.pointsEarned ?? 0;
    const text = `Mundial 2026 · ${home} ${realScore} ${away}\n` +
                 `Mi pick: ${myScore} · +${pts} pts\n` +
                 `Jugá tu polla en Golgana`;
    if (typeof navigator !== 'undefined' && 'share' in navigator) {
      try {
        await navigator.share({ title: 'Mi pick en Golgana', text });
        return;
      } catch {
        /* user dismissed o share unsupported — fallback al clipboard */
      }
    }
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      try {
        await navigator.clipboard.writeText(text);
        this.toast.success('Resultado copiado al portapapeles');
        return;
      } catch { /* ignore */ }
    }
    this.toast.error('No se pudo compartir');
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
