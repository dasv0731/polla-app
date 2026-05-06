import { Component, Input, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { uploadData, getUrl } from 'aws-amplify/storage';
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

          <!-- Imagen del grupo: upload desde dispositivo. Storage path
               groups/{groupId}/avatar.{ext}. Preview muestra signed URL. -->
          <div class="form-card__field">
            <label class="form-card__label">Imagen del grupo</label>
            @if (previewUrl()) {
              <img [src]="previewUrl()" alt="Preview"
                   style="width:120px;height:120px;object-fit:cover;border-radius:10px;border:1px solid var(--wf-line);display:block;margin-bottom:8px;">
            }
            <input type="file" accept="image/*"
                   [disabled]="uploading()"
                   (change)="onFileSelected($event)">
            <span class="form-card__hint">
              {{ uploading() ? 'Subiendo…' : (imageKey() ? 'Imagen cargada · podés cambiarla' : 'Imagen opcional · JPG/PNG hasta 5 MB') }}
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
  uploading = signal(false);
  error = signal<string | null>(null);
  previewUrl = signal<string | null>(null);

  name = '';
  description = '';
  /** Signal — `dirty` computed la lee. Si esto fuera plain field, el set
   *  programático en `onFileSelected` no dispararía recomputo del computed,
   *  y el botón "Guardar cambios" quedaría deshabilitado tras el upload. */
  imageKey = signal('');
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
    // imageKey es signal; la lectura `this.imageKey()` registra dependencia.
    return this.name.trim() !== g.name
      || this.description !== (g.description ?? '')
      || this.imageKey() !== (g.imageKey ?? '');
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
      const initialKey = (d as { imageKey?: string | null }).imageKey ?? '';
      this.imageKey.set(initialKey);
      // Si ya hay imagen, resolver signed URL para preview.
      if (initialKey) {
        try {
          const out = await getUrl({ path: initialKey, options: { expiresIn: 3600 } });
          this.previewUrl.set(out.url.toString());
        } catch {
          /* ignore — preview es best-effort */
        }
      }
    } finally {
      this.loading.set(false);
    }
  }

  /** File picker handler: sube la imagen a Storage y guarda la key.
   *  La key se persiste cuando el user haga click en "Guardar cambios". */
  async onFileSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      this.toast.error('La imagen excede 5 MB');
      input.value = '';
      return;
    }
    this.uploading.set(true);
    try {
      const ext = file.name.split('.').pop()?.toLowerCase() ?? 'png';
      const key = `groups/${this.id}/avatar-${Date.now()}.${ext}`;
      const op = uploadData({
        path: key,
        data: file,
        options: { contentType: file.type || 'image/png' },
      });
      await op.result;
      this.imageKey.set(key);
      const out = await getUrl({ path: key, options: { expiresIn: 3600 } });
      this.previewUrl.set(out.url.toString());
      this.toast.success('Imagen subida — guardá los cambios para aplicar');
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('[group-edit upload] failed', e);
      this.toast.error('No se pudo subir la imagen');
    } finally {
      this.uploading.set(false);
      input.value = '';
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
        imageKey: this.imageKey().trim() || null,
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
