import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { ApiService } from '../../../core/api/api.service';
import { IconComponent } from '../../../shared/ui/icon/icon.component';
import { EmptyBlockComponent } from '../../../shared/ui/empty-block/empty-block.component';
import { SkeletonComponent } from '../../../shared/ui/skeleton/skeleton.component';
import { CreateCompanyModalComponent } from './create-company-modal.component';

interface CompanyRow {
  id: string;
  name: string;
  status: 'ACTIVE' | 'DISABLED';
  createdAt: string;
}

/**
 * /admin/companies — super-admin list of all Companies with search +
 * create-company modal trigger. Empty state when no companies exist.
 */
@Component({
  standalone: true,
  selector: 'app-companies-list',
  imports: [
    FormsModule, RouterLink, IconComponent,
    EmptyBlockComponent, SkeletonComponent, CreateCompanyModalComponent,
  ],
  template: `
    <section class="page">
      <header class="page__header">
        <div>
          <div class="kicker">SUPER-ADMIN</div>
          <h1 class="page__title">Empresas</h1>
          <p class="text-mute">
            @if (loading()) { Cargando… }
            @else { {{ filtered().length }} de {{ companies().length }} resultados }
          </p>
        </div>
        <button type="button" class="btn-wf btn-wf--primary"
                (click)="showCreate.set(true)">
          <app-icon name="plus" size="sm" /> Crear empresa
        </button>
      </header>

      <input class="auth-input"
             placeholder="Buscar empresa…"
             [ngModel]="search()"
             (ngModelChange)="search.set($event)"
             style="max-width: 360px; margin-bottom: 14px;">

      @if (loading()) {
        <app-skeleton variant="list" [count]="3" />
      } @else if (companies().length === 0) {
        <app-empty-block iconName="users"
                         title="No hay empresas todavía"
                         sub="Crea la primera empresa para arrancar.">
          <button type="button" class="empty-cta empty-cta--primary"
                  (click)="showCreate.set(true)">
            <app-icon name="plus" size="sm" /> Crear primera empresa
          </button>
        </app-empty-block>
      } @else {
        <ul class="cmp-list" role="list">
          @for (c of filtered(); track c.id) {
            <li class="cmp-list__row">
              <div class="cmp-list__info">
                <strong>{{ c.name }}</strong>
                <span class="pill"
                      [class.pill--green]="c.status === 'ACTIVE'"
                      [class.pill--grey]="c.status === 'DISABLED'">
                  {{ c.status === 'ACTIVE' ? 'Activa' : 'Desactivada' }}
                </span>
                <div class="text-mute cmp-list__meta">
                  Creada {{ formatDate(c.createdAt) }}
                </div>
              </div>
              <a class="btn-wf btn-wf--sm" [routerLink]="['/admin/companies', c.id]">
                Detalles
              </a>
            </li>
          }
        </ul>
      }

      @if (showCreate()) {
        <app-create-company-modal
          (close)="showCreate.set(false)"
          (created)="onCreated($event)" />
      }
    </section>
  `,
  styles: [`
    :host { display: block; }
    .cmp-list {
      list-style: none; padding: 0; margin: 0;
      display: flex; flex-direction: column; gap: 8px;
    }
    .cmp-list__row {
      display: flex; align-items: center; justify-content: space-between; gap: 14px;
      padding: 14px 16px;
      background: #fff;
      border: 1px solid var(--color-line);
      border-radius: var(--radius-md);
    }
    .cmp-list__info { display: flex; flex-direction: column; gap: 4px; flex: 1; min-width: 0; }
    .cmp-list__info > strong { font-size: 15px; }
    .cmp-list__meta { font-size: 12px; }
  `],
})
export class CompaniesListComponent implements OnInit {
  private api = inject(ApiService);
  private router = inject(Router);

  companies = signal<CompanyRow[]>([]);
  loading = signal(true);
  search = signal('');
  showCreate = signal(false);

  filtered = computed<CompanyRow[]>(() => {
    const q = this.search().trim().toLowerCase();
    if (!q) return this.companies();
    return this.companies().filter((c) => c.name.toLowerCase().includes(q));
  });

  async ngOnInit(): Promise<void> {
    try {
      const res = await this.api.listCompanies();
      const data = (res.data ?? []) as CompanyRow[];
      this.companies.set(data);
    } finally {
      this.loading.set(false);
    }
  }

  onCreated(id: string): void {
    this.showCreate.set(false);
    void this.router.navigate(['/admin/companies', id]);
  }

  formatDate(iso: string): string {
    try {
      return new Intl.DateTimeFormat('es-EC', {
        timeZone: 'America/Guayaquil',
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      }).format(new Date(iso));
    } catch {
      return iso;
    }
  }
}
