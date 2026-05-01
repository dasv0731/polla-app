import { Injectable, computed, inject, signal } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { filter } from 'rxjs/operators';

/**
 * Decide cuándo mostrar el right rail (premios + comodines + canjear).
 *
 * Reglas:
 *   - /picks (cronológico) y /picks/group-stage* → rail visible siempre.
 *   - /groups y /groups/:id → rail visible siempre.
 *   - /picks/bracket → rail colapsado por default; el user lo expande
 *     con un botón (collapsible).
 *   - cualquier otra ruta → rail oculto.
 */
@Injectable({ providedIn: 'root' })
export class RightRailService {
  private router = inject(Router);

  private currentUrl = signal(this.router.url);
  bracketExpanded = signal(false);

  routeAllowsRail = computed(() => {
    const url = this.currentUrl();
    return (
      url === '/picks' ||
      url.startsWith('/picks/group-stage') ||
      url === '/picks/bracket' ||
      url === '/groups' ||
      url.startsWith('/groups/')
    );
  });

  isCollapsibleRoute = computed(() => this.currentUrl() === '/picks/bracket');

  visible = computed(() => {
    if (!this.routeAllowsRail()) return false;
    if (this.isCollapsibleRoute()) return this.bracketExpanded();
    return true;
  });

  /** Botón "expandir" se muestra solo en bracket cuando el rail está colapsado. */
  showExpandButton = computed(() =>
    this.isCollapsibleRoute() && !this.bracketExpanded(),
  );

  constructor() {
    this.router.events
      .pipe(filter((e): e is NavigationEnd => e instanceof NavigationEnd))
      .subscribe((e) => {
        this.currentUrl.set(e.urlAfterRedirects);
        // Resetear el toggle del bracket al salir y volver a entrar
        if (e.urlAfterRedirects !== '/picks/bracket') {
          this.bracketExpanded.set(false);
        }
      });
  }

  expand()   { this.bracketExpanded.set(true); }
  collapse() { this.bracketExpanded.set(false); }
  toggle()   { this.bracketExpanded.update((v) => !v); }
}
