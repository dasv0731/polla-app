import { Component, HostListener, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { Router, RouterLink, RouterLinkActive } from '@angular/router';
import { ApiService } from '../../core/api/api.service';
import { AuthService } from '../../core/auth/auth.service';
import { UserModesService, type UserGroup } from '../../core/user/user-modes.service';

type DropdownKey = 'user' | null;

@Component({
  standalone: true,
  selector: 'app-nav',
  imports: [RouterLink, RouterLinkActive],
  template: `
    <!-- ============ DESKTOP TOPNAV (≥992px) ============ -->
    <header class="app-topnav">
      <div class="app-topnav__left">
        <a routerLink="/home" class="app-topnav__brand" aria-label="Polla Mundial 2026" (click)="closeAll()">
          <span class="app-topnav__logo">⚽</span>
          <span class="app-topnav__title">POLLA</span>
        </a>
        <nav class="app-topnav__menu" aria-label="Principal">
          @if (isAdmin()) {
            <a class="app-topnav__item" routerLink="/admin" routerLinkActive="is-active" [routerLinkActiveOptions]="{exact: true}" (click)="closeAll()">Dashboard</a>
            <a class="app-topnav__item" routerLink="/admin/groups-overview" routerLinkActive="is-active" (click)="closeAll()">Grupos</a>
            <a class="app-topnav__item" routerLink="/admin/rankings-overview" routerLinkActive="is-active" (click)="closeAll()">Rankings</a>
            <a class="app-topnav__item" routerLink="/admin/fixtures" routerLinkActive="is-active" (click)="closeAll()">Partidos</a>
          } @else {
            <a class="app-topnav__item" routerLink="/picks" routerLinkActive="is-active" (click)="closeAll()">Mis picks</a>
            <a class="app-topnav__item" routerLink="/groups" routerLinkActive="is-active" (click)="closeAll()">Grupos</a>
            <a class="app-topnav__item" routerLink="/ranking" routerLinkActive="is-active" (click)="closeAll()">Ranking</a>
          }
        </nav>
      </div>

      <div class="app-topnav__right">
        <a routerLink="/notificaciones" class="app-topnav__bell" aria-label="Notificaciones" (click)="closeAll()">
          🔔
          @if (unreadCount() > 0) { <span class="badge">{{ unreadCount() }}</span> }
        </a>
        <a routerLink="/profile" class="app-topnav__user" (click)="closeAll()">
          <span class="avatar">{{ avatar() }}</span>
          <span class="name">{{ '@' + (handle() ?? '') }}</span>
        </a>
      </div>
    </header>

    <!-- ============ MOBILE TOPBAR (<992px) ============ -->
    <header class="app-topbar">
      <a routerLink="/home" class="app-topbar__brand" aria-label="Polla" (click)="closeAll()">
        <span class="app-topbar__logo">⚽</span>
        <span class="app-topbar__title">POLLA</span>
      </a>
      <div class="app-topbar__actions">
        <a routerLink="/notificaciones" class="app-topbar__bell" aria-label="Notificaciones" (click)="closeAll()">
          🔔
          @if (unreadCount() > 0) { <span class="badge">{{ unreadCount() }}</span> }
        </a>
        <button class="app-topbar__avatar" type="button" aria-label="Cuenta"
                (click)="toggle('user'); $event.stopPropagation()">{{ avatar() }}</button>
      </div>
    </header>

    <!-- Mobile user menu (anclado top-right bajo el avatar) -->
    @if (open() === 'user') {
      <div class="mobile-menu" role="menu" (click)="$event.stopPropagation()">
        @if (hasComplete()) {
          <a class="mobile-menu__item" role="menuitem" (click)="goComodines()">🃏 Mis comodines</a>
        }
        <a class="mobile-menu__item" role="menuitem" (click)="goSpecialPicks()">⭐ Picks especiales</a>
        <a class="mobile-menu__item" role="menuitem" (click)="goNotifications()">
          🔔 Notificaciones
          @if (unreadCount() > 0) { <span class="pill pill--solid">{{ unreadCount() }}</span> }
        </a>
        <a class="mobile-menu__item" role="menuitem" (click)="goProfile()">⚙ Editar perfil</a>
        @if (isAdmin()) {
          <hr class="mobile-menu__sep">
          <a class="mobile-menu__item" role="menuitem" routerLink="/admin/fixtures" (click)="closeAll()">🛠 Partidos</a>
          <a class="mobile-menu__item" role="menuitem" routerLink="/admin/results" (click)="closeAll()">📋 Resultados</a>
          <a class="mobile-menu__item" role="menuitem" routerLink="/admin/teams" (click)="closeAll()">🏳 Equipos</a>
          <a class="mobile-menu__item" role="menuitem" routerLink="/admin/sponsors" (click)="closeAll()">🎁 Sponsors</a>
          <a class="mobile-menu__item" role="menuitem" routerLink="/admin/users" (click)="closeAll()">👥 Usuarios</a>
        }
        <hr class="mobile-menu__sep">
        <a class="mobile-menu__item mobile-menu__item--danger" role="menuitem" (click)="logout()">⏻ Cerrar sesión</a>
      </div>
    }

    <!-- ============ SIDEBAR DESKTOP (≥992px) ============ -->
    <aside class="app-sidebar">
      @if (isAdmin()) {
        <div class="app-sidebar__section">
          <div class="app-sidebar__kicker">Admin</div>
          <a class="sidebar-row" routerLink="/admin" routerLinkActive="is-active" [routerLinkActiveOptions]="{exact: true}">
            <span><span class="sidebar-row__icon">🏠</span>Dashboard</span>
          </a>
          <a class="sidebar-row" routerLink="/admin/groups-overview" routerLinkActive="is-active">
            <span><span class="sidebar-row__icon">👥</span>Grupos</span>
          </a>
          <a class="sidebar-row" routerLink="/admin/rankings-overview" routerLinkActive="is-active">
            <span><span class="sidebar-row__icon">🏆</span>Rankings</span>
          </a>
          <a class="sidebar-row" routerLink="/admin/fixtures" routerLinkActive="is-active">
            <span><span class="sidebar-row__icon">⚽</span>Partidos</span>
          </a>
          <a class="sidebar-row" routerLink="/admin/results" routerLinkActive="is-active">
            <span><span class="sidebar-row__icon">📋</span>Resultados</span>
          </a>
          <a class="sidebar-row" routerLink="/admin/teams" routerLinkActive="is-active">
            <span><span class="sidebar-row__icon">🏳</span>Equipos</span>
          </a>
          <a class="sidebar-row" routerLink="/admin/sponsors" routerLinkActive="is-active">
            <span><span class="sidebar-row__icon">🎁</span>Sponsors</span>
          </a>
          <a class="sidebar-row" routerLink="/admin/users" routerLinkActive="is-active">
            <span><span class="sidebar-row__icon">👤</span>Usuarios</span>
          </a>
        </div>

        <div class="app-sidebar__section">
          <div class="app-sidebar__kicker">Mi cuenta</div>
          <a class="sidebar-row" routerLink="/profile" routerLinkActive="is-active">
            <span><span class="sidebar-row__icon">⚙</span>Mi perfil</span>
          </a>
          <button class="sidebar-row sidebar-row--logout" type="button" (click)="logout()">
            <span><span class="sidebar-row__icon">⏻</span>Cerrar sesión</span>
          </button>
        </div>
      } @else {
        <div class="app-sidebar__section">
          <div class="app-sidebar__kicker">Mis grupos</div>
          @for (g of topGroups(); track g.id) {
            <a class="sidebar-row" [routerLink]="['/groups', g.id]" routerLinkActive="is-active">
              <span>{{ g.name }}</span>
              <span class="sidebar-row__pos">{{ g.mode === 'COMPLETE' ? 'C' : 'S' }}</span>
            </a>
          }
          @if (myGroups().length > topGroups().length) {
            <a class="sidebar-row sidebar-row--more" routerLink="/groups">
              <span>Ver todos ({{ myGroups().length }})</span>
            </a>
          }
          @if (myGroups().length === 0) {
            <p class="sidebar-empty">Aún no estás en ningún grupo.</p>
          }
          <button class="btn-wf btn-wf--block btn-wf--sm" type="button"
                  (click)="goToGroupsNew()" style="margin-top:10px;">+ Crear grupo</button>
          <button class="btn-wf btn-wf--block btn-wf--sm" type="button"
                  (click)="goToGroupsJoin()" style="margin-top:6px;">→ Unirme con código</button>
        </div>

        <div class="app-sidebar__section">
          <div class="app-sidebar__kicker">Mi cuenta</div>
          <a class="sidebar-row" routerLink="/profile/special-picks" routerLinkActive="is-active">
            <span><span class="sidebar-row__icon">⭐</span>Picks especiales</span>
          </a>
          @if (hasComplete()) {
            <a class="sidebar-row" routerLink="/mis-comodines" routerLinkActive="is-active">
              <span><span class="sidebar-row__icon">🃏</span>Mis comodines</span>
            </a>
          }
          <a class="sidebar-row" routerLink="/ranking" routerLinkActive="is-active">
            <span><span class="sidebar-row__icon">🏆</span>Ranking global</span>
          </a>
          <a class="sidebar-row" routerLink="/notificaciones" routerLinkActive="is-active">
            <span><span class="sidebar-row__icon">🔔</span>Notificaciones</span>
            @if (unreadCount() > 0) { <span class="pill pill--solid">{{ unreadCount() }}</span> }
          </a>
          <a class="sidebar-row" routerLink="/profile" routerLinkActive="is-active">
            <span><span class="sidebar-row__icon">👤</span>Mi perfil</span>
          </a>
          <button class="sidebar-row sidebar-row--logout" type="button" (click)="logout()">
            <span><span class="sidebar-row__icon">⏻</span>Cerrar sesión</span>
          </button>
        </div>
      }
    </aside>

    <!-- ============ MOBILE TABBAR (<992px) ============ -->
    <nav class="app-tabbar" aria-label="Navegación principal">
      @if (isAdmin()) {
        <a class="app-tabbar__item" routerLink="/admin" routerLinkActive="is-active" [routerLinkActiveOptions]="{exact: true}" (click)="closeAll()">
          <span class="icon">🏠</span><span>Home</span>
        </a>
        <a class="app-tabbar__item" routerLink="/admin/groups-overview" routerLinkActive="is-active" (click)="closeAll()">
          <span class="icon">👥</span><span>Grupos</span>
        </a>
        <a class="app-tabbar__item" routerLink="/admin/rankings-overview" routerLinkActive="is-active" (click)="closeAll()">
          <span class="icon">🏆</span><span>Rankings</span>
        </a>
        <a class="app-tabbar__item" routerLink="/admin/fixtures" routerLinkActive="is-active" (click)="closeAll()">
          <span class="icon">⚽</span><span>Partidos</span>
        </a>
      } @else {
        <a class="app-tabbar__item" routerLink="/picks" routerLinkActive="is-active" (click)="closeAll()">
          <span class="icon">⚽</span><span>Picks</span>
        </a>
        <a class="app-tabbar__item" routerLink="/groups" routerLinkActive="is-active" (click)="closeAll()">
          <span class="icon">👥</span><span>Grupos</span>
        </a>
        <a class="app-tabbar__item" routerLink="/ranking" routerLinkActive="is-active" (click)="closeAll()">
          <span class="icon">🏆</span><span>Ranking</span>
        </a>
        <a class="app-tabbar__item" routerLink="/profile" routerLinkActive="is-active" (click)="closeAll()">
          <span class="icon">👤</span><span>Perfil</span>
        </a>
      }
    </nav>
  `,
  styles: [`
    /* display: contents permite que los hijos del componente sean
       grid items directos del .app-shell (topnav, sidebar, main). */
    :host { display: contents; }

    /* Mobile menu (dropdown del avatar) — anclado bajo la topbar */
    .mobile-menu {
      position: fixed;
      top: 56px;
      right: 12px;
      min-width: 220px;
      z-index: 60;
      background: var(--wf-paper);
      border: 1px solid var(--wf-line-2);
      border-radius: 10px;
      box-shadow: 0 12px 28px rgba(0, 0, 0, 0.12);
      padding: 6px;
    }
    @media (min-width: 992px) { .mobile-menu { display: none; } }

    .mobile-menu__item {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 10px 12px;
      border-radius: 6px;
      font-size: 13px;
      font-weight: 500;
      color: var(--wf-ink);
      text-decoration: none;
      cursor: pointer;
    }
    .mobile-menu__item:hover { background: var(--wf-fill); }
    .mobile-menu__item--danger { color: var(--wf-danger); }
    .mobile-menu__sep {
      border: 0;
      border-top: 1px solid var(--wf-line-2);
      margin: 6px 0;
    }

    /* Sidebar — ítem extra "ver todos" + estado vacío + logout */
    .sidebar-row--more {
      color: var(--wf-green-ink);
      font-weight: 700;
    }
    .sidebar-empty {
      font-size: 11px;
      color: var(--wf-ink-3);
      padding: 8px 10px;
      margin: 0;
      line-height: 1.4;
    }
    .sidebar-row--logout {
      width: 100%;
      text-align: left;
      border: 0;
      background: transparent;
      color: var(--wf-danger);
      font-family: inherit;
      cursor: pointer;
      margin-top: 8px;
    }
  `],
})
export class NavComponent implements OnInit, OnDestroy {
  private auth = inject(AuthService);
  private api = inject(ApiService);
  private router = inject(Router);
  private userModes = inject(UserModesService);

  open = signal<DropdownKey>(null);

  isAdmin = computed(() => this.auth.user()?.isAdmin ?? false);
  handle = computed(() => this.auth.user()?.handle ?? null);
  avatar = computed(() => (this.handle() ?? '?')[0]?.toUpperCase() ?? '?');
  hasSimple = computed(() => this.userModes.hasSimple());
  hasComplete = computed(() => this.userModes.hasComplete());
  myGroups = computed<UserGroup[]>(() => this.userModes.groups());
  topGroups = computed<UserGroup[]>(() => this.myGroups().slice(0, 5));

  unreadCount = signal(0);
  private notifSub: { unsubscribe: () => void } | undefined;

  async ngOnInit() {
    const userId = this.auth.user()?.sub;
    if (!userId) return;
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
  closeAll() { this.open.set(null); }

  @HostListener('document:click')
  onDocumentClick() { this.open.set(null); }

  @HostListener('document:keydown.escape')
  onEsc() { if (this.open()) this.open.set(null); }

  goProfile() { this.closeAll(); void this.router.navigate(['/profile']); }
  goComodines() { this.closeAll(); void this.router.navigate(['/mis-comodines']); }
  goNotifications() { this.closeAll(); void this.router.navigate(['/notificaciones']); }
  goSpecialPicks() { this.closeAll(); void this.router.navigate(['/profile/special-picks']); }
  goToGroupsNew() { this.closeAll(); void this.router.navigate(['/groups/new']); }
  goToGroupsJoin() {
    this.closeAll();
    void this.router.navigate(['/groups'], { fragment: 'unirme' });
  }

  async logout() {
    this.closeAll();
    await this.auth.logout();
    void this.router.navigate(['/login']);
  }
}
