import { Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { NavComponent } from './nav.component';
import { FooterComponent } from './footer.component';
import { PicksPendingBannerComponent } from '../../features/picks/picks-pending-banner.component';
import { ToastHostComponent } from '../../core/notifications/toast-host.component';
import { TriviaPopupComponent } from '../../features/trivia/trivia-popup.component';
import { GroupActionsModalsComponent } from './group-actions-modals.component';
import { RedeemModalComponent } from './redeem-modal.component';
import { RightRailComponent } from './right-rail.component';
import { RightRailService } from '../../core/layout/right-rail.service';

@Component({
  standalone: true,
  selector: 'app-shell',
  imports: [
    RouterOutlet, NavComponent, FooterComponent,
    PicksPendingBannerComponent, ToastHostComponent, TriviaPopupComponent,
    GroupActionsModalsComponent, RedeemModalComponent, RightRailComponent,
  ],
  template: `
    <div class="app-shell" [class.has-rail]="rail.visible()">
      <app-nav />
      <main class="app-main">
        <app-picks-pending-banner />
        <router-outlet />
      </main>
      <app-right-rail />
      <app-footer />
    </div>
    <app-toast-host />
    <!-- Popup global de trivia: visible en toda la app cuando hay
         preguntas activas no contestadas (modo COMPLETE). -->
    <app-trivia-popup />
    <!-- Modales globales de "Crear grupo" / "Unirme con código" -->
    <app-group-actions-modals />
    <!-- Modal global de "Canjear código de sponsor" -->
    <app-redeem-modal />
  `,
  styles: [`
    :host { display: block; }
  `],
})
export class ShellComponent {
  rail = inject(RightRailService);
}
