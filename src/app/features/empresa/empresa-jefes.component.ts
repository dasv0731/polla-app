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
    <header class="emp-head">
      <div>
        <div class="kicker">EQUIPO</div>
        <h2 class="emp-head__title">Jefes de departamento</h2>
      </div>
    </header>

    <form class="invite-box" (ngSubmit)="invite()">
      <input class="form-card__input invite-box__input" type="email"
             [(ngModel)]="email" name="email" placeholder="email@empresa.com" />
      <button type="submit" class="btn-wf btn-wf--primary" [disabled]="sending() || !email.trim()">
        {{ sending() ? 'Invitando…' : '+ Invitar jefe' }}
      </button>
    </form>

    @if (loading()) {
      <p class="text-mute">Cargando…</p>
    } @else if (rows().length === 0) {
      <div class="emp-empty">
        <strong>No hay invitaciones todavía</strong>
        <p class="text-mute">Invita a un jefe por email para que cree y administre su departamento.</p>
      </div>
    } @else {
      <ul class="emp-list" role="list">
        @for (r of rows(); track r.id) {
          <li class="emp-row">
            <div class="emp-row__info">
              <strong>{{ r.invitedEmail }}</strong>
              <button type="button" class="code-chip" title="Copiar código"
                      (click)="copy(r.code)">
                <code>{{ r.code }}</code>
                <span aria-hidden="true">⧉</span>
              </button>
            </div>
            <span class="pill"
                  [class.pill--green]="r.status === 'ACCEPTED'"
                  [class.pill--warn]="r.status === 'PENDING'">
              {{ statusLabel(r.status) }}
            </span>
            @if (r.status === 'PENDING') {
              <button type="button" class="btn-wf btn-wf--sm btn-wf--danger"
                      (click)="revoke(r.id)">Revocar</button>
            }
          </li>
        }
      </ul>
    }
  `,
  styles: [`
    :host { display: block; }
    .emp-head { margin-bottom: 14px; }
    .emp-head__title { font-family: var(--wf-display); font-size: 24px; letter-spacing: .03em; margin: 2px 0 0; }
    .invite-box { display: flex; gap: 10px; flex-wrap: wrap; margin-bottom: 18px; }
    .invite-box__input { max-width: 280px; }
    .emp-list { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 8px; }
    .emp-row { display: flex; align-items: center; gap: 12px; padding: 12px 14px; background: var(--color-primary-white); border: 1px solid var(--wf-line); border-radius: 12px; }
    .emp-row__info { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 6px; }
    .emp-row__info > strong { font-size: 14px; }
    .code-chip {
      display: inline-flex; align-items: center; gap: 8px; align-self: flex-start;
      padding: 3px 10px; border-radius: 999px;
      background: var(--wf-fill); border: 1px solid var(--wf-line);
      cursor: pointer; font-family: var(--wf-mono); font-size: 12px; color: var(--wf-ink);
    }
    .code-chip:hover { background: var(--wf-green-soft); border-color: var(--wf-green); }
    .code-chip code { font-family: inherit; }
  `],
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

  statusLabel(status: string): string {
    switch (status) {
      case 'PENDING': return 'Pendiente';
      case 'ACCEPTED': return 'Aceptada';
      case 'REVOKED': return 'Revocada';
      default: return status;
    }
  }

  async copy(code: string) {
    try {
      await navigator.clipboard.writeText(code);
      this.toast.success('Código copiado');
    } catch {
      this.toast.error('No se pudo copiar el código');
    }
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
