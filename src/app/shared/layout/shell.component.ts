import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { NavComponent } from './nav.component';
import { SidebarComponent } from './sidebar.component';
import { BottomNavComponent } from './bottom-nav.component';
import { FooterComponent } from './footer.component';
import { PicksPendingBannerComponent } from '../../features/picks/picks-pending-banner.component';
import { ToastHostComponent } from '../../core/notifications/toast-host.component';
import { TriviaPopupComponent } from '../../features/trivia/trivia-popup.component';
import { GroupActionsModalsComponent } from './group-actions-modals.component';
import { RedeemModalComponent } from './redeem-modal.component';

@Component({
  standalone: true,
  selector: 'app-shell',
  imports: [
    RouterOutlet, NavComponent, SidebarComponent, BottomNavComponent, FooterComponent,
    PicksPendingBannerComponent, ToastHostComponent, TriviaPopupComponent,
    GroupActionsModalsComponent, RedeemModalComponent,
  ],
  template: `
    <div class="app-shell">
      <app-nav />
      <div class="app-shell__body">
        <app-sidebar />
        <main class="app-main">
          <app-picks-pending-banner />
          <router-outlet />
        </main>
      </div>
      <app-footer />
    </div>
    <app-bottom-nav />
    <app-toast-host />
    <app-trivia-popup />
    <app-group-actions-modals />
    <app-redeem-modal />
  `,
  styles: [`
    :host { display: block; }
    .app-shell { display: flex; flex-direction: column; min-height: 100dvh; }
    .app-shell__body { display: flex; flex: 1; }
    .app-main { flex: 1; min-width: 0; padding: 18px 22px 80px; }
    @media (max-width: 767px) {
      .app-main { padding-bottom: 88px; }   /* clearance for bottom-nav */
    }
  `],
})
export class ShellComponent {}
