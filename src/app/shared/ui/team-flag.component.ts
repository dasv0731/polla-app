import { Component, Input, computed, signal } from '@angular/core';

/**
 * Team flag / crest renderer.
 * - If `crestUrl` is set: renders <img> (object-fit contain, white bg, sm radius).
 * - Otherwise: renders a CSS placeholder span using `flag--<code>`.
 *
 * Usage:
 *   <app-team-flag [flagCode]="t.flagCode" [crestUrl]="t.crestUrl" [name]="t.name" [size]="56" />
 */
@Component({
  standalone: true,
  selector: 'app-team-flag',
  template: `
    @if (crestUrl) {
      <img [src]="crestUrl"
           [alt]="(name ?? '') + ' escudo'"
           [style.width.px]="size"
           [style.height.px]="size"
           style="object-fit: contain; border-radius: var(--radius-sm); background: var(--color-primary-white); display: inline-block; vertical-align: middle;">
    } @else {
      <span class="flag"
            [class]="flagClass()"
            [style.width.px]="size"
            [style.height.px]="size"
            [style.display]="'inline-block'"
            [style.verticalAlign]="'middle'"></span>
    }
  `,
})
export class TeamFlagComponent {
  @Input() flagCode = '';
  @Input() crestUrl: string | null = null;
  @Input() name: string | null = null;
  @Input() size = 32;

  flagClass = () => this.flagCode ? `flag--${this.flagCode.toLowerCase()}` : '';
}
