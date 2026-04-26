import { Component, Input, OnInit, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { ApiService } from '../../core/api/api.service';
import { AuthService } from '../../core/auth/auth.service';

@Component({
  standalone: true,
  selector: 'app-group-join',
  template: `
    <section class="container">
      @let name = groupName();
      @let err = error();

      @if (loading()) {
        <p>Validando código…</p>
      } @else if (name !== null) {
        <article class="join-confirm">
          <h1>Unirte al grupo</h1>
          <p>Vas a unirte al grupo <strong>{{ name }}</strong>.</p>
          <button class="btn btn--primary" (click)="confirm()" [disabled]="joining()">
            {{ joining() ? 'Uniendo…' : 'Sí, unirme' }}
          </button>
        </article>
      } @else if (err !== null) {
        <p class="form-card__hint" style="color: var(--color-error, #c00);">{{ err }}</p>
      }
    </section>
  `,
})
export class GroupJoinComponent implements OnInit {
  @Input() code!: string;

  private api = inject(ApiService);
  private auth = inject(AuthService);
  private router = inject(Router);

  loading = signal(true);
  joining = signal(false);
  error = signal<string | null>(null);
  groupName = signal<string | null>(null);
  groupId = signal<string | null>(null);

  async ngOnInit() {
    if (!this.auth.user()) {
      sessionStorage.setItem('pendingJoin', this.code);
      void this.router.navigate(['/register']);
      return;
    }
    try {
      const invite = await this.api.getInviteCode(this.code);
      if (!invite.data) {
        this.error.set('Código inválido o expirado');
        return;
      }
      this.groupId.set(invite.data.groupId);
      const grp = await this.api.getGroup(invite.data.groupId);
      this.groupName.set(grp.data?.name ?? 'Grupo');
    } catch (e) {
      this.error.set((e as Error).message ?? 'No se pudo validar el código');
    } finally {
      this.loading.set(false);
    }
  }

  async confirm() {
    this.joining.set(true);
    try {
      await this.api.joinGroup(this.code);
      void this.router.navigate(['/groups', this.groupId()]);
    } catch (e) {
      this.error.set((e as Error).message ?? 'No se pudo unir al grupo');
    } finally {
      this.joining.set(false);
    }
  }
}
