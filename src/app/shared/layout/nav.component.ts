import { Component, HostListener, computed, inject, signal } from '@angular/core';
import { Router, RouterLink, RouterLinkActive } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';

@Component({
  standalone: true,
  selector: 'app-nav',
  imports: [RouterLink, RouterLinkActive],
  template: `
    <input type="checkbox" id="drawer" class="drawer-toggle sr-only"
           [checked]="drawerOpen()"
           (change)="drawerOpen.set($any($event.target).checked)">
    <header class="site-header site-header--auth">
      <div class="site-header__inner">
        <a routerLink="/picks" class="site-header__logo" aria-label="Polla Mundial 2026" (click)="closeDrawer()">
          <img src="assets/logo-golgana.png" alt="Golgana">
        </a>
        <nav class="site-header__nav" aria-label="Principal">
          <a routerLink="/picks" routerLinkActive="is-active">Picks</a>
          <a routerLink="/picks/group-stage" routerLinkActive="is-active">Tabla de grupos</a>
          <a routerLink="/groups" routerLinkActive="is-active">Mis grupos</a>
          <a routerLink="/ranking" routerLinkActive="is-active">Ranking</a>
          @if (isAdmin()) {
            <a routerLink="/admin" routerLinkActive="is-active">Admin</a>
          }
        </nav>

        <!-- User dropdown (desktop) -->
        <div class="user-menu" (click)="$event.stopPropagation()">
          <button
            class="site-header__user"
            type="button"
            aria-haspopup="true"
            [attr.aria-expanded]="userMenuOpen()"
            aria-label="Cuenta"
            (click)="toggleUserMenu()"
          >
            <span class="site-header__avatar">{{ avatar() }}</span>
            <span class="site-header__handle">{{ '@' + (handle() ?? '') }}</span>
            <span class="user-menu__chevron" [class.is-open]="userMenuOpen()" aria-hidden="true">▾</span>
          </button>
          @if (userMenuOpen()) {
            <div class="user-menu__panel" role="menu">
              <a class="user-menu__item" role="menuitem" (click)="goProfile()">
                <span class="user-menu__icon" aria-hidden="true">⚙</span>
                Editar perfil
              </a>
              <a class="user-menu__item" role="menuitem" routerLink="/profile/special-picks" (click)="closeUserMenu()">
                <span class="user-menu__icon" aria-hidden="true">★</span>
                Picks especiales
              </a>
              <hr class="user-menu__sep" />
              <a class="user-menu__item user-menu__item--danger" role="menuitem" (click)="logout()">
                <span class="user-menu__icon" aria-hidden="true">⏻</span>
                Cerrar sesión
              </a>
            </div>
          }
        </div>

        <label for="drawer" class="drawer-btn" aria-label="Abrir menú">
          <span></span><span></span><span></span>
        </label>
      </div>
    </header>

    <label for="drawer" class="drawer-backdrop" aria-hidden="true" (click)="closeDrawer()"></label>
    <aside class="drawer" aria-label="Menú móvil">
      <a routerLink="/picks" routerLinkActive="is-active" (click)="closeDrawer()">Picks</a>
      <a routerLink="/picks/group-stage" routerLinkActive="is-active" (click)="closeDrawer()">Tabla de grupos</a>
      <a routerLink="/groups" routerLinkActive="is-active" (click)="closeDrawer()">Mis grupos</a>
      <a routerLink="/ranking" routerLinkActive="is-active" (click)="closeDrawer()">Ranking</a>
      <a routerLink="/profile" routerLinkActive="is-active" (click)="closeDrawer()">Editar perfil</a>
      <a routerLink="/profile/special-picks" routerLinkActive="is-active" (click)="closeDrawer()">Picks especiales</a>
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
  userMenuOpen = signal(false);
  isAdmin = computed(() => this.auth.user()?.isAdmin ?? false);
  handle = computed(() => this.auth.user()?.handle ?? null);
  avatar = computed(() => (this.handle() ?? '?')[0]?.toUpperCase() ?? '?');

  toggleUserMenu() { this.userMenuOpen.update((v) => !v); }
  closeUserMenu() { this.userMenuOpen.set(false); }
  closeDrawer() { this.drawerOpen.set(false); }

  // Click anywhere outside the dropdown closes it.
  @HostListener('document:click')
  onDocumentClick() {
    if (this.userMenuOpen()) this.closeUserMenu();
  }

  // Esc closes the dropdown for keyboard users.
  @HostListener('document:keydown.escape')
  onEsc() {
    if (this.userMenuOpen()) this.closeUserMenu();
    if (this.drawerOpen()) this.closeDrawer();
  }

  goProfile() {
    this.closeUserMenu();
    this.closeDrawer();
    void this.router.navigate(['/profile']);
  }

  async logout() {
    this.closeUserMenu();
    this.closeDrawer();
    await this.auth.logout();
    void this.router.navigate(['/login']);
  }
}
