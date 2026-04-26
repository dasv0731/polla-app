import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { NavComponent } from './nav.component';
import { PicksPendingBannerComponent } from '../../features/picks/picks-pending-banner.component';
import { ToastHostComponent } from '../../core/notifications/toast-host.component';

@Component({
  standalone: true,
  selector: 'app-shell',
  imports: [RouterOutlet, NavComponent, PicksPendingBannerComponent, ToastHostComponent],
  template: `
    <app-nav />
    <app-picks-pending-banner />
    <main class="app-main">
      <router-outlet />
    </main>
    <app-toast-host />
  `,
})
export class ShellComponent {}
