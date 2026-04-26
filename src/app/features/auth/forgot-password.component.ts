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
      @if (step() === 'request') {
        <form class="form-card auth-card" (ngSubmit)="requestCode()">
          <h2 class="form-card__title">Recuperar acceso</h2>
          <p class="form-card__lead">Te enviamos un código por email para resetear tu password.</p>

          <div class="form-card__field">
            <label class="form-card__label" for="fp-email">Email</label>
            <input class="form-card__input" id="fp-email" name="email" type="email"
                   [(ngModel)]="email" placeholder="tu@email.com" autocomplete="email" required>
          </div>

          @if (error()) {
            <p class="form-card__hint" style="color: var(--color-error, #c00);">{{ error() }}</p>
          }

          <button class="btn btn--primary form-card__submit" type="submit" [disabled]="loading()">
            {{ loading() ? 'Enviando…' : 'Enviar código' }}
          </button>

          <p class="form-card__alt">¿Recordaste? <a routerLink="/login">Volver a login</a></p>
        </form>
      } @else {
        <form class="form-card auth-card" (ngSubmit)="confirmReset()">
          <h2 class="form-card__title">Nuevo password</h2>
          <p class="form-card__lead">Pegamos un código a {{ email }}.</p>

          <div class="form-card__field">
            <label class="form-card__label" for="fp-code">Código</label>
            <input class="form-card__input" id="fp-code" name="code" type="text"
                   [(ngModel)]="code" placeholder="123456" required>
          </div>

          <div class="form-card__field">
            <label class="form-card__label" for="fp-pwd">Nuevo password</label>
            <input class="form-card__input" id="fp-pwd" name="password" type="password"
                   [(ngModel)]="newPassword" placeholder="Mínimo 8 caracteres"
                   autocomplete="new-password" required minlength="8">
          </div>

          @if (error()) {
            <p class="form-card__hint" style="color: var(--color-error, #c00);">{{ error() }}</p>
          }

          <button class="btn btn--primary form-card__submit" type="submit" [disabled]="loading()">
            {{ loading() ? 'Reseteando…' : 'Resetear password' }}
          </button>
        </form>
      }
    </app-auth-shell>
  `,
})
export class ForgotPasswordComponent {
  private auth = inject(AuthService);
  private router = inject(Router);

  step = signal<'request' | 'confirm'>('request');
  email = '';
  code = '';
  newPassword = '';
  loading = signal(false);
  error = signal<string | null>(null);

  async requestCode() {
    this.error.set(null);
    this.loading.set(true);
    try {
      await this.auth.forgotPassword(this.email);
      this.step.set('confirm');
    } catch (e) {
      this.error.set((e as Error).message ?? 'No se pudo enviar el código');
    } finally {
      this.loading.set(false);
    }
  }

  async confirmReset() {
    this.error.set(null);
    this.loading.set(true);
    try {
      await this.auth.confirmForgot(this.email, this.code, this.newPassword);
      void this.router.navigate(['/login']);
    } catch (e) {
      this.error.set((e as Error).message ?? 'Código inválido o password muy débil');
    } finally {
      this.loading.set(false);
    }
  }
}
