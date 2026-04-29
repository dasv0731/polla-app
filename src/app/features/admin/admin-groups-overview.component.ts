import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ApiService } from '../../core/api/api.service';

const TOURNAMENT_ID = 'mundial-2026';

interface GroupRow {
  id: string;
  name: string;
  mode: 'SIMPLE' | 'COMPLETE';
  joinCode: string;
  adminUserId: string;
  createdAt: string;
  memberCount: number;
}

@Component({
  standalone: true,
  selector: 'app-admin-groups-overview',
  imports: [RouterLink],
  template: `
    <header class="admin-main__head">
      <div>
        <small>Admin · vista general</small>
        <h1>Grupos</h1>
      </div>
    </header>

    @if (loading()) {
      <p>Cargando…</p>
    } @else {
      <!-- KPIs generales -->
      <section class="kpi-row">
        <article class="kpi-card">
          <small>Total grupos</small>
          <div class="kpi-card__value">{{ groups().length }}</div>
        </article>
        <article class="kpi-card">
          <small>Modo simple</small>
          <div class="kpi-card__value">{{ simpleGroups().length }}</div>
        </article>
        <article class="kpi-card">
          <small>Modo completo</small>
          <div class="kpi-card__value">{{ completeGroups().length }}</div>
        </article>
        <article class="kpi-card">
          <small>Total miembros</small>
          <div class="kpi-card__value">{{ totalMembers() }}</div>
        </article>
        <article class="kpi-card">
          <small>Promedio por grupo</small>
          <div class="kpi-card__value">{{ avgMembers() }}</div>
        </article>
      </section>

      <!-- Grupos simples -->
      <section style="margin-top: var(--space-2xl);">
        <header style="display: flex; justify-content: space-between; align-items: baseline; margin-bottom: var(--space-md);">
          <h2 style="font-family: var(--font-display); font-size: var(--fs-xl); text-transform: uppercase; line-height: 1;">
            Grupos modo simple
          </h2>
          <small style="color: var(--color-text-muted);">{{ simpleGroups().length }} grupos</small>
        </header>
        @if (simpleGroups().length === 0) {
          <p class="empty-state">Aún no hay grupos en modo simple.</p>
        } @else {
          <div class="card-grid">
            @for (g of simpleGroups(); track g.id) {
              <a class="group-card" [routerLink]="['/groups', g.id]">
                <header class="group-card__header">
                  <span class="group-card__pill group-card__pill--simple">Simple</span>
                  <span class="group-card__meta">{{ g.memberCount }} miembros</span>
                </header>
                <h3>{{ g.name }}</h3>
                <p class="group-card__sub">
                  Código: <code>{{ g.joinCode }}</code><br>
                  Creado {{ formatDate(g.createdAt) }}
                </p>
              </a>
            }
          </div>
        }
      </section>

      <!-- Grupos completos -->
      <section style="margin-top: var(--space-2xl);">
        <header style="display: flex; justify-content: space-between; align-items: baseline; margin-bottom: var(--space-md);">
          <h2 style="font-family: var(--font-display); font-size: var(--fs-xl); text-transform: uppercase; line-height: 1;">
            Grupos modo completo
          </h2>
          <small style="color: var(--color-text-muted);">{{ completeGroups().length }} grupos · cuentan al ranking global</small>
        </header>
        @if (completeGroups().length === 0) {
          <p class="empty-state">Aún no hay grupos en modo completo.</p>
        } @else {
          <div class="card-grid">
            @for (g of completeGroups(); track g.id) {
              <a class="group-card group-card--complete" [routerLink]="['/groups', g.id]">
                <header class="group-card__header">
                  <span class="group-card__pill group-card__pill--complete">Completo</span>
                  <span class="group-card__meta">{{ g.memberCount }} miembros</span>
                </header>
                <h3>{{ g.name }}</h3>
                <p class="group-card__sub">
                  Código: <code>{{ g.joinCode }}</code><br>
                  Creado {{ formatDate(g.createdAt) }}
                </p>
              </a>
            }
          </div>
        }
      </section>

      <!-- Top grupos por miembros -->
      @if (topGroups().length > 0) {
        <section style="margin-top: var(--space-2xl);">
          <header style="margin-bottom: var(--space-md);">
            <h2 style="font-family: var(--font-display); font-size: var(--fs-xl); text-transform: uppercase; line-height: 1;">
              Top 5 más activos
            </h2>
            <small style="color: var(--color-text-muted);">Por cantidad de miembros</small>
          </header>
          <div class="card-grid">
            @for (g of topGroups(); track g.id; let i = $index) {
              <a class="group-card" [routerLink]="['/groups', g.id]">
                <header class="group-card__header">
                  <span class="group-card__rank">#{{ i + 1 }}</span>
                  <span class="group-card__pill"
                        [class.group-card__pill--simple]="g.mode === 'SIMPLE'"
                        [class.group-card__pill--complete]="g.mode === 'COMPLETE'">
                    {{ g.mode === 'COMPLETE' ? 'Completo' : 'Simple' }}
                  </span>
                </header>
                <h3>{{ g.name }}</h3>
                <p class="group-card__sub">
                  <strong>{{ g.memberCount }}</strong> miembros
                </p>
              </a>
            }
          </div>
        </section>
      }
    }
  `,
  styles: [`
    .kpi-row {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
      gap: var(--space-md);
    }
    .kpi-card {
      background: var(--color-primary-white);
      border: var(--border-grey);
      border-radius: var(--radius-md);
      padding: var(--space-md);
    }
    .kpi-card small {
      display: block;
      font-size: var(--fs-xs);
      color: var(--color-text-muted);
      text-transform: uppercase;
      letter-spacing: 0.06em;
      margin-bottom: 4px;
    }
    .kpi-card__value {
      font-family: var(--font-display);
      font-size: var(--fs-3xl);
      line-height: 1;
    }
    .card-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
      gap: var(--space-md);
    }
    .group-card {
      background: var(--color-primary-white);
      border: var(--border-grey);
      border-radius: var(--radius-md);
      padding: var(--space-md);
      text-decoration: none;
      color: inherit;
      transition: border-color 100ms, transform 100ms;
      display: block;
    }
    .group-card:hover {
      border-color: var(--color-primary-green);
      transform: translateY(-2px);
    }
    .group-card--complete {
      border-left: 4px solid var(--color-primary-green);
    }
    .group-card__header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: var(--space-sm);
    }
    .group-card__pill {
      font-size: 9px;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      padding: 3px 8px;
      border-radius: 999px;
      font-weight: var(--fw-bold);
    }
    .group-card__pill--simple {
      background: rgba(255, 200, 0, 0.5);
      color: var(--color-primary-black);
    }
    .group-card__pill--complete {
      background: var(--color-primary-green);
      color: var(--color-primary-white);
    }
    .group-card__meta, .group-card__rank {
      font-size: var(--fs-xs);
      color: var(--color-text-muted);
      text-transform: uppercase;
      letter-spacing: 0.06em;
    }
    .group-card__rank {
      font-family: var(--font-display);
      font-size: var(--fs-md);
      color: var(--color-primary-green);
    }
    .group-card h3 {
      font-family: var(--font-display);
      font-size: var(--fs-xl);
      text-transform: uppercase;
      line-height: 1;
      margin-bottom: var(--space-xs);
    }
    .group-card__sub {
      color: var(--color-text-muted);
      font-size: var(--fs-sm);
      line-height: 1.4;
    }
  `],
})
export class AdminGroupsOverviewComponent implements OnInit {
  private api = inject(ApiService);

  loading = signal(true);
  groups = signal<GroupRow[]>([]);

  simpleGroups = computed(() => this.groups().filter((g) => g.mode === 'SIMPLE'));
  completeGroups = computed(() => this.groups().filter((g) => g.mode === 'COMPLETE'));
  totalMembers = computed(() =>
    this.groups().reduce((s, g) => s + g.memberCount, 0),
  );
  avgMembers = computed(() => {
    const t = this.groups().length;
    return t === 0 ? 0 : Math.round(this.totalMembers() / t);
  });
  topGroups = computed(() =>
    [...this.groups()].sort((a, b) => b.memberCount - a.memberCount).slice(0, 5),
  );

  async ngOnInit() {
    this.loading.set(true);
    try {
      const groupsRes = await this.api.listGroups(TOURNAMENT_ID);
      const rawGroups = (groupsRes.data ?? []) as Array<{
        id: string; name: string; mode?: string;
        joinCode: string; adminUserId: string; createdAt: string;
      }>;

      // Member count per group: una sola query a Membership por grupo
      // (en paralelo). Para 12-50 grupos es manejable.
      const rows: GroupRow[] = await Promise.all(
        rawGroups.map(async (g) => {
          let count = 0;
          try {
            const m = await this.api.groupMembers(g.id);
            count = (m.data ?? []).length;
          } catch { /* skip */ }
          return {
            id: g.id,
            name: g.name,
            mode: (g.mode ?? 'COMPLETE') as 'SIMPLE' | 'COMPLETE',
            joinCode: g.joinCode,
            adminUserId: g.adminUserId,
            createdAt: g.createdAt,
            memberCount: count,
          };
        }),
      );
      rows.sort((a, b) => a.name.localeCompare(b.name));
      this.groups.set(rows);
    } finally {
      this.loading.set(false);
    }
  }

  formatDate(iso: string): string {
    try {
      return new Date(iso).toLocaleDateString('es-EC', {
        day: '2-digit', month: 'short', year: 'numeric',
      });
    } catch { return iso; }
  }
}
