import { Component, HostListener, computed, inject, signal } from '@angular/core';
import { Router, RouterLink, RouterLinkActive } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { UserModesService, type UserGroup } from '../../core/user/user-modes.service';

type DropdownKey = 'groups' | 'picks' | 'rankings' | 'user' | null;

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
        <a routerLink="/picks" class="site-header__logo" aria-label="Polla Mundial 2026" (click)="closeAll()">
          <img src="assets/logo-golgana.png" alt="Golgana">
        </a>

        <nav class="site-header__nav" aria-label="Principal">
          @if (isAdmin()) {
            <!-- ADMIN-FOCUSED NAV: dashboard, grupos overview, rankings detallado -->
            <a class="nav-dd__btn" routerLink="/admin/groups-overview" routerLinkActive="is-active" (click)="closeAll()">
              Grupos
            </a>
            <a class="nav-dd__btn" routerLink="/admin/rankings-overview" routerLinkActive="is-active" (click)="closeAll()">
              Rankings
            </a>
            <a class="nav-dd__btn" routerLink="/admin" routerLinkActive="is-active" [routerLinkActiveOptions]="{ exact: true }" (click)="closeAll()">
              Admin
            </a>
          } @else {
          <!-- MIS GRUPOS -->
          <div class="nav-dd" (click)="$event.stopPropagation()">
            <button type="button" class="nav-dd__btn"
                    [class.is-active]="open() === 'groups'"
                    (click)="toggle('groups')">
              Mis grupos
              <span class="nav-dd__chevron" [class.is-open]="open() === 'groups'">▾</span>
            </button>
            @if (open() === 'groups') {
              <div class="user-menu__panel" role="menu">
                @if (myGroups().length === 0) {
                  <p class="user-menu__item" style="color: var(--color-text-muted); pointer-events: none;">
                    No estás en ningún grupo
                  </p>
                } @else {
                  @for (g of myGroups(); track g.id) {
                    <a class="user-menu__item" role="menuitem"
                       [routerLink]="['/groups', g.id]" (click)="closeAll()">
                      <span class="nav-dd__name">{{ g.name }}</span>
                      <span class="nav-dd__pill" [class.nav-dd__pill--complete]="g.mode === 'COMPLETE'">
                        {{ g.mode === 'COMPLETE' ? 'Completo' : 'Simple' }}
                      </span>
                    </a>
                  }
                }
                <hr class="user-menu__sep">
                <a class="user-menu__item" role="menuitem"
                   routerLink="/groups" (click)="closeAll()">Ver todos los grupos</a>
                <a class="user-menu__item" role="menuitem"
                   routerLink="/groups/new" (click)="closeAll()">+ Crear grupo nuevo</a>
              </div>
            }
          </div>

          <!-- MIS PICKS -->
          <div class="nav-dd" (click)="$event.stopPropagation()">
            <button type="button" class="nav-dd__btn"
                    [class.is-active]="open() === 'picks'"
                    (click)="toggle('picks')">
              Mis picks
              <span class="nav-dd__chevron" [class.is-open]="open() === 'picks'">▾</span>
            </button>
            @if (open() === 'picks') {
              <div class="user-menu__panel user-menu__panel--wide" role="menu">
                @if (!hasSimple() && !hasComplete()) {
                  <p class="user-menu__item" style="color: var(--color-text-muted); pointer-events: none;">
                    Únete o crea un grupo primero
                  </p>
                  <a class="user-menu__item" role="menuitem"
                     routerLink="/groups/new" (click)="closeAll()">+ Crear grupo</a>
                }
                @if (hasSimple()) {
                  <div class="user-menu__group">
                    <span class="user-menu__group-head">Modo simple</span>
                    <a class="user-menu__item user-menu__item--sub" role="menuitem"
                       [routerLink]="['/picks/group-stage']" [queryParams]="{ mode: 'SIMPLE' }" (click)="closeAll()">
                      Fase de grupos (Tabla)
                    </a>
                    <a class="user-menu__item user-menu__item--sub" role="menuitem"
                       [routerLink]="['/picks/bracket']" [queryParams]="{ mode: 'SIMPLE' }" (click)="closeAll()">
                      Fase eliminatoria (Bracket)
                    </a>
                    <a class="user-menu__item user-menu__item--sub" role="menuitem"
                       [routerLink]="['/profile/special-picks']" [queryParams]="{ mode: 'SIMPLE' }" (click)="closeAll()">
                      Picks especiales
                    </a>
                  </div>
                }
                @if (hasComplete()) {
                  @if (hasSimple()) { <hr class="user-menu__sep"> }
                  <div class="user-menu__group">
                    <span class="user-menu__group-head">Modo completo</span>
                    <a class="user-menu__item user-menu__item--sub" role="menuitem"
                       [routerLink]="['/picks/group-stage']" [queryParams]="{ mode: 'COMPLETE' }" (click)="closeAll()">
                      Fase de grupos (Tabla)
                    </a>
                    <a class="user-menu__item user-menu__item--sub" role="menuitem"
                       [routerLink]="['/picks/bracket']" [queryParams]="{ mode: 'COMPLETE' }" (click)="closeAll()">
                      Fase eliminatoria (Bracket)
                    </a>
                    <a class="user-menu__item user-menu__item--sub" role="menuitem"
                       routerLink="/picks" (click)="closeAll()">
                      Marcadores (Mis picks)
                    </a>
                    <a class="user-menu__item user-menu__item--sub" role="menuitem"
                       [routerLink]="['/profile/special-picks']" [queryParams]="{ mode: 'COMPLETE' }" (click)="closeAll()">
                      Picks especiales
                    </a>
                  </div>
                }
              </div>
            }
          </div>

          <!-- RANKINGS -->
          <div class="nav-dd" (click)="$event.stopPropagation()">
            <button type="button" class="nav-dd__btn"
                    [class.is-active]="open() === 'rankings'"
                    (click)="toggle('rankings')">
              Rankings
              <span class="nav-dd__chevron" [class.is-open]="open() === 'rankings'">▾</span>
            </button>
            @if (open() === 'rankings') {
              <div class="user-menu__panel" role="menu">
                @if (myGroups().length > 0) {
                  <span class="user-menu__group-head">Por grupo</span>
                  @for (g of myGroups(); track g.id) {
                    <a class="user-menu__item user-menu__item--sub" role="menuitem"
                       [routerLink]="['/groups', g.id]" (click)="closeAll()">
                      {{ g.name }}
                    </a>
                  }
                  @if (eligibleGlobal()) { <hr class="user-menu__sep"> }
                }
                @if (eligibleGlobal()) {
                  <a class="user-menu__item" role="menuitem"
                     routerLink="/ranking" (click)="closeAll()">
                    🌍 Ranking global
                  </a>
                } @else {
                  <p class="user-menu__item" style="color: var(--color-text-muted); pointer-events: none; font-size: var(--fs-xs);">
                    El ranking global requiere al menos un grupo en modo completo
                  </p>
                }
              </div>
            }
          </div>

          }
        </nav>

        <!-- User dropdown (desktop) -->
        <div class="user-menu" (click)="$event.stopPropagation()">
          <button class="site-header__user" type="button" aria-haspopup="true"
                  [attr.aria-expanded]="open() === 'user'" aria-label="Cuenta"
                  (click)="toggle('user')">
            <span class="site-header__avatar">{{ avatar() }}</span>
            <span class="site-header__handle">{{ '@' + (handle() ?? '') }}</span>
            <span class="user-menu__chevron" [class.is-open]="open() === 'user'" aria-hidden="true">▾</span>
          </button>
          @if (open() === 'user') {
            <div class="user-menu__panel" role="menu">
              <a class="user-menu__item" role="menuitem" (click)="goProfile()">
                <span class="user-menu__icon" aria-hidden="true">⚙</span>
                Editar perfil
              </a>
              <hr class="user-menu__sep">
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

    <!-- MOBILE DRAWER (flat, sin dropdowns anidados) -->
    <label for="drawer" class="drawer-backdrop" aria-hidden="true" (click)="closeDrawer()"></label>
    <aside class="drawer" aria-label="Menú móvil">
      @if (isAdmin()) {
        <h4 class="drawer__head">Admin</h4>
        <a routerLink="/admin" (click)="closeDrawer()">Dashboard</a>
        <a routerLink="/admin/groups-overview" (click)="closeDrawer()">Grupos (overview)</a>
        <a routerLink="/admin/rankings-overview" (click)="closeDrawer()">Rankings (detallado)</a>
        <a routerLink="/admin/fixtures" (click)="closeDrawer()">Partidos</a>
        <a routerLink="/admin/results" (click)="closeDrawer()">Resultados</a>
        <a routerLink="/admin/teams" (click)="closeDrawer()">Equipos</a>
        <a routerLink="/admin/users" (click)="closeDrawer()">Usuarios</a>
      } @else {
      <h4 class="drawer__head">Mis grupos</h4>
      @for (g of myGroups(); track g.id) {
        <a [routerLink]="['/groups', g.id]" routerLinkActive="is-active" (click)="closeDrawer()">
          {{ g.name }} <small style="color: var(--color-text-muted);">· {{ g.mode === 'COMPLETE' ? 'Completo' : 'Simple' }}</small>
        </a>
      }
      <a routerLink="/groups/new" (click)="closeDrawer()" style="color: var(--color-primary-green);">+ Crear grupo</a>

      @if (hasSimple() || hasComplete()) {
        <h4 class="drawer__head">Mis picks</h4>
        @if (hasSimple()) {
          <small style="color: var(--color-text-muted); padding: 4px 0; display: block;">Simple</small>
          <a [routerLink]="['/picks/group-stage']" [queryParams]="{ mode: 'SIMPLE' }" (click)="closeDrawer()">Tabla de grupos</a>
          <a [routerLink]="['/picks/bracket']" [queryParams]="{ mode: 'SIMPLE' }" (click)="closeDrawer()">Bracket</a>
          <a [routerLink]="['/profile/special-picks']" [queryParams]="{ mode: 'SIMPLE' }" (click)="closeDrawer()">Picks especiales</a>
        }
        @if (hasComplete()) {
          <small style="color: var(--color-text-muted); padding: 4px 0; display: block;">Completo</small>
          <a [routerLink]="['/picks/group-stage']" [queryParams]="{ mode: 'COMPLETE' }" (click)="closeDrawer()">Tabla de grupos</a>
          <a [routerLink]="['/picks/bracket']" [queryParams]="{ mode: 'COMPLETE' }" (click)="closeDrawer()">Bracket</a>
          <a routerLink="/picks" (click)="closeDrawer()">Marcadores</a>
          <a [routerLink]="['/profile/special-picks']" [queryParams]="{ mode: 'COMPLETE' }" (click)="closeDrawer()">Picks especiales</a>
        }
      }

      <h4 class="drawer__head">Rankings</h4>
      @for (g of myGroups(); track g.id) {
        <a [routerLink]="['/groups', g.id]" (click)="closeDrawer()">{{ g.name }}</a>
      }
      @if (eligibleGlobal()) {
        <a routerLink="/ranking" (click)="closeDrawer()">🌍 Ranking global</a>
      }
      }

      <h4 class="drawer__head">Cuenta</h4>
      <a routerLink="/profile" (click)="closeDrawer()">Editar perfil</a>
      <a (click)="logout()" style="cursor: pointer; color: var(--color-lost);">Cerrar sesión</a>
    </aside>
  `,
  styles: [`
    /* Dropdown botón en la nav. Reusa .user-menu__panel del global. */
    .nav-dd {
      position: relative;
      display: inline-block;
    }
    .nav-dd__btn {
      background: transparent;
      border: 0;
      color: inherit;
      font: inherit;
      padding: 8px 12px;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 4px;
      border-radius: var(--radius-sm);
      text-decoration: none;
    }
    .nav-dd__btn:hover { background: rgba(0,0,0,0.05); }
    .nav-dd__btn.is-active {
      background: rgba(0, 200, 100, 0.12);
      color: var(--color-primary-green);
    }
    .nav-dd__chevron {
      font-size: 10px;
      transition: transform 100ms;
    }
    .nav-dd__chevron.is-open { transform: rotate(180deg); }

    .nav-dd__name { flex: 1; }
    .nav-dd__pill {
      font-size: 9px;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      padding: 2px 6px;
      border-radius: 999px;
      background: rgba(255, 200, 0, 0.4);
      color: var(--color-primary-black);
      font-weight: 600;
    }
    .nav-dd__pill--complete {
      background: var(--color-primary-green);
      color: var(--color-primary-white);
    }

    /* Panel ancho para "Mis picks" porque tiene 2 columnas de items */
    :host ::ng-deep .user-menu__panel--wide { min-width: 240px; }
    :host ::ng-deep .user-menu__group { padding-bottom: 4px; }
    :host ::ng-deep .user-menu__group-head {
      display: block;
      padding: 8px 12px 4px;
      font-size: var(--fs-xs);
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: var(--color-primary-green);
      font-weight: var(--fw-semibold);
    }
    :host ::ng-deep .user-menu__item--sub {
      padding-left: 24px;
    }

    .drawer__head {
      padding: var(--space-md) 0 var(--space-xs);
      font-family: var(--font-display);
      font-size: var(--fs-md);
      text-transform: uppercase;
      line-height: 1;
      color: var(--color-primary-green);
      letter-spacing: 0.06em;
    }
  `],
})
export class NavComponent {
  private auth = inject(AuthService);
  private router = inject(Router);
  private userModes = inject(UserModesService);

  drawerOpen = signal(false);
  open = signal<DropdownKey>(null);

  isAdmin = computed(() => this.auth.user()?.isAdmin ?? false);
  handle = computed(() => this.auth.user()?.handle ?? null);
  avatar = computed(() => (this.handle() ?? '?')[0]?.toUpperCase() ?? '?');
  hasSimple = computed(() => this.userModes.hasSimple());
  hasComplete = computed(() => this.userModes.hasComplete());
  eligibleGlobal = computed(() => this.userModes.eligibleForGlobalRanking());
  myGroups = computed<UserGroup[]>(() => this.userModes.groups());

  toggle(key: DropdownKey) {
    this.open.update((cur) => (cur === key ? null : key));
  }
  closeAll() {
    this.open.set(null);
    this.drawerOpen.set(false);
  }
  closeDrawer() { this.drawerOpen.set(false); }

  @HostListener('document:click')
  onDocumentClick() { this.open.set(null); }

  @HostListener('document:keydown.escape')
  onEsc() {
    if (this.open()) this.open.set(null);
    else if (this.drawerOpen()) this.closeDrawer();
  }

  goProfile() {
    this.closeAll();
    void this.router.navigate(['/profile']);
  }

  async logout() {
    this.closeAll();
    await this.auth.logout();
    void this.router.navigate(['/login']);
  }
}
