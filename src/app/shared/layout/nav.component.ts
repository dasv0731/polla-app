import { Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { ApiService } from '../../core/api/api.service';
import { AuthService } from '../../core/auth/auth.service';
import { PicksSyncService } from '../../core/sync/picks-sync.service';
import { UserAvatarComponent } from '../user-avatar/user-avatar.component';

@Component({
  standalone: true,
  selector: 'app-nav',
  imports: [RouterLink, RouterLinkActive, UserAvatarComponent],
  template: `
    <!-- ============ MOBILE TOPBAR (<768px) ============ -->
    <header class="app-topbar">
      <a routerLink="/home" class="app-topbar__brand" aria-label="Golgana" (click)="closeAll()">
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
       grid items directos del .app-shell (topbar mobile + tabbar). */
    :host { display: contents; }

    /* ============================================================
       design-v3: sidebar negro absorbe la navegación primaria. Solo
       conservamos el topbar mobile (<768px) con bell + avatar. El
       tabbar mobile queda oculto (lo reemplaza el sidebar bottom-nav).
       ============================================================ */
    .app-tabbar { display: none !important; }
    @media (min-width: 768px) {
      .app-topbar { display: none !important; }
    }
  `],
})
export class NavComponent implements OnInit, OnDestroy {
  private auth = inject(AuthService);
  private api = inject(ApiService);
  sync = inject(PicksSyncService);

  isAdmin = computed(() => this.auth.user()?.isAdmin ?? false);
  handle = computed(() => this.auth.user()?.handle ?? null);
  userSub = computed(() => this.auth.user()?.sub ?? null);
  avatarKey = computed(() => this.auth.user()?.avatarKey ?? null);

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

  /** No-op kept for backward compatibility with tabbar mobile click handlers
   * (template still references it; tabbar block removed in next commit). */
  closeAll() { /* no-op */ }
}
