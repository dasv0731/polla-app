import { Component, computed, inject } from '@angular/core';
import { Router, RouterLink, RouterLinkActive } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';

@Component({
  standalone: true,
  selector: 'app-nav',
  imports: [RouterLink, RouterLinkActive],
  template: `
    <header class="site-header site-header--auth">
      <a routerLink="/picks" class="site-header__logo">Polla</a>
      <nav class="site-header__nav">
        <a routerLink="/picks" routerLinkActive="is-active">Picks</a>
        <a routerLink="/groups" routerLinkActive="is-active">Grupos</a>
        <a routerLink="/ranking" routerLinkActive="is-active">Ranking</a>
        <a routerLink="/profile" routerLinkActive="is-active">Perfil</a>
        @if (isAdmin()) { <a routerLink="/admin" routerLinkActive="is-active">Admin</a> }
      </nav>
      <div class="site-header__userbox">
        <span>{{ '@' + (handle() ?? '') }}</span>
        <button class="btn btn--ghost btn--sm" (click)="logout()">Salir</button>
      </div>
    </header>
  `,
})
export class NavComponent {
  private auth = inject(AuthService);
  private router = inject(Router);

  isAdmin = computed(() => this.auth.user()?.isAdmin ?? false);
  handle = computed(() => this.auth.user()?.handle ?? null);

  async logout() {
    await this.auth.logout();
    void this.router.navigate(['/login']);
  }
}
