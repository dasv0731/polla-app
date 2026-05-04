import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ApiService } from '../../core/api/api.service';
import { AuthService } from '../../core/auth/auth.service';
import { UserModesService, type UserGroup } from '../../core/user/user-modes.service';
import { RightRailService } from '../../core/layout/right-rail.service';
import { RedeemModalService } from '../../core/sponsors/redeem-modal.service';

const TOURNAMENT_ID = 'mundial-2026';

interface ComodinPreview {
  id: string;
  type: string | null;
  status: string;
}

/**
 * Aside derecho fijo (sticky) en /picks · /picks/group-stage · /picks/bracket
 * y /groups. Muestra premios arriba + mis comodines abajo (con activos si
 * los hay) + botón canjear código + botón ver comodines.
 *
 * Iteración previa: estos botones eran inline en el header de cada página
 * y abrían modales. Cambio a aside porque el contenido es secundario pero
 * de consulta frecuente — un aside sticky permite verlo siempre sin
 * tener que abrir modal cada vez.
 */
@Component({
  standalone: true,
  selector: 'app-right-rail',
  imports: [RouterLink],
  template: `
    @if (rail.visible()) {
      <aside class="app-rail">
        <!-- Premios -->
        <section class="app-rail__section">
          <h3 class="app-rail__title">🏆 Premios</h3>
          @if (groupsWithPrizes().length === 0) {
            <p class="app-rail__empty">
              Tus grupos aún no tienen premios definidos.
            </p>
          } @else {
            @for (g of groupsWithPrizes(); track g.id) {
              <div class="rail-prize-card">
                <div class="rail-prize-card__head">
                  <div class="rail-prize-card__group">{{ g.name }}</div>
                  <div class="rail-prize-card__total">{{ totalLabel(g.prize1st, g.prize2nd, g.prize3rd) }}</div>
                </div>
                @if (g.prize1st) {
                  <div class="rail-prize-card__row">
                    <span>🥇</span><span class="lbl">1°</span>
                    <span class="amount">{{ g.prize1st }}</span>
                  </div>
                }
                @if (g.prize2nd) {
                  <div class="rail-prize-card__row">
                    <span>🥈</span><span class="lbl">2°</span>
                    <span class="amount">{{ g.prize2nd }}</span>
                  </div>
                }
                @if (g.prize3rd) {
                  <div class="rail-prize-card__row">
                    <span>🥉</span><span class="lbl">3°</span>
                    <span class="amount">{{ g.prize3rd }}</span>
                  </div>
                }
              </div>
            }
          }
        </section>

        <!-- Comodines -->
        <section class="app-rail__section">
          <h3 class="app-rail__title">🎁 Mis comodines</h3>
          @if (!hasComplete()) {
            <p class="app-rail__empty">
              Disponibles solo en grupos modo completo.
            </p>
          } @else if (comodinesLoading()) {
            <p class="app-rail__empty">Cargando…</p>
          } @else if (activeComodines().length === 0) {
            <p class="app-rail__empty">
              Aún no tienes comodines.
            </p>
          } @else {
            @for (c of activeComodines(); track c.id) {
              <div class="rail-comodin">
                <div class="rail-comodin__type">{{ typeLabel(c.type) }}</div>
                <div class="rail-comodin__status">{{ statusLabel(c.status) }}</div>
              </div>
            }
            @if (totalComodines() > activeComodines().length) {
              <p class="app-rail__more">
                +{{ totalComodines() - activeComodines().length }} más asignados
              </p>
            }
          }

          <button type="button" class="btn-wf btn-wf--block btn-wf--sm"
                  style="margin-top:10px;"
                  (click)="redeem.open()">
            🎁 Canjear código
          </button>
          <a routerLink="/mis-comodines"
             class="btn-wf btn-wf--block btn-wf--sm btn-wf--primary"
             style="margin-top:6px;">
            Ver todos los comodines →
          </a>
        </section>
      </aside>
    }
  `,
  styles: [`
    :host { display: contents; }
  `],
})
export class RightRailComponent implements OnInit {
  rail = inject(RightRailService);
  redeem = inject(RedeemModalService);
  private api = inject(ApiService);
  private auth = inject(AuthService);
  private userModes = inject(UserModesService);

  hasComplete = computed(() => this.userModes.hasComplete());
  myGroups = computed<UserGroup[]>(() => this.userModes.groups());

  groupsWithPrizes = computed<UserGroup[]>(() =>
    this.myGroups().filter((g) => !!(g.prize1st || g.prize2nd || g.prize3rd)),
  );

  comodinesLoading = signal(true);
  private comodines = signal<ComodinPreview[]>([]);
  totalComodines = computed(() => this.comodines().length);

  /** Top 4 comodines no expirados, priorizando pendientes y disponibles. */
  activeComodines = computed<ComodinPreview[]>(() => {
    const list = this.comodines();
    const pending   = list.filter((c) => c.status === 'PENDING_TYPE_CHOICE');
    const available = list.filter((c) => c.status === 'UNASSIGNED');
    return [...pending, ...available].slice(0, 4);
  });

  async ngOnInit() {
    const userId = this.auth.user()?.sub;
    if (!userId) {
      this.comodinesLoading.set(false);
      return;
    }
    try {
      const res = await this.api.listMyComodines(userId, TOURNAMENT_ID);
      const rows = ((res.data ?? []) as ComodinPreview[])
        .filter((c) => c.status !== 'EXPIRED');
      this.comodines.set(rows);
    } catch {
      /* ignore */
    } finally {
      this.comodinesLoading.set(false);
    }
  }

  typeLabel(t: string | null): string {
    if (!t) return 'Sin tipo';
    switch (t) {
      case 'MULTIPLIER_X2':         return '2× Doble pts';
      case 'PHASE_BOOST':           return 'Boost de fase';
      case 'GROUP_SAFE_PICK':       return 'Safe Grupos';
      case 'BRACKET_SAFE_PICK':     return 'Safe Llaves';
      case 'REASSIGN_CHAMP_RUNNER': return 'Reasign campeón';
      case 'LATE_EDIT':             return 'Edición tardía';
      case 'BRACKET_RESET':         return 'Reset bracket';
      case 'GROUP_RESET':           return 'Reset grupo';
      case 'ANTI_PENALTY':          return 'Anti-penal';
      default:                      return t;
    }
  }

  statusLabel(s: string): string {
    switch (s) {
      case 'PENDING_TYPE_CHOICE': return '⚠ Elige tipo';
      case 'UNASSIGNED':          return 'Disponible';
      case 'ASSIGNED':            return 'Asignado';
      case 'ACTIVATED':           return 'Activo';
      default:                    return s;
    }
  }

  /** Suma $X de los 3 premios; si alguno no es numérico cae a "N premios". */
  totalLabel(p1: string | null, p2: string | null, p3: string | null): string {
    const raws = [p1, p2, p3].filter((v): v is string => !!v);
    if (raws.length === 0) return 'Sin definir';
    const numbers = raws.map((s) => {
      const m = s.match(/\$\s*(\d[\d.,]*)/);
      return m ? parseFloat(m[1].replace(/,/g, '')) : null;
    });
    if (numbers.every((n) => n !== null)) {
      const sum = (numbers as number[]).reduce((a, n) => a + n, 0);
      return `$${Math.round(sum)} en juego`;
    }
    return `${raws.length} ${raws.length === 1 ? 'premio' : 'premios'}`;
  }
}
