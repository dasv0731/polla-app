import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  standalone: true,
  selector: 'app-auth-shell',
  imports: [RouterLink],
  template: `
    <div class="auth-shell">
      <header class="auth-header">
        <div class="auth-header__inner">
          <a routerLink="/login" class="auth-header__logo" aria-label="Polla Mundial 2026">
            <img src="assets/logo-golgana.png" alt="Golgana" width="199" height="98">
          </a>
          <a routerLink="/login" class="auth-header__back">← Volver al inicio</a>
        </div>
      </header>

      <main class="auth-main">
        <ng-content />
      </main>

      <footer class="auth-footer">
        © 2026 <span translate="no">Golgana</span>
      </footer>
    </div>
  `,
})
export class AuthShellComponent {}
