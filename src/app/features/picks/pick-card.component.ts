import { Component, Input, OnDestroy, OnInit, inject, signal } from '@angular/core';
import { TimeService } from '../../core/time/time.service';
import { ApiService } from '../../core/api/api.service';
import { ToastService } from '../../core/notifications/toast.service';

interface DisplayMatch {
  id: string;
  kickoffAt: string;
  homeTeamId: string;
  awayTeamId: string;
  homeTeamName?: string;
  awayTeamName?: string;
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
  template: `
    <article class="pick-card" [class.pick-card--locked]="locked()">
      <header class="pick-card__header">
        <span class="pick-card__phase">{{ phaseLabel || '—' }} · {{ time.formatKickoff(match.kickoffAt) }}</span>
        @if (!locked()) {
          <span class="pick-card__countdown">Cierra en {{ remaining() }}</span>
        } @else {
          <span class="pick-card__countdown is-closed">Cerrado</span>
        }
      </header>

      <div class="pick-card__teams">
        <span class="pick-card__team-name">{{ match.homeTeamName || match.homeTeamId }}</span>
        <div class="score-input">
          <input class="score-input__field" type="number" min="0" max="20"
                 [value]="home() ?? ''"
                 (input)="onHome($any($event.target).value)"
                 [disabled]="locked() || saving()">
          <span class="score-input__sep">—</span>
          <input class="score-input__field" type="number" min="0" max="20"
                 [value]="away() ?? ''"
                 (input)="onAway($any($event.target).value)"
                 [disabled]="locked() || saving()">
        </div>
        <span class="pick-card__team-name">{{ match.awayTeamName || match.awayTeamId }}</span>
      </div>

      <footer class="pick-card__footer">
        @if (!locked()) {
          <button class="btn btn--primary btn--sm" (click)="save()" [disabled]="saving()">
            {{ saving() ? 'Guardando…' : 'Guardar' }}
          </button>
        }
        @if (savedAt()) {
          <small class="pick-card__saved">✓ guardado {{ savedAt() }}</small>
        }
        @if (locked() && match.homeScore != null && match.awayScore != null) {
          <span class="pick-card__result">
            Real: {{ match.homeScore }}—{{ match.awayScore }}
            · +{{ pointsEarned ?? 0 }} pts
          </span>
        }
      </footer>
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
  remaining = signal('');

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

  onHome(v: string) {
    const n = Number.parseInt(v, 10);
    this.home.set(Number.isFinite(n) ? n : null);
  }
  onAway(v: string) {
    const n = Number.parseInt(v, 10);
    this.away.set(Number.isFinite(n) ? n : null);
  }

  private tick() {
    this.locked.set(this.time.isPast(this.match.kickoffAt));
    this.remaining.set(this.time.timeUntil(this.match.kickoffAt));
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
      await this.api.upsertPick(this.match.id, h, a);
      this.savedAt.set(new Date().toLocaleTimeString('es-EC'));
      this.toast.success('Pick guardado');
    } catch (e) {
      this.toast.error((e as Error).message ?? 'No se pudo guardar el pick');
    } finally {
      this.saving.set(false);
    }
  }
}
