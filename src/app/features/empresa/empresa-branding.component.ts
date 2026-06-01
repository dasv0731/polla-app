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
    <header class="emp-head">
      <div>
        <div class="kicker">MARCA</div>
        <h2 class="emp-head__title">Branding</h2>
      </div>
    </header>
    <p class="text-mute emp-help">Estos colores se aplican a la vista "Mi empresa" de tus empleados.</p>

    <form class="emp-brand" (ngSubmit)="save()">
      <div class="emp-brand__preview" [style.--pa-brand]="primary">
        <span class="emp-brand__chip" [style.background]="primary"></span>
        <span class="emp-brand__chip" [style.background]="primaryDark"></span>
        <span class="emp-brand__chip" [style.background]="accent"></span>
        <strong class="emp-brand__preview-label">Vista previa</strong>
      </div>

      <div class="emp-brand__grid">
        <div class="form-card__field">
          <label class="form-card__label" for="b-primary">Color primario</label>
          <input class="emp-brand__color" id="b-primary" name="primary" type="color" [(ngModel)]="primary">
        </div>
        <div class="form-card__field">
          <label class="form-card__label" for="b-dark">Primario oscuro</label>
          <input class="emp-brand__color" id="b-dark" name="primaryDark" type="color" [(ngModel)]="primaryDark">
        </div>
        <div class="form-card__field">
          <label class="form-card__label" for="b-accent">Acento</label>
          <input class="emp-brand__color" id="b-accent" name="accent" type="color" [(ngModel)]="accent">
        </div>
      </div>

      <button type="submit" class="btn-wf btn-wf--primary" [disabled]="saving()">
        {{ saving() ? 'Guardando…' : 'Guardar branding' }}
      </button>
    </form>
  `,
  styles: [`
    :host { display: block; }
    .emp-head { margin-bottom: 4px; }
    .emp-head__title { font-family: var(--wf-display); font-size: 24px; letter-spacing: .03em; margin: 2px 0 0; }
    .emp-help { font-size: 12px; margin: 0 0 16px; }
    .emp-brand { display: flex; flex-direction: column; gap: 18px; max-width: 560px; }
    .emp-brand__preview {
      display: flex; gap: 10px; align-items: center;
      border: 1px solid var(--wf-line); border-radius: 12px; padding: 16px;
      background: var(--color-primary-white);
    }
    .emp-brand__chip { width: 42px; height: 42px; border-radius: 10px; display: inline-block; border: 1px solid var(--wf-line); }
    .emp-brand__preview-label { margin-left: 8px; }
    .emp-brand__grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 14px; }
    .emp-brand__color { width: 100%; height: 42px; border: 1.5px solid var(--wf-line); border-radius: 8px; background: var(--color-primary-white); cursor: pointer; padding: 4px; }
  `],
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
