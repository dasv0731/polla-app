import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { ApiService } from '../../core/api/api.service';
import { AuthService } from '../../core/auth/auth.service';

const TOURNAMENT_ID = 'mundial-2026';

/**
 * Sidebar negro design-v3. Layout vertical fijo a la izquierda en desktop
 * (≥768px): 64px colapsado mostrando solo iconos, 200px al hover. En mobile
 * (<768px) se transforma en bottom-nav horizontal con 5 items + labels chicos
 * (reemplaza al bottom-nav.component.ts que se elimina).
 *
 * Items principales: Inicio · Mis picks · Grupos · Ranking · Mundial 2026
 * (+ Admin si isAdmin). Bottom area (solo desktop): notificaciones (bell) +
 * avatar/handle. En mobile el bottom area se oculta — el bell vive en el
 * topbar mobile.
 */
@Component({
  standalone: true,
  selector: 'app-sidebar',
  imports: [RouterLink, RouterLinkActive],
  template: `
    <aside class="lsb" aria-label="Navegación principal">
      <a class="lsb__logo" routerLink="/home" aria-label="Inicio">
        <img src="assets/logo-golgana.png" alt="" width="199" height="98">
        <strong>POLLA</strong>
      </a>

      <a routerLink="/home" routerLinkActive="active" [routerLinkActiveOptions]="{exact: true}">
        <span class="lsb__i" aria-hidden="true">🏠</span><span class="lsb__t">Inicio</span>
      </a>
      <a routerLink="/picks" routerLinkActive="active">
        <span class="lsb__i" aria-hidden="true">⚽</span><span class="lsb__t">Mis picks</span>
      </a>
      <a routerLink="/groups" routerLinkActive="active">
        <span class="lsb__i" aria-hidden="true">👥</span><span class="lsb__t">Grupos</span>
      </a>
      <a routerLink="/ranking" routerLinkActive="active">
        <span class="lsb__i" aria-hidden="true">🏆</span><span class="lsb__t">Ranking</span>
      </a>
      <a routerLink="/picks/group-stage/predict" routerLinkActive="active">
        <span class="lsb__i" aria-hidden="true">🌎</span><span class="lsb__t">Mundial 2026</span>
      </a>
      @if (isAdmin()) {
        <a routerLink="/admin" routerLinkActive="active">
          <span class="lsb__i" aria-hidden="true">🛠</span><span class="lsb__t">Admin</span>
        </a>
      }

      <div class="lsb__bottom">
        <a routerLink="/notificaciones" routerLinkActive="active" class="lsb__bell">
          <span class="lsb__i" aria-hidden="true">🔔</span><span class="lsb__t">Notificaciones</span>
        </a>
        <a routerLink="/profile" class="lsb__usr">
          <div class="lsb__av">{{ avatarInitials() }}</div>
          <span class="lsb__t" translate="no">{{ '@' + (handle() ?? 'jugador') }}</span>
        </a>
      </div>
    </aside>
  `,
  styles: [`
    :host { display: contents; }

    .lsb {
      position: fixed;
      top: 0; left: 0; bottom: 0;
      width: 64px;
      background: #0a0a0a;
      border-right: 1px solid rgba(255,255,255,0.08);
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: 14px 0;
      gap: 6px;
      z-index: 50;
      transition: width 0.2s;
      overflow: hidden;
    }
    .lsb:hover { width: 200px; align-items: stretch; }

    .lsb__logo {
      width: 36px; height: 36px;
      display: grid; place-items: center;
      margin-bottom: 18px;
      flex-shrink: 0;
    }
    .lsb:hover .lsb__logo {
      width: auto; margin-left: 14px;
      justify-content: flex-start;
      display: flex; align-items: center; gap: 10px;
    }
    .lsb__logo img { height: 28px; }
    .lsb__logo strong {
      display: none;
      color: #fff; font-family: var(--font-display);
      font-size: 18px; letter-spacing: 0.04em;
    }
    .lsb:hover .lsb__logo strong { display: block; }

    .lsb a {
      color: rgba(255,255,255,0.7);
      text-decoration: none;
      display: flex; align-items: center; gap: 14px;
      width: 48px; height: 44px;
      justify-content: center;
      border-radius: 8px;
      font-size: 18px;
      transition: width 0.15s ease, background 0.15s ease, color 0.15s ease, padding 0.15s ease;
      flex-shrink: 0;
      white-space: nowrap;
    }
    .lsb:hover a { width: auto; justify-content: flex-start; padding: 0 14px; margin: 0 8px; }
    .lsb__t {
      font-size: 13px; font-weight: 500; letter-spacing: 0.04em;
      display: none;
    }
    .lsb:hover .lsb__t { display: inline; }
    .lsb a:hover, .lsb a.active {
      background: rgba(2,204,116,0.18);
      color: #fff;
    }
    .lsb a:focus-visible {
      /* La sidebar tiene overflow:hidden cuando está colapsada —
       * outline se recorta. Box-shadow inset queda dentro del elemento
       * y siempre visible. */
      outline: none;
      box-shadow: inset 0 0 0 2px var(--color-primary-green);
      color: #fff;
    }

    .lsb__bottom {
      margin-top: auto;
      display: flex;
      flex-direction: column;
      gap: 6px;
      align-items: center;
      width: 100%;
    }
    .lsb:hover .lsb__bottom { align-items: stretch; }

    .lsb__bell { position: relative; }

    .lsb__usr {
      display: flex; align-items: center; gap: 10px;
      width: 48px; height: 48px;
      justify-content: center;
      flex-shrink: 0;
    }
    .lsb:hover .lsb__usr { width: auto; justify-content: flex-start; padding: 0 14px; margin: 0 8px 8px; }
    .lsb__av {
      width: 32px; height: 32px;
      border-radius: 50%;
      background: linear-gradient(135deg, #067a4a, #02cc74);
      display: grid; place-items: center;
      color: #fff;
      font-weight: 600;
      font-size: 12px;
      flex-shrink: 0;
    }

    /* MOBILE / TABLET: bottom-nav horizontal */
    @media (max-width: 767px) {
      .lsb {
        top: auto; bottom: 0; left: 0; right: 0;
        width: 100%; height: 60px;
        flex-direction: row;
        padding: 0 calc(env(safe-area-inset-bottom, 0px) / 2) env(safe-area-inset-bottom, 0px);
        border-right: 0;
        border-top: 1px solid rgba(255,255,255,0.08);
        justify-content: space-around;
        align-items: center;
        overflow: visible;
      }
      .lsb:hover { width: 100%; align-items: center; }
      .lsb__logo { display: none; }
      .lsb a {
        width: auto; height: 46px;
        flex-direction: column;
        gap: 2px;
        padding: 6px 10px;
        font-size: 16px;
        margin: 0;
      }
      .lsb:hover a {
        width: auto; justify-content: center;
        padding: 6px 10px; margin: 0;
      }
      .lsb__t {
        display: block;
        font-size: 9px;
        letter-spacing: 0.04em;
        text-transform: uppercase;
      }
      .lsb__bottom { display: none; }
    }
  `],
})
export class SidebarComponent implements OnInit {
  private auth = inject(AuthService);
  private api = inject(ApiService);

  handle = computed(() => this.auth.user()?.handle ?? null);
  avatarInitials = computed(() => {
    const h = this.handle();
    if (!h) return '?';
    return h.slice(0, 2).toUpperCase();
  });
  isAdmin = computed(() => this.auth.user()?.isAdmin === true);

  // Kept for parity with the previous sidebar (the bracket link is no longer
  // surfaced from here in v3, but consumers may still query the signal).
  bracketReady = signal(false);

  ngOnInit() {
    void this.checkBracketReady();
  }

  private async checkBracketReady() {
    try {
      const [matchesRes, phasesRes] = await Promise.all([
        this.api.listMatches(TOURNAMENT_ID),
        this.api.listPhases(TOURNAMENT_ID),
      ]);
      const koPhaseIds = new Set(
        ((phasesRes.data ?? []) as Array<{ id: string; order: number }>)
          .filter((p) => (p.order ?? 0) >= 2)
          .map((p) => p.id),
      );
      const hasKO = ((matchesRes.data ?? []) as Array<{ phaseId: string }>)
        .some((m) => koPhaseIds.has(m.phaseId));
      this.bracketReady.set(hasKO);
    } catch {
      /* no-op */
    }
  }
}
