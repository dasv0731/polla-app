import { Component, computed, input } from '@angular/core';
import { LucideDynamicIcon } from '@lucide/angular';
import { ICON_SIZE_PX, type IconName, type IconSize } from './icon-map';

/**
 * `<app-icon name="bell" size="md">` — SVG icon wrapper sobre @lucide/angular.
 *
 * - `name` es type-checked contra IconName (icon-map.ts).
 * - `size` es one of sm/md/lg/xl, mapea a px desde design tokens.
 * - aria-hidden por default (decorative).
 *
 * Icons deben estar registrados en app.config.ts via provideLucideIcons().
 */
@Component({
  standalone: true,
  selector: 'app-icon',
  imports: [LucideDynamicIcon],
  template: `
    <svg lucideIcon
         [lucideIcon]="name()"
         [size]="px()"
         [attr.aria-hidden]="decorative() ? 'true' : null"></svg>
  `,
  styles: [`
    :host {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
      line-height: 0;
    }
  `],
})
export class IconComponent {
  name = input.required<IconName>();
  size = input<IconSize>('md');
  decorative = input<boolean>(true);

  px = computed(() => ICON_SIZE_PX[this.size()]);
}
