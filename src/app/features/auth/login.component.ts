import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [FormsModule, RouterLink],
  template: `
    <div class="login-layout">
      <!-- Panel Izquierdo (branding · solo desktop) -->
      <aside class="login-brand">
        <div>
          <div class="brand-header">
            <span class="logo-icon">⚽</span>
            <span class="brand-name">POLLA · MUNDIAL 2026</span>
          </div>
          <h1 class="brand-title">Predice cada partido.<br>Gana contra tus panas.</h1>
          <p class="brand-desc">
            Crea grupos privados, asigna premios, gana comodines y demuestra
            quién sabe más de fútbol.
          </p>
          <div class="brand-stats">
            <div>
              <div class="stat-value">2.4k</div>
              <div class="stat-label">Jugadores</div>
            </div>
            <div>
              <div class="stat-value">180</div>
              <div class="stat-label">Grupos activos</div>
            </div>
            <div>
              <div class="stat-value">$15k</div>
              <div class="stat-label">En premios</div>
            </div>
          </div>
        </div>
        <div class="brand-footer">
          © 2026 Polla Mundialista · Términos · Privacidad
        </div>
      </aside>

      <!-- Panel Derecho (formulario unificado · desktop + mobile) -->
      <main class="login-form-container">
        <form class="login-form-wrapper" (ngSubmit)="submit()">
          <!-- Cabecera mobile-only -->
          <div class="mobile-header">
            <span class="logo-icon mobile-logo">⚽</span>
            <h1 class="mobile-title">Polla Mundialista</h1>
            <span class="mobile-subtitle">MUNDIAL 2026</span>
          </div>

          <!-- Títulos desktop-only -->
          <span class="kicker desktop-only">BIENVENIDO DE NUEVO</span>
          <h2 class="form-title desktop-only">Entrar</h2>
          <p class="form-subtitle desktop-only">Continúa donde lo dejaste.</p>

          <div class="form-group">
            <label class="kicker-label" for="login-email">EMAIL</label>
            <div class="input-card">
              <input id="login-email" name="email" type="email"
                     [(ngModel)]="email" placeholder="tu@correo.com"
                     autocomplete="email" required>
            </div>
          </div>

          <div class="form-group" style="margin-top: 14px;">
            <div class="label-row">
              <label class="kicker-label" for="login-pwd">CONTRASEÑA</label>
              <a routerLink="/forgot-password" class="link-green">¿Olvidaste?</a>
            </div>
            <div class="input-card pass-card">
              <input id="login-pwd" name="password"
                     [type]="showPassword() ? 'text' : 'password'"
                     [(ngModel)]="password" placeholder="••••••••"
                     autocomplete="current-password" required>
              <span class="eye-icon" (click)="showPassword.set(!showPassword())"
                    [attr.aria-label]="showPassword() ? 'Ocultar' : 'Mostrar contraseña'">
                {{ showPassword() ? '🙈' : '👁' }}
              </span>
            </div>
          </div>

          @if (error()) {
            <p class="form-error">{{ error() }}</p>
          }

          <button class="btn-wf btn-primary" type="submit" [disabled]="loading()">
            {{ loading() ? 'Entrando…' : 'Entrar' }}
          </button>

          <div class="divider-row">
            <div class="line"></div>
            <span class="divider-text">O</span>
            <div class="line"></div>
          </div>

          <div>
            <button class="btn-wf btn-secondary" type="button" disabled
                    title="Próximamente">
              <span style="font-weight: 700;">G</span> Continuar con Google
            </button>
            <button class="btn-wf btn-secondary" type="button" disabled
                    title="Próximamente">
              <span style="font-weight: 700;"></span> Continuar con Apple
            </button>
          </div>

          <div class="form-footer">
            <span class="text-mute">¿Primera vez? </span>
            <a routerLink="/register" class="link-green">Crear cuenta →</a>
          </div>
        </form>
      </main>
    </div>
  `,
  styles: [`
    :host { display: block; }

    .login-layout {
      display: flex;
      width: 100%;
      min-height: 100vh;
      background: var(--wf-paper);
    }

    /* Panel izquierdo branding */
    .login-brand {
      flex: 1.1;
      background: linear-gradient(140deg, var(--wf-green) 0%, #007840 100%);
      color: white;
      padding: 48px;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      position: relative;
      overflow: hidden;
    }
    .login-brand::before {
      content: "";
      position: absolute;
      inset: 0;
      background: radial-gradient(circle at 80% 20%, rgba(255,255,255,0.18) 0%, transparent 50%);
      pointer-events: none;
    }
    .login-brand > * { position: relative; z-index: 1; }

    .brand-header {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .logo-icon {
      background: rgba(255, 255, 255, 0.2);
      width: 36px; height: 36px;
      border-radius: 8px;
      display: flex; justify-content: center; align-items: center;
      font-size: 18px;
    }
    .brand-name {
      font-family: var(--wf-display);
      font-size: 18px;
      letter-spacing: 0.08em;
    }

    .brand-title {
      font-family: var(--wf-display);
      font-size: 54px;
      letter-spacing: 0.02em;
      line-height: 1.05;
      font-weight: normal;
      margin-top: 20px;
    }
    .brand-desc {
      font-size: 14px;
      margin-top: 14px;
      opacity: 0.9;
      max-width: 380px;
      line-height: 1.4;
    }
    .brand-stats {
      display: flex;
      gap: 24px;
      margin-top: 32px;
    }
    .stat-value {
      font-family: var(--wf-display);
      font-size: 30px;
      line-height: 1;
    }
    .stat-label {
      font-size: 11px;
      text-transform: uppercase;
      opacity: 0.85;
      letter-spacing: 0.06em;
      margin-top: 4px;
    }
    .brand-footer {
      font-size: 12px;
      opacity: 0.7;
    }

    /* Panel derecho form */
    .login-form-container {
      flex: 1;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 48px;
      background: var(--wf-paper);
    }
    .login-form-wrapper {
      width: 100%;
      max-width: 380px;
    }

    .mobile-header { display: none; }

    .kicker {
      font-size: 9px;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      font-weight: 700;
      color: var(--wf-ink-3);
    }

    .form-title {
      font-family: var(--wf-display);
      font-size: 30px;
      letter-spacing: 0.04em;
      margin-top: 4px;
      font-weight: normal;
      line-height: 1.05;
    }
    .form-subtitle {
      font-size: 14px;
      color: var(--wf-ink-3);
      margin-top: 6px;
    }

    .form-group { margin-top: 24px; }
    .kicker-label {
      font-size: 9px;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      font-weight: 700;
      color: var(--wf-ink-3);
      margin-bottom: 6px;
      display: block;
    }
    .label-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 6px;
    }
    .label-row .kicker-label { margin-bottom: 0; }

    .link-green {
      font-size: 12px;
      color: var(--wf-green-ink);
      font-weight: 700;
      text-decoration: none;
    }
    .link-green:hover { text-decoration: underline; }

    .input-card {
      background: var(--wf-paper);
      border: 1px solid var(--wf-line);
      border-radius: 10px;
      padding: 12px 14px;
      display: flex;
      align-items: center;
      transition: border-color 100ms;
    }
    .input-card:focus-within { border-color: var(--wf-green); }
    .input-card input {
      border: none;
      outline: none;
      width: 100%;
      font-size: 14px;
      font-family: var(--wf-ui);
      color: var(--wf-ink);
      background: transparent;
    }
    .input-card input::placeholder { color: var(--wf-ink-3); }
    .pass-card input { letter-spacing: 4px; }
    .pass-card input::placeholder { letter-spacing: normal; }
    .eye-icon {
      font-size: 14px;
      color: var(--wf-ink-3);
      cursor: pointer;
      user-select: none;
    }

    .btn-wf {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      width: 100%;
      padding: 14px;
      border-radius: 8px;
      font-size: 14px;
      font-weight: 600;
      cursor: pointer;
      font-family: var(--wf-ui);
      border: 1px solid var(--wf-line);
      background: var(--wf-paper);
      color: var(--wf-ink);
    }
    .btn-wf:disabled { cursor: not-allowed; opacity: 0.6; }
    .btn-primary {
      background: var(--wf-green);
      color: white;
      border-color: var(--wf-green);
      margin-top: 18px;
    }
    .btn-secondary { margin-top: 8px; }

    .divider-row {
      display: flex;
      align-items: center;
      gap: 10px;
      margin: 18px 0;
    }
    .divider-row .line {
      flex: 1;
      height: 1px;
      background: var(--wf-line-2);
    }
    .divider-text {
      font-size: 11px;
      color: var(--wf-ink-3);
      text-transform: uppercase;
      letter-spacing: 0.08em;
    }

    .form-footer {
      text-align: center;
      margin-top: 18px;
      font-size: 14px;
    }
    .text-mute { color: var(--wf-ink-3); }

    .form-error {
      font-size: 12px;
      color: var(--wf-danger, #c33);
      margin-top: 12px;
      padding: 8px 12px;
      background: rgba(231, 76, 60, 0.08);
      border-radius: 6px;
      border: 1px solid rgba(231, 76, 60, 0.2);
    }

    /* Responsive — Mobile (≤800px) */
    @media (max-width: 800px) {
      .login-brand { display: none; }
      .login-form-container {
        padding: 24px 20px;
        align-items: flex-start;
      }
      .mobile-header {
        display: flex;
        flex-direction: column;
        align-items: center;
        margin-bottom: 28px;
        margin-top: 18px;
      }
      .mobile-logo {
        background: transparent;
        color: var(--wf-ink);
        font-size: 22px;
        margin-bottom: 14px;
      }
      .mobile-title {
        font-family: var(--wf-display);
        font-size: 30px;
        letter-spacing: 0.04em;
        line-height: 1;
        font-weight: normal;
      }
      .mobile-subtitle {
        font-size: 11px;
        color: var(--wf-ink-3);
        text-transform: uppercase;
        letter-spacing: 0.08em;
        margin-top: 4px;
      }
      .desktop-only { display: none; }
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
  showPassword = signal(false);

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
