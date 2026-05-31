import { Component, input } from '@angular/core';
import { SkeletonComponent } from '../skeleton/skeleton.component';

export interface PublicStats {
  totalUsers: number;
  totalGroups: number;
  totalPrizesAccrued: number;
}

/**
 * `<app-auth-brand-panel [stats]="stats()">` — Panel de marca compartido
 * en login + register + forgot-password (solo visible en desktop ≥ 992px,
 * el global CSS lo oculta en mobile).
 *
 * Estructura:
 *  - Top: logo + sub-title "Polla Mundialista 2026"
 *  - Middle: headline + descripción + stats (skeleton si no hay stats)
 *  - Footer: copyright + links legales (rel=noopener)
 *
 * Stats hoy vienen como stub hardcoded de los componentes padre (login etc.)
 * por la decisión de saltar A6 backend. Cuando se despliegue el lambda
 * getPublicStats, los padres simplemente cambiarán de signal stub a fetch.
 */
@Component({
  standalone: true,
  selector: 'app-auth-brand-panel',
  imports: [SkeletonComponent],
  styles: [`
    /* display: contents makes <app-auth-brand-panel> "invisible" for
       layout, so the <aside class="auth-brand"> inside becomes the
       direct flex child of .auth-shell — receiving flex: 1.1 + the
       100vh stretch that .auth-shell { display: flex; min-height: 100vh }
       expects. Without this, the custom element defaults to display:
       inline and the brand panel renders at content height instead of
       full viewport height. */
    :host { display: contents; }
  `],
  template: `
    <aside class="auth-brand">
      <div class="auth-brand__top">
        <img src="assets/logo-golgana.png" alt="Golgana" width="199" height="98" class="auth-brand__logo-img brand-logo">
        <span class="auth-brand__title">Polla Mundialista 2026</span>
      </div>

      <div>
        <h1 class="auth-brand__h1">
          Predice cada partido.<br>
          Gana contra tus amigos.
        </h1>
        <p class="auth-brand__sub">
          Crea grupos privados, asigna premios, gana comodines y demuestra
          quién sabe más de fútbol.
        </p>

        @if (stats(); as s) {
          <div class="auth-brand__stats">
            <div>
              <div class="num">{{ formatK(s.totalUsers) }}</div>
              <div class="lbl">Jugadores</div>
            </div>
            <div>
              <div class="num">{{ s.totalGroups }}</div>
              <div class="lbl">Grupos activos</div>
            </div>
            <div>
              <div class="num">{{ formatMoney(s.totalPrizesAccrued) }}</div>
              <div class="lbl">En premios</div>
            </div>
          </div>
        } @else {
          <app-skeleton variant="text" [count]="3" />
        }
      </div>

      <div class="auth-brand__foot">
        © {{ year }} Golgana ·
        <a href="https://polla.golgana.net/terminos" target="_blank" rel="noopener noreferrer">Términos</a> ·
        <a href="https://polla.golgana.net/privacidad" target="_blank" rel="noopener noreferrer">Privacidad</a>
      </div>
    </aside>
  `,
})
export class AuthBrandPanelComponent {
  stats = input<PublicStats | undefined>(undefined);
  readonly year = new Date().getFullYear();

  /** 2400 → "2.4k", 850 → "850". Para usuarios totales. */
  formatK(n: number): string {
    return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);
  }

  /** 15000 → "$15.0k", 0 → "—". Para premios acumulados. */
  formatMoney(n: number): string {
    return n > 0 ? `$${this.formatK(n)}` : '—';
  }
}
