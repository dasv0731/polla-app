import {
  Component, OnInit, ViewChild,
  inject, signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { apiClient } from '../../core/api/client';
import { PasswordRulesListComponent } from '../../shared/ui/password-rules-list.component';
import { passwordPassesAllRules } from '../../shared/util/password-rules';
import { AuthBrandPanelComponent } from '../../shared/ui/auth-brand-panel/auth-brand-panel.component';
import { IconComponent } from '../../shared/ui/icon/icon.component';
import { OtpInputComponent } from '../../shared/ui/otp-input/otp-input.component';

type Step = 'form' | 'confirm' | 'handle-conflict';
type HandleStatus = 'idle' | 'checking' | 'available' | 'taken';

@Component({
  selector: 'app-register',
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

          @if (step() === 'form') {

            <a routerLink="/login" class="auth-back">‹ Volver a Entrar</a>

            <div class="auth-step-head">
              <div class="kicker">PASO 1 DE 2</div>
              <h1>Crear cuenta</h1>
              <p>Verificamos tu email en el siguiente paso.</p>
            </div>

            <form (ngSubmit)="submitForm()">

              <div class="auth-field">
                <label for="reg-handle" class="auth-label">Usuario</label>
                <div class="auth-input-wrap">
                  <input
                    type="text"
                    id="reg-handle"
                    name="handle"
                    class="auth-input"
                    [class.auth-input--has-pill]="handleStatus() !== 'idle'"
                    placeholder="tu_usuario"
                    autocomplete="username"
                    spellcheck="false"
                    autocapitalize="off"
                    autocorrect="off"
                    required
                    pattern="[a-zA-Z0-9_]{3,20}"
                    [(ngModel)]="handle"
                    (ngModelChange)="onHandleChange($event)">
                  @if (handleStatus() === 'available') {
                    <span class="auth-input-pill"><app-icon name="check" size="sm" /> disponible</span>
                  } @else if (handleStatus() === 'taken') {
                    <span class="auth-input-pill pill-taken"><app-icon name="close" size="sm" /> en uso</span>
                  } @else if (handleStatus() === 'checking') {
                    <span class="auth-input-pill pill-checking">verificando…</span>
                  }
                </div>
                <div class="auth-helper">Sin &#64; — solo letras, números y guión bajo. Así te verán tus amigos en el ranking.</div>
              </div>

              <div class="auth-field">
                <label for="reg-email" class="auth-label">Email</label>
                <input
                  type="email"
                  id="reg-email"
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

              <div class="auth-field">
                <label for="reg-pwd" class="auth-label">Contraseña</label>
                <div class="auth-input-wrap">
                  <input
                    [type]="showPwd() ? 'text' : 'password'"
                    id="reg-pwd"
                    name="password"
                    class="auth-input"
                    placeholder="••••••••"
                    autocomplete="new-password"
                    spellcheck="false"
                    autocapitalize="off"
                    required
                    minlength="8"
                    [(ngModel)]="password">
                  <button type="button" class="auth-input-toggle"
                          (click)="showPwd.set(!showPwd())"
                          [attr.aria-label]="showPwd() ? 'Ocultar contraseña' : 'Mostrar contraseña'">
                    <app-icon [name]="showPwd() ? 'eye-off' : 'eye'" size="md" />
                  </button>
                </div>
                <app-password-rules-list [password]="password" />
              </div>

              <label class="auth-check">
                <input type="checkbox" name="terms" required [(ngModel)]="acceptTerms">
                <span>
                  Acepto los <a href="https://polla.golgana.net/terminos" target="_blank" rel="noopener noreferrer">Términos</a> y la <a href="https://polla.golgana.net/privacidad" target="_blank" rel="noopener noreferrer">Privacidad</a>
                </span>
              </label>

              @if (error()) {
                <p class="auth-error" role="alert">{{ error() }}</p>
              }

              <button
                type="submit"
                class="btn-wf btn-wf--block btn-wf--primary btn-wf--lg"
                style="margin-top:14px;"
                [disabled]="loading() || !canSubmit()">
                {{ loading() ? 'Creando…' : 'Continuar →' }}
              </button>
            </form>

            <div class="auth-bottom">
              <span class="text-mute">¿Ya tienes cuenta? </span>
              <a routerLink="/login" class="auth-bottom__link">Entrar</a>
            </div>

          } @else if (step() === 'handle-conflict') {

            <div class="auth-step-head">
              <div class="kicker">CASI LISTO</div>
              <h1>Elige otro usuario</h1>
              <p>
                Tu cuenta está creada pero <strong>{{ '@' + handle }}</strong>
                ya está en uso por otra persona. Elige uno distinto y
                terminamos.
              </p>
            </div>

            <form (ngSubmit)="retryHandle()" style="margin-top:14px;">
              <div class="auth-field">
                <label for="rh-handle" class="auth-label">Usuario</label>
                <div class="auth-input-wrap">
                  <input
                    type="text"
                    id="rh-handle"
                    name="handle"
                    class="auth-input"
                    [class.auth-input--has-pill]="handleStatus() !== 'idle'"
                    placeholder="tu_usuario"
                    autocomplete="username"
                    spellcheck="false"
                    autocapitalize="off"
                    autocorrect="off"
                    required
                    pattern="[a-zA-Z0-9_]{3,20}"
                    [(ngModel)]="handle"
                    (ngModelChange)="onHandleChange($event)">
                  @if (handleStatus() === 'available') {
                    <span class="auth-input-pill"><app-icon name="check" size="sm" /> disponible</span>
                  } @else if (handleStatus() === 'taken') {
                    <span class="auth-input-pill pill-taken"><app-icon name="close" size="sm" /> en uso</span>
                  } @else if (handleStatus() === 'checking') {
                    <span class="auth-input-pill pill-checking">verificando…</span>
                  }
                </div>
                <div class="auth-helper">Sin &#64; — solo letras, números y guión bajo.</div>
              </div>

              @if (error()) {
                <p class="auth-error" role="alert">{{ error() }}</p>
              }

              <button
                type="submit"
                class="btn-wf btn-wf--block btn-wf--primary btn-wf--lg"
                style="margin-top:14px;"
                [disabled]="loading() || handleStatus() !== 'available'">
                {{ loading() ? 'Guardando…' : 'Confirmar usuario' }}
              </button>

              <div class="auth-bottom" style="margin-top:10px;">
                <button type="button" class="auth-bottom__link" (click)="restartRegistration()">
                  Empezar de nuevo
                </button>
              </div>
            </form>

          } @else {

            <button type="button" (click)="goBackToForm($event)" class="auth-back"><span aria-hidden="true">‹ </span>Volver a tus datos</button>

            <div class="auth-step-head">
              <div class="kicker">PASO 2 DE 2</div>
              <h1>Verifica tu email</h1>
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
                <button type="button" (click)="resendCode($event)" class="auth-bottom__link">Reenviar</button>
              }
            </div>

            @if (error()) {
              <p class="auth-error" role="alert">{{ error() }}</p>
            }
            @if (resendInfo()) {
              <p class="auth-success" role="status"><span aria-hidden="true">✓ </span>{{ resendInfo() }}</p>
            }

            <button
              type="button"
              class="btn-wf btn-wf--block btn-wf--primary btn-wf--lg"
              style="margin-top:14px;"
              [disabled]="loading() || code().length !== 6"
              (click)="submitConfirm()">
              {{ loading() ? 'Verificando…' : 'Verificar →' }}
            </button>

            <div class="auth-tip">
              Revisa tu spam si no lo encuentras. El código caduca en 10 minutos.
            </div>

          }

        </div>
      </section>
    </div>
  `,
  styles: [`
    :host { display: block; }

    .auth-input-pill.pill-taken {
      background: rgba(195, 51, 51, 0.1);
      color: var(--wf-danger);
      border-color: rgba(195, 51, 51, 0.3);
    }
    .auth-input-pill.pill-checking {
      background: var(--wf-fill);
      color: var(--wf-ink-3);
      border-color: var(--wf-line);
    }

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
  `],
})
export class RegisterComponent implements OnInit {
  private auth = inject(AuthService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);

  step = signal<Step>('form');

  // TODO(A6): replace with ApiService.getPublicStats() once polla-backend lambda deployed
  stats = signal({ totalUsers: 2400, totalGroups: 180, totalPrizesAccrued: 15000 });

  ngOnInit() {
    // Soporte para deep-link desde login cuando Cognito reporta
    // UserNotConfirmedException: `?email=foo@bar&confirm=1` aterriza
    // directo en el step 'confirm' con email pre-llenado. El reenvío del
    // código ya lo hizo login.component antes de redirigir.
    const qp = this.route.snapshot.queryParamMap;
    const qEmail = qp.get('email');
    if (qEmail) this.email = qEmail;
    if (qp.get('confirm') === '1' && qEmail) {
      this.step.set('confirm');
      this.startCooldown(60);
    }
  }

  handle = '';
  email = '';
  password = '';
  acceptTerms = false;

  loading = signal(false);
  error = signal<string | null>(null);
  resendInfo = signal<string | null>(null);
  showPwd = signal(false);

  handleStatus = signal<HandleStatus>('idle');

  /** Código actual del OTP, mantenido en sync con el `(complete)` event
   *  del child `<app-otp-input>` y consumido por `submitConfirm()`. */
  private otpCode = signal<string>('');
  code = this.otpCode.asReadonly();

  @ViewChild('otpInput') otpInput?: OtpInputComponent;

  resendCooldown = signal(0);
  private cooldownTimer?: ReturnType<typeof setInterval>;
  private handleDebounce?: ReturnType<typeof setTimeout>;

  /** Disparado por `<app-otp-input (complete)>` cuando los 6 dígitos
   *  están llenos. Cachea el código y dispara submitConfirm
   *  automáticamente para que el user no tenga que clickear "Verificar". */
  onOtpComplete(code: string) {
    this.otpCode.set(code);
    // Auto-submit como UX hint. Si el código está mal, error → user reescribe.
    void this.submitConfirm();
  }

  canSubmit(): boolean {
    return !!this.handle && !!this.email
      && passwordPassesAllRules(this.password) && this.acceptTerms
      && this.handleStatus() !== 'taken' && this.handleStatus() !== 'checking';
  }

  // ---------- Handle live availability ----------
  onHandleChange(value: string) {
    if (this.handleDebounce) clearTimeout(this.handleDebounce);
    if (!/^[a-zA-Z0-9_]{3,20}$/.test(value)) {
      this.handleStatus.set('idle');
      return;
    }
    this.handleStatus.set('checking');
    this.handleDebounce = setTimeout(async () => {
      try {
        const unique = await this.checkHandleUnique(value);
        this.handleStatus.set(unique ? 'available' : 'taken');
      } catch {
        this.handleStatus.set('idle');
      }
    }, 400);
  }

  private async checkHandleUnique(handle: string): Promise<boolean> {
    // Uses the public checkHandleAvailable mutation. The User model doesn't
    // permit apiKey reads (would expose PII), so the prior list-based check
    // returned empty silently for any handle. The mutation does the GSI query
    // server-side and returns only a boolean.
    const res = await apiClient.mutations.checkHandleAvailable(
      { handle },
      { authMode: 'apiKey' },
    );
    return res.data?.available === true;
  }

  formatCooldown(): string {
    const s = this.resendCooldown();
    return `00:${String(s).padStart(2, '0')}`;
  }

  goBackToForm(event: Event) {
    event.preventDefault();
    this.step.set('form');
    this.error.set(null);
  }

  // ---------- Submit ----------
  async submitForm() {
    if (!this.canSubmit()) return;
    this.error.set(null);
    this.loading.set(true);
    try {
      // Doble check antes de pasar a Cognito (por si caducó el debounce)
      const unique = await this.checkHandleUnique(this.handle);
      if (!unique) {
        this.handleStatus.set('taken');
        this.loading.set(false);
        return;
      }
      await this.auth.register(this.email, this.password, this.handle);
      this.step.set('confirm');
      this.otpCode.set('');
      this.otpInput?.reset();
      this.startCooldown(60);
    } catch (e) {
      this.error.set((e as Error).message ?? 'No se pudo crear la cuenta');
    } finally {
      this.loading.set(false);
    }
  }

  async submitConfirm() {
    if (this.code().length !== 6) return;
    this.error.set(null);
    this.loading.set(true);
    let loggedIn = false;
    try {
      await this.auth.confirm(this.email, this.code());

      // Bug #4 fix: si llegamos vía deep-link desde login (UserNotConfirmedException),
      // this.password está vacío porque la component se acaba de instanciar.
      // login.component lo dejó en sessionStorage; lo recogemos acá.
      let passwordToUse = this.password;
      if (!passwordToUse) {
        try {
          passwordToUse = sessionStorage.getItem('pending-confirm-password') ?? '';
        } catch { /* sessionStorage deshabilitado */ }
      }
      if (!passwordToUse) {
        // Edge case: la sesión expiró o sessionStorage se limpió. Redirigir
        // al user al login para que reingrese sus credenciales.
        this.error.set('Sesión expirada. Vuelve a iniciar sesión.');
        try { sessionStorage.removeItem('pending-confirm-password'); } catch { /* ignore */ }
        void this.router.navigate(['/login'], { queryParams: { email: this.email } });
        return;
      }

      await this.auth.login(this.email, passwordToUse);
      loggedIn = true;

      // Cleanup del stash una vez login OK — el password ya no es necesario.
      try { sessionStorage.removeItem('pending-confirm-password'); } catch { /* ignore */ }

      const u = this.auth.user();
      if (u) {
        // Crea el User row vía la mutation autenticada. El backend toma sub +
        // email del Cognito identity y valida unicidad del handle server-side.
        const res = await apiClient.mutations.createUserProfile({ handle: u.handle });
        if (!res.data?.ok) {
          await this.bounceBackToForm(
            res.data?.message ?? 'No se pudo crear el perfil. Intenta con otro usuario.',
          );
          return;
        }
      }
      // Propaga returnUrl (si vino) para que el onboarding pueda redirigir
      // al deep-link original (ej. /groups/join/:code) al terminar.
      const returnUrl = this.route.snapshot.queryParamMap.get('returnUrl');
      void this.router.navigate(['/onboarding'], {
        queryParams: returnUrl ? { returnUrl } : undefined,
      });
    } catch (e) {
      if (loggedIn) {
        // Cognito ya nos autenticó pero la creación del perfil falló (throw).
        // Cerrar sesión para no dejar al user en un estado inconsistente
        // (auth válida pero sin User row → otras pantallas rompen).
        await this.bounceBackToForm(
          (e as Error).message ?? 'No se pudo crear el perfil. Verifica el usuario y vuelve a intentarlo.',
        );
      } else {
        // Pre-login: OTP inválido o sign-in falló. Mantener al user en step 'confirm'
        // para que pueda reintentar el código.
        this.error.set((e as Error).message ?? 'Código inválido');
      }
    } finally {
      this.loading.set(false);
    }
  }

  /** Después de un fallo de createUserProfile mostramos un step focalizado
   *  ("handle-conflict") con solo el campo handle + retry. La sesión Cognito
   *  queda activa pero el User row falta — el user no puede salir hasta
   *  pickear un handle válido (sino otras pantallas rompen). */
  private async bounceBackToForm(message: string): Promise<void> {
    this.error.set(message);
    this.handleStatus.set('taken');
    this.step.set('handle-conflict');
  }

  /** Reintenta solo createUserProfile con el nuevo handle. Si funciona,
   *  proceeds a onboarding como en el flow normal. Si falla otra vez,
   *  queda en el mismo step esperando otro handle. */
  async retryHandle() {
    if (this.handleStatus() !== 'available' || this.loading()) return;
    this.error.set(null);
    this.loading.set(true);
    try {
      const res = await apiClient.mutations.createUserProfile({ handle: this.handle });
      if (!res.data?.ok) {
        this.error.set(res.data?.message ?? 'Ese usuario ya está en uso.');
        this.handleStatus.set('taken');
        return;
      }
      const returnUrl = this.route.snapshot.queryParamMap.get('returnUrl');
      void this.router.navigate(['/onboarding'], {
        queryParams: returnUrl ? { returnUrl } : undefined,
      });
    } catch (e) {
      this.error.set((e as Error).message ?? 'No se pudo crear el perfil.');
    } finally {
      this.loading.set(false);
    }
  }

  /** Botón de escape del handle-conflict step: si el user prefiere
   *  empezar de cero, lo logoutemos y reseteamos al step 'form'. */
  async restartRegistration() {
    try { await this.auth.logout(); } catch { /* ignore */ }
    this.handle = '';
    this.handleStatus.set('idle');
    this.error.set(null);
    this.step.set('form');
  }

  async resendCode(event: Event) {
    event.preventDefault();
    if (this.resendCooldown() > 0) return;
    this.resendInfo.set(null);
    this.error.set(null);
    try {
      await this.auth.resend(this.email);
      this.resendInfo.set('Código reenviado. Revisa tu correo (incluyendo spam).');
      this.startCooldown(60);
    } catch (e) {
      this.error.set((e as Error).message ?? 'No se pudo reenviar el código');
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
