import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { ApiService } from '../../core/api/api.service';
import { ToastService } from '../../core/notifications/toast.service';
import { humanizeError } from '../../core/notifications/domain-errors';

@Component({
  standalone: true,
  selector: 'app-empresa-branding',
  imports: [FormsModule],
  template: `
    <h2 class="page__title">Branding</h2>
    <p class="kicker">Estos colores se aplican a la vista "Mi empresa" de tus empleados.</p>

    <div [style.--pa-brand]="primary" style="border:1px solid rgba(0,0,0,.1);border-radius:12px;padding:16px;margin:12px 0">
      <div style="display:flex;gap:10px;align-items:center">
        <span style="width:42px;height:42px;border-radius:10px;display:inline-block" [style.background]="primary"></span>
        <span style="width:42px;height:42px;border-radius:10px;display:inline-block" [style.background]="primaryDark"></span>
        <span style="width:42px;height:42px;border-radius:10px;display:inline-block" [style.background]="accent"></span>
        <strong style="margin-left:8px">Vista previa</strong>
      </div>
    </div>

    <label>Color primario <input type="color" [(ngModel)]="primary" /></label>
    <label>Primario oscuro <input type="color" [(ngModel)]="primaryDark" /></label>
    <label>Acento <input type="color" [(ngModel)]="accent" /></label>

    <button type="button" [disabled]="saving()" (click)="save()">
      {{ saving() ? 'Guardando…' : 'Guardar branding' }}
    </button>
  `,
})
export class EmpresaBrandingComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private api = inject(ApiService);
  private toast = inject(ToastService);

  companyId = '';
  primary = '#e23744';
  primaryDark = '#a3232e';
  accent = '#f5a623';
  saving = signal(false);

  async ngOnInit() {
    this.companyId = this.route.parent?.snapshot.paramMap.get('id') ?? '';
    const c = (await this.api.getCompany(this.companyId)).data as Record<string, string | null> | null;
    if (c) {
      if (c['brandPrimary']) this.primary = c['brandPrimary']!;
      if (c['brandPrimaryDark']) this.primaryDark = c['brandPrimaryDark']!;
      if (c['brandAccent']) this.accent = c['brandAccent']!;
    }
  }

  async save() {
    this.saving.set(true);
    try {
      await this.api.updateCompany({
        id: this.companyId,
        brandPrimary: this.primary,
        brandPrimaryDark: this.primaryDark,
        brandAccent: this.accent,
      });
      this.toast.success('Branding guardado');
    } catch (e) {
      this.toast.error(humanizeError(e));
    } finally {
      this.saving.set(false);
    }
  }
}
