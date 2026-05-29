import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ApiService } from '../../core/api/api.service';
import { AuthService } from '../../core/auth/auth.service';
import { GroupActionsService } from '../../core/groups/group-actions.service';
import { ToastService } from '../../core/notifications/toast.service';
import { humanizeError } from '../../core/notifications/domain-errors';
import { UserModesService } from '../../core/user/user-modes.service';
import { ModalComponent } from '../ui/modal/modal.component';

const TOURNAMENT_ID = 'mundial-2026';
type GameMode = 'SIMPLE' | 'COMPLETE';

@Component({
  standalone: true,
  selector: 'app-group-actions-modals',
  imports: [FormsModule, ModalComponent],
  template: `
    <!-- ============== MODAL · CREAR GRUPO ============== -->
    @if (svc.createOpen()) {
      <app-modal
        [open]="true"
        title="Crear grupo"
        description="Privado, con código de invitación de 6 caracteres"
        size="md"
        (close)="closeCreate()">
        <form slot="body" (ngSubmit)="submitCreate()" style="display:flex;flex-direction:column;gap:14px;">

            <div class="auth-field" style="margin:0;">
              <label class="auth-label" for="grp-name">Nombre del grupo</label>
              <input type="text" id="grp-name" name="name" class="auth-input"
                     placeholder="Oficina Q1 2026"
                     [(ngModel)]="name"
                     [disabled]="loading()"
                     autocomplete="off"
                     required maxlength="50">
            </div>

            <div class="auth-field" style="margin:0;">
              <label class="auth-label" for="grp-desc">
                Descripción <span class="text-mute">(opcional)</span>
              </label>
              <textarea id="grp-desc" name="description" class="auth-input"
                        rows="2" maxlength="500"
                        placeholder="Reglas extra, premios, info…"
                        [(ngModel)]="description"
                        [disabled]="loading()"
                        style="resize: vertical; min-height: 56px;"></textarea>
              <div class="auth-helper">Hasta 500 caracteres. Visible para todos los miembros.</div>
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

            @if (mode() === 'COMPLETE') {
              <div class="auth-field" style="margin:0;">
                <label class="check-row">
                  <input type="checkbox" name="comodines"
                         [checked]="comodinesEnabled()"
                         (change)="comodinesEnabled.set($any($event.target).checked)">
                  <div>
                    <div class="text-bold">Activar comodines</div>
                    <div class="text-mute" style="font-size:11px;line-height:1.4;margin-top:2px;">
                      Los miembros pueden ganar comodines vía sponsors/sweeps
                      y aplicarlos en este grupo. Si está OFF, el grupo es
                      modo completo pero sin comodines.
                    </div>
                  </div>
                </label>
              </div>
            }

            <label class="check-row" style="margin-top: 12px;">
              <input type="checkbox"
                     [checked]="entryFeeEnabled()"
                     (change)="entryFeeEnabled.set($any($event.target).checked)">
              <span>
                <strong>Cobrar cuota de ingreso al grupo</strong><br>
                <small style="color: var(--color-text-muted);">
                  Si la activás, cada miembro verá un recordatorio hasta que lo marques como pagado.
                </small>
              </span>
            </label>

            @if (entryFeeEnabled()) {
              <div class="entry-fee-field">
                <label for="grp-entry-fee">Instrucciones de pago</label>
                <textarea id="grp-entry-fee" name="entryFeeInstructions"
                          class="auth-input"
                          rows="4"
                          maxlength="500"
                          [(ngModel)]="entryFeeInstructions"
                          placeholder="Ej: Depositar $20 USD a la cuenta XXXXXX y enviar el comprobante por WhatsApp a +593 XXX-XXXX."></textarea>
                <div class="entry-fee-field__hint">
                  <small style="color: var(--color-text-muted);">Hasta 500 caracteres. Los saltos de línea se respetan.</small>
                  <small [style.color]="entryFeeInstructions.length >= 450 ? 'var(--wf-warn)' : 'var(--color-text-muted)'">
                    {{ entryFeeInstructions.length }}/500
                  </small>
                </div>
                @if (entryFeeError(); as err) {
                  <p class="modal-error" role="alert" style="margin-top: 8px;">{{ err }}</p>
                }
              </div>
            }

            @if (error()) {
              <p class="modal-error" role="alert">{{ error() }}</p>
            }
        </form>

        <div slot="footer" style="display:flex;align-items:center;gap:8px;justify-content:space-between;width:100%;flex-wrap:wrap;">
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
        </div>
      </app-modal>
    }

    <!-- ============== MODAL · UNIRME CON CÓDIGO ============== -->
    @if (svc.joinOpen()) {
      <app-modal
        [open]="true"
        title="Unirme con código"
        description="Pega el código de 6 caracteres que te compartieron"
        size="sm"
        (close)="closeJoin()">
        <form slot="body" (ngSubmit)="submitJoin()"
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
              <div class="auth-helper">El código te lo da un admin de grupo.</div>
            </div>

            @if (error()) {
              <p class="modal-error" role="alert">{{ error() }}</p>
            }
        </form>

        <div slot="footer">
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
      </app-modal>
    }
  `,
  styles: [`
    :host { display: contents; }

    .auth-input:focus {
      border-color: var(--color-primary-green);
      box-shadow: 0 0 0 3px rgba(2, 204, 116, 0.15);
      outline: 0;
    }

    .btn-wf--primary {
      background: var(--color-primary-green) !important;
      color: #fff !important;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      border: 0;
    }
    .btn-wf--primary:hover { filter: brightness(1.05); }

    .mode-card {
      display: flex;
      align-items: flex-start;
      gap: 10px;
      padding: 12px;
      border: 1px solid var(--color-line);
      border-radius: 10px;
      cursor: pointer;
      transition: border-color .15s, background .15s;
    }
    .mode-card:hover { border-color: rgba(2, 204, 116, 0.5); }
    .mode-card.is-active {
      border-color: var(--color-primary-green);
      background: rgba(2, 204, 116, 0.08);
    }
    .mode-card input[type="radio"] {
      margin: 2px 0 0;
      accent-color: var(--color-primary-green);
      flex-shrink: 0;
    }

    .modal-error {
      font-size: 12px;
      color: #dc2626;
      padding: 8px 12px;
      background: rgba(220, 38, 38, 0.08);
      border-radius: 6px;
      border: 1px solid rgba(220, 38, 38, 0.2);
      margin: 0;
    }

    .check-row {
      display: flex;
      align-items: flex-start;
      gap: 10px;
      padding: 12px;
      border: 1px solid var(--color-line);
      border-radius: 10px;
      cursor: pointer;
      transition: border-color .15s, background .15s;
    }
    .check-row:hover { border-color: rgba(2, 204, 116, 0.5); }
    .check-row input[type="checkbox"] {
      margin: 3px 0 0;
      accent-color: var(--color-primary-green);
      flex-shrink: 0;
      width: 18px;
      height: 18px;
    }

    .entry-fee-field {
      margin-top: 12px;
      display: flex; flex-direction: column; gap: 6px;
    }
    .entry-fee-field label {
      font-size: 13px; font-weight: 500;
      color: var(--color-text);
    }
    .entry-fee-field__hint {
      display: flex; justify-content: space-between; align-items: center;
      margin-top: 4px;
    }
  `],
})
export class GroupActionsModalsComponent {
  svc = inject(GroupActionsService);
  private api = inject(ApiService);
  private auth = inject(AuthService);
  private router = inject(Router);
  private toast = inject(ToastService);
  private userModes = inject(UserModesService);

  // Crear
  name = '';
  description = '';
  mode = signal<GameMode>('COMPLETE');
  comodinesEnabled = signal(true);
  entryFeeEnabled = signal(false);
  entryFeeInstructions = '';
  entryFeeError = signal<string | null>(null);
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

  private resetCreate() {
    this.name = '';
    this.description = '';
    this.mode.set('COMPLETE');
    this.comodinesEnabled.set(true);
    this.entryFeeEnabled.set(false);
    this.entryFeeInstructions = '';
    this.entryFeeError.set(null);
    this.error.set(null);
  }
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
    this.entryFeeError.set(null);

    // Entry-fee validation (client-side mirror of the handler rules so the
    // user sees the inline error before we hit the network).
    let feeInstructionsTrimmed: string | undefined;
    if (this.entryFeeEnabled()) {
      feeInstructionsTrimmed = this.entryFeeInstructions.trim();
      if (feeInstructionsTrimmed.length === 0) {
        this.entryFeeError.set('Las instrucciones son obligatorias si activás la cuota.');
        return;
      }
      if (feeInstructionsTrimmed.length > 500) {
        this.entryFeeError.set('Las instrucciones no pueden superar los 500 caracteres.');
        return;
      }
    }

    this.loading.set(true);
    try {
      const mode = this.mode();
      const res = await this.api.createGroup({
        name,
        tournamentId: TOURNAMENT_ID,
        mode,
        description: this.description.trim() || undefined,
        // comodinesEnabled solo tiene sentido en COMPLETE — en SIMPLE el
        // backend lo ignora, pero evitamos enviar payload contradictorio.
        ...(mode === 'COMPLETE' ? { comodinesEnabled: this.comodinesEnabled() } : {}),
        ...(this.entryFeeEnabled() ? {
          entryFeeEnabled: true,
          entryFeeInstructions: feeInstructionsTrimmed,
        } : {}),
      });
      const data = (res as { data?: { id?: string } | null })?.data;
      if (!data?.id) {
        this.error.set('No se pudo crear el grupo. Intenta de nuevo.');
        return;
      }
      this.toast.success(`Grupo "${name}" creado`);
      this.svc.closeAll();
      this.resetCreate();
      // Refrescar el caché global de modos/grupos para que el sidebar,
      // el dropdown de Ranking y los gates de hasComplete/hasSimple
      // vean el grupo nuevo sin esperar al próximo reload.
      await this.refreshUserModes();
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
      await this.refreshUserModes();
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

  private async refreshUserModes() {
    const userId = this.auth.user()?.sub;
    if (!userId) return;
    try {
      await this.userModes.load(userId);
    } catch {
      /* ignore — el reload puede fallar; en peor caso el user
         hace F5 y todo sale bien. */
    }
  }
}
