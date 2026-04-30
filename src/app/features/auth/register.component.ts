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
    <div class="login-layout">
      <!-- Panel izquierdo branding (solo desktop) -->
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

      <!-- Panel derecho form -->
      <main class="login-form-container">
        <div class="login-form-wrapper">
          <!-- Mobile header -->
          <div class="mobile-header">
            <span class="logo-icon mobile-logo">⚽</span>
            <h1 class="mobile-title">Polla Mundialista</h1>
            <span class="mobile-subtitle">MUNDIAL 2026</span>
          </div>

          @if (step() === 'form') {
            <form (ngSubmit)="submitForm()" #f="ngForm">
              <span class="kicker desktop-only">PASO 1 DE 2</span>
              <h2 class="form-title desktop-only">Tus datos</h2>
              <p class="form-subtitle desktop-only">Verificamos tu email en el siguiente paso.</p>

              <div class="form-group">
                <label class="kicker-label" for="reg-handle">HANDLE (&#64;USUARIO)</label>
                <div class="input-card">
                  <input id="reg-handle" name="handle" type="text"
                         [(ngModel)]="handle" placeholder="@tu_usuario"
                         autocomplete="username" required
                         pattern="[a-zA-Z0-9_]{3,20}">
                </div>
                <p class="hint">3-20 caracteres. Cómo te verán en el ranking.</p>
                @if (handleError()) {
                  <p class="form-error">{{ handleError() }}</p>
                }
              </div>

              <div class="form-group" style="margin-top: 14px;">
                <label class="kicker-label" for="reg-email">EMAIL</label>
                <div class="input-card">
                  <input id="reg-email" name="email" type="email"
                         [(ngModel)]="email" placeholder="tu@correo.com"
                         autocomplete="email" required>
                </div>
                <p class="hint">Te enviamos un código de confirmación.</p>
              </div>

              <div class="form-group" style="margin-top: 14px;">
                <label class="kicker-label" for="reg-pwd">CONTRASEÑA</label>
                <div class="input-card pass-card">
                  <input id="reg-pwd" name="password"
                         [type]="showPassword() ? 'text' : 'password'"
                         [(ngModel)]="password" placeholder="••••••••"
                         autocomplete="new-password" required minlength="8">
                  <span class="eye-icon" (click)="showPassword.set(!showPassword())">
                    {{ showPassword() ? '🙈' : '👁' }}
                  </span>
                </div>
                <p class="hint">Mínimo 8 caracteres.</p>
              </div>

              @if (error()) {
                <p class="form-error">{{ error() }}</p>
              }

              <button class="btn-wf btn-primary" type="submit" [disabled]="loading()">
                {{ loading() ? 'Creando…' : 'Continuar →' }}
              </button>

              <div class="form-footer">
                <span class="text-mute">¿Ya tienes cuenta? </span>
                <a routerLink="/login" class="link-green">Entrar</a>
              </div>
            </form>
          } @else {
            <form (ngSubmit)="submitConfirm()">
              <span class="kicker desktop-only">PASO 2 DE 2</span>
              <h2 class="form-title desktop-only">Verifica tu email</h2>
              <p class="form-subtitle desktop-only">
                Te enviamos un código de 6 dígitos a
                <strong style="color: var(--wf-ink);">{{ email }}</strong>
              </p>

              <div class="form-group">
                <label class="kicker-label" for="reg-code">CÓDIGO DE 6 DÍGITOS</label>
                <div class="input-card">
                  <input id="reg-code" name="code" type="text"
                         [(ngModel)]="code" placeholder="000000"
                         maxlength="6" required
                         style="font-family: var(--wf-display); font-size: 22px; letter-spacing: 6px; text-align: center;">
                </div>
                <p class="hint">El código caduca en 10 minutos. Revisa también spam.</p>
              </div>

              @if (error()) {
                <p class="form-error">{{ error() }}</p>
              }

              <button class="btn-wf btn-primary" type="submit" [disabled]="loading()">
                {{ loading() ? 'Confirmando…' : 'Verificar →' }}
              </button>

              <div class="form-footer">
                @if (resendCooldown() > 0) {
                  <span class="text-mute">Reenviar disponible en {{ resendCooldown() }}s</span>
                } @else {
                  <span class="text-mute">¿No te llegó? </span>
                  <a href="#" (click)="resendCode($event)" class="link-green">Reenviar</a>
                }
              </div>
              @if (resendInfo()) {
                <p class="form-success">✓ {{ resendInfo() }}</p>
              }
            </form>
          }
        </div>
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

    .brand-header { display: flex; align-items: center; gap: 8px; }
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
    .brand-stats { display: flex; gap: 24px; margin-top: 32px; }
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
    .brand-footer { font-size: 12px; opacity: 0.7; }

    .login-form-container {
      flex: 1;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 48px;
      background: var(--wf-paper);
    }
    .login-form-wrapper { width: 100%; max-width: 380px; }

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
      line-height: 1.5;
    }

    .form-group { margin-top: 20px; }
    .kicker-label {
      font-size: 9px;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      font-weight: 700;
      color: var(--wf-ink-3);
      margin-bottom: 6px;
      display: block;
    }
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

    .hint {
      font-size: 11px;
      color: var(--wf-ink-3);
      margin-top: 4px;
      line-height: 1.4;
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
    .form-success {
      font-size: 12px;
      color: var(--wf-green-ink);
      margin-top: 8px;
      padding: 8px 12px;
      background: var(--wf-green-soft);
      border-radius: 6px;
      border: 1px solid rgba(2, 204, 116, 0.2);
    }

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
        margin-bottom: 24px;
        margin-top: 12px;
      }
      .mobile-logo {
        background: transparent;
        color: var(--wf-ink);
        font-size: 22px;
        margin-bottom: 12px;
      }
      .mobile-title {
        font-family: var(--wf-display);
        font-size: 26px;
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
  showPassword = signal(false);

  resendCooldown = signal(0);
  resendInfo = signal<string | null>(null);
  private cooldownTimer: ReturnType<typeof setInterval> | undefined;

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
