import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { ApiService } from '../../core/api/api.service';
import { AuthService } from '../../core/auth/auth.service';
import { ToastService } from '../../core/notifications/toast.service';
import { UserAvatarComponent } from '../../shared/user-avatar/user-avatar.component';
import { EditProfileModalComponent } from './edit-profile-modal.component';
import { flagFromCountryCode } from '../../shared/util/countries';

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
  imports: [RouterLink, UserAvatarComponent, EditProfileModalComponent],
  template: `
    @let u = user();

    @if (u !== null) {
      <section class="page">

        <!-- Hero del perfil -->
        <header class="profile-hero">
          <div class="profile-hero__top">
            <app-user-avatar
              [sub]="u.sub"
              [handle]="u.handle"
              [avatarKey]="u.avatarKey"
              size="lg" />
            <div class="profile-hero__name-block">
              <h1>
                @if (countryFlag()) { <span aria-label="País" style="margin-right: 6px;">{{ countryFlag() }}</span> }
                {{ '@' + u.handle }}
              </h1>
              <div class="profile-hero__meta">
                {{ u.email }}
                @if (memberSince()) { · miembro desde {{ memberSince() }} }
              </div>
              @if (u.bio) {
                <p class="profile-hero__bio" style="margin: 8px 0 0; color: var(--wf-ink-2); font-size: 13px; line-height: 1.4; max-width: 480px;">{{ u.bio }}</p>
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

        <div class="profile-grid">

          <!-- Columna 1: Mi juego -->
          <div>
            <section class="profile-section profile-section--first">
              <h2 class="profile-section__title">Mi juego</h2>
              <div class="profile-list">

                <a routerLink="/mis-comodines" class="profile-list-item">
                  <span class="profile-list-item__icon">🎁</span>
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
                  <span class="profile-list-item__icon">⭐</span>
                  <div class="profile-list-item__body">
                    <div class="profile-list-item__title">Picks especiales</div>
                    <div class="profile-list-item__sub">Campeón, subcampeón, revelación</div>
                  </div>
                  <span class="pill">{{ specialPicksDone() }}/{{ totalSpecial }}</span>
                </a>

                <a routerLink="/notificaciones" class="profile-list-item">
                  <span class="profile-list-item__icon">🔔</span>
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

          <!-- Columna 2: Sponsors + Cuenta -->
          <div>
            <section class="profile-section profile-section--first">
              <h2 class="profile-section__title">Sponsors</h2>
              <a routerLink="/mis-comodines" class="profile-sponsor"
                 style="text-decoration:none;color:inherit;">
                <div class="profile-sponsor__body">
                  <div class="profile-sponsor__title">🎁 Canjear código</div>
                  <div class="profile-sponsor__sub">¿Tienes código de sponsor?</div>
                </div>
                <span class="btn-wf btn-wf--sm btn-wf--ink" style="text-decoration:none;">
                  Canjear →
                </span>
              </a>
            </section>

            <section class="profile-section">
              <h2 class="profile-section__title">Cuenta</h2>
              <div class="profile-list">

                <a routerLink="/forgot-password" class="profile-list-item">
                  <span class="profile-list-item__icon">🔒</span>
                  <div class="profile-list-item__body">
                    <div class="profile-list-item__title">Cambiar contraseña</div>
                  </div>
                  <span class="profile-list-item__chev">›</span>
                </a>

                <button type="button" class="profile-list-item"
                        (click)="comingSoon('Preferencias')">
                  <span class="profile-list-item__icon">⚙</span>
                  <div class="profile-list-item__body">
                    <div class="profile-list-item__title">Preferencias</div>
                  </div>
                  <span class="profile-list-item__chev">›</span>
                </button>

                <button type="button" class="profile-list-item"
                        (click)="comingSoon('Ayuda')">
                  <span class="profile-list-item__icon">❓</span>
                  <div class="profile-list-item__body">
                    <div class="profile-list-item__title">Ayuda</div>
                  </div>
                  <span class="profile-list-item__chev">›</span>
                </button>

                @if (daysUntilLock() !== null && daysUntilLock()! === 0) {
                  <!-- Si el torneo ya empezó, no tiene sentido mostrar "días para cierre" arriba.
                       Si querés agregar atajo a admin / soporte, va acá. -->
                }

                <button type="button" class="profile-list-item profile-list-item--danger"
                        (click)="logout()">
                  <span class="profile-list-item__icon">↩</span>
                  <div class="profile-list-item__body">
                    <div class="profile-list-item__title">Cerrar sesión</div>
                  </div>
                </button>

              </div>
            </section>
          </div>

        </div>

      </section>
    } @else {
      <p style="padding:48px;text-align:center;color:var(--wf-ink-3);">
        Cargando perfil…
      </p>
    }

    @if (editProfileOpen()) {
      <app-edit-profile-modal (closed)="closeEditProfile()" />
    }
  `,
})
export class ProfileComponent implements OnInit {
  private auth = inject(AuthService);
  private api = inject(ApiService);
  private toast = inject(ToastService);
  private router = inject(Router);

  readonly totalSpecial = TOTAL_SPECIAL_PICKS;

  user = computed(() => this.auth.user());
  totals = signal<Totals>({ points: 0, exactCount: 0, resultCount: 0, globalRank: null });
  memberSince = signal<string | null>(null);
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
  countryFlag = computed(() => flagFromCountryCode(this.user()?.country));

  async ngOnInit() {
    const u = this.user();
    if (!u) return;
    try {
      const [t, leaderboard, profile, tournament] = await Promise.all([
        this.api.myTotal(u.sub, TOURNAMENT_ID),
        this.api.listLeaderboard(TOURNAMENT_ID, 200),
        this.api.getUser(u.sub),
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

      if (profile.data?.createdAt) {
        this.memberSince.set(
          new Date(profile.data.createdAt).toLocaleDateString('es-EC', {
            month: 'short', year: 'numeric',
          }),
        );
      }

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

  editProfile() {
    this.editProfileOpen.set(true);
  }

  closeEditProfile() {
    this.editProfileOpen.set(false);
  }

  comingSoon(label: string) {
    this.toast.info(`${label} — próximamente`);
  }

  async logout() {
    await this.auth.logout();
    void this.router.navigate(['/login']);
  }
}
