import { Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { NavigationEnd, Router, RouterLink } from '@angular/router';
import { filter } from 'rxjs/operators';
import { ApiService } from '../../core/api/api.service';
import { AuthService } from '../../core/auth/auth.service';
import { PicksSyncService } from '../../core/sync/picks-sync.service';
import { UserAvatarComponent } from '../user-avatar/user-avatar.component';
import { IconComponent } from '../ui/icon/icon.component';

@Component({
  standalone: true,
  selector: 'app-nav',
  imports: [RouterLink, UserAvatarComponent, IconComponent],
  template: `
    <!-- ============ DESKTOP BREADCRUMB BAR (≥768px) ============ -->
    <header class="app__top">
      <div class="app__crumb">
        <a routerLink="/home">Inicio</a>
        @if (currentPageLabel(); as p) {
          <span aria-hidden="true">›</span>
          <b>{{ p }}</b>
        }
      </div>
      <div class="app__top-actions">
        @if (sync.status() !== 'idle') {
          <button type="button" class="sync-pill"
                  [class.sync-pill--syncing]="sync.status() === 'syncing'"
                  [class.sync-pill--pending]="sync.status() === 'pending'"
                  [class.sync-pill--error]="sync.status() === 'error'"
                  (click)="sync.syncNow()"
                  [attr.aria-label]="'Sync: ' + sync.status()">
            @if (sync.status() === 'syncing') { Sincronizando… }
            @else if (sync.status() === 'pending') { ● {{ sync.pending() }} pendientes }
            @else if (sync.status() === 'error') { ⚠ Reintentar }
          </button>
        }
        <a routerLink="/notificaciones" class="app__bell" aria-label="Notificaciones">
          <app-icon name="bell" size="md" />
          @if (unreadCount() > 0) { <span class="app__bell-badge">{{ unreadCount() > 99 ? '99+' : unreadCount() }}</span> }
        </a>
      </div>
    </header>

    <!-- ============ MOBILE TOPBAR (<768px) ============ -->
    <header class="app-topbar">
      <a routerLink="/home" class="app-topbar__brand" aria-label="Golgana">
        <img src="assets/logo-golgana.png" alt="Golgana" width="199" height="98" class="app-topbar__logo-img">
      </a>
      <div class="app-topbar__actions">
        @if (sync.status() !== 'idle') {
          <button type="button" class="sync-pill sync-pill--mobile"
                  [class.sync-pill--syncing]="sync.status() === 'syncing'"
                  [class.sync-pill--pending]="sync.status() === 'pending'"
                  [class.sync-pill--error]="sync.status() === 'error'"
                  (click)="sync.syncNow()"
                  [attr.aria-label]="'Sync: ' + sync.status()">
            @if (sync.status() === 'syncing') { ⏳ }
            @else if (sync.status() === 'pending') { ● {{ sync.pending() }} }
            @else if (sync.status() === 'error') { ⚠ }
          </button>
        }
        <a routerLink="/notificaciones" class="app-topbar__bell" aria-label="Notificaciones">
          <app-icon name="bell" size="md" />
          @if (unreadCount() > 0) { <span class="badge">{{ unreadCount() }}</span> }
        </a>
        <a class="app-topbar__avatar" routerLink="/profile" aria-label="Mi perfil">
          <app-user-avatar
            [sub]="userSub() ?? ''"
            [handle]="handle() ?? ''"
            [avatarKey]="avatarKey()"
            size="sm" />
        </a>
      </div>
    </header>
  `,
  styles: [`
    /* display: contents permite que los hijos del componente sean
       grid items directos del .app-shell (topbar mobile + tabbar). */
    :host { display: contents; }

    /* ============================================================
       design-v3: sidebar negro absorbe la navegación primaria + el
       bottom-nav mobile. El topbar mobile (<768px) sigue mostrando
       sync + bell + avatar; el .app__top desktop reemplaza al header
       custom — breadcrumb claro con backdrop-blur del diseño handoff.
       ============================================================ */
    @media (max-width: 767px) {
      .app__top { display: none !important; }
    }
    @media (min-width: 768px) {
      .app-topbar { display: none !important; }
    }

    /* === Desktop breadcrumb bar (.app__top, .app__crumb, .app__bell) === */
    .app__top {
      position: sticky;
      top: 0;
      z-index: 40;
      background: rgba(245, 244, 240, 0.85);
      backdrop-filter: blur(10px);
      -webkit-backdrop-filter: blur(10px);
      border-bottom: 1px solid var(--color-line);
      padding: 12px 24px;
      margin-left: var(--sidebar-w);
      transition: margin-left 0.2s ease;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
    }
    .app__crumb {
      font-size: 12px;
      color: var(--color-text-muted);
      letter-spacing: .04em;
      display: flex;
      align-items: center;
      gap: 8px;
      min-width: 0;
    }
    .app__crumb a {
      color: var(--color-text-muted);
      text-decoration: none;
    }
    .app__crumb a:hover { color: var(--color-primary-green); }
    .app__crumb b {
      color: var(--color-primary-black);
      font-weight: var(--fw-semibold);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .app__top-actions {
      display: flex;
      align-items: center;
      gap: 10px;
      flex-shrink: 0;
    }
    .app__bell {
      position: relative;
      width: 38px;
      height: 38px;
      border-radius: 50%;
      background: #fff;
      border: 1px solid var(--color-line);
      display: grid;
      place-items: center;
      cursor: pointer;
      text-decoration: none;
      color: var(--color-primary-black);
      transition: border-color .15s, background-color .15s;
    }
    .app__bell:hover { border-color: rgba(2, 204, 116, 0.4); }
    .app__bell-badge {
      position: absolute;
      top: -3px;
      right: -3px;
      background: var(--color-primary-green);
      color: #fff;
      font-size: 9px;
      font-weight: var(--fw-bold);
      padding: 1px 5px;
      border-radius: 999px;
      line-height: 1.4;
    }
  `],
})
export class NavComponent implements OnInit, OnDestroy {
  private auth = inject(AuthService);
  private api = inject(ApiService);
  private router = inject(Router);
  sync = inject(PicksSyncService);

  /** Map de routes → label legible para el breadcrumb desktop. */
  private static readonly ROUTE_LABELS: Record<string, string> = {
    '/home': '',                           // Inicio (no muestra crumb extra)
    '/picks': 'Mis picks',
    '/picks/group-stage': 'Fase de grupos',
    '/picks/bracket': 'Bracket',
    '/ranking': 'Ranking',
    '/groups': 'Mis grupos',
    '/special-picks': 'Picks especiales',
    '/mis-comodines': 'Mis comodines',
    '/comodines': 'Mis comodines',
    '/profile': 'Mi perfil',
    '/notificaciones': 'Notificaciones',
    '/onboarding': 'Bienvenida',
  };

  private currentUrl = signal(this.router.url);

  /** Label legible de la página actual para el breadcrumb desktop.
   *  Devuelve null si estamos en /home (el breadcrumb solo muestra "Inicio"). */
  currentPageLabel = computed<string | null>(() => {
    const url = this.currentUrl().split('?')[0] ?? '';
    if (!url || url === '/' || url === '/home') return null;
    // Dynamic routes (/picks/match/:id, /groups/:id, /groups/:id/edit) — try
    // longest static prefix match before falling back to first segment.
    for (const [route, label] of Object.entries(NavComponent.ROUTE_LABELS)) {
      if (url === route || url.startsWith(route + '/')) {
        return label || null;
      }
    }
    const first = url.split('/').filter(Boolean)[0];
    if (!first) return null;
    return first.charAt(0).toUpperCase() + first.slice(1);
  });

  handle = computed(() => this.auth.user()?.handle ?? null);
  userSub = computed(() => this.auth.user()?.sub ?? null);
  avatarKey = computed(() => this.auth.user()?.avatarKey ?? null);

  unreadCount = signal(0);
  private notifSub: { unsubscribe: () => void } | undefined;

  /** Suscripción a NavigationEnd para mantener currentUrl reactivo. */
  private routerSub: { unsubscribe: () => void } | undefined;

  async ngOnInit() {
    // Track route changes so the breadcrumb label re-computes.
    this.routerSub = this.router.events
      .pipe(filter((e): e is NavigationEnd => e instanceof NavigationEnd))
      .subscribe((e) => this.currentUrl.set(e.urlAfterRedirects));

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
    if (this.routerSub) this.routerSub.unsubscribe();
  }
}
