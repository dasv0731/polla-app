import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { ApiService } from '../../core/api/api.service';
import { ToastService } from '../../core/notifications/toast.service';
import { humanizeError } from '../../core/notifications/domain-errors';

interface DeptRow { id: string; name: string; mode: string | null; category: string | null }

@Component({
  standalone: true,
  selector: 'app-empresa-departamentos',
  imports: [FormsModule],
  template: `
    <header class="emp-head">
      <div>
        <div class="kicker">RRHH</div>
        <h2 class="emp-head__title">Departamentos</h2>
      </div>
      <button type="button" class="btn-wf btn-wf--primary"
              (click)="toggleForm()">
        {{ showForm() ? 'Cancelar' : '+ Crear departamento' }}
      </button>
    </header>

    <p class="text-mute emp-help">
      También puedes invitar a un jefe (pestaña Jefes) para que cree su propio departamento.
    </p>

    @if (showForm()) {
      <form class="form-card emp-form" (ngSubmit)="create()">
        <div class="form-card__field">
          <label class="form-card__label" for="ed-name">Nombre</label>
          <input class="form-card__input" id="ed-name" name="name" type="text"
                 maxlength="40" [(ngModel)]="name" placeholder="Ventas, Marketing…">
        </div>

        <div class="form-card__field">
          <label class="form-card__label" for="ed-mode">Modo</label>
          <select class="form-card__select" id="ed-mode" name="mode" [(ngModel)]="mode">
            <option value="SIMPLE">Simple — solo ganador</option>
            <option value="COMPLETE">Completo — marcador</option>
          </select>
        </div>

        <div class="form-card__field">
          <label class="form-card__label" for="ed-cat">Categoría (opcional)</label>
          <select class="form-card__select" id="ed-cat" name="category" [(ngModel)]="category">
            @for (c of categories; track c.value) {
              <option [value]="c.value">{{ c.label }}</option>
            }
          </select>
        </div>

        <button type="submit" class="btn-wf btn-wf--primary form-card__submit"
                [disabled]="!canSave() || saving()">
          {{ saving() ? 'Creando…' : 'Crear departamento' }}
        </button>
      </form>
    }

    @if (loading()) {
      <p class="text-mute">Cargando…</p>
    } @else if (rows().length === 0) {
      <div class="emp-empty">
        <strong>Aún no hay departamentos</strong>
        <p class="text-mute">Crea el primero con el botón de arriba o invita a un jefe para que lo cree.</p>
      </div>
    } @else {
      <ul class="emp-list" role="list">
        @for (d of rows(); track d.id) {
          <li class="emp-row">
            <div class="emp-row__info">
              <strong>{{ d.name }}</strong>
              <div class="text-mute">
                {{ d.mode === 'COMPLETE' ? 'Completo' : 'Simple' }} · {{ categoryLabel(d.category) }}
              </div>
            </div>
          </li>
        }
      </ul>
    }
  `,
  styles: [`
    :host { display: block; }
    .emp-head { display: flex; align-items: flex-end; justify-content: space-between; gap: 12px; flex-wrap: wrap; margin-bottom: 6px; }
    .emp-head__title { font-family: var(--wf-display); font-size: 24px; letter-spacing: .03em; margin: 2px 0 0; }
    .emp-help { font-size: 12px; margin: 0 0 16px; }
    .emp-form { max-width: 100%; margin-inline: 0; margin-bottom: 18px; }
    .emp-list { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 8px; }
    .emp-row { display: flex; align-items: center; gap: 12px; padding: 12px 14px; background: var(--color-primary-white); border: 1px solid var(--wf-line); border-radius: 12px; }
    .emp-row__info { flex: 1; min-width: 0; }
    .emp-row__info > strong { display: block; font-size: 14px; }
    .emp-empty { background: var(--color-primary-white); border: 1px dashed var(--wf-line); border-radius: 12px; padding: 24px; text-align: center; }
    .emp-empty > strong { display: block; margin-bottom: 6px; font-size: 15px; }
    .emp-empty > p { margin: 0; }
  `],
})
export class EmpresaDepartamentosComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private api = inject(ApiService);
  private toast = inject(ToastService);

  companyId = '';
  rows = signal<DeptRow[]>([]);
  loading = signal(true);

  showForm = signal(false);
  saving = signal(false);
  name = '';
  mode: 'SIMPLE' | 'COMPLETE' = 'SIMPLE';
  category = '';

  categories: Array<{ value: string; label: string }> = [
    { value: '', label: 'Sin categoría' },
    { value: 'futbol', label: 'Fútbol' },
    { value: 'baloncesto', label: 'Baloncesto' },
    { value: 'otros', label: 'Otros' },
  ];

  async ngOnInit() {
    this.companyId = this.route.parent?.snapshot.paramMap.get('id') ?? '';
    await this.reload();
  }

  private async reload() {
    this.loading.set(true);
    const res = await this.api.listCompanyGroups(this.companyId);
    this.rows.set(((res.data ?? []) as DeptRow[]).map((g) => ({ id: g.id, name: g.name, mode: g.mode, category: g.category })));
    this.loading.set(false);
  }

  toggleForm() {
    this.showForm.set(!this.showForm());
  }

  categoryLabel(cat: string | null): string {
    switch (cat) {
      case 'futbol': return 'Fútbol';
      case 'baloncesto': return 'Baloncesto';
      case 'otros': return 'Otros';
      default: return 'Sin categoría';
    }
  }

  canSave(): boolean {
    const n = this.name.trim();
    return n.length >= 3 && n.length <= 40;
  }

  async create() {
    if (!this.canSave() || this.saving()) return;
    this.saving.set(true);
    try {
      const payload: {
        companyId: string;
        name: string;
        tournamentId: string;
        mode: 'SIMPLE' | 'COMPLETE';
        category?: string;
      } = {
        companyId: this.companyId,
        name: this.name.trim(),
        tournamentId: 'mundial-2026',
        mode: this.mode,
      };
      if (this.category) payload.category = this.category;
      await this.api.createCompanyGroup(payload);
      this.toast.success(`Departamento "${this.name.trim()}" creado`);
      this.name = '';
      this.category = '';
      this.mode = 'SIMPLE';
      this.showForm.set(false);
      await this.reload();
    } catch (e) {
      this.toast.error(humanizeError(e));
    } finally {
      this.saving.set(false);
    }
  }
}
