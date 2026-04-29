import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { NavComponent } from './nav.component';
import { FooterComponent } from './footer.component';
import { PicksPendingBannerComponent } from '../../features/picks/picks-pending-banner.component';
import { ToastHostComponent } from '../../core/notifications/toast-host.component';
import { TriviaPopupComponent } from '../../features/trivia/trivia-popup.component';

@Component({
  standalone: true,
  selector: 'app-shell',
  imports: [
    RouterOutlet, NavComponent, FooterComponent,
    PicksPendingBannerComponent, ToastHostComponent, TriviaPopupComponent,
  ],
  template: `
    <app-nav />
    <app-picks-pending-banner />
    <main class="app-main">
      <router-outlet />
    </main>
    <app-footer />
    <app-toast-host />
    <!-- Popup global de trivia: visible en toda la app cuando hay
         preguntas activas no contestadas (modo COMPLETE). -->
    <app-trivia-popup />
  `,
})
export class ShellComponent {}
