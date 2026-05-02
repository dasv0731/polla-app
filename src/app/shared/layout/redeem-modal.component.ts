import { Component, inject } from '@angular/core';
import { RedeemModalService } from '../../core/sponsors/redeem-modal.service';
import { SponsorRedeemComponent } from '../../features/picks/sponsor-redeem.component';

@Component({
  standalone: true,
  selector: 'app-redeem-modal',
  imports: [SponsorRedeemComponent],
  template: `
    @if (svc.isOpen()) {
      <div class="picks-modal is-open" role="dialog" aria-modal="true"
           aria-labelledby="redeem-modal-title">
        <button type="button" class="picks-modal__close-overlay"
                aria-label="Cerrar" (click)="svc.close()"></button>
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
