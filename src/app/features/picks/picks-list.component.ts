import { Component } from '@angular/core';

@Component({
  standalone: true,
  selector: 'app-picks-list',
  template: `
    <section class="container">
      <h1>Picks</h1>
      <p>Próximamente: lista de partidos con tabs Próximos / Jugados.</p>
    </section>
  `,
})
export class PicksListComponent {}
