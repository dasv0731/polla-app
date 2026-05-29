import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ApiService } from '../../core/api/api.service';
import { AuthService } from '../../core/auth/auth.service';

interface NotifTarget {
  route: string;
  fragment: string | null;
}

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
  imports: [RouterLink],
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
            <li class="notif-card" [class.is-unread]="!n.readAt">
              <a class="notif-card__link"
                 [routerLink]="resolveTarget(n).route"
                 [fragment]="resolveTarget(n).fragment"
                 (click)="markRead(n)">
                <div class="notif-card__head">
                  <span class="notif-card__badge"
                        [style.background]="badgeColor(n.kind)">
                    {{ badgeLabel(n.kind) }}
                  </span>
                  <strong class="notif-card__title">{{ n.title }}</strong>
                  <small>{{ formatDate(n.createdAt) }}</small>
                </div>
                <p class="notif-card__body">{{ n.body }}</p>
              </a>
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
      border: 1px solid var(--wf-line);
      border-radius: 12px;
      transition: border-color 100ms;
    }
    .notif-card:hover { border-color: var(--color-primary-green); }
    .notif-card.is-unread {
      border-left: 3px solid var(--color-primary-green);
      background: var(--wf-green-soft);
    }
    .notif-card__link {
      display: block;
      padding: var(--space-sm) var(--space-md);
      color: inherit;
      text-decoration: none;
      border-radius: inherit;
    }
    .notif-card__link:focus-visible {
      outline: 2px solid var(--color-primary-green);
      outline-offset: 2px;
    }
    .notif-card__head {
      display: flex;
      align-items: center;
      gap: var(--space-sm);
      margin-bottom: 4px;
    }
    .notif-card__badge {
      font-size: 9px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      padding: 2px 8px;
      border-radius: 999px;
    }
    .notif-card__title { flex: 1; font-size: 13px; font-weight: 600; }
    .notif-card__head small { color: var(--wf-ink-3); font-size: 10px; }
    .notif-card__body {
      color: var(--wf-ink-2);
      font-size: 12px;
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

  /** Fire-and-forget: marca la notif como leída sin bloquear la navegación
   *  que dispara <a routerLink>. La navegación la maneja el router. */
  markRead(n: Notif) {
    if (n.readAt) return;
    this.notifs.update((arr) => arr.map((x) =>
      x.id === n.id ? { ...x, readAt: new Date().toISOString() } : x,
    ));
    this.api.markNotificationRead(n.id).catch(() => { /* ignore */ });
  }

  /** Mapea kind → { route, fragment } para uso directo con [routerLink] +
   *  [fragment]. Todas las notifs actuales son de comodines
   *  (OBTAINED/ASSIGNED/ACTIVATED/EXPIRED/REMINDER_24H). Cuando agreguemos
   *  MATCH_LIVE / RANK_CHANGED, este resolver crece. */
  resolveTarget(n: Notif): NotifTarget {
    switch (n.kind) {
      case 'OBTAINED':
      case 'ASSIGNED':
      case 'ACTIVATED':
      case 'EXPIRED':
      case 'REMINDER_24H':
        // El fragment apunta al card del comodín específico cuando el id
        // existe; sino, scroll natural al hub de comodines.
        return {
          route: '/mis-comodines',
          fragment: n.comodinId ? `card-${n.comodinId}` : null,
        };
      default:
        return { route: '/mis-comodines', fragment: null };
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
