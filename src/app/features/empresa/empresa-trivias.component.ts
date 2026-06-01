import { Component } from '@angular/core';

@Component({
  standalone: true,
  selector: 'app-empresa-trivias',
  template: `
    <header class="emp-head">
      <div>
        <div class="kicker">ENGAGEMENT</div>
        <h2 class="emp-head__title">Retos y trivias</h2>
      </div>
    </header>

    <div class="emp-soon">
      <div class="emp-soon__icon" aria-hidden="true">🎯</div>
      <strong>Próximamente</strong>
      <p class="text-mute">
        Crea retos por empresa para que tus empleados ganen puntos extra.
      </p>
    </div>
  `,
  styles: [`
    :host { display: block; }
    .emp-head { margin-bottom: 16px; }
    .emp-head__title { font-family: var(--wf-display); font-size: 24px; letter-spacing: .03em; margin: 2px 0 0; }
    .emp-soon {
      background: var(--color-primary-white); border: 1px dashed var(--wf-line);
      border-radius: 12px; padding: 36px 24px; text-align: center; max-width: 560px;
    }
    .emp-soon__icon { font-size: 40px; margin-bottom: 8px; }
    .emp-soon > strong { display: block; margin-bottom: 6px; font-size: 16px; }
    .emp-soon > p { margin: 0; }
  `],
})
export class EmpresaTriviasComponent {}
