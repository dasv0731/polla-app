import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { ApiService } from '../../core/api/api.service';
import { ToastService } from '../../core/notifications/toast.service';

const TOURNAMENT_ID = 'mundial-2026';

@Component({
  standalone: true,
  selector: 'app-group-create',
  imports: [FormsModule, RouterLink],
  template: `
    <section class="container">
      <a routerLink="/groups" class="back-link">← Mis grupos</a>

      @let g = created();

      @if (g !== null) {
        <article class="invite-code">
          <h1>¡Grupo creado!</h1>
          <p>Comparte este código con tus amigos:</p>
          <strong class="invite-code__code">{{ g.joinCode }}</strong>
          <div class="invite-code__actions">
            <button class="btn btn--primary" (click)="copyLink()">{{ copied() ? 'Copiado ✓' : 'Copiar link' }}</button>
            <a class="btn btn--ghost" [routerLink]="['/groups', g.id]">Ir al grupo</a>
          </div>
        </article>
      } @else {
        <form class="form-card" (ngSubmit)="submit()">
          <h1 class="form-card__title">Crear grupo</h1>
          <p class="form-card__lead">Tus amigos se unen con un código de 6 caracteres.</p>

          <div class="form-card__field">
            <label class="form-card__label" for="grp-name">Nombre del grupo</label>
            <input class="form-card__input" id="grp-name" name="name" type="text"
                   [(ngModel)]="name" placeholder="Mundial 2026 — Amigos" required maxlength="80">
          </div>

          @if (error()) {
            <p class="form-card__hint" style="color: var(--color-error, #c00);">{{ error() }}</p>
          }

          <button class="btn btn--primary form-card__submit" type="submit" [disabled]="loading()">
            {{ loading() ? 'Creando…' : 'Crear grupo' }}
          </button>
        </form>
      }
    </section>
  `,
})
export class GroupCreateComponent {
  private api = inject(ApiService);
  private toast = inject(ToastService);
  private router = inject(Router);

  name = '';
  loading = signal(false);
  error = signal<string | null>(null);
  created = signal<{ id: string; joinCode: string } | null>(null);
  copied = signal(false);

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
      this.error.set((e as Error).message ?? 'No se pudo crear el grupo');
    } finally {
      this.loading.set(false);
    }
  }

  async copyLink() {
    const g = this.created();
    if (!g) return;
    const url = `${location.origin}/groups/join/${g.joinCode}`;
    await navigator.clipboard.writeText(url);
    this.copied.set(true);
    setTimeout(() => this.copied.set(false), 2000);
  }
}
