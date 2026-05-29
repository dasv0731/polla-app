import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { NavComponent } from './nav.component';
import { SidebarComponent } from './sidebar.component';
import { TriviaToastComponent } from './trivia-toast.component';
import { RightRailComponent } from './right-rail.component';
import { FooterComponent } from './footer.component';
import { ToastHostComponent } from '../../core/notifications/toast-host.component';
import { TriviaPopupComponent } from '../../features/trivia/trivia-popup.component';
import { GroupActionsModalsComponent } from './group-actions-modals.component';
import { RedeemModalComponent } from './redeem-modal.component';

/**
 * Shell global design-v3. Layout:
 *   · `<app-sidebar>` ancla fija a la izquierda (64px → hover 200px) en desktop,
 *     bottom-nav horizontal en mobile.
 *   · `<app-nav>` topbar (en mobile sólo bell + avatar; en desktop el sidebar
 *     ya cubre navegación primaria pero el topbar queda como header secundario).
 *   · `<app-trivia-toast>` banner negro arriba cuando hay trivia live.
 *   · Grid `.shell` con main (1fr) + right-rail (320px) en desktop ≥1100px;
 *     se colapsa a 1 col debajo del main en mobile/tablet.
 *
 * Removido vs. iteración previa: <app-bottom-nav> standalone (su rol queda
 * absorbido por el sidebar responsive).
 */
@Component({
  standalone: true,
  selector: 'app-shell',
  imports: [
    RouterOutlet, NavComponent, SidebarComponent, TriviaToastComponent,
    RightRailComponent, FooterComponent,
    ToastHostComponent, TriviaPopupComponent,
    GroupActionsModalsComponent, RedeemModalComponent,
  ],
  template: `
    <div class="app-shell">
      <app-nav />
      <app-sidebar />
      <app-trivia-toast />
      <div class="shell">
        <main class="main">
          <router-outlet />
        </main>
        <app-right-rail />
      </div>
      <app-footer />
    </div>
    <app-toast-host />
    <app-trivia-popup />
    <app-group-actions-modals />
    <app-redeem-modal />
  `,
  styles: [`
    :host { display: block; }
    .app-shell { display: flex; flex-direction: column; min-height: 100dvh; }
    .shell {
      margin-left: var(--sidebar-w);
      transition: margin-left 0.2s ease;
      display: grid;
      grid-template-columns: 1fr 320px;
      gap: 24px;
      padding: 24px;
      max-width: 1480px;
      flex: 1;
    }
    .main { display: flex; flex-direction: column; gap: 16px; min-width: 0; }
    @media (max-width: 1099px) {
      .shell { grid-template-columns: 1fr; }
    }
    @media (max-width: 767px) {
      .shell {
        margin-left: 0;
        padding: 14px;
        padding-bottom: 74px;   /* clearance for bottom-nav */
        gap: 14px;
      }
    }
  `],
})
export class ShellComponent {}
