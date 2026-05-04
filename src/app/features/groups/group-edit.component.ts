import { Component, Input, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { ApiService } from '../../core/api/api.service';
import { AuthService } from '../../core/auth/auth.service';
import { ToastService } from '../../core/notifications/toast.service';
import { humanizeError } from '../../core/notifications/domain-errors';

interface GroupEdit {
  id: string;
  name: string;
  description: string | null;
  imageKey: string | null;
  adminUserId: string;
}

/**
 * Edición de grupo (admin only). Permite cambiar:
 *  · nombre
 *  · descripción (text libre, opcional)
 *  · imagen (storage key, opcional · upload via Amplify Storage)
 *
 * El modo (SIMPLE/COMPLETE), código de invitación y miembros NO se
 * pueden cambiar acá — eso requiere recreate o flows separados.
 */
@Component({
  standalone: true,
  selector: 'app-group-edit',
  imports: [FormsModule, RouterLink],
  template: `
    <header class="page-header">
      <div class="page-header__title">
        <small>
          <a [routerLink]="['/groups', id]" style="color:var(--color-primary-green);">
            ← Volver al grupo
          </a>
        </small>
        <h1>Editar grupo</h1>
      </div>
    </header>

    <main class="container-app">
      @if (loading()) {
        <p class="loading-msg">Cargando…</p>
      } @else if (!isAdmin()) {
        <p class="empty-state">
          Solo el admin del grupo puede editar estos datos.
          <a class="link-green" [routerLink]="['/groups', id]">← Volver</a>
        </p>
      } @else if (group()) {
        <form class="form-card" (ngSubmit)="save()">
          <h2 class="form-card__title">Datos del grupo</h2>
          <p class="form-card__lead">
            El modo de juego ({{ modeLabel() }}) es permanente y no se puede cambiar.
          </p>

          <div class="form-card__field">
            <label class="form-card__label" for="edit-name">Nombre</label>
            <input class="form-card__input" id="edit-name" name="name" type="text"
                   [(ngModel)]="name" required minlength="3" maxlength="40">
            <span class="form-card__hint">3-40 caracteres.</span>
          </div>

          <div class="form-card__field">
            <label class="form-card__label" for="edit-desc">Descripción</label>
            <textarea class="form-card__input" id="edit-desc" name="description"
                      [(ngModel)]="description" maxlength="500" rows="4"
                      placeholder="Reglas extra, premios, info del grupo…"></textarea>
            <span class="form-card__hint">Hasta 500 caracteres. Visible para todos los miembros.</span>
          </div>

          <!-- Imagen: input de Storage key. Upload directo se hace en
               otro componente (post-MVP); por ahora aceptamos la key
               manualmente para flexibilidad. -->
          <div class="form-card__field">
            <label class="form-card__label" for="edit-img">Imagen del grupo (URL/key)</label>
            <input class="form-card__input" id="edit-img" name="imageKey" type="text"
                   [(ngModel)]="imageKey" placeholder="groups/abc123/avatar.png">
            <span class="form-card__hint">
              Path de la imagen en Storage. (Upload directo desde el form viene en una próxima iteración.)
            </span>
          </div>

          @if (error()) {
            <p class="form-card__hint" style="color:var(--color-lost);">{{ error() }}</p>
          }

          <div style="display:flex;gap:8px;margin-top:14px;">
            <button class="btn btn--primary" type="submit" [disabled]="saving() || !dirty()">
              {{ saving() ? 'Guardando…' : 'Guardar cambios' }}
            </button>
            <a class="btn btn--ghost" [routerLink]="['/groups', id]">Cancelar</a>
          </div>
        </form>
      }
    </main>
  `,
})
export class GroupEditComponent implements OnInit {
  @Input() id!: string;

  private api = inject(ApiService);
  private auth = inject(AuthService);
  private router = inject(Router);
  private toast = inject(ToastService);

  group = signal<GroupEdit | null>(null);
  loading = signal(true);
  saving = signal(false);
  error = signal<string | null>(null);

  name = '';
  description = '';
  imageKey = '';
  private mode: 'SIMPLE' | 'COMPLETE' = 'COMPLETE';

  isAdmin = computed(() => {
    const g = this.group();
    return g?.adminUserId === (this.auth.user()?.sub ?? '');
  });

  modeLabel = computed(() => this.mode === 'COMPLETE' ? 'Completo' : 'Simple');

  /** Cualquier campo cambió respecto al valor cargado de DB. Habilita
   *  el botón Guardar solo cuando hay algo nuevo para mandar. */
  dirty = computed(() => {
    const g = this.group();
    if (!g) return false;
    return this.name.trim() !== g.name
      || this.description !== (g.description ?? '')
      || this.imageKey !== (g.imageKey ?? '');
  });

  async ngOnInit() {
    try {
      const res = await this.api.getGroup(this.id);
      const d = res.data;
      if (!d) {
        this.toast.error('Grupo no encontrado');
        void this.router.navigate(['/groups']);
        return;
      }
      this.mode = (d.mode ?? 'COMPLETE') as 'SIMPLE' | 'COMPLETE';
      this.group.set({
        id: d.id,
        name: d.name,
        description: (d as { description?: string | null }).description ?? null,
        imageKey: (d as { imageKey?: string | null }).imageKey ?? null,
        adminUserId: d.adminUserId,
      });
      this.name = d.name;
      this.description = (d as { description?: string | null }).description ?? '';
      this.imageKey = (d as { imageKey?: string | null }).imageKey ?? '';
    } finally {
      this.loading.set(false);
    }
  }

  async save() {
    if (!this.dirty() || !this.isAdmin()) return;
    this.saving.set(true);
    this.error.set(null);
    try {
      const res = await this.api.updateGroup({
        id: this.id,
        name: this.name.trim(),
        description: this.description.trim() || null,
        imageKey: this.imageKey.trim() || null,
      });
      if (res.errors && res.errors.length > 0) {
        const msg = res.errors[0]?.message ?? 'Error al guardar';
        this.error.set(humanizeError(new Error(msg)));
        return;
      }
      this.toast.success('Grupo actualizado');
      void this.router.navigate(['/groups', this.id]);
    } catch (e) {
      this.error.set(humanizeError(e));
    } finally {
      this.saving.set(false);
    }
  }
}
