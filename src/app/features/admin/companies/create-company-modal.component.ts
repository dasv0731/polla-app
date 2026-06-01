import { Component, EventEmitter, Output, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../../core/api/api.service';
import { ToastService } from '../../../core/notifications/toast.service';
import { humanizeError } from '../../../core/notifications/domain-errors';
import { ModalComponent } from '../../../shared/ui/modal/modal.component';

/**
 * Super-admin modal to create a new Company. Validates client-side
 * (name 3-80 trimmed, admin email required) and on submit calls
 * api.createCompany (NO firstAdminUserId) then api.inviteCompanyAdmin
 * with the RRHH email. If the email is already a user it's added as
 * admin directly; otherwise the modal shows a copyable invite code.
 *
 * Emits `created` with the new company id and `close` after success;
 * `close` also fires on Cancel and on the modal's backdrop dismiss.
 */
@Component({
  standalone: true,
  selector: 'app-create-company-modal',
  imports: [FormsModule, ModalComponent],
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
          <label>Email del admin (RRHH)</label>
          <input class="auth-input" type="email"
                 [ngModel]="adminEmail()" (ngModelChange)="adminEmail.set($event)"
                 placeholder="rrhh@empresa.com">
          <small class="f__hint">Si ya tiene cuenta, queda como admin al instante. Si no, te damos un código para invitarlo.</small>
        </div>
        <div class="f">
          <label>Contact email (opcional)</label>
          <input class="auth-input" type="email"
                 [ngModel]="contactEmail()" (ngModelChange)="contactEmail.set($event)"
                 placeholder="contacto@empresa.com">
        </div>
        <div class="f">
          <label>Descripción (opcional)</label>
          <textarea class="auth-input" rows="3" maxlength="500"
                    [ngModel]="description()" (ngModelChange)="description.set($event)"
                    placeholder="Marketing y RRHH"></textarea>
        </div>
        @if (inviteCode(); as code) {
          <div class="info info--green ccm__code">
            <span>Código de invitación para <strong>{{ invitedEmail() }}</strong>:</span>
            <code class="ccm__chip" translate="no">{{ code }}</code>
            <button type="button" class="btn-wf btn-wf--sm" (click)="copyCode(code)">
              {{ copied() ? '¡Copiado!' : 'Copiar' }}
            </button>
          </div>
        }
        @if (error(); as e) {
          <p class="modal-error" role="alert">{{ e }}</p>
        }
      </div>
      <div slot="footer">
        <button type="button" class="btn-wf" (click)="close.emit()">
          {{ inviteCode() ? 'Cerrar' : 'Cancelar' }}
        </button>
        @if (!inviteCode()) {
          <button type="button" class="btn-wf btn-wf--primary"
                  [disabled]="loading() || !canSubmit()" (click)="submit()">
            {{ loading() ? 'Creando…' : 'Crear empresa' }}
          </button>
        }
      </div>
    </app-modal>
  `,
  styles: [`
    :host { display: block; }
    .f__hint-row { display: flex; justify-content: space-between; gap: 8px; margin-top: 4px; }
    .f__counter { font-size: 11px; color: var(--color-text-muted); }
    .f__counter.is-near-limit { color: var(--wf-warn); }
    .ccm__code { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
    .ccm__chip {
      font-family: var(--font-mono, monospace); font-size: 15px; font-weight: 700;
      letter-spacing: 1px; padding: 4px 10px; border-radius: var(--radius-sm);
      background: rgba(0,0,0,.06);
    }
  `],
})
export class CreateCompanyModalComponent {
  private api = inject(ApiService);
  private toast = inject(ToastService);

  name = signal('');
  adminEmail = signal('');
  contactEmail = signal('');
  description = signal('');
  error = signal<string | null>(null);
  loading = signal(false);
  inviteCode = signal<string | null>(null);
  invitedEmail = signal('');
  copied = signal(false);

  private emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  canSubmit = computed<boolean>(() => {
    const n = this.name().trim();
    const e = this.adminEmail().trim();
    return n.length >= 3 && n.length <= 80 && this.emailRe.test(e);
  });

  @Output() close = new EventEmitter<void>();
  @Output() created = new EventEmitter<string>();

  async copyCode(code: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(code);
      this.copied.set(true);
      setTimeout(() => this.copied.set(false), 2000);
    } catch {
      /* clipboard not available — code is still visible to copy manually */
    }
  }

  async submit(): Promise<void> {
    if (!this.canSubmit()) {
      this.error.set('Completa nombre y un email de admin válido.');
      return;
    }
    this.error.set(null);
    this.loading.set(true);
    try {
      const email = this.adminEmail().trim();
      const contact = this.contactEmail().trim();
      const desc = this.description().trim();
      const payload: { name: string; contactEmail?: string; description?: string } = {
        name: this.name().trim(),
        ...(contact ? { contactEmail: contact } : {}),
        ...(desc ? { description: desc } : {}),
      };
      const res = await this.api.createCompany(payload);
      const id = (res as { data?: { id?: string } }).data?.id;
      if (!id) {
        this.error.set('No se pudo crear la empresa. Intenta de nuevo.');
        return;
      }
      const res2 = await this.api.inviteCompanyAdmin({ companyId: id, email });
      const data2 = res2.data;
      if (data2?.added === true) {
        this.toast.success(`${email} ya es usuario — agregado como admin`);
        this.created.emit(id);
        this.close.emit();
        return;
      }
      const code = data2?.code ?? '';
      this.toast.success(`Empresa creada. Código de invitación para ${email}: ${code}`);
      this.invitedEmail.set(email);
      this.inviteCode.set(code);
      // Modal stays open so the super-admin can copy the code. The company is
      // already persisted; we don't emit `created` (that would navigate away
      // and hide the chip). On Cerrar the list reloads via the close handler.
    } catch (e) {
      this.error.set(humanizeError(e));
      this.toast.error(humanizeError(e));
    } finally {
      this.loading.set(false);
    }
  }
}
