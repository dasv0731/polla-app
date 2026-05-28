import { Component, inject } from '@angular/core';
import { A11yModule } from '@angular/cdk/a11y';
import { RedeemModalService } from '../../core/sponsors/redeem-modal.service';
import { SponsorRedeemComponent } from '../../features/picks/sponsor-redeem.component';

@Component({
  standalone: true,
  selector: 'app-redeem-modal',
  imports: [SponsorRedeemComponent, A11yModule],
  template: `
    @if (svc.isOpen()) {
      <div class="picks-modal is-open" role="dialog" aria-modal="true"
           aria-labelledby="redeem-modal-title"
           cdkTrapFocus [cdkTrapFocusAutoCapture]="true"
           (keydown.escape)="svc.close()">
        <div class="picks-modal__close-overlay" role="presentation"
             (click)="svc.close()"></div>
        <div class="picks-modal__card" style="max-width:520px;">
          <header class="picks-modal__head">
            <div>
              <div class="title" id="redeem-modal-title">Canjear código</div>
              <div class="meta">Código de sponsor: comodín o puntos extra</div>
            </div>
            <button type="button" class="close" aria-label="Cerrar"
                    (click)="svc.close()">✕</button>
          </header>

          <div class="picks-modal__body" style="padding:16px;">
            <app-sponsor-redeem />
          </div>
        </div>
      </div>
    }
  `,
})
export class RedeemModalComponent {
  svc = inject(RedeemModalService);
}
