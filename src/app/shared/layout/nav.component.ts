import { Component, computed, inject, signal } from '@angular/core';
import { Router, RouterLink, RouterLinkActive } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';

@Component({
  standalone: true,
  selector: 'app-nav',
  imports: [RouterLink, RouterLinkActive],
  template: `
    <input type="checkbox" id="drawer" class="drawer-toggle sr-only" [checked]="drawerOpen()" (change)="drawerOpen.set($any($event.target).checked)">
    <header class="site-header site-header--auth">
      <div class="site-header__inner">
        <a routerLink="/picks" class="site-header__logo" aria-label="Polla Mundial 2026" (click)="closeDrawer()">
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
        <label for="drawer" class="drawer-btn" aria-label="Abrir menú">
          <span></span><span></span><span></span>
        </label>
      </div>
    </header>
    <label for="drawer" class="drawer-backdrop" aria-hidden="true" (click)="closeDrawer()"></label>
    <aside class="drawer" aria-label="Menú móvil">
      <a routerLink="/picks" routerLinkActive="is-active" (click)="closeDrawer()">Picks</a>
      <a routerLink="/groups" routerLinkActive="is-active" (click)="closeDrawer()">Mis grupos</a>
      <a routerLink="/ranking" routerLinkActive="is-active" (click)="closeDrawer()">Ranking</a>
      <a routerLink="/profile" routerLinkActive="is-active" (click)="closeDrawer()">Perfil</a>
      @if (isAdmin()) {
        <a routerLink="/admin" routerLinkActive="is-active" (click)="closeDrawer()">Admin</a>
      }
      <a (click)="logout()" style="cursor: pointer; color: var(--color-lost);">Cerrar sesión</a>
    </aside>
  `,
})
export class NavComponent {
  private auth = inject(AuthService);
  private router = inject(Router);

  drawerOpen = signal(false);
  isAdmin = computed(() => this.auth.user()?.isAdmin ?? false);
  handle = computed(() => this.auth.user()?.handle ?? null);
  avatar = computed(() => (this.handle() ?? '?')[0]?.toUpperCase() ?? '?');

  goProfile() {
    this.closeDrawer();
    void this.router.navigate(['/profile']);
  }

  closeDrawer() { this.drawerOpen.set(false); }

  async logout() {
    this.closeDrawer();
    await this.auth.logout();
    void this.router.navigate(['/login']);
  }
}
