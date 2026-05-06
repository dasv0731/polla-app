import { Component, EventEmitter, Output, computed, inject } from '@angular/core';
import { PreferencesService } from '../../core/preferences/preferences.service';

/**
 * Modal de preferencias del usuario. Toggles backed by localStorage
 * (PreferencesService) — no requieren schema ni mutations.
 *
 * Cuando agreguemos preferencias server-side (notif emails, etc.),
 * este modal queda como host del UI y delega a un service que sincroniza.
 */
@Component({
  standalone: true,
  selector: 'app-preferences-modal',
  template: `
    <div class="prefs-overlay" role="dialog" aria-modal="true" aria-labelledby="prefs-title">
      <button type="button" class="prefs-overlay__close-area"
              aria-label="Cerrar" (click)="close()"></button>
      <div class="prefs-modal">
        <header class="prefs-modal__head">
          <h2 id="prefs-title">Preferencias</h2>
          <button type="button" class="prefs-modal__close"
                  aria-label="Cerrar" (click)="close()">✕</button>
        </header>

        <section class="prefs-section">
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
              <div class="prefs-row__sub">Muestra los kickoffs en tu zona horaria. Si lo apagás, se usa la hora del estadio.</div>
            </div>
            <input type="checkbox"
                   class="prefs-toggle"
                   [checked]="p().localKickoffTime"
                   (change)="toggle('localKickoffTime', $event)">
          </label>
        </section>

        <footer class="prefs-modal__foot">
          <button type="button" class="btn-wf btn-wf--sm"
                  (click)="resetToDefaults()">Restablecer</button>
          <button type="button" class="btn-wf btn-wf--sm btn-wf--primary"
                  (click)="close()">Listo</button>
        </footer>
      </div>
    </div>
  `,
  styles: [`
    .prefs-overlay {
      position: fixed; inset: 0; z-index: 1000;
      background: rgba(0, 0, 0, 0.55);
      display: flex; align-items: center; justify-content: center;
      padding: 20px;
    }
    .prefs-overlay__close-area {
      position: absolute; inset: 0;
      background: transparent; border: 0; cursor: pointer;
    }
    .prefs-modal {
      position: relative; z-index: 1;
      background: var(--wf-paper, #fff);
      border: 1px solid var(--wf-line, #e5e7eb);
      border-radius: 12px;
      width: 100%; max-width: 480px;
      max-height: 90vh; overflow-y: auto;
      box-shadow: 0 24px 64px rgba(0, 0, 0, 0.25);
    }
    .prefs-modal__head {
      display: flex; align-items: center; justify-content: space-between;
      padding: 16px 20px;
      border-bottom: 1px solid var(--wf-line);
    }
    .prefs-modal__head h2 {
      margin: 0; font-size: 18px;
      font-family: var(--wf-display, system-ui);
      letter-spacing: 0.04em;
      color: var(--wf-ink);
    }
    .prefs-modal__close {
      background: transparent; border: 0; cursor: pointer;
      font-size: 18px; padding: 4px 8px;
      color: var(--wf-ink-2);
    }
    .prefs-modal__foot {
      display: flex; justify-content: space-between;
      gap: 8px;
      padding: 12px 20px;
      border-top: 1px solid var(--wf-line);
    }
    .prefs-section {
      padding: 8px 0;
    }
    .prefs-row {
      display: flex; align-items: center; gap: 12px;
      padding: 12px 20px;
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
