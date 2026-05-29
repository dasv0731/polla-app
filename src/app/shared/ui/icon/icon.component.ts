import { Component, computed, input } from '@angular/core';
import { LucideDynamicIcon } from '@lucide/angular';
import { ICON_SIZE_PX, type IconName, type IconSize } from './icon-map';

/**
 * `<app-icon name="bell" size="md">` — SVG icon wrapper sobre @lucide/angular.
 *
 * - `name` es type-checked contra IconName (icon-map.ts).
 * - `size` es one of sm/md/lg/xl, mapea a px desde design tokens.
 * - `decorative=true` (default): aria-hidden, no a11y label.
 * - `decorative=false`: semantic icon, exposes `label` (defaults to icon name)
 *   como <title> child para screen readers. Lucide drops aria-hidden cuando
 *   hay title.
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
         [title]="titleAttr()"></svg>
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
  label = input<string | undefined>(undefined);

  px = computed(() => ICON_SIZE_PX[this.size()]);

  /**
   * Lucide binds `[attr.aria-hidden]="!title()"`, so an empty/undefined title
   * leaves the icon decorative (aria-hidden="true"), and any truthy title
   * marks it as semantic (aria-hidden removed).
   */
  titleAttr = computed(() =>
    this.decorative() ? undefined : (this.label() ?? this.name())
  );
}
