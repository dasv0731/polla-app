import { Component, Input, OnInit, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { ApiService } from '../../core/api/api.service';
import { AuthService } from '../../core/auth/auth.service';
import { ToastService } from '../../core/notifications/toast.service';
import { humanizeError } from '../../core/notifications/domain-errors';
import { GroupLeaderboardComponent, type LeaderboardRow } from './group-leaderboard.component';

const TOURNAMENT_ID = 'mundial-2026';

type ComodinType =
  | 'MULTIPLIER_X2' | 'PHASE_BOOST' | 'GROUP_SAFE_PICK' | 'BRACKET_SAFE_PICK'
  | 'REASSIGN_CHAMP_RUNNER' | 'LATE_EDIT' | 'BRACKET_RESET' | 'GROUP_RESET'
  | 'ANTI_PENALTY';

interface UserComodin {
  id: string;
  type: ComodinType | null;
  status: string;
}

const COMODIN_INFO: Record<ComodinType, { name: string; impact: string; example: string; }> = {
  MULTIPLIER_X2: {
    name: 'Multiplicador x2',
    impact: 'Duplica los puntos de marcador en 1 partido (grupos u octavos).',
    example: 'Si predijiste 2-1 y el partido termina 2-1, ganas 5 pts × 2 = 10.',
  },
  PHASE_BOOST: {
    name: 'Boost de fase',
    impact: '× 1.5 a marcadores de toda una fase eliminatoria (octavos o cuartos).',
    example: 'Acertaste 3 marcadores de octavos: en vez de 22.5 pts ganas 33.75.',
  },
  GROUP_SAFE_PICK: {
    name: 'Pick seguro de grupos',
    impact: 'Si fallás 1 posición específica, recibís 50% en vez de 0.',
    example: 'Aseguraste el 1° del Grupo A. Si tu equipo no clasificó, ganas 3 pts (50% de 5).',
  },
  BRACKET_SAFE_PICK: {
    name: 'Pick seguro de llaves',
    impact: 'Si fallás 1 equipo en una fase, recibís 50% en vez de 0.',
    example: 'Aseguraste a Alemania en cuartos. Si no llega, ganas 3 pts (50% de 6).',
  },
  REASSIGN_CHAMP_RUNNER: {
    name: 'Reasignación campeón / subcampeón',
    impact: 'Cambiás la predicción post-grupos. Paga 50% si acierta.',
    example: 'Reasignás campeón a Brasil. Si Brasil gana, ganás 7.5 pts (50% de 15).',
  },
  LATE_EDIT: {
    name: 'Edición tardía',
    impact: 'Editás un marcador hasta 15 min post-kickoff. Paga 50%.',
    example: 'Vas perdiendo 0-0 y editás a 1-0 al min 14. Si termina 1-0, ganas 2.5 pts (50% de 5).',
  },
  BRACKET_RESET: {
    name: 'Reseteo de fase eliminatoria',
    impact: 'Reescribís todos los picks de una fase. Aciertos pagan 60%.',
    example: 'Reseteás cuartos y aciertas los 4 equipos: ganas 14.4 pts (vs 24 sin reset, vs 0 si fallabas).',
  },
  GROUP_RESET: {
    name: 'Reseteo de grupo',
    impact: 'Reordenás las 4 posiciones tras J1. Aciertos pagan 50%.',
    example: 'Reordenás Grupo C después de J1 y aciertas las 4: ganas 10 pts (vs 20 normal).',
  },
  ANTI_PENALTY: {
    name: 'Anti-penalización',
    impact: 'Anula la penalización del Pick seguro de llaves: paga 100% en vez de 50%.',
    example: 'Tu safe pick de finalista falla. Sin anti-pen ganabas 5; con anti-pen ganas 10 (full).',
  },
};

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
            <!-- Comodines solo aplican a Modo Completo (reglamento §1).
                 En grupos SIMPLE no se muestra ni el icono ni el modal. -->
            @if (g.mode === 'COMPLETE' && myActiveComodines().length > 0) {
              <button class="group-hero__stat group-hero__stat--button"
                      type="button" (click)="openComodinesModal()"
                      title="Ver tus comodines activos">
                <strong>🃏 {{ myActiveComodines().length }}</strong>
                <small>Comodines</small>
              </button>
            }
          </div>
        </div>
      </section>

      @if (showComodinesModal()) {
        <div class="comodin-overlay" role="dialog" aria-modal="true"
             (click)="closeComodinesModal()">
          <div class="comodin-modal" (click)="$event.stopPropagation()">
            <header class="comodin-modal__head">
              <h2>Tus comodines en este torneo</h2>
              <button type="button" class="comodin-modal__x"
                      (click)="closeComodinesModal()">×</button>
            </header>
            <p class="form-card__hint" style="margin-bottom: var(--space-md);">
              {{ myActiveComodines().length }} de 5 acumulados. Cada uno se asigna o
              ejerce desde <a class="link-green" routerLink="/mis-comodines"
                              (click)="closeComodinesModal()">/mis-comodines</a>.
            </p>
            <ul class="comodin-modal__list">
              @for (c of myActiveComodines(); track c.id) {
                @if (c.type) {
                  @let info = COMODIN_INFO[c.type];
                  <li class="comodin-modal__item">
                    <strong>{{ info.name }}</strong>
                    <p class="comodin-modal__impact">{{ info.impact }}</p>
                    <p class="comodin-modal__example">
                      <small><em>Ejemplo:</em> {{ info.example }}</small>
                    </p>
                    <span class="comodin-modal__status"
                          [class.is-unassigned]="c.status === 'UNASSIGNED'"
                          [class.is-assigned]="c.status === 'ASSIGNED'"
                          [class.is-activated]="c.status === 'ACTIVATED'">
                      {{ statusLabel(c.status) }}
                    </span>
                  </li>
                } @else {
                  <li class="comodin-modal__item">
                    <strong>Sin tipo elegido</strong>
                    <p class="comodin-modal__impact">
                      Comodín pendiente de elegir tipo —
                      <a class="link-green" routerLink="/mis-comodines"
                         (click)="closeComodinesModal()">elige uno</a>.
                    </p>
                  </li>
                }
              }
            </ul>
          </div>
        </div>
      }

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
  styles: [`
    .group-hero__stat--button {
      background: transparent;
      border: 0;
      color: inherit;
      font: inherit;
      cursor: pointer;
      padding: 0;
      text-align: inherit;
    }
    .group-hero__stat--button:hover strong { color: var(--color-primary-green); }

    .comodin-overlay {
      position: fixed; inset: 0;
      background: rgba(0,0,0,0.55);
      display: flex; align-items: center; justify-content: center;
      z-index: 1000; padding: var(--space-md);
    }
    .comodin-modal {
      max-width: 640px; width: 100%;
      max-height: 88vh; overflow-y: auto;
      background: var(--color-primary-white);
      border-radius: var(--radius-md);
      padding: var(--space-lg);
    }
    .comodin-modal__head {
      display: flex; justify-content: space-between; align-items: center;
      margin-bottom: var(--space-sm);
    }
    .comodin-modal__head h2 {
      font-family: var(--font-display);
      font-size: var(--fs-2xl);
      text-transform: uppercase;
      line-height: 1; margin: 0;
    }
    .comodin-modal__x {
      background: transparent; border: 0;
      font-size: 28px; line-height: 1; cursor: pointer;
      color: var(--color-text-muted);
    }
    .comodin-modal__list {
      list-style: none; padding: 0; margin: 0;
      display: grid; gap: var(--space-sm);
    }
    .comodin-modal__item {
      background: var(--color-primary-grey, #f4f4f4);
      border-radius: var(--radius-sm);
      padding: var(--space-md);
      display: grid; gap: 4px;
      position: relative;
    }
    .comodin-modal__item strong {
      font-family: var(--font-display);
      font-size: var(--fs-lg);
      text-transform: uppercase;
      line-height: 1;
    }
    .comodin-modal__impact {
      font-size: var(--fs-sm);
      line-height: 1.4;
    }
    .comodin-modal__example {
      font-size: var(--fs-xs);
      color: var(--color-text-muted);
      line-height: 1.4;
    }
    .comodin-modal__status {
      position: absolute;
      top: var(--space-md);
      right: var(--space-md);
      font-size: var(--fs-xs);
      text-transform: uppercase;
      letter-spacing: 0.06em;
      padding: 3px 8px;
      border-radius: 999px;
      background: rgba(0,0,0,0.06);
    }
    .comodin-modal__status.is-unassigned {
      background: rgba(255,200,0,0.18);
      color: var(--color-primary-black);
    }
    .comodin-modal__status.is-assigned {
      background: rgba(0,200,100,0.14);
      color: var(--color-primary-green);
    }
    .comodin-modal__status.is-activated {
      background: var(--color-primary-green);
      color: var(--color-primary-white);
    }
  `],
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

  // Comodines del user en el torneo (todos los grupos del torneo
  // comparten cartera). Activos = no EXPIRED.
  myComodines = signal<UserComodin[]>([]);
  myActiveComodines = computed(() =>
    this.myComodines().filter((c) => c.status !== 'EXPIRED'),
  );
  showComodinesModal = signal(false);
  COMODIN_INFO = COMODIN_INFO;
  openComodinesModal() { this.showComodinesModal.set(true); }
  closeComodinesModal() { this.showComodinesModal.set(false); }
  statusLabel(s: string): string {
    if (s === 'PENDING_TYPE_CHOICE') return 'Elige tipo';
    if (s === 'UNASSIGNED') return 'Sin asignar';
    if (s === 'ASSIGNED') return 'Asignado';
    if (s === 'ACTIVATED') return 'Activado';
    return s;
  }

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

    // Cargar comodines del user (best-effort, no bloquea la UI del grupo)
    void this.loadMyComodines();
  }

  private async loadMyComodines() {
    if (!this.currentUserId) return;
    try {
      const res = await this.api.listMyComodines(this.currentUserId, TOURNAMENT_ID);
      const rows = ((res.data ?? []) as UserComodin[]);
      this.myComodines.set(rows);
    } catch {
      // ignore — el icono no aparece si no carga
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
