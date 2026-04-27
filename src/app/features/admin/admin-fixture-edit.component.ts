import { Component, Input, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ApiService } from '../../core/api/api.service';
import { ToastService } from '../../core/notifications/toast.service';
import { humanizeError } from '../../core/notifications/domain-errors';
import { apiClient } from '../../core/api/client';

const TOURNAMENT_ID = 'mundial-2026';

@Component({
  standalone: true,
  selector: 'app-admin-fixture-edit',
  imports: [FormsModule, RouterLink],
  template: `
    <header class="page-header" style="padding: 0 0 var(--space-md);">
      <small>
        <a [routerLink]="fromBracket ? '/admin/bracket' : '/admin/fixtures'" style="color: var(--color-primary-green);">
          ← {{ fromBracket ? 'Llaves' : 'Partidos' }}
        </a>
      </small>
      <h1 style="font-family: var(--font-display); font-size: 56px; line-height: 1; text-transform: uppercase;">
        {{ id ? 'Editar partido' : 'Nuevo partido' }}
      </h1>
    </header>

    @if (loading()) {
      <p>Cargando…</p>
    } @else {
      <form class="form-card" (ngSubmit)="save()" style="max-width: 720px;">
        <div class="form-card__field">
          <label class="form-card__label" for="phase">Fase</label>
          <select class="form-card__select" id="phase" name="phaseId" [(ngModel)]="phaseId" required>
            <option value="">— elegir —</option>
            @for (p of phases(); track p.id) {
              <option [value]="p.id">{{ p.name }} (x{{ p.multiplier }})</option>
            }
          </select>
        </div>

        <div class="form-card__field--row" style="display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-md);">
          <div class="form-card__field">
            <label class="form-card__label" for="home">Equipo local</label>
            <select class="form-card__select" id="home" name="homeTeamId" [(ngModel)]="homeTeamId" required>
              <option value="">— elegir —</option>
              @for (t of teams(); track t.slug) {
                <option [value]="t.slug">{{ t.name }}</option>
              }
            </select>
          </div>
          <div class="form-card__field">
            <label class="form-card__label" for="away">Equipo visitante</label>
            <select class="form-card__select" id="away" name="awayTeamId" [(ngModel)]="awayTeamId" required>
              <option value="">— elegir —</option>
              @for (t of teams(); track t.slug) {
                <option [value]="t.slug" [disabled]="t.slug === homeTeamId">{{ t.name }}</option>
              }
            </select>
          </div>
        </div>

        <div class="form-card__field">
          <label class="form-card__label" for="kickoff">Kickoff (Quito local)</label>
          <input class="form-card__input" id="kickoff" name="kickoffAt" type="datetime-local"
                 [(ngModel)]="kickoffLocal" required>
          <span class="form-card__hint">Hora local Ecuador (UTC-5). Se guarda en UTC en backend.</span>
        </div>

        <div class="form-card__field">
          <label class="form-card__label" for="status">Estado</label>
          <select class="form-card__select" id="status" name="status" [(ngModel)]="status">
            <option value="SCHEDULED">Programado</option>
            <option value="LIVE">En vivo</option>
            <option value="FINAL">Finalizado</option>
          </select>
        </div>

        <div class="form-card__field">
          <label class="form-card__label" for="venue">Sede</label>
          <input class="form-card__input" id="venue" name="venue" type="text"
                 [(ngModel)]="venue" maxlength="80"
                 placeholder="Ej. Azteca · CDMX">
          <span class="form-card__hint">Estadio · ciudad. Aparece en la tabla de fixtures.</span>
        </div>

        @if (showBracketField()) {
          <div class="form-card__field">
            <label class="form-card__label" for="bracketPos">Posición en la llave</label>
            <input class="form-card__input" id="bracketPos" name="bracketPosition" type="number" min="1"
                   [(ngModel)]="bracketPosition" required>
            <span class="form-card__hint">Posición 1..N dentro de la fase eliminatoria. Determina el orden en la llave.</span>
          </div>
        }

        @if (error()) {
          <p class="form-card__hint" style="color: var(--color-lost);">{{ error() }}</p>
        }

        <div style="display: flex; gap: var(--space-md); flex-wrap: wrap; margin-top: var(--space-lg);">
          <button class="btn btn--primary" type="submit" [disabled]="saving()">
            {{ saving() ? 'Guardando…' : (id ? 'Actualizar' : 'Crear partido') }}
          </button>
          <a class="btn btn--ghost" [routerLink]="fromBracket ? '/admin/bracket' : '/admin/fixtures'">Cancelar</a>
        </div>
      </form>
    }
  `,
})
export class AdminFixtureEditComponent implements OnInit {
  @Input() id?: string;

  private api = inject(ApiService);
  private toast = inject(ToastService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);

  loading = signal(true);
  saving = signal(false);
  error = signal<string | null>(null);

  phases = signal<{ id: string; name: string; multiplier: number; order: number }[]>([]);
  teams = signal<{ slug: string; name: string }[]>([]);

  phaseId = '';
  homeTeamId = '';
  awayTeamId = '';
  kickoffLocal = '';
  status = 'SCHEDULED';
  bracketPosition: number | null = null;
  venue = '';
  fromBracket = false;
  private version = 1;

  showBracketField = computed(() => {
    const p = this.phases().find((x) => x.id === this.phaseId);
    return p ? p.order >= 2 : false;
  });

  async ngOnInit() {
    try {
      const [phasesRes, teamsRes] = await Promise.all([
        this.api.listPhases(TOURNAMENT_ID),
        this.api.listTeams(TOURNAMENT_ID),
      ]);
      this.phases.set((phasesRes.data ?? []).map((p) => ({ id: p.id, name: p.name, multiplier: p.multiplier, order: p.order })));
      this.teams.set((teamsRes.data ?? []).map((t) => ({ slug: t.slug, name: t.name })).sort((a, b) => a.name.localeCompare(b.name)));

      const qp = this.route.snapshot.queryParamMap;
      const qpPhase = qp.get('phaseId');
      const qpPos = qp.get('bracketPosition');
      if (qpPhase || qpPos) this.fromBracket = true;

      if (this.id) {
        const m = await this.api.getMatch(this.id);
        if (m.data) {
          this.phaseId = m.data.phaseId;
          this.homeTeamId = m.data.homeTeamId;
          this.awayTeamId = m.data.awayTeamId;
          this.status = m.data.status ?? 'SCHEDULED';
          this.version = m.data.version ?? 1;
          this.kickoffLocal = isoToLocalInput(m.data.kickoffAt);
          this.bracketPosition = m.data.bracketPosition ?? null;
          this.venue = (m.data as { venue?: string | null }).venue ?? '';
        }
        if (qpPos) this.bracketPosition = Number(qpPos);
      } else {
        // default kickoff: in 24h from now
        const next = new Date(Date.now() + 24 * 3600_000);
        this.kickoffLocal = isoToLocalInput(next.toISOString());
        if (qpPhase) this.phaseId = qpPhase;
        if (qpPos) this.bracketPosition = Number(qpPos);
      }
    } finally {
      this.loading.set(false);
    }
  }

  async save() {
    if (this.homeTeamId === this.awayTeamId) {
      this.error.set('Local y visitante no pueden ser el mismo equipo');
      return;
    }
    this.error.set(null);
    this.saving.set(true);
    try {
      const kickoffAt = localInputToIso(this.kickoffLocal);
      const bracketPos = this.showBracketField() ? this.bracketPosition : null;
      const venue = this.venue.trim() || null;
      if (this.id) {
        const res = await apiClient.models.Match.update({
          id: this.id,
          phaseId: this.phaseId,
          homeTeamId: this.homeTeamId,
          awayTeamId: this.awayTeamId,
          kickoffAt,
          status: this.status as 'SCHEDULED' | 'LIVE' | 'FINAL',
          version: this.version + 1,
          bracketPosition: bracketPos,
          venue,
        });
        if (res?.errors && res.errors.length > 0) {
          // eslint-disable-next-line no-console
          console.error('[Match.update] GraphQL errors:', res.errors);
          this.error.set(res.errors[0]!.message ?? 'No se pudo actualizar el partido');
          return;
        }
        this.toast.success('Partido actualizado');
      } else {
        const res = await apiClient.models.Match.create({
          tournamentId: TOURNAMENT_ID,
          phaseId: this.phaseId,
          homeTeamId: this.homeTeamId,
          awayTeamId: this.awayTeamId,
          kickoffAt,
          status: this.status as 'SCHEDULED' | 'LIVE' | 'FINAL',
          pointsCalculated: false,
          version: 1,
          bracketPosition: bracketPos,
          venue,
        });
        if (res?.errors && res.errors.length > 0) {
          // eslint-disable-next-line no-console
          console.error('[Match.create] GraphQL errors:', res.errors);
          this.error.set(res.errors[0]!.message ?? 'No se pudo crear el partido');
          return;
        }
        this.toast.success('Partido creado');
      }
      void this.router.navigate([this.fromBracket ? '/admin/bracket' : '/admin/fixtures']);
    } catch (e) {
      this.error.set(humanizeError(e));
    } finally {
      this.saving.set(false);
    }
  }
}

function isoToLocalInput(iso: string): string {
  // Convert UTC ISO to a 'YYYY-MM-DDTHH:mm' string in Quito (UTC-5)
  const d = new Date(iso);
  const local = new Date(d.getTime() - 5 * 3600_000);
  const yyyy = local.getUTCFullYear();
  const mm = String(local.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(local.getUTCDate()).padStart(2, '0');
  const hh = String(local.getUTCHours()).padStart(2, '0');
  const mi = String(local.getUTCMinutes()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}T${hh}:${mi}`;
}

function localInputToIso(local: string): string {
  // local is 'YYYY-MM-DDTHH:mm' in Quito (UTC-5). Add 5h to get UTC.
  const [date, time] = local.split('T');
  const [y, m, d] = (date ?? '').split('-').map(Number);
  const [hh, mm] = (time ?? '').split(':').map(Number);
  const utc = new Date(Date.UTC(y!, m! - 1, d!, hh! + 5, mm!));
  return utc.toISOString();
}
