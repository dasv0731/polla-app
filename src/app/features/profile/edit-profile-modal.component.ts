import { Component, EventEmitter, Input, OnInit, Output, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { uploadData } from 'aws-amplify/storage';
import { AuthService } from '../../core/auth/auth.service';
import { ApiService } from '../../core/api/api.service';
import { ToastService } from '../../core/notifications/toast.service';
import { ConfirmDialogService } from '../../shared/ui/confirm-dialog.service';
import { ModalComponent } from '../../shared/ui/modal/modal.component';
import { UserAvatarComponent } from '../../shared/user-avatar/user-avatar.component';
import { IconComponent } from '../../shared/ui/icon/icon.component';
import { PasswordRulesListComponent } from '../../shared/ui/password-rules-list.component';
import { COUNTRY_OPTIONS, flagFromCountryCode } from '../../shared/util/countries';

/**
 * Modal "Editar perfil". Tres secciones:
 *   1. Avatar — drag&drop / file picker / preview / progress / eliminar.
 *      Usa Storage path users/{sub}/avatar-*.
 *   2. Nombre / handle — read-only (no se puede cambiar después del registro).
 *   3. País + Bio — guardado manual con dirty signal.
 *   4. Cambiar contraseña — flow Cognito vía AuthService.changePassword,
 *      con toggle eye en los 3 fields + PasswordRulesListComponent.
 *
 * A2: consume `<app-modal>` shared.
 * A10: cierra anclas críticas del doc 26 (drag&drop avatar, progress,
 *      eliminar foto, toggle eye, password rules list, dirty-close confirm,
 *      tono "sobre ti").
 */
@Component({
  standalone: true,
  selector: 'app-edit-profile-modal',
  imports: [
    FormsModule,
    UserAvatarComponent,
    ModalComponent,
    IconComponent,
    PasswordRulesListComponent,
  ],
  template: `
    <app-modal
      [open]="true"
      title="Editar perfil"
      size="md"
      (close)="onCloseAttempt()">
      <div slot="body" class="ep-body">
        <section class="ep-section">
          <h3 class="ep-section__title">Foto de perfil</h3>
          <div class="ep-avatar-row">
            <app-user-avatar
              [sub]="user()?.sub ?? ''"
              [handle]="user()?.handle ?? ''"
              [avatarKey]="effectiveAvatarKey()"
              size="lg" />
            <div class="ep-avatar-controls">
              <div class="ep-dropzone"
                   [class.is-dragging]="isDragging()"
                   [class.is-disabled]="uploadingAvatar()"
                   (dragover)="onDragOver($event)"
                   (dragleave)="onDragLeave($event)"
                   (drop)="onDrop($event)">
                @if (previewUrl()) {
                  <img [src]="previewUrl()" alt="Vista previa"
                       class="ep-dropzone__preview" />
                }
                <div class="ep-dropzone__hint">
                  <app-icon name="plus" size="md" />
                  <p>
                    Arrastra una imagen aquí, o
                    <label for="ep-avatar-input" class="ep-dropzone__cta">elígela desde tu dispositivo</label>.
                  </p>
                  <p class="ep-dropzone__sub">JPG/PNG, hasta 5 MB.</p>
                </div>
                <input type="file" accept="image/jpeg,image/png,image/webp"
                       id="ep-avatar-input"
                       class="ep-dropzone__input"
                       [disabled]="uploadingAvatar()"
                       (change)="onFileSelected($event)">
                @if (uploadingAvatar()) {
                  <div class="ep-dropzone__progress"
                       role="progressbar"
                       aria-label="Subiendo imagen"
                       [attr.aria-valuenow]="uploadProgress()"
                       aria-valuemin="0" aria-valuemax="100">
                    <div class="ep-dropzone__bar" [style.width.%]="uploadProgress()"></div>
                    <span class="ep-dropzone__progress-label">
                      Subiendo… {{ uploadProgress() }}%
                    </span>
                  </div>
                }
              </div>
              @if (hasAvatar() && !uploadingAvatar()) {
                <button type="button" class="btn-wf btn-wf--sm ep-remove-btn"
                        (click)="requestRemoveAvatar()">
                  <app-icon name="trash" size="sm" />
                  Eliminar foto
                </button>
              }
            </div>
          </div>
        </section>

        <section class="ep-section">
          <h3 class="ep-section__title">Nombre de usuario</h3>
          <div class="ep-readonly">
            <strong>{{ '@' + (user()?.handle ?? '') }}</strong>
            <p class="ep-hint">El nombre de usuario no se puede cambiar.</p>
          </div>
        </section>

        <section class="ep-section">
          <h3 class="ep-section__title">País</h3>
          <div class="ep-field">
            <select [(ngModel)]="country" (ngModelChange)="markDirty()">
              <option value="">— Sin país —</option>
              @for (c of countryOptions; track c.code) {
                <option [value]="c.code">{{ flagFor(c.code) }} {{ c.name }}</option>
              }
            </select>
            <p class="ep-hint">Aparece como bandera al lado de tu nombre en el ranking.</p>
          </div>
        </section>

        <section class="ep-section">
          <h3 class="ep-section__title">Bio</h3>
          <div class="ep-field">
            <textarea [(ngModel)]="bio" (ngModelChange)="markDirty()" maxlength="200"
                      rows="3" placeholder="Una frase corta sobre ti (max 200)"></textarea>
            <p class="ep-hint">{{ bio.length }} / 200</p>
          </div>
        </section>

        @if (profileDirty()) {
          <div class="ep-section ep-section--save">
            @if (profileError()) {
              <p class="ep-err">{{ profileError() }}</p>
            }
            <button type="button" class="btn-wf btn-wf--sm btn-wf--primary"
                    [disabled]="savingProfile()"
                    (click)="saveProfile()">
              {{ savingProfile() ? 'Guardando…' : 'Guardar cambios' }}
            </button>
          </div>
        }

        <section class="ep-section">
          <h3 class="ep-section__title">Cambiar contraseña</h3>
          @if (!showPwdForm()) {
            <button type="button" class="btn-wf btn-wf--sm"
                    (click)="showPwdForm.set(true)">
              Cambiar contraseña
            </button>
          } @else {
            <div class="ep-pwd-form">
              <label class="ep-field">
                <span>Contraseña actual</span>
                <div class="ep-pwd-wrap">
                  <input [type]="showPwdOld() ? 'text' : 'password'"
                         name="ep-pwd-old" [(ngModel)]="pwdOld"
                         autocomplete="current-password" spellcheck="false" autocapitalize="off">
                  <button type="button" class="ep-pwd-toggle"
                          (click)="showPwdOld.set(!showPwdOld())"
                          [attr.aria-label]="showPwdOld() ? 'Ocultar contraseña' : 'Mostrar contraseña'">
                    <app-icon [name]="showPwdOld() ? 'eye-off' : 'eye'" size="md" />
                  </button>
                </div>
              </label>
              <label class="ep-field">
                <span>Nueva contraseña</span>
                <div class="ep-pwd-wrap">
                  <input [type]="showPwdNew() ? 'text' : 'password'"
                         name="ep-pwd-new" [(ngModel)]="pwdNew"
                         autocomplete="new-password" spellcheck="false" autocapitalize="off"
                         minlength="8">
                  <button type="button" class="ep-pwd-toggle"
                          (click)="showPwdNew.set(!showPwdNew())"
                          [attr.aria-label]="showPwdNew() ? 'Ocultar contraseña' : 'Mostrar contraseña'">
                    <app-icon [name]="showPwdNew() ? 'eye-off' : 'eye'" size="md" />
                  </button>
                </div>
                <app-password-rules-list [password]="pwdNew" />
              </label>
              <label class="ep-field">
                <span>Repetir nueva contraseña</span>
                <div class="ep-pwd-wrap">
                  <input [type]="showPwdConfirm() ? 'text' : 'password'"
                         name="ep-pwd-confirm" [(ngModel)]="pwdConfirm"
                         autocomplete="new-password" spellcheck="false" autocapitalize="off"
                         minlength="8">
                  <button type="button" class="ep-pwd-toggle"
                          (click)="showPwdConfirm.set(!showPwdConfirm())"
                          [attr.aria-label]="showPwdConfirm() ? 'Ocultar contraseña' : 'Mostrar contraseña'">
                    <app-icon [name]="showPwdConfirm() ? 'eye-off' : 'eye'" size="md" />
                  </button>
                </div>
              </label>
              @if (pwdError()) {
                <p class="ep-err" role="alert">{{ pwdError() }}</p>
              }
              <div class="ep-pwd-actions">
                <button type="button" class="btn-wf btn-wf--sm"
                        (click)="cancelPwd()">Cancelar</button>
                <button type="button" class="btn-wf btn-wf--sm btn-wf--primary"
                        [disabled]="!canSubmitPwd() || changingPwd()"
                        (click)="submitPwd()">
                  {{ changingPwd() ? 'Cambiando…' : 'Cambiar contraseña' }}
                </button>
              </div>
            </div>
          }
        </section>

      </div>
      <div slot="footer">
        <button type="button" class="btn-wf" (click)="onCloseAttempt()">Cerrar</button>
      </div>
    </app-modal>
  `,
  styles: [`
    :host { display: contents; }

    .ep-body {
      display: flex;
      flex-direction: column;
    }
    .ep-section {
      padding: 16px 0;
      border-bottom: 1px solid var(--wf-line);
    }
    .ep-section:last-of-type { border-bottom: 0; }
    .ep-section__title {
      margin: 0 0 12px;
      font-size: 11px; letter-spacing: 0.08em;
      text-transform: uppercase;
      color: var(--wf-ink-3);
    }
    .ep-avatar-row {
      display: flex; gap: 16px; align-items: flex-start;
    }
    .ep-avatar-controls { flex: 1; display: flex; flex-direction: column; gap: 8px; }
    .ep-hint {
      font-size: 12px;
      color: var(--wf-ink-3);
      margin: 6px 0 0;
    }
    .ep-readonly strong {
      font-family: var(--wf-display);
      font-size: 16px;
    }

    /* Drag&drop zone */
    .ep-dropzone {
      position: relative;
      border: 2px dashed var(--wf-line, #d4d4d8);
      border-radius: 12px;
      padding: 12px;
      transition: border-color .15s, background .15s;
      background: var(--wf-paper, #fff);
    }
    .ep-dropzone.is-dragging {
      border-color: var(--color-primary-green, #00c864);
      background: rgba(0, 200, 100, 0.06);
    }
    .ep-dropzone.is-disabled { opacity: 0.7; pointer-events: none; }
    .ep-dropzone__input {
      position: absolute;
      width: 0.1px; height: 0.1px;
      opacity: 0;
      overflow: hidden;
      z-index: -1;
    }
    .ep-dropzone__preview {
      width: 80px;
      height: 80px;
      object-fit: cover;
      border-radius: 8px;
      display: block;
      margin: 0 auto 8px;
      border: 1px solid var(--wf-line);
    }
    .ep-dropzone__hint {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 4px;
      color: var(--wf-ink-3);
    }
    .ep-dropzone__hint p { margin: 0; font-size: 12px; text-align: center; }
    .ep-dropzone__sub { font-size: 11px; opacity: 0.85; }
    .ep-dropzone__cta {
      color: var(--color-primary-green, #00c864);
      text-decoration: underline;
      cursor: pointer;
    }
    .ep-dropzone__progress {
      position: relative;
      margin-top: 10px;
      height: 8px;
      background: rgba(0,0,0,0.08);
      border-radius: 4px;
      overflow: hidden;
    }
    .ep-dropzone__bar {
      height: 100%;
      background: var(--color-primary-green, #00c864);
      transition: width 0.2s ease;
    }
    .ep-dropzone__progress-label {
      display: block;
      margin-top: 6px;
      font-size: 11px;
      color: var(--wf-ink-3);
      text-align: center;
    }
    .ep-remove-btn {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      align-self: flex-start;
    }

    .ep-pwd-form {
      display: flex; flex-direction: column; gap: 10px;
    }
    .ep-field {
      display: flex; flex-direction: column; gap: 4px;
    }
    .ep-field span {
      font-size: 11px; letter-spacing: 0.08em;
      text-transform: uppercase;
      color: var(--wf-ink-3);
    }
    .ep-field input,
    .ep-field select,
    .ep-field textarea {
      padding: 8px 10px;
      border: 1px solid var(--wf-line);
      border-radius: 6px;
      font-size: 14px;
      font-family: inherit;
      width: 100%;
      box-sizing: border-box;
      resize: vertical;
    }
    /* Password input wrap + eye toggle */
    .ep-pwd-wrap { position: relative; }
    .ep-pwd-wrap input { padding-right: 42px; }
    .ep-pwd-toggle {
      position: absolute;
      right: 6px;
      top: 50%;
      transform: translateY(-50%);
      background: transparent;
      border: 0;
      cursor: pointer;
      padding: 6px 8px;
      line-height: 1;
      color: var(--wf-ink-3);
    }
    .ep-pwd-toggle:hover { color: var(--wf-ink); }
    .ep-pwd-toggle:focus-visible {
      outline: 2px solid var(--color-primary-green);
      outline-offset: 2px;
      border-radius: 4px;
      color: var(--wf-ink);
    }

    .ep-section--save {
      display: flex;
      flex-direction: column;
      gap: 8px;
      align-items: stretch;
    }
    .ep-pwd-actions {
      display: flex; gap: 8px; justify-content: flex-end;
      margin-top: 4px;
    }
    .ep-err {
      color: var(--color-lost, #c0392b);
      font-size: 13px; margin: 0;
    }
  `],
})
export class EditProfileModalComponent implements OnInit {
  private auth = inject(AuthService);
  private api = inject(ApiService);
  private toast = inject(ToastService);
  private confirmDialog = inject(ConfirmDialogService);

  @Output() closed = new EventEmitter<void>();
  /** Si se setea a 'password', el modal abre con el form de cambio de
   *  contraseña ya expandido (sin requerir click adicional al user). */
  @Input() initialSection: 'password' | null = null;

  user = computed(() => this.auth.user());
  uploadingAvatar = signal(false);
  uploadProgress = signal(0);
  isDragging = signal(false);
  /** Local URL para preview optimista antes/durante upload. */
  previewUrl = signal<string | null>(null);
  /** Avatar key recién subido (pending hasta refreshAvatarKey). */
  pendingAvatarKey = signal<string | null>(null);
  /** Si el user pidió eliminar la foto, sobreescribe el key efectivo a null. */
  avatarRemoved = signal(false);

  /** Avatar key efectivo considerando: removed > pending > user actual. */
  effectiveAvatarKey = computed(() => {
    if (this.avatarRemoved()) return null;
    return this.pendingAvatarKey() ?? this.user()?.avatarKey ?? null;
  });

  /** Hay foto guardada o pendiente (para mostrar "Eliminar foto"). */
  hasAvatar = computed(() => this.effectiveAvatarKey() !== null);

  // Country + bio editing state
  country = '';
  bio = '';
  profileDirty = signal(false);
  savingProfile = signal(false);
  profileError = signal<string | null>(null);

  // Lista de países y helper de bandera (re-exportados al template).
  readonly countryOptions = COUNTRY_OPTIONS;
  flagFor = (code: string) => flagFromCountryCode(code);

  showPwdForm = signal(false);
  pwdOld = '';
  pwdNew = '';
  pwdConfirm = '';
  pwdError = signal<string | null>(null);
  changingPwd = signal(false);
  // Toggle eye state (independiente por field).
  showPwdOld = signal(false);
  showPwdNew = signal(false);
  showPwdConfirm = signal(false);

  canSubmitPwd = computed(() =>
    this.pwdOld.length >= 1 && this.pwdNew.length >= 8 && this.pwdNew === this.pwdConfirm,
  );

  /** Hay cambios sin guardar en cualquier sección (avatar pending,
   *  removed, country/bio dirty, o algún password field con texto). */
  dirty = computed(() =>
    this.profileDirty() ||
    this.avatarRemoved() ||
    this.pendingAvatarKey() !== null ||
    this.pwdOld.length > 0 ||
    this.pwdNew.length > 0 ||
    this.pwdConfirm.length > 0,
  );

  ngOnInit() {
    const u = this.user();
    this.country = u?.country ?? '';
    this.bio = u?.bio ?? '';
    if (this.initialSection === 'password') {
      this.showPwdForm.set(true);
    }
  }

  markDirty() {
    this.profileDirty.set(true);
    this.profileError.set(null);
  }

  async saveProfile() {
    const u = this.user();
    if (!u) return;
    if (this.bio.length > 200) {
      this.profileError.set('La bio no puede superar 200 caracteres.');
      return;
    }
    this.savingProfile.set(true);
    try {
      const res = await this.api.updateUser({
        sub: u.sub,
        country: this.country.trim() || null,
        bio: this.bio.trim() || null,
      });
      if (res?.errors && res.errors.length > 0) {
        this.profileError.set(res.errors[0]?.message ?? 'No se pudo guardar');
        return;
      }
      await this.auth.refreshProfileFields();
      this.profileDirty.set(false);
      this.toast.success('Perfil actualizado');
    } catch (e) {
      this.profileError.set((e as { message?: string })?.message ?? 'No se pudo guardar');
    } finally {
      this.savingProfile.set(false);
    }
  }

  /** Intento de cerrar el modal. Si hay cambios sin guardar pide
   *  confirmación; si no, cierra directo. Conectado a backdrop, Escape,
   *  ✕ del shell, y "Cerrar" del footer. */
  async onCloseAttempt() {
    if (this.dirty()) {
      const ok = await this.confirmDialog.ask({
        title: 'Cambios sin guardar',
        message: 'Tus cambios se perderán si cierras sin guardar.',
        confirmLabel: 'Cerrar sin guardar',
        cancelLabel: 'Continuar editando',
        danger: true,
      });
      if (!ok) return;
    }
    this.closed.emit();
  }

  // Drag & drop handlers
  onDragOver(event: DragEvent): void {
    event.preventDefault();
    if (this.uploadingAvatar()) return;
    this.isDragging.set(true);
  }
  onDragLeave(event: DragEvent): void {
    event.preventDefault();
    this.isDragging.set(false);
  }
  async onDrop(event: DragEvent): Promise<void> {
    event.preventDefault();
    this.isDragging.set(false);
    if (this.uploadingAvatar()) return;
    const file = event.dataTransfer?.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      this.toast.error('El archivo debe ser una imagen');
      return;
    }
    await this.uploadAvatarFile(file);
  }

  async onFileSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (file) await this.uploadAvatarFile(file);
    input.value = '';
  }

  /** Sube el archivo a S3 + persiste avatarKey en User model. Muestra
   *  preview local instantáneo via URL.createObjectURL y mantiene una
   *  barra de progreso vía Amplify onProgress. */
  private async uploadAvatarFile(file: File): Promise<void> {
    const u = this.user();
    if (!u) return;
    if (file.size > 5 * 1024 * 1024) {
      this.toast.error('La imagen excede 5 MB');
      return;
    }
    // Preview optimista inmediato.
    try {
      const objectUrl = URL.createObjectURL(file);
      const prev = this.previewUrl();
      if (prev) URL.revokeObjectURL(prev);
      this.previewUrl.set(objectUrl);
    } catch {
      /* preview es best-effort */
    }
    this.uploadingAvatar.set(true);
    this.uploadProgress.set(0);
    try {
      const ext = file.name.split('.').pop()?.toLowerCase() ?? 'png';
      const key = `users/${u.sub}/avatar-${Date.now()}.${ext}`;
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

      // Persistimos en User model para que el cambio sobreviva al reload.
      const res = await this.api.updateUser({ sub: u.sub, avatarKey: key });
      if (res?.errors && res.errors.length > 0) {
        // eslint-disable-next-line no-console
        console.error('[edit-profile] updateUser failed', res.errors);
        this.toast.error('No se pudo guardar la foto');
        return;
      }

      this.pendingAvatarKey.set(key);
      this.avatarRemoved.set(false);
      await this.auth.refreshAvatarKey();
      this.toast.success('Foto actualizada');
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('[edit-profile] avatar upload failed', e);
      this.toast.error('No se pudo subir la imagen');
    } finally {
      this.uploadingAvatar.set(false);
    }
  }

  /** Pide confirmación y, si el user acepta, persiste avatarKey=null
   *  en el User model. Limpia preview local. */
  async requestRemoveAvatar(): Promise<void> {
    const u = this.user();
    if (!u) return;
    const ok = await this.confirmDialog.ask({
      title: 'Eliminar foto de perfil',
      message: 'Tu avatar volverá al fallback con tu inicial. Puedes subir otra foto cuando quieras.',
      confirmLabel: 'Eliminar foto',
      cancelLabel: 'Cancelar',
      danger: true,
    });
    if (!ok) return;
    try {
      const res = await this.api.updateUser({ sub: u.sub, avatarKey: null });
      if (res?.errors && res.errors.length > 0) {
        // eslint-disable-next-line no-console
        console.error('[edit-profile] updateUser remove avatar failed', res.errors);
        this.toast.error('No se pudo eliminar la foto');
        return;
      }
      const prev = this.previewUrl();
      if (prev) URL.revokeObjectURL(prev);
      this.previewUrl.set(null);
      this.pendingAvatarKey.set(null);
      this.avatarRemoved.set(true);
      await this.auth.refreshAvatarKey();
      this.toast.success('Foto eliminada');
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('[edit-profile] avatar remove failed', e);
      this.toast.error('No se pudo eliminar la foto');
    }
  }

  cancelPwd() {
    this.showPwdForm.set(false);
    this.pwdOld = '';
    this.pwdNew = '';
    this.pwdConfirm = '';
    this.pwdError.set(null);
    this.showPwdOld.set(false);
    this.showPwdNew.set(false);
    this.showPwdConfirm.set(false);
  }

  async submitPwd() {
    if (!this.canSubmitPwd()) return;
    this.pwdError.set(null);
    this.changingPwd.set(true);
    try {
      await this.auth.changePassword(this.pwdOld, this.pwdNew);
      this.toast.success('Contraseña actualizada');
      this.cancelPwd();
    } catch (e) {
      // Cognito devuelve errors específicos: NotAuthorizedException si la
      // contraseña actual está mal, InvalidPasswordException si la nueva
      // no cumple política, LimitExceededException si hay throttle.
      const msg = (e as { message?: string })?.message ?? '';
      if (msg.toLowerCase().includes('incorrect')) {
        this.pwdError.set('La contraseña actual es incorrecta.');
      } else if (msg.toLowerCase().includes('password did not conform')) {
        this.pwdError.set('La nueva contraseña no cumple los requisitos mínimos.');
      } else {
        this.pwdError.set(msg || 'No se pudo cambiar la contraseña');
      }
    } finally {
      this.changingPwd.set(false);
    }
  }
}
