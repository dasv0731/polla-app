import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { ApiService } from '../../core/api/api.service';
import { AuthService } from '../../core/auth/auth.service';
import { UserModesService } from '../../core/user/user-modes.service';
import { GroupActionsService } from '../../core/groups/group-actions.service';
import { compareRankable } from '../../shared/util/tiebreakers';

type GameMode = 'SIMPLE' | 'COMPLETE';

interface GroupRow {
  id: string;
  name: string;
  members: number;
  myRank: number | null;
  isAdmin: boolean;
  adminHandle: string | null;
  createdAt: string;
  mode: GameMode;
}

@Component({
  standalone: true,
  selector: 'app-groups-list',
  imports: [RouterLink, FormsModule],
  template: `
    <header class="page-header">
      <div class="page-header__top">
        <div class="page-header__title">
          <small>{{ countLabel() }} · Mundial 2026</small>
          <h1>Mis grupos</h1>
        </div>
        <div class="page-header__actions">
          <button type="button" class="btn btn--primary" (click)="groupActions.openCreate()">
            + Crear grupo
          </button>
          <button type="button" class="btn btn--ghost" (click)="groupActions.openJoin()">
            Unirme con código
          </button>
        </div>
      </div>
    </header>

    <div class="container-app">
      @if (loading()) {
        <p>Cargando…</p>
      } @else {
        @for (g of groups(); track g.id) {
          <a class="group-row" [routerLink]="['/groups', g.id]">
            <span class="group-row__icon" [class.group-row__icon--admin]="g.isAdmin"
                  [attr.aria-label]="g.isAdmin ? 'Admin del grupo' : 'Miembro'">
              {{ icon(g) }}
            </span>
            <div class="group-row__body">
              <p class="group-row__name">
                {{ g.name }}
                <span style="display: inline-block; padding: 2px 8px; border-radius: 999px; font-size: var(--fs-xs); text-transform: uppercase; letter-spacing: 0.06em; margin-left: 8px; vertical-align: middle;"
                      [style.background]="g.mode === 'COMPLETE' ? 'var(--color-primary-green)' : 'rgba(255,200,0,0.4)'"
                      [style.color]="g.mode === 'COMPLETE' ? 'var(--color-primary-white)' : 'var(--color-primary-black)'">
                  {{ g.mode === 'COMPLETE' ? 'Completo' : 'Simple' }}
                </span>
              </p>
              <p class="group-row__meta">
                {{ g.members }} miembros
                @if (g.isAdmin) {
                   · Eres <strong>admin</strong>
                } @else if (g.adminHandle) {
                   · creado por <strong>{{ '@' + g.adminHandle }}</strong>
                }
                @if (g.createdAt) {
                   · creado el {{ formatDate(g.createdAt) }}
                }
              </p>
            </div>
            <div class="group-row__pos">
              <p class="group-row__pos-num">#{{ g.myRank ?? '?' }}</p>
              <p class="group-row__pos-label">de {{ g.members }}</p>
            </div>
          </a>
        }
      }

      <section class="empty-cta" id="unirme" style="margin-top: var(--space-2xl);">
        <article class="empty-cta__card">
          <h3>Crear un nuevo grupo</h3>
          <p>Arma un grupo privado con tus amigos. Recibes un código de 6 caracteres para invitar a quien quieras.</p>
          <button type="button" class="btn btn--primary" (click)="groupActions.openCreate()">
            + Crear grupo
          </button>
        </article>

        <article class="empty-cta__card">
          <h3>Unirme con código</h3>
          <p>¿Te invitaron? Abrí el modal y pega el código de 6 caracteres.</p>
          <button type="button" class="btn btn--primary" (click)="groupActions.openJoin()">
            Unirme con código →
          </button>
        </article>
      </section>
    </div>
  `,
})
export class GroupsListComponent implements OnInit {
  private api = inject(ApiService);
  private auth = inject(AuthService);
  private router = inject(Router);
  private userModes = inject(UserModesService);
  groupActions = inject(GroupActionsService);

  groups = signal<GroupRow[]>([]);
  loading = signal(true);
  codeInput = '';
  joinError = signal<string | null>(null);
  joining = signal(false);

  countLabel = computed(() => {
    const n = this.groups().length;
    if (n === 0) return 'Aún no estás en ningún grupo';
    return n === 1 ? '1 grupo activo' : `${n} grupos activos`;
  });

  async ngOnInit() {
    const userId = this.auth.user()?.sub;
    if (!userId) {
      this.loading.set(false);
      return;
    }
    try {
      const memberships = (await this.api.myGroups(userId)).data ?? [];
      const enriched = await Promise.all(
        memberships.map(async (m): Promise<GroupRow | null> => {
          const [grp, members, lb] = await Promise.all([
            this.api.getGroup(m.groupId),
            this.api.groupMembers(m.groupId),
            this.api.groupLeaderboard(m.groupId),
          ]);
          if (!grp.data) return null;
          // Sort §8 — mismo comparator que /ranking para que la posición
          // que mostramos acá coincida con la que el user ve adentro.
          const sorted = [...(lb.data ?? [])].sort(compareRankable);
          const myRank = sorted.findIndex((t) => t.userId === userId);
          const isAdmin = grp.data.adminUserId === userId;

          let adminHandle: string | null = null;
          if (!isAdmin) {
            try {
              const owner = await this.api.getUser(grp.data.adminUserId);
              adminHandle = owner.data?.handle ?? null;
            } catch {
              // ignore
            }
          }

          return {
            id: m.groupId,
            name: grp.data.name,
            members: (members.data ?? []).length,
            myRank: myRank >= 0 ? myRank + 1 : null,
            isAdmin,
            adminHandle,
            createdAt: grp.data.createdAt,
            mode: ((grp.data.mode as GameMode | null | undefined) ?? 'COMPLETE'),
          };
        }),
      );
      this.groups.set(
        enriched
          .filter((x): x is GroupRow => x !== null)
          .sort((a, b) => a.name.localeCompare(b.name)),
      );
    } finally {
      this.loading.set(false);
    }
  }

  icon(g: GroupRow): string {
    if (g.isAdmin) return '★';
    return (g.name[0] ?? '·').toUpperCase();
  }

  formatDate(iso: string): string {
    try {
      return new Date(iso).toLocaleDateString('es-EC', { day: '2-digit', month: 'short' });
    } catch {
      return '—';
    }
  }

  async join() {
    const code = this.codeInput.trim().toUpperCase();
    if (code.length !== 6) {
      this.joinError.set('El código debe tener 6 caracteres');
      return;
    }
    this.joinError.set(null);
    this.joining.set(true);
    try {
      const res = await this.api.joinGroup(code);
      if (res.errors && res.errors.length > 0) {
        this.joinError.set(res.errors[0]!.message ?? 'Código inválido');
        return;
      }
      if (res.data?.groupId) {
        // Re-cargar grupos del user en la cache global para que el dropdown
        // de mis-grupos los vea sin necesidad de full reload.
        const userId = this.auth.user()?.sub;
        if (userId) await this.userModes.load(userId);
        void this.router.navigate(['/groups', res.data.groupId]);
      } else {
        this.joinError.set('No pudimos unirte. Intenta de nuevo.');
      }
    } catch (e) {
      this.joinError.set((e as Error).message ?? 'Código inválido');
    } finally {
      this.joining.set(false);
    }
  }
}
