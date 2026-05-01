import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { NavComponent } from './nav.component';
import { FooterComponent } from './footer.component';
import { PicksPendingBannerComponent } from '../../features/picks/picks-pending-banner.component';
import { ToastHostComponent } from '../../core/notifications/toast-host.component';
import { TriviaPopupComponent } from '../../features/trivia/trivia-popup.component';
import { GroupActionsModalsComponent } from './group-actions-modals.component';

@Component({
  standalone: true,
  selector: 'app-shell',
  imports: [
    RouterOutlet, NavComponent, FooterComponent,
    PicksPendingBannerComponent, ToastHostComponent, TriviaPopupComponent,
    GroupActionsModalsComponent,
  ],
  template: `
    <div class="app-shell">
      <app-nav />
      <main class="app-main">
        <app-picks-pending-banner />
        <router-outlet />
      </main>
      <app-footer />
    </div>
    <app-toast-host />
    <!-- Popup global de trivia: visible en toda la app cuando hay
         preguntas activas no contestadas (modo COMPLETE). -->
    <app-trivia-popup />
    <!-- Modales globales de "Crear grupo" / "Unirme con código" -->
    <app-group-actions-modals />
  `,
  styles: [`
    :host { display: block; }
  `],
})
export class ShellComponent {}
