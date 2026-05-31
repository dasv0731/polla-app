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
    <header class="emp-head">
      <div>
        <div class="kicker">RECOMPENSAS</div>
        <h2 class="emp-head__title">Premios</h2>
      </div>
    </header>

    <form class="emp-prizes" (ngSubmit)="save()">
      <fieldset class="emp-fieldset">
        <legend class="emp-fieldset__legend">🏆 Ranking global de la empresa</legend>
        <div class="emp-fieldset__grid">
          <div class="form-card__field">
            <label class="form-card__label" for="p1">1º lugar</label>
            <input class="form-card__input" id="p1" name="p1" [(ngModel)]="prize1st" placeholder="Premio">
          </div>
          <div class="form-card__field">
            <label class="form-card__label" for="p2">2º lugar</label>
            <input class="form-card__input" id="p2" name="p2" [(ngModel)]="prize2nd" placeholder="Premio">
          </div>
          <div class="form-card__field">
            <label class="form-card__label" for="p3">3º lugar</label>
            <input class="form-card__input" id="p3" name="p3" [(ngModel)]="prize3rd" placeholder="Premio">
          </div>
        </div>
      </fieldset>

      <fieldset class="emp-fieldset">
        <legend class="emp-fieldset__legend">🏟️ Competencia entre departamentos</legend>
        <div class="emp-fieldset__grid">
          <div class="form-card__field">
            <label class="form-card__label" for="d1">1º lugar</label>
            <input class="form-card__input" id="d1" name="d1" [(ngModel)]="deptPrize1st" placeholder="Premio">
          </div>
          <div class="form-card__field">
            <label class="form-card__label" for="d2">2º lugar</label>
            <input class="form-card__input" id="d2" name="d2" [(ngModel)]="deptPrize2nd" placeholder="Premio">
          </div>
          <div class="form-card__field">
            <label class="form-card__label" for="d3">3º lugar</label>
            <input class="form-card__input" id="d3" name="d3" [(ngModel)]="deptPrize3rd" placeholder="Premio">
          </div>
        </div>
      </fieldset>

      <button type="submit" class="btn-wf btn-wf--primary" [disabled]="saving()">
        {{ saving() ? 'Guardando…' : 'Guardar premios' }}
      </button>
    </form>
  `,
  styles: [`
    :host { display: block; }
    .emp-head { margin-bottom: 14px; }
    .emp-head__title { font-family: var(--wf-display); font-size: 24px; letter-spacing: .03em; margin: 2px 0 0; }
    .emp-prizes { display: flex; flex-direction: column; gap: 18px; max-width: 640px; }
    .emp-fieldset {
      border: 1px solid var(--wf-line); border-radius: 12px;
      padding: 18px; margin: 0;
      background: var(--color-primary-white);
    }
    .emp-fieldset__legend { font-weight: 700; font-size: 14px; padding: 0 6px; }
    .emp-fieldset__grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 14px; margin-top: 4px; }
  `],
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
