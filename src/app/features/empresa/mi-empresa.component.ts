import { Component, OnInit, inject, signal } from '@angular/core';
import { ApiService } from '../../core/api/api.service';
import { AuthService } from '../../core/auth/auth.service';

interface Row { userId: string; handle: string; points: number; department: string }
interface Dept { groupId: string; name: string; points: number; members: number }

@Component({
  standalone: true,
  selector: 'app-mi-empresa',
  template: `
    <section class="page" [style.--pa-brand]="brand()">
      <h1 class="page__title">Mi empresa</h1>
      @if (loading()) { <p>Cargando…</p> }
      @else if (!companyId()) { <p>No perteneces a ninguna empresa todavía.</p> }
      @else {
        <h2>🏆 Ranking de la empresa</h2>
        <table>
          <tr><th>#</th><th>Empleado</th><th>Departamento</th><th>Pts</th></tr>
          @for (r of individual(); track r.userId; let i = $index) {
            <tr><td>{{ i + 1 }}</td><td>{{ r.handle }}</td><td>{{ r.department }}</td><td>{{ r.points }}</td></tr>
          }
        </table>
        <h2>🏟️ Por departamento</h2>
        <table>
          <tr><th>#</th><th>Departamento</th><th>Pts</th><th>Miembros</th></tr>
          @for (d of departments(); track d.groupId; let i = $index) {
            <tr><td>{{ i + 1 }}</td><td>{{ d.name }}</td><td>{{ d.points }}</td><td>{{ d.members }}</td></tr>
          }
        </table>
      }
    </section>
  `,
})
export class MiEmpresaComponent implements OnInit {
  private api = inject(ApiService);
  private auth = inject(AuthService);

  companyId = signal<string | null>(null);
  individual = signal<Row[]>([]);
  departments = signal<Dept[]>([]);
  brand = signal<string>('#e23744');
  loading = signal(true);

  async ngOnInit() {
    const u = this.auth.user();
    if (!u) { this.loading.set(false); return; }
    const cid = await this.api.findMyCompanyId(u.sub);
    this.companyId.set(cid);
    if (cid) {
      const c = (await this.api.getCompany(cid)).data as { brandPrimary?: string | null } | null;
      if (c?.brandPrimary) this.brand.set(c.brandPrimary);
      const res = await this.api.companyRanking(cid);
      this.individual.set(res.data?.individual ?? []);
      this.departments.set(res.data?.departments ?? []);
    }
    this.loading.set(false);
  }
}
