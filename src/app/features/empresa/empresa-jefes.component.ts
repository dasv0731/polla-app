import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { ApiService } from '../../core/api/api.service';
import { ToastService } from '../../core/notifications/toast.service';
import { humanizeError } from '../../core/notifications/domain-errors';

interface InviteRow { id: string; invitedEmail: string; code: string; status: string }

@Component({
  standalone: true,
  selector: 'app-empresa-jefes',
  imports: [FormsModule],
  template: `
    <h2 class="page__title">Jefes de departamento</h2>
    <div class="invite-box">
      <input type="email" [(ngModel)]="email" placeholder="email@empresa.com" />
      <button type="button" [disabled]="sending()" (click)="invite()">
        {{ sending() ? 'Invitando…' : 'Invitar jefe' }}
      </button>
    </div>
    @if (loading()) { <p>Cargando…</p> }
    @else if (rows().length === 0) { <p>No hay invitaciones todavía.</p> }
    @else {
      <table>
        <tr><th>Email</th><th>Código</th><th>Estado</th><th></th></tr>
        @for (r of rows(); track r.id) {
          <tr>
            <td>{{ r.invitedEmail }}</td>
            <td><code>{{ r.code }}</code></td>
            <td>{{ r.status }}</td>
            <td>
              @if (r.status === 'PENDING') {
                <button type="button" (click)="revoke(r.id)">Revocar</button>
              }
            </td>
          </tr>
        }
      </table>
    }
  `,
})
export class EmpresaJefesComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private api = inject(ApiService);
  private toast = inject(ToastService);

  companyId = '';
  email = '';
  rows = signal<InviteRow[]>([]);
  loading = signal(true);
  sending = signal(false);

  async ngOnInit() {
    this.companyId = this.route.parent?.snapshot.paramMap.get('id') ?? '';
    await this.reload();
  }

  private async reload() {
    this.loading.set(true);
    const res = await this.api.listDepartmentInvites(this.companyId);
    this.rows.set((res.data ?? []) as InviteRow[]);
    this.loading.set(false);
  }

  async invite() {
    const email = this.email.trim();
    if (!email) return;
    this.sending.set(true);
    try {
      const res = await this.api.inviteDepartmentHead({ companyId: this.companyId, email });
      const code = res.data?.code;
      this.toast.success(code ? `Invitación creada · código ${code}` : 'Invitación creada');
      this.email = '';
      await this.reload();
    } catch (e) {
      this.toast.error(humanizeError(e));
    } finally {
      this.sending.set(false);
    }
  }

  async revoke(inviteId: string) {
    try {
      await this.api.revokeDepartmentInvite(inviteId);
      this.toast.success('Invitación revocada');
      await this.reload();
    } catch (e) {
      this.toast.error(humanizeError(e));
    }
  }
}
