import { Injectable, signal } from '@angular/core';

/**
 * Estado compartido de los modales de Premios y Comodines.
 *
 * Antes vivía como `signal` local en `right-rail.component`. Lo movimos
 * a un servicio para que los botones de "Premios" / "Comodines" puedan
 * estar inline en cada page (debajo de page__stats), llamando a
 * `openPremios()` / `openComodines()`, mientras los modales siguen
 * mounted globalmente en el shell vía `<app-right-rail>`.
 */
@Injectable({ providedIn: 'root' })
export class RailModalsService {
  private _premiosOpen = signal(false);
  private _comodinesOpen = signal(false);

  premiosOpen = this._premiosOpen.asReadonly();
  comodinesOpen = this._comodinesOpen.asReadonly();

  openPremios()    { this._premiosOpen.set(true); }
  closePremios()   { this._premiosOpen.set(false); }
  openComodines()  { this._comodinesOpen.set(true); }
  closeComodines() { this._comodinesOpen.set(false); }
}
