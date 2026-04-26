import { Component, Input, OnInit, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { ApiService } from '../../core/api/api.service';
import { AuthService } from '../../core/auth/auth.service';
import { ToastService } from '../../core/notifications/toast.service';
import { GroupLeaderboardComponent, type LeaderboardRow } from './group-leaderboard.component';

interface GroupHeader {
  id: string;
  name: string;
  joinCode: string;
  adminUserId: string;
}

@Component({
  standalone: true,
  selector: 'app-group-detail',
  imports: [GroupLeaderboardComponent, RouterLink],
  template: `
    <section class="container">
      <a routerLink="/groups" class="back-link">← Mis grupos</a>

      @let g = group();

      @if (loading()) {
        <p>Cargando grupo…</p>
      } @else if (g !== null) {
        <header class="group-detail__header">
          <h1>{{ g.name }}</h1>
          <p class="group-detail__meta">{{ rows().length }} miembro{{ rows().length === 1 ? '' : 's' }}</p>
          <div class="invite-code">
            <span class="invite-code__label">Código de invitación</span>
            <strong class="invite-code__code">{{ g.joinCode }}</strong>
            <button class="btn btn--ghost btn--sm" (click)="copyLink()">{{ copied() ? 'Copiado ✓' : 'Copiar link' }}</button>
          </div>
        </header>

        <app-group-leaderboard [rows]="rows()" [currentUserId]="currentUserId" />

        @if (isAdminOfGroup()) {
          <section class="danger-zone">
            <h3>Zona admin del grupo</h3>
            <button class="btn btn--danger" (click)="del()" [disabled]="deleting()">
              {{ deleting() ? 'Eliminando…' : 'Eliminar grupo' }}
            </button>
          </section>
        }
      } @else {
        <p>Grupo no encontrado.</p>
      }
    </section>
  `,
})
export class GroupDetailComponent implements OnInit {
  @Input() id!: string;

  private api = inject(ApiService);
  private auth = inject(AuthService);
  private toast = inject(ToastService);
  private router = inject(Router);

  group = signal<GroupHeader | null>(null);
  rows = signal<LeaderboardRow[]>([]);
  loading = signal(true);
  deleting = signal(false);
  copied = signal(false);
  currentUserId = '';

  isAdminOfGroup = computed(() => this.group()?.adminUserId === this.currentUserId);

  async ngOnInit() {
    this.currentUserId = this.auth.user()?.sub ?? '';
    try {
      const [grp, totals, members] = await Promise.all([
        this.api.getGroup(this.id),
        this.api.groupLeaderboard(this.id),
        this.api.groupMembers(this.id),
      ]);
      if (grp.data) {
        this.group.set({
          id: grp.data.id,
          name: grp.data.name,
          joinCode: grp.data.joinCode,
          adminUserId: grp.data.adminUserId,
        });
      }

      const handlesByUser = new Map<string, string>();
      await Promise.all(
        (members.data ?? []).map(async (m) => {
          const u = await this.api.getUser(m.userId);
          handlesByUser.set(m.userId, u.data?.handle ?? m.userId.slice(0, 6));
        }),
      );

      const sorted = (totals.data ?? []).sort((a, b) => (b.points ?? 0) - (a.points ?? 0));
      this.rows.set(
        sorted.map((t) => ({
          userId: t.userId,
          handle: handlesByUser.get(t.userId) ?? t.userId.slice(0, 6),
          points: t.points ?? 0,
          exactCount: t.exactCount ?? 0,
          resultCount: t.resultCount ?? 0,
        })),
      );
    } finally {
      this.loading.set(false);
    }
  }

  async copyLink() {
    const g = this.group();
    if (!g) return;
    await navigator.clipboard.writeText(`${location.origin}/groups/join/${g.joinCode}`);
    this.copied.set(true);
    setTimeout(() => this.copied.set(false), 2000);
  }

  async del() {
    if (!confirm('¿Eliminar el grupo? Esto borra a todos los miembros y el historial.')) return;
    this.deleting.set(true);
    try {
      await this.api.deleteGroup(this.id);
      this.toast.success('Grupo eliminado');
      void this.router.navigate(['/groups']);
    } catch (e) {
      this.toast.error((e as Error).message ?? 'No se pudo eliminar el grupo');
      this.deleting.set(false);
    }
  }
}
