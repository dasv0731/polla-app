import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { ApiService } from '../../core/api/api.service';
import { AuthService } from '../../core/auth/auth.service';

type NotificationKind = 'OBTAINED' | 'ASSIGNED' | 'ACTIVATED' | 'EXPIRED' | 'REMINDER_24H';

interface Notif {
  id: string;
  kind: NotificationKind;
  title: string;
  body: string;
  comodinId: string | null;
  readAt: string | null;
  createdAt: string;
}

const KIND_BADGE: Record<NotificationKind, { label: string; color: string }> = {
  OBTAINED:    { label: 'Nuevo',     color: 'rgba(0,200,100,0.18)' },
  ASSIGNED:    { label: 'Asignado',  color: 'rgba(0,130,255,0.18)' },
  ACTIVATED:   { label: 'Activado',  color: 'rgba(255,200,0,0.20)' },
  EXPIRED:     { label: 'Caducado',  color: 'rgba(220,50,50,0.10)' },
  REMINDER_24H:{ label: 'Recordatorio', color: 'rgba(180,180,180,0.20)' },
};

@Component({
  standalone: true,
  selector: 'app-notifications-list',
  template: `
    <header class="page-header">
      <div class="page-header__top">
        <div class="page-header__title">
          <small>Sistema · comodines y eventos</small>
          <h1>Notificaciones</h1>
        </div>
        @if (unreadCount() > 0) {
          <button class="btn btn--ghost btn--sm" type="button"
                  [disabled]="markingAll()"
                  (click)="markAllRead()">
            {{ markingAll() ? 'Marcando…' : 'Marcar todas como leídas' }}
          </button>
        }
      </div>
    </header>

    <div class="container-app">
      @if (loading()) {
        <p>Cargando…</p>
      } @else if (notifs().length === 0) {
        <div class="empty-state">
          <h3>Sin notificaciones</h3>
          <p>Cuando obtengas, asignes o uses un comodín, los avisos aparecerán acá.</p>
        </div>
      } @else {
        <ul class="notif-list">
          @for (n of notifs(); track n.id) {
            <li class="notif-card" [class.is-unread]="!n.readAt"
                (click)="onClick(n)">
              <div class="notif-card__head">
                <span class="notif-card__badge"
                      [style.background]="badgeColor(n.kind)">
                  {{ badgeLabel(n.kind) }}
                </span>
                <strong class="notif-card__title">{{ n.title }}</strong>
                <small>{{ formatDate(n.createdAt) }}</small>
              </div>
              <p class="notif-card__body">{{ n.body }}</p>
            </li>
          }
        </ul>
      }
    </div>
  `,
  styles: [`
    .notif-list { list-style: none; padding: 0; margin: 0; display: grid; gap: var(--space-sm); }
    .notif-card {
      background: var(--color-primary-white);
      border: var(--border-grey);
      border-radius: var(--radius-md);
      padding: var(--space-md);
      cursor: pointer;
    }
    .notif-card.is-unread {
      border-left: 3px solid var(--color-primary-green);
      background: rgba(0,200,100,0.04);
    }
    .notif-card__head {
      display: flex;
      align-items: center;
      gap: var(--space-sm);
      margin-bottom: 4px;
    }
    .notif-card__badge {
      font-size: var(--fs-xs);
      text-transform: uppercase;
      letter-spacing: 0.06em;
      padding: 3px 8px;
      border-radius: 999px;
    }
    .notif-card__title { flex: 1; }
    .notif-card__head small { color: var(--color-text-muted); font-size: var(--fs-xs); }
    .notif-card__body {
      color: var(--color-text-muted);
      font-size: var(--fs-sm);
      line-height: 1.5;
    }
  `],
})
export class NotificationsListComponent implements OnInit {
  private api = inject(ApiService);
  private auth = inject(AuthService);

  loading = signal(true);
  notifs = signal<Notif[]>([]);
  markingAll = signal(false);

  unreadCount = computed(() => this.notifs().filter((n) => !n.readAt).length);

  badgeLabel(k: NotificationKind) { return KIND_BADGE[k].label; }
  badgeColor(k: NotificationKind) { return KIND_BADGE[k].color; }

  formatDate(iso: string): string {
    try {
      return new Date(iso).toLocaleString('es-EC', {
        day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
      });
    } catch { return iso; }
  }

  async ngOnInit() {
    const userId = this.auth.user()?.sub;
    if (!userId) { this.loading.set(false); return; }
    try {
      const res = await this.api.listMyNotifications(userId, 100);
      const rows = ((res.data ?? []) as Notif[])
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      this.notifs.set(rows);
    } finally {
      this.loading.set(false);
    }
  }

  async onClick(n: Notif) {
    if (n.readAt) return;
    try {
      await this.api.markNotificationRead(n.id);
      this.notifs.update((arr) => arr.map((x) =>
        x.id === n.id ? { ...x, readAt: new Date().toISOString() } : x,
      ));
    } catch {
      /* ignore */
    }
  }

  async markAllRead() {
    const unread = this.notifs().filter((n) => !n.readAt);
    if (unread.length === 0) return;
    this.markingAll.set(true);
    try {
      const nowIso = new Date().toISOString();
      await Promise.all(unread.map((n) => this.api.markNotificationRead(n.id)));
      this.notifs.update((arr) => arr.map((x) =>
        x.readAt ? x : { ...x, readAt: nowIso },
      ));
    } finally {
      this.markingAll.set(false);
    }
  }
}
