import { Component, Input, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { ApiService } from '../../core/api/api.service';
import { ToastService } from '../../core/notifications/toast.service';
import { humanizeError } from '../../core/notifications/domain-errors';
import { apiClient } from '../../core/api/client';

const GROUP_LETTERS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L'];

@Component({
  standalone: true,
  selector: 'app-admin-team-edit',
  imports: [FormsModule, RouterLink],
  template: `
    <header class="page-header" style="padding: 0 0 var(--space-md);">
      <small><a routerLink="/admin/teams" style="color: var(--color-primary-green);">← Equipos</a></small>
      <h1 style="font-family: var(--font-display); font-size: 36px; line-height: 1.05; letter-spacing: 0.04em;">
        Editar equipo
      </h1>
    </header>

    @if (loading()) {
      <p>Cargando…</p>
    } @else if (notFound()) {
      <p class="empty-state">Equipo no encontrado.</p>
    } @else {
      <form class="form-card" (ngSubmit)="save()" style="max-width: 720px;">
        <h2 class="form-card__title">{{ name || slug }}</h2>
        <p class="form-card__lead">El slug es inmutable porque se usa como identificador en partidos.</p>

        <!-- Preview -->
        <div style="display: flex; align-items: center; gap: var(--space-lg); padding: var(--space-lg); background: var(--color-primary-grey); border-radius: var(--radius-md); margin-bottom: var(--space-lg);">
          @if (crestUrl) {
            <img [src]="crestUrl" alt="" style="width: 96px; height: 96px; object-fit: contain; border-radius: var(--radius-md); background: var(--color-primary-white);">
          } @else {
            <span class="flag" [class]="flagPreviewClass()" style="width: 96px; height: 96px;"></span>
          }
          <div>
            <p style="font-family: var(--font-display); font-size: var(--fs-2xl); line-height: 1; text-transform: uppercase;">{{ name || '—' }}</p>
            <p style="font-size: var(--fs-xs); color: var(--color-text-muted); text-transform: uppercase; letter-spacing: 0.08em; margin-top: 4px;">
              {{ slug }} · {{ flagCode || '—' }} · Grupo {{ groupLetter || '—' }}
            </p>
          </div>
        </div>

        <div class="form-card__field">
          <label class="form-card__label" for="t-slug">Slug (read-only)</label>
          <input class="form-card__input" id="t-slug" type="text" [value]="slug" disabled
                 style="opacity: 0.6; cursor: not-allowed;">
          <span class="form-card__hint">El slug identifica al equipo en URLs y en los homeTeamId/awayTeamId de los partidos. Cambiarlo rompería referencias — borra y vuelve a crear si necesitas otro slug.</span>
        </div>

        <div class="form-card__field">
          <label class="form-card__label" for="t-name">Nombre</label>
          <input class="form-card__input" id="t-name" type="text"
                 [(ngModel)]="name" name="name" required maxlength="60">
        </div>

        <div class="form-card__field--row" style="display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-md);">
          <div class="form-card__field">
            <label class="form-card__label" for="t-flag">Flag code</label>
            <input class="form-card__input" id="t-flag" type="text"
                   [(ngModel)]="flagCode" name="flagCode" required maxlength="6"
                   style="text-transform: uppercase; text-align: center;"
                   placeholder="EC / GB-SCT">
            <span class="form-card__hint">ISO 3166-1 alpha-2 (ej. EC, BA, CV) o sub-región flag-icons (GB-SCT, GB-WLS, GB-NIR, GB-ENG).</span>
          </div>
          <div class="form-card__field">
            <label class="form-card__label" for="t-group">Grupo</label>
            <select class="form-card__select" id="t-group" [(ngModel)]="groupLetter" name="groupLetter">
              <option value="">—</option>
              @for (g of groupLetters; track g) {
                <option [value]="g">Grupo {{ g }}</option>
              }
            </select>
          </div>
        </div>

        <div class="form-card__field">
          <label class="form-card__label" for="t-crest">Foto / Escudo (URL)</label>
          <input class="form-card__input" id="t-crest" type="url"
                 [(ngModel)]="crestUrl" name="crestUrl"
                 placeholder="https://example.com/escudos/ecuador.png">
          <span class="form-card__hint">URL pública de la imagen. Cuando esté presente, reemplaza el placeholder de bandera CSS en las pantallas. Acepta PNG/JPG/WebP/SVG.</span>
        </div>

        @if (error()) {
          <p class="form-card__hint" style="color: var(--color-lost);">{{ error() }}</p>
        }

        <div style="display: flex; gap: var(--space-md); flex-wrap: wrap; margin-top: var(--space-lg);">
          <button class="btn btn--primary" type="submit" [disabled]="saving()">
            {{ saving() ? 'Guardando…' : 'Guardar cambios' }}
          </button>
          <a class="btn btn--ghost" routerLink="/admin/teams">Cancelar</a>
        </div>
      </form>
    }
  `,
})
export class AdminTeamEditComponent implements OnInit {
  @Input() slug!: string;

  private api = inject(ApiService);
  private toast = inject(ToastService);
  private router = inject(Router);

  groupLetters = GROUP_LETTERS;

  loading = signal(true);
  saving = signal(false);
  notFound = signal(false);
  error = signal<string | null>(null);

  name = '';
  flagCode = '';
  groupLetter = '';
  crestUrl = '';

  flagPreviewClass = computed(() => `flag--${(this.flagCode || '').toLowerCase()}`);

  async ngOnInit() {
    try {
      const res = await apiClient.models.Team.get({ slug: this.slug });
      if (!res.data) {
        this.notFound.set(true);
        return;
      }
      this.name = res.data.name;
      this.flagCode = res.data.flagCode;
      this.groupLetter = res.data.groupLetter ?? '';
      this.crestUrl = res.data.crestUrl ?? '';
    } finally {
      this.loading.set(false);
    }
  }

  async save() {
    if (!this.name.trim() || !this.flagCode.trim()) {
      this.error.set('Nombre y flag code son obligatorios');
      return;
    }
    this.error.set(null);
    this.saving.set(true);
    try {
      await apiClient.models.Team.update({
        slug: this.slug,
        name: this.name.trim(),
        flagCode: this.flagCode.trim().toUpperCase(),
        groupLetter: this.groupLetter || null,
        crestUrl: this.crestUrl.trim() || null,
      });
      this.toast.success('Equipo actualizado');
      void this.router.navigate(['/admin/teams']);
    } catch (e) {
      this.error.set(humanizeError(e));
    } finally {
      this.saving.set(false);
    }
  }
}
