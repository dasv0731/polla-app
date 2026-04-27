import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { ApiService } from '../../core/api/api.service';
import { AuthService } from '../../core/auth/auth.service';

interface GroupRow {
  id: string;
  name: string;
  members: number;
  myRank: number | null;
  isAdmin: boolean;
  adminHandle: string | null;
  createdAt: string;
}

@Component({
  standalone: true,
  selector: 'app-groups-list',
  imports: [RouterLink],
  template: `
    <header class="page-header">
      <div class="page-header__top">
        <div class="page-header__title">
          <small>{{ countLabel() }} · Mundial 2026</small>
          <h1>Mis grupos</h1>
        </div>
        <div class="page-header__actions">
          <a class="btn btn--primary" routerLink="/groups/new">+ Crear grupo</a>
          <a class="btn btn--ghost" href="#unirme">Unirme con código</a>
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
              <p class="group-row__name">{{ g.name }}</p>
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
          <a class="btn btn--primary" routerLink="/groups/new">+ Crear grupo</a>
        </article>

        <article class="empty-cta__card">
          <h3>Unirme con código</h3>
          <p>¿Te invitaron? Pega el código que te enviaron. 6 caracteres del alfabeto seguro (sin 0/O/1/I).</p>
          <form class="join-form" (ngSubmit)="join(); $event.preventDefault()">
            <input type="text" placeholder="K7P2QM" maxlength="6"
                   [value]="code()"
                   (input)="code.set($any($event.target).value.toUpperCase())">
            <button class="btn btn--primary" type="button" [disabled]="joining()" (click)="join()">
              {{ joining() ? 'Validando…' : 'Unirme' }}
            </button>
          </form>
          @if (joinError()) {
            <p class="form-card__hint" style="color: var(--color-lost); margin-top: var(--space-sm);">{{ joinError() }}</p>
          }
        </article>
      </section>
    </div>
  `,
})
export class GroupsListComponent implements OnInit {
  private api = inject(ApiService);
  private auth = inject(AuthService);
  private router = inject(Router);

  groups = signal<GroupRow[]>([]);
  loading = signal(true);
  code = signal('');
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
          const sorted = (lb.data ?? []).sort((a, b) => (b.points ?? 0) - (a.points ?? 0));
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
    /* eslint-disable no-console */
    console.log('[joinGroup] FORM SUBMIT — code value:', JSON.stringify(this.code()), 'len:', this.code().length);
    if (this.code().length !== 6) {
      console.log('[joinGroup] ABORT — código no tiene 6 caracteres');
      this.joinError.set('El código debe tener 6 caracteres');
      return;
    }
    console.log('[joinGroup] STEP 1 — clearing errors, setting joining=true');
    this.joinError.set(null);
    this.joining.set(true);
    try {
      console.log('[joinGroup] STEP 2 — calling api.joinGroup() against AppSync…');
      const res = await this.api.joinGroup(this.code());
      console.log('[joinGroup] STEP 3 — got response from AppSync:', res);
      console.log('[joinGroup]   res.data =', res.data);
      console.log('[joinGroup]   res.errors =', res.errors);
      if (res.errors && res.errors.length > 0) {
        console.error('[joinGroup] BRANCH: GraphQL errors path');
        for (const err of res.errors) console.error('  · errors[i]:', err);
        this.joinError.set(res.errors[0]!.message ?? 'Código inválido');
        return;
      }
      if (res.data?.groupId) {
        console.log('[joinGroup] BRANCH: success — navigating to /groups/' + res.data.groupId);
        void this.router.navigate(['/groups', res.data.groupId]);
      } else {
        console.warn('[joinGroup] BRANCH: empty response — no errors but no groupId either');
        this.joinError.set('No pudimos unirte (respuesta vacía). Revisá la pestaña Network.');
      }
    } catch (e) {
      console.error('[joinGroup] BRANCH: threw exception:', e);
      console.error('[joinGroup]   typeof:', typeof e);
      console.error('[joinGroup]   message:', (e as Error)?.message);
      console.error('[joinGroup]   stack:', (e as Error)?.stack);
      this.joinError.set((e as Error).message ?? 'Código inválido');
    } finally {
      console.log('[joinGroup] DONE — joining=false');
      this.joining.set(false);
    }
    /* eslint-enable no-console */
  }
}
