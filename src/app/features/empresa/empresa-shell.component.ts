import { Component, inject } from '@angular/core';
import { ActivatedRoute, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { map } from 'rxjs';

@Component({
  standalone: true,
  selector: 'app-empresa-shell',
  imports: [RouterLink, RouterLinkActive, RouterOutlet],
  template: `
    <div class="admin-shell">
      <nav class="admin-subnav" aria-label="Portal de empresa">
        <div class="admin-subnav__group">
          <span class="admin-subnav__kicker">Mi empresa</span>
          <a [routerLink]="['/empresa', id()]" routerLinkActive="is-active" [routerLinkActiveOptions]="{ exact: true }" class="admin-subnav__item">Resumen</a>
          <a [routerLink]="['/empresa', id(), 'departamentos']" routerLinkActive="is-active" class="admin-subnav__item">Departamentos</a>
          <a [routerLink]="['/empresa', id(), 'jefes']" routerLinkActive="is-active" class="admin-subnav__item">Jefes</a>
          <a [routerLink]="['/empresa', id(), 'premios']" routerLinkActive="is-active" class="admin-subnav__item">Premios</a>
        </div>
      </nav>
      <router-outlet />
    </div>
  `,
})
export class EmpresaShellComponent {
  private route = inject(ActivatedRoute);
  id = toSignal(this.route.paramMap.pipe(map((p) => p.get('id') ?? '')), { initialValue: '' });
}
