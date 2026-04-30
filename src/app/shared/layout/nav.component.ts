import { Component, HostListener, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { Router, RouterLink, RouterLinkActive } from '@angular/router';
import { ApiService } from '../../core/api/api.service';
import { AuthService } from '../../core/auth/auth.service';
import { UserModesService, type UserGroup } from '../../core/user/user-modes.service';

type DropdownKey = 'groups' | 'picks' | 'rankings' | 'user' | null;

@Component({
  standalone: true,
  selector: 'app-nav',
  imports: [RouterLink, RouterLinkActive],
  template: `
    <!-- ============ DESKTOP NAV (≥992px) ============ -->
    <header class="wf-desk-nav app-nav-desktop">
      <div class="wf-row" style="align-items: center;">
        <a routerLink="/picks" class="wf-topbar__brand app-nav__brand-link" aria-label="Polla Mundial 2026" (click)="closeAll()">
          <span class="wf-topbar__logo">⚽</span>
          <span class="wf-topbar__title">POLLA</span>
        </a>
        <nav class="wf-desk-nav__menu" aria-label="Principal">
          @if (isAdmin()) {
            <a class="wf-desk-nav__item" routerLink="/admin" routerLinkActive="is-active" [routerLinkActiveOptions]="{exact: true}" (click)="closeAll()">Dashboard</a>
            <a class="wf-desk-nav__item" routerLink="/admin/groups-overview" routerLinkActive="is-active" (click)="closeAll()">Grupos</a>
            <a class="wf-desk-nav__item" routerLink="/admin/rankings-overview" routerLinkActive="is-active" (click)="closeAll()">Rankings</a>
            <a class="wf-desk-nav__item" routerLink="/admin/fixtures" routerLinkActive="is-active" (click)="closeAll()">Partidos</a>
          } @else {
            <a class="wf-desk-nav__item" routerLink="/picks" routerLinkActive="is-active" (click)="closeAll()">Mis picks</a>
            <a class="wf-desk-nav__item" routerLink="/groups" routerLinkActive="is-active" (click)="closeAll()">Grupos</a>
            <a class="wf-desk-nav__item" routerLink="/ranking" routerLinkActive="is-active" (click)="closeAll()">Ranking</a>
          }
        </nav>
      </div>

      <div class="wf-row wf-row--gap-sm" style="align-items: center;">
        <a routerLink="/notificaciones" class="wf-topbar__bell app-nav__bell" aria-label="Notificaciones" (click)="closeAll()">
          🔔
          @if (unreadCount() > 0) { <span class="wf-topbar__bell-badge">{{ unreadCount() }}</span> }
        </a>
        <div class="user-menu app-nav__user-anchor" (click)="$event.stopPropagation()">
          <button class="app-nav__user-btn" type="button" aria-haspopup="true"
                  [attr.aria-expanded]="open() === 'user'" aria-label="Cuenta"
                  (click)="toggle('user')">
            <span class="wf-topbar__avatar">{{ avatar() }}</span>
            <span class="wf-text-bold" style="font-size: 13px;">{{ '@' + (handle() ?? '') }}</span>
            <span class="user-menu__chevron" [class.is-open]="open() === 'user'" aria-hidden="true">▾</span>
          </button>
          @if (open() === 'user') {
            <div class="user-menu__panel" role="menu">
              @if (hasComplete()) {
                <a class="user-menu__item" role="menuitem" (click)="goComodines()">
                  <span class="user-menu__icon" aria-hidden="true">🃏</span>
                  Mis comodines
                </a>
              }
              <a class="user-menu__item" role="menuitem" (click)="goSpecialPicks()">
                <span class="user-menu__icon" aria-hidden="true">⭐</span>
                Picks especiales
              </a>
              <a class="user-menu__item" role="menuitem" (click)="goNotifications()">
                <span class="user-menu__icon" aria-hidden="true">🔔</span>
                Notificaciones
                @if (unreadCount() > 0) {
                  <span class="app-nav__pill-count">{{ unreadCount() }}</span>
                }
              </a>
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
      </div>
    </header>

    <!-- ============ MOBILE TOPBAR (<992px) ============ -->
    <header class="wf-topbar app-nav-mobile">
      <a routerLink="/picks" class="wf-topbar__brand app-nav__brand-link" aria-label="Polla" (click)="closeAll()">
        <span class="wf-topbar__logo">⚽</span>
        <span class="wf-topbar__title">POLLA</span>
      </a>
      <div class="wf-topbar__icons">
        <a routerLink="/notificaciones" class="wf-topbar__bell" aria-label="Notificaciones" (click)="closeAll()">
          🔔
          @if (unreadCount() > 0) { <span class="wf-topbar__bell-badge">{{ unreadCount() }}</span> }
        </a>
        <button class="app-nav__avatar-btn" type="button" aria-label="Cuenta"
                (click)="toggle('user'); $event.stopPropagation()">
          <span class="wf-topbar__avatar">{{ avatar() }}</span>
        </button>
      </div>
    </header>

    <!-- Mobile user menu (anchored top-right under avatar) -->
    @if (open() === 'user') {
      <div class="user-menu__panel app-nav__mobile-menu" role="menu" (click)="$event.stopPropagation()">
        @if (hasComplete()) {
          <a class="user-menu__item" role="menuitem" (click)="goComodines()">🃏 Mis comodines</a>
        }
        <a class="user-menu__item" role="menuitem" (click)="goSpecialPicks()">⭐ Picks especiales</a>
        <a class="user-menu__item" role="menuitem" (click)="goNotifications()">
          🔔 Notificaciones
          @if (unreadCount() > 0) { <span class="app-nav__pill-count">{{ unreadCount() }}</span> }
        </a>
        <a class="user-menu__item" role="menuitem" (click)="goProfile()">⚙ Editar perfil</a>
        @if (isAdmin()) {
          <hr class="user-menu__sep">
          <a class="user-menu__item" role="menuitem" routerLink="/admin/fixtures" (click)="closeAll()">🛠 Partidos</a>
          <a class="user-menu__item" role="menuitem" routerLink="/admin/results" (click)="closeAll()">📋 Resultados</a>
          <a class="user-menu__item" role="menuitem" routerLink="/admin/teams" (click)="closeAll()">🏳 Equipos</a>
          <a class="user-menu__item" role="menuitem" routerLink="/admin/sponsors" (click)="closeAll()">🎁 Sponsors</a>
          <a class="user-menu__item" role="menuitem" routerLink="/admin/users" (click)="closeAll()">👥 Usuarios</a>
        }
        <hr class="user-menu__sep">
        <a class="user-menu__item user-menu__item--danger" role="menuitem" (click)="logout()">⏻ Cerrar sesión</a>
      </div>
    }

    <!-- ============ MOBILE TABBAR (<992px) ============ -->
    <nav class="wf-tabbar app-nav-tabbar" aria-label="Navegación principal">
      @if (isAdmin()) {
        <a class="wf-tabbar__item" routerLink="/admin" routerLinkActive="is-active" [routerLinkActiveOptions]="{exact: true}" (click)="closeAll()">
          <span class="wf-tabbar__icon">🏠</span><span>Home</span>
        </a>
        <a class="wf-tabbar__item" routerLink="/admin/groups-overview" routerLinkActive="is-active" (click)="closeAll()">
          <span class="wf-tabbar__icon">👥</span><span>Grupos</span>
        </a>
        <a class="wf-tabbar__item" routerLink="/admin/rankings-overview" routerLinkActive="is-active" (click)="closeAll()">
          <span class="wf-tabbar__icon">🏆</span><span>Rankings</span>
        </a>
        <a class="wf-tabbar__item" routerLink="/admin/fixtures" routerLinkActive="is-active" (click)="closeAll()">
          <span class="wf-tabbar__icon">🛠</span><span>Partidos</span>
        </a>
      } @else {
        <a class="wf-tabbar__item" routerLink="/picks" routerLinkActive="is-active" (click)="closeAll()">
          <span class="wf-tabbar__icon">⚽</span><span>Picks</span>
        </a>
        <a class="wf-tabbar__item" routerLink="/groups" routerLinkActive="is-active" (click)="closeAll()">
          <span class="wf-tabbar__icon">👥</span><span>Grupos</span>
        </a>
        <a class="wf-tabbar__item" routerLink="/ranking" routerLinkActive="is-active" (click)="closeAll()">
          <span class="wf-tabbar__icon">🏆</span><span>Ranking</span>
        </a>
        <a class="wf-tabbar__item" routerLink="/profile" routerLinkActive="is-active" (click)="closeAll()">
          <span class="wf-tabbar__icon">👤</span><span>Perfil</span>
        </a>
      }
    </nav>
  `,
  styles: [`
    /* ===========================================================
       Visibility: desktop nav ≥992px, mobile topbar+tabbar <992px
       =========================================================== */
    .app-nav-desktop { display: none; }
    .app-nav-mobile  { display: flex; }
    .app-nav-tabbar  {
      position: fixed;
      bottom: 0; left: 0; right: 0;
      z-index: 50;
      box-shadow: 0 -2px 12px rgba(0,0,0,0.06);
    }

    @media (min-width: 992px) {
      .app-nav-desktop { display: flex; }
      .app-nav-mobile  { display: none; }
      .app-nav-tabbar  { display: none; }
    }

    /* Brand link sin underline */
    .app-nav__brand-link { text-decoration: none; color: inherit; }
    .app-nav__brand-link:hover { text-decoration: none; }

    /* Bell común */
    .app-nav__bell { font-size: 16px; }

    /* Avatar btn (mobile) — botón sin border */
    .app-nav__avatar-btn {
      background: transparent;
      border: 0;
      padding: 0;
      cursor: pointer;
    }

    /* User dropdown desktop */
    .app-nav__user-anchor { position: relative; }
    .app-nav__user-btn {
      background: transparent;
      border: 0;
      padding: 4px 8px;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 8px;
      border-radius: 6px;
      font: inherit;
    }
    .app-nav__user-btn:hover { background: rgba(0,0,0,0.04); }

    /* Mobile user menu — anchored top-right under topbar */
    :host ::ng-deep .app-nav__mobile-menu {
      position: fixed;
      top: 56px;
      right: 12px;
      min-width: 220px;
      z-index: 60;
    }
    @media (min-width: 992px) { :host ::ng-deep .app-nav__mobile-menu { display: none; } }

    /* Pill count para badges en items del dropdown */
    .app-nav__pill-count {
      margin-left: auto;
      background: var(--wf-green);
      color: white;
      padding: 2px 8px;
      border-radius: 999px;
      font-size: 11px;
      font-weight: 700;
    }

    /* Active state para wf-tabbar items via routerLinkActive */
    :host ::ng-deep .wf-tabbar__item.is-active {
      color: var(--wf-green-ink);
    }
    :host ::ng-deep .wf-tabbar__item.is-active .wf-tabbar__icon {
      color: var(--wf-green);
    }

    /* Active state para wf-desk-nav__item via routerLinkActive */
    :host ::ng-deep .wf-desk-nav__item.is-active {
      background: var(--wf-green-soft);
      color: var(--wf-green-ink);
    }

    /* Padding-bottom global del :host para que el contenido no quede
       tapado por la tabbar fija en mobile. La tabbar mide ~60px. */
    @media (max-width: 991px) {
      :host { display: block; padding-bottom: 64px; }
    }
  `],
})
export class NavComponent implements OnInit, OnDestroy {
  private auth = inject(AuthService);
  private api = inject(ApiService);
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
  // Dropdown desktop limita a 3 grupos para no llenar la pantalla;
  // si el user tiene más, hint "+ N más" + link "Ver todos los grupos".
  topGroups = computed<UserGroup[]>(() => this.myGroups().slice(0, 3));

  // Badge de notificaciones unread. AppSync subscription via observeQuery
  // mantiene el contador en tiempo real (sin polling). El Observable
  // se cancela en ngOnDestroy para evitar leaks.
  unreadCount = signal(0);
  private notifSub: { unsubscribe: () => void } | undefined;

  async ngOnInit() {
    const userId = this.auth.user()?.sub;
    if (!userId) return;
    // Initial count + live updates
    this.notifSub = this.api.observeMyNotifications(userId).subscribe({
      next: (snap) => {
        const items = snap.items as Array<{ readAt: string | null }>;
        const unread = items.filter((n) => !n.readAt).length;
        this.unreadCount.set(unread);
      },
      error: (err: unknown) => {
        // eslint-disable-next-line no-console
        console.warn('[nav] notification subscription error', err);
      },
    });
  }

  ngOnDestroy() {
    if (this.notifSub) this.notifSub.unsubscribe();
  }

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

  goComodines() {
    this.closeAll();
    void this.router.navigate(['/mis-comodines']);
  }

  goNotifications() {
    this.closeAll();
    void this.router.navigate(['/notificaciones']);
  }

  goSpecialPicks() {
    this.closeAll();
    void this.router.navigate(['/profile/special-picks']);
  }

  goToGroup(id: string) {
    this.closeAll();
    void this.router.navigate(['/groups', id]);
  }
  goToGroups() {
    this.closeAll();
    void this.router.navigate(['/groups']);
  }
  goToGroupsNew() {
    this.closeAll();
    void this.router.navigate(['/groups/new']);
  }
  /** Lleva al user al form de unirse-con-código en /groups (anchor #unirme). */
  goToGroupsJoin() {
    this.closeAll();
    void this.router.navigate(['/groups'], { fragment: 'unirme' });
  }

  goToRankingGrupos() {
    this.closeAll();
    void this.router.navigate(['/ranking'], { queryParams: { scope: 'grupos' } });
  }
  goToRankingGlobal() {
    this.closeAll();
    void this.router.navigate(['/ranking'], { queryParams: { scope: 'global' } });
  }

  async logout() {
    this.closeAll();
    await this.auth.logout();
    void this.router.navigate(['/login']);
  }
}
