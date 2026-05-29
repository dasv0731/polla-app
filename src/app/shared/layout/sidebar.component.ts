import { Component, HostListener, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { Router, RouterLink, RouterLinkActive } from '@angular/router';
import { ApiService } from '../../core/api/api.service';
import { AuthService } from '../../core/auth/auth.service';
import { ConfirmDialogService } from '../ui/confirm-dialog.service';
import { IconComponent } from '../ui/icon/icon.component';
import { MoreSheetComponent } from '../ui/more-sheet/more-sheet.component';

/**
 * Sidebar negro design-v3. Layout vertical fijo a la izquierda en desktop
 * (≥768px): 64px colapsado mostrando solo iconos, 200px al hover. En mobile
 * (<768px) se transforma en bottom-nav horizontal con 5 items + labels chicos
 * (reemplaza al bottom-nav.component.ts que se elimina).
 *
 * Items principales: Inicio · Mis picks · Grupos · Ranking · Mundial 2026
 * (+ Admin si isAdmin). Bottom area (solo desktop): notificaciones (bell) +
 * avatar/handle. En mobile el bottom area se oculta — el bell vive en el
 * topbar mobile.
 */
@Component({
  standalone: true,
  selector: 'app-sidebar',
  imports: [RouterLink, RouterLinkActive, IconComponent, MoreSheetComponent],
  template: `
    <aside class="lsb" aria-label="Navegación principal">
      <a class="lsb__logo" routerLink="/home" aria-label="Inicio">
        <img src="assets/logo-golgana.png" alt="" width="199" height="98" class="brand-logo--sm">
        <strong class="lsb__brand-sub">Polla Mundialista 2026</strong>
      </a>

      <div class="lsb__nav-desktop">
        <a routerLink="/home" routerLinkActive="active" [routerLinkActiveOptions]="{exact: true}">
          <app-icon name="home" size="md" /><span class="lsb__t">Inicio</span>
        </a>
        <a routerLink="/picks" routerLinkActive="active" [routerLinkActiveOptions]="{exact: true}">
          <app-icon name="dice" size="md" /><span class="lsb__t">Mis picks</span>
        </a>
        <a routerLink="/groups" routerLinkActive="active">
          <app-icon name="users" size="md" /><span class="lsb__t">Grupos</span>
        </a>
        <a routerLink="/ranking" routerLinkActive="active">
          <app-icon name="trophy" size="md" /><span class="lsb__t">Ranking</span>
        </a>
        <a routerLink="/picks/group-stage" [queryParams]="{ view: 'pred' }" routerLinkActive="active" data-tour="mundial">
          <app-icon name="globe" size="md" /><span class="lsb__t">Mundial 2026</span>
        </a>
        @if (isAdmin()) {
          <a routerLink="/admin" routerLinkActive="active">
            <app-icon name="wrench" size="md" /><span class="lsb__t">Admin</span>
          </a>
        }
      </div>

      <div class="lsb__bottom">
        <a routerLink="/notificaciones" routerLinkActive="active" class="lsb__bell">
          <app-icon name="bell" size="md" />
          <span class="lsb__t">Notificaciones</span>
          @if (unreadCount() > 0) {
            <span class="lsb__bell-badge"
                  [attr.aria-label]="unreadCount() + ' notificaciones sin leer'">
              {{ unreadCount() > 99 ? '99+' : unreadCount() }}
            </span>
          }
        </a>
        <div class="lsb__usr-wrap" (click)="$event.stopPropagation()">
          <button type="button" class="lsb__usr"
                  (click)="toggleUserMenu($event)"
                  [attr.aria-expanded]="userMenuOpen()"
                  aria-haspopup="menu"
                  aria-label="Menú de usuario">
            <div class="lsb__av">{{ avatarInitials() }}</div>
            <span class="lsb__t" translate="no">{{ '@' + (handle() ?? 'jugador') }}</span>
          </button>
          @if (userMenuOpen()) {
            <div class="lsb__user-panel" role="menu">
              <a class="lsb__user-panel-item" role="menuitem"
                 routerLink="/notificaciones"
                 (click)="userMenuOpen.set(false)">
                <span>Notificaciones</span>
                @if (unreadCount() > 0) {
                  <span class="lsb__panel-badge">{{ unreadCount() > 99 ? '99+' : unreadCount() }}</span>
                }
              </a>
              <a class="lsb__user-panel-item" role="menuitem"
                 routerLink="/profile"
                 (click)="userMenuOpen.set(false)">
                Mi perfil
              </a>
              <hr class="lsb__user-panel-sep">
              <button type="button" class="lsb__user-panel-item lsb__user-panel-item--danger"
                      role="menuitem" (click)="logout()">
                Cerrar sesión
              </button>
            </div>
          }
        </div>
      </div>

      <!-- MOBILE BOTTOM-NAV (5 items + Más) - hidden on desktop via CSS -->
      <nav class="lsb__nav-mobile" aria-label="Navegación móvil">
        <a routerLink="/home" routerLinkActive="active" [routerLinkActiveOptions]="{exact: true}">
          <app-icon name="home" size="md" />
          <span>Inicio</span>
        </a>
        <a routerLink="/picks" routerLinkActive="active" [routerLinkActiveOptions]="{exact: true}">
          <app-icon name="dice" size="md" />
          <span>Picks</span>
        </a>
        <a routerLink="/groups" routerLinkActive="active">
          <app-icon name="users" size="md" />
          <span>Grupos</span>
        </a>
        <a routerLink="/ranking" routerLinkActive="active">
          <app-icon name="trophy" size="md" />
          <span>Ranking</span>
        </a>
        <button type="button" (click)="toggleMore()"
                [class.active]="moreOpen()"
                [attr.aria-expanded]="moreOpen()"
                aria-haspopup="dialog">
          <app-icon name="plus" size="md" />
          <span>Más</span>
        </button>
      </nav>
    </aside>

    <app-more-sheet [open]="moreOpen()" (close)="moreOpen.set(false)">
      <a class="more-sheet__item" routerLink="/picks/group-stage" [queryParams]="{ view: 'pred' }" (click)="moreOpen.set(false)">
        <app-icon name="globe" size="md" />
        <span>Mundial 2026</span>
      </a>
      <a class="more-sheet__item" routerLink="/comodines" (click)="moreOpen.set(false)">
        <app-icon name="gift" size="md" />
        <span>Comodines</span>
      </a>
      <a class="more-sheet__item" routerLink="/notificaciones" (click)="moreOpen.set(false)">
        <app-icon name="bell" size="md" />
        <span>Notificaciones</span>
        @if (unreadCount() > 0) {
          <span class="more-sheet__badge">{{ unreadCount() }}</span>
        }
      </a>
      <a class="more-sheet__item" routerLink="/profile" (click)="moreOpen.set(false)">
        <app-icon name="settings" size="md" />
        <span>Perfil</span>
      </a>
      @if (isAdmin()) {
        <a class="more-sheet__item" routerLink="/admin" (click)="moreOpen.set(false)">
          <app-icon name="wrench" size="md" />
          <span>Admin</span>
        </a>
      }
    </app-more-sheet>
  `,
  styles: [`
    :host { display: contents; }

    .lsb {
      position: fixed;
      top: 0; left: 0; bottom: 0;
      width: var(--sidebar-w);
      background: #0a0a0a;
      border-right: 1px solid rgba(255,255,255,0.08);
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: 14px 0;
      gap: 6px;
      z-index: 50;
      transition: width 0.2s;
      overflow: hidden;
    }
    .lsb:hover { width: var(--sidebar-w); align-items: stretch; }

    .lsb__logo {
      width: 36px; height: 36px;
      display: grid; place-items: center;
      margin-bottom: 18px;
      flex-shrink: 0;
    }
    .lsb:hover .lsb__logo {
      width: auto; margin-left: 14px;
      justify-content: flex-start;
      display: flex; align-items: center; gap: 10px;
    }
    .lsb__logo img { height: var(--logo-size-sm, 24px); width: auto; }
    .lsb__brand-sub {
      display: none;
      color: #fff;
      font-family: var(--font-primary);
      font-size: 13px;
      letter-spacing: 0.04em;
      font-weight: 600;
      white-space: nowrap;
    }
    .lsb:hover .lsb__brand-sub { display: block; }

    .lsb a {
      color: rgba(255,255,255,0.7);
      text-decoration: none;
      display: flex; align-items: center; gap: 14px;
      width: 48px; height: 44px;
      justify-content: center;
      border-radius: 8px;
      font-size: 18px;
      transition: width 0.15s ease, background 0.15s ease, color 0.15s ease, padding 0.15s ease;
      flex-shrink: 0;
      white-space: nowrap;
    }
    .lsb:hover a { width: auto; justify-content: flex-start; padding: 0 14px; margin: 0 8px; }
    .lsb__t {
      font-size: 13px; font-weight: 500; letter-spacing: 0.04em;
      display: none;
    }
    .lsb:hover .lsb__t { display: inline; }
    .lsb a:hover, .lsb a.active {
      background: rgba(2,204,116,0.18);
      color: #fff;
    }
    .lsb a:focus-visible {
      /* La sidebar tiene overflow:hidden cuando está colapsada —
       * outline se recorta. Box-shadow inset queda dentro del elemento
       * y siempre visible. */
      outline: none;
      box-shadow: inset 0 0 0 2px var(--color-primary-green);
      color: #fff;
    }

    .lsb__bottom {
      margin-top: auto;
      display: flex;
      flex-direction: column;
      gap: 6px;
      align-items: center;
      width: 100%;
    }
    .lsb:hover .lsb__bottom { align-items: stretch; }

    .lsb__bell { position: relative; }
    .lsb__bell-badge {
      position: absolute;
      top: 4px;
      right: 4px;
      min-width: 18px;
      height: 18px;
      padding: 0 5px;
      background: var(--color-lost, #d23f3f);
      color: #fff;
      border-radius: 9px;
      font-size: 10px;
      font-weight: 700;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      line-height: 1;
    }
    /* Cuando la sidebar está expandida (hover), el badge se acomoda al
       final del row, no se pisa con el texto. */
    .lsb:hover .lsb__bell .lsb__bell-badge {
      position: static;
      margin-left: auto;
    }

    .lsb__usr-wrap {
      position: relative;
      width: 100%;
      display: flex;
      justify-content: center;
    }
    .lsb:hover .lsb__usr-wrap { justify-content: stretch; }
    .lsb__usr {
      display: flex; align-items: center; gap: 10px;
      width: 48px; height: 48px;
      justify-content: center;
      flex-shrink: 0;
      background: transparent;
      border: 0;
      color: rgba(255,255,255,0.7);
      cursor: pointer;
      font: inherit;
      border-radius: 8px;
      padding: 0;
      transition: width 0.15s ease, background 0.15s ease, color 0.15s ease, padding 0.15s ease;
    }
    .lsb:hover .lsb__usr { width: auto; justify-content: flex-start; padding: 0 14px; margin: 0 8px 8px; }
    .lsb__usr:hover { background: rgba(2,204,116,0.18); color: #fff; }
    .lsb__usr:focus-visible {
      outline: none;
      box-shadow: inset 0 0 0 2px var(--color-primary-green);
      color: #fff;
    }
    .lsb__av {
      width: 32px; height: 32px;
      border-radius: 50%;
      background: linear-gradient(135deg, #067a4a, #02cc74);
      display: grid; place-items: center;
      color: #fff;
      font-weight: 600;
      font-size: 12px;
      flex-shrink: 0;
    }

    /* User dropdown panel (popover hacia la derecha de la sidebar) */
    .lsb__user-panel {
      position: absolute;
      left: calc(100% + 8px);
      bottom: 0;
      min-width: 220px;
      background: var(--color-primary-white, #fff);
      border: 1px solid var(--color-line, rgba(0,0,0,0.08));
      border-radius: 10px;
      box-shadow: 0 12px 28px rgba(0, 0, 0, 0.18);
      padding: 6px;
      z-index: var(--z-dropdown, 60);
    }
    .lsb__user-panel-item {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      width: 100%;
      padding: 9px 10px;
      border-radius: 6px;
      font-size: 13px;
      font-weight: 500;
      color: var(--color-primary-black, #0a0a0a);
      text-decoration: none;
      background: transparent;
      border: 0;
      cursor: pointer;
      font-family: inherit;
      text-align: left;
    }
    .lsb__user-panel-item:hover {
      background: var(--color-green-5, rgba(2,204,116,0.06));
      color: var(--color-primary-black, #0a0a0a);
    }
    .lsb__user-panel-item:focus-visible {
      outline: 2px solid var(--color-primary-green, #02cc74);
      outline-offset: -2px;
      background: var(--color-green-5, rgba(2,204,116,0.06));
    }
    .lsb__user-panel-item--danger { color: var(--color-lost, #d23f3f); }
    .lsb__user-panel-item--danger:hover { color: var(--color-lost, #d23f3f); }
    .lsb__user-panel-sep {
      border: 0;
      border-top: 1px solid var(--color-line, rgba(0,0,0,0.08));
      margin: 4px 0;
    }
    .lsb__panel-badge {
      background: var(--color-lost, #d23f3f);
      color: #fff;
      border-radius: 9px;
      padding: 2px 7px;
      font-size: 10px;
      font-weight: 700;
    }

    /* Desktop default: hide mobile nav */
    .lsb__nav-mobile { display: none; }

    /* More-sheet item styles (used inside <app-more-sheet> ng-content) */
    .more-sheet__item {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 14px 20px;
      color: var(--color-primary-black, #0a0a0a);
      text-decoration: none;
      background: transparent;
      border: 0;
      width: 100%;
      font: inherit;
      text-align: left;
      cursor: pointer;
      border-bottom: 1px solid var(--color-line, rgba(0,0,0,0.08));
    }
    .more-sheet__item:last-child { border-bottom: 0; }
    .more-sheet__item:hover { background: var(--color-green-5, rgba(2,204,116,0.06)); }
    .more-sheet__item:focus-visible {
      outline: 2px solid var(--color-primary-green, #02cc74);
      outline-offset: -2px;
      background: var(--color-green-5, rgba(2,204,116,0.06));
    }
    .more-sheet__badge {
      margin-left: auto;
      background: var(--color-lost, #d23f3f);
      color: #fff;
      border-radius: 9px;
      padding: 2px 7px;
      font-size: 10px;
      font-weight: 700;
    }

    /* MOBILE / TABLET: bottom-nav horizontal */
    @media (max-width: 767px) {
      .lsb {
        top: auto; bottom: 0; left: 0; right: 0;
        width: 100%; height: 60px;
        flex-direction: row;
        padding: 0 calc(env(safe-area-inset-bottom, 0px) / 2) env(safe-area-inset-bottom, 0px);
        border-right: 0;
        border-top: 1px solid rgba(255,255,255,0.08);
        justify-content: space-around;
        align-items: center;
        overflow: visible;
      }
      .lsb:hover { width: 100%; align-items: center; }
      .lsb__logo,
      .lsb__nav-desktop,
      .lsb__bottom { display: none; }

      .lsb__nav-mobile {
        display: flex;
        justify-content: space-around;
        align-items: center;
        flex: 1;
        height: 100%;
      }
      .lsb__nav-mobile a,
      .lsb__nav-mobile button,
      .lsb:hover .lsb__nav-mobile a,
      .lsb:hover .lsb__nav-mobile button {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 2px;
        padding: 6px 10px;
        margin: 0;
        width: auto;
        height: 46px;
        color: rgba(255,255,255,0.7);
        text-decoration: none;
        background: transparent;
        border: 0;
        font-family: inherit;
        cursor: pointer;
      }
      .lsb__nav-mobile a span,
      .lsb__nav-mobile button span {
        font-size: 9px;
        letter-spacing: 0.04em;
        text-transform: uppercase;
      }
      .lsb__nav-mobile a.active,
      .lsb__nav-mobile button.active {
        color: var(--color-primary-green, #02cc74);
      }
      .lsb__nav-mobile a:focus-visible,
      .lsb__nav-mobile button:focus-visible {
        outline: none;
        box-shadow: inset 0 0 0 2px var(--color-primary-green, #02cc74);
        color: #fff;
      }
    }
  `],
})
export class SidebarComponent implements OnInit, OnDestroy {
  private auth = inject(AuthService);
  private api = inject(ApiService);
  private router = inject(Router);
  private confirmDialog = inject(ConfirmDialogService);

  /**
   * Bug #1 fix: sidebar hover expande de 64px → 200px. Shell + trivia-toast
   * consumen `var(--sidebar-w)` para margin-left. Mutamos la variable a nivel
   * `:root` (no `.lsb` scope) para que el resto del layout reaccione.
   */
  @HostListener('mouseenter')
  onHoverEnter() {
    if (typeof document === 'undefined') return;
    if (window.matchMedia?.('(max-width: 767px)').matches) return;
    document.documentElement.style.setProperty('--sidebar-w', '200px');
  }

  @HostListener('mouseleave')
  onHoverLeave() {
    if (typeof document === 'undefined') return;
    if (window.matchMedia?.('(max-width: 767px)').matches) return;
    document.documentElement.style.setProperty('--sidebar-w', '64px');
  }

  // User dropdown menu (recovered from zombie nav.component) — popover hacia
  // la derecha que ofrece notificaciones / perfil / cerrar sesión.
  userMenuOpen = signal(false);

  toggleUserMenu(event: Event) {
    event.stopPropagation();
    this.userMenuOpen.update((v) => !v);
  }

  // Mobile "Más" sheet — abre slide-up con items extra (Mundial 2026,
  // Comodines, Notificaciones, Perfil, Admin si aplica). Solo visible
  // en mobile (<768px); en desktop el sheet jamás se trigerea (el botón
  // está oculto).
  moreOpen = signal(false);

  toggleMore() {
    this.moreOpen.update((v) => !v);
  }

  @HostListener('document:click')
  onDocumentClick() {
    if (this.userMenuOpen()) this.userMenuOpen.set(false);
  }

  @HostListener('document:keydown.escape')
  onEscape() {
    if (this.userMenuOpen()) this.userMenuOpen.set(false);
  }

  async logout() {
    this.userMenuOpen.set(false);
    const ok = await this.confirmDialog.ask({
      title: 'Cerrar sesión',
      message: '¿Quieres cerrar sesión? Vas a salir de tu cuenta y volverás al login.',
      confirmLabel: 'Cerrar sesión',
      cancelLabel: 'Cancelar',
      danger: true,
    });
    if (!ok) return;
    await this.auth.logout();
    void this.router.navigate(['/login']);
  }

  handle = computed(() => this.auth.user()?.handle ?? null);
  avatarInitials = computed(() => {
    const h = this.handle();
    if (!h) return '?';
    return h.slice(0, 2).toUpperCase();
  });
  isAdmin = computed(() => this.auth.user()?.isAdmin === true);

  // Notification unread count (recovered from zombie nav.component) — drives
  // the bell badge in `.lsb__bell` bottom area.
  unreadCount = signal(0);
  private notifSub: { unsubscribe: () => void } | undefined;

  ngOnInit() {
    const userId = this.auth.user()?.sub;
    if (userId) {
      this.notifSub = this.api.observeMyNotifications(userId).subscribe({
        next: (snap) => {
          const items = snap.items as Array<{ readAt: string | null }>;
          const unread = items.filter((n) => !n.readAt).length;
          this.unreadCount.set(unread);
        },
        error: (err: unknown) => {
          // eslint-disable-next-line no-console
          console.warn('[sidebar] notification subscription error', err);
        },
      });
    }
  }

  ngOnDestroy() {
    if (this.notifSub) this.notifSub.unsubscribe();
  }
}
