import { Component, Input, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { ApiService } from '../../../core/api/api.service';
import { humanizeError } from '../../../core/notifications/domain-errors';
import { ToastService } from '../../../core/notifications/toast.service';
import { ConfirmDialogService } from '../../../shared/ui/confirm-dialog.service';
import { IconComponent } from '../../../shared/ui/icon/icon.component';
import { SkeletonComponent } from '../../../shared/ui/skeleton/skeleton.component';

interface CompanyDetail {
  id: string;
  name: string;
  status: 'ACTIVE' | 'DISABLED';
  contactEmail: string | null;
  description: string | null;
  logoKey: string | null;
  brandPrimary: string | null;
  brandPrimaryDark: string | null;
  brandAccent: string | null;
  createdAt: string;
}

type Tab = 'general' | 'admins' | 'groups' | 'branding';

/**
 * /admin/companies/:id — super-admin company detail with 4 tabs.
 * This file implements Tab General (sparse save + status toggle).
 * Tasks 17/18/19 fill in tabs Admins / Grupos / Branding.
 */
@Component({
  standalone: true,
  selector: 'app-company-detail',
  imports: [FormsModule, RouterLink, IconComponent, SkeletonComponent],
  template: `
    <section class="page">
      <header class="page__header">
        <div>
          <a routerLink="/admin/companies" class="back-link">← Empresas</a>
          <div class="kicker">EMPRESA</div>
          <h1 class="page__title">{{ company()?.name ?? 'Cargando…' }}</h1>
        </div>
      </header>

      <nav class="page-tabs" aria-label="Secciones de la empresa">
        <button type="button" class="page-tabs__item"
                [class.is-active]="tab() === 'general'"
                (click)="tab.set('general')">General</button>
        <button type="button" class="page-tabs__item"
                [class.is-active]="tab() === 'admins'"
                (click)="tab.set('admins')">Admins</button>
        <button type="button" class="page-tabs__item"
                [class.is-active]="tab() === 'groups'"
                (click)="tab.set('groups')">Grupos</button>
        <button type="button" class="page-tabs__item"
                [class.is-active]="tab() === 'branding'"
                (click)="tab.set('branding')">Branding</button>
      </nav>

      @if (loading()) {
        <app-skeleton variant="card" />
      } @else if (!company()) {
        <p class="text-mute">No se encontró la empresa.</p>
      } @else {
        @if (tab() === 'general') {
          <form class="form-card" (ngSubmit)="save()">
            <h2 class="form-card__title">Datos de la empresa</h2>

            <div class="form-card__field">
              <label class="form-card__label" for="cd-name">Nombre</label>
              <input class="form-card__input" id="cd-name" name="name" type="text"
                     [(ngModel)]="name" maxlength="80">
              <div class="form-card__hint-row">
                <span class="form-card__hint">3-80 caracteres.</span>
                <span class="form-card__counter" [class.is-near-limit]="name.length >= 72">
                  {{ name.length }}/80
                </span>
              </div>
            </div>

            <div class="form-card__field">
              <label class="form-card__label" for="cd-email">Contact email</label>
              <input class="form-card__input" id="cd-email" name="contactEmail" type="email"
                     [(ngModel)]="contactEmail">
            </div>

            <div class="form-card__field">
              <label class="form-card__label" for="cd-desc">Descripción</label>
              <textarea class="form-card__input" id="cd-desc" name="description"
                        rows="3" maxlength="500" [(ngModel)]="description"></textarea>
            </div>

            <div class="form-card__field cd__status-row">
              <strong>Estado:</strong>
              <span class="pill"
                    [class.pill--green]="company()?.status === 'ACTIVE'"
                    [class.pill--grey]="company()?.status === 'DISABLED'">
                {{ company()?.status === 'ACTIVE' ? 'Activa' : 'Desactivada' }}
              </span>
              <button type="button" class="btn-wf btn-wf--sm"
                      [class.btn-wf--danger]="company()?.status === 'ACTIVE'"
                      (click)="toggleStatus()">
                {{ company()?.status === 'ACTIVE' ? 'Desactivar' : 'Reactivar' }}
              </button>
            </div>

            @if (error(); as e) {
              <p class="modal-error" role="alert">{{ e }}</p>
            }

            <button type="submit" class="btn-wf btn-wf--primary"
                    [disabled]="!dirty() || saving()">
              {{ saving() ? 'Guardando…' : 'Guardar cambios' }}
            </button>
          </form>
        }

        @if (tab() === 'admins')   { <p class="text-mute">(Task 17)</p> }
        @if (tab() === 'groups')   { <p class="text-mute">(Task 18)</p> }
        @if (tab() === 'branding') { <p class="text-mute">(Task 19)</p> }
      }
    </section>
  `,
  styles: [`
    :host { display: block; }
    .cd__status-row { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
  `],
})
export class CompanyDetailComponent implements OnInit {
  @Input() id!: string;

  private api = inject(ApiService);
  private router = inject(Router);
  private confirm = inject(ConfirmDialogService);
  private toast = inject(ToastService);

  company = signal<CompanyDetail | null>(null);
  loading = signal(true);
  saving = signal(false);
  tab = signal<Tab>('general');
  error = signal<string | null>(null);

  name = '';
  contactEmail = '';
  description = '';

  dirty(): boolean {
    const c = this.company();
    if (!c) return false;
    return this.name.trim() !== c.name
        || this.contactEmail !== (c.contactEmail ?? '')
        || this.description !== (c.description ?? '');
  }

  async ngOnInit(): Promise<void> {
    try {
      const res = await this.api.getCompany(this.id);
      const c = res.data as CompanyDetail | undefined;
      if (!c) {
        this.toast.error('No se encontró la empresa.');
        return;
      }
      this.company.set(c);
      this.name = c.name;
      this.contactEmail = c.contactEmail ?? '';
      this.description = c.description ?? '';
    } finally {
      this.loading.set(false);
    }
  }

  async save(): Promise<void> {
    if (!this.dirty() || this.saving()) return;
    this.error.set(null);
    this.saving.set(true);
    try {
      const c = this.company()!;
      const payload: {
        id: string;
        name?: string;
        contactEmail?: string;
        description?: string;
      } = { id: this.id };
      if (this.name.trim() !== c.name) payload.name = this.name.trim();
      if (this.contactEmail !== (c.contactEmail ?? '')) payload.contactEmail = this.contactEmail;
      if (this.description !== (c.description ?? '')) payload.description = this.description;

      const res = await this.api.updateCompany(payload);
      const ok = (res as { data?: { ok?: boolean } }).data?.ok;
      if (!ok) {
        this.error.set('No se pudo guardar. Intentá de nuevo.');
        return;
      }
      this.company.set({
        ...c,
        name: this.name.trim(),
        contactEmail: this.contactEmail || null,
        description: this.description || null,
      });
      this.toast.success('Cambios guardados');
    } catch (e) {
      this.error.set(humanizeError(e));
    } finally {
      this.saving.set(false);
    }
  }

  async toggleStatus(): Promise<void> {
    const c = this.company();
    if (!c) return;
    const newStatus = c.status === 'ACTIVE' ? 'DISABLED' : 'ACTIVE';
    const ok = await this.confirm.ask({
      title: newStatus === 'DISABLED' ? 'Desactivar empresa' : 'Reactivar empresa',
      message: newStatus === 'DISABLED'
        ? '¿Desactivar esta empresa? Los company-admins no podrán hacer cambios hasta reactivarla.'
        : '¿Reactivar esta empresa?',
      danger: newStatus === 'DISABLED',
    });
    if (!ok) return;
    try {
      await this.api.setCompanyStatus({ id: this.id, status: newStatus });
      this.company.set({ ...c, status: newStatus });
      this.toast.success(newStatus === 'DISABLED' ? 'Empresa desactivada' : 'Empresa reactivada');
    } catch (e) {
      this.toast.error(humanizeError(e));
    }
  }
}
