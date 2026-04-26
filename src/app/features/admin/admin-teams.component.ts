import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../core/api/api.service';
import { ToastService } from '../../core/notifications/toast.service';
import { humanizeError } from '../../core/notifications/domain-errors';
import { apiClient } from '../../core/api/client';

const TOURNAMENT_ID = 'mundial-2026';
const GROUP_LETTERS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L'];

interface TeamRow { slug: string; name: string; flagCode: string; groupLetter: string | null; }

@Component({
  standalone: true,
  selector: 'app-admin-teams',
  imports: [FormsModule],
  template: `
    <header class="page-header" style="padding: 0 0 var(--space-md); display: flex; justify-content: space-between; align-items: baseline; flex-wrap: wrap; gap: var(--space-md);">
      <div>
        <small>{{ teams().length }} equipos cargados · 48 esperados · {{ assignedCount() }} con grupo asignado</small>
        <h1 style="font-family: var(--font-display); font-size: 56px; line-height: 1; text-transform: uppercase;">Equipos</h1>
      </div>
    </header>

    <form class="form-card" (ngSubmit)="add()" style="max-width: 100%; margin-bottom: var(--space-xl);">
      <h2 class="form-card__title">Agregar equipo</h2>
      <div style="display: grid; grid-template-columns: 1fr 1fr 110px 90px auto; gap: var(--space-md); align-items: end;">
        <div class="form-card__field" style="margin: 0;">
          <label class="form-card__label" for="team-slug">Slug</label>
          <input class="form-card__input" id="team-slug" type="text"
                 [(ngModel)]="newSlug" name="slug" required
                 placeholder="brasil" pattern="[a-z0-9-]+">
        </div>
        <div class="form-card__field" style="margin: 0;">
          <label class="form-card__label" for="team-name">Nombre</label>
          <input class="form-card__input" id="team-name" type="text"
                 [(ngModel)]="newName" name="name" required placeholder="Brasil">
        </div>
        <div class="form-card__field" style="margin: 0;">
          <label class="form-card__label" for="team-flag">Flag (ISO 2)</label>
          <input class="form-card__input" id="team-flag" type="text"
                 [(ngModel)]="newFlag" name="flagCode" required maxlength="2"
                 placeholder="BR" style="text-transform: uppercase; text-align: center;">
        </div>
        <div class="form-card__field" style="margin: 0;">
          <label class="form-card__label" for="team-group">Grupo</label>
          <select class="form-card__select" id="team-group" name="groupLetter" [(ngModel)]="newGroup">
            <option value="">—</option>
            @for (g of groupLetters; track g) {
              <option [value]="g">{{ g }}</option>
            }
          </select>
        </div>
        <button class="btn btn--primary" type="submit" [disabled]="adding()">
          {{ adding() ? 'Agregando…' : '+ Agregar' }}
        </button>
      </div>
      @if (error()) {
        <p class="form-card__hint" style="color: var(--color-lost); margin-top: var(--space-sm);">{{ error() }}</p>
      }
    </form>

    @if (loading()) {
      <p>Cargando equipos…</p>
    } @else if (teams().length === 0) {
      <p class="empty-state">Aún no hay equipos cargados.</p>
    } @else {
      <p style="font-size: var(--fs-xs); color: var(--color-text-muted); margin-bottom: var(--space-sm); text-transform: uppercase; letter-spacing: 0.08em;">
        Tip: cambia el grupo de cualquier equipo desde la columna "Grupo" — auto-guarda.
      </p>
      <div class="standings-wrap">
        <table class="standings standings--group">
          <thead>
            <tr><th>Bandera</th><th>Slug</th><th>Nombre</th><th>Flag code</th><th>Grupo</th><th>Acciones</th></tr>
          </thead>
          <tbody>
            @for (t of teams(); track t.slug) {
              <tr>
                <td><span class="flag" [class]="flagClass(t.flagCode)" style="display: inline-block; vertical-align: middle; width: 32px; height: 32px;"></span></td>
                <td><code>{{ t.slug }}</code></td>
                <td>{{ t.name }}</td>
                <td>{{ t.flagCode }}</td>
                <td>
                  <select [value]="t.groupLetter ?? ''"
                          [disabled]="!!savingGroup()[t.slug]"
                          (change)="setGroup(t, $any($event.target).value)"
                          style="all: unset; padding: 4px 24px 4px 10px; border: var(--border-grey); border-radius: var(--radius-md); background-color: var(--color-primary-white); font-family: var(--font-display); font-size: var(--fs-md); cursor: pointer; min-width: 60px; text-align: center;">
                    <option value="">—</option>
                    @for (g of groupLetters; track g) {
                      <option [value]="g">{{ g }}</option>
                    }
                  </select>
                  @if (savingGroup()[t.slug]) {
                    <small style="color: var(--color-text-muted); margin-left: 8px;">guardando…</small>
                  }
                </td>
                <td>
                  <a class="link-green" style="color: var(--color-lost); cursor: pointer;" (click)="del(t, $event)">Borrar</a>
                </td>
              </tr>
            }
          </tbody>
        </table>
      </div>
    }
  `,
})
export class AdminTeamsComponent implements OnInit {
  private api = inject(ApiService);
  private toast = inject(ToastService);

  groupLetters = GROUP_LETTERS;

  loading = signal(true);
  adding = signal(false);
  teams = signal<TeamRow[]>([]);
  error = signal<string | null>(null);
  savingGroup = signal<Record<string, boolean>>({});

  newSlug = '';
  newName = '';
  newFlag = '';
  newGroup = '';

  assignedCount = computed(() => this.teams().filter((t) => t.groupLetter).length);

  async ngOnInit() { await this.load(); }

  async load() {
    this.loading.set(true);
    try {
      const res = await this.api.listTeams(TOURNAMENT_ID);
      this.teams.set(
        (res.data ?? [])
          .map((t) => ({
            slug: t.slug,
            name: t.name,
            flagCode: t.flagCode,
            groupLetter: t.groupLetter ?? null,
          }))
          .sort((a, b) => {
            // Group teams together (sort by group letter, then name)
            const ag = a.groupLetter ?? 'Z';
            const bg = b.groupLetter ?? 'Z';
            if (ag !== bg) return ag.localeCompare(bg);
            return a.name.localeCompare(b.name);
          }),
      );
    } finally {
      this.loading.set(false);
    }
  }

  flagClass(code: string): string { return `flag--${code.toLowerCase()}`; }

  async add() {
    if (!this.newSlug || !this.newName || !this.newFlag) return;
    this.error.set(null);
    this.adding.set(true);
    try {
      await apiClient.models.Team.create({
        slug: this.newSlug.trim().toLowerCase(),
        tournamentId: TOURNAMENT_ID,
        name: this.newName.trim(),
        flagCode: this.newFlag.trim().toUpperCase(),
        groupLetter: this.newGroup || null,
      });
      this.toast.success('Equipo agregado');
      this.newSlug = '';
      this.newName = '';
      this.newFlag = '';
      this.newGroup = '';
      void this.load();
    } catch (e) {
      this.error.set(humanizeError(e));
    } finally {
      this.adding.set(false);
    }
  }

  async setGroup(t: TeamRow, value: string) {
    const newLetter = value || null;
    if (newLetter === t.groupLetter) return;
    this.savingGroup.update((s) => ({ ...s, [t.slug]: true }));
    try {
      await apiClient.models.Team.update({
        slug: t.slug,
        groupLetter: newLetter,
      });
      // Optimistic local update + re-sort
      this.teams.update((arr) => {
        const updated = arr.map((row) => row.slug === t.slug ? { ...row, groupLetter: newLetter } : row);
        return updated.sort((a, b) => {
          const ag = a.groupLetter ?? 'Z';
          const bg = b.groupLetter ?? 'Z';
          if (ag !== bg) return ag.localeCompare(bg);
          return a.name.localeCompare(b.name);
        });
      });
      this.toast.success(newLetter ? `${t.name} → Grupo ${newLetter}` : `${t.name} sin grupo`);
    } catch (e) {
      this.toast.error(humanizeError(e));
    } finally {
      this.savingGroup.update((s) => ({ ...s, [t.slug]: false }));
    }
  }

  async del(t: TeamRow, event: Event) {
    event.preventDefault();
    if (!confirm(`¿Borrar el equipo "${t.name}"? Si está en algún partido, esos partidos quedarán inválidos.`)) {
      return;
    }
    try {
      await apiClient.models.Team.delete({ slug: t.slug });
      this.toast.success('Equipo borrado');
      void this.load();
    } catch (e) {
      this.toast.error(humanizeError(e));
    }
  }
}
