import { Component, EventEmitter, Output, computed, inject } from '@angular/core';
import { ModalComponent } from '../../shared/ui/modal/modal.component';
import { PreferencesService } from '../../core/preferences/preferences.service';

/**
 * Modal de preferencias del usuario. Toggles backed by localStorage
 * (PreferencesService) — no requieren schema ni mutations.
 *
 * A2: consume `<app-modal>` shared.
 */
@Component({
  standalone: true,
  selector: 'app-preferences-modal',
  imports: [ModalComponent],
  template: `
    <app-modal
      [open]="true"
      title="Preferencias"
      size="md"
      (close)="close()">
      <section slot="body" class="prefs-section">
        <label class="prefs-row">
          <div class="prefs-row__body">
            <div class="prefs-row__title">🔔 Sonidos</div>
            <div class="prefs-row__sub">Sonido corto al recibir una notificación o acertar una trivia.</div>
          </div>
          <input type="checkbox"
                 class="prefs-toggle"
                 [checked]="p().sounds"
                 (change)="toggle('sounds', $event)">
        </label>

        <label class="prefs-row">
          <div class="prefs-row__body">
            <div class="prefs-row__title">⚡ Trivias automáticas</div>
            <div class="prefs-row__sub">Abre el modal de trivia automáticamente cuando un partido entra EN VIVO.</div>
          </div>
          <input type="checkbox"
                 class="prefs-toggle"
                 [checked]="p().autoOpenTrivia"
                 (change)="toggle('autoOpenTrivia', $event)">
        </label>

        <label class="prefs-row">
          <div class="prefs-row__body">
            <div class="prefs-row__title">♿ Reducir animaciones</div>
            <div class="prefs-row__sub">Desactiva animaciones del tour de bienvenida y transiciones del UI.</div>
          </div>
          <input type="checkbox"
                 class="prefs-toggle"
                 [checked]="p().reduceMotion"
                 (change)="toggle('reduceMotion', $event)">
        </label>

        <label class="prefs-row">
          <div class="prefs-row__body">
            <div class="prefs-row__title">🕐 Hora local del browser</div>
            <div class="prefs-row__sub">Muestra los kickoffs en tu zona horaria. Si lo apagas, se usa la hora del estadio.</div>
          </div>
          <input type="checkbox"
                 class="prefs-toggle"
                 [checked]="p().localKickoffTime"
                 (change)="toggle('localKickoffTime', $event)">
        </label>
      </section>

      <div slot="footer">
        <button type="button" class="btn-wf btn-wf--sm"
                (click)="resetToDefaults()">Restablecer</button>
        <button type="button" class="btn-wf btn-wf--sm btn-wf--primary"
                (click)="close()">Listo</button>
      </div>
    </app-modal>
  `,
  styles: [`
    :host { display: contents; }

    .prefs-section {
      padding: 8px 0;
    }
    .prefs-row {
      display: flex; align-items: center; gap: 12px;
      padding: 12px 4px;
      cursor: pointer;
      border-bottom: 1px solid var(--wf-line-2);
    }
    .prefs-row:last-child { border-bottom: 0; }
    .prefs-row:hover { background: var(--wf-fill); }
    .prefs-row__body { flex: 1; min-width: 0; }
    .prefs-row__title {
      font-weight: 600;
      color: var(--wf-ink);
      font-size: 14px;
    }
    .prefs-row__sub {
      font-size: 12px;
      color: var(--wf-ink-3);
      margin-top: 2px;
      line-height: 1.35;
    }
    .prefs-toggle {
      width: 18px; height: 18px;
      cursor: pointer;
      flex-shrink: 0;
    }
  `],
})
export class PreferencesModalComponent {
  private prefs = inject(PreferencesService);

  @Output() closed = new EventEmitter<void>();

  p = computed(() => this.prefs.prefs());

  toggle(key: 'sounds' | 'autoOpenTrivia' | 'reduceMotion' | 'localKickoffTime', event: Event) {
    const checked = (event.target as HTMLInputElement).checked;
    this.prefs.set(key, checked);
  }

  resetToDefaults() {
    this.prefs.reset();
  }

  close() {
    this.closed.emit();
  }
}
