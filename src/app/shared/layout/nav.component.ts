import { Component, HostListener, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { Router, RouterLink, RouterLinkActive } from '@angular/router';
import { ApiService } from '../../core/api/api.service';
import { AuthService } from '../../core/auth/auth.service';
import { UserModesService, type UserGroup } from '../../core/user/user-modes.service';
import { PicksSyncService } from '../../core/sync/picks-sync.service';
import { UserAvatarComponent } from '../user-avatar/user-avatar.component';

type DropdownKey = 'user' | 'ranking' | null;

@Component({
  standalone: true,
  selector: 'app-nav',
  imports: [RouterLink, RouterLinkActive, UserAvatarComponent],
  template: `
    <!-- ============ DESKTOP TOPNAV (≥992px) ============ -->
    <header class="app-topnav">
      <div class="app-topnav__left">
        <a routerLink="/home" class="app-topnav__brand" aria-label="Golgana" (click)="closeAll()">
          <img src="assets/logo-golgana.png" alt="Golgana" class="app-topnav__logo-img">
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

            <!-- Ranking dropdown: Global + per-group -->
            <div class="app-topnav__dropdown" (click)="$event.stopPropagation()">
              <button type="button" class="app-topnav__item app-topnav__item--has-dropdown"
                      [class.is-active]="open() === 'ranking'"
                      (click)="toggle('ranking')"
                      [attr.aria-expanded]="open() === 'ranking'"
                      aria-haspopup="true">
                Ranking <span aria-hidden="true">▾</span>
              </button>
              @if (open() === 'ranking') {
                <div class="app-topnav__panel" role="menu">
                  <a class="app-topnav__panel-item" role="menuitem"
                     routerLink="/ranking" [queryParams]="{scope: 'global'}"
                     (click)="closeAll()">
                    🌐 Ranking global
                  </a>
                  @if (myGroups().length > 0) {
                    <hr class="app-topnav__panel-sep">
                    <div class="app-topnav__panel-kicker">Mis grupos</div>
                    @for (g of topGroups(); track g.id) {
                      <a class="app-topnav__panel-item" role="menuitem"
                         [routerLink]="['/groups', g.id]" (click)="closeAll()">
                        <span class="text-bold">{{ g.name }}</span>
                        <span class="text-mute" style="font-size:11px;">
                          · {{ g.mode === 'COMPLETE' ? 'Completo' : 'Simple' }}
                        </span>
                      </a>
                    }
                    @if (myGroups().length > topGroups().length) {
                      <a class="app-topnav__panel-item" role="menuitem"
                         routerLink="/groups" (click)="closeAll()"
                         style="color:var(--wf-green-ink);font-weight:700;">
                        Ver todos los grupos →
                      </a>
                    }
                  } @else {
                    <hr class="app-topnav__panel-sep">
                    <div class="app-topnav__panel-empty">
                      Aún no estás en ningún grupo.
                    </div>
                  }
                </div>
              }
            </div>
          }
        </nav>
      </div>

      <div class="app-topnav__right">
        <!-- Indicador global de sync (solo cuando hay actividad) -->
        @if (sync.status() !== 'idle') {
          <button type="button" class="sync-pill"
                  [class.sync-pill--syncing]="sync.status() === 'syncing'"
                  [class.sync-pill--pending]="sync.status() === 'pending'"
                  [class.sync-pill--error]="sync.status() === 'error'"
                  [title]="sync.status() === 'error' ? (sync.errorMessage() ?? 'Error de sincronización') : 'Click para sincronizar ya'"
                  (click)="sync.syncNow()">
            @if (sync.status() === 'syncing') {
              ⏳ Sincronizando…
            } @else if (sync.status() === 'pending') {
              ● {{ sync.pending() }} pendiente{{ sync.pending() === 1 ? '' : 's' }}
            } @else if (sync.status() === 'error') {
              ⚠ Reintentando
            }
          </button>
        }

        <a routerLink="/notificaciones" class="app-topnav__bell" aria-label="Notificaciones" (click)="closeAll()">
          🔔
          @if (unreadCount() > 0) { <span class="badge">{{ unreadCount() }}</span> }
        </a>

        <!-- User dropdown: notificaciones + perfil + cerrar sesión -->
        <div class="app-topnav__dropdown" (click)="$event.stopPropagation()">
          <button type="button" class="app-topnav__user app-topnav__user--has-dropdown"
                  [class.is-active]="open() === 'user'"
                  (click)="toggle('user')"
                  [attr.aria-expanded]="open() === 'user'"
                  aria-haspopup="true">
            <app-user-avatar
              [sub]="userSub() ?? ''"
              [handle]="handle() ?? ''"
              [avatarKey]="avatarKey()"
              size="sm" />
            <span class="name">{{ '@' + (handle() ?? '') }}</span>
            <span aria-hidden="true">▾</span>
          </button>
          @if (open() === 'user') {
            <div class="app-topnav__panel" role="menu">
              <a class="app-topnav__panel-item" role="menuitem"
                 routerLink="/notificaciones" (click)="closeAll()">
                <span style="display:flex;justify-content:space-between;align-items:center;width:100%;">
                  <span>🔔 Notificaciones</span>
                  @if (unreadCount() > 0) {
                    <span class="pill pill--solid">{{ unreadCount() }}</span>
                  }
                </span>
              </a>
              <a class="app-topnav__panel-item" role="menuitem"
                 routerLink="/profile" (click)="closeAll()">
                👤 Mi perfil
              </a>
              <hr class="app-topnav__panel-sep">
              <button type="button" class="app-topnav__panel-item app-topnav__panel-item--danger"
                      role="menuitem" (click)="logout()">
                ⏻ Cerrar sesión
              </button>
            </div>
          }
        </div>
      </div>
    </header>

    <!-- ============ MOBILE TOPBAR (<992px) ============ -->
    <header class="app-topbar">
      <a routerLink="/home" class="app-topbar__brand" aria-label="Golgana" (click)="closeAll()">
        <img src="assets/logo-golgana.png" alt="Golgana" class="app-topbar__logo-img">
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
        <a routerLink="/notificaciones" class="app-topbar__bell" aria-label="Notificaciones" (click)="closeAll()">
          🔔
          @if (unreadCount() > 0) { <span class="badge">{{ unreadCount() }}</span> }
        </a>
        <a class="app-topbar__avatar" routerLink="/profile" aria-label="Mi perfil" (click)="closeAll()">
          <app-user-avatar
            [sub]="userSub() ?? ''"
            [handle]="handle() ?? ''"
            [avatarKey]="avatarKey()"
            size="sm" />
        </a>
      </div>
    </header>

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

    /* ---------- Dropdowns en el topnav (Ranking + User) ---------- */
    .app-topnav__dropdown {
      position: relative;
    }
    .app-topnav__item--has-dropdown,
    .app-topnav__user--has-dropdown {
      cursor: pointer;
      font-family: inherit;
    }
    /* Hereda color/font de .app-topnav__item (white sobre topnav negro).
       Solo overrideamos los specifics del dropdown (display flex + caret). */
    .app-topnav__item--has-dropdown {
      background: transparent;
      border: 0;
      font-size: 13px;
      font-weight: 600;
      color: white;
      padding: 8px 14px;
      border-radius: 6px;
      display: inline-flex;
      align-items: center;
      gap: 4px;
    }
    .app-topnav__item--has-dropdown:hover { background: rgba(255, 255, 255, 0.10); }
    .app-topnav__item--has-dropdown.is-active {
      background: rgba(2, 204, 116, 0.20);
      color: #4dffa0;
    }
    .app-topnav__user--has-dropdown {
      border: 0;
      background: transparent;
      gap: 8px;
    }
    .app-topnav__user--has-dropdown.is-active { background: rgba(255, 255, 255, 0.10); }

    /* Panel de dropdown (común a Ranking y User) */
    .app-topnav__panel {
      position: absolute;
      top: calc(100% + 6px);
      right: 0;
      min-width: 240px;
      background: var(--wf-paper);
      border: 1px solid var(--wf-line-2);
      border-radius: 10px;
      box-shadow: 0 12px 28px rgba(0, 0, 0, 0.12);
      padding: 6px;
      z-index: 50;
    }
    .app-topnav__dropdown:has(.app-topnav__item--has-dropdown) .app-topnav__panel {
      left: 0;
      right: auto;
    }
    .app-topnav__panel-item {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 9px 10px;
      border-radius: 6px;
      font-size: 13px;
      font-weight: 500;
      color: var(--wf-ink);
      text-decoration: none;
      cursor: pointer;
      width: 100%;
      background: transparent;
      border: 0;
      font-family: inherit;
      text-align: left;
    }
    .app-topnav__panel-item:hover { background: var(--wf-fill); }
    .app-topnav__panel-item--danger { color: var(--wf-danger); }
    .app-topnav__panel-kicker {
      font-size: 9px;
      font-weight: 700;
      letter-spacing: .08em;
      color: var(--wf-ink-3);
      text-transform: uppercase;
      padding: 6px 10px 4px;
    }
    .app-topnav__panel-empty {
      padding: 10px;
      font-size: 12px;
      color: var(--wf-ink-3);
      line-height: 1.4;
    }
    .app-topnav__panel-sep {
      border: 0;
      border-top: 1px solid var(--wf-line-2);
      margin: 4px 0;
    }

  `],
})
export class NavComponent implements OnInit, OnDestroy {
  private auth = inject(AuthService);
  private api = inject(ApiService);
  private router = inject(Router);
  private userModes = inject(UserModesService);
  sync = inject(PicksSyncService);

  open = signal<DropdownKey>(null);

  isAdmin = computed(() => this.auth.user()?.isAdmin ?? false);
  handle = computed(() => this.auth.user()?.handle ?? null);
  userSub = computed(() => this.auth.user()?.sub ?? null);
  avatarKey = computed(() => this.auth.user()?.avatarKey ?? null);
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

  async logout() {
    this.closeAll();
    await this.auth.logout();
    void this.router.navigate(['/login']);
  }
}
