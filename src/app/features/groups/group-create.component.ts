import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { ApiService } from '../../core/api/api.service';
import { ToastService } from '../../core/notifications/toast.service';
import { humanizeError } from '../../core/notifications/domain-errors';

const TOURNAMENT_ID = 'mundial-2026';

@Component({
  standalone: true,
  selector: 'app-group-create',
  imports: [FormsModule, RouterLink],
  template: `
    <header class="page-header">
      <small><a routerLink="/groups" style="color: var(--color-primary-green);">← Mis grupos</a></small>
      <h1>Crear grupo</h1>
    </header>

    <main class="container-app">
      <!-- STAGE 1: Form -->
      <section class="stage">
        <span class="stage-mark stage-mark--1">Paso 1 · Datos del grupo</span>

        @if (created() === null) {
          <form class="form-card" (ngSubmit)="submit()">
            <h2 class="form-card__title">Define tu grupo</h2>
            <p class="form-card__lead">Solo necesitas un nombre. El torneo se asigna automáticamente al Mundial 2026.</p>

            <div class="form-card__field">
              <label class="form-card__label" for="grp-name">Nombre del grupo</label>
              <input class="form-card__input" id="grp-name" name="name" type="text"
                     [(ngModel)]="name" placeholder="Ej. Oficina Q1 2026"
                     required minlength="3" maxlength="40">
              <span class="form-card__hint">3-40 caracteres. Visible solo para los miembros del grupo.</span>
            </div>

            <div class="form-card__field">
              <label class="form-card__label" for="grp-tournament">Torneo</label>
              <select class="form-card__select" id="grp-tournament" disabled>
                <option>Mundial FIFA 2026 · 11 jun — 19 jul</option>
              </select>
              <span class="form-card__hint">El único torneo activo. Otros torneos vienen en Fase 2.</span>
            </div>

            @if (error()) {
              <p class="form-card__hint" style="color: var(--color-lost);">{{ error() }}</p>
            }

            <button class="btn btn--primary form-card__submit" type="submit" [disabled]="loading()">
              {{ loading() ? 'Creando…' : 'Crear grupo' }}
            </button>

            <p class="form-card__alt">
              Al crear el grupo te asignamos automáticamente como <strong>admin</strong>.
            </p>
          </form>
        } @else {
          <article class="form-card" style="text-align: center;">
            <h2 class="form-card__title">¡Grupo creado!</h2>
            <p class="form-card__lead">Ya puedes invitar a tus amigos.</p>
          </article>
        }
      </section>

      <!-- STAGE 2: Post-create con invite-code -->
      @if (created(); as g) {
        <section class="stage">
          <span class="stage-mark stage-mark--2">Paso 2 · Comparte con tus amigos</span>

          <article class="invite-code">
            <span class="invite-code__label">Tu código de invitación</span>
            <span class="invite-code__value">{{ g.joinCode }}</span>
            <p class="invite-code__url">{{ inviteUrl() }}</p>
            <div class="invite-code__actions">
              <button class="btn btn--primary btn--sm" type="button" (click)="copy(g.joinCode, 'code')">
                {{ copiedKind() === 'code' ? 'Copiado ✓' : '📋 Copiar código' }}
              </button>
              <button class="btn btn--primary btn--sm" type="button" (click)="copy(inviteUrl(), 'link')">
                {{ copiedKind() === 'link' ? 'Copiado ✓' : '🔗 Copiar link' }}
              </button>
              <a class="btn btn--ghost btn--sm" [routerLink]="['/groups', g.id, 'invite']">📧 Email</a>
            </div>
          </article>

          <p style="text-align: center; color: var(--color-text-muted); font-size: var(--fs-sm);">
            ¿Listo? <a class="link-green" [routerLink]="['/groups', g.id]">Ir al grupo →</a>
          </p>
        </section>
      }
    </main>
  `,
})
export class GroupCreateComponent {
  private api = inject(ApiService);
  private toast = inject(ToastService);

  name = '';
  loading = signal(false);
  error = signal<string | null>(null);
  created = signal<{ id: string; joinCode: string } | null>(null);
  copiedKind = signal<'code' | 'link' | null>(null);

  inviteUrl = computed(() => {
    const g = this.created();
    return g ? `${location.origin}/groups/join/${g.joinCode}` : '';
  });

  async submit() {
    if (!this.name.trim()) return;
    this.loading.set(true);
    this.error.set(null);
    try {
      const res = await this.api.createGroup(this.name.trim(), TOURNAMENT_ID);
      if (res.data) {
        this.created.set({ id: res.data.id, joinCode: res.data.joinCode });
        this.toast.success('Grupo creado');
      } else {
        this.error.set('No se pudo crear el grupo');
      }
    } catch (e) {
      this.error.set(humanizeError(e));
    } finally {
      this.loading.set(false);
    }
  }

  async copy(value: string, kind: 'code' | 'link') {
    await navigator.clipboard.writeText(value);
    this.copiedKind.set(kind);
    setTimeout(() => this.copiedKind.set(null), 2000);
  }
}
