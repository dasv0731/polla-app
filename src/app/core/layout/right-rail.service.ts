import { Injectable, computed, inject, signal } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { filter } from 'rxjs/operators';

/**
 * Decide cuándo mostrar los FABs flotantes (Premios + Comodines), que
 * reemplazan al aside lateral derecho. La lógica de visibilidad por ruta
 * se conserva, pero ya no hay estado de "colapsado/expandido" — los FABs
 * son siempre pequeños y no compiten por espacio con el contenido.
 */
@Injectable({ providedIn: 'root' })
export class RightRailService {
  private router = inject(Router);

  private currentUrl = signal(this.router.url);

  visible = computed(() => {
    const url = this.currentUrl();
    // /picks/group-stage/predict (drag-and-drop): NO FABs — el editor
    // necesita todo el espacio sin distracciones flotantes.
    if (url.startsWith('/picks/group-stage/predict')) return false;
    return (
      url === '/picks' ||
      url.startsWith('/picks/group-stage') ||
      url === '/picks/bracket' ||
      url === '/groups' ||
      url.startsWith('/groups/')
    );
  });

  constructor() {
    this.router.events
      .pipe(filter((e): e is NavigationEnd => e instanceof NavigationEnd))
      .subscribe((e) => {
        this.currentUrl.set(e.urlAfterRedirects);
      });
  }
}
