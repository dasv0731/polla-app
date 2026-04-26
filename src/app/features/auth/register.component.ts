import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { apiClient } from '../../core/api/client';

@Component({
  selector: 'app-register',
  standalone: true,
  imports: [FormsModule, RouterLink],
  template: `
    <main class="auth-main">
      @if (step() === 'form') {
        <form class="form-card auth-card" (ngSubmit)="submitForm()" #f="ngForm">
          <h2 class="form-card__title">Crear cuenta</h2>
          <p class="form-card__lead">30 segundos. Gratis. Sin tarjeta.</p>

          <ul class="perks">
            <li>104 partidos del Mundial 2026 para predecir</li>
            <li>Grupos privados con tus amigos</li>
            <li>Ranking global y por grupo en vivo</li>
          </ul>

          <div class="form-card__field">
            <label class="form-card__label" for="reg-handle">Tu handle público</label>
            <input class="form-card__input" id="reg-handle" name="handle" type="text"
                   [(ngModel)]="handle" placeholder="@tu_usuario" autocomplete="username"
                   required pattern="[a-zA-Z0-9_]{3,20}">
            <span class="form-card__hint">Visible en leaderboards. 3-20 caracteres, letras y números.</span>
            @if (handleError()) {
              <span class="form-card__hint" style="color: var(--color-error, #c00);">{{ handleError() }}</span>
            }
          </div>

          <div class="form-card__field">
            <label class="form-card__label" for="reg-email">Email</label>
            <input class="form-card__input" id="reg-email" name="email" type="email"
                   [(ngModel)]="email" placeholder="tu@email.com" autocomplete="email" required>
            <span class="form-card__hint">Te enviamos un código de confirmación.</span>
          </div>

          <div class="form-card__field">
            <label class="form-card__label" for="reg-pwd">Password</label>
            <input class="form-card__input" id="reg-pwd" name="password" type="password"
                   [(ngModel)]="password" placeholder="Mínimo 8 caracteres"
                   autocomplete="new-password" required minlength="8">
          </div>

          @if (error()) {
            <p class="form-card__hint" style="color: var(--color-error, #c00);">{{ error() }}</p>
          }

          <button class="btn btn--primary form-card__submit" type="submit" [disabled]="loading()">
            {{ loading() ? 'Creando…' : 'Crear cuenta gratis' }}
          </button>

          <p class="form-card__alt">¿Ya tienes cuenta? <a routerLink="/login">Inicia sesión</a></p>
        </form>
      } @else {
        <form class="form-card auth-card" (ngSubmit)="submitConfirm()">
          <h2 class="form-card__title">Confirma tu email</h2>
          <p class="form-card__lead">Pegamos un código a {{ email }}.</p>

          <div class="form-card__field">
            <label class="form-card__label" for="reg-code">Código de 6 dígitos</label>
            <input class="form-card__input" id="reg-code" name="code" type="text"
                   [(ngModel)]="code" placeholder="123456" required>
          </div>

          @if (error()) {
            <p class="form-card__hint" style="color: var(--color-error, #c00);">{{ error() }}</p>
          }

          <button class="btn btn--primary form-card__submit" type="submit" [disabled]="loading()">
            {{ loading() ? 'Confirmando…' : 'Confirmar' }}
          </button>

          <p class="form-card__alt">
            <a href="#" (click)="resendCode($event)">Reenviar código</a>
          </p>
        </form>
      }
    </main>
  `,
})
export class RegisterComponent {
  private auth = inject(AuthService);
  private router = inject(Router);

  step = signal<'form' | 'confirm'>('form');
  handle = '';
  email = '';
  password = '';
  code = '';
  loading = signal(false);
  error = signal<string | null>(null);
  handleError = signal<string | null>(null);

  private async checkHandleUnique(handle: string): Promise<boolean> {
    const res = await apiClient.models.User.list({
      filter: { handle: { eq: handle } },
      authMode: 'apiKey',
      limit: 1,
    });
    return (res.data ?? []).length === 0;
  }

  async submitForm() {
    this.error.set(null);
    this.handleError.set(null);
    this.loading.set(true);
    try {
      const unique = await this.checkHandleUnique(this.handle);
      if (!unique) {
        this.handleError.set('Ese handle ya está en uso. Prueba otro.');
        this.loading.set(false);
        return;
      }
      await this.auth.register(this.email, this.password, this.handle);
      this.step.set('confirm');
    } catch (e) {
      this.error.set((e as Error).message ?? 'No se pudo crear la cuenta');
    } finally {
      this.loading.set(false);
    }
  }

  async submitConfirm() {
    this.error.set(null);
    this.loading.set(true);
    try {
      await this.auth.confirm(this.email, this.code);
      // Auto-login after confirm
      await this.auth.login(this.email, this.password);
      void this.router.navigate(['/picks']);
    } catch (e) {
      this.error.set((e as Error).message ?? 'Código inválido');
    } finally {
      this.loading.set(false);
    }
  }

  async resendCode(event: Event) {
    event.preventDefault();
    try {
      await this.auth.resend(this.email);
    } catch (e) {
      this.error.set((e as Error).message ?? 'No se pudo reenviar el código');
    }
  }
}
