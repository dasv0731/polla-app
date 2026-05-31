import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { ApiService } from '../../core/api/api.service';
import { ToastService } from '../../core/notifications/toast.service';
import { humanizeError } from '../../core/notifications/domain-errors';

@Component({
  standalone: true,
  selector: 'app-empresa-premios',
  imports: [FormsModule],
  template: `
    <h2 class="page__title">Premios</h2>
    <fieldset>
      <legend>🏆 Ranking global de la empresa</legend>
      <label>1º <input [(ngModel)]="prize1st" /></label>
      <label>2º <input [(ngModel)]="prize2nd" /></label>
      <label>3º <input [(ngModel)]="prize3rd" /></label>
    </fieldset>
    <fieldset>
      <legend>🏟️ Competencia entre departamentos</legend>
      <label>1º <input [(ngModel)]="deptPrize1st" /></label>
      <label>2º <input [(ngModel)]="deptPrize2nd" /></label>
      <label>3º <input [(ngModel)]="deptPrize3rd" /></label>
    </fieldset>
    <button type="button" [disabled]="saving()" (click)="save()">
      {{ saving() ? 'Guardando…' : 'Guardar premios' }}
    </button>
  `,
})
export class EmpresaPremiosComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private api = inject(ApiService);
  private toast = inject(ToastService);

  companyId = '';
  prize1st = ''; prize2nd = ''; prize3rd = '';
  deptPrize1st = ''; deptPrize2nd = ''; deptPrize3rd = '';
  saving = signal(false);

  async ngOnInit() {
    this.companyId = this.route.parent?.snapshot.paramMap.get('id') ?? '';
    const c = (await this.api.getCompany(this.companyId)).data as Record<string, string | null> | null;
    if (c) {
      this.prize1st = c['prize1st'] ?? ''; this.prize2nd = c['prize2nd'] ?? ''; this.prize3rd = c['prize3rd'] ?? '';
      this.deptPrize1st = c['deptPrize1st'] ?? ''; this.deptPrize2nd = c['deptPrize2nd'] ?? ''; this.deptPrize3rd = c['deptPrize3rd'] ?? '';
    }
  }

  async save() {
    this.saving.set(true);
    try {
      await this.api.updateCompany({
        id: this.companyId,
        prize1st: this.prize1st || null, prize2nd: this.prize2nd || null, prize3rd: this.prize3rd || null,
        deptPrize1st: this.deptPrize1st || null, deptPrize2nd: this.deptPrize2nd || null, deptPrize3rd: this.deptPrize3rd || null,
      });
      this.toast.success('Premios guardados');
    } catch (e) {
      this.toast.error(humanizeError(e));
    } finally {
      this.saving.set(false);
    }
  }
}
