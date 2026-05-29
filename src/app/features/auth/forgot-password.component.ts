import {
  Component, OnInit, ViewChild,
  inject, signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { ToastService } from '../../core/notifications/toast.service';
import { PasswordRulesListComponent } from '../../shared/ui/password-rules-list.component';
import { passwordPassesAllRules } from '../../shared/util/password-rules';
import { AuthBrandPanelComponent } from '../../shared/ui/auth-brand-panel/auth-brand-panel.component';
import { IconComponent } from '../../shared/ui/icon/icon.component';
import { OtpInputComponent } from '../../shared/ui/otp-input/otp-input.component';

@Component({
  selector: 'app-forgot-password',
  standalone: true,
  imports: [
    FormsModule, RouterLink,
    PasswordRulesListComponent,
    AuthBrandPanelComponent,
    IconComponent,
    OtpInputComponent,
  ],
  template: `
    <div class="auth-shell">

      <app-auth-brand-panel [stats]="stats()" />

      <!-- Formulario -->
      <section class="auth-form">
        <div class="auth-form__inner">

          <!-- Header mobile (solo paso 1) -->
          @if (!codeSent()) {
            <div class="auth-mobile-head">
              <img src="assets/logo-golgana.png" alt="" class="auth-mobile-head__logo brand-logo--sm">
              <h1 class="auth-mobile-head__title">Golgana</h1>
              <div class="auth-mobile-head__kicker">Polla Mundialista 2026</div>
            </div>
          }

          @if (!codeSent()) {

            <a routerLink="/login" class="auth-back">‹ Volver a Entrar</a>

            <div class="auth-step-head">
              <div class="kicker">RECUPERAR ACCESO</div>
              <h1>Olvidé mi contraseña</h1>
              <p>Ingresa tu email y te enviamos un código de 6 dígitos.</p>
            </div>

            <form (ngSubmit)="requestCode()">
              <div class="auth-field">
                <label for="fp-email" class="auth-label">Email de tu cuenta</label>
                <input
                  type="email"
                  id="fp-email"
                  name="email"
                  class="auth-input"
                  placeholder="tu@correo.com"
                  autocomplete="email"
                  inputmode="email"
                  spellcheck="false"
                  autocapitalize="off"
                  required
                  [(ngModel)]="email">
              </div>

              @if (requestError()) {
                <p class="auth-error" role="alert">{{ requestError() }}</p>
              }

              <button
                type="submit"
                class="btn-wf btn-wf--block btn-wf--primary"
                style="padding:14px;font-size:14px;margin-top:14px;"
                [disabled]="requesting() || !email">
                {{ requesting() ? 'Enviando…' : 'Enviar código →' }}
              </button>
            </form>

            <div class="auth-bottom">
              <span class="text-mute">¿La recordaste? </span>
              <a routerLink="/login" class="auth-bottom__link">Entrar</a>
            </div>

          } @else {

            <button type="button" (click)="goBackToEmail($event)" class="auth-back"><span aria-hidden="true">‹ </span>Volver</button>

            <div class="auth-step-head">
              <div class="kicker">PASO 2 DE 2</div>
              <h1>Nueva contraseña</h1>
              <p>
                Te enviamos un código de 6 dígitos a<br>
                <strong style="color:var(--wf-ink);">{{ email }}</strong>
              </p>
            </div>

            <app-otp-input #otpInput (complete)="onOtpComplete($event)" />

            <div class="auth-resend">
              @if (resendCooldown() > 0) {
                <span class="text-mute">¿No te llegó? </span>
                <span class="text-green text-bold">Reenviar ({{ formatCooldown() }})</span>
              } @else {
                <span class="text-mute">¿No te llegó? </span>
                <button type="button" (click)="resend($event)" class="auth-bottom__link">Reenviar</button>
              }
            </div>

            <form (ngSubmit)="confirmReset()" style="margin-top:14px;">
              <div class="auth-field">
                <label for="fp-newpwd" class="auth-label">Nueva contraseña</label>
                <div class="auth-input-wrap">
                  <input
                    [type]="showPwd() ? 'text' : 'password'"
                    id="fp-newpwd"
                    name="newPassword"
                    class="auth-input"
                    placeholder="••••••••"
                    autocomplete="new-password"
                    spellcheck="false"
                    autocapitalize="off"
                    minlength="8"
                    required
                    [(ngModel)]="newPassword">
                  <button type="button" class="auth-input-toggle"
                          (click)="showPwd.set(!showPwd())"
                          [attr.aria-label]="showPwd() ? 'Ocultar contraseña' : 'Mostrar contraseña'">
                    <app-icon [name]="showPwd() ? 'eye-off' : 'eye'" size="md" />
                  </button>
                </div>
                <app-password-rules-list [password]="newPassword" />
              </div>

              <div class="auth-field">
                <label for="fp-newpwd-confirm" class="auth-label">Confirma la contraseña</label>
                <input
                  [type]="showPwd() ? 'text' : 'password'"
                  id="fp-newpwd-confirm"
                  name="confirmPassword"
                  class="auth-input"
                  placeholder="••••••••"
                  autocomplete="new-password"
                  spellcheck="false"
                  autocapitalize="off"
                  required
                  [(ngModel)]="confirmPassword">
                @if (showMismatch()) {
                  <div class="auth-helper" style="color: var(--wf-danger);">
                    Las contraseñas no coinciden.
                  </div>
                }
              </div>

              @if (resetError()) {
                <p class="auth-error" role="alert">{{ resetError() }}</p>
              }
              @if (resendInfo()) {
                <p class="auth-success" role="status"><span aria-hidden="true">✓ </span>{{ resendInfo() }}</p>
              }

              <button
                type="submit"
                class="btn-wf btn-wf--block btn-wf--primary"
                style="padding:14px;font-size:14px;margin-top:14px;"
                [disabled]="resetting() || code().length !== 6 || !passwordIsValid() || !passwordsMatch()">
                {{ resetting() ? 'Actualizando…' : 'Actualizar contraseña →' }}
              </button>
            </form>

            <div class="auth-tip">
              Revisa tu spam si no lo encuentras. El código caduca en 15 minutos.
            </div>

          }

        </div>
      </section>
    </div>
  `,
  styles: [`
    :host { display: block; }

    .auth-error {
      font-size: 12px;
      color: var(--wf-danger);
      margin-top: 12px;
      padding: 8px 12px;
      background: rgba(195, 51, 51, 0.08);
      border-radius: 6px;
      border: 1px solid rgba(195, 51, 51, 0.2);
    }
    .auth-success {
      font-size: 12px;
      color: var(--wf-green-ink);
      margin-top: 8px;
      padding: 8px 12px;
      background: var(--wf-green-soft);
      border-radius: 6px;
      border: 1px solid rgba(0, 200, 100, 0.2);
    }
    .auth-input-wrap { position: relative; }
    .auth-input-wrap .auth-input { padding-right: 42px; }
    .auth-input-toggle {
      position: absolute;
      right: 6px;
      top: 50%;
      transform: translateY(-50%);
      background: transparent;
      border: 0;
      font-size: 18px;
      cursor: pointer;
      padding: 6px 8px;
      line-height: 1;
      color: var(--wf-ink-3);
    }
    .auth-input-toggle:hover { color: var(--wf-ink); }
    .auth-input-toggle:focus-visible {
      outline: 2px solid var(--color-primary-green);
      outline-offset: 2px;
      border-radius: 4px;
      color: var(--wf-ink);
    }
  `],
})
export class ForgotPasswordComponent implements OnInit {
  private auth = inject(AuthService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private toast = inject(ToastService);

  email = '';
  newPassword = '';
  confirmPassword = '';

  requesting = signal(false);
  resetting = signal(false);
  codeSent = signal(false);
  showPwd = signal(false);
  requestError = signal<string | null>(null);
  resetError = signal<string | null>(null);
  resendInfo = signal<string | null>(null);

  // TODO(A6): replace with ApiService.getPublicStats() once polla-backend lambda deployed
  stats = signal({ totalUsers: 2400, totalGroups: 180, totalPrizesAccrued: 15000 });

  passwordIsValid = (): boolean => passwordPassesAllRules(this.newPassword);
  passwordsMatch = (): boolean =>
    this.newPassword.length > 0 && this.newPassword === this.confirmPassword;
  /** Mismatch hint solo si confirm tiene algo y difiere — no avisamos
   *  "no coinciden" cuando el segundo input está vacío todavía. */
  showMismatch = (): boolean =>
    this.confirmPassword.length > 0 && this.newPassword !== this.confirmPassword;

  /** Código actual del OTP, mantenido en sync con el `(complete)` event. */
  private otpCode = signal<string>('');
  code = this.otpCode.asReadonly();

  @ViewChild('otpInput') otpInput?: OtpInputComponent;

  resendCooldown = signal(0);
  private cooldownTimer?: ReturnType<typeof setInterval>;

  ngOnInit() {
    // Pre-rellenar email si vino del query (típico desde /login con email).
    const qp = this.route.snapshot.queryParamMap;
    const qEmail = qp.get('email');
    if (qEmail) this.email = qEmail;
  }

  /** Path al que volver tras el reset (mismo patrón que login/onboarding).
   *  Solo paths relativos al mismo origin — evita open-redirect. */
  private safeReturnUrl(): string | null {
    const raw = this.route.snapshot.queryParamMap.get('returnUrl');
    if (!raw || !raw.startsWith('/') || raw.startsWith('//')) return null;
    return raw;
  }

  onOtpComplete(code: string) {
    this.otpCode.set(code);
    // Sin auto-submit: el user todavía necesita escribir la nueva password
    // y su confirmación. Solo guardamos el código.
  }

  formatCooldown(): string {
    const s = this.resendCooldown();
    return `00:${String(s).padStart(2, '0')}`;
  }

  goBackToEmail(event: Event) {
    event.preventDefault();
    this.codeSent.set(false);
    this.otpCode.set('');
    this.otpInput?.reset();
    this.newPassword = '';
    this.confirmPassword = '';
    this.resetError.set(null);
  }

  // ---------- Submit ----------
  async requestCode() {
    if (!this.email) return;
    this.requestError.set(null);
    this.requesting.set(true);
    try {
      await this.auth.forgotPassword(this.email);
      this.codeSent.set(true);
      this.startCooldown(60);
    } catch (e) {
      this.requestError.set((e as Error).message ?? 'No se pudo enviar el código');
    } finally {
      this.requesting.set(false);
    }
  }

  async confirmReset() {
    if (!this.email || this.code().length !== 6 || this.newPassword.length < 8) return;
    if (!this.passwordsMatch()) {
      this.resetError.set('Las contraseñas no coinciden.');
      return;
    }
    this.resetError.set(null);
    this.resetting.set(true);
    const returnUrl = this.safeReturnUrl();
    try {
      await this.auth.confirmForgot(this.email, this.code(), this.newPassword);
      this.toast.success('Contraseña actualizada.');
      // El user acaba de probar email + nueva password — autenticarlo
      // directo es la UX correcta. Si el auto-login falla por algún edge
      // case (race condition con Cognito propagation, p.ej.), cae al
      // /login normal con el email pre-llenado por la query + returnUrl.
      try {
        await this.auth.login(this.email, this.newPassword);
        void this.router.navigateByUrl(returnUrl ?? '/home');
      } catch {
        void this.router.navigate(['/login'], {
          queryParams: {
            email: this.email,
            ...(returnUrl ? { returnUrl } : {}),
          },
        });
      }
    } catch (e) {
      this.resetError.set((e as Error).message ?? 'Código inválido o password muy débil');
    } finally {
      this.resetting.set(false);
    }
  }

  async resend(event: Event) {
    event.preventDefault();
    if (!this.email || this.resendCooldown() > 0) return;
    this.resendInfo.set(null);
    this.resetError.set(null);
    try {
      await this.auth.forgotPassword(this.email);
      this.resendInfo.set('Código reenviado. Revisa tu correo (incluyendo spam).');
      this.startCooldown(60);
    } catch (e) {
      this.resetError.set((e as Error).message ?? 'No se pudo reenviar el código');
    }
  }

  private startCooldown(seconds: number) {
    if (this.cooldownTimer) clearInterval(this.cooldownTimer);
    this.resendCooldown.set(seconds);
    this.cooldownTimer = setInterval(() => {
      const left = this.resendCooldown() - 1;
      if (left <= 0) {
        this.resendCooldown.set(0);
        if (this.cooldownTimer) clearInterval(this.cooldownTimer);
        this.cooldownTimer = undefined;
      } else {
        this.resendCooldown.set(left);
      }
    }, 1000);
  }
}
