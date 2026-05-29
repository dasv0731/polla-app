import { Component, EventEmitter, Input, OnInit, Output, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { uploadData } from 'aws-amplify/storage';
import { AuthService } from '../../core/auth/auth.service';
import { ApiService } from '../../core/api/api.service';
import { ToastService } from '../../core/notifications/toast.service';
import { ModalComponent } from '../../shared/ui/modal/modal.component';
import { UserAvatarComponent } from '../../shared/user-avatar/user-avatar.component';
import { COUNTRY_OPTIONS, flagFromCountryCode } from '../../shared/util/countries';

/**
 * Modal "Editar perfil". Tres secciones:
 *   1. Avatar — subir/cambiar foto. Usa Storage path users/{sub}/avatar-*.
 *   2. Nombre / handle — read-only (no se puede cambiar después del registro).
 *   3. Cambiar contraseña — flow Cognito vía AuthService.changePassword.
 *
 * A2: consume `<app-modal>` shared.
 */
@Component({
  standalone: true,
  selector: 'app-edit-profile-modal',
  imports: [FormsModule, UserAvatarComponent, ModalComponent],
  template: `
    <app-modal
      [open]="true"
      title="Editar perfil"
      size="md"
      (close)="close()">
      <div slot="body" class="ep-body">
        <section class="ep-section">
          <h3 class="ep-section__title">Foto de perfil</h3>
          <div class="ep-avatar-row">
            <app-user-avatar
              [sub]="user()?.sub ?? ''"
              [handle]="user()?.handle ?? ''"
              [avatarKey]="pendingAvatarKey() ?? user()?.avatarKey ?? null"
              size="lg" />
            <div class="ep-avatar-controls">
              <input type="file" accept="image/*" id="ep-avatar-input"
                     style="display: none"
                     (change)="onFileSelected($event)">
              <label for="ep-avatar-input" class="btn-wf btn-wf--sm"
                     [class.btn-wf--loading]="uploadingAvatar()">
                {{ uploadingAvatar() ? 'Subiendo…' : (user()?.avatarKey || pendingAvatarKey() ? 'Cambiar foto' : 'Subir foto') }}
              </label>
              <p class="ep-hint">JPG/PNG, hasta 5 MB.</p>
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
                      rows="3" placeholder="Una frase corta sobre vos (max 200)"></textarea>
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
              {{ savingProfile() ? 'Guardando…' : 'Guardar país y bio' }}
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
                <input type="password" name="ep-pwd-old" [(ngModel)]="pwdOld"
                       autocomplete="current-password" spellcheck="false" autocapitalize="off">
              </label>
              <label class="ep-field">
                <span>Nueva contraseña</span>
                <input type="password" name="ep-pwd-new" [(ngModel)]="pwdNew"
                       autocomplete="new-password" spellcheck="false" autocapitalize="off"
                       minlength="8">
              </label>
              <label class="ep-field">
                <span>Repetir nueva contraseña</span>
                <input type="password" name="ep-pwd-confirm" [(ngModel)]="pwdConfirm"
                       autocomplete="new-password" spellcheck="false" autocapitalize="off"
                       minlength="8">
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
        <button type="button" class="btn-wf" (click)="close()">Cerrar</button>
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
      display: flex; gap: 16px; align-items: center;
    }
    .ep-avatar-controls { flex: 1; }
    .ep-hint {
      font-size: 12px;
      color: var(--wf-ink-3);
      margin: 6px 0 0;
    }
    .ep-readonly strong {
      font-family: var(--wf-display);
      font-size: 16px;
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

  @Output() closed = new EventEmitter<void>();
  /** Si se setea a 'password', el modal abre con el form de cambio de
   *  contraseña ya expandido (sin requerir click adicional al user). */
  @Input() initialSection: 'password' | null = null;

  user = computed(() => this.auth.user());
  uploadingAvatar = signal(false);
  pendingAvatarKey = signal<string | null>(null);

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

  canSubmitPwd = computed(() =>
    this.pwdOld.length >= 1 && this.pwdNew.length >= 8 && this.pwdNew === this.pwdConfirm,
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

  close() {
    this.closed.emit();
  }

  async onFileSelected(event: Event) {
    const u = this.user();
    if (!u) return;
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      this.toast.error('La imagen excede 5 MB');
      input.value = '';
      return;
    }
    this.uploadingAvatar.set(true);
    try {
      const ext = file.name.split('.').pop()?.toLowerCase() ?? 'png';
      const key = `users/${u.sub}/avatar-${Date.now()}.${ext}`;
      const op = uploadData({
        path: key,
        data: file,
        options: { contentType: file.type || 'image/png' },
      });
      await op.result;

      // Persistimos en User model para que el cambio sobreviva al reload.
      const res = await this.api.updateUser({ sub: u.sub, avatarKey: key });
      if (res?.errors && res.errors.length > 0) {
        // eslint-disable-next-line no-console
        console.error('[edit-profile] updateUser failed', res.errors);
        this.toast.error('No se pudo guardar la foto');
        return;
      }

      this.pendingAvatarKey.set(key);
      await this.auth.refreshAvatarKey();
      this.toast.success('Foto actualizada');
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('[edit-profile] avatar upload failed', e);
      this.toast.error('No se pudo subir la imagen');
    } finally {
      this.uploadingAvatar.set(false);
      input.value = '';
    }
  }

  cancelPwd() {
    this.showPwdForm.set(false);
    this.pwdOld = '';
    this.pwdNew = '';
    this.pwdConfirm = '';
    this.pwdError.set(null);
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
        this.pwdError.set('La nueva contraseña no cumple los requisitos mínimos (8+ caracteres, mayúscula, minúscula y número).');
      } else {
        this.pwdError.set(msg || 'No se pudo cambiar la contraseña');
      }
    } finally {
      this.changingPwd.set(false);
    }
  }
}
