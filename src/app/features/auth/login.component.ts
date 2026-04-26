import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [FormsModule, RouterLink],
  template: `
    <main class="auth-main">
      <form class="form-card auth-card" (ngSubmit)="submit()" #f="ngForm">
        <h2 class="form-card__title">Iniciar sesión</h2>
        <p class="form-card__lead">Ingresa con tu email para volver a tu polla.</p>

        <div class="form-card__field">
          <label class="form-card__label" for="login-email">Email</label>
          <input class="form-card__input" id="login-email" name="email" type="email"
                 [(ngModel)]="email" placeholder="tu@email.com" autocomplete="email" required>
        </div>

        <div class="form-card__field">
          <label class="form-card__label" for="login-pwd"
                 style="display: flex; justify-content: space-between; align-items: baseline;">
            <span>Password</span>
            <a routerLink="/forgot-password"
               style="font-size: 10px; font-weight: var(--fw-bold); letter-spacing: 0.08em; color: var(--color-primary-green); text-transform: uppercase;">¿Olvidaste?</a>
          </label>
          <input class="form-card__input" id="login-pwd" name="password" type="password"
                 [(ngModel)]="password" placeholder="Mínimo 8 caracteres" autocomplete="current-password" required>
        </div>

        @if (error()) {
          <p class="form-card__hint" style="color: var(--color-error, #c00);">{{ error() }}</p>
        }

        <button class="btn btn--primary form-card__submit" type="submit" [disabled]="loading()">
          {{ loading() ? 'Entrando…' : 'Entrar' }}
        </button>

        <p class="form-card__alt">¿No tienes cuenta? <a routerLink="/register">Crea una gratis</a></p>
      </form>
    </main>
  `,
})
export class LoginComponent {
  private auth = inject(AuthService);
  private router = inject(Router);

  email = '';
  password = '';
  loading = signal(false);
  error = signal<string | null>(null);

  async submit() {
    this.error.set(null);
    this.loading.set(true);
    try {
      await this.auth.login(this.email, this.password);
      void this.router.navigate(['/picks']);
    } catch (e) {
      const msg = (e as Error).message ?? 'Credenciales inválidas';
      this.error.set(msg);
    } finally {
      this.loading.set(false);
    }
  }
}
