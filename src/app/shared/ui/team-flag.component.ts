import { Component, Input, OnChanges, SimpleChanges, signal } from '@angular/core';

/**
 * Team flag / crest renderer.
 *
 * Priority chain:
 *  1. crestUrl (admin-supplied custom image, e.g. team escudo) — if it loads.
 *  2. flag-icons CSS class .fi .fi-<iso2> (SVG via background-image) — covers
 *     all ISO-3166-1 alpha-2 codes that the lipis/flag-icons package ships.
 *
 * Rationale: SVG flags scale crisply at any size, the package uses ISO-2 codes
 * directly (no FIFA-3 mapping), and there's no need to keep PNGs in /public/.
 *
 *   <app-team-flag [flagCode]="t.flagCode" [crestUrl]="t.crestUrl" [name]="t.name" [size]="56" />
 */
@Component({
  standalone: true,
  selector: 'app-team-flag',
  template: `
    @if (crestUrl && !crestFailed()) {
      <img [src]="crestUrl"
           [alt]="(name ?? '') + ' escudo'"
           [style.width.px]="size"
           [style.height.px]="size"
           (error)="onCrestError()"
           style="object-fit: contain; border-radius: var(--radius-sm); background: var(--color-primary-white); display: inline-block; vertical-align: middle;">
    } @else {
      <span class="fi fis"
            [class]="'fi-' + (flagCode || '').toLowerCase()"
            [style.width.px]="size"
            [style.height.px]="size"
            [style.borderRadius.px]="4"
            [style.display]="'inline-block'"
            [style.verticalAlign]="'middle'"
            [attr.aria-label]="(name ?? '') + ' bandera'"
            [attr.title]="name ?? ''"></span>
    }
  `,
})
export class TeamFlagComponent implements OnChanges {
  @Input() flagCode = '';
  @Input() crestUrl: string | null = null;
  @Input() name: string | null = null;
  @Input() size = 32;

  crestFailed = signal(false);

  ngOnChanges(changes: SimpleChanges) {
    if (changes['crestUrl'] && !changes['crestUrl'].firstChange) {
      this.crestFailed.set(false);
    }
  }

  onCrestError() { this.crestFailed.set(true); }
}
