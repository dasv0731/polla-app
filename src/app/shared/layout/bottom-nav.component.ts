import { Component, computed, inject } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';

/**
 * Bottom navigation visible only on mobile (<768px). 5 icon items mapping to
 * the app's top-level destinations. Safe-area-inset-bottom respected. No
 * hamburger — these 5 cover ~95% of flows; the user dropdown lives in the
 * topbar.
 */
@Component({
  standalone: true,
  selector: 'app-bottom-nav',
  imports: [RouterLink, RouterLinkActive],
  template: `
    <nav class="bottom-nav" aria-label="Navegación principal">
      <a class="bottom-nav__item" routerLink="/home" routerLinkActive="is-active"
         [routerLinkActiveOptions]="{exact: true}">
        <span class="bottom-nav__icon" aria-hidden="true">🏠</span>
        <span class="bottom-nav__label">Home</span>
      </a>
      <a class="bottom-nav__item" routerLink="/picks" routerLinkActive="is-active">
        <span class="bottom-nav__icon" aria-hidden="true">⚽</span>
        <span class="bottom-nav__label">Picks</span>
      </a>
      <a class="bottom-nav__item" routerLink="/groups" routerLinkActive="is-active">
        <span class="bottom-nav__icon" aria-hidden="true">👥</span>
        <span class="bottom-nav__label">Grupos</span>
      </a>
      <a class="bottom-nav__item" routerLink="/ranking" routerLinkActive="is-active">
        <span class="bottom-nav__icon" aria-hidden="true">🏆</span>
        <span class="bottom-nav__label">Ranking</span>
      </a>
      <a class="bottom-nav__item" routerLink="/profile" routerLinkActive="is-active">
        <span class="bottom-nav__icon" aria-hidden="true">👤</span>
        <span class="bottom-nav__label">Perfil</span>
      </a>
    </nav>
  `,
  styles: [`
    :host { display: contents; }

    .bottom-nav {
      position: fixed;
      bottom: 0; left: 0; right: 0;
      display: none;
      grid-template-columns: repeat(5, 1fr);
      background: var(--wf-paper);
      border-top: 1px solid var(--wf-line);
      padding: 6px 0 calc(6px + env(safe-area-inset-bottom));
      z-index: 50;
    }
    @media (max-width: 767px) {
      .bottom-nav { display: grid; }
    }
    .bottom-nav__item {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 2px;
      padding: 6px 4px;
      color: var(--wf-ink-3);
      text-decoration: none;
      min-height: 48px;
      transition: color 150ms;
    }
    .bottom-nav__item.is-active {
      color: var(--wf-green-ink);
    }
    .bottom-nav__item.is-active .bottom-nav__label {
      font-weight: 700;
    }
    .bottom-nav__icon { font-size: 22px; line-height: 1; }
    .bottom-nav__label {
      font-size: 10px;
      letter-spacing: .03em;
    }
  `],
})
export class BottomNavComponent {
  private auth = inject(AuthService);
  // Inject reserved for future role-based filtering of nav items.
  readonly hasAuth = computed(() => this.auth.user() != null);
}
