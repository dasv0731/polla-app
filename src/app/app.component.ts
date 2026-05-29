import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { ConfirmDialogComponent } from './shared/ui/confirm-dialog.component';

@Component({
  standalone: true,
  selector: 'app-root',
  template: `
    <a class="skip-link" href="#main-content">Saltar al contenido</a>
    <main id="main-content" tabindex="-1">
      <router-outlet />
    </main>
    <app-confirm-dialog />
  `,
  styles: [`
    :host { display: contents; }
    main { display: block; outline: none; scroll-margin-top: 0; }
  `],
  imports: [RouterOutlet, ConfirmDialogComponent],
})
export class AppComponent {}
