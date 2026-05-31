import { Component, OnInit, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { ApiService } from '../../core/api/api.service';
import { AuthService } from '../../core/auth/auth.service';

interface Row { companyId: string; name: string }

@Component({
  standalone: true,
  selector: 'app-empresa-home',
  imports: [RouterLink],
  template: `
    <section class="page">
      <h1 class="page__title">Mis empresas</h1>
      @if (loading()) { <p>Cargando…</p> }
      @else if (rows().length === 0) { <p>No administras ninguna empresa.</p> }
      @else {
        <ul>
          @for (r of rows(); track r.companyId) {
            <li><a [routerLink]="['/empresa', r.companyId]">{{ r.name }}</a></li>
          }
        </ul>
      }
    </section>
  `,
})
export class EmpresaHomeComponent implements OnInit {
  private api = inject(ApiService);
  private auth = inject(AuthService);
  private router = inject(Router);
  rows = signal<Row[]>([]);
  loading = signal(true);

  async ngOnInit() {
    const u = this.auth.user();
    if (!u) { this.loading.set(false); return; }
    const ms = (await this.api.listMyCompanyAdminships(u.sub)).data ?? [];
    const rows: Row[] = [];
    for (const m of ms) {
      const cid = (m as { companyId: string }).companyId;
      const c = (await this.api.getCompany(cid)).data as { name?: string } | null;
      rows.push({ companyId: cid, name: c?.name ?? cid });
    }
    this.rows.set(rows);
    this.loading.set(false);
    if (rows.length === 1) void this.router.navigate(['/empresa', rows[0].companyId]);
  }
}
