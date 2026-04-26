import { Component, OnInit, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { ApiService } from '../../core/api/api.service';
import { AuthService } from '../../core/auth/auth.service';

interface GroupRow {
  id: string;
  name: string;
  members: number;
  myRank: number | null;
}

@Component({
  standalone: true,
  selector: 'app-groups-list',
  imports: [RouterLink],
  template: `
    <section class="container">
      <header class="page-header">
        <h1>Mis grupos</h1>
        <a class="btn btn--primary" routerLink="/groups/new">Crear grupo</a>
      </header>

      <section class="quick-join">
        <h2 class="quick-join__title">Unirme a un grupo</h2>
        <div class="quick-join__row">
          <input class="form-card__input"
                 placeholder="A2K9MP" maxlength="6"
                 [value]="code()"
                 (input)="code.set($any($event.target).value.toUpperCase())">
          <button class="btn btn--primary" (click)="join()" [disabled]="joining()">
            {{ joining() ? 'Validando…' : 'Unirme' }}
          </button>
        </div>
        @if (joinError()) {
          <p class="form-card__hint" style="color: var(--color-error, #c00);">{{ joinError() }}</p>
        }
      </section>

      @if (loading()) {
        <p>Cargando…</p>
      } @else if (groups().length === 0) {
        <p class="empty-state">Aún no estás en ningún grupo. Crea uno o únete con un código.</p>
      } @else {
        <ul class="group-list">
          @for (g of groups(); track g.id) {
            <li class="group-card">
              <a class="group-card__link" [routerLink]="['/groups', g.id]">
                <span class="group-card__name">{{ g.name }}</span>
                <span class="group-card__meta">
                  {{ g.members }} miembro{{ g.members === 1 ? '' : 's' }}
                  · #{{ g.myRank ?? '?' }}
                </span>
              </a>
            </li>
          }
        </ul>
      }
    </section>
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
          return {
            id: m.groupId,
            name: grp.data.name,
            members: (members.data ?? []).length,
            myRank: myRank >= 0 ? myRank + 1 : null,
          };
        }),
      );
      this.groups.set(enriched.filter((x): x is GroupRow => x !== null));
    } finally {
      this.loading.set(false);
    }
  }

  async join() {
    if (this.code().length !== 6) {
      this.joinError.set('El código debe ser 6 caracteres');
      return;
    }
    this.joinError.set(null);
    this.joining.set(true);
    try {
      const res = await this.api.joinGroup(this.code());
      if (res.data?.groupId) {
        void this.router.navigate(['/groups', res.data.groupId]);
      }
    } catch (e) {
      this.joinError.set((e as Error).message ?? 'Código inválido');
    } finally {
      this.joining.set(false);
    }
  }
}
