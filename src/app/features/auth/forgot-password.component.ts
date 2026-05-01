import {
  Component, ElementRef, QueryList, ViewChildren,
  computed, inject, signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';

@Component({
  selector: 'app-forgot-password',
  standalone: true,
  imports: [FormsModule, RouterLink],
  template: `
    <div class="auth-shell">

      <!-- Panel de marca (solo desktop) -->
      <aside class="auth-brand">
        <div class="auth-brand__top">
          <span class="auth-brand__logo">⚽</span>
          <span class="auth-brand__title">POLLA · MUNDIAL 2026</span>
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

          <!-- Header mobile (solo paso 1) -->
          @if (!codeSent()) {
            <div class="auth-mobile-head">
              <div class="auth-mobile-head__logo">⚽</div>
              <h1 class="auth-mobile-head__title">Polla Mundialista</h1>
              <div class="auth-mobile-head__kicker">Mundial 2026</div>
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
                  required
                  [(ngModel)]="email">
              </div>

              @if (requestError()) {
                <p class="auth-error">{{ requestError() }}</p>
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

            <a href="#" (click)="goBackToEmail($event)" class="auth-back">‹ Volver</a>

            <div class="auth-step-head">
              <div class="kicker">PASO 2 DE 2</div>
              <h1>Nueva contraseña</h1>
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
                <a href="#" (click)="resend($event)" class="auth-bottom__link">Reenviar</a>
              }
            </div>

            <form (ngSubmit)="confirmReset()" style="margin-top:14px;">
              <div class="auth-field">
                <label for="fp-newpwd" class="auth-label">Nueva contraseña</label>
                <input
                  type="password"
                  id="fp-newpwd"
                  name="newPassword"
                  class="auth-input"
                  placeholder="••••••••"
                  autocomplete="new-password"
                  minlength="8"
                  required
                  [(ngModel)]="newPassword"
                  (ngModelChange)="onPasswordChange($event)">
                <div class="auth-strength">
                  <div class="bar bar--sm flex-1" [style.background]="strengthColor(0)"></div>
                  <div class="bar bar--sm flex-1" [style.background]="strengthColor(1)"></div>
                  <div class="bar bar--sm flex-1" [style.background]="strengthColor(2)"></div>
                  <div class="bar bar--sm flex-1" [style.background]="strengthColor(3)"></div>
                </div>
                <div class="auth-helper">Mín 8 caracteres · 1 número · 1 mayúscula</div>
              </div>

              @if (resetError()) {
                <p class="auth-error">{{ resetError() }}</p>
              }
              @if (resendInfo()) {
                <p class="auth-success">✓ {{ resendInfo() }}</p>
              }

              <button
                type="submit"
                class="btn-wf btn-wf--block btn-wf--primary"
                style="padding:14px;font-size:14px;margin-top:14px;"
                [disabled]="resetting() || code().length !== 6 || newPassword.length < 8">
                {{ resetting() ? 'Actualizando…' : 'Actualizar contraseña →' }}
              </button>
            </form>

            <div class="auth-tip">
              💡 Revisa tu spam si no lo encuentras. El código caduca en 15 minutos.
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
  `],
})
export class ForgotPasswordComponent {
  private auth = inject(AuthService);
  private router = inject(Router);

  email = '';
  newPassword = '';

  requesting = signal(false);
  resetting = signal(false);
  codeSent = signal(false);
  requestError = signal<string | null>(null);
  resetError = signal<string | null>(null);
  resendInfo = signal<string | null>(null);

  passwordStrength = signal(0);

  readonly indices = [0, 1, 2, 3, 4, 5];
  otpDigits = signal<string[]>(['', '', '', '', '', '']);
  code = computed(() => this.otpDigits().join(''));

  resendCooldown = signal(0);
  private cooldownTimer?: ReturnType<typeof setInterval>;

  @ViewChildren('otpInput') otpRefs?: QueryList<ElementRef<HTMLInputElement>>;

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

  // ---------- OTP ----------
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

  goBackToEmail(event: Event) {
    event.preventDefault();
    this.codeSent.set(false);
    this.otpDigits.set(['', '', '', '', '', '']);
    this.newPassword = '';
    this.passwordStrength.set(0);
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
    this.resetError.set(null);
    this.resetting.set(true);
    try {
      await this.auth.confirmForgot(this.email, this.code(), this.newPassword);
      void this.router.navigate(['/login']);
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
