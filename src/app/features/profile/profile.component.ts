import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { ApiService } from '../../core/api/api.service';
import { AuthService } from '../../core/auth/auth.service';
import { ToastService } from '../../core/notifications/toast.service';

const TOURNAMENT_ID = 'mundial-2026';

interface Totals {
  points: number;
  exactCount: number;
  resultCount: number;
  globalRank: number | null;
}

import { SponsorRedeemComponent } from '../picks/sponsor-redeem.component';

@Component({
  standalone: true,
  selector: 'app-profile',
  imports: [RouterLink, SponsorRedeemComponent],
  template: `
    @let u = user();

    @if (u !== null) {
      <section class="profile-hero">
        <div class="profile-hero__content">
          <span class="profile-hero__avatar">{{ avatar() }}</span>
          <div>
            <h1 class="profile-hero__handle">{{ '@' + u.handle }}</h1>
            <p class="profile-hero__email">{{ u.email }}</p>
            <p class="profile-hero__since">Miembro desde {{ memberSince() ?? '—' }}</p>
          </div>
        </div>
      </section>

      <div class="stats-row">
        <div class="stat-card"><strong>{{ totals().points }}</strong><small>Puntos totales</small></div>
        <div class="stat-card"><strong>{{ totals().exactCount }}</strong><small>Marcadores exactos</small></div>
        <div class="stat-card"><strong>{{ totals().resultCount }}</strong><small>Resultados acertados</small></div>
        <div class="stat-card">
          <strong>{{ totals().globalRank ? '#' + totals().globalRank : '—' }}</strong>
          <small>Ranking global</small>
        </div>
      </div>

      <div class="container-app">
        <!-- Picks especiales CTA -->
        <section>
          <a routerLink="/profile/special-picks" class="empty-cta__card"
             style="display: block; text-decoration: none; color: inherit;">
            <h3>Picks especiales</h3>
            <p>
              Campeón · Subcampeón · Equipo revelación.
              @if (daysUntilLock() !== null && daysUntilLock()! > 0) {
                Editable hasta el kickoff del primer partido del torneo ({{ daysUntilLock() }} días).
              } @else {
                Bloqueados — el torneo ya empezó.
              }
            </p>
            <span class="link-green">Editar mis picks especiales →</span>
          </a>
        </section>

        <!-- Datos de la cuenta -->
        <section class="settings-section">
          <h3>Datos de la cuenta</h3>
          <div class="settings-row">
            <div class="settings-row__label">
              <small>Handle público</small>
              <strong>{{ '@' + u.handle }}</strong>
            </div>
            <a class="settings-row__action" (click)="comingSoon('Cambiar handle', $event)">Cambiar →</a>
          </div>
          <div class="settings-row">
            <div class="settings-row__label">
              <small>Email</small>
              <strong>{{ u.email }}</strong>
            </div>
            <a class="settings-row__action" (click)="comingSoon('Cambiar email', $event)">Cambiar →</a>
          </div>
          <div class="settings-row">
            <div class="settings-row__label">
              <small>Password</small>
              <strong>••••••••••</strong>
            </div>
            <a class="settings-row__action" routerLink="/forgot-password">Resetear →</a>
          </div>
        </section>

        <!-- Notificaciones -->
        <section class="settings-section">
          <h3>Notificaciones</h3>
          <div class="settings-row">
            <div class="settings-row__label">
              <small>Email transaccional</small>
              <strong>Welcome, invitaciones, password reset</strong>
            </div>
            <label class="toggle">
              <input type="checkbox" [checked]="notifEmail()" (change)="notifEmail.set($any($event.target).checked)">
              <span class="toggle__track"></span>
            </label>
          </div>
          <div class="settings-row">
            <div class="settings-row__label">
              <small>Recordatorio de picks</small>
              <strong>Email diario con picks pendientes</strong>
            </div>
            <label class="toggle">
              <input type="checkbox" [checked]="notifReminder()" (change)="notifReminder.set($any($event.target).checked)">
              <span class="toggle__track"></span>
            </label>
          </div>
          <div class="settings-row">
            <div class="settings-row__label">
              <small>Banner in-app de picks pendientes</small>
              <strong>Mostrar al entrar a la app</strong>
            </div>
            <label class="toggle">
              <input type="checkbox" [checked]="notifBanner()" (change)="notifBanner.set($any($event.target).checked)">
              <span class="toggle__track"></span>
            </label>
          </div>
        </section>

        <!-- Cuenta -->
        <section class="settings-section">
          <h3>Cuenta</h3>
          <div class="settings-row">
            <div class="settings-row__label">
              <small>Cerrar sesión</small>
              <strong>Salir de esta sesión en este dispositivo</strong>
            </div>
            <a class="settings-row__action" (click)="logout($event)">Salir →</a>
          </div>
          <div class="settings-row">
            <div class="settings-row__label">
              <small>Eliminar cuenta</small>
              <strong>Borra todos tus datos. Esta acción es irreversible.</strong>
            </div>
            <a class="settings-row__action settings-row__action--danger" (click)="deleteAccount($event)">Eliminar →</a>
          </div>
        </section>

        <!-- Sponsor codes (canje de cupones promocionales) -->
        <section style="margin-top: var(--space-xl);">
          <app-sponsor-redeem />
        </section>
      </div>
    }
  `,
})
export class ProfileComponent implements OnInit {
  private auth = inject(AuthService);
  private api = inject(ApiService);
  private toast = inject(ToastService);
  private router = inject(Router);

  user = computed(() => this.auth.user());
  totals = signal<Totals>({ points: 0, exactCount: 0, resultCount: 0, globalRank: null });
  memberSince = signal<string | null>(null);
  daysUntilLock = signal<number | null>(null);

  // Notification toggles — local-only state for now (no backend persistence yet,
  // sees mock the spec §7.2 banner dismiss + future T22 email opt-out flow)
  notifEmail = signal(true);
  notifReminder = signal(false);
  notifBanner = signal(true);

  avatar = computed(() => (this.user()?.handle?.[0] ?? '?').toUpperCase());

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

      // member since (createdAt from User row)
      if (profile.data?.createdAt) {
        this.memberSince.set(
          new Date(profile.data.createdAt).toLocaleDateString('es-EC', {
            day: 'numeric',
            month: 'long',
            year: 'numeric',
          }),
        );
      }

      // days until specials lock
      if (tournament.data?.specialsLockAt) {
        const lockMs = Date.parse(tournament.data.specialsLockAt);
        const days = Math.max(0, Math.ceil((lockMs - Date.now()) / 86_400_000));
        this.daysUntilLock.set(days);
      }
    } catch {
      // silent — partial data is fine
    }
  }

  async logout(event: Event) {
    event.preventDefault();
    await this.auth.logout();
    void this.router.navigate(['/login']);
  }

  comingSoon(label: string, event: Event) {
    event.preventDefault();
    this.toast.info(`${label} — próximamente`);
  }

  deleteAccount(event: Event) {
    event.preventDefault();
    if (!confirm('¿Eliminar tu cuenta? Esto borra tus picks, grupos y datos personales. Acción irreversible.')) {
      return;
    }
    this.toast.info('Eliminar cuenta — próximamente (requiere flujo de admin Cognito + cleanup de datos)');
  }
}
