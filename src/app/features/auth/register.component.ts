import {
  Component, ElementRef, QueryList, ViewChildren,
  computed, inject, signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { apiClient } from '../../core/api/client';

type Step = 'form' | 'confirm';
type HandleStatus = 'idle' | 'checking' | 'available' | 'taken';

@Component({
  selector: 'app-register',
  standalone: true,
  imports: [FormsModule, RouterLink],
  template: `
    <div class="auth-shell">

      <!-- Panel de marca (solo desktop) -->
      <aside class="auth-brand">
        <div class="auth-brand__top">
          <img src="assets/logo-golgana.png" alt="" class="auth-brand__logo-img" style="height:32px;width:auto;">
          <span class="auth-brand__title">GOLGANA · MUNDIAL 2026</span>
        </div>
        <div>
          <h1 class="auth-brand__h1">
            Predice cada partido.<br>
            Gana contra tus panas.
          </h1>
          <p class="auth-brand__sub">
            Crea grupos privados, asigna premios, gana comodines y demuestra
            quién sabe más de fútbol.
          </p>
          <div class="auth-brand__stats">
            <div><div class="num">2.4k</div><div class="lbl">Jugadores</div></div>
            <div><div class="num">180</div><div class="lbl">Grupos activos</div></div>
            <div><div class="num">$15k</div><div class="lbl">En premios</div></div>
          </div>
        </div>
        <div class="auth-brand__foot">
          © 2026 Polla Mundialista · Términos · Privacidad
        </div>
      </aside>

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
                <label for="reg-name" class="auth-label">Nombre</label>
                <input
                  type="text"
                  id="reg-name"
                  name="name"
                  class="auth-input"
                  placeholder="Juan Pérez"
                  autocomplete="name"
                  required
                  [(ngModel)]="name">
              </div>

              <div class="auth-field">
                <label for="reg-handle" class="auth-label">Handle (&#64;usuario)</label>
                <div class="auth-input-wrap">
                  <input
                    type="text"
                    id="reg-handle"
                    name="handle"
                    class="auth-input"
                    [class.auth-input--has-pill]="handleStatus() !== 'idle'"
                    placeholder="@tu_usuario"
                    autocomplete="username"
                    required
                    pattern="[a-zA-Z0-9_]{3,20}"
                    [(ngModel)]="handle"
                    (ngModelChange)="onHandleChange($event)">
                  @if (handleStatus() === 'available') {
                    <span class="auth-input-pill">✓ disponible</span>
                  } @else if (handleStatus() === 'taken') {
                    <span class="auth-input-pill pill-taken">✗ en uso</span>
                  } @else if (handleStatus() === 'checking') {
                    <span class="auth-input-pill pill-checking">verificando…</span>
                  }
                </div>
                <div class="auth-helper">Así te verán tus panas en el ranking.</div>
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
                  required
                  [(ngModel)]="email">
              </div>

              <div class="auth-field">
                <label for="reg-pwd" class="auth-label">Contraseña</label>
                <input
                  type="password"
                  id="reg-pwd"
                  name="password"
                  class="auth-input"
                  placeholder="••••••••"
                  autocomplete="new-password"
                  required
                  minlength="8"
                  [(ngModel)]="password"
                  (ngModelChange)="onPasswordChange($event)">
                <div class="auth-strength">
                  <div class="bar bar--sm flex-1" [style.background]="strengthColor(0)"></div>
                  <div class="bar bar--sm flex-1" [style.background]="strengthColor(1)"></div>
                  <div class="bar bar--sm flex-1" [style.background]="strengthColor(2)"></div>
                  <div class="bar bar--sm flex-1" [style.background]="strengthColor(3)"></div>
                </div>
                <div class="auth-helper">Mín 8 caracteres · 1 número · 1 mayúscula</div>
              </div>

              <label class="auth-check">
                <input type="checkbox" name="terms" required [(ngModel)]="acceptTerms">
                <span>
                  Acepto los <a href="#">Términos</a> y la <a href="#">Privacidad</a>
                </span>
              </label>

              @if (error()) {
                <p class="auth-error">{{ error() }}</p>
              }

              <button
                type="submit"
                class="btn-wf btn-wf--block btn-wf--primary"
                style="padding:14px;font-size:14px;margin-top:14px;"
                [disabled]="loading() || !canSubmit()">
                {{ loading() ? 'Creando…' : 'Continuar →' }}
              </button>
            </form>

            <div class="auth-bottom">
              <span class="text-mute">¿Ya tienes cuenta? </span>
              <a routerLink="/login" class="auth-bottom__link">Entrar</a>
            </div>

          } @else {

            <a href="#" (click)="goBackToForm($event)" class="auth-back">‹ Volver a tus datos</a>

            <div class="auth-step-head">
              <div class="kicker">PASO 2 DE 2</div>
              <h1>Verifica tu email</h1>
              <p>
                Te enviamos un código de 6 dígitos a<br>
                <strong style="color:var(--wf-ink);">{{ email }}</strong>
              </p>
            </div>

            <div class="otp">
              @for (i of indices; track i) {
                <input
                  #otpInput
                  class="otp__d"
                  maxlength="1"
                  inputmode="numeric"
                  placeholder="—"
                  [attr.aria-label]="'Dígito ' + (i + 1)"
                  [value]="otpDigits()[i]"
                  (input)="onOtpInput($event, i)"
                  (keydown)="onOtpKey($event, i)"
                  (paste)="onOtpPaste($event)">
              }
            </div>

            <div class="auth-resend">
              @if (resendCooldown() > 0) {
                <span class="text-mute">¿No te llegó? </span>
                <span class="text-green text-bold">Reenviar ({{ formatCooldown() }})</span>
              } @else {
                <span class="text-mute">¿No te llegó? </span>
                <a href="#" (click)="resendCode($event)" class="auth-bottom__link">Reenviar</a>
              }
            </div>

            @if (error()) {
              <p class="auth-error">{{ error() }}</p>
            }
            @if (resendInfo()) {
              <p class="auth-success">✓ {{ resendInfo() }}</p>
            }

            <button
              type="button"
              class="btn-wf btn-wf--block btn-wf--primary"
              style="padding:14px;font-size:14px;margin-top:14px;"
              [disabled]="loading() || code().length !== 6"
              (click)="submitConfirm()">
              {{ loading() ? 'Verificando…' : 'Verificar →' }}
            </button>

            <div class="auth-tip">
              💡 Revisa tu spam si no lo encuentras. El código caduca en 10 minutos.
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
  `],
})
export class RegisterComponent {
  private auth = inject(AuthService);
  private router = inject(Router);

  step = signal<Step>('form');

  name = '';
  handle = '';
  email = '';
  password = '';
  acceptTerms = false;

  loading = signal(false);
  error = signal<string | null>(null);
  resendInfo = signal<string | null>(null);

  handleStatus = signal<HandleStatus>('idle');
  passwordStrength = signal(0);

  readonly indices = [0, 1, 2, 3, 4, 5];
  otpDigits = signal<string[]>(['', '', '', '', '', '']);
  code = computed(() => this.otpDigits().join(''));

  resendCooldown = signal(0);
  private cooldownTimer?: ReturnType<typeof setInterval>;
  private handleDebounce?: ReturnType<typeof setTimeout>;

  @ViewChildren('otpInput') otpRefs?: QueryList<ElementRef<HTMLInputElement>>;

  canSubmit(): boolean {
    return !!this.name && !!this.handle && !!this.email
      && this.password.length >= 8 && this.acceptTerms
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
    const res = await apiClient.models.User.list({
      filter: { handle: { eq: handle } },
      authMode: 'apiKey',
      limit: 1,
    });
    return (res.data ?? []).length === 0;
  }

  // ---------- Password strength ----------
  onPasswordChange(value: string) {
    let score = 0;
    if (value.length >= 8) score++;
    if (/[A-Z]/.test(value)) score++;
    if (/[0-9]/.test(value)) score++;
    if (/[^a-zA-Z0-9]/.test(value)) score++;
    this.passwordStrength.set(score);
  }

  strengthColor(idx: number): string {
    const score = this.passwordStrength();
    if (idx >= score) return '';
    if (score <= 1) return 'var(--wf-danger)';
    if (score === 2) return 'var(--wf-warn)';
    return 'var(--wf-green)';
  }

  // ---------- OTP handlers ----------
  onOtpInput(event: Event, idx: number) {
    const input = event.target as HTMLInputElement;
    const v = input.value.replace(/\D/g, '').slice(0, 1);
    const arr = [...this.otpDigits()];
    arr[idx] = v;
    this.otpDigits.set(arr);
    input.value = v;
    if (v && idx < 5) {
      this.otpRefs?.toArray()[idx + 1]?.nativeElement.focus();
    }
  }

  onOtpKey(event: KeyboardEvent, idx: number) {
    if (event.key === 'Backspace' && !this.otpDigits()[idx] && idx > 0) {
      this.otpRefs?.toArray()[idx - 1]?.nativeElement.focus();
    }
  }

  onOtpPaste(event: ClipboardEvent) {
    event.preventDefault();
    const text = event.clipboardData?.getData('text') ?? '';
    const digits = text.replace(/\D/g, '').slice(0, 6).split('');
    if (digits.length === 0) return;
    const arr = ['', '', '', '', '', ''];
    digits.forEach((d, i) => arr[i] = d);
    this.otpDigits.set(arr);
    const lastIdx = Math.min(digits.length, 5);
    setTimeout(() => this.otpRefs?.toArray()[lastIdx]?.nativeElement.focus(), 0);
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
      await this.auth.register(this.email, this.password, this.handle, this.name);
      this.step.set('confirm');
      this.otpDigits.set(['', '', '', '', '', '']);
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
    try {
      await this.auth.confirm(this.email, this.code());
      await this.auth.login(this.email, this.password);
      const u = this.auth.user();
      if (u) {
        try {
          await apiClient.models.User.create({
            sub: u.sub,
            handle: u.handle,
            email: u.email,
            emailStatus: 'OK',
            createdAt: new Date().toISOString(),
          });
        } catch {
          // already exists
        }
      }
      void this.router.navigate(['/onboarding']);
    } catch (e) {
      this.error.set((e as Error).message ?? 'Código inválido');
    } finally {
      this.loading.set(false);
    }
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
