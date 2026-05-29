import { Component, Input, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { ApiService } from '../../core/api/api.service';
import { AuthService } from '../../core/auth/auth.service';
import { ToastService } from '../../core/notifications/toast.service';
import { humanizeError } from '../../core/notifications/domain-errors';
import { ConfirmDialogService } from '../../shared/ui/confirm-dialog.service';
import { DirtyAware } from '../../shared/util/dirty-form.guard';
import { apiClient } from '../../core/api/client';

interface GroupHeader {
  id: string;
  name: string;
  adminUserId: string;
}

/** Snapshot de los premios al cargar; sirve para `dirty()` y para
 *  detectar que el user está vaciando un premio que ya estaba guardado. */
interface PrizeSnapshot {
  prize1st: string;
  prize2nd: string;
  prize3rd: string;
}

@Component({
  standalone: true,
  selector: 'app-group-prizes-edit',
  imports: [FormsModule, RouterLink],
  template: `
    @let g = group();

    <header class="page-header">
      <div class="page-header__title">
        <small>
          <a [routerLink]="['/groups', id]" style="color: var(--color-primary-green);">
            ← {{ g?.name ?? 'Volver al grupo' }}
          </a>
        </small>
        <h1>Premios del grupo</h1>
      </div>
    </header>

    <main class="container-app" style="max-width: var(--container-narrow);">
      @if (loading()) {
        <p>Cargando…</p>
      } @else if (g === null) {
        <p class="empty-state">Grupo no encontrado.</p>
      } @else if (!isAdmin()) {
        <p class="empty-state">Solo el admin del grupo puede editar los premios.</p>
      } @else {
        <form class="form-card" (ngSubmit)="save()" style="max-width: 100%;">
          <h2 class="form-card__title">Define los premios</h2>
          <p class="form-card__lead">
            Texto libre — puede ser plata, un trofeo, un asado, una camiseta, lo que tu grupo
            haya acordado. Los miembros verán los premios solo si llenas al menos uno; deja
            vacíos los puestos sin premio.
          </p>

          <div class="form-card__field">
            <label class="form-card__label" for="prize-1">
              <span class="prize-medal prize-medal--gold">1°</span>
              Primer lugar
            </label>
            <input class="form-card__input" id="prize-1" type="text"
                   [(ngModel)]="prize1st" name="prize1st" maxlength="200"
                   placeholder="Ej: USD 200 + trofeo">
            <div class="prize-hint-row">
              <span class="form-card__hint">Hasta 200 caracteres.</span>
              <span class="form-card__counter" [class.is-near-limit]="prize1st.length >= 180">
                {{ prize1st.length }}/200
              </span>
            </div>
          </div>

          <div class="form-card__field">
            <label class="form-card__label" for="prize-2">
              <span class="prize-medal prize-medal--silver">2°</span>
              Segundo lugar
            </label>
            <input class="form-card__input" id="prize-2" type="text"
                   [(ngModel)]="prize2nd" name="prize2nd" maxlength="200"
                   placeholder="Ej: USD 80">
            <div class="prize-hint-row">
              <span class="form-card__hint">Hasta 200 caracteres.</span>
              <span class="form-card__counter" [class.is-near-limit]="prize2nd.length >= 180">
                {{ prize2nd.length }}/200
              </span>
            </div>
          </div>

          <div class="form-card__field">
            <label class="form-card__label" for="prize-3">
              <span class="prize-medal prize-medal--bronze">3°</span>
              Tercer lugar
            </label>
            <input class="form-card__input" id="prize-3" type="text"
                   [(ngModel)]="prize3rd" name="prize3rd" maxlength="200"
                   placeholder="Ej: Asado pagado">
            <div class="prize-hint-row">
              <span class="form-card__hint">Hasta 200 caracteres.</span>
              <span class="form-card__counter" [class.is-near-limit]="prize3rd.length >= 180">
                {{ prize3rd.length }}/200
              </span>
            </div>
          </div>

          @if (error()) {
            <p class="form-card__error" role="alert"
               style="color: var(--color-lost);">
              {{ error() }}
            </p>
          }

          <div style="display: flex; gap: var(--space-md); flex-wrap: wrap; margin-top: var(--space-lg);">
            <button class="btn btn--primary" type="submit"
                    [disabled]="saving() || !dirty()">
              {{ saving() ? 'Guardando…' : 'Guardar premios' }}
            </button>
            <a class="btn btn--ghost" [routerLink]="['/groups', id]">Cancelar</a>
          </div>

          @if (!dirty()) {
            <p class="form-card__hint" style="margin-top:8px;">
              No hay cambios para guardar.
            </p>
          }
        </form>
      }
    </main>
  `,
  styles: [`
    .prize-medal {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 24px; height: 24px;
      border-radius: 999px;
      font-weight: 700;
      font-size: 11px;
      margin-right: 6px;
      vertical-align: middle;
    }
    .prize-medal--gold { background: #ffd75e; color: #6a4a00; }
    .prize-medal--silver { background: #d8dde6; color: #404754; }
    .prize-medal--bronze { background: #e0a779; color: #5c2f0d; }

    .prize-hint-row {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      gap: 12px;
      margin-top: 4px;
    }
    .form-card__counter {
      font-size: 11px;
      color: var(--color-text-muted, var(--wf-ink-3));
      font-variant-numeric: tabular-nums;
      flex-shrink: 0;
    }
    .form-card__counter.is-near-limit {
      color: var(--color-warn, #c97a00);
      font-weight: 600;
    }
  `],
})
export class GroupPrizesEditComponent implements OnInit, DirtyAware {
  @Input() id!: string;

  private api = inject(ApiService);
  private auth = inject(AuthService);
  private toast = inject(ToastService);
  private router = inject(Router);
  private confirmDialog = inject(ConfirmDialogService);

  group = signal<GroupHeader | null>(null);
  loading = signal(true);
  saving = signal(false);
  error = signal<string | null>(null);

  prize1st = '';
  prize2nd = '';
  prize3rd = '';

  isAdmin = signal(false);

  /** Snapshot inicial. Comparamos contra esto para `dirty()` y para
   *  detectar deletes (premio guardado → vacío). */
  private original = signal<PrizeSnapshot>({ prize1st: '', prize2nd: '', prize3rd: '' });

  /** True si cualquier premio cambió respecto al snapshot inicial. */
  dirty = computed(() => {
    const o = this.original();
    return this.prize1st.trim() !== o.prize1st
      || this.prize2nd.trim() !== o.prize2nd
      || this.prize3rd.trim() !== o.prize3rd;
  });

  /** True si el user va a borrar un premio que tenía valor guardado. */
  willDeletePremios = computed(() => {
    const o = this.original();
    return (o.prize1st && !this.prize1st.trim())
      || (o.prize2nd && !this.prize2nd.trim())
      || (o.prize3rd && !this.prize3rd.trim());
  });

  isDirty(): boolean { return this.dirty(); }

  async ngOnInit() {
    const currentUserId = this.auth.user()?.sub ?? '';
    try {
      const res = await this.api.getGroup(this.id);
      if (!res.data) return;
      this.group.set({
        id: res.data.id,
        name: res.data.name,
        adminUserId: res.data.adminUserId,
      });
      this.isAdmin.set(res.data.adminUserId === currentUserId);
      this.prize1st = res.data.prize1st ?? '';
      this.prize2nd = res.data.prize2nd ?? '';
      this.prize3rd = res.data.prize3rd ?? '';
      this.original.set({
        prize1st: this.prize1st,
        prize2nd: this.prize2nd,
        prize3rd: this.prize3rd,
      });
    } finally {
      this.loading.set(false);
    }
  }

  async save() {
    if (!this.dirty()) return;
    // Confirmación si vamos a borrar un premio que ya estaba guardado.
    // No bloqueamos si simplemente está agregando uno nuevo.
    if (this.willDeletePremios()) {
      const ok = await this.confirmDialog.ask({
        title: 'Eliminar premio guardado',
        message:
          'Vas a vaciar un premio que ya estaba guardado. Esta acción no se puede deshacer.',
        confirmLabel: 'Eliminar',
        cancelLabel: 'Seguir editando',
        danger: true,
      });
      if (!ok) return;
    }

    this.error.set(null);
    this.saving.set(true);
    try {
      const newSnapshot: PrizeSnapshot = {
        prize1st: this.prize1st.trim(),
        prize2nd: this.prize2nd.trim(),
        prize3rd: this.prize3rd.trim(),
      };
      const res = await apiClient.models.Group.update({
        id: this.id,
        prize1st: newSnapshot.prize1st || null,
        prize2nd: newSnapshot.prize2nd || null,
        prize3rd: newSnapshot.prize3rd || null,
      });
      if (res?.errors && res.errors.length > 0) {
        this.error.set(res.errors[0]!.message ?? 'No se pudieron guardar los premios');
        return;
      }
      // Reset snapshot tras éxito → CanDeactivate no pide confirm en la
      // navegación que sigue.
      this.original.set(newSnapshot);
      this.toast.success('Premios actualizados');
      void this.router.navigate(['/groups', this.id]);
    } catch (e) {
      this.error.set(humanizeError(e));
    } finally {
      this.saving.set(false);
    }
  }
}
