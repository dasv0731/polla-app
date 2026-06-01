import { Component, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { ApiService } from '../../core/api/api.service';

interface CompanyView { id: string; name: string; status: string }
interface Row { userId: string; handle: string; points: number; department: string }
interface Dept { groupId: string; name: string; points: number; members: number }

@Component({
  standalone: true,
  selector: 'app-empresa-dashboard',
  template: `
    <header class="emp-head">
      <div>
        <div class="kicker">DASHBOARD</div>
        <h2 class="emp-head__title">{{ company()?.name ?? 'Cargando…' }}</h2>
      </div>
      @if (company(); as c) {
        <span class="pill"
              [class.pill--green]="c.status === 'ACTIVE'"
              [class.pill--warn]="c.status !== 'ACTIVE'">
          {{ c.status === 'ACTIVE' ? 'Activa' : 'Desactivada' }}
        </span>
      }
    </header>

    @if (loading()) {
      <p class="text-mute">Cargando…</p>
    } @else {
      <div class="emp-stats">
        <div class="emp-stat">
          <div class="emp-stat__num">{{ departmentCount() }}</div>
          <div class="emp-stat__lbl">Departamentos</div>
        </div>
        <div class="emp-stat">
          <div class="emp-stat__num">{{ individual().length }}</div>
          <div class="emp-stat__lbl">Empleados</div>
        </div>
      </div>

      <div class="me-card">
        <h2 class="me-card__title">🏆 Ranking individual</h2>
        @if (individual().length === 0) {
          <p class="text-mute">Aún no hay empleados.</p>
        } @else {
          <table class="me-table">
            <thead>
              <tr><th>#</th><th>Empleado</th><th>Departamento</th><th class="me-table__num">Pts</th></tr>
            </thead>
            <tbody>
              @for (r of individual(); track r.userId; let i = $index) {
                <tr>
                  <td><span class="me-rank" [class.me-rank--top]="i < 3">{{ i + 1 }}</span></td>
                  <td>{{ r.handle }}</td>
                  <td class="text-mute">{{ r.department }}</td>
                  <td class="me-table__num"><strong>{{ r.points }}</strong></td>
                </tr>
              }
            </tbody>
          </table>
        }
      </div>

      <div class="me-card">
        <h2 class="me-card__title">🏟️ Por departamento</h2>
        @if (departments().length === 0) {
          <p class="text-mute">Aún no hay departamentos.</p>
        } @else {
          <table class="me-table">
            <thead>
              <tr><th>#</th><th>Departamento</th><th class="me-table__num">Pts</th><th class="me-table__num">Miembros</th></tr>
            </thead>
            <tbody>
              @for (d of departments(); track d.groupId; let i = $index) {
                <tr>
                  <td><span class="me-rank" [class.me-rank--top]="i < 3">{{ i + 1 }}</span></td>
                  <td>{{ d.name }}</td>
                  <td class="me-table__num"><strong>{{ d.points }}</strong></td>
                  <td class="me-table__num text-mute">{{ d.members }}</td>
                </tr>
              }
            </tbody>
          </table>
        }
      </div>
    }
  `,
  styles: [`
    :host { display: block; }
    .emp-head { display: flex; align-items: flex-end; justify-content: space-between; gap: 12px; flex-wrap: wrap; margin-bottom: 16px; }
    .emp-head__title { font-family: var(--wf-display); font-size: 24px; letter-spacing: .03em; margin: 2px 0 0; }
    .emp-stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 14px; margin-bottom: 16px; }
    .emp-stat {
      background: var(--color-primary-white); border: 1px solid var(--wf-line);
      border-radius: 12px; padding: 18px;
    }
    .emp-stat__num { font-family: var(--wf-display); font-size: 32px; line-height: 1; }
    .emp-stat__lbl { font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: .06em; color: var(--wf-ink-3); margin-top: 6px; }
    .me-card {
      background: var(--color-primary-white);
      border: 1px solid var(--wf-line); border-radius: 12px;
      padding: 18px; margin-bottom: 16px;
    }
    .me-card__title { font-size: 16px; margin: 0 0 12px; }
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
export class EmpresaDashboardComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private api = inject(ApiService);

  company = signal<CompanyView | null>(null);
  individual = signal<Row[]>([]);
  departments = signal<Dept[]>([]);
  departmentCount = signal(0);
  loading = signal(true);

  async ngOnInit() {
    const id = this.route.parent?.snapshot.paramMap.get('id') ?? '';
    if (!id) { this.loading.set(false); return; }
    try {
      const c = (await this.api.getCompany(id)).data as CompanyView | null;
      if (c) this.company.set(c);

      const groups = (await this.api.listCompanyGroups(id)).data ?? [];
      this.departmentCount.set(groups.length);

      const res = await this.api.companyRanking(id);
      this.individual.set(res.data?.individual ?? []);
      this.departments.set(res.data?.departments ?? []);
    } finally {
      this.loading.set(false);
    }
  }
}
