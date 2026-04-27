import { Component, Input, OnInit, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { ApiService } from '../../core/api/api.service';
import { AuthService } from '../../core/auth/auth.service';
import { humanizeError } from '../../core/notifications/domain-errors';

interface GroupSummary {
  id: string;
  name: string;
  joinCode: string;
  ownerHandle: string;
  members: number;
  createdAt: string;
}

@Component({
  standalone: true,
  selector: 'app-group-join',
  imports: [RouterLink],
  template: `
    <div class="auth-shell">
      <header class="auth-header">
        <div class="auth-header__inner">
          <a routerLink="/picks" class="auth-header__logo" aria-label="Polla Mundial 2026">
            <img src="assets/logo-golgana.png" alt="Golgana">
          </a>
          <a routerLink="/groups" class="auth-header__back">← Mis grupos</a>
        </div>
      </header>

      <main class="auth-main">
        @let g = group();
        @let err = joinError();

        @if (loading()) {
          <article class="join-card">
            <p class="join-card__lead">Validando código…</p>
          </article>
        } @else if (alreadyMember()) {
          <article class="join-card">
            <p class="join-card__kicker">Invitación a un grupo</p>
            <div class="join-error">
              <h4>Ya eres miembro</h4>
              <p>Ya estás dentro de "{{ group()?.name }}". No necesitas volver a unirte.</p>
            </div>
            <p class="join-card__owner">Si no recuerdas haberte unido, este link puede ser de hace meses.</p>
            <div class="join-card__actions">
              <a class="btn btn--primary" [routerLink]="['/groups', group()?.id]">Ir al grupo</a>
              <a class="btn btn--ghost" routerLink="/groups">Ver mis grupos</a>
            </div>
          </article>
        } @else if (g !== null) {
          <article class="join-card">
            <p class="join-card__kicker">Invitación a un grupo</p>
            <div class="join-card__icon">★</div>
            <h1 class="join-card__name">{{ g.name }}</h1>
            <p class="join-card__owner">
              Invitado por <strong>{{ '@' + g.ownerHandle }}</strong> · Código <strong>{{ g.joinCode }}</strong>
            </p>

            <div class="join-stats">
              <div class="join-stat"><strong>{{ g.members }}</strong><small>Miembros</small></div>
              <div class="join-stat"><strong>{{ formatDate(g.createdAt) }}</strong><small>Creado</small></div>
              <div class="join-stat"><strong>WC26</strong><small>Torneo</small></div>
            </div>

            <p class="join-card__lead">
              Al unirte verás el ranking interno del grupo, podrás compararte con los otros miembros y compartir bullying sano. Tus picks aparecen anónimos hasta el cierre del partido.
            </p>

            @if (err !== null) {
              <div class="join-error">
                <h4>No pudimos unirte</h4>
                <p>{{ err }}</p>
              </div>
            }

            <div class="join-card__actions">
              <button class="btn btn--primary btn--lg" type="button" (click)="confirm()" [disabled]="joining()">
                {{ joining() ? 'Uniendo…' : 'Unirme al grupo' }}
              </button>
              <a class="btn btn--ghost" routerLink="/groups">Rechazar</a>
            </div>
          </article>
        } @else {
          <article class="join-card">
            <div class="join-error">
              <h4>Código inválido</h4>
              <p>{{ error() ?? 'No encontramos el grupo. El código puede ser incorrecto o haber expirado.' }}</p>
            </div>
            <div class="join-card__actions">
              <a class="btn btn--primary" routerLink="/groups">Volver a mis grupos</a>
            </div>
          </article>
        }
      </main>

      <footer class="auth-footer">
        © 2026 Golgana — <a href="#">Reglas</a> · <a href="#">Privacidad</a>
      </footer>
    </div>
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
  joinError = signal<string | null>(null);
  alreadyMember = signal(false);
  group = signal<GroupSummary | null>(null);

  ngOnInit() {
    if (!this.auth.user()) {
      sessionStorage.setItem('pendingJoin', this.code);
      void this.router.navigate(['/register']);
      return;
    }
    void this.loadGroup();
  }

  private async loadGroup() {
    try {
      const invite = await this.api.getInviteCode(this.code);
      if (!invite.data) {
        this.error.set('Código inválido o expirado');
        return;
      }
      const groupId = invite.data.groupId;
      const [grp, members] = await Promise.all([
        this.api.getGroup(groupId),
        this.api.groupMembers(groupId),
      ]);
      if (!grp.data) {
        this.error.set('El grupo ya no existe');
        return;
      }

      // Resolve admin handle for the 'Invitado por' line
      let ownerHandle = grp.data.adminUserId.slice(0, 6);
      try {
        const owner = await this.api.getUser(grp.data.adminUserId);
        if (owner.data?.handle) ownerHandle = owner.data.handle;
      } catch {
        // ignore — fallback to id slice
      }

      // Detect already-member state
      const userId = this.auth.user()?.sub;
      const memberCount = (members.data ?? []).length;
      const isMember = (members.data ?? []).some((m) => m.userId === userId);

      this.group.set({
        id: groupId,
        name: grp.data.name,
        joinCode: grp.data.joinCode,
        ownerHandle,
        members: memberCount,
        createdAt: grp.data.createdAt,
      });
      this.alreadyMember.set(isMember);
    } catch (e) {
      this.error.set(humanizeError(e));
    } finally {
      this.loading.set(false);
    }
  }

  async confirm() {
    this.joinError.set(null);
    this.joining.set(true);
    try {
      const res = await this.api.joinGroup(this.code);
      // Amplify Gen 2 returns { data, errors? }; GraphQL-level errors come
      // through `errors`, not as throws — same gotcha as createGroup.
      if (res.errors && res.errors.length > 0) {
        const msg = res.errors[0]!.message ?? 'Error desconocido';
        // eslint-disable-next-line no-console
        console.error('[joinGroup] GraphQL errors:', res.errors);
        if (msg.toUpperCase().includes('ALREADY_MEMBER')) {
          this.alreadyMember.set(true);
        } else {
          this.joinError.set(humanizeError(new Error(msg)));
        }
        return;
      }
      const groupId = res.data?.groupId ?? this.group()?.id;
      if (groupId) void this.router.navigate(['/groups', groupId]);
      else this.joinError.set('No pudimos unirte (respuesta vacía)');
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('[joinGroup] threw:', e);
      if (e instanceof Error && e.message?.toUpperCase() === 'ALREADY_MEMBER') {
        this.alreadyMember.set(true);
      } else {
        this.joinError.set(humanizeError(e));
      }
    } finally {
      this.joining.set(false);
    }
  }

  formatDate(iso: string): string {
    try {
      return new Date(iso).toLocaleDateString('es-EC', { day: '2-digit', month: 'short' });
    } catch {
      return '—';
    }
  }
}
