import { Component, Input, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { ApiService } from '../../../core/api/api.service';
import { AuthService } from '../../../core/auth/auth.service';
import { humanizeError } from '../../../core/notifications/domain-errors';
import { ToastService } from '../../../core/notifications/toast.service';
import { ConfirmDialogService } from '../../../shared/ui/confirm-dialog.service';
import { IconComponent } from '../../../shared/ui/icon/icon.component';
import { SkeletonComponent } from '../../../shared/ui/skeleton/skeleton.component';
import { UserAvatarComponent } from '../../../shared/user-avatar/user-avatar.component';
import { AdminPickerComponent, PickerUser } from './admin-picker.component';
import { CreateCompanyGroupModalComponent } from './create-company-group-modal.component';

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

interface AdminRow {
  id: string;          // CompanyMember row id (for delete)
  userId: string;
  handle: string;
  email: string;
  avatarKey: string | null;
  invitedAt: string;
}

interface GroupRow {
  id: string;
  name: string;
  category: string | null;
  memberCount: number | null;
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
  imports: [FormsModule, RouterLink, IconComponent, SkeletonComponent, AdminPickerComponent, UserAvatarComponent, CreateCompanyGroupModalComponent],
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

        @if (tab() === 'admins') {
          <div class="form-card">
            <header class="cd-admins__head">
              <h2>Company-admins</h2>
              <button type="button" class="btn-wf btn-wf--sm"
                      (click)="showPicker.set(!showPicker())">
                {{ showPicker() ? 'Cancelar' : '+ Agregar admin' }}
              </button>
            </header>

            @if (showPicker()) {
              <div style="margin: 10px 0;">
                <app-admin-picker (userSelected)="onPickAdmin($event)" />
              </div>
            }

            @if (loadingAdmins()) {
              <app-skeleton variant="list" [count]="2" />
            } @else if (admins().length === 0) {
              <p class="text-mute">Esta empresa no tiene admins.</p>
            } @else {
              <ul class="adm-list" role="list">
                @for (a of admins(); track a.id) {
                  <li class="adm-list__row">
                    <app-user-avatar [sub]="a.userId" [handle]="a.handle"
                                     [avatarKey]="a.avatarKey" size="md" />
                    <div class="adm-list__info">
                      <strong translate="no">{{ '@' + a.handle }}</strong>
                      <div class="text-mute">{{ a.email }} · agregado {{ formatDate(a.invitedAt) }}</div>
                    </div>
                    <button type="button" class="btn-wf btn-wf--sm btn-wf--danger"
                            [disabled]="admins().length <= 1"
                            [title]="admins().length <= 1 ? 'Es el último admin — agrega otro antes' : ''"
                            (click)="removeAdmin(a)">Remover</button>
                  </li>
                }
              </ul>
            }
          </div>
        }
        @if (tab() === 'groups') {
          <div class="form-card">
            <header class="cd-grupos__head">
              <h2>Grupos</h2>
              <button type="button" class="btn-wf btn-wf--sm"
                      (click)="showCreateGroup.set(true)">+ Crear grupo</button>
            </header>

            @if (loadingGroups()) {
              <app-skeleton variant="list" [count]="2" />
            } @else if (groups().length === 0) {
              <p class="text-mute">Esta empresa todavía no tiene grupos. Crea el primero.</p>
            } @else {
              <ul class="cd-grupos__list" role="list">
                @for (g of groups(); track g.id) {
                  <li class="cd-grupos__row">
                    <div class="cd-grupos__info">
                      <strong>{{ g.name }}</strong>
                      <div class="text-mute">
                        {{ categoryLabel(g.category) }} ·
                        {{ g.memberCount !== null ? g.memberCount + ' miembros' : '— miembros' }}
                      </div>
                    </div>
                    <button type="button" class="btn-wf btn-wf--sm btn-wf--ghost"
                            (click)="editGroup(g)">Editar</button>
                  </li>
                }
              </ul>
            }
          </div>
        }
        @if (tab() === 'branding') { <p class="text-mute">(Task 19)</p> }
      }

      @if (showCreateGroup() && company(); as c) {
        <app-create-company-group-modal
          [companyId]="id"
          [companyName]="c.name"
          (cancel)="showCreateGroup.set(false)"
          (created)="onGroupCreated($event)" />
      }
    </section>
  `,
  styles: [`
    :host { display: block; }
    .cd__status-row { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
    .adm-list { list-style: none; padding: 0; margin: 10px 0 0; display: flex; flex-direction: column; gap: 8px; }
    .adm-list__row { display: flex; align-items: center; gap: 12px; padding: 12px 14px; background: #fff; border: 1px solid var(--color-line); border-radius: var(--radius-md); }
    .adm-list__info { flex: 1; min-width: 0; }
    .adm-list__info > strong { display: block; font-size: 14px; }
    .cd-admins__head { display: flex; justify-content: space-between; align-items: center; gap: 12px; margin-bottom: 4px; }
    .cd-admins__head h2 { margin: 0; font-size: 16px; }
    .cd-grupos__head { display: flex; justify-content: space-between; align-items: center; gap: 12px; margin-bottom: 4px; }
    .cd-grupos__head h2 { margin: 0; font-size: 16px; }
    .cd-grupos__list { list-style: none; padding: 0; margin: 10px 0 0; display: flex; flex-direction: column; gap: 8px; }
    .cd-grupos__row { display: flex; align-items: center; gap: 12px; padding: 12px 14px; background: #fff; border: 1px solid var(--color-line); border-radius: var(--radius-md); }
    .cd-grupos__info { flex: 1; min-width: 0; }
    .cd-grupos__info > strong { display: block; font-size: 14px; }
  `],
})
export class CompanyDetailComponent implements OnInit {
  @Input() id!: string;

  private api = inject(ApiService);
  private router = inject(Router);
  private confirm = inject(ConfirmDialogService);
  private toast = inject(ToastService);
  private auth = inject(AuthService);

  company = signal<CompanyDetail | null>(null);
  loading = signal(true);
  saving = signal(false);
  tab = signal<Tab>('general');
  error = signal<string | null>(null);

  admins = signal<AdminRow[]>([]);
  loadingAdmins = signal(false);
  showPicker = signal(false);

  groups = signal<GroupRow[]>([]);
  loadingGroups = signal(false);
  showCreateGroup = signal(false);

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
      await this.loadAdmins();
      await this.loadGroups();
    } finally {
      this.loading.set(false);
    }
  }

  private async loadGroups(): Promise<void> {
    this.loadingGroups.set(true);
    try {
      const res = await this.api.listCompanyGroups(this.id);
      const rows = (res.data ?? []) as Array<{
        id: string;
        name: string;
        category?: string | null;
        memberCount?: number | null;
      }>;
      this.groups.set(rows.map((r) => ({
        id: r.id,
        name: r.name,
        category: r.category ?? null,
        memberCount: r.memberCount ?? null,
      })));
    } finally {
      this.loadingGroups.set(false);
    }
  }

  async onGroupCreated(_g: { id: string }): Promise<void> {
    this.showCreateGroup.set(false);
    await this.loadGroups();
  }

  editGroup(g: GroupRow): void {
    this.router.navigate(['/admin/groups/edit', g.id]);
  }

  categoryLabel(cat: string | null): string {
    switch (cat) {
      case 'futbol': return 'Fútbol';
      case 'baloncesto': return 'Baloncesto';
      case 'otros': return 'Otros';
      default: return 'Sin categoría';
    }
  }

  private async loadAdmins(): Promise<void> {
    this.loadingAdmins.set(true);
    try {
      const res = await this.api.listCompanyMembers(this.id);
      const members = (res.data ?? []) as Array<{ id: string; userId: string; role: string; invitedAt: string }>;
      const adminRows = members.filter((m) => m.role === 'ADMIN');
      const enriched = await Promise.all(adminRows.map(async (m) => {
        const u = await this.api.getUser(m.userId);
        const userData = (u as { data?: { handle?: string; email?: string; avatarKey?: string | null } }).data;
        return {
          id: m.id,
          userId: m.userId,
          handle: userData?.handle ?? m.userId.slice(0, 6),
          email: userData?.email ?? '',
          avatarKey: userData?.avatarKey ?? null,
          invitedAt: m.invitedAt,
        } as AdminRow;
      }));
      this.admins.set(enriched);
    } finally {
      this.loadingAdmins.set(false);
    }
  }

  async onPickAdmin(user: PickerUser | null): Promise<void> {
    if (!user) {
      this.showPicker.set(false);
      return;
    }
    try {
      await this.api.addCompanyAdmin({ companyId: this.id, userId: user.sub });
      await this.loadAdmins();
      this.showPicker.set(false);
      this.toast.success('Admin agregado');
    } catch (e) {
      this.toast.error(humanizeError(e));
    }
  }

  async removeAdmin(a: AdminRow): Promise<void> {
    const isSelf = a.userId === (this.auth.user()?.sub ?? '');
    const ok = await this.confirm.ask({
      title: 'Remover admin',
      message: isSelf
        ? 'Vas a perder acceso al panel de esta empresa después de removerte. ¿Continuar?'
        : 'Removerá a este usuario como company-admin.',
      danger: true,
    });
    if (!ok) return;
    try {
      await this.api.removeCompanyAdmin({ companyId: this.id, userId: a.userId });
      await this.loadAdmins();
      this.toast.success('Admin removido');
    } catch (e) {
      this.toast.error(humanizeError(e));
    }
  }

  formatDate(iso: string): string {
    try {
      return new Intl.DateTimeFormat('es-EC', {
        timeZone: 'America/Guayaquil',
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      }).format(new Date(iso));
    } catch {
      return iso;
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
