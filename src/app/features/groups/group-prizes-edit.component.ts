import { Component, Input, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { ApiService } from '../../core/api/api.service';
import { AuthService } from '../../core/auth/auth.service';
import { ToastService } from '../../core/notifications/toast.service';
import { humanizeError } from '../../core/notifications/domain-errors';
import { apiClient } from '../../core/api/client';

interface GroupHeader {
  id: string;
  name: string;
  adminUserId: string;
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
            <label class="form-card__label" for="prize-1">🥇 Primer lugar</label>
            <input class="form-card__input" id="prize-1" type="text"
                   [(ngModel)]="prize1st" name="prize1st" maxlength="200"
                   placeholder="Ej: USD 200 + trofeo">
          </div>

          <div class="form-card__field">
            <label class="form-card__label" for="prize-2">🥈 Segundo lugar</label>
            <input class="form-card__input" id="prize-2" type="text"
                   [(ngModel)]="prize2nd" name="prize2nd" maxlength="200"
                   placeholder="Ej: USD 80">
          </div>

          <div class="form-card__field">
            <label class="form-card__label" for="prize-3">🥉 Tercer lugar</label>
            <input class="form-card__input" id="prize-3" type="text"
                   [(ngModel)]="prize3rd" name="prize3rd" maxlength="200"
                   placeholder="Ej: Asado pagado">
          </div>

          @if (error()) {
            <p class="form-card__hint" style="color: var(--color-lost);">{{ error() }}</p>
          }

          <div style="display: flex; gap: var(--space-md); flex-wrap: wrap; margin-top: var(--space-lg);">
            <button class="btn btn--primary" type="submit" [disabled]="saving()">
              {{ saving() ? 'Guardando…' : 'Guardar premios' }}
            </button>
            <a class="btn btn--ghost" [routerLink]="['/groups', id]">Cancelar</a>
          </div>
        </form>
      }
    </main>
  `,
})
export class GroupPrizesEditComponent implements OnInit {
  @Input() id!: string;

  private api = inject(ApiService);
  private auth = inject(AuthService);
  private toast = inject(ToastService);
  private router = inject(Router);

  group = signal<GroupHeader | null>(null);
  loading = signal(true);
  saving = signal(false);
  error = signal<string | null>(null);

  prize1st = '';
  prize2nd = '';
  prize3rd = '';

  isAdmin = signal(false);

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
    } finally {
      this.loading.set(false);
    }
  }

  async save() {
    this.error.set(null);
    this.saving.set(true);
    try {
      const res = await apiClient.models.Group.update({
        id: this.id,
        prize1st: this.prize1st.trim() || null,
        prize2nd: this.prize2nd.trim() || null,
        prize3rd: this.prize3rd.trim() || null,
      });
      if (res?.errors && res.errors.length > 0) {
        this.error.set(res.errors[0]!.message ?? 'No se pudieron guardar los premios');
        return;
      }
      this.toast.success('Premios actualizados');
      void this.router.navigate(['/groups', this.id]);
    } catch (e) {
      this.error.set(humanizeError(e));
    } finally {
      this.saving.set(false);
    }
  }
}
