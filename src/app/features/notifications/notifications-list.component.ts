import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ApiService } from '../../core/api/api.service';
import { AuthService } from '../../core/auth/auth.service';
import { IconComponent } from '../../shared/ui/icon/icon.component';
import { EmptyBlockComponent } from '../../shared/ui/empty-block/empty-block.component';
import { SkeletonComponent } from '../../shared/ui/skeleton/skeleton.component';
import type { IconName } from '../../shared/ui/icon/icon-map';

interface NotifTarget {
  route: string;
  fragment: string | undefined;
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

type FilterKey = 'all' | 'comodines' | 'recordatorios';
type GroupKey = 'today' | 'yesterday' | 'this-week' | 'older';

/**
 * Metadata visual por kind: semantic class + icon + label.
 * Color sale del CSS via `.notif-card__badge--{kind}` para usar tokens
 * en vez de rgba hardcoded inline.
 */
const KIND_META: Record<NotificationKind, { label: string; iconName: IconName; cssMod: string }> = {
  OBTAINED:     { label: 'Nuevo',         iconName: 'gift',  cssMod: 'obtained' },
  ASSIGNED:     { label: 'Asignado',      iconName: 'check', cssMod: 'assigned' },
  ACTIVATED:    { label: 'Activado',      iconName: 'zap',   cssMod: 'activated' },
  EXPIRED:      { label: 'Caducado',      iconName: 'alert', cssMod: 'expired' },
  REMINDER_24H: { label: 'Recordatorio',  iconName: 'clock', cssMod: 'reminder' },
};

/** Reminder kinds = "recordatorios" filter bucket; el resto va a "comodines". */
const REMINDER_KINDS: ReadonlySet<NotificationKind> = new Set<NotificationKind>(['REMINDER_24H']);

const GROUP_HEADERS: Record<GroupKey, string> = {
  'today':      'Hoy',
  'yesterday':  'Ayer',
  'this-week':  'Esta semana',
  'older':      'Más viejas',
};

@Component({
  standalone: true,
  selector: 'app-notifications-list',
  imports: [RouterLink, IconComponent, EmptyBlockComponent, SkeletonComponent],
  template: `
    <header class="page-header">
      <div class="page-header__top">
        <div class="page-header__title">
          <small>Sistema · comodines y eventos</small>
          <h1>
            Notificaciones
            @if (unreadCount() > 0) {
              <span class="notif-unread-badge" aria-label="Sin leer">
                {{ unreadCount() }} sin leer
              </span>
            }
          </h1>
        </div>
        @if (unreadCount() > 0) {
          <button class="btn btn--ghost btn--sm" type="button"
                  [disabled]="markingAll()"
                  (click)="markAllRead()">
            {{ markingAll() ? 'Marcando…' : 'Marcar todas como leídas' }}
          </button>
        }
      </div>

      <!-- Filter pills por tipo (UX gap doc 16: ahora hay categoría) -->
      <div class="notif-filters" role="group" aria-label="Filtrar notificaciones">
        <button type="button" class="notif-filter-pill"
                [attr.aria-pressed]="filter() === 'all'"
                [class.is-active]="filter() === 'all'"
                (click)="filter.set('all')">
          Todas · {{ notifs().length }}
        </button>
        <button type="button" class="notif-filter-pill"
                [attr.aria-pressed]="filter() === 'comodines'"
                [class.is-active]="filter() === 'comodines'"
                (click)="filter.set('comodines')">
          Comodines · {{ comodinCount() }}
        </button>
        <button type="button" class="notif-filter-pill"
                [attr.aria-pressed]="filter() === 'recordatorios'"
                [class.is-active]="filter() === 'recordatorios'"
                (click)="filter.set('recordatorios')">
          Recordatorios · {{ reminderCount() }}
        </button>
      </div>
    </header>

    <div class="container-app">
      @if (loading()) {
        <app-skeleton variant="list" [count]="5" />
      } @else if (filteredNotifs().length === 0) {
        <app-empty-block iconName="bell"
                         title="Sin notificaciones"
                         sub="Cuando obtengas, asignes o uses un comodín, los avisos aparecerán acá." />
      } @else {
        @for (group of groupedNotifs(); track group.key) {
          <section class="notif-group">
            <h2 class="notif-group__heading">{{ groupLabel(group.key) }}</h2>
            <ul class="notif-list">
              @for (n of group.items; track n.id) {
                <li class="notif-card" [class.is-unread]="!n.readAt">
                  <a class="notif-card__link"
                     [routerLink]="resolveTarget(n).route"
                     [fragment]="resolveTarget(n).fragment"
                     (click)="markRead(n)">
                    <div class="notif-card__head">
                      <span class="notif-card__badge"
                            [class]="'notif-card__badge--' + kindCssMod(n.kind)">
                        <app-icon [name]="kindIcon(n.kind)" size="sm" />
                        {{ kindLabel(n.kind) }}
                      </span>
                      <strong class="notif-card__title">{{ n.title }}</strong>
                      <small>{{ formatRelativeDate(n.createdAt) }}</small>
                    </div>
                    <p class="notif-card__body">{{ n.body }}</p>
                  </a>
                </li>
              }
            </ul>
          </section>
        }
      }
    </div>
  `,
  styles: [`
    :host { display: block; }

    .notif-unread-badge {
      display: inline-flex;
      align-items: center;
      margin-left: var(--space-sm);
      background: var(--color-primary-green);
      color: var(--color-primary-white);
      padding: 2px 10px;
      border-radius: 999px;
      font-size: var(--fs-xs);
      font-weight: 600;
      vertical-align: middle;
    }

    .notif-filters {
      display: flex;
      gap: var(--space-sm);
      flex-wrap: wrap;
      margin-top: var(--space-md);
    }
    .notif-filter-pill {
      background: var(--color-primary-white);
      border: 1px solid var(--color-line);
      border-radius: 999px;
      padding: 6px 14px;
      cursor: pointer;
      font-size: var(--fs-sm);
      color: var(--color-text-muted);
      transition: border-color 100ms, color 100ms;
    }
    .notif-filter-pill:hover {
      border-color: var(--color-primary-green);
      color: var(--color-primary-black);
    }
    .notif-filter-pill.is-active {
      background: var(--color-primary-black);
      color: var(--color-primary-white);
      border-color: var(--color-primary-black);
    }
    .notif-filter-pill:focus-visible {
      outline: 2px solid var(--color-primary-green);
      outline-offset: 2px;
    }

    .notif-group { margin-top: var(--space-lg); }
    .notif-group__heading {
      font-family: var(--font-display);
      font-size: var(--fs-sm);
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: var(--color-text-muted);
      margin: 0 0 var(--space-sm);
    }

    .notif-list { list-style: none; padding: 0; margin: 0; display: grid; gap: var(--space-sm); }
    .notif-card {
      background: var(--color-primary-white);
      border: 1px solid var(--color-line);
      border-radius: 12px;
      transition: border-color 100ms;
    }
    .notif-card:hover { border-color: var(--color-primary-green); }
    .notif-card.is-unread {
      border-left: 3px solid var(--color-primary-green);
      background: var(--wf-green-soft, rgba(2, 204, 116, 0.06));
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
    /* Badge: color + icon (no longer color-only — WCAG fix doc 16) */
    .notif-card__badge {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      font-size: 9px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      padding: 2px 8px;
      border-radius: 999px;
    }
    .notif-card__badge--obtained {
      background: var(--wf-green-soft, rgba(2, 204, 116, 0.12));
      color: var(--wf-green-ink, #017f4a);
    }
    .notif-card__badge--assigned {
      background: rgba(0, 130, 255, 0.12);
      color: #1d6fc4;
    }
    .notif-card__badge--activated {
      background: rgba(255, 200, 0, 0.18);
      color: #8a6500;
    }
    .notif-card__badge--expired {
      background: rgba(220, 50, 50, 0.10);
      color: var(--color-lost, #c33);
    }
    .notif-card__badge--reminder {
      background: rgba(120, 120, 120, 0.14);
      color: var(--color-text-muted);
    }
    .notif-card__title { flex: 1; font-size: 13px; font-weight: 600; }
    .notif-card__head small { color: var(--color-text-muted); font-size: 10px; }
    .notif-card__body {
      color: var(--color-text-secondary, var(--color-text-muted));
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
  filter = signal<FilterKey>('all');

  unreadCount = computed(() => this.notifs().filter((n) => !n.readAt).length);

  comodinCount = computed(() =>
    this.notifs().filter((n) => !REMINDER_KINDS.has(n.kind)).length,
  );
  reminderCount = computed(() =>
    this.notifs().filter((n) => REMINDER_KINDS.has(n.kind)).length,
  );

  filteredNotifs = computed<Notif[]>(() => {
    const f = this.filter();
    const all = this.notifs();
    if (f === 'all') return all;
    if (f === 'comodines') return all.filter((n) => !REMINDER_KINDS.has(n.kind));
    if (f === 'recordatorios') return all.filter((n) => REMINDER_KINDS.has(n.kind));
    return all;
  });

  /** Notifs agrupadas por bucket de fecha (Hoy / Ayer / Esta semana / Más viejas). */
  groupedNotifs = computed<Array<{ key: GroupKey; items: Notif[] }>>(() => {
    const list = this.filteredNotifs();
    const buckets: Record<GroupKey, Notif[]> = {
      'today':     [],
      'yesterday': [],
      'this-week': [],
      'older':     [],
    };
    for (const n of list) {
      buckets[this.bucketOf(n.createdAt)].push(n);
    }
    // Mantener orden: today, yesterday, this-week, older. Solo incluir buckets con items.
    return (['today', 'yesterday', 'this-week', 'older'] as GroupKey[])
      .filter((k) => buckets[k].length > 0)
      .map((k) => ({ key: k, items: buckets[k] }));
  });

  groupLabel(k: GroupKey): string {
    return GROUP_HEADERS[k];
  }

  /** Bucket por antigüedad relativa a "hoy" en la zona del navegador. */
  private bucketOf(iso: string): GroupKey {
    const created = new Date(iso);
    const now = new Date();
    const isSameDay = (a: Date, b: Date) =>
      a.getFullYear() === b.getFullYear()
      && a.getMonth() === b.getMonth()
      && a.getDate() === b.getDate();
    if (isSameDay(created, now)) return 'today';
    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    if (isSameDay(created, yesterday)) return 'yesterday';
    const ageMs = now.getTime() - created.getTime();
    if (ageMs <= 7 * 86_400_000) return 'this-week';
    return 'older';
  }

  kindLabel(k: NotificationKind) { return KIND_META[k].label; }
  kindIcon(k: NotificationKind): IconName { return KIND_META[k].iconName; }
  kindCssMod(k: NotificationKind): string { return KIND_META[k].cssMod; }

  /**
   * Format relativo según el bucket — "Hoy 18:30", "Ayer 11:00", "12 jun".
   * Para older de hace más de 1 año, agrega "12 jun 2025".
   */
  formatRelativeDate(iso: string): string {
    try {
      const d = new Date(iso);
      const bucket = this.bucketOf(iso);
      const hhmm = d.toLocaleTimeString('es-EC', { hour: '2-digit', minute: '2-digit' });
      if (bucket === 'today')     return `Hoy ${hhmm}`;
      if (bucket === 'yesterday') return `Ayer ${hhmm}`;
      // this-week / older — usar día + mes (+ año si es de hace >1 año).
      const sameYear = d.getFullYear() === new Date().getFullYear();
      return d.toLocaleDateString('es-EC', sameYear
        ? { day: '2-digit', month: 'short' }
        : { day: '2-digit', month: 'short', year: 'numeric' });
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
   *  MATCH_LIVE / RANK_CHANGED, este resolver crece — TODO(A6). */
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
          fragment: n.comodinId ? `card-${n.comodinId}` : undefined,
        };
      default:
        return { route: '/mis-comodines', fragment: undefined };
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
