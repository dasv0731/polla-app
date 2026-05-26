import { Component, computed, input } from '@angular/core';
import { checkPasswordRules } from '../util/password-rules';

/**
 * Lista visual de las 5 reglas de password (las que Cognito exige).
 * Cada regla muestra ✓ verde si está cumplida o ✗ rojo si no.
 *
 * Uso:
 *   <app-password-rules-list [password]="passwordSignalOrValue" />
 */
@Component({
  standalone: true,
  selector: 'app-password-rules-list',
  template: `
    <ul class="pw-rules" role="list" aria-label="Requisitos de la contraseña">
      @for (r of rules(); track r.key) {
        <li class="pw-rules__item" [class.is-ok]="r.ok">
          <span class="pw-rules__icon" aria-hidden="true">{{ r.ok ? '✓' : '✗' }}</span>
          <span class="pw-rules__label">{{ r.label }}</span>
        </li>
      }
    </ul>
  `,
  styles: [`
    :host { display: block; }
    .pw-rules {
      list-style: none;
      padding: 0;
      margin: 8px 0 0;
      display: grid;
      gap: 4px;
    }
    .pw-rules__item {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 12px;
      color: var(--wf-danger);
      transition: color .15s;
    }
    .pw-rules__item.is-ok { color: var(--wf-green-ink); }
    .pw-rules__icon {
      width: 14px;
      text-align: center;
      font-weight: 700;
    }
  `],
})
export class PasswordRulesListComponent {
  password = input<string>('');
  rules = computed(() => checkPasswordRules(this.password()));
}
