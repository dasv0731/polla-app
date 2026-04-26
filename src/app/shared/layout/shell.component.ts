import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { NavComponent } from './nav.component';

@Component({
  standalone: true,
  selector: 'app-shell',
  imports: [RouterOutlet, NavComponent],
  template: `
    <app-nav />
    <main class="app-main">
      <router-outlet />
    </main>
  `,
})
export class ShellComponent {}
