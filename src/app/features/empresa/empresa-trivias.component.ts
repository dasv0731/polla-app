import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { ApiService } from '../../core/api/api.service';
import { ToastService } from '../../core/notifications/toast.service';
import { humanizeError } from '../../core/notifications/domain-errors';

interface TriviaRow {
  id: string;
  prompt: string;
  optionA: string; optionB: string; optionC: string; optionD: string;
  correctOption: string;
  points: number;
}

type Opt = 'A' | 'B' | 'C' | 'D';

@Component({
  standalone: true,
  selector: 'app-empresa-trivias',
  imports: [FormsModule],
  template: `
    <header class="emp-head">
      <div>
        <div class="kicker">ENGAGEMENT</div>
        <h2 class="emp-head__title">Retos y trivias</h2>
      </div>
    </header>

    <form class="form-card trivia-form" (ngSubmit)="create()">
      <div class="form-card__field">
        <label class="form-card__label" for="prompt">Pregunta</label>
        <input class="form-card__input" id="prompt" name="prompt"
               [(ngModel)]="prompt" placeholder="¿Cuál es…?" />
      </div>

      <div class="trivia-form__grid">
        <div class="form-card__field">
          <label class="form-card__label" for="optA">Opción A</label>
          <input class="form-card__input" id="optA" name="optA" [(ngModel)]="optionA" placeholder="Opción A" />
        </div>
        <div class="form-card__field">
          <label class="form-card__label" for="optB">Opción B</label>
          <input class="form-card__input" id="optB" name="optB" [(ngModel)]="optionB" placeholder="Opción B" />
        </div>
        <div class="form-card__field">
          <label class="form-card__label" for="optC">Opción C</label>
          <input class="form-card__input" id="optC" name="optC" [(ngModel)]="optionC" placeholder="Opción C" />
        </div>
        <div class="form-card__field">
          <label class="form-card__label" for="optD">Opción D</label>
          <input class="form-card__input" id="optD" name="optD" [(ngModel)]="optionD" placeholder="Opción D" />
        </div>
      </div>

      <div class="trivia-form__grid">
        <div class="form-card__field">
          <label class="form-card__label" for="correct">Respuesta correcta</label>
          <select class="form-card__input" id="correct" name="correct" [(ngModel)]="correctOption">
            <option value="A">A</option>
            <option value="B">B</option>
            <option value="C">C</option>
            <option value="D">D</option>
          </select>
        </div>
        <div class="form-card__field">
          <label class="form-card__label" for="points">Puntos</label>
          <input class="form-card__input" type="number" min="1" id="points" name="points" [(ngModel)]="points" />
        </div>
      </div>

      <button type="submit" class="btn-wf btn-wf--primary" [disabled]="saving()">
        {{ saving() ? 'Creando…' : '+ Crear reto' }}
      </button>
    </form>

    @if (loading()) {
      <p class="text-mute">Cargando…</p>
    } @else if (rows().length === 0) {
      <div class="emp-soon">
        <div class="emp-soon__icon" aria-hidden="true">🎯</div>
        <strong>Aún no hay retos</strong>
        <p class="text-mute">Crea tu primer reto para que tus empleados ganen puntos extra.</p>
      </div>
    } @else {
      <ul class="trivia-list" role="list">
        @for (r of rows(); track r.id) {
          <li class="trivia-card">
            <div class="trivia-card__head">
              <strong class="trivia-card__prompt">{{ r.prompt }}</strong>
              <span class="pill pill--green">{{ r.points }} pts</span>
            </div>
            <ul class="trivia-card__opts" role="list">
              <li [class.trivia-opt--ok]="r.correctOption === 'A'"><b>A.</b> {{ r.optionA }}</li>
              <li [class.trivia-opt--ok]="r.correctOption === 'B'"><b>B.</b> {{ r.optionB }}</li>
              <li [class.trivia-opt--ok]="r.correctOption === 'C'"><b>C.</b> {{ r.optionC }}</li>
              <li [class.trivia-opt--ok]="r.correctOption === 'D'"><b>D.</b> {{ r.optionD }}</li>
            </ul>
          </li>
        }
      </ul>
    }
  `,
  styles: [`
    :host { display: block; }
    .emp-head { margin-bottom: 16px; }
    .emp-head__title { font-family: var(--wf-display); font-size: 24px; letter-spacing: .03em; margin: 2px 0 0; }
    .trivia-form { display: flex; flex-direction: column; gap: 14px; max-width: 640px; margin-bottom: 24px; }
    .trivia-form__grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 14px; }
    .trivia-list { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 10px; max-width: 640px; }
    .trivia-card {
      background: var(--color-primary-white); border: 1px solid var(--wf-line);
      border-radius: 12px; padding: 16px 18px;
    }
    .trivia-card__head { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; margin-bottom: 10px; }
    .trivia-card__prompt { font-size: 15px; }
    .trivia-card__opts { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 4px; font-size: 14px; }
    .trivia-card__opts li { padding: 4px 8px; border-radius: 8px; }
    .trivia-card__opts li b { color: var(--wf-ink-3); margin-right: 4px; }
    .trivia-opt--ok { background: var(--wf-green-soft); color: var(--wf-ink); }
    .trivia-opt--ok b { color: var(--wf-green); }
    .emp-soon {
      background: var(--color-primary-white); border: 1px dashed var(--wf-line);
      border-radius: 12px; padding: 36px 24px; text-align: center; max-width: 640px;
    }
    .emp-soon__icon { font-size: 40px; margin-bottom: 8px; }
    .emp-soon > strong { display: block; margin-bottom: 6px; font-size: 16px; }
    .emp-soon > p { margin: 0; }
  `],
})
export class EmpresaTriviasComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private api = inject(ApiService);
  private toast = inject(ToastService);

  companyId = '';
  prompt = '';
  optionA = ''; optionB = ''; optionC = ''; optionD = '';
  correctOption: Opt = 'A';
  points = 10;

  rows = signal<TriviaRow[]>([]);
  loading = signal(true);
  saving = signal(false);

  async ngOnInit() {
    this.companyId = this.route.parent?.snapshot.paramMap.get('id') ?? '';
    await this.reload();
  }

  private async reload() {
    this.loading.set(true);
    const res = await this.api.listCompanyTrivia(this.companyId);
    this.rows.set((res.data ?? []) as TriviaRow[]);
    this.loading.set(false);
  }

  async create() {
    const prompt = this.prompt.trim();
    const a = this.optionA.trim(), b = this.optionB.trim(), c = this.optionC.trim(), d = this.optionD.trim();
    if (!prompt) { this.toast.error('Escribe la pregunta.'); return; }
    if (!a || !b || !c || !d) { this.toast.error('Completa las 4 opciones.'); return; }
    if (!this.points || this.points < 1) { this.toast.error('Los puntos deben ser al menos 1.'); return; }

    this.saving.set(true);
    try {
      await this.api.createCompanyTrivia({
        companyId: this.companyId,
        prompt,
        optionA: a, optionB: b, optionC: c, optionD: d,
        correctOption: this.correctOption,
        points: this.points,
      });
      this.toast.success('Reto creado');
      this.prompt = '';
      this.optionA = ''; this.optionB = ''; this.optionC = ''; this.optionD = '';
      this.correctOption = 'A';
      this.points = 10;
      await this.reload();
    } catch (e) {
      this.toast.error(humanizeError(e));
    } finally {
      this.saving.set(false);
    }
  }
}
