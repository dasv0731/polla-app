import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';

/**
 * Admin shell — solo router-outlet ahora.
 * El menú lateral admin vive en el sidebar global (nav.component) cuando
 * isAdmin() es true, así que no necesitamos uno propio acá.
 */
@Component({
  standalone: true,
  selector: 'app-admin-shell',
  imports: [RouterOutlet],
  template: `<router-outlet />`,
})
export class AdminShellComponent {}
