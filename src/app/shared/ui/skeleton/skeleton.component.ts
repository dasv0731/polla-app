import { Component, computed, input } from '@angular/core';

export type SkeletonVariant = 'text' | 'card' | 'list' | 'circle';

/**
 * `<app-skeleton variant="card" count="3">` — Loading placeholder reutilizable.
 *
 * Reemplaza el pattern "Cargando…" plain text ubiquitous en surfaces
 * (G11 cross-cutting). Respeta prefers-reduced-motion automáticamente.
 *
 * Variants: text (línea horizontal), card (bloque rectangular), list
 * (filas avatar+texto), circle (avatar circular).
 */
@Component({
  standalone: true,
  selector: 'app-skeleton',
  template: `
    <div class="skeleton" aria-busy="true" aria-label="Cargando contenido">
      @for (_ of countArray(); track $index) {
        <div class="skeleton__item" [class]="variantClass()"></div>
      }
    </div>
  `,
  styles: [`
    :host { display: block; }
    .skeleton {
      display: flex;
      flex-direction: column;
      gap: var(--space-sm);
    }
    .skeleton__item {
      background: linear-gradient(
        90deg,
        rgba(0, 0, 0, 0.06) 25%,
        rgba(0, 0, 0, 0.10) 50%,
        rgba(0, 0, 0, 0.06) 75%
      );
      background-size: 200% 100%;
      animation: skeleton-shimmer 1.5s var(--easing-default) infinite;
      border-radius: 6px;
    }
    @media (prefers-reduced-motion: reduce) {
      .skeleton__item {
        animation: none;
        background: rgba(0, 0, 0, 0.06);
      }
    }
    @keyframes skeleton-shimmer {
      0%   { background-position: 200% 0; }
      100% { background-position: -200% 0; }
    }

    .skeleton__item--text  { height: 14px; width: 100%; }
    .skeleton__item--card  { height: 120px; width: 100%; border-radius: 12px; }
    .skeleton__item--list  { height: 56px; width: 100%; border-radius: 8px; }
    .skeleton__item--circle{ height: 40px; width: 40px; border-radius: 50%; align-self: flex-start; }
  `],
})
export class SkeletonComponent {
  variant = input<SkeletonVariant>('text');
  count = input<number>(1);

  countArray = computed(() => Array.from({ length: this.count() }, (_, i) => i));
  variantClass = computed(() => `skeleton__item--${this.variant()}`);
}
