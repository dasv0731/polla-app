import { Component, inject } from '@angular/core';
import { RedeemModalService } from '../../core/sponsors/redeem-modal.service';
import { SponsorRedeemComponent } from '../../features/picks/sponsor-redeem.component';
import { ModalComponent } from '../ui/modal/modal.component';

@Component({
  standalone: true,
  selector: 'app-redeem-modal',
  imports: [SponsorRedeemComponent, ModalComponent],
  template: `
    @if (svc.isOpen()) {
      <app-modal
        [open]="true"
        title="Canjear código"
        description="Código de sponsor: comodín o puntos extra"
        size="md"
        (close)="svc.close()">
        <div slot="body">
          <app-sponsor-redeem />
        </div>
      </app-modal>
    }
  `,
})
export class RedeemModalComponent {
  svc = inject(RedeemModalService);
}
