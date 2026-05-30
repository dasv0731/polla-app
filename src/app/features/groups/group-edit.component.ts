import { Component, Input, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { uploadData, getUrl } from 'aws-amplify/storage';
import { ApiService } from '../../core/api/api.service';
import { AuthService } from '../../core/auth/auth.service';
import { ToastService } from '../../core/notifications/toast.service';
import { humanizeError } from '../../core/notifications/domain-errors';
import { IconComponent } from '../../shared/ui/icon/icon.component';
import { DirtyAware } from '../../shared/util/dirty-form.guard';

interface GroupEdit {
  id: string;
  name: string;
  description: string | null;
  imageKey: string | null;
  adminUserId: string;
  /** Comodines flag — read-only en edit, definido al crear el grupo.
   *  Null = legacy group (tratamos como ON: !== false). */
  comodinesEnabled: boolean | null;
  entryFeeEnabled: boolean | null;
  entryFeeInstructions: string | null;
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
  imports: [FormsModule, RouterLink, IconComponent],
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
            <div class="form-card__hint-row">
              <span class="form-card__hint">3-40 caracteres.</span>
              <span class="form-card__counter" [class.is-near-limit]="name.length >= 36">
                {{ name.length }}/40
              </span>
            </div>
          </div>

          <div class="form-card__field">
            <label class="form-card__label" for="edit-desc">Descripción</label>
            <!-- Markdown completo se difiere. Hoy preservamos line breaks
                 via white-space: pre-line en la surface que renderiza
                 (group-detail .group-hero__description). -->
            <textarea class="form-card__input" id="edit-desc" name="description"
                      [(ngModel)]="description" maxlength="500" rows="4"
                      placeholder="Reglas extra, premios, info del grupo… (saltos de línea se preservan)"></textarea>
            <div class="form-card__hint-row">
              <span class="form-card__hint">
                Hasta 500 caracteres. Visible para todos los miembros.
                Los saltos de línea se respetan.
              </span>
              <span class="form-card__counter" [class.is-near-limit]="description.length >= 450">
                {{ description.length }}/500
              </span>
            </div>
          </div>

          <!-- Imagen del grupo: drag/drop + click. Storage path
               groups/{groupId}/avatar.{ext}. Preview muestra signed URL.
               TODO(A6): progress real desde el upload op (Amplify expone
               un transferProgressCallback; hoy mostramos indeterminado). -->
          <div class="form-card__field">
            <label class="form-card__label" for="edit-image">Imagen del grupo</label>
            <div class="image-dropzone"
                 [class.is-dragging]="isDragging()"
                 [class.is-disabled]="uploading()"
                 (dragover)="onDragOver($event)"
                 (dragleave)="onDragLeave($event)"
                 (drop)="onDrop($event)">
              @if (previewUrl()) {
                <img [src]="previewUrl()" alt="Preview de la imagen del grupo"
                     class="image-dropzone__preview" />
                <div class="image-dropzone__actions">
                  <label class="btn btn--ghost btn--sm" for="edit-image">
                    Reemplazar
                  </label>
                  <button type="button" class="btn btn--ghost btn--sm btn--danger"
                          [disabled]="uploading()"
                          (click)="removeImage()">
                    <app-icon name="trash" size="sm" [decorative]="true" />
                    Eliminar imagen
                  </button>
                </div>
              } @else {
                <div class="image-dropzone__empty">
                  <app-icon name="plus" size="lg" [decorative]="true" />
                  <p class="image-dropzone__hint">
                    Arrastra una imagen aquí, o
                    <label for="edit-image" class="image-dropzone__cta">elegila desde tu dispositivo</label>.
                  </p>
                  <p class="image-dropzone__sub">JPG/PNG hasta 5 MB. Opcional.</p>
                </div>
              }
              <input id="edit-image" type="file" accept="image/*"
                     class="image-dropzone__input"
                     [disabled]="uploading()"
                     (change)="onFileSelected($event)">
              @if (uploading()) {
                <div class="image-dropzone__progress"
                     role="progressbar"
                     aria-label="Subiendo imagen"
                     [attr.aria-valuenow]="uploadProgress()"
                     aria-valuemin="0" aria-valuemax="100">
                  <div class="image-dropzone__bar" [style.width.%]="uploadProgress()"></div>
                  <span class="image-dropzone__progress-label">
                    Subiendo… {{ uploadProgress() }}%
                  </span>
                </div>
              }
            </div>
          </div>

          <div class="form-card__field" style="margin-top: 20px; padding-top: 20px; border-top: 1px solid var(--color-line);">
            <h2 class="form-card__title" style="margin-bottom: 8px;">Cuota de ingreso</h2>
            <label class="check-row">
              <input type="checkbox"
                     [checked]="entryFeeEnabled()"
                     (change)="entryFeeEnabled.set($any($event.target).checked)">
              <span>
                <strong>Cobrar cuota de ingreso al grupo</strong><br>
                <small style="color: var(--color-text-muted);">
                  Si la activás, los miembros sin pagar verán un recordatorio en la pantalla del grupo.
                </small>
              </span>
            </label>

            @if (entryFeeEnabled()) {
              <div class="form-card__field" style="margin-top: 12px;">
                <label class="form-card__label" for="edit-entry-fee">Instrucciones de pago</label>
                <textarea id="edit-entry-fee" name="entryFeeInstructions"
                          class="form-card__input"
                          rows="4"
                          maxlength="500"
                          [(ngModel)]="entryFeeInstructions"
                          placeholder="Ej: Depositar $20 USD a la cuenta XXXXXX y enviar el comprobante por WhatsApp a +593 XXX-XXXX."></textarea>
                <div class="form-card__hint-row">
                  <span class="form-card__hint">Hasta 500 caracteres. Los saltos de línea se respetan.</span>
                  <span class="form-card__counter"
                        [class.is-near-limit]="entryFeeInstructions.length >= 450">
                    {{ entryFeeInstructions.length }}/500
                  </span>
                </div>
                @if (entryFeeError(); as err) {
                  <p class="modal-error" role="alert" style="margin-top: 8px;">{{ err }}</p>
                }
              </div>
            }
          </div>

          @if (group()?.adminUserId && modeIsComplete()) {
            <div class="form-card__field">
              <label class="form-card__label">Comodines</label>
              <div>
                @if (group()!.comodinesEnabled !== false) {
                  <span class="pill pill--green">
                    <app-icon name="dice" size="sm" [decorative]="true" />
                    Activados
                  </span>
                } @else {
                  <span class="pill pill--grey">
                    <app-icon name="dice" size="sm" [decorative]="true" />
                    Desactivados
                  </span>
                }
                <p class="text-mute" style="font-size:11px;margin-top:6px;color:var(--color-text-muted);">
                  Esta configuración se eligió al crear el grupo y no se puede modificar.
                </p>
              </div>
            </div>
          }

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
  styles: [`
    .form-card__hint-row {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      gap: 12px;
      margin-top: 4px;
    }
    .form-card__counter {
      font-size: 11px;
      color: var(--color-text-muted, var(--wf-ink-3));
      font-variant-numeric: tabular-nums;
      flex-shrink: 0;
    }
    .form-card__counter.is-near-limit {
      color: var(--color-warn, #c97a00);
      font-weight: 600;
    }

    /* Image dropzone: zona única para drag/drop + click para elegir.
       Si ya hay imagen muestra preview + acciones (reemplazar / eliminar). */
    .image-dropzone {
      position: relative;
      border: 2px dashed var(--wf-line, #d4d4d8);
      border-radius: 12px;
      padding: 16px;
      transition: border-color .15s, background .15s;
      background: var(--wf-paper, #fff);
    }
    .image-dropzone.is-dragging {
      border-color: var(--color-primary-green, #00c864);
      background: rgba(0, 200, 100, 0.06);
    }
    .image-dropzone.is-disabled { opacity: 0.7; pointer-events: none; }
    .image-dropzone__input {
      position: absolute;
      width: 0.1px; height: 0.1px;
      opacity: 0;
      overflow: hidden;
      z-index: -1;
    }
    .image-dropzone__preview {
      width: 120px;
      height: 120px;
      object-fit: cover;
      border-radius: 10px;
      display: block;
      margin: 0 auto 12px;
      border: 1px solid var(--wf-line);
    }
    .image-dropzone__actions {
      display: flex;
      gap: 8px;
      justify-content: center;
      flex-wrap: wrap;
    }
    .image-dropzone__empty {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 6px;
      padding: 16px 0;
      color: var(--wf-ink-3);
    }
    .image-dropzone__hint { margin: 0; font-size: 13px; text-align: center; }
    .image-dropzone__sub { margin: 0; font-size: 11px; opacity: 0.85; }
    .image-dropzone__cta {
      color: var(--color-primary-green, #00c864);
      text-decoration: underline;
      cursor: pointer;
    }
    .image-dropzone__progress {
      position: relative;
      margin-top: 12px;
      height: 8px;
      background: rgba(0,0,0,0.08);
      border-radius: 4px;
      overflow: hidden;
    }
    .image-dropzone__bar {
      height: 100%;
      background: var(--color-primary-green, #00c864);
      transition: width 0.2s ease;
    }
    .image-dropzone__progress-label {
      display: block;
      margin-top: 6px;
      font-size: 11px;
      color: var(--wf-ink-3);
      text-align: center;
    }

    /* Entry-fee block — mirrored from group-actions-modals (Task 7) so
       the toggle row + inline error read the same in both screens. */
    .check-row {
      display: flex;
      align-items: flex-start;
      gap: 10px;
      padding: 12px;
      border: 1px solid var(--color-line);
      border-radius: 10px;
      cursor: pointer;
      transition: border-color .15s, background .15s;
    }
    .check-row:hover { border-color: rgba(2, 204, 116, 0.5); }
    .check-row input[type="checkbox"] {
      margin: 3px 0 0;
      accent-color: var(--color-primary-green);
      flex-shrink: 0;
      width: 18px;
      height: 18px;
    }
    .modal-error {
      font-size: 12px;
      color: #dc2626;
      padding: 8px 12px;
      background: rgba(220, 38, 38, 0.08);
      border-radius: 6px;
      border: 1px solid rgba(220, 38, 38, 0.2);
      margin: 0;
    }
  `],
})
export class GroupEditComponent implements OnInit, DirtyAware {
  @Input() id!: string;

  private api = inject(ApiService);
  private auth = inject(AuthService);
  private router = inject(Router);
  private toast = inject(ToastService);

  group = signal<GroupEdit | null>(null);
  loading = signal(true);
  saving = signal(false);
  uploading = signal(false);
  /** 0-100. Amplify expone transferProgressCallback con `transferredBytes /
   *  totalBytes`; mapeamos a porcentaje. Si no llegan eventos, deja 0
   *  como indeterminate hasta que sube algo. */
  uploadProgress = signal(0);
  isDragging = signal(false);
  error = signal<string | null>(null);
  previewUrl = signal<string | null>(null);

  name = '';
  description = '';
  /** Signal — `dirty` computed la lee. Si esto fuera plain field, el set
   *  programático en `onFileSelected` no dispararía recomputo del computed,
   *  y el botón "Guardar cambios" quedaría deshabilitado tras el upload. */
  imageKey = signal('');
  /** Entry-fee toggle. Signal (not plain field) so `dirty` computed
   *  re-evaluates when it changes — same reason as `imageKey`. */
  entryFeeEnabled = signal(false);
  /** Free-text instructions. Plain field — ngModel two-way binding from
   *  the textarea matches the pattern of `description`. The `dirty`
   *  computed re-evaluates because `entryFeeEnabled` (signal) typically
   *  changes alongside, but we still read it via plain reference. */
  entryFeeInstructions = '';
  /** Inline validation error for the entry-fee textarea (e.g. empty
   *  when toggle is on). Cleared at the start of every save(). */
  entryFeeError = signal<string | null>(null);
  private mode: 'SIMPLE' | 'COMPLETE' = 'COMPLETE';

  isAdmin = computed(() => {
    const g = this.group();
    return g?.adminUserId === (this.auth.user()?.sub ?? '');
  });

  modeLabel = computed(() => this.mode === 'COMPLETE' ? 'Completo' : 'Simple');
  /** Template helper — el field `mode` es privado y los templates Angular
   *  no pueden leer privates en strict mode. */
  modeIsComplete = computed(() => this.mode === 'COMPLETE');

  /** Cualquier campo cambió respecto al valor cargado de DB. Habilita
   *  el botón Guardar solo cuando hay algo nuevo para mandar. */
  dirty = computed(() => {
    const g = this.group();
    if (!g) return false;
    // imageKey es signal; la lectura `this.imageKey()` registra dependencia.
    return this.name.trim() !== g.name
      || this.description !== (g.description ?? '')
      || this.imageKey() !== (g.imageKey ?? '')
      || this.entryFeeEnabled() !== (g.entryFeeEnabled === true)
      || this.entryFeeInstructions !== (g.entryFeeInstructions ?? '');
  });

  /** DirtyAware contract — usado por `dirtyFormGuard` para confirmar
   *  antes de navegar si quedan cambios sin guardar. */
  isDirty(): boolean { return this.dirty(); }

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
      // comodinesEnabled cast — schema todavía no deployado en sandbox.
      // Task 5 regenera schema.d.ts y este cast deja de ser necesario.
      const comodinesEnabled =
        (d as { comodinesEnabled?: boolean | null }).comodinesEnabled ?? null;
      const entryFeeEnabled =
        (d as { entryFeeEnabled?: boolean | null }).entryFeeEnabled ?? null;
      const entryFeeInstructions =
        (d as { entryFeeInstructions?: string | null }).entryFeeInstructions ?? null;
      this.group.set({
        id: d.id,
        name: d.name,
        description: (d as { description?: string | null }).description ?? null,
        imageKey: (d as { imageKey?: string | null }).imageKey ?? null,
        adminUserId: d.adminUserId,
        comodinesEnabled,
        entryFeeEnabled,
        entryFeeInstructions,
      });
      this.name = d.name;
      this.description = (d as { description?: string | null }).description ?? '';
      const initialKey = (d as { imageKey?: string | null }).imageKey ?? '';
      this.imageKey.set(initialKey);
      this.entryFeeEnabled.set(entryFeeEnabled === true);
      this.entryFeeInstructions = entryFeeInstructions ?? '';
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

  /** File picker handler: extrae el File y delega a uploadFile. */
  async onFileSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (file) await this.uploadFile(file);
    input.value = '';
  }

  onDragOver(event: DragEvent): void {
    event.preventDefault();
    if (this.uploading()) return;
    this.isDragging.set(true);
  }

  onDragLeave(event: DragEvent): void {
    event.preventDefault();
    this.isDragging.set(false);
  }

  async onDrop(event: DragEvent): Promise<void> {
    event.preventDefault();
    this.isDragging.set(false);
    if (this.uploading()) return;
    const file = event.dataTransfer?.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      this.toast.error('El archivo debe ser una imagen');
      return;
    }
    await this.uploadFile(file);
  }

  /** Sube `file` a Storage. La key se guarda en `imageKey` pero la
   *  mutación updateGroup ocurre cuando el user da click en Guardar. */
  private async uploadFile(file: File): Promise<void> {
    if (file.size > 5 * 1024 * 1024) {
      this.toast.error('La imagen excede 5 MB');
      return;
    }
    this.uploading.set(true);
    this.uploadProgress.set(0);
    try {
      const ext = file.name.split('.').pop()?.toLowerCase() ?? 'png';
      const key = `groups/${this.id}/avatar-${Date.now()}.${ext}`;
      const op = uploadData({
        path: key,
        data: file,
        options: {
          contentType: file.type || 'image/png',
          onProgress: ({ transferredBytes, totalBytes }) => {
            if (totalBytes && totalBytes > 0) {
              this.uploadProgress.set(
                Math.min(100, Math.round((transferredBytes / totalBytes) * 100)),
              );
            }
          },
        },
      });
      await op.result;
      this.uploadProgress.set(100);
      this.imageKey.set(key);
      const out = await getUrl({ path: key, options: { expiresIn: 3600 } });
      this.previewUrl.set(out.url.toString());
      this.toast.success('Imagen subida — guarda los cambios para aplicar');
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('[group-edit upload] failed', e);
      this.toast.error('No se pudo subir la imagen');
    } finally {
      this.uploading.set(false);
    }
  }

  /** Marca la imagen para eliminar. La mutación efectiva sucede en save()
   *  con imageKey=null. Mantenemos UI inmediata (preview vacío). */
  removeImage(): void {
    this.imageKey.set('');
    this.previewUrl.set(null);
    this.uploadProgress.set(0);
  }

  async save() {
    if (!this.dirty() || !this.isAdmin()) return;
    this.error.set(null);
    this.entryFeeError.set(null);

    // Entry-fee validation, mirroring the handler rules. Run BEFORE
    // setting `saving` so the disabled button doesn't flicker on the
    // common case of someone forgetting the instructions text.
    let feeInstructionsForPayload: string | null = null;
    if (this.entryFeeEnabled()) {
      const trimmed = this.entryFeeInstructions.trim();
      if (trimmed.length === 0) {
        this.entryFeeError.set('Las instrucciones son obligatorias si activás la cuota.');
        return;
      }
      if (trimmed.length > 500) {
        this.entryFeeError.set('Las instrucciones no pueden superar los 500 caracteres.');
        return;
      }
      feeInstructionsForPayload = trimmed;
    }

    this.saving.set(true);
    try {
      const res = await this.api.updateGroup({
        id: this.id,
        name: this.name.trim(),
        description: this.description.trim() || null,
        imageKey: this.imageKey().trim() || null,
        entryFeeEnabled: this.entryFeeEnabled(),
        entryFeeInstructions: feeInstructionsForPayload,
      });
      if (res.errors && res.errors.length > 0) {
        const msg = res.errors[0]?.message ?? 'Error al guardar';
        this.error.set(humanizeError(new Error(msg)));
        return;
      }

      // Detect OFF → ON transition and auto-pay the admin via
      // markEntryFeePaid. Server-side auth on Membership doesn't allow
      // direct admin writes from the client; the mutation validates
      // adminUserId server-side and updates the admin's Membership row.
      const prev = this.group();
      const wasOff = !(prev?.entryFeeEnabled === true);
      const isOn = this.entryFeeEnabled() === true;
      if (wasOff && isOn) {
        const me = this.auth.user()?.sub;
        if (me) {
          await this.api.markEntryFeePaid({ groupId: this.id, userId: me, paid: true });
        }
      }

      this.toast.success('Grupo actualizado');
      // Tras save exitoso forzamos el snapshot al estado nuevo para que
      // el guard CanDeactivate no pida confirmación en la navegación
      // siguiente. Sin esto, `dirty()` queda true hasta que el siguiente
      // ngOnChanges/ngOnInit reescriba `group()`.
      this.group.set({
        ...this.group()!,
        name: this.name.trim(),
        description: this.description.trim() || null,
        imageKey: this.imageKey().trim() || null,
        entryFeeEnabled: this.entryFeeEnabled(),
        entryFeeInstructions: feeInstructionsForPayload,
      });
      void this.router.navigate(['/groups', this.id]);
    } catch (e) {
      this.error.set(humanizeError(e));
    } finally {
      this.saving.set(false);
    }
  }
}
