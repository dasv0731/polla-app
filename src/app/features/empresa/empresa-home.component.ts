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
      <header class="page__header">
        <div>
          <div class="kicker">PORTAL DE EMPRESA</div>
          <h1 class="page__title">Mis empresas</h1>
        </div>
      </header>

      @if (loading()) {
        <p class="text-mute">Cargando…</p>
      } @else if (rows().length === 0) {
        <div class="emp-empty">
          <strong>No administras ninguna empresa</strong>
          <p class="text-mute">Cuando te asignen como administrador de una empresa, aparecerá aquí.</p>
        </div>
      } @else {
        <ul class="emp-list" role="list">
          @for (r of rows(); track r.companyId) {
            <li>
              <a class="emp-card" [routerLink]="['/empresa', r.companyId]">
                <span class="emp-card__avatar" aria-hidden="true">{{ initial(r.name) }}</span>
                <span class="emp-card__body">
                  <strong class="emp-card__name">{{ r.name }}</strong>
                  <span class="text-mute emp-card__sub">Administrar empresa</span>
                </span>
                <span class="emp-card__chev" aria-hidden="true">→</span>
              </a>
            </li>
          }
        </ul>
      }
    </section>
  `,
  styles: [`
    :host { display: block; }
    .emp-list { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 10px; }
    .emp-card {
      display: flex; align-items: center; gap: 14px;
      padding: 14px 16px;
      background: var(--color-primary-white);
      border: 1px solid var(--wf-line);
      border-radius: 12px;
      text-decoration: none;
      color: inherit;
      transition: border-color 0.15s ease, box-shadow 0.15s ease, transform 0.1s ease;
    }
    .emp-card:hover { border-color: var(--wf-green); box-shadow: 0 2px 10px rgba(0,0,0,.06); transform: translateY(-1px); }
    .emp-card__avatar {
      width: 44px; height: 44px; flex-shrink: 0;
      display: inline-flex; align-items: center; justify-content: center;
      border-radius: 12px;
      background: var(--wf-green-soft); color: var(--wf-green-ink);
      font-weight: 700; font-size: 18px; text-transform: uppercase;
    }
    .emp-card__body { display: flex; flex-direction: column; gap: 2px; min-width: 0; flex: 1; }
    .emp-card__name { font-size: 15px; }
    .emp-card__sub { font-size: 12px; }
    .emp-card__chev { color: var(--wf-ink-3); font-size: 18px; }
    .emp-empty {
      background: var(--color-primary-white);
      border: 1px dashed var(--wf-line); border-radius: 12px;
      padding: 28px; text-align: center;
    }
    .emp-empty > strong { display: block; margin-bottom: 6px; font-size: 15px; }
    .emp-empty > p { margin: 0; }
  `],
})
export class EmpresaHomeComponent implements OnInit {
  private api = inject(ApiService);
  private auth = inject(AuthService);
  private router = inject(Router);
  rows = signal<Row[]>([]);
  loading = signal(true);

  initial(name: string): string {
    return (name.trim()[0] ?? '?').toUpperCase();
  }

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
