import { Component, inject } from '@angular/core';
import { ActivatedRoute, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { map } from 'rxjs';

@Component({
  standalone: true,
  selector: 'app-empresa-shell',
  imports: [RouterLink, RouterLinkActive, RouterOutlet],
  template: `
    <section class="page emp-shell">
      <header class="page__header">
        <div>
          <div class="kicker">PORTAL DE EMPRESA</div>
          <h1 class="page__title">Administración</h1>
        </div>
      </header>

      <nav class="emp-subnav" aria-label="Portal de empresa">
        <a [routerLink]="['/empresa', id()]" routerLinkActive="is-active"
           [routerLinkActiveOptions]="{ exact: true }" class="emp-subnav__item">Resumen</a>
        <a [routerLink]="['/empresa', id(), 'departamentos']" routerLinkActive="is-active"
           class="emp-subnav__item">Departamentos</a>
        <a [routerLink]="['/empresa', id(), 'jefes']" routerLinkActive="is-active"
           class="emp-subnav__item">Jefes</a>
        <a [routerLink]="['/empresa', id(), 'premios']" routerLinkActive="is-active"
           class="emp-subnav__item">Premios</a>
        <a [routerLink]="['/empresa', id(), 'branding']" routerLinkActive="is-active"
           class="emp-subnav__item">Branding</a>
      </nav>

      <router-outlet />
    </section>
  `,
  styles: [`
    :host { display: block; }
    .emp-shell { display: flex; flex-direction: column; }

    .emp-subnav {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      padding: 8px;
      background: var(--color-primary-white);
      border: 1px solid var(--wf-line);
      border-radius: 12px;
      margin-bottom: 20px;
    }
    .emp-subnav__item {
      font-size: 13px;
      font-weight: 600;
      color: var(--wf-ink-2);
      text-decoration: none;
      padding: 8px 14px;
      border-radius: 8px;
      background: transparent;
      transition: background 0.15s ease, color 0.15s ease;
    }
    .emp-subnav__item:hover {
      background: var(--wf-green-soft);
      color: var(--wf-green-ink);
    }
    .emp-subnav__item.is-active {
      background: var(--wf-ink);
      color: #fff;
    }
    .emp-subnav__item:focus-visible {
      outline: 2px solid var(--color-primary-green);
      outline-offset: 2px;
    }
  `],
})
export class EmpresaShellComponent {
  private route = inject(ActivatedRoute);
  id = toSignal(this.route.paramMap.pipe(map((p) => p.get('id') ?? '')), { initialValue: '' });
}
