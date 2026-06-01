import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { ApiService } from '../../core/api/api.service';
import { ToastService } from '../../core/notifications/toast.service';
import { humanizeError } from '../../core/notifications/domain-errors';

@Component({
  standalone: true,
  selector: 'app-aceptar-admin',
  imports: [FormsModule],
  template: `
    <section class="page">
      <h1 class="page__title">Aceptar invitación de empresa</h1>
      <p class="kicker">Recibiste una invitación para administrar una empresa. Ingresa tu código.</p>
      <label>Código de invitación <input [(ngModel)]="code" placeholder="ABC123" /></label>
      <button type="button" [disabled]="saving()" (click)="accept()">{{ saving() ? 'Aceptando…' : 'Aceptar' }}</button>
    </section>
  `,
})
export class AceptarAdminComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private api = inject(ApiService);
  private toast = inject(ToastService);
  code = '';
  saving = signal(false);
  ngOnInit() { const c = this.route.snapshot.queryParamMap.get('code'); if (c) this.code = c; }
  async accept() {
    const code = this.code.trim();
    if (!code) { this.toast.error('Ingresa el código'); return; }
    this.saving.set(true);
    try {
      const res = await this.api.acceptCompanyAdminInvite(code);
      const cid = res.data?.companyId;
      this.toast.success('¡Listo! Ya eres admin de la empresa');
      if (cid) void this.router.navigate(['/empresa', cid]); else void this.router.navigate(['/empresa']);
    } catch (e) { this.toast.error(humanizeError(e)); }
    finally { this.saving.set(false); }
  }
}
