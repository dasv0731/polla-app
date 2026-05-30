import { Component, EventEmitter, Output, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../../core/api/api.service';
import { humanizeError } from '../../../core/notifications/domain-errors';
import { ModalComponent } from '../../../shared/ui/modal/modal.component';
import { AdminPickerComponent, PickerUser } from './admin-picker.component';

/**
 * Super-admin modal to create a new Company. Validates client-side
 * (mirrors the createCompany handler rules: name 3-80 trimmed, first
 * admin required) and calls api.createCompany on submit.
 *
 * Emits `created` with the new company id and `close` after success;
 * `close` also fires on Cancel and on the modal's backdrop dismiss.
 */
@Component({
  standalone: true,
  selector: 'app-create-company-modal',
  imports: [FormsModule, ModalComponent, AdminPickerComponent],
  template: `
    <app-modal [open]="true" title="Crear empresa" size="md" (close)="close.emit()">
      <div slot="body">
        <div class="f">
          <label>Nombre</label>
          <input class="auth-input" type="text" maxlength="80"
                 [ngModel]="name()" (ngModelChange)="name.set($event)"
                 placeholder="Coca-Cola Ecuador">
          <div class="f__hint-row">
            <small class="f__hint">3-80 caracteres.</small>
            <small class="f__counter" [class.is-near-limit]="name().length >= 72">
              {{ name().length }}/80
            </small>
          </div>
        </div>
        <div class="f">
          <label>Contact email (opcional)</label>
          <input class="auth-input" type="email"
                 [ngModel]="contactEmail()" (ngModelChange)="contactEmail.set($event)"
                 placeholder="rrhh@empresa.com">
        </div>
        <div class="f">
          <label>Descripción (opcional)</label>
          <textarea class="auth-input" rows="3" maxlength="500"
                    [ngModel]="description()" (ngModelChange)="description.set($event)"
                    placeholder="Marketing y RRHH"></textarea>
        </div>
        <div class="f">
          <label>Primer admin</label>
          @if (firstAdmin(); as a) {
            <p class="info info--green ccm__chosen">
              Seleccionado: <strong translate="no">{{ '@' + a.handle }}</strong>
              <button type="button" class="btn-wf btn-wf--sm" (click)="firstAdmin.set(null)">
                Cambiar
              </button>
            </p>
          } @else {
            <app-admin-picker (userSelected)="firstAdmin.set($event)" />
          }
        </div>
        @if (error(); as e) {
          <p class="modal-error" role="alert">{{ e }}</p>
        }
      </div>
      <div slot="footer">
        <button type="button" class="btn-wf" (click)="close.emit()">Cancelar</button>
        <button type="button" class="btn-wf btn-wf--primary"
                [disabled]="loading() || !canSubmit()" (click)="submit()">
          {{ loading() ? 'Creando…' : 'Crear empresa' }}
        </button>
      </div>
    </app-modal>
  `,
  styles: [`
    :host { display: block; }
    .ccm__chosen { display: flex; justify-content: space-between; align-items: center; gap: 8px; }
    .f__hint-row { display: flex; justify-content: space-between; gap: 8px; margin-top: 4px; }
    .f__counter { font-size: 11px; color: var(--color-text-muted); }
    .f__counter.is-near-limit { color: var(--wf-warn); }
  `],
})
export class CreateCompanyModalComponent {
  private api = inject(ApiService);

  name = signal('');
  contactEmail = signal('');
  description = signal('');
  firstAdmin = signal<PickerUser | null>(null);
  error = signal<string | null>(null);
  loading = signal(false);

  canSubmit = computed<boolean>(() => {
    const n = this.name().trim();
    return n.length >= 3 && n.length <= 80 && this.firstAdmin() !== null;
  });

  @Output() close = new EventEmitter<void>();
  @Output() created = new EventEmitter<string>();

  async submit(): Promise<void> {
    if (!this.canSubmit()) {
      this.error.set('Completá nombre y primer admin.');
      return;
    }
    this.error.set(null);
    this.loading.set(true);
    try {
      const admin = this.firstAdmin()!;
      const email = this.contactEmail().trim();
      const desc = this.description().trim();
      const payload: {
        name: string;
        firstAdminUserId: string;
        contactEmail?: string;
        description?: string;
      } = {
        name: this.name().trim(),
        firstAdminUserId: admin.sub,
        ...(email ? { contactEmail: email } : {}),
        ...(desc ? { description: desc } : {}),
      };
      const res = await this.api.createCompany(payload);
      const id = (res as { data?: { id?: string } }).data?.id;
      if (!id) {
        this.error.set('No se pudo crear la empresa. Intentá de nuevo.');
        return;
      }
      this.created.emit(id);
      this.close.emit();
    } catch (e) {
      this.error.set(humanizeError(e));
    } finally {
      this.loading.set(false);
    }
  }
}
