import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [FormsModule, RouterLink],
  template: `
    <div class="auth-shell">
      <!-- Panel de marca (solo desktop ≥992) -->
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
            <div>
              <div class="num">2.4k</div>
              <div class="lbl">Jugadores</div>
            </div>
            <div>
              <div class="num">180</div>
              <div class="lbl">Grupos activos</div>
            </div>
            <div>
              <div class="num">$15k</div>
              <div class="lbl">En premios</div>
            </div>
          </div>
        </div>

        <div class="auth-brand__foot">
          © 2026 Polla Mundialista · Términos · Privacidad
        </div>
      </aside>

      <!-- Formulario -->
      <section class="auth-form">
        <div class="auth-form__inner">

          <!-- Header mobile -->
          <div class="auth-mobile-head">
            <div class="auth-mobile-head__logo">⚽</div>
            <h1 class="auth-mobile-head__title">Polla Mundialista</h1>
            <div class="auth-mobile-head__kicker">Mundial 2026</div>
          </div>

          <!-- Header desktop -->
          <div class="auth-desk-head">
            <div class="kicker">BIENVENIDO DE NUEVO</div>
            <h1 class="auth-desk-head__title">Entrar</h1>
            <p class="auth-desk-head__sub">Continúa donde lo dejaste.</p>
          </div>

          <form (ngSubmit)="submit()">
            <div class="auth-field">
              <label for="login-email" class="auth-label">Email</label>
              <input
                type="email"
                id="login-email"
                name="email"
                class="auth-input"
                placeholder="tu@correo.com"
                autocomplete="email"
                required
                [(ngModel)]="email">
            </div>

            <div class="auth-field">
              <div class="auth-field-head">
                <label for="login-pwd" class="auth-label">Contraseña</label>
                <a routerLink="/forgot-password" class="auth-forgot">¿Olvidaste?</a>
              </div>
              <input
                type="password"
                id="login-pwd"
                name="password"
                class="auth-input"
                placeholder="••••••••"
                autocomplete="current-password"
                required
                [(ngModel)]="password">
            </div>

            @if (error()) {
              <p class="auth-error">{{ error() }}</p>
            }

            <button
              type="submit"
              class="btn-wf btn-wf--block btn-wf--primary"
              style="padding:14px;font-size:14px;margin-top:4px;"
              [disabled]="loading()">
              {{ loading() ? 'Entrando…' : 'Entrar' }}
            </button>
          </form>

          <div class="auth-or">
            <span></span>
            <span>o</span>
            <span></span>
          </div>

          <div class="auth-socials">
            <button type="button" class="btn-wf btn-wf--block" disabled title="Próximamente">
              <span style="font-weight:700;">G</span>&nbsp;&nbsp;Continuar con Google
            </button>
            <button type="button" class="btn-wf btn-wf--block" disabled title="Próximamente">
              <span></span>&nbsp;&nbsp;Continuar con Apple
            </button>
          </div>

          <div class="auth-bottom">
            <span class="text-mute">¿Primera vez? </span>
            <a routerLink="/register" class="auth-bottom__link">Crear cuenta →</a>
          </div>

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
  `],
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
      void this.router.navigate(['/home']);
    } catch (e) {
      const msg = (e as Error).message ?? 'Credenciales inválidas';
      this.error.set(msg);
    } finally {
      this.loading.set(false);
    }
  }
}
