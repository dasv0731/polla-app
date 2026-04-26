import { Component, computed, inject } from '@angular/core';
import { Router, RouterLink, RouterLinkActive } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';

@Component({
  standalone: true,
  selector: 'app-nav',
  imports: [RouterLink, RouterLinkActive],
  template: `
    <header class="site-header site-header--auth">
      <div class="site-header__inner">
        <a routerLink="/picks" class="site-header__logo" aria-label="Polla Mundial 2026">
          <img src="assets/logo-golgana.png" alt="Golgana">
        </a>
        <nav class="site-header__nav" aria-label="Principal">
          <a routerLink="/picks" routerLinkActive="is-active">Picks</a>
          <a routerLink="/groups" routerLinkActive="is-active">Mis grupos</a>
          <a routerLink="/ranking" routerLinkActive="is-active">Ranking</a>
          @if (isAdmin()) {
            <a routerLink="/admin" routerLinkActive="is-active">Admin</a>
          }
        </nav>
        <button class="site-header__user" aria-label="Cuenta" (click)="goProfile()">
          <span class="site-header__avatar">{{ avatar() }}</span>
          <span class="site-header__handle">{{ '@' + (handle() ?? '') }}</span>
        </button>
      </div>
    </header>
  `,
})
export class NavComponent {
  private auth = inject(AuthService);
  private router = inject(Router);

  isAdmin = computed(() => this.auth.user()?.isAdmin ?? false);
  handle = computed(() => this.auth.user()?.handle ?? null);
  avatar = computed(() => (this.handle() ?? '?')[0]?.toUpperCase() ?? '?');

  goProfile() {
    void this.router.navigate(['/profile']);
  }
}
