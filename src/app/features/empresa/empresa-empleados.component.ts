import { Component, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { ApiService } from '../../core/api/api.service';

interface Row { userId: string; handle: string; points: number; department: string }

@Component({
  standalone: true,
  selector: 'app-empresa-empleados',
  template: `
    <header class="emp-head">
      <div>
        <div class="kicker">RRHH</div>
        <h2 class="emp-head__title">Empleados</h2>
      </div>
    </header>

    @if (loading()) {
      <p class="text-mute">Cargando…</p>
    } @else if (rows().length === 0) {
      <div class="emp-empty">
        <strong>Aún no hay empleados</strong>
        <p class="text-mute">Cuando se unan a un departamento aparecerán aquí.</p>
      </div>
    } @else {
      <div class="me-card">
        <table class="me-table">
          <thead>
            <tr><th>#</th><th>Empleado</th><th>Departamento</th><th class="me-table__num">Pts</th></tr>
          </thead>
          <tbody>
            @for (r of rows(); track r.userId; let i = $index) {
              <tr>
                <td><span class="me-rank" [class.me-rank--top]="i < 3">{{ i + 1 }}</span></td>
                <td>{{ r.handle }}</td>
                <td class="text-mute">{{ r.department }}</td>
                <td class="me-table__num"><strong>{{ r.points }}</strong></td>
              </tr>
            }
          </tbody>
        </table>
      </div>
    }
  `,
  styles: [`
    :host { display: block; }
    .emp-head { margin-bottom: 16px; }
    .emp-head__title { font-family: var(--wf-display); font-size: 24px; letter-spacing: .03em; margin: 2px 0 0; }
    .emp-empty { background: var(--color-primary-white); border: 1px dashed var(--wf-line); border-radius: 12px; padding: 24px; text-align: center; }
    .emp-empty > strong { display: block; margin-bottom: 6px; font-size: 15px; }
    .emp-empty > p { margin: 0; }
    .me-card {
      background: var(--color-primary-white);
      border: 1px solid var(--wf-line); border-radius: 12px;
      padding: 18px;
    }
    .me-table { width: 100%; border-collapse: collapse; font-size: 14px; }
    .me-table th {
      text-align: left; font-size: 11px; font-weight: 600;
      text-transform: uppercase; letter-spacing: .06em; color: var(--wf-ink-3);
      padding: 0 10px 8px; border-bottom: 1px solid var(--wf-line-2);
    }
    .me-table td { padding: 10px; border-bottom: 1px solid var(--wf-line-2); }
    .me-table tbody tr:last-child td { border-bottom: 0; }
    .me-table__num { text-align: right; }
    .me-rank {
      display: inline-flex; align-items: center; justify-content: center;
      width: 24px; height: 24px; border-radius: 999px;
      background: var(--wf-fill); color: var(--wf-ink-2); font-size: 12px; font-weight: 700;
    }
    .me-rank--top { background: var(--wf-green); color: #fff; }
  `],
})
export class EmpresaEmpleadosComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private api = inject(ApiService);

  rows = signal<Row[]>([]);
  loading = signal(true);

  async ngOnInit() {
    const id = this.route.parent?.snapshot.paramMap.get('id') ?? '';
    if (!id) { this.loading.set(false); return; }
    try {
      const res = await this.api.companyRanking(id);
      this.rows.set(res.data?.individual ?? []);
    } finally {
      this.loading.set(false);
    }
  }
}
