import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ApiService } from '../../core/api/api.service';
import { AuthService } from '../../core/auth/auth.service';
import { compareRankable } from '../../shared/util/tiebreakers';
import { GroupActionsService } from '../../core/groups/group-actions.service';
import { getUrl } from 'aws-amplify/storage';

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
  /** Storage key del logo. null si no hay. URL signed se resuelve en
   *  imageUrl signal map. */
  imageKey: string | null;
}

@Component({
  standalone: true,
  selector: 'app-groups-list',
  imports: [RouterLink],
  template: `
    <section class="page">
      <header class="page__header" style="margin-bottom:18px;">
        <div>
          <div class="kicker">{{ countLabel() }} · MUNDIAL 2026</div>
          <h1 class="page__title">Mis grupos</h1>
        </div>
      </header>

      <!-- Acciones (crear / unirme): visibles solo en mobile.
           Desktop tiene los mismos botones en el sidebar. Ambos disparan
           los mismos modales globales vía GroupActionsService. -->
      <div class="groups-list-actions">
        <button type="button" class="btn-wf btn-wf--primary"
                (click)="actions.openCreate()">
          + Crear grupo
        </button>
        <button type="button" class="btn-wf"
                (click)="actions.openJoin()">
          → Unirme con código
        </button>
      </div>

      @if (loading()) {
        <p style="padding:32px;text-align:center;color:var(--wf-ink-3);">Cargando…</p>
      } @else if (groups().length === 0) {
        <div style="padding:32px;text-align:center;background:var(--wf-paper);border:1px dashed var(--wf-line);border-radius:10px;">
          <h3 style="font-family:var(--wf-display);font-size:18px;letter-spacing:.04em;margin:0 0 8px;font-weight:normal;">
            Aún no estás en ningún grupo
          </h3>
          <p style="color:var(--wf-ink-3);font-size:13px;margin:0 0 12px;line-height:1.5;">
            Usa los botones de arriba para crear un grupo o unirte con un código.
          </p>
        </div>
      } @else {
        <div class="groups-list">
          @for (g of groups(); track g.id) {
            <a class="group-card" [routerLink]="['/groups', g.id]">
              @if (imageUrls()[g.id]) {
                <img class="group-card__icon group-card__icon--image"
                     [src]="imageUrls()[g.id]!" alt=""
                     [attr.aria-label]="g.isAdmin ? 'Admin del grupo' : 'Miembro'">
              } @else {
                <span class="group-card__icon" [class.group-card__icon--admin]="g.isAdmin"
                      [attr.aria-label]="g.isAdmin ? 'Admin del grupo' : 'Miembro'">
                  {{ icon(g) }}
                </span>
              }
              <div class="group-card__body">
                <div class="group-card__name-row">
                  <span class="group-card__name">{{ g.name }}</span>
                  <span class="pill"
                        [class.pill--green]="g.mode === 'COMPLETE'"
                        [class.pill--warn]="g.mode !== 'COMPLETE'">
                    {{ g.mode === 'COMPLETE' ? 'Completo' : 'Simple' }}
                  </span>
                </div>
                <div class="group-card__meta">
                  {{ g.members }} {{ g.members === 1 ? 'miembro' : 'miembros' }}
                  @if (g.isAdmin) { · Eres <strong>admin</strong> }
                  @else if (g.adminHandle) { · creado por <strong>{{ '@' + g.adminHandle }}</strong> }
                  @if (g.createdAt) { · creado el {{ formatDate(g.createdAt) }} }
                </div>
              </div>
              <div class="group-card__pos">
                <div class="num">#{{ g.myRank ?? '?' }}</div>
                <div class="lbl">de {{ g.members }}</div>
              </div>
            </a>
          }
        </div>
      }
    </section>
  `,
  styles: [`
    :host { display: block; }

    /* Acciones para mobile (en desktop quedan ocultas: el sidebar
       ya tiene los mismos botones en "Mis grupos"). */
    .groups-list-actions {
      display: flex;
      flex-direction: column;
      gap: 8px;
      margin-bottom: 18px;
    }
    .groups-list-actions .btn-wf { width: 100%; justify-content: center; }
    @media (min-width: 992px) {
      .groups-list-actions { display: none; }
    }

    .groups-list {
      display: flex;
      flex-direction: column;
      gap: 10px;
    }
    .group-card {
      display: flex;
      align-items: center;
      gap: 14px;
      padding: 14px 16px;
      background: var(--wf-paper);
      border: 1px solid var(--wf-line);
      border-radius: 10px;
      text-decoration: none;
      color: inherit;
      transition: border-color .15s, box-shadow .15s;
    }
    .group-card:hover {
      border-color: var(--wf-green);
      box-shadow: 0 4px 14px rgba(0, 200, 100, .08);
    }
    .group-card__icon {
      width: 40px; height: 40px;
      border-radius: 8px;
      background: var(--wf-fill);
      display: flex; align-items: center; justify-content: center;
      font-family: var(--wf-display);
      font-size: 18px;
      flex-shrink: 0;
    }
    .group-card__icon--admin {
      background: var(--wf-green-soft);
      color: var(--wf-green-ink);
    }
    .group-card__icon--image {
      object-fit: cover;
      background: transparent;
      padding: 0;
    }
    .group-card__body { flex: 1; min-width: 0; }
    .group-card__name-row {
      display: flex;
      align-items: center;
      gap: 8px;
      flex-wrap: wrap;
    }
    .group-card__name {
      font-family: var(--wf-display);
      font-size: 18px;
      letter-spacing: .03em;
    }
    .group-card__meta {
      font-size: 12px;
      color: var(--wf-ink-3);
      margin-top: 4px;
      line-height: 1.5;
    }
    .group-card__pos {
      text-align: center;
      flex-shrink: 0;
      min-width: 60px;
    }
    .group-card__pos .num {
      font-family: var(--wf-display);
      font-size: 22px;
      line-height: 1;
    }
    .group-card__pos .lbl {
      font-size: 10px;
      color: var(--wf-ink-3);
      text-transform: uppercase;
      letter-spacing: .06em;
      margin-top: 2px;
    }
  `],
})
export class GroupsListComponent implements OnInit {
  private api = inject(ApiService);
  private auth = inject(AuthService);
  actions = inject(GroupActionsService);

  groups = signal<GroupRow[]>([]);
  /** Map de groupId → signed URL del logo. Se popula async post-load
   *  para no bloquear el render de la lista. */
  imageUrls = signal<Record<string, string>>({});
  loading = signal(true);

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
            imageKey: (grp.data as { imageKey?: string | null }).imageKey ?? null,
          };
        }),
      );
      const sorted = enriched
        .filter((x): x is GroupRow => x !== null)
        .sort((a, b) => a.name.localeCompare(b.name));
      this.groups.set(sorted);
      // Resolver signed URLs en background. Cada uno es independiente,
      // así si una falla las otras siguen.
      void this.resolveImageUrls(sorted);
    } finally {
      this.loading.set(false);
    }
  }

  private async resolveImageUrls(rows: readonly GroupRow[]) {
    for (const r of rows) {
      if (!r.imageKey) continue;
      try {
        const out = await getUrl({ path: r.imageKey, options: { expiresIn: 3600 } });
        this.imageUrls.update((m) => ({ ...m, [r.id]: out.url.toString() }));
      } catch {
        /* skip — fallback a inicial */
      }
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

}
