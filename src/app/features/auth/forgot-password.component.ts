import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { AuthShellComponent } from '../../shared/layout/auth-shell.component';

@Component({
  selector: 'app-forgot-password',
  standalone: true,
  imports: [FormsModule, RouterLink, AuthShellComponent],
  template: `
    <app-auth-shell>
      <div class="form-card auth-card" style="max-width: 520px;">
        <span class="step-mark step-mark--1">Paso 1 de 2</span>
        <h2 class="form-card__title">Recuperar acceso</h2>
        <p class="form-card__lead">Ingresa tu email y te enviamos un código de verificación de 6 dígitos.</p>

        <form (ngSubmit)="requestCode()">
          <div class="form-card__field">
            <label class="form-card__label" for="fp-email">Email de tu cuenta</label>
            <input class="form-card__input" id="fp-email" name="email" type="email"
                   [(ngModel)]="email" placeholder="tu@email.com" autocomplete="email" required>
          </div>

          @if (codeSent()) {
            <p class="form-card__hint" style="color: var(--color-primary-green);">
              ✓ Código enviado a {{ email }}. Revisa tu inbox y spam.
            </p>
          }
          @if (requestError()) {
            <p class="form-card__hint" style="color: var(--color-lost);">{{ requestError() }}</p>
          }

          <button class="btn btn--primary form-card__submit" type="submit" [disabled]="requesting()">
            {{ requesting() ? 'Enviando…' : (codeSent() ? 'Reenviar código' : 'Enviar código') }}
          </button>
        </form>

        <div class="step-divider">
          <hr>
          <span>O si ya tienes el código</span>
          <hr>
        </div>

        <span class="step-mark step-mark--2">Paso 2 de 2</span>
        <h2 class="form-card__title" style="font-size: var(--fs-xl);">Confirma y elige nuevo password</h2>
        <p class="form-card__lead">El código tiene 6 dígitos y vence en 15 minutos.</p>

        <form (ngSubmit)="confirmReset()">
          <div class="form-card__field">
            <label class="form-card__label" for="fp-code">Código de verificación</label>
            <input class="form-card__input" id="fp-code" name="code" type="text"
                   inputmode="numeric" pattern="[0-9]{6}" placeholder="000000" maxlength="6"
                   [(ngModel)]="code" required
                   style="font-family: var(--font-display); font-size: 32px; letter-spacing: 0.4em; text-align: center;">
          </div>
          <div class="form-card__field">
            <label class="form-card__label" for="fp-newpwd">Nuevo password</label>
            <input class="form-card__input" id="fp-newpwd" name="newPassword" type="password"
                   [(ngModel)]="newPassword" placeholder="Mínimo 8 caracteres"
                   minlength="8" required>
          </div>

          @if (resetError()) {
            <p class="form-card__hint" style="color: var(--color-lost);">{{ resetError() }}</p>
          }

          <button class="btn btn--primary form-card__submit" type="submit" [disabled]="resetting()">
            {{ resetting() ? 'Actualizando…' : 'Actualizar password' }}
          </button>
        </form>

        <p class="form-card__alt">
          @if (codeSent()) {
            ¿No te llegó el código?
            @if (resendCooldown() > 0) {
              <span style="color: var(--color-text-muted); margin-left: 4px;">
                Reenvío disponible en {{ resendCooldown() }}s
              </span>
            } @else {
              <a href="#" (click)="resend($event)">Reenviar</a>
            }
          } @else {
            <a routerLink="/login">Volver a login</a>
          }
        </p>
        @if (resendInfo()) {
          <p class="form-card__hint" style="color: var(--color-primary-green); margin-top: 4px;">
            ✓ {{ resendInfo() }}
          </p>
        }
      </div>
    </app-auth-shell>
  `,
})
export class ForgotPasswordComponent {
  private auth = inject(AuthService);
  private router = inject(Router);

  email = '';
  code = '';
  newPassword = '';

  requesting = signal(false);
  resetting = signal(false);
  codeSent = signal(false);
  requestError = signal<string | null>(null);
  // Reenvío con cooldown 60s
  resendCooldown = signal(0);
  resendInfo = signal<string | null>(null);
  private cooldownTimer: ReturnType<typeof setInterval> | undefined;
  resetError = signal<string | null>(null);

  async requestCode() {
    if (!this.email) return;
    this.requestError.set(null);
    this.requesting.set(true);
    try {
      await this.auth.forgotPassword(this.email);
      this.codeSent.set(true);
    } catch (e) {
      this.requestError.set((e as Error).message ?? 'No se pudo enviar el código');
    } finally {
      this.requesting.set(false);
    }
  }

  async confirmReset() {
    if (!this.email || !this.code || !this.newPassword) return;
    this.resetError.set(null);
    this.resetting.set(true);
    try {
      await this.auth.confirmForgot(this.email, this.code, this.newPassword);
      void this.router.navigate(['/login']);
    } catch (e) {
      this.resetError.set((e as Error).message ?? 'Código inválido o password muy débil');
    } finally {
      this.resetting.set(false);
    }
  }

  async resend(event: Event) {
    event.preventDefault();
    if (!this.email) return;
    if (this.resendCooldown() > 0) return;
    this.resendInfo.set(null);
    this.requestError.set(null);
    try {
      await this.auth.forgotPassword(this.email);
      this.resendInfo.set('Código reenviado. Revisa tu correo (incluyendo spam).');
      this.startCooldown(60);
    } catch (e) {
      this.requestError.set((e as Error).message ?? 'No se pudo reenviar el código');
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
