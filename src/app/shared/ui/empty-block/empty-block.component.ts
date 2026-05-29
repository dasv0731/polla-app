import { Component, input } from '@angular/core';
import { IconComponent } from '../icon/icon.component';
import type { IconName } from '../icon/icon-map';

/**
 * `<app-empty-block>` — Sistema unificado de empty state.
 * Reemplaza 5 sistemas paralelos documentados en walkthrough UX:
 * .empty-block (bracket/groups/comodines), .form-card__hint, inline
 * styles, .loading-msg, .empty-state.
 *
 * Slots:
 * - title (input): h3 prominent del estado.
 * - sub (input): descripción opcional.
 * - iconName (input): Lucide icon name decorative arriba del title.
 * - <ng-content>: slot para CTAs (botones).
 */
@Component({
  standalone: true,
  selector: 'app-empty-block',
  imports: [IconComponent],
  template: `
    <div class="empty-block">
      @if (iconName(); as icon) {
        <div class="empty-block__icon">
          <app-icon [name]="icon" size="xl" />
        </div>
      }
      <h3 class="empty-block__title">{{ title() }}</h3>
      @if (sub(); as sub) {
        <p class="empty-block__sub">{{ sub }}</p>
      }
      <div class="empty-block__actions">
        <ng-content />
      </div>
    </div>
  `,
  styles: [`
    :host { display: block; }
    .empty-block {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: var(--space-md);
      padding: var(--space-xl) var(--space-md);
      background: var(--color-primary-white);
      border: 1px solid var(--color-line);
      border-radius: 14px;
      text-align: center;
    }
    .empty-block__icon {
      color: var(--color-text-muted);
    }
    .empty-block__title {
      font-family: var(--font-display);
      font-size: var(--fs-lg);
      letter-spacing: 0.02em;
      margin: 0;
      color: var(--color-primary-black);
    }
    .empty-block__sub {
      font-size: var(--fs-sm);
      line-height: var(--lh-body);
      color: var(--color-text-muted);
      margin: 0;
      max-width: 360px;
    }
    .empty-block__actions {
      display: flex;
      gap: var(--space-sm);
      flex-wrap: wrap;
      justify-content: center;
      margin-top: var(--space-sm);
    }
    .empty-block__actions:empty {
      display: none;
    }
  `],
})
export class EmptyBlockComponent {
  title = input.required<string>();
  sub = input<string>();
  iconName = input<IconName>();
}
