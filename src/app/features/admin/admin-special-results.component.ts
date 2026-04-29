import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../core/api/api.service';
import { ToastService } from '../../core/notifications/toast.service';
import { humanizeError } from '../../core/notifications/domain-errors';

const TOURNAMENT_ID = 'mundial-2026';

const TYPES = [
  { key: 'CHAMPION', label: 'Campeón', points: 30 },
  { key: 'RUNNER_UP', label: 'Subcampeón', points: 15 },
  { key: 'DARK_HORSE', label: 'Equipo revelación', points: 10 },
] as const;
type SpecialKey = (typeof TYPES)[number]['key'];

@Component({
  standalone: true,
  selector: 'app-admin-special-results',
  imports: [FormsModule],
  template: `
    <header class="page-header" style="padding: 0 0 var(--space-md);">
      <small>Mundial 2026 · Adjudicación de picks especiales</small>
      <h1 style="font-family: var(--font-display); font-size: 56px; line-height: 1; text-transform: uppercase;">Especiales</h1>
    </header>

    <p style="color: var(--color-text-muted); margin-bottom: var(--space-xl); max-width: 720px;">
      Adjudica los picks especiales una vez que el torneo termine. Cada selección dispara el cálculo automático para todos los SpecialPicks de ese tipo.
    </p>

    @if (!finalCompleted() && !loading()) {
      <div class="empty-state" style="background: rgba(255,200,0,0.10); border-left: 3px solid var(--color-primary-green); padding: var(--space-md);">
        <strong>Bloqueado hasta el fin de la final.</strong>
        <p style="margin-top: 4px;">
          La adjudicación de campeón / subcampeón / revelación se habilita
          solo cuando el partido de la final está marcado como FINAL en
          /admin/results.
        </p>
      </div>
    }

    @if (loading()) {
      <p>Cargando equipos…</p>
    } @else {
      <div style="display: grid; gap: var(--space-lg);">
        @for (t of types; track t.key) {
          <article class="form-card" style="max-width: 100%;">
            <h2 class="form-card__title">
              {{ t.label }}
              <span style="font-size: var(--fs-xs); color: var(--color-primary-green); margin-left: var(--space-sm);">
                +{{ t.points }} pts por acierto
              </span>
            </h2>
            <p class="form-card__lead">
              Selecciona el equipo ganador. Puedes cambiarlo y re-correr — el scoring es delta-based e idempotente.
            </p>
            <div style="display: grid; grid-template-columns: 1fr auto; gap: var(--space-md); align-items: end;">
              <div class="form-card__field" style="margin: 0;">
                <label class="form-card__label">Equipo ganador</label>
                <select class="form-card__select"
                        [value]="selections()[t.key] ?? ''"
                        (change)="setSelection(t.key, $any($event.target).value)">
                  <option value="">— elegir —</option>
                  @for (team of teams(); track team.slug) {
                    <option [value]="team.slug">{{ team.name }}</option>
                  }
                </select>
              </div>
              <button class="btn btn--primary" type="button"
                      [disabled]="!selections()[t.key] || processing()[t.key] || !finalCompleted()"
                      (click)="adjudicate(t.key)">
                {{ processing()[t.key] ? 'Adjudicando…' : 'Adjudicar' }}
              </button>
            </div>
            @if (lastResult()[t.key]; as r) {
              <p class="form-card__hint" style="margin-top: var(--space-sm); color: var(--color-primary-green);">
                ✓ {{ r.updated }} pick{{ r.updated === 1 ? '' : 's' }} actualizado{{ r.updated === 1 ? '' : 's' }}
              </p>
            }
          </article>
        }
      </div>
    }
  `,
})
export class AdminSpecialResultsComponent implements OnInit {
  private api = inject(ApiService);
  private toast = inject(ToastService);

  types = TYPES;
  loading = signal(true);
  teams = signal<{ slug: string; name: string }[]>([]);
  selections = signal<Partial<Record<SpecialKey, string>>>({});
  processing = signal<Record<string, boolean>>({});
  lastResult = signal<Partial<Record<SpecialKey, { updated: number }>>>({});

  // La final está completa = existe un Match con phaseOrder=6,
  // bracketPosition=1 (el partido de la final, no el 3er puesto), status=FINAL.
  finalCompleted = signal(false);

  async ngOnInit() {
    try {
      const [teamsRes, matchesRes, phasesRes] = await Promise.all([
        this.api.listTeams(TOURNAMENT_ID),
        this.api.listMatches(TOURNAMENT_ID),
        this.api.listPhases(TOURNAMENT_ID),
      ]);
      this.teams.set(
        (teamsRes.data ?? [])
          .map((t) => ({ slug: t.slug, name: t.name }))
          .sort((a, b) => a.name.localeCompare(b.name)),
      );
      // Detectar si la final ya se jugó (FINAL).
      const finalPhase = (phasesRes.data ?? []).find((p) => p.order === 6);
      if (finalPhase) {
        const finalMatch = (matchesRes.data ?? []).find((m) =>
          m.phaseId === finalPhase.id && m.bracketPosition === 1);
        this.finalCompleted.set(finalMatch?.status === 'FINAL');
      }
    } finally {
      this.loading.set(false);
    }
  }

  setSelection(type: SpecialKey, slug: string) {
    this.selections.update((s) => ({ ...s, [type]: slug }));
  }

  async adjudicate(type: SpecialKey) {
    const teamId = this.selections()[type];
    if (!teamId) return;
    this.processing.update((p) => ({ ...p, [type]: true }));
    try {
      const res = await this.api.adjudicateSpecial(TOURNAMENT_ID, type, teamId);
      const updated = res.data?.updated ?? 0;
      this.lastResult.update((r) => ({ ...r, [type]: { updated } }));
      this.toast.success(`${TYPES.find((t) => t.key === type)?.label} adjudicado · ${updated} pick(s)`);
    } catch (e) {
      this.toast.error(humanizeError(e));
    } finally {
      this.processing.update((p) => ({ ...p, [type]: false }));
    }
  }
}
