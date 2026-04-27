import { Component, Input, OnChanges, SimpleChanges, computed, signal } from '@angular/core';

/**
 * Team flag / crest renderer.
 *
 * Priority chain:
 *  1. crestUrl (admin-supplied custom image, e.g. team escudo) — if it loads.
 *  2. Local PNG at /assets/flags/<FIFA-3>.png — derived from flagCode (ISO-2).
 *  3. CSS placeholder .flag--<iso-2> if the local PNG also fails (e.g. for
 *     a country we don't have in the bundle yet).
 *
 * Each <app-team-flag> tracks its own load-failure state. Changes to
 * crestUrl reset the failure state so a new URL gets a fresh attempt.
 *
 *   <app-team-flag [flagCode]="t.flagCode" [crestUrl]="t.crestUrl" [name]="t.name" [size]="56" />
 */

// Mapping ISO-2 (lo que guardamos en DB) → FIFA-3 (cómo nombramos las PNGs).
// Cubre las 48 selecciones del Mundial 2026 + algunas extra para edge cases.
const FIFA_CODE: Record<string, string> = {
  AR: 'ARG', AU: 'AUS', AT: 'AUT',
  BE: 'BEL', BA: 'BIH', BR: 'BRA',
  CA: 'CAN', CI: 'CIV', CD: 'COD', CO: 'COL', CV: 'CPV',
  HR: 'CRO', CW: 'CUW', CZ: 'CZE',
  EC: 'ECU', EG: 'EGY', GB: 'ENG', ES: 'ESP',
  FR: 'FRA',
  DE: 'GER', GH: 'GHA',
  HT: 'HAI',
  IR: 'IRN', IQ: 'IRQ',
  JO: 'JOR', JP: 'JPN',
  KR: 'KOR', SA: 'KSA',
  MA: 'MAR', MX: 'MEX',
  NL: 'NED', NO: 'NOR', NZ: 'NZL',
  PA: 'PAN', PY: 'PAR', PT: 'POR',
  QA: 'QAT',
  ZA: 'RSA', SC: 'SCO', SN: 'SEN', CH: 'SUI', SE: 'SWE',
  TN: 'TUN', TR: 'TUR',
  UY: 'URU', US: 'USA', UZ: 'UZB',
  // Algeria — caso especial, ALG en FIFA
  DZ: 'ALG',
};

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
    } @else if (localFlagUrl() && !localFailed()) {
      <img [src]="localFlagUrl()"
           [alt]="(name ?? '') + ' bandera'"
           [style.width.px]="size"
           [style.height.px]="size"
           (error)="onLocalError()"
           style="object-fit: cover; border-radius: var(--radius-sm); display: inline-block; vertical-align: middle;">
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

  crestFailed = signal(false);
  localFailed = signal(false);

  localFlagUrl = computed(() => {
    const fifa = FIFA_CODE[this.flagCode.toUpperCase()];
    return fifa ? `assets/flags/${fifa}.png` : null;
  });

  flagClass = () => this.flagCode ? `flag--${this.flagCode.toLowerCase()}` : '';

  ngOnChanges(changes: SimpleChanges) {
    if (changes['crestUrl'] && !changes['crestUrl'].firstChange) {
      this.crestFailed.set(false);
    }
    if (changes['flagCode'] && !changes['flagCode'].firstChange) {
      this.localFailed.set(false);
    }
  }

  onCrestError() { this.crestFailed.set(true); }
  onLocalError() { this.localFailed.set(true); }
}
