import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ApiService } from '../../core/api/api.service';
import { GroupActionsService } from '../../core/groups/group-actions.service';
import { ToastService } from '../../core/notifications/toast.service';
import { humanizeError } from '../../core/notifications/domain-errors';

const TOURNAMENT_ID = 'mundial-2026';
type GameMode = 'SIMPLE' | 'COMPLETE';

@Component({
  standalone: true,
  selector: 'app-group-actions-modals',
  imports: [FormsModule],
  template: `
    <!-- ============== MODAL · CREAR GRUPO ============== -->
    @if (svc.createOpen()) {
      <div class="picks-modal is-open" role="dialog" aria-modal="true"
           aria-labelledby="create-group-title">
        <button type="button" class="picks-modal__close-overlay"
                aria-label="Cerrar" (click)="closeCreate()"></button>
        <div class="picks-modal__card" style="max-width:520px;">
          <header class="picks-modal__head">
            <div>
              <div class="title" id="create-group-title">Crear grupo</div>
              <div class="meta">Privado, con código de invitación de 6 caracteres</div>
            </div>
            <button type="button" class="close" aria-label="Cerrar"
                    (click)="closeCreate()">✕</button>
          </header>

          <form class="picks-modal__body" (ngSubmit)="submitCreate()" style="display:flex;flex-direction:column;gap:14px;">

            <div class="auth-field" style="margin:0;">
              <label class="auth-label" for="grp-name">Nombre del grupo</label>
              <input type="text" id="grp-name" name="name" class="auth-input"
                     placeholder="Oficina Q1 2026"
                     [(ngModel)]="name"
                     [disabled]="loading()"
                     required maxlength="50">
            </div>

            <div>
              <div class="auth-label" style="margin-bottom:8px;">Modo de juego</div>
              <div style="display:flex;flex-direction:column;gap:8px;">
                <label class="mode-card" [class.is-active]="mode() === 'COMPLETE'">
                  <input type="radio" name="mode" value="COMPLETE"
                         [checked]="mode() === 'COMPLETE'"
                         (change)="mode.set('COMPLETE')">
                  <div>
                    <div class="text-bold">Modo completo</div>
                    <div class="text-mute" style="font-size:11px;line-height:1.4;margin-top:2px;">
                      Marcadores + tabla + bracket + picks especiales.
                      Cuenta para el ranking global.
                    </div>
                  </div>
                </label>
                <label class="mode-card" [class.is-active]="mode() === 'SIMPLE'">
                  <input type="radio" name="mode" value="SIMPLE"
                         [checked]="mode() === 'SIMPLE'"
                         (change)="mode.set('SIMPLE')">
                  <div>
                    <div class="text-bold">Modo simple</div>
                    <div class="text-mute" style="font-size:11px;line-height:1.4;margin-top:2px;">
                      Solo tabla de grupos, bracket y picks especiales.
                      No cuenta para el ranking global.
                    </div>
                  </div>
                </label>
              </div>
              <div class="auth-helper" style="margin-top:8px;">
                Esta elección es <b>permanente</b> — no se puede cambiar después.
              </div>
            </div>

            @if (error()) {
              <p class="modal-error">{{ error() }}</p>
            }
          </form>

          <footer class="picks-modal__foot">
            <span class="meta">Te asignamos como admin del grupo</span>
            <div style="display:flex;gap:8px;">
              <button type="button" class="btn-wf btn-wf--sm"
                      (click)="closeCreate()" [disabled]="loading()">
                Cancelar
              </button>
              <button type="button" class="btn-wf btn-wf--sm btn-wf--primary"
                      (click)="submitCreate()"
                      [disabled]="loading() || !name.trim()">
                {{ loading() ? 'Creando…' : 'Crear grupo' }}
              </button>
            </div>
          </footer>
        </div>
      </div>
    }

    <!-- ============== MODAL · UNIRME CON CÓDIGO ============== -->
    @if (svc.joinOpen()) {
      <div class="picks-modal is-open" role="dialog" aria-modal="true"
           aria-labelledby="join-group-title">
        <button type="button" class="picks-modal__close-overlay"
                aria-label="Cerrar" (click)="closeJoin()"></button>
        <div class="picks-modal__card" style="max-width:480px;">
          <header class="picks-modal__head">
            <div>
              <div class="title" id="join-group-title">Unirme con código</div>
              <div class="meta">Pegá el código de 6 caracteres que te compartieron</div>
            </div>
            <button type="button" class="close" aria-label="Cerrar"
                    (click)="closeJoin()">✕</button>
          </header>

          <form class="picks-modal__body" (ngSubmit)="submitJoin()"
                style="display:flex;flex-direction:column;gap:14px;">
            <div class="auth-field" style="margin:0;">
              <label class="auth-label" for="join-code">Código de invitación</label>
              <input type="text" id="join-code" name="code" class="auth-input"
                     placeholder="ABCD23"
                     maxlength="6"
                     style="font-family: var(--wf-display); font-size: 24px;
                            letter-spacing: 8px; text-align: center;
                            text-transform: uppercase;"
                     [(ngModel)]="code"
                     (input)="onCodeInput($event)"
                     [disabled]="loading()"
                     autocomplete="off"
                     required>
              <div class="auth-helper">El código se lo das a un admin de grupo.</div>
            </div>

            @if (error()) {
              <p class="modal-error">{{ error() }}</p>
            }
          </form>

          <footer class="picks-modal__foot">
            <span class="meta"></span>
            <div style="display:flex;gap:8px;">
              <button type="button" class="btn-wf btn-wf--sm"
                      (click)="closeJoin()" [disabled]="loading()">
                Cancelar
              </button>
              <button type="button" class="btn-wf btn-wf--sm btn-wf--primary"
                      (click)="submitJoin()"
                      [disabled]="loading() || code.length !== 6">
                {{ loading() ? 'Validando…' : 'Unirme' }}
              </button>
            </div>
          </footer>
        </div>
      </div>
    }
  `,
  styles: [`
    .mode-card {
      display: flex;
      align-items: flex-start;
      gap: 10px;
      padding: 12px;
      border: 1px solid var(--wf-line);
      border-radius: 10px;
      cursor: pointer;
      transition: border-color .15s, background .15s;
    }
    .mode-card:hover { border-color: var(--wf-ink-3); }
    .mode-card.is-active {
      border-color: var(--wf-green);
      background: var(--wf-green-soft);
    }
    .mode-card input[type="radio"] {
      margin: 2px 0 0;
      accent-color: var(--wf-green);
      flex-shrink: 0;
    }

    .modal-error {
      font-size: 12px;
      color: var(--wf-danger);
      padding: 8px 12px;
      background: rgba(195, 51, 51, 0.08);
      border-radius: 6px;
      border: 1px solid rgba(195, 51, 51, 0.2);
      margin: 0;
    }
  `],
})
export class GroupActionsModalsComponent {
  svc = inject(GroupActionsService);
  private api = inject(ApiService);
  private router = inject(Router);
  private toast = inject(ToastService);

  // Crear
  name = '';
  mode = signal<GameMode>('COMPLETE');
  // Unirse
  code = '';

  loading = signal(false);
  error = signal<string | null>(null);

  closeCreate() {
    if (this.loading()) return;
    this.svc.closeAll();
    this.resetCreate();
  }
  closeJoin() {
    if (this.loading()) return;
    this.svc.closeAll();
    this.resetJoin();
  }

  private resetCreate() { this.name = ''; this.mode.set('COMPLETE'); this.error.set(null); }
  private resetJoin()   { this.code = '';                            this.error.set(null); }

  onCodeInput(event: Event) {
    const input = event.target as HTMLInputElement;
    this.code = input.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
    input.value = this.code;
  }

  async submitCreate() {
    const name = this.name.trim();
    if (!name || this.loading()) return;
    this.error.set(null);
    this.loading.set(true);
    try {
      const res = await this.api.createGroup(name, TOURNAMENT_ID, this.mode());
      const data = (res as { data?: { id?: string } | null })?.data;
      if (!data?.id) {
        this.error.set('No se pudo crear el grupo. Intenta de nuevo.');
        return;
      }
      this.toast.success(`Grupo "${name}" creado`);
      this.svc.closeAll();
      this.resetCreate();
      void this.router.navigate(['/groups', data.id]);
    } catch (e) {
      this.error.set(humanizeError(e));
    } finally {
      this.loading.set(false);
    }
  }

  async submitJoin() {
    if (this.code.length !== 6 || this.loading()) return;
    this.error.set(null);
    this.loading.set(true);
    try {
      const res = await this.api.joinGroup(this.code);
      const data = (res as { data?: { id?: string } | null })?.data;
      this.toast.success('¡Te uniste al grupo!');
      this.svc.closeAll();
      this.resetJoin();
      if (data?.id) {
        void this.router.navigate(['/groups', data.id]);
      } else {
        void this.router.navigate(['/groups']);
      }
    } catch (e) {
      this.error.set(humanizeError(e));
    } finally {
      this.loading.set(false);
    }
  }
}
