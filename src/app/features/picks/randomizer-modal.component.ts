import { Component, EventEmitter, Input, Output, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { PicksSyncService } from '../../core/sync/picks-sync.service';
import { ToastService } from '../../core/notifications/toast.service';

interface MatchLite {
  id: string;
  kickoffAt: string;
  status: string | null;
  homeTeamId: string;
  awayTeamId: string;
}

type Filter = 'today' | 'date-1' | 'date-2' | 'date-3' | 'all';

interface DateGroup {
  key: string;          // ISO date (YYYY-MM-DD)
  label: string;        // "Hoy" / "1 fecha · 4 jun" / etc
  count: number;
}

/**
 * Modal "🎲 Aleatorio" — genera marcadores random para un set de partidos
 * upcoming, en un rango de números configurable. UX:
 *   1) User elige set: Hoy / 1ª fecha / 2ª fecha / 3ª fecha / Todos.
 *   2) User ajusta rango con dos sliders (min, max) — números entre 0 y 9.
 *   3) Click "Generar" → para cada partido del set, asigna 2 ints
 *      uniformes en [min, max], los enquea al sync, cierra modal.
 *
 * Los picks resultantes se pueden editar igual después — son solo
 * pre-fills aleatorios. Útil cuando el user quiere predicciones
 * "exploratorias" rápidas.
 */
@Component({
  standalone: true,
  selector: 'app-randomizer-modal',
  imports: [FormsModule],
  template: `
    @if (open()) {
      <div class="picks-modal is-open" role="dialog" aria-modal="true">
        <button type="button" class="picks-modal__close-overlay"
                (click)="close()" aria-label="Cerrar"></button>
        <div class="picks-modal__card">
          <header class="picks-modal__head">
            <div>
              <div class="title">🎲 Picks aleatorios</div>
              <div class="meta">{{ selectedCount() }} partido{{ selectedCount() === 1 ? '' : 's' }} · rango {{ minVal() }}–{{ maxVal() }}</div>
            </div>
            <button type="button" class="close" (click)="close()" aria-label="Cerrar">✕</button>
          </header>

          <div class="picks-modal__body">
            <!-- Selector de partidos -->
            <div class="rnd-section">
              <h4 class="rnd-section__title">¿Para qué partidos?</h4>
              <div class="rnd-options">
                @for (opt of options(); track opt.key) {
                  <button type="button" class="rnd-option"
                          [class.is-active]="filter() === opt.key"
                          [disabled]="opt.count === 0"
                          (click)="filter.set(opt.key)">
                    <span class="rnd-option__label">{{ opt.label }}</span>
                    <span class="rnd-option__count">{{ opt.count }} partido{{ opt.count === 1 ? '' : 's' }}</span>
                  </button>
                }
              </div>
            </div>

            <!-- Rango de números -->
            <div class="rnd-section">
              <h4 class="rnd-section__title">Rango de marcadores</h4>
              <p class="rnd-section__hint">
                El sistema asigna 2 números aleatorios entre los valores que elijas.
              </p>
              <div class="rnd-slider">
                <label>Mínimo: <strong>{{ minVal() }}</strong></label>
                <input type="range" min="0" max="9" step="1"
                       [value]="minVal()"
                       (input)="onMinChange($event)">
              </div>
              <div class="rnd-slider">
                <label>Máximo: <strong>{{ maxVal() }}</strong></label>
                <input type="range" min="0" max="9" step="1"
                       [value]="maxVal()"
                       (input)="onMaxChange($event)">
              </div>
              <p class="rnd-section__hint">
                Ejemplo de pick aleatorio en este rango:
                <strong>{{ samplePreview() }}</strong>
              </p>
            </div>
          </div>

          <footer class="picks-modal__foot">
            <button type="button" class="btn-wf" (click)="close()">Cancelar</button>
            <button type="button" class="btn-wf btn-wf--primary"
                    [disabled]="selectedCount() === 0"
                    (click)="generate()">
              🎲 Generar para {{ selectedCount() }} partido{{ selectedCount() === 1 ? '' : 's' }}
            </button>
          </footer>
        </div>
      </div>
    }
  `,
  styles: [`
    :host { display: contents; }

    .rnd-section { margin-bottom: 18px; }
    .rnd-section__title {
      font-family: var(--wf-display);
      font-size: 13px;
      letter-spacing: .04em;
      margin: 0 0 8px;
    }
    .rnd-section__hint {
      font-size: 12px;
      color: var(--wf-ink-3);
      margin: 0 0 8px;
      line-height: 1.4;
    }

    .rnd-options {
      display: grid;
      grid-template-columns: 1fr;
      gap: 6px;
    }
    @media (min-width: 480px) {
      .rnd-options { grid-template-columns: 1fr 1fr; }
    }
    .rnd-option {
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      gap: 2px;
      padding: 10px 12px;
      background: var(--wf-paper);
      border: 1.5px solid var(--wf-line-2);
      border-radius: 8px;
      cursor: pointer;
      font-family: inherit;
      text-align: left;
      transition: border-color .12s, background .12s;
    }
    .rnd-option:hover:not(:disabled) { border-color: var(--wf-ink-3); }
    .rnd-option:disabled { opacity: 0.45; cursor: not-allowed; }
    .rnd-option.is-active {
      border-color: var(--wf-green);
      background: var(--wf-green-soft);
    }
    .rnd-option__label {
      font-size: 13px;
      font-weight: 700;
    }
    .rnd-option__count {
      font-size: 11px;
      color: var(--wf-ink-3);
    }

    .rnd-slider {
      display: flex;
      flex-direction: column;
      gap: 4px;
      margin-bottom: 12px;
    }
    .rnd-slider label {
      font-size: 12px;
      color: var(--wf-ink-2);
    }
    .rnd-slider input[type="range"] {
      width: 100%;
    }
  `],
})
export class RandomizerModalComponent {
  /** Lista de partidos upcoming (no FINAL, kickoff futuro) entre los
   *  que se puede aleatorizar. El componente parent (picks-list) decide
   *  cuáles incluir y los pasa por @Input. */
  @Input() set matches(value: MatchLite[]) {
    this._matches.set(value);
  }
  @Output() closed = new EventEmitter<void>();

  private sync = inject(PicksSyncService);
  private toast = inject(ToastService);

  open = signal(false);

  private _matches = signal<MatchLite[]>([]);
  filter = signal<Filter>('today');
  minVal = signal(0);
  maxVal = signal(3);

  /** Solo partidos editables: kickoff futuro y status no-FINAL. */
  private upcomingMatches = computed(() => {
    const now = Date.now();
    return this._matches().filter((m) =>
      m.status !== 'FINAL' && Date.parse(m.kickoffAt) > now,
    );
  });

  /** Agrupa upcoming matches por fecha (YYYY-MM-DD). Las primeras 3
   *  fechas con matches son "1ª/2ª/3ª fecha". */
  private dateGroups = computed<DateGroup[]>(() => {
    const byDate = new Map<string, MatchLite[]>();
    for (const m of this.upcomingMatches()) {
      const d = m.kickoffAt.slice(0, 10);
      const arr = byDate.get(d) ?? [];
      arr.push(m);
      byDate.set(d, arr);
    }
    const sorted = [...byDate.entries()].sort((a, b) => a[0].localeCompare(b[0]));
    return sorted.map(([key, arr], idx) => ({
      key,
      label: this.formatDateLabel(key, idx),
      count: arr.length,
    }));
  });

  options = computed(() => {
    const groups = this.dateGroups();
    const todayKey = new Date().toISOString().slice(0, 10);
    const todayGroup = groups.find((g) => g.key === todayKey);
    return [
      { key: 'today' as Filter, label: '📅 Hoy', count: todayGroup?.count ?? 0 },
      { key: 'date-1' as Filter, label: groups[0] ? `1ª fecha · ${this.shortDate(groups[0].key)}` : '1ª fecha', count: groups[0]?.count ?? 0 },
      { key: 'date-2' as Filter, label: groups[1] ? `2ª fecha · ${this.shortDate(groups[1].key)}` : '2ª fecha', count: groups[1]?.count ?? 0 },
      { key: 'date-3' as Filter, label: groups[2] ? `3ª fecha · ${this.shortDate(groups[2].key)}` : '3ª fecha', count: groups[2]?.count ?? 0 },
      { key: 'all' as Filter, label: '🎲 Todos los próximos', count: this.upcomingMatches().length },
    ];
  });

  /** Partidos que se van a aleatorizar según el filter actual. */
  private selectedMatches = computed<MatchLite[]>(() => {
    const f = this.filter();
    const groups = this.dateGroups();
    const todayKey = new Date().toISOString().slice(0, 10);
    if (f === 'today') {
      return this.upcomingMatches().filter((m) => m.kickoffAt.slice(0, 10) === todayKey);
    }
    if (f === 'all') return this.upcomingMatches();
    const idx = f === 'date-1' ? 0 : f === 'date-2' ? 1 : 2;
    const g = groups[idx];
    if (!g) return [];
    return this.upcomingMatches().filter((m) => m.kickoffAt.slice(0, 10) === g.key);
  });

  selectedCount = computed(() => this.selectedMatches().length);

  /** Preview de un pick random ejemplo en el rango seleccionado. */
  samplePreview = computed(() => {
    const min = this.minVal();
    const max = this.maxVal();
    const a = this.randInt(min, max);
    const b = this.randInt(min, max);
    return `${a}—${b}`;
  });

  show() {
    this.open.set(true);
  }
  close() {
    this.open.set(false);
    this.closed.emit();
  }

  onMinChange(event: Event) {
    const v = parseInt((event.target as HTMLInputElement).value, 10);
    this.minVal.set(v);
    if (v > this.maxVal()) this.maxVal.set(v);
  }
  onMaxChange(event: Event) {
    const v = parseInt((event.target as HTMLInputElement).value, 10);
    this.maxVal.set(v);
    if (v < this.minVal()) this.minVal.set(v);
  }

  generate() {
    const matches = this.selectedMatches();
    if (matches.length === 0) return;
    const min = this.minVal();
    const max = this.maxVal();
    let count = 0;
    for (const m of matches) {
      const home = this.randInt(min, max);
      const away = this.randInt(min, max);
      this.sync.enqueue('pick', m.id, {
        home, away, homeTouched: true, awayTouched: true,
      });
      count++;
    }
    this.toast.success(
      `Picks generados para ${count} partido${count === 1 ? '' : 's'} · sincronizando…`,
    );
    this.sync.syncNow();
    this.close();
  }

  // ---- helpers ----
  private randInt(min: number, max: number): number {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  private shortDate(iso: string): string {
    const d = new Date(iso + 'T12:00:00');
    return d.toLocaleDateString('es-EC', { day: 'numeric', month: 'short' });
  }

  private formatDateLabel(iso: string, idx: number): string {
    return `${idx + 1}ª fecha · ${this.shortDate(iso)}`;
  }
}
