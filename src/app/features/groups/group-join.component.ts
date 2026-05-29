import { Component, Input, OnInit, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { ApiService } from '../../core/api/api.service';
import { AuthService } from '../../core/auth/auth.service';
import { UserModesService } from '../../core/user/user-modes.service';
import { humanizeError } from '../../core/notifications/domain-errors';
import { ToastService } from '../../core/notifications/toast.service';
import { IconComponent } from '../../shared/ui/icon/icon.component';
import { SkeletonComponent } from '../../shared/ui/skeleton/skeleton.component';

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
  imports: [RouterLink, IconComponent, SkeletonComponent],
  template: `
    <div class="auth-shell">
      <header class="auth-header">
        <div class="auth-header__inner">
          <a routerLink="/home" class="auth-header__logo" aria-label="Golgana">
            <img src="assets/logo-golgana.png" alt="Golgana" width="199" height="98" class="brand-logo">
          </a>
          <a routerLink="/groups" class="auth-header__back">← Mis grupos</a>
        </div>
      </header>

      <main class="auth-main">
        @let g = group();
        @let err = joinError();

        @if (loading()) {
          <article class="join-card" aria-busy="true">
            <p class="join-card__kicker">Validando código…</p>
            <app-skeleton variant="card" />
            <app-skeleton variant="text" [count]="3" />
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
            <div class="join-card__icon"><app-icon name="star" size="lg" /></div>
            <h1 class="join-card__name">{{ g.name }}</h1>
            <p class="join-card__owner">
              Invitado por <strong>{{ '@' + g.ownerHandle }}</strong> · Código <strong>{{ g.joinCode }}</strong>
              <button type="button" class="join-card__copy"
                      (click)="copyCode(g.joinCode)"
                      [attr.aria-label]="'Copiar código ' + g.joinCode">
                <app-icon name="clipboard" size="sm" />
                {{ copied() ? '¡Copiado!' : 'Copiar' }}
              </button>
            </p>

            <div class="join-stats">
              <div class="join-stat"><strong>{{ g.members }}</strong><small>Miembros</small></div>
              <!-- TODO(A6): consume createdAt when previewJoinCode lambda extended -->
              <div class="join-stat"><strong>—</strong><small>Creado</small></div>
              <!-- TODO(A6): hardcoded "WC26" hasta que previewJoinCode exponga tournamentCode -->
              <div class="join-stat"><strong>WC26</strong><small>Torneo</small></div>
            </div>

            <p class="join-card__lead">
              Al unirte verás el ranking interno del grupo, podrás compararte con los otros miembros y compartir bullying sano. Tus picks aparecen anónimos hasta el cierre del partido.
            </p>

            @if (isGroupFull()) {
              <div class="join-error">
                <h4>Grupo lleno</h4>
                <p>
                  Este grupo ya alcanzó su límite de {{ MAX_MEMBERS }} miembros.
                  Pídele al admin que elimine a alguien inactivo o crea un grupo nuevo.
                </p>
              </div>
            } @else if (err !== null) {
              <div class="join-error">
                <h4>No pudimos unirte</h4>
                <p>{{ err }}</p>
              </div>
            }

            <div class="join-card__actions">
              <button class="btn btn--primary btn--lg" type="button"
                      (click)="confirm()"
                      [disabled]="joining() || isGroupFull()">
                {{ joining() ? 'Uniendo…' : 'Unirme al grupo' }}
              </button>
              <a class="btn btn--ghost" routerLink="/groups">Más tarde</a>
            </div>
          </article>
        } @else {
          <article class="join-card">
            <div class="join-error">
              <h4>Código inválido</h4>
              <p>{{ error() ?? 'No encontramos el grupo. El código puede ser incorrecto o haber expirado.' }}</p>
              <p class="join-card__hint">
                Pedile al admin que verifique el código.
                ¿Sigue fallando? Escribinos a
                <a href="mailto:soporte@golgana.net">soporte&#64;golgana.net</a>.
              </p>
            </div>
            <div class="join-card__actions">
              <a class="btn btn--primary" routerLink="/groups">Volver a mis grupos</a>
            </div>
          </article>
        }
      </main>

      <footer class="auth-footer">
        © 2026 Golgana — <a href="https://polla.golgana.net/reglas" target="_blank" rel="noopener noreferrer">Reglas</a> · <a href="https://polla.golgana.net/privacidad" target="_blank" rel="noopener noreferrer">Privacidad</a>
      </footer>
    </div>
  `,
  styles: [`
    :host { display: block; }

    .join-card__copy {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      margin-left: 8px;
      padding: 2px 8px;
      font-size: 12px;
      font-weight: 600;
      color: var(--color-primary-green);
      background: transparent;
      border: 1px solid var(--color-line);
      border-radius: 4px;
      cursor: pointer;
      transition: background .15s, color .15s;
    }
    .join-card__copy:hover {
      background: var(--wf-green-soft);
    }
    .join-card__copy:focus-visible {
      outline: 2px solid var(--color-primary-green);
      outline-offset: 2px;
    }

    .join-card__hint {
      margin-top: 12px;
      font-size: 12px;
      color: var(--color-text-muted);
      line-height: 1.4;
    }
    .join-card__hint a {
      color: var(--color-primary-green);
      text-decoration: underline;
    }
  `],
})
export class GroupJoinComponent implements OnInit {
  @Input() code!: string;

  /** Tope hard del backend para miembros por grupo.
   *  TODO(A6): consume maxMembers from previewJoinCode lambda once extended.
   *  Hoy el preview no lo expone, así que lo mantenemos hardcoded acá. */
  readonly MAX_MEMBERS = 30;

  private api = inject(ApiService);
  private auth = inject(AuthService);
  private userModes = inject(UserModesService);
  private router = inject(Router);
  private toast = inject(ToastService);

  loading = signal(true);
  joining = signal(false);
  error = signal<string | null>(null);
  joinError = signal<string | null>(null);
  alreadyMember = signal(false);
  group = signal<GroupSummary | null>(null);
  copied = signal(false);
  private copyResetTimer?: ReturnType<typeof setTimeout>;

  /** Bloquea el CTA si el grupo ya alcanzó el límite. Solo aplica cuando
   *  no sos miembro todavía — si ya estás dentro y el grupo está full,
   *  no es bloqueante (el "Ir al grupo" branch atrapa primero). */
  isGroupFull = computed(() => {
    const g = this.group();
    return !!g && !this.alreadyMember() && g.members >= this.MAX_MEMBERS;
  });

  ngOnInit() {
    // El authGuard ya redirige a `/login?returnUrl=/groups/join/CODE` si no
    // hay sesión, y login/register propagan returnUrl al onboarding. Cuando
    // llegamos acá garantizado hay user — un branch de fallback paranoico
    // por si el guard fallara en SSR o en un edge case.
    if (!this.auth.user()) {
      void this.router.navigate(['/login'], {
        queryParams: { returnUrl: '/groups/join/' + this.code },
      });
      return;
    }
    void this.loadGroup();
  }

  private async loadGroup() {
    try {
      // Lambda `previewJoinCode` hace lookup + permisos server-side. Antes
      // hacíamos getInviteCode + getGroup + groupMembers + getUser en el front,
      // pero esto requería que InviteCode fuese listable por authenticated
      // (data leak: cualquier user veía todos los códigos).
      const res = await this.api.previewJoinCode(this.code);
      const data = res.data;
      if (!data || !data.ok) {
        this.error.set(data?.message ?? 'Código inválido o expirado');
        return;
      }

      this.group.set({
        id: data.groupId!,
        name: data.groupName!,
        joinCode: this.code,                  // el user ya tiene el código (vino por URL)
        ownerHandle: data.ownerHandle ?? '—',
        members: data.memberCount,
        // TODO(A6): consume createdAt when previewJoinCode lambda extended
        createdAt: '',
      });
      this.alreadyMember.set(data.alreadyMember);
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
      if (groupId) {
        // Refresh cache de grupos para que aparezca en el dropdown
        const userId = this.auth.user()?.sub;
        if (userId) await this.userModes.load(userId);
        void this.router.navigate(['/groups', groupId]);
      } else {
        this.joinError.set('No pudimos unirte (respuesta vacía)');
      }
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

  /** Copia el código al clipboard. Muestra feedback visual ("¡Copiado!")
   *  por 2s y un toast por accesibilidad. */
  async copyCode(code: string) {
    try {
      await navigator.clipboard.writeText(code);
      this.copied.set(true);
      this.toast.success('Código copiado al portapapeles.');
      if (this.copyResetTimer) clearTimeout(this.copyResetTimer);
      this.copyResetTimer = setTimeout(() => this.copied.set(false), 2000);
    } catch {
      // Fallback: no clipboard API disponible (insecure context, navegador antiguo).
      this.toast.error('No se pudo copiar. Selecciona el código manualmente.');
    }
  }
}
