import { Component, Input, OnChanges, SimpleChanges, signal } from '@angular/core';

/**
 * Team flag / crest renderer.
 * - If `crestUrl` is set AND the image loads OK: renders <img>.
 * - If the image fails to load (404, broken URL, CORS, etc.): falls back
 *   to the CSS placeholder span using `flag--<code>`.
 * - If `crestUrl` is empty: renders the CSS placeholder directly.
 *
 * The fallback is per-instance: each rendered <app-team-flag> tracks its
 * own load failure independently. When `crestUrl` changes (e.g. admin
 * saves a new URL), the failure state resets so the new URL is retried.
 *
 * Usage:
 *   <app-team-flag [flagCode]="t.flagCode" [crestUrl]="t.crestUrl" [name]="t.name" [size]="56" />
 */
@Component({
  standalone: true,
  selector: 'app-team-flag',
  template: `
    @if (crestUrl && !imgFailed()) {
      <img [src]="crestUrl"
           [alt]="(name ?? '') + ' escudo'"
           [style.width.px]="size"
           [style.height.px]="size"
           (error)="onImgError()"
           style="object-fit: contain; border-radius: var(--radius-sm); background: var(--color-primary-white); display: inline-block; vertical-align: middle;">
    } @else {
      <span class="flag"
            [class]="flagClass()"
            [style.width.px]="size"
            [style.height.px]="size"
            [style.display]="'inline-block'"
            [style.verticalAlign]="'middle'"
            [attr.aria-label]="(name ?? '') + ' bandera'"></span>
    }
  `,
})
export class TeamFlagComponent implements OnChanges {
  @Input() flagCode = '';
  @Input() crestUrl: string | null = null;
  @Input() name: string | null = null;
  @Input() size = 32;

  imgFailed = signal(false);

  flagClass = () => this.flagCode ? `flag--${this.flagCode.toLowerCase()}` : '';

  ngOnChanges(changes: SimpleChanges) {
    // Reset the failure state when the URL changes — new URL deserves a new attempt.
    if (changes['crestUrl'] && !changes['crestUrl'].firstChange) {
      this.imgFailed.set(false);
    }
  }

  onImgError() {
    this.imgFailed.set(true);
  }
}
