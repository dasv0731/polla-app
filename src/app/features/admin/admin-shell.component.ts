import { Component } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';

interface AdminNavGroup {
  label: string;
  items: { path: string; label: string; exact?: boolean }[];
}

/**
 * Admin shell con sub-nav horizontal agrupado. La sidebar global (.lsb)
 * lleva al user a `/admin` (dashboard); de ahí en adelante esta sub-nav
 * cubre todas las secciones admin. Antes faltaban links a Equipos,
 * Resultados, Sponsors, Users, Specials, Bracket — el admin nuevo no las
 * descubría.
 *
 * Agrupados por workflow:
 *   · Inicio   — dashboard, vistas read-only (overviews).
 *   · Torneo   — partidos, resultados, llaves, equipos, trivia, specials.
 *   · Sponsors — sponsors + códigos.
 *   · Cuentas  — usuarios.
 */
@Component({
  standalone: true,
  selector: 'app-admin-shell',
  imports: [RouterLink, RouterLinkActive, RouterOutlet],
  template: `
    <div class="admin-shell">
      <nav class="admin-subnav" aria-label="Navegación admin">
        @for (group of navGroups; track group.label) {
          <div class="admin-subnav__group">
            <span class="admin-subnav__kicker">{{ group.label }}</span>
            @for (item of group.items; track item.path) {
              <a [routerLink]="item.path"
                 routerLinkActive="is-active"
                 [routerLinkActiveOptions]="{ exact: !!item.exact }"
                 class="admin-subnav__item">
                {{ item.label }}
              </a>
            }
          </div>
        }
      </nav>
      <router-outlet />
    </div>
  `,
  styles: [`
    :host { display: block; }
    .admin-shell { display: flex; flex-direction: column; gap: 18px; }

    .admin-subnav {
      display: flex;
      flex-wrap: wrap;
      gap: 14px 22px;
      padding: 14px 18px;
      background: var(--color-primary-white);
      border: 1px solid var(--color-line);
      border-radius: 12px;
      position: sticky;
      top: 0;
      z-index: 5;
    }
    .admin-subnav__group {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 6px;
    }
    .admin-subnav__kicker {
      font-size: 9px;
      font-weight: 700;
      letter-spacing: 0.12em;
      text-transform: uppercase;
      color: var(--color-text-muted);
      margin-right: 4px;
    }
    .admin-subnav__item {
      font-size: 12px;
      font-weight: 600;
      color: var(--color-primary-black);
      text-decoration: none;
      padding: 5px 10px;
      border-radius: 7px;
      background: transparent;
      border: 1px solid transparent;
      transition: background 0.15s ease, border-color 0.15s ease, color 0.15s ease;
    }
    .admin-subnav__item:hover {
      background: rgba(2, 204, 116, 0.08);
      color: var(--color-primary-green);
    }
    .admin-subnav__item.is-active {
      background: var(--color-primary-black);
      color: var(--color-primary-white);
    }
    .admin-subnav__item:focus-visible {
      outline: 2px solid var(--color-primary-green);
      outline-offset: 2px;
    }

    @media (max-width: 720px) {
      .admin-subnav {
        position: static;
        padding: 12px;
        gap: 10px 14px;
      }
      .admin-subnav__kicker { display: none; }
    }
  `],
})
export class AdminShellComponent {
  readonly navGroups: AdminNavGroup[] = [
    {
      label: 'Inicio',
      items: [
        { path: '/admin', label: 'Dashboard', exact: true },
        { path: '/admin/groups-overview', label: 'Grupos' },
        { path: '/admin/rankings-overview', label: 'Rankings' },
      ],
    },
    {
      label: 'Torneo',
      items: [
        { path: '/admin/fixtures', label: 'Partidos' },
        { path: '/admin/results', label: 'Resultados' },
        { path: '/admin/bracket', label: 'Llaves' },
        { path: '/admin/teams', label: 'Equipos' },
        { path: '/admin/special-results', label: 'Specials' },
      ],
    },
    {
      label: 'Sponsors',
      items: [
        { path: '/admin/sponsors', label: 'Sponsors' },
      ],
    },
    {
      label: 'Cuentas',
      items: [
        { path: '/admin/users', label: 'Usuarios' },
        { path: '/admin/companies', label: 'Empresas' },
      ],
    },
  ];
}
