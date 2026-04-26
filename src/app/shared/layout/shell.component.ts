import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { NavComponent } from './nav.component';
import { PicksPendingBannerComponent } from '../../features/picks/picks-pending-banner.component';

@Component({
  standalone: true,
  selector: 'app-shell',
  imports: [RouterOutlet, NavComponent, PicksPendingBannerComponent],
  template: `
    <app-nav />
    <app-picks-pending-banner />
    <main class="app-main">
      <router-outlet />
    </main>
  `,
})
export class ShellComponent {}
