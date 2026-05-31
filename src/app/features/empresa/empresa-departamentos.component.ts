import { Component, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { ApiService } from '../../core/api/api.service';

interface DeptRow { id: string; name: string; mode: string | null; category: string | null }

@Component({
  standalone: true,
  selector: 'app-empresa-departamentos',
  template: `
    <h2 class="page__title">Departamentos</h2>
    @if (loading()) { <p>Cargando…</p> }
    @else if (rows().length === 0) { <p>Aún no hay departamentos. Invita jefes para que los creen.</p> }
    @else {
      <table>
        <tr><th>Nombre</th><th>Modo</th><th>Categoría</th></tr>
        @for (d of rows(); track d.id) {
          <tr><td>{{ d.name }}</td><td>{{ d.mode }}</td><td>{{ d.category ?? '—' }}</td></tr>
        }
      </table>
    }
  `,
})
export class EmpresaDepartamentosComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private api = inject(ApiService);
  rows = signal<DeptRow[]>([]);
  loading = signal(true);

  async ngOnInit() {
    const id = this.route.parent?.snapshot.paramMap.get('id') ?? '';
    const res = await this.api.listCompanyGroups(id);
    this.rows.set(((res.data ?? []) as DeptRow[]).map((g) => ({ id: g.id, name: g.name, mode: g.mode, category: g.category })));
    this.loading.set(false);
  }
}
