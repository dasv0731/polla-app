import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
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
          <img src="assets/logo-golgana.png" alt="Golgana" width="199" height="98" class="auth-brand__logo-img brand-logo">
          <span class="auth-brand__title">Polla Mundialista 2026</span>
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
          © 2026 Golgana · Términos · Privacidad
        </div>
      </aside>

      <!-- Formulario -->
      <section class="auth-form">
        <div class="auth-form__inner">

          <!-- Header mobile -->
          <div class="auth-mobile-head">
            <img src="assets/logo-golgana.png" alt="" class="auth-mobile-head__logo brand-logo--sm">
            <h1 class="auth-mobile-head__title">Golgana</h1>
            <div class="auth-mobile-head__kicker">Polla Mundialista 2026</div>
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
                inputmode="email"
                spellcheck="false"
                autocapitalize="off"
                required
                [(ngModel)]="email">
            </div>

            <div class="auth-field">
              <div class="auth-field-head">
                <label for="login-pwd" class="auth-label">Contraseña</label>
                <a routerLink="/forgot-password" class="auth-forgot">¿Olvidaste?</a>
              </div>
              <div class="auth-input-wrap">
                <input
                  [type]="showPwd() ? 'text' : 'password'"
                  id="login-pwd"
                  name="password"
                  class="auth-input"
                  placeholder="••••••••"
                  autocomplete="current-password"
                  spellcheck="false"
                  autocapitalize="off"
                  required
                  [(ngModel)]="password">
                <button type="button" class="auth-input-toggle"
                        (click)="showPwd.set(!showPwd())"
                        [attr.aria-label]="showPwd() ? 'Ocultar contraseña' : 'Mostrar contraseña'">
                  {{ showPwd() ? '👁️‍🗨️' : '👁' }}
                </button>
              </div>
            </div>

            @if (error()) {
              <p class="auth-error" role="alert">{{ error() }}</p>
            }

            <button
              type="submit"
              class="btn-wf btn-wf--block btn-wf--primary"
              style="padding:14px;font-size:14px;margin-top:4px;"
              [disabled]="loading()">
              {{ loading() ? 'Entrando…' : 'Entrar' }}
            </button>
          </form>

          <div class="auth-bottom">
            <span class="text-mute">¿Primera vez? </span>
            <a routerLink="/register"
               [queryParams]="forwardQueryParams()"
               queryParamsHandling="merge"
               class="auth-bottom__link">Crear cuenta <span aria-hidden="true">→</span></a>
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

    .auth-input-wrap {
      position: relative;
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
    .auth-input-toggle:focus-visible {
      outline: 2px solid var(--color-primary-green);
      outline-offset: 2px;
      border-radius: 4px;
      color: var(--wf-ink);
    }
  `],
})
export class LoginComponent implements OnInit {
  private auth = inject(AuthService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);

  email = '';
  password = '';
  loading = signal(false);
  error = signal<string | null>(null);
  showPwd = signal(false);

  ngOnInit() {
    // Pre-rellenar email desde query (típicamente viene de forgot-password
    // si el auto-login post-reset falló y nos redirigió acá).
    const qEmail = this.route.snapshot.queryParamMap.get('email');
    if (qEmail) this.email = qEmail;
  }

  async submit() {
    this.error.set(null);
    this.loading.set(true);
    try {
      await this.auth.login(this.email, this.password);
      void this.router.navigateByUrl(this.safeReturnUrl());
    } catch (e) {
      const err = e as { name?: string; message?: string };
      // Cognito UserNotConfirmedException: el user creó cuenta pero nunca
      // confirmó el OTP. Lo mandamos al flow de register paso 'confirm'
      // con email pre-llenado para que pueda completar el código.
      if (err?.name === 'UserNotConfirmedException') {
        // Bug #4 fix: el flow original perdía el password al redirigir a
        // /register?confirm=1. El submitConfirm allá hacía
        // `auth.login(email, '')` y fallaba silenciosamente. Stash el
        // password en sessionStorage para que register.component lo lea
        // post-OTP. Se borra apenas se completa el login (success path).
        try {
          sessionStorage.setItem('pending-confirm-password', this.password);
        } catch { /* sessionStorage puede estar deshabilitado */ }
        // Reenviar el código para que el user reciba uno nuevo (el
        // original puede haber expirado).
        try { await this.auth.resend(this.email); } catch { /* ignore */ }
        const returnUrl = this.route.snapshot.queryParamMap.get('returnUrl');
        void this.router.navigate(['/register'], {
          queryParams: {
            email: this.email,
            confirm: '1',
            ...(returnUrl ? { returnUrl } : {}),
          },
        });
        return;
      }
      this.error.set(err?.message ?? 'Credenciales inválidas');
    } finally {
      this.loading.set(false);
    }
  }

  /** Lee `?returnUrl=` del query string. Solo permite paths relativos al
   *  mismo origen — bloqueamos URLs externas / esquemas raros para evitar
   *  open-redirect a través de un login link manipulado. */
  private safeReturnUrl(): string {
    const raw = this.route.snapshot.queryParamMap.get('returnUrl');
    if (!raw) return '/home';
    if (!raw.startsWith('/') || raw.startsWith('//')) return '/home';
    return raw;
  }

  /** Propaga `returnUrl` al link "Crear cuenta" para que el flow de
   *  register termine también en el deep-link original. */
  forwardQueryParams() {
    const ret = this.route.snapshot.queryParamMap.get('returnUrl');
    return ret ? { returnUrl: ret } : null;
  }
}
