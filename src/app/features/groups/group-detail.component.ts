import { Component, Input, OnInit, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { ApiService } from '../../core/api/api.service';
import { AuthService } from '../../core/auth/auth.service';
import { ToastService } from '../../core/notifications/toast.service';
import { humanizeError } from '../../core/notifications/domain-errors';
import { GroupLeaderboardComponent, type LeaderboardRow } from './group-leaderboard.component';

interface GroupHeader {
  id: string;
  name: string;
  joinCode: string;
  adminUserId: string;
  createdAt: string;
  mode: 'SIMPLE' | 'COMPLETE';
  prize1st: string | null;
  prize2nd: string | null;
  prize3rd: string | null;
}

@Component({
  standalone: true,
  selector: 'app-group-detail',
  imports: [GroupLeaderboardComponent, RouterLink],
  template: `
    @let g = group();

    @if (loading()) {
      <p style="padding: var(--space-2xl); text-align: center;">Cargando grupo…</p>
    } @else if (g !== null) {
      <!-- HERO -->
      <section class="group-hero">
        <div class="group-hero__content">
          <div class="group-hero__title">
            <span class="group-hero__icon">{{ icon() }}</span>
            <div>
              <h1 class="group-hero__name">{{ g.name }}</h1>
              <p class="group-hero__meta">
                <span style="display: inline-block; padding: 2px 8px; border-radius: 999px; font-size: var(--fs-xs); text-transform: uppercase; letter-spacing: 0.06em; margin-right: 8px;"
                      [style.background]="g.mode === 'COMPLETE' ? 'var(--color-primary-green)' : 'rgba(255,200,0,0.4)'"
                      [style.color]="g.mode === 'COMPLETE' ? 'var(--color-primary-white)' : 'var(--color-primary-black)'">
                  {{ g.mode === 'COMPLETE' ? 'Modo completo' : 'Modo simple' }}
                </span>
                {{ rows().length }} miembros
                @if (isAdminOfGroup()) {
                   · Eres <strong>admin</strong>
                }
                · creado el {{ formatDate(g.createdAt) }}
              </p>
            </div>
          </div>
          <div class="group-hero__stats">
            <div class="group-hero__stat">
              <strong>{{ myPos() ? '#' + myPos() : '—' }}</strong>
              <small>Tu posición</small>
            </div>
            <div class="group-hero__stat">
              <strong>{{ myPoints() }}</strong>
              <small>Tus puntos</small>
            </div>
            <div class="group-hero__stat">
              <strong>{{ gapToLeader() }}</strong>
              <small>Al líder</small>
            </div>
          </div>
        </div>
      </section>

      <nav class="breadcrumb" style="padding-inline: var(--section-x-mobile);">
        <a routerLink="/groups">Mis grupos</a>
        <span class="breadcrumb__sep">/</span>
        <span aria-current="page">{{ g.name }}</span>
      </nav>

      <div class="container-app group-detail-grid" style="display: grid;">
        <!-- LEADERBOARD principal -->
        <section>
          <header class="section-heading">
            <div class="section-heading__text">
              <p class="kicker">Leaderboard del grupo</p>
              <h2 class="h2">Ranking interno</h2>
            </div>
            <a class="link-green section-heading__cta" routerLink="/ranking">Ver ranking global →</a>
          </header>

          <div class="standings-wrap">
            <app-group-leaderboard [rows]="rows()" [currentUserId]="currentUserId" />
          </div>

          <p style="margin-top: var(--space-md); font-size: var(--fs-xs); color: var(--color-text-muted); text-transform: uppercase; letter-spacing: 0.08em;">
            Tabla refresca automáticamente al publicar resultados
          </p>
        </section>

        <!-- SIDEBAR -->
        <aside class="sidebar">
          <div class="invite-mini">
            <h3>Código del grupo</h3>
            <span class="invite-mini__code">{{ g.joinCode }}</span>
            <p class="invite-mini__url">{{ inviteUrl() }}</p>
            <div class="invite-mini__actions">
              <button class="btn btn--primary btn--sm" type="button" (click)="copyLink()">
                {{ copied() ? 'Copiado ✓' : '📋 Copiar' }}
              </button>
              @if (isAdminOfGroup()) {
                <a class="btn btn--ghost btn--sm" [routerLink]="['/groups', g.id, 'invite']">📧 Email</a>
              }
            </div>
          </div>

          @if (hasPrizes()) {
            <div class="invite-mini">
              <h3>Premios</h3>
              <ul style="list-style: none; padding: 0; margin: 0; display: grid; gap: var(--space-sm);">
                @if (g.prize1st) {
                  <li style="display: flex; gap: var(--space-sm); align-items: baseline;">
                    <span style="font-size: var(--fs-lg);">🥇</span>
                    <span>{{ g.prize1st }}</span>
                  </li>
                }
                @if (g.prize2nd) {
                  <li style="display: flex; gap: var(--space-sm); align-items: baseline;">
                    <span style="font-size: var(--fs-lg);">🥈</span>
                    <span>{{ g.prize2nd }}</span>
                  </li>
                }
                @if (g.prize3rd) {
                  <li style="display: flex; gap: var(--space-sm); align-items: baseline;">
                    <span style="font-size: var(--fs-lg);">🥉</span>
                    <span>{{ g.prize3rd }}</span>
                  </li>
                }
              </ul>
            </div>
          }

          @if (isAdminOfGroup()) {
            <div class="admin-actions">
              <h3>Acciones de admin</h3>
              <ul>
                <li><a [routerLink]="['/groups', g.id, 'invite']"><span>Invitar por email</span><span>→</span></a></li>
                <li><a [routerLink]="['/groups', g.id, 'prizes']"><span>Editar premios</span><span>→</span></a></li>
                <li><a (click)="comingSoon('Renovar código', $event)"><span>Renovar código</span><span>→</span></a></li>
                <li><a (click)="comingSoon('Editar nombre', $event)"><span>Editar nombre</span><span>→</span></a></li>
                <li><a class="is-danger" (click)="del($event)"><span>Eliminar grupo</span><span>×</span></a></li>
              </ul>
              <p style="margin-top: var(--space-md); font-size: var(--fs-xs); color: var(--color-text-muted); line-height: var(--lh-body);">
                Estas acciones solo aparecen porque eres admin del grupo.
              </p>
            </div>
          }
        </aside>
      </div>
    } @else {
      <p style="padding: var(--space-2xl); text-align: center;">Grupo no encontrado.</p>
    }
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
  copied = signal(false);
  currentUserId = '';

  isAdminOfGroup = computed(() => this.group()?.adminUserId === this.currentUserId);
  hasPrizes = computed(() => {
    const g = this.group();
    return !!(g?.prize1st || g?.prize2nd || g?.prize3rd);
  });
  icon = computed(() => (this.isAdminOfGroup() ? '★' : (this.group()?.name?.[0] ?? '·').toUpperCase()));
  inviteUrl = computed(() => {
    const g = this.group();
    return g ? `${location.origin}/groups/join/${g.joinCode}` : '';
  });

  myPos = computed(() => {
    const i = this.rows().findIndex((r) => r.userId === this.currentUserId);
    return i >= 0 ? i + 1 : null;
  });
  myPoints = computed(() => this.rows().find((r) => r.userId === this.currentUserId)?.points ?? 0);
  gapToLeader = computed(() => {
    const me = this.rows().find((r) => r.userId === this.currentUserId);
    const leader = this.rows()[0];
    if (!me || !leader || me.userId === leader.userId) return '—';
    const gap = leader.points - me.points;
    return gap > 0 ? `−${gap}` : '0';
  });

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
          createdAt: grp.data.createdAt,
          mode: (grp.data.mode ?? 'COMPLETE') as 'SIMPLE' | 'COMPLETE',
          prize1st: grp.data.prize1st ?? null,
          prize2nd: grp.data.prize2nd ?? null,
          prize3rd: grp.data.prize3rd ?? null,
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

  formatDate(iso: string): string {
    try {
      return new Date(iso).toLocaleDateString('es-EC', { day: '2-digit', month: 'short', year: 'numeric' });
    } catch {
      return '—';
    }
  }

  async copyLink() {
    await navigator.clipboard.writeText(this.inviteUrl());
    this.copied.set(true);
    setTimeout(() => this.copied.set(false), 2000);
  }

  comingSoon(label: string, event: Event) {
    event.preventDefault();
    this.toast.info(`${label} — próximamente`);
  }

  async del(event: Event) {
    event.preventDefault();
    if (!confirm('¿Eliminar el grupo? Todos los miembros perderán el acceso. Esta acción no se puede deshacer.')) {
      return;
    }
    try {
      await this.api.deleteGroup(this.id);
      this.toast.success('Grupo eliminado');
      void this.router.navigate(['/groups']);
    } catch (e) {
      this.toast.error(humanizeError(e));
    }
  }
}
