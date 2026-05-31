import { Component, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { ApiService } from '../../core/api/api.service';

interface CompanyView { id: string; name: string; status: string; contactEmail: string | null; description: string | null }

@Component({
  standalone: true,
  selector: 'app-empresa-resumen',
  template: `
    @if (company(); as c) {
      <div class="emp-card">
        <div class="emp-card__head">
          <div>
            <div class="kicker">RESUMEN</div>
            <h2 class="emp-card__title">{{ c.name }}</h2>
          </div>
          <span class="pill"
                [class.pill--green]="c.status === 'ACTIVE'"
                [class.pill--warn]="c.status !== 'ACTIVE'">
            {{ c.status === 'ACTIVE' ? 'Activa' : 'Desactivada' }}
          </span>
        </div>

        <dl class="emp-card__meta">
          <div class="emp-card__row">
            <dt>Contacto</dt>
            <dd>{{ c.contactEmail || '—' }}</dd>
          </div>
          <div class="emp-card__row">
            <dt>Descripción</dt>
            <dd>{{ c.description || 'Sin descripción' }}</dd>
          </div>
        </dl>
      </div>
    } @else {
      <p class="text-mute">Cargando…</p>
    }
  `,
  styles: [`
    :host { display: block; }
    .emp-card {
      background: var(--color-primary-white);
      border: 1px solid var(--wf-line);
      border-radius: 12px;
      padding: 20px;
      max-width: 560px;
    }
    .emp-card__head { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
    .emp-card__title { font-family: var(--wf-display); font-size: 24px; letter-spacing: .03em; margin: 2px 0 0; }
    .emp-card__meta { margin: 18px 0 0; display: flex; flex-direction: column; gap: 12px; }
    .emp-card__row { display: flex; flex-direction: column; gap: 2px; }
    .emp-card__row dt { font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: .06em; color: var(--wf-ink-3); }
    .emp-card__row dd { margin: 0; font-size: 14px; color: var(--wf-ink); }
  `],
})
export class EmpresaResumenComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private api = inject(ApiService);
  company = signal<CompanyView | null>(null);

  async ngOnInit() {
    const id = this.route.parent?.snapshot.paramMap.get('id') ?? '';
    if (!id) return;
    const res = await this.api.getCompany(id);
    const d = res.data as CompanyView | null;
    if (d) this.company.set(d);
  }
}
