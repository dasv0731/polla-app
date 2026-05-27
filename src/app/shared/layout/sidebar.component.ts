import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { ApiService } from '../../core/api/api.service';
import { AuthService } from '../../core/auth/auth.service';
import { UserModesService, type UserGroup } from '../../core/user/user-modes.service';
import { GroupActionsService } from '../../core/groups/group-actions.service';

const STORAGE_KEY = 'polla-sidebar-collapsed';

/**
 * Sidebar fijo izquierdo, solo visible en >=1024px. Por defecto colapsado
 * a 56px (solo iconos). Click en el toggle expande a 200px (persistente en
 * localStorage). Hover sobre el rail colapsado expande temporalmente sin
 * persistir. Mobile/tablet usan bottom-nav.
 *
 * Reemplaza al sidebar embebido que vivia dentro de nav.component.ts.
 * `bracketReady` replica el one-shot async check que el nav original hacia
 * via `checkBracketReady()` (busca partidos con phaseOrder >= 2).
 */
@Component({
  standalone: true,
  selector: 'app-sidebar',
  imports: [RouterLink, RouterLinkActive],
  template: `
    <aside class="app-sidebar" [class.is-collapsed]="collapsed()">
      <button type="button" class="app-sidebar__toggle" (click)="toggle()"
              [attr.aria-label]="collapsed() ? 'Expandir sidebar' : 'Colapsar sidebar'">
        ☰
      </button>

      @if (isAdmin()) {
        <div class="app-sidebar__section">
          <div class="app-sidebar__kicker">Admin</div>
          <a class="sidebar-row" routerLink="/admin" routerLinkActive="is-active" [routerLinkActiveOptions]="{exact: true}">
            <span class="sidebar-row__icon">📊</span><span class="sidebar-row__label">Dashboard</span>
          </a>
          <a class="sidebar-row" routerLink="/admin/fixtures" routerLinkActive="is-active">
            <span class="sidebar-row__icon">⚽</span><span class="sidebar-row__label">Partidos</span>
          </a>
          <a class="sidebar-row" routerLink="/admin/bracket" routerLinkActive="is-active">
            <span class="sidebar-row__icon">🌳</span><span class="sidebar-row__label">Llaves</span>
          </a>
          <a class="sidebar-row" routerLink="/admin/results" routerLinkActive="is-active">
            <span class="sidebar-row__icon">🏆</span><span class="sidebar-row__label">Resultados</span>
          </a>
          <a class="sidebar-row" routerLink="/admin/teams" routerLinkActive="is-active">
            <span class="sidebar-row__icon">🏳️</span><span class="sidebar-row__label">Equipos</span>
          </a>
          <a class="sidebar-row" routerLink="/admin/special-results" routerLinkActive="is-active">
            <span class="sidebar-row__icon">⭐</span><span class="sidebar-row__label">Especiales</span>
          </a>
          <a class="sidebar-row" routerLink="/admin/sponsors" routerLinkActive="is-active">
            <span class="sidebar-row__icon">🎁</span><span class="sidebar-row__label">Sponsors</span>
          </a>
          <a class="sidebar-row" routerLink="/admin/articles" routerLinkActive="is-active">
            <span class="sidebar-row__icon">📰</span><span class="sidebar-row__label">Noticias</span>
          </a>
          <a class="sidebar-row" routerLink="/admin/groups-overview" routerLinkActive="is-active">
            <span class="sidebar-row__icon">📋</span><span class="sidebar-row__label">Grupos overview</span>
          </a>
          <a class="sidebar-row" routerLink="/admin/rankings-overview" routerLinkActive="is-active">
            <span class="sidebar-row__icon">🥇</span><span class="sidebar-row__label">Rankings</span>
          </a>
          <a class="sidebar-row" routerLink="/admin/users" routerLinkActive="is-active">
            <span class="sidebar-row__icon">👥</span><span class="sidebar-row__label">Users</span>
          </a>
        </div>
      } @else {
        <div class="app-sidebar__section">
          <div class="app-sidebar__kicker">Mis grupos</div>
          @for (g of topGroups(); track g.id) {
            <a class="sidebar-row" [routerLink]="['/groups', g.id]" routerLinkActive="is-active">
              <span class="sidebar-row__icon">{{ g.mode === 'COMPLETE' ? '🟢' : '🟡' }}</span>
              <span class="sidebar-row__label">{{ g.name }}</span>
            </a>
          }
          @if (myGroups().length > topGroups().length) {
            <a class="sidebar-row sidebar-row--more" routerLink="/groups">
              <span class="sidebar-row__icon">↗</span>
              <span class="sidebar-row__label">Ver todos ({{ myGroups().length }})</span>
            </a>
          }
          @if (myGroups().length === 0) {
            <p class="sidebar-empty">Aún no estás en ningún grupo.</p>
          }
          <button class="sidebar-row sidebar-row--btn" type="button" (click)="goCreate()">
            <span class="sidebar-row__icon">＋</span>
            <span class="sidebar-row__label">Crear grupo</span>
          </button>
          <button class="sidebar-row sidebar-row--btn" type="button" (click)="goJoin()">
            <span class="sidebar-row__icon">→</span>
            <span class="sidebar-row__label">Unirme</span>
          </button>
        </div>

        <div class="app-sidebar__section">
          <div class="app-sidebar__kicker">Polla Mundialista</div>
          <a class="sidebar-row" routerLink="/profile/special-picks" routerLinkActive="is-active">
            <span class="sidebar-row__icon">🏆</span>
            <span class="sidebar-row__label">Camp/Sub/Reve</span>
          </a>
        </div>

        <div class="app-sidebar__section">
          <div class="app-sidebar__kicker">Mis predicciones</div>
          <a class="sidebar-row" routerLink="/picks/group-stage/predict" routerLinkActive="is-active">
            <span class="sidebar-row__icon">📋</span>
            <span class="sidebar-row__label">Clasificados</span>
          </a>
          @if (bracketReady()) {
            <a class="sidebar-row" routerLink="/picks/bracket" routerLinkActive="is-active">
              <span class="sidebar-row__icon">🌳</span>
              <span class="sidebar-row__label">Llaves</span>
            </a>
          }
        </div>
      }
    </aside>
  `,
  styles: [`
    :host { display: contents; }

    .app-sidebar {
      position: sticky; top: 64px;
      width: 200px;
      max-height: calc(100vh - 64px);
      overflow-y: auto;
      padding: 12px 8px;
      background: var(--wf-paper);
      border-right: 1px solid var(--wf-line);
      transition: width 200ms;
      display: none;
    }
    @media (min-width: 1024px) {
      .app-sidebar { display: block; }
    }
    .app-sidebar.is-collapsed { width: 56px; }
    .app-sidebar.is-collapsed:hover { width: 200px; }

    .app-sidebar__toggle {
      background: transparent; border: 0; cursor: pointer;
      padding: 6px 8px; font-size: 18px; color: var(--wf-ink-2);
      margin-bottom: 12px;
    }

    .app-sidebar__section { margin-bottom: 18px; }
    .app-sidebar__kicker {
      font-size: 10px; letter-spacing: .12em;
      color: var(--wf-ink-3); text-transform: uppercase;
      padding: 0 8px; margin-bottom: 6px;
      transition: opacity 150ms;
    }
    .app-sidebar.is-collapsed:not(:hover) .app-sidebar__kicker { opacity: 0; }
    .app-sidebar.is-collapsed:not(:hover) .sidebar-row__label { opacity: 0; }

    .sidebar-row {
      display: flex; align-items: center; gap: 10px;
      padding: 8px;
      border-radius: 8px;
      text-decoration: none;
      color: var(--wf-ink);
      font-size: 13px;
      cursor: pointer;
      white-space: nowrap;
      overflow: hidden;
      transition: background 150ms;
    }
    .sidebar-row:hover { background: var(--wf-fill); }
    .sidebar-row.is-active { background: var(--wf-green-soft); color: var(--wf-green-ink); font-weight: 600; }
    .sidebar-row__icon { width: 24px; text-align: center; flex-shrink: 0; }
    .sidebar-row__label { transition: opacity 150ms; }

    .sidebar-row--btn { background: transparent; border: 0; width: 100%; text-align: left; }
    .sidebar-empty { font-size: 12px; color: var(--wf-ink-3); padding: 0 8px; margin: 4px 0; }
  `],
})
export class SidebarComponent implements OnInit {
  private auth = inject(AuthService);
  private api = inject(ApiService);
  private userModes = inject(UserModesService);
  private groupActions = inject(GroupActionsService);

  collapsed = signal<boolean>(this.readInitialState());

  isAdmin = computed(() => this.auth.user()?.isAdmin === true);
  myGroups = computed(() => this.userModes.groups());
  topGroups = computed<UserGroup[]>(() => this.myGroups().slice(0, 5));

  /** True si hay al menos un partido cargado en fases eliminatorias
   *  (phaseOrder >= 2). Mientras sea false, "Llaves" se oculta del sidebar.
   *  One-shot check on init, replica de la logica original en nav.component. */
  bracketReady = signal(false);

  ngOnInit() {
    void this.checkBracketReady();
  }

  private async checkBracketReady() {
    try {
      const [matchesRes, phasesRes] = await Promise.all([
        this.api.listMatches('mundial-2026'),
        this.api.listPhases('mundial-2026'),
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
      // ignore — queda en false (oculto)
    }
  }

  toggle() {
    const next = !this.collapsed();
    this.collapsed.set(next);
    try { localStorage.setItem(STORAGE_KEY, String(next)); } catch { /* no-op */ }
  }

  private readInitialState(): boolean {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw === null) return true;   // default collapsed
      return raw === 'true';
    } catch { return true; }
  }

  goCreate() { this.groupActions.openCreate(); }
  goJoin() { this.groupActions.openJoin(); }
}
