import { Component, inject } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';

/**
 * Footer global de la app autenticada. Mismo HTML/CSS que el footer
 * público (.site-footer / .site-footer__grid del page-shell.css), con
 * los enlaces ajustados a las rutas internas. Mantiene la marca y las
 * 4 columnas: brand · Polla · Cuenta · Legal.
 */
@Component({
  standalone: true,
  selector: 'app-footer',
  imports: [RouterLink],
  template: `
    <footer class="site-footer">
      <div class="site-footer__grid">
        <div class="site-footer__brand">
          <img src="assets/logo-golgana.png" alt="Golgana">
          <p>
            Polla Mundialista — sub-módulo de
            <a href="https://golgana.net" style="color: var(--color-primary-green);">Golgana</a>
            para la FIFA World Cup 2026. Gratis, sin gambling, sin trampas.
          </p>
        </div>
        <div class="site-footer__col">
          <h4>Polla</h4>
          <a href="https://polla.golgana.net/reglas" target="_blank" rel="noopener">Reglas</a>
          <a routerLink="/ranking">Ranking global</a>
          <a routerLink="/picks">Mis picks</a>
          <a routerLink="/picks/group-stage">Tabla de grupos</a>
          <a routerLink="/picks/bracket">Bracket</a>
        </div>
        <div class="site-footer__col">
          <h4>Cuenta</h4>
          <a routerLink="/profile">Editar perfil</a>
          <a routerLink="/groups">Mis grupos</a>
          <a (click)="logout()" style="cursor: pointer;">Cerrar sesión</a>
        </div>
        <div class="site-footer__col">
          <h4>Legal</h4>
          <a href="https://polla.golgana.net/privacidad" target="_blank" rel="noopener">Privacidad</a>
          <a href="https://polla.golgana.net/terminos" target="_blank" rel="noopener">Términos</a>
          <a href="https://golgana.net" target="_blank" rel="noopener">Golgana</a>
        </div>
      </div>
      <hr class="site-footer__divider">
      <p class="site-footer__copy">© {{ year }} Golgana — Polla Mundialista</p>
    </footer>
  `,
})
export class FooterComponent {
  private auth = inject(AuthService);
  private router = inject(Router);

  year = new Date().getFullYear();

  async logout() {
    await this.auth.logout();
    void this.router.navigate(['/login']);
  }
}
