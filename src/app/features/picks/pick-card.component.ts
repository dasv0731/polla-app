import { Component, Input, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TimeService } from '../../core/time/time.service';
import { ApiService } from '../../core/api/api.service';
import { ToastService } from '../../core/notifications/toast.service';
import { humanizeError } from '../../core/notifications/domain-errors';

interface DisplayMatch {
  id: string;
  kickoffAt: string;
  homeTeamId: string;
  awayTeamId: string;
  homeTeamName?: string;
  awayTeamName?: string;
  homeFlag?: string;
  awayFlag?: string;
  homeScore?: number | null;
  awayScore?: number | null;
  status?: string;
}

interface ExistingPick {
  homeScorePred: number;
  awayScorePred: number;
  pointsEarned?: number | null;
  exactScore?: boolean | null;
  correctResult?: boolean | null;
}

@Component({
  standalone: true,
  selector: 'app-pick-card',
  imports: [RouterLink],
  template: `
    <article class="pick-card" [class.pick-card--open]="state() === 'open'"
                                [class.pick-card--saved]="state() === 'saved'"
                                [class.pick-card--locked]="state() === 'locked'">
      <div class="pick-card__header">
        <span class="pick-card__phase">{{ phaseLabel || 'Mundial 2026' }}</span>
        @if (state() === 'locked') {
          <span style="color: var(--color-text-muted);">{{ time.formatKickoff(match.kickoffAt) }}</span>
        } @else {
          <span>{{ time.formatKickoff(match.kickoffAt) }}</span>
        }
      </div>

      <div class="pick-card__teams">
        <div class="pick-card__team">
          <span class="flag" [class]="homeFlagClass()"></span>
          <span class="pick-card__team-name">{{ match.homeTeamName || match.homeTeamId }}</span>
        </div>
        <div class="pick-card__center">{{ centerLabel() }}</div>
        <div class="pick-card__team">
          <span class="flag" [class]="awayFlagClass()"></span>
          <span class="pick-card__team-name">{{ match.awayTeamName || match.awayTeamId }}</span>
        </div>
      </div>

      @if (state() !== 'locked' || !hasFinalResult()) {
        <div class="pick-card__inputs">
          <div class="score-input">
            <div class="score-input__field">
              <div class="score-input__stepper">
                <button class="score-input__btn" type="button" [disabled]="locked() || (home() ?? 0) <= 0" (click)="dec('home')">−</button>
                <input class="score-input__value" type="text" [value]="home() ?? '—'" readonly [attr.aria-label]="'Goles ' + (match.homeTeamName ?? match.homeTeamId)">
                <button class="score-input__btn" type="button" [disabled]="locked() || (home() ?? 0) >= 20" (click)="inc('home')">+</button>
              </div>
            </div>
            <span class="score-input__sep">vs</span>
            <div class="score-input__field">
              <div class="score-input__stepper">
                <button class="score-input__btn" type="button" [disabled]="locked() || (away() ?? 0) <= 0" (click)="dec('away')">−</button>
                <input class="score-input__value" type="text" [value]="away() ?? '—'" readonly [attr.aria-label]="'Goles ' + (match.awayTeamName ?? match.awayTeamId)">
                <button class="score-input__btn" type="button" [disabled]="locked() || (away() ?? 0) >= 20" (click)="inc('away')">+</button>
              </div>
            </div>
          </div>
        </div>
      }

      @if (hasFinalResult()) {
        <div class="pick-card__result">
          <div class="pick-card__result-cell">
            <span class="pick-card__result-label">Tu pick</span>
            @if (existingPick) {
              <span class="pick-card__result-score" [style.color]="pointsEarned ? null : 'var(--color-lost)'">
                {{ existingPick.homeScorePred }} — {{ existingPick.awayScorePred }}
              </span>
            } @else {
              <span class="pick-card__result-score" style="color: var(--color-lost);">— —</span>
            }
          </div>
          <div class="pick-card__result-cell">
            <span class="pick-card__result-label">Resultado</span>
            <span class="pick-card__result-score">{{ match.homeScore }} — {{ match.awayScore }}</span>
          </div>
        </div>
      }

      <div class="pick-card__footer">
        @if (state() === 'open') {
          <button class="btn btn--primary btn--sm" type="button" (click)="save()" [disabled]="saving() || !canSave()">
            {{ saving() ? 'Guardando…' : 'Guardar pick' }}
          </button>
          <span class="pick-card__footer-status">Sin pick</span>
        } @else if (state() === 'saved') {
          <span class="pick-card__footer-status">{{ savedAt() ? 'Guardado · ' + savedAt() : 'Guardado' }}</span>
          @if (saving()) {
            <span style="color: var(--color-text-muted);">Guardando cambios…</span>
          } @else {
            <button class="btn btn--ghost btn--sm" type="button" (click)="save()" [disabled]="!canSave()">Actualizar</button>
          }
        } @else if (hasFinalResult()) {
          @if (pointsEarned && pointsEarned > 0) {
            <span class="pick-card__points">+{{ pointsEarned }} pts</span>
          } @else {
            <span class="pick-card__points pick-card__points--zero">0 pts</span>
          }
          <a [routerLink]="['/picks/match', match.id]" class="link-green">Detalle →</a>
        } @else {
          <span class="pick-card__footer-status">Sin pick · cerrado</span>
        }
      </div>
    </article>
  `,
})
export class PickCardComponent implements OnInit, OnDestroy {
  @Input({ required: true }) match!: DisplayMatch;
  @Input() phaseLabel = '';
  @Input() existingPick: ExistingPick | null = null;
  @Input() pointsEarned?: number | null;

  time = inject(TimeService);
  private api = inject(ApiService);
  private toast = inject(ToastService);

  home = signal<number | null>(null);
  away = signal<number | null>(null);
  saving = signal(false);
  savedAt = signal<string | null>(null);
  locked = signal(false);

  state = computed<'open' | 'saved' | 'locked'>(() => {
    if (this.locked()) return 'locked';
    if (this.existingPick || this.savedAt()) return 'saved';
    return 'open';
  });

  hasFinalResult = computed(() =>
    this.match.status === 'FINAL' && this.match.homeScore != null && this.match.awayScore != null,
  );

  canSave = computed(() => this.home() !== null && this.away() !== null);

  homeFlagClass = computed(() => 'flag--' + (this.match.homeFlag ?? this.match.homeTeamId).toLowerCase());
  awayFlagClass = computed(() => 'flag--' + (this.match.awayFlag ?? this.match.awayTeamId).toLowerCase());

  centerLabel = computed(() => {
    if (this.hasFinalResult()) return 'FT';
    if (this.locked()) return 'EN VIVO';
    return 'vs';
  });

  private timer: ReturnType<typeof setInterval> | undefined;

  ngOnInit() {
    if (this.existingPick) {
      this.home.set(this.existingPick.homeScorePred);
      this.away.set(this.existingPick.awayScorePred);
    }
    this.tick();
    this.timer = setInterval(() => this.tick(), 30_000);
  }

  ngOnDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

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

  private tick() {
    this.locked.set(this.time.isPast(this.match.kickoffAt));
  }

  async save() {
    const h = this.home();
    const a = this.away();
    if (h === null || a === null) {
      this.toast.error('Ingresa ambos marcadores con + / −');
      return;
    }
    this.saving.set(true);
    try {
      await this.api.upsertPick(this.match.id, h, a);
      this.savedAt.set('hace unos segundos');
      this.toast.success('Pick guardado');
    } catch (e) {
      this.toast.error(humanizeError(e));
    } finally {
      this.saving.set(false);
    }
  }
}
