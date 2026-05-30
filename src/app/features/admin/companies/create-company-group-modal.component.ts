import { Component, EventEmitter, Input, Output, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../../core/api/api.service';
import { humanizeError } from '../../../core/notifications/domain-errors';
import { ToastService } from '../../../core/notifications/toast.service';
import { ModalComponent } from '../../../shared/ui/modal/modal.component';
import { AdminPickerComponent, PickerUser } from './admin-picker.component';

/**
 * Super-admin / company-admin modal to create a new Group owned by a
 * Company. Builds a sparse payload (omits empty optionals) and calls
 * api.createCompanyGroup. If `adminUserId` is left empty, the backend
 * defaults the group admin to the first company admin (Task 18).
 *
 * Inputs:
 * - companyId: target company id (required)
 * - companyName: shown in header subtitle
 *
 * Outputs:
 * - cancel: emitted when user closes the modal
 * - created: emitted with `{ id }` of the new Group on success
 */
@Component({
  standalone: true,
  selector: 'app-create-company-group-modal',
  imports: [FormsModule, ModalComponent, AdminPickerComponent],
  template: `
    <app-modal [open]="true"
               title="Crear grupo"
               [description]="'Para la empresa ' + companyName"
               size="md"
               (close)="onCancel()">
      <div slot="body">
        <div class="f">
          <label for="ccgm-name">Nombre</label>
          <input id="ccgm-name" class="auth-input" type="text" maxlength="60"
                 [(ngModel)]="name" [disabled]="saving()"
                 placeholder="Mundialista 2026">
          <div class="ccgm__hint-row">
            <small class="f__hint">Hasta 60 caracteres.</small>
            <small class="ccgm__counter" [class.is-near-limit]="name.length >= 54">
              {{ name.length }}/60
            </small>
          </div>
        </div>

        <div class="f">
          <label for="ccgm-cat">Categoría (opcional)</label>
          <select id="ccgm-cat" class="auth-input"
                  [(ngModel)]="category" [disabled]="saving()">
            @for (c of categories; track c.value) {
              <option [value]="c.value">{{ c.label }}</option>
            }
          </select>
        </div>

        <div class="f">
          <label for="ccgm-desc">Descripción (opcional)</label>
          <textarea id="ccgm-desc" class="auth-input" rows="3" maxlength="200"
                    [(ngModel)]="description" [disabled]="saving()"
                    placeholder="Detalle del grupo, premios, reglas, etc."></textarea>
          <div class="ccgm__hint-row">
            <small class="f__hint">Hasta 200 caracteres.</small>
            <small class="ccgm__counter" [class.is-near-limit]="description.length >= 180">
              {{ description.length }}/200
            </small>
          </div>
        </div>

        <div class="f">
          <label>Admin del grupo (opcional)</label>
          @if (adminUser(); as a) {
            <p class="info info--green ccgm__chosen">
              Seleccionado: <strong translate="no">{{ '@' + a.handle }}</strong>
              <button type="button" class="btn-wf btn-wf--sm"
                      [disabled]="saving()"
                      (click)="onClearAdmin()">Cambiar</button>
            </p>
          } @else {
            <app-admin-picker (userSelected)="onPickAdmin($event)" />
            <small class="f__hint">Si lo dejas vacío, se asigna el primer admin de la empresa.</small>
          }
        </div>
      </div>

      <div slot="footer">
        <button type="button" class="btn-wf" [disabled]="saving()"
                (click)="onCancel()">Cancelar</button>
        <button type="button" class="btn-wf btn-wf--primary"
                [disabled]="!canSave() || saving()"
                (click)="save()">
          {{ saving() ? 'Creando…' : 'Crear grupo' }}
        </button>
      </div>
    </app-modal>
  `,
  styles: [`
    :host { display: block; }
    .ccgm__chosen { display: flex; justify-content: space-between; align-items: center; gap: 8px; }
    .ccgm__hint-row { display: flex; justify-content: space-between; gap: 8px; margin-top: 4px; }
    .ccgm__counter { font-size: 11px; color: var(--color-text-muted); }
    .ccgm__counter.is-near-limit { color: var(--wf-warn); }
  `],
})
export class CreateCompanyGroupModalComponent {
  @Input() companyId!: string;
  @Input() companyName = '';

  @Output() cancel = new EventEmitter<void>();
  @Output() created = new EventEmitter<{ id: string }>();

  private api = inject(ApiService);
  private toast = inject(ToastService);

  name = '';
  category = '';
  description = '';
  adminUserId = '';
  adminUser = signal<PickerUser | null>(null);
  saving = signal(false);

  categories: Array<{ value: string; label: string }> = [
    { value: '', label: 'Sin categoría' },
    { value: 'futbol', label: 'Fútbol' },
    { value: 'baloncesto', label: 'Baloncesto' },
    { value: 'otros', label: 'Otros' },
  ];

  canSave(): boolean {
    return this.name.trim().length > 0;
  }

  onPickAdmin(user: PickerUser | null): void {
    this.adminUser.set(user);
    this.adminUserId = user?.sub ?? '';
  }

  onClearAdmin(): void {
    this.adminUser.set(null);
    this.adminUserId = '';
  }

  onCancel(): void {
    this.cancel.emit();
  }

  async save(): Promise<void> {
    if (!this.canSave() || this.saving()) return;
    this.saving.set(true);
    try {
      const name = this.name.trim();
      const cat = this.category.trim();
      const desc = this.description.trim();
      const adminId = this.adminUserId.trim();
      const payload: {
        companyId: string;
        name: string;
        category?: string;
        description?: string;
        adminUserId?: string;
      } = {
        companyId: this.companyId,
        name,
        ...(cat ? { category: cat } : {}),
        ...(desc ? { description: desc } : {}),
        ...(adminId ? { adminUserId: adminId } : {}),
      };
      // Cast: the API client type requires tournamentId/mode for the legacy
      // group-create surface; the company-group create handler accepts the
      // sparse payload above and defaults the rest server-side (Task 18).
      const res = await this.api.createCompanyGroup(payload as unknown as Parameters<ApiService['createCompanyGroup']>[0]);
      const id = (res as { data?: { id?: string } }).data?.id;
      if (!id) {
        this.toast.error('No se pudo crear el grupo. Intenta de nuevo.');
        return;
      }
      this.toast.success(`Grupo "${name}" creado`);
      this.created.emit({ id });
    } catch (e) {
      this.toast.error(humanizeError(e));
    } finally {
      this.saving.set(false);
    }
  }
}
