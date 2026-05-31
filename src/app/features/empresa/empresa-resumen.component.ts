import { Component, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { ApiService } from '../../core/api/api.service';

interface CompanyView { id: string; name: string; status: string; contactEmail: string | null; description: string | null }

@Component({
  standalone: true,
  selector: 'app-empresa-resumen',
  template: `
    @if (company(); as c) {
      <h2 class="page__title">{{ c.name }}</h2>
      <p class="kicker">Estado: {{ c.status }}</p>
      @if (c.contactEmail) { <p>Contacto: {{ c.contactEmail }}</p> }
      @if (c.description) { <p>{{ c.description }}</p> }
    } @else {
      <p>Cargando…</p>
    }
  `,
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
