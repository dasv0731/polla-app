import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { ApiService } from '../../core/api/api.service';
import { ToastService } from '../../core/notifications/toast.service';
import { humanizeError } from '../../core/notifications/domain-errors';

@Component({
  standalone: true,
  selector: 'app-aceptar-invitacion',
  imports: [FormsModule],
  template: `
    <section class="page">
      <h1 class="page__title">Crear mi departamento</h1>
      <p class="kicker">Recibiste una invitación como jefe de departamento. Crea tu grupo.</p>
      <label>Código de invitación <input [(ngModel)]="code" placeholder="ABC123" /></label>
      <label>Nombre del departamento <input [(ngModel)]="name" placeholder="Ventas" /></label>
      <label>Modo
        <select [(ngModel)]="mode">
          <option value="COMPLETE">Completo (con comodines)</option>
          <option value="SIMPLE">Simple</option>
        </select>
      </label>
      <label>Categoría (opcional) <input [(ngModel)]="category" placeholder="futbol" /></label>
      <button type="button" [disabled]="saving()" (click)="accept()">
        {{ saving() ? 'Creando…' : 'Crear departamento' }}
      </button>
    </section>
  `,
})
export class AceptarInvitacionComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private api = inject(ApiService);
  private toast = inject(ToastService);

  code = '';
  name = '';
  mode: 'SIMPLE' | 'COMPLETE' = 'COMPLETE';
  category = '';
  saving = signal(false);

  ngOnInit() {
    const c = this.route.snapshot.queryParamMap.get('code');
    if (c) this.code = c;
  }

  async accept() {
    const code = this.code.trim();
    const name = this.name.trim();
    if (!code || name.length < 3) {
      this.toast.error('Pon el código y un nombre de al menos 3 caracteres');
      return;
    }
    this.saving.set(true);
    try {
      const res = await this.api.acceptDepartmentInvite({
        code, name, mode: this.mode, category: this.category.trim() || null,
      });
      const groupId = res.data?.groupId;
      this.toast.success('Departamento creado');
      if (groupId) void this.router.navigate(['/groups', groupId]);
    } catch (e) {
      this.toast.error(humanizeError(e));
    } finally {
      this.saving.set(false);
    }
  }
}
