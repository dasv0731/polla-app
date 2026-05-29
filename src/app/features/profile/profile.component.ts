import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { ApiService } from '../../core/api/api.service';
import { AuthService } from '../../core/auth/auth.service';
import { ToastService } from '../../core/notifications/toast.service';
import { RedeemModalService } from '../../core/sponsors/redeem-modal.service';
import { UserAvatarComponent } from '../../shared/user-avatar/user-avatar.component';
import { EditProfileModalComponent } from './edit-profile-modal.component';
import { PreferencesModalComponent } from './preferences-modal.component';
import { IconComponent } from '../../shared/ui/icon/icon.component';

const TOURNAMENT_ID = 'mundial-2026';
const TOTAL_SPECIAL_PICKS = 3; // Campeón, Subcampeón, Revelación

interface Totals {
  points: number;
  exactCount: number;
  resultCount: number;
  globalRank: number | null;
}

@Component({
  standalone: true,
  selector: 'app-profile',
  imports: [
    RouterLink, UserAvatarComponent,
    EditProfileModalComponent, PreferencesModalComponent,
    IconComponent,
  ],
  template: `
    @let u = user();

    @if (u !== null) {
      <section class="page">

        <!-- Hero del perfil compacto: avatar + handle + bandera.
             email y "miembro desde" se ven en el modal Editar perfil
             (compactación post walkthrough doc 14). -->
        <header class="profile-hero">
          <div class="profile-hero__top">
            <app-user-avatar
              [sub]="u.sub"
              [handle]="u.handle"
              [avatarKey]="u.avatarKey"
              size="lg" />
            <div class="profile-hero__name-block">
              <h1 class="profile-hero__h1">
                @if (u.country) {
                  <span class="fi fi-{{ u.country.toLowerCase() }} profile-hero__flag"
                        aria-label="País"></span>
                }
                @if (u.name) {
                  <span>{{ u.name }}</span>
                  <span class="profile-hero__handle-mute" translate="no">(&#64;{{ u.handle }})</span>
                } @else {
                  <span translate="no">{{ '@' + u.handle }}</span>
                }
              </h1>
              @if (u.bio) {
                <p class="profile-hero__bio">{{ u.bio }}</p>
              }
              <button type="button" class="btn-wf btn-wf--sm profile-hero__edit"
                      (click)="editProfile()">
                Editar perfil
              </button>
            </div>
          </div>
          <div class="profile-hero__stats">
            <div class="profile-stat">
              <div class="num">{{ totals().points }}</div>
              <div class="lbl">Pts</div>
            </div>
            <div class="profile-stat">
              <div class="num">{{ totals().exactCount }}</div>
              <div class="lbl">Exactos</div>
            </div>
            <div class="profile-stat">
              <div class="num">{{ totals().resultCount }}</div>
              <div class="lbl">Result.</div>
            </div>
            <div class="profile-stat">
              <div class="num">{{ totals().globalRank ? '#' + totals().globalRank : '—' }}</div>
              <div class="lbl">Global</div>
            </div>
          </div>
        </header>

        <!-- 4 columnas: Mi juego / Comunicaciones / Cuenta / Sponsors.
             Notificaciones se mueve a Comunicaciones por categoría correcta. -->
        <div class="profile-grid profile-grid--4col">

          <!-- Columna 1: Mi juego — todos <a> (navegación) -->
          <div>
            <section class="profile-section profile-section--first">
              <h2 class="profile-section__title">Mi juego</h2>
              <div class="profile-list">

                <a routerLink="/mis-comodines" class="profile-list-item">
                  <span class="profile-list-item__icon" aria-hidden="true">
                    <app-icon name="gift" size="md" />
                  </span>
                  <div class="profile-list-item__body">
                    <div class="profile-list-item__title">Mis comodines</div>
                    <div class="profile-list-item__sub">{{ comodinesSub() }}</div>
                  </div>
                  @if (comodinesPending() > 0) {
                    <span class="pill pill--solid">!</span>
                  } @else if (comodinesAvailable() > 0) {
                    <span class="pill pill--green">{{ comodinesAvailable() }}</span>
                  }
                </a>

                <a routerLink="/profile/special-picks" class="profile-list-item">
                  <span class="profile-list-item__icon" aria-hidden="true">
                    <app-icon name="star" size="md" />
                  </span>
                  <div class="profile-list-item__body">
                    <div class="profile-list-item__title">Picks especiales</div>
                    <div class="profile-list-item__sub">Campeón, subcampeón, revelación</div>
                  </div>
                  <span class="pill">{{ specialPicksDone() }}/{{ totalSpecial }}</span>
                </a>

              </div>
            </section>
          </div>

          <!-- Columna 2: Comunicaciones — todos <a> (navegación) -->
          <div>
            <section class="profile-section profile-section--first">
              <h2 class="profile-section__title">Comunicaciones</h2>
              <div class="profile-list">

                <a routerLink="/notificaciones" class="profile-list-item">
                  <span class="profile-list-item__icon" aria-hidden="true">
                    <app-icon name="bell" size="md" />
                  </span>
                  <div class="profile-list-item__body">
                    <div class="profile-list-item__title">Notificaciones</div>
                    <div class="profile-list-item__sub">
                      {{ unreadNotifs() === 0 ? 'Al día' : unreadNotifs() + ' sin leer' }}
                    </div>
                  </div>
                  @if (unreadNotifs() > 0) {
                    <span class="pill pill--solid">{{ unreadNotifs() }}</span>
                  }
                </a>

              </div>
            </section>
          </div>

          <!-- Columna 3: Cuenta — todos <button> (acciones) -->
          <div>
            <section class="profile-section profile-section--first">
              <h2 class="profile-section__title">Cuenta</h2>
              <div class="profile-list">

                <button type="button" class="profile-list-item"
                        (click)="openPasswordChange()">
                  <span class="profile-list-item__icon" aria-hidden="true">
                    <app-icon name="lock" size="md" />
                  </span>
                  <div class="profile-list-item__body">
                    <div class="profile-list-item__title">Cambiar contraseña</div>
                  </div>
                  <span class="profile-list-item__chev" aria-hidden="true">›</span>
                </button>

                <button type="button" class="profile-list-item"
                        (click)="openPreferences()">
                  <span class="profile-list-item__icon" aria-hidden="true">
                    <app-icon name="settings" size="md" />
                  </span>
                  <div class="profile-list-item__body">
                    <div class="profile-list-item__title">Preferencias</div>
                  </div>
                  <span class="profile-list-item__chev" aria-hidden="true">›</span>
                </button>

                <button type="button" class="profile-list-item profile-list-item--danger"
                        (click)="logout()">
                  <span class="profile-list-item__icon" aria-hidden="true">
                    <app-icon name="logout" size="md" />
                  </span>
                  <div class="profile-list-item__body">
                    <div class="profile-list-item__title">Cerrar sesión</div>
                  </div>
                </button>

              </div>
            </section>
          </div>

          <!-- Columna 4: Sponsors — visualmente reducido (less padding, smaller heading) -->
          <div>
            <section class="profile-section profile-section--first profile-section--compact">
              <h2 class="profile-section__title profile-section__title--sm">Sponsors</h2>
              <div class="profile-list">
                <button type="button" class="profile-list-item"
                        (click)="openRedeem()">
                  <span class="profile-list-item__icon" aria-hidden="true">
                    <app-icon name="gift" size="md" />
                  </span>
                  <div class="profile-list-item__body">
                    <div class="profile-list-item__title">Canjear código</div>
                    <div class="profile-list-item__sub">¿Tienes código de sponsor?</div>
                  </div>
                  <span class="profile-list-item__chev" aria-hidden="true">›</span>
                </button>
              </div>
            </section>
          </div>

        </div>

      </section>
    } @else {
      <p class="profile-loading">
        Cargando perfil…
      </p>
    }

    @if (editProfileOpen()) {
      <app-edit-profile-modal
        [initialSection]="editProfileInitialSection()"
        (closed)="closeEditProfile()" />
    }
    @if (preferencesOpen()) {
      <app-preferences-modal (closed)="closePreferences()" />
    }
  `,
  styles: [`
    :host { display: block; }
    .profile-hero__h1 {
      display: flex;
      align-items: center;
      gap: var(--space-sm);
      flex-wrap: wrap;
      color: var(--color-primary-black);
      margin: 0;
    }
    .profile-hero__flag {
      width: 28px;
      height: 21px;
      border-radius: 3px;
      box-shadow: 0 0 0 1px rgba(0,0,0,.08);
    }
    .profile-hero__handle-mute {
      color: var(--color-text-muted);
      font-weight: normal;
    }
    .profile-hero__bio {
      margin: var(--space-sm) 0 0;
      color: var(--color-text-secondary, var(--color-text-muted));
      font-size: var(--fs-sm);
      line-height: var(--lh-body);
      max-width: 480px;
    }

    /* 4-column grid layout (vs prior 2-column).
       Falls back to fewer columns on narrower viewports. */
    .profile-grid--4col {
      display: grid;
      gap: var(--space-md);
      grid-template-columns: repeat(4, minmax(0, 1fr));
    }
    @media (max-width: 1100px) {
      .profile-grid--4col { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    }
    @media (max-width: 600px) {
      .profile-grid--4col { grid-template-columns: 1fr; }
    }

    /* Sponsors section: reduced visual weight per walkthrough doc 14. */
    .profile-section--compact {
      padding: var(--space-sm) !important;
    }
    .profile-section__title--sm {
      font-size: var(--fs-sm);
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: var(--color-text-muted);
    }

    .profile-loading {
      padding: 48px;
      text-align: center;
      color: var(--color-text-muted);
    }
  `],
})
export class ProfileComponent implements OnInit {
  private auth = inject(AuthService);
  private api = inject(ApiService);
  private toast = inject(ToastService);
  private router = inject(Router);
  private redeemModal = inject(RedeemModalService);

  readonly totalSpecial = TOTAL_SPECIAL_PICKS;

  user = computed(() => this.auth.user());
  totals = signal<Totals>({ points: 0, exactCount: 0, resultCount: 0, globalRank: null });
  daysUntilLock = signal<number | null>(null);

  // Counts del listado "Mi juego"
  comodinesAvailable = signal(0);  // status === UNASSIGNED
  comodinesPending = signal(0);    // status === PENDING_TYPE_CHOICE
  specialPicksDone = signal(0);    // 0..3
  unreadNotifs = signal(0);

  comodinesSub = computed(() => {
    const a = this.comodinesAvailable();
    const p = this.comodinesPending();
    if (a === 0 && p === 0) return 'Sin comodines disponibles';
    const parts: string[] = [];
    if (a > 0) parts.push(`${a} ${a === 1 ? 'disponible' : 'disponibles'}`);
    if (p > 0) parts.push(`${p} ${p === 1 ? 'pendiente' : 'pendientes'}`);
    return parts.join(' · ');
  });

  avatar = computed(() => (this.user()?.handle?.[0] ?? '?').toUpperCase());

  /** Abre el RedeemModal global compartido con sidebar + comodines-list. */
  openRedeem() {
    this.redeemModal.open();
  }

  async ngOnInit() {
    const u = this.user();
    if (!u) return;
    try {
      const [t, leaderboard, tournament] = await Promise.all([
        this.api.myTotal(u.sub, TOURNAMENT_ID),
        this.api.listLeaderboard(TOURNAMENT_ID, 200),
        this.api.getTournament(TOURNAMENT_ID),
      ]);

      const myTotal = (t.data ?? [])[0];
      const sorted = (leaderboard.data ?? []).sort((a, b) => (b.points ?? 0) - (a.points ?? 0));
      const rankIdx = sorted.findIndex((r) => r.userId === u.sub);

      this.totals.set({
        points: myTotal?.points ?? 0,
        exactCount: myTotal?.exactCount ?? 0,
        resultCount: myTotal?.resultCount ?? 0,
        globalRank: rankIdx >= 0 ? rankIdx + 1 : null,
      });

      if (tournament.data?.specialsLockAt) {
        const lockMs = Date.parse(tournament.data.specialsLockAt);
        const days = Math.max(0, Math.ceil((lockMs - Date.now()) / 86_400_000));
        this.daysUntilLock.set(days);
      }
    } catch {
      // datos parciales son OK; los signals quedan en su default
    }

    // Counts adicionales (best-effort, no bloquean el render del perfil)
    void this.loadComodineCounts(u.sub);
    void this.loadSpecialPicks(u.sub);
    void this.loadUnreadNotifs(u.sub);
  }

  private async loadComodineCounts(userId: string) {
    try {
      const res = await this.api.listMyComodines(userId, TOURNAMENT_ID);
      const list = (res.data ?? []) as Array<{ status: string }>;
      let a = 0, p = 0;
      for (const c of list) {
        if (c.status === 'UNASSIGNED') a++;
        else if (c.status === 'PENDING_TYPE_CHOICE') p++;
      }
      this.comodinesAvailable.set(a);
      this.comodinesPending.set(p);
    } catch {
      /* ignore */
    }
  }

  private async loadSpecialPicks(userId: string) {
    try {
      // mySpecialPicks devuelve los picks de specialPick del torneo. Cada uno
      // representa un slot (CHAMPION/RUNNER_UP/DARK_HORSE). Contamos los
      // que existen para mostrar el progreso 0..3.
      // Preferimos COMPLETE; si el user solo tiene SIMPLE, igual cuenta.
      const [completeRes, simpleRes] = await Promise.all([
        this.api.mySpecialPicks(TOURNAMENT_ID, 'COMPLETE'),
        this.api.mySpecialPicks(TOURNAMENT_ID, 'SIMPLE'),
      ]);
      const types = new Set<string>();
      for (const p of (completeRes.data ?? []) as Array<{ type: string; userId: string }>) {
        if (p.userId === userId) types.add(p.type);
      }
      for (const p of (simpleRes.data ?? []) as Array<{ type: string; userId: string }>) {
        if (p.userId === userId) types.add(p.type);
      }
      this.specialPicksDone.set(Math.min(types.size, TOTAL_SPECIAL_PICKS));
    } catch {
      /* ignore */
    }
  }

  private async loadUnreadNotifs(userId: string) {
    try {
      const res = await this.api.listMyNotifications(userId, 100);
      const items = (res.data ?? []) as Array<{ readAt: string | null }>;
      this.unreadNotifs.set(items.filter((n) => !n.readAt).length);
    } catch {
      /* ignore */
    }
  }

  editProfileOpen = signal(false);
  /** Si !== null, el modal de edit-profile abre con esa sección expandida.
   *  Usado por el item "Cambiar contraseña" del listado para abrir directo
   *  el form de password sin requerir click adicional. */
  editProfileInitialSection = signal<'password' | null>(null);
  preferencesOpen = signal(false);

  editProfile() {
    this.editProfileInitialSection.set(null);
    this.editProfileOpen.set(true);
  }

  /** Disparado por el item "Cambiar contraseña" del listado de cuenta.
   *  Antes apuntaba a /forgot-password (flow Cognito de reset por email);
   *  ahora reusa el modal de edit-profile que ya tiene cambio de password
   *  inline (oldPassword + newPassword sin email link). */
  openPasswordChange() {
    this.editProfileInitialSection.set('password');
    this.editProfileOpen.set(true);
  }

  closeEditProfile() {
    this.editProfileOpen.set(false);
  }

  openPreferences() {
    this.preferencesOpen.set(true);
  }

  closePreferences() {
    this.preferencesOpen.set(false);
  }

  async logout() {
    await this.auth.logout();
    void this.router.navigate(['/login']);
  }
}
