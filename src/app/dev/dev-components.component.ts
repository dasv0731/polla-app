import { Component } from '@angular/core';
import { IconComponent } from '../shared/ui/icon/icon.component';
import { EmptyBlockComponent } from '../shared/ui/empty-block/empty-block.component';
import { SkeletonComponent } from '../shared/ui/skeleton/skeleton.component';
import { ICON_NAMES } from '../shared/ui/icon/icon-map';

/**
 * Dev-only route at `/dev/components` para visualizar componentes
 * shared del design system: <app-icon>, <app-empty-block>, <app-skeleton>.
 *
 * Útil durante desarrollo + para QA visual review. Route NO se incluye
 * cuando isDevMode() es false (production builds).
 */
@Component({
  standalone: true,
  selector: 'app-dev-components',
  imports: [IconComponent, EmptyBlockComponent, SkeletonComponent],
  template: `
    <main style="padding: 32px; max-width: 1100px; margin: 0 auto;">
      <h1 style="font-family: var(--font-display); margin-bottom: 24px;">
        Dev · Design System Components
      </h1>

      <section style="margin-bottom: 48px;">
        <h2 style="margin-bottom: 16px;">Icons ({{ iconNames.length }})</h2>
        <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(120px, 1fr)); gap: 12px;">
          @for (name of iconNames; track name) {
            <div style="display: flex; flex-direction: column; align-items: center; gap: 6px; padding: 12px; border: 1px solid var(--color-line); border-radius: 8px;">
              <app-icon [name]="name" size="lg" />
              <code style="font-size: 11px;">{{ name }}</code>
            </div>
          }
        </div>
        <h3 style="margin: 24px 0 8px;">Size variants</h3>
        <div style="display: flex; gap: 16px; align-items: center;">
          <app-icon name="bell" size="sm" /> <span>sm 16px</span>
          <app-icon name="bell" size="md" /> <span>md 20px</span>
          <app-icon name="bell" size="lg" /> <span>lg 24px</span>
          <app-icon name="bell" size="xl" /> <span>xl 32px</span>
        </div>
      </section>

      <section style="margin-bottom: 48px;">
        <h2 style="margin-bottom: 16px;">EmptyBlock variants</h2>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 24px;">
          <app-empty-block
            iconName="users"
            title="Sin grupos"
            sub="Crea uno para empezar a competir con tus panas." />
          <app-empty-block
            iconName="trophy"
            title="Sin ranking"
            sub="Aún no hay datos suficientes.">
            <button class="btn btn--primary">Hacer mis picks</button>
          </app-empty-block>
        </div>
      </section>

      <section style="margin-bottom: 48px;">
        <h2 style="margin-bottom: 16px;">Skeleton variants</h2>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 24px;">
          <div>
            <h4>text × 3</h4>
            <app-skeleton variant="text" [count]="3" />
          </div>
          <div>
            <h4>card × 2</h4>
            <app-skeleton variant="card" [count]="2" />
          </div>
          <div>
            <h4>list × 4</h4>
            <app-skeleton variant="list" [count]="4" />
          </div>
          <div>
            <h4>circle × 3</h4>
            <app-skeleton variant="circle" [count]="3" />
          </div>
        </div>
      </section>
    </main>
  `,
})
export class DevComponentsComponent {
  iconNames = [...ICON_NAMES] as Array<typeof ICON_NAMES[number]>;
}
