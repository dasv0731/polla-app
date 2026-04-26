import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../core/api/api.service';
import { ToastService } from '../../core/notifications/toast.service';

const TOURNAMENT_ID = 'mundial-2026';

type StatusFilter = 'all' | 'bounced' | 'no_picks';
type SortKey = 'points' | 'created' | 'handle';

interface UserRow {
  sub: string;
  handle: string;
  email: string;
  emailStatus: 'OK' | 'BOUNCED';
  createdAt: string;
  picksCount: number;
  points: number;
  exactCount: number;
  resultCount: number;
  position: number | null;
}

@Component({
  standalone: true,
  selector: 'app-admin-users',
  imports: [FormsModule],
  template: `
    <header class="admin-main__head">
      <div>
        <small>Admin · {{ users().length }} users registrados</small>
        <h1>Users</h1>
      </div>
      <p style="font-size: var(--fs-xs); color: var(--color-text-muted); text-transform: uppercase; letter-spacing: 0.08em; font-weight: var(--fw-bold);">
        Mostrando {{ visible().length === 0 ? 0 : 1 }}-{{ visible().length }} de {{ users().length }}
      </p>
    </header>

    @if (loading()) {
      <p>Cargando usuarios…</p>
    } @else {
      <div class="admin-filters">
        <input type="search" placeholder="Buscar por handle o email..."
               [(ngModel)]="search" (ngModelChange)="onSearch($event)">
        <select [(ngModel)]="status" (ngModelChange)="onStatusChange($event)">
          <option value="all">Todos</option>
          <option value="bounced">Email bounced</option>
          <option value="no_picks">Sin picks</option>
        </select>
        <select [(ngModel)]="sort" (ngModelChange)="onSortChange($event)">
          <option value="points">Ordenar por puntos</option>
          <option value="created">Ordenar por fecha registro</option>
          <option value="handle">Ordenar por handle</option>
        </select>
      </div>

      @if (visible().length === 0) {
        <p class="empty-state">Sin resultados con los filtros actuales.</p>
      } @else {
        <div class="users-table">
          <div class="users-table__scroll">
            <table>
              <thead>
                <tr>
                  <th>Handle</th>
                  <th>Email</th>
                  <th>Registrado</th>
                  <th>Picks</th>
                  <th>Pts</th>
                  <th>Pos</th>
                  <th>Status</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                @for (u of visible(); track u.sub) {
                  <tr [class.is-bounced]="u.emailStatus === 'BOUNCED'">
                    <td>
                      <span class="handle">{{ '@' + u.handle }}</span>
                      @if (u.emailStatus === 'BOUNCED') {
                        <span class="badge badge--bounced">BOUNCED</span>
                      }
                    </td>
                    <td class="email">{{ u.email }}</td>
                    <td>{{ formatDate(u.createdAt) }}</td>
                    <td>{{ u.picksCount }}</td>
                    <td class="pts">{{ u.points }}</td>
                    <td>{{ u.position ? '#' + u.position : '—' }}</td>
                    <td [class.status--bounced]="u.emailStatus === 'BOUNCED'">
                      {{ u.emailStatus === 'BOUNCED' ? 'Email bounced' : 'Activo' }}
                    </td>
                    <td class="actions">
                      <a (click)="actionView(u)">Ver</a>
                      @if (u.emailStatus === 'BOUNCED') {
                        <a class="danger" (click)="actionSuspend(u)">Suspender</a>
                      } @else {
                        <a (click)="actionResetPwd(u)">Reset pwd</a>
                      }
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        </div>
      }
    }
  `,
})
export class AdminUsersComponent implements OnInit {
  private api = inject(ApiService);
  private toast = inject(ToastService);

  loading = signal(true);
  users = signal<UserRow[]>([]);

  search = '';
  status: StatusFilter = 'all';
  sort: SortKey = 'points';

  private searchSig = signal('');
  private statusSig = signal<StatusFilter>('all');
  private sortSig = signal<SortKey>('points');

  visible = computed(() => {
    const q = this.searchSig().trim().toLowerCase();
    const s = this.statusSig();
    const sortKey = this.sortSig();

    let rows = this.users();

    if (q) {
      rows = rows.filter(
        (u) => u.handle.toLowerCase().includes(q) || u.email.toLowerCase().includes(q),
      );
    }
    if (s === 'bounced') rows = rows.filter((u) => u.emailStatus === 'BOUNCED');
    if (s === 'no_picks') rows = rows.filter((u) => u.picksCount === 0);

    rows = [...rows];
    if (sortKey === 'handle') rows.sort((a, b) => a.handle.localeCompare(b.handle));
    else if (sortKey === 'created') rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    else rows.sort((a, b) => b.points - a.points);

    return rows;
  });

  onSearch(v: string) { this.searchSig.set(v); }
  onStatusChange(v: StatusFilter) { this.statusSig.set(v); }
  onSortChange(v: SortKey) { this.sortSig.set(v); }

  async ngOnInit() {
    try {
      const [usersRes, totalsRes, picksRes] = await Promise.all([
        this.api.listUsers(1000),
        this.api.listLeaderboard(TOURNAMENT_ID, 1000),
        this.api.listAllPicks(TOURNAMENT_ID, 5000),
      ]);

      const totals = new Map<string, { points: number; exactCount: number; resultCount: number }>();
      for (const t of totalsRes.data ?? []) {
        totals.set(t.userId, {
          points: t.points ?? 0,
          exactCount: t.exactCount ?? 0,
          resultCount: t.resultCount ?? 0,
        });
      }

      const picksByUser = new Map<string, number>();
      for (const p of picksRes.data ?? []) {
        picksByUser.set(p.userId, (picksByUser.get(p.userId) ?? 0) + 1);
      }

      const positionByUser = new Map<string, number>();
      const sortedTotals = [...(totalsRes.data ?? [])]
        .filter((t) => (t.points ?? 0) > 0)
        .sort((a, b) => (b.points ?? 0) - (a.points ?? 0));
      sortedTotals.forEach((t, i) => positionByUser.set(t.userId, i + 1));

      const rows: UserRow[] = (usersRes.data ?? []).map((u) => {
        const tot = totals.get(u.sub);
        return {
          sub: u.sub,
          handle: u.handle,
          email: u.email,
          emailStatus: (u.emailStatus as 'OK' | 'BOUNCED' | null) ?? 'OK',
          createdAt: u.createdAt,
          picksCount: picksByUser.get(u.sub) ?? 0,
          points: tot?.points ?? 0,
          exactCount: tot?.exactCount ?? 0,
          resultCount: tot?.resultCount ?? 0,
          position: positionByUser.get(u.sub) ?? null,
        };
      });
      this.users.set(rows);
    } finally {
      this.loading.set(false);
    }
  }

  formatDate(iso: string): string {
    if (!iso) return '—';
    return new Date(iso).toLocaleDateString('es-EC', {
      timeZone: 'America/Guayaquil',
      day: '2-digit', month: 'short', year: 'numeric',
    });
  }

  actionView(u: UserRow) {
    this.toast.info(`@${u.handle} · ${u.email} · sub=${u.sub.slice(0, 8)}…`);
  }
  actionResetPwd(u: UserRow) {
    this.toast.info(`Reset password de @${u.handle} — disponible en próxima versión.`);
  }
  actionSuspend(u: UserRow) {
    this.toast.info(`Suspender a @${u.handle} — disponible en próxima versión.`);
  }
}
