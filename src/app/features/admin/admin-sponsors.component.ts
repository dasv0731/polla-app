import { Component, OnInit, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ApiService } from '../../core/api/api.service';
import { ToastService } from '../../core/notifications/toast.service';
import { humanizeError } from '../../core/notifications/domain-errors';

interface SponsorRow {
  id: string;
  name: string;
  bannerKeys: string[];
  codesCount: number;
}

@Component({
  standalone: true,
  selector: 'app-admin-sponsors',
  imports: [RouterLink],
  template: `
    <header class="admin-main__head" style="display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: var(--space-md);">
      <div>
        <small>Admin · marcas y códigos de canje</small>
        <h1>Sponsors</h1>
      </div>
      <a class="btn btn--primary" routerLink="/admin/sponsors/new">+ Nuevo sponsor</a>
    </header>

    @if (loading()) {
      <p>Cargando…</p>
    } @else if (sponsors().length === 0) {
      <p class="empty-state">
        No hay sponsors cargados.
        <a class="link-green" routerLink="/admin/sponsors/new">Crear el primero →</a>
      </p>
    } @else {
      <div class="card-grid">
        @for (s of sponsors(); track s.id) {
          <article class="sponsor-card">
            <header style="display: flex; justify-content: space-between; align-items: baseline; margin-bottom: var(--space-sm);">
              <h2>{{ s.name }}</h2>
              <small>{{ s.codesCount }} {{ s.codesCount === 1 ? 'código' : 'códigos' }}</small>
            </header>
            <p class="form-card__hint">
              {{ s.bannerKeys.length }} {{ s.bannerKeys.length === 1 ? 'banner' : 'banners' }} cargados
            </p>
            <div style="display: flex; gap: var(--space-sm); margin-top: var(--space-md);">
              <a class="btn btn--ghost btn--sm" [routerLink]="['/admin/sponsors', s.id, 'edit']">Editar</a>
              <a class="link-green" style="color: var(--color-lost); cursor: pointer; align-self: center;"
                 (click)="del(s, $event)">Borrar</a>
            </div>
          </article>
        }
      </div>
    }
  `,
  styles: [`
    .card-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
      gap: var(--space-md);
    }
    .sponsor-card {
      background: var(--color-primary-white);
      border: var(--border-grey);
      border-radius: var(--radius-md);
      padding: var(--space-md);
    }
    .sponsor-card h2 {
      font-family: var(--font-display);
      font-size: var(--fs-xl);
      text-transform: uppercase;
      line-height: 1;
    }
    .sponsor-card small {
      font-size: var(--fs-xs);
      color: var(--color-text-muted);
      text-transform: uppercase;
      letter-spacing: 0.06em;
    }
  `],
})
export class AdminSponsorsComponent implements OnInit {
  private api = inject(ApiService);
  private toast = inject(ToastService);

  loading = signal(true);
  sponsors = signal<SponsorRow[]>([]);

  async ngOnInit() { await this.load(); }

  async load() {
    this.loading.set(true);
    try {
      const res = await this.api.listSponsors();
      const raw = ((res.data ?? []) as Array<{ id: string; name: string; bannerKeys?: (string | null)[] | null }>);
      const rows: SponsorRow[] = await Promise.all(
        raw.map(async (s) => {
          let codesCount = 0;
          try {
            const c = await this.api.listSponsorCodes(s.id);
            codesCount = (c.data ?? []).length;
          } catch { /* skip */ }
          return {
            id: s.id,
            name: s.name,
            bannerKeys: ((s.bannerKeys ?? []) as (string | null)[]).filter((k): k is string => !!k),
            codesCount,
          };
        }),
      );
      rows.sort((a, b) => a.name.localeCompare(b.name));
      this.sponsors.set(rows);
    } finally {
      this.loading.set(false);
    }
  }

  async del(s: SponsorRow, ev: Event) {
    ev.preventDefault();
    if (!confirm(`¿Borrar "${s.name}"? Sus ${s.codesCount} códigos quedarán huérfanos (no se borran auto).`)) return;
    try {
      await this.api.deleteSponsor(s.id);
      this.toast.success('Sponsor borrado');
      void this.load();
    } catch (e) {
      this.toast.error(humanizeError(e));
    }
  }
}
