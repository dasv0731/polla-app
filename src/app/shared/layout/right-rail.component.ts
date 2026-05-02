import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ApiService } from '../../core/api/api.service';
import { AuthService } from '../../core/auth/auth.service';
import { UserModesService, type UserGroup } from '../../core/user/user-modes.service';
import { RailModalsService } from '../../core/layout/rail-modals.service';
import { RedeemModalService } from '../../core/sponsors/redeem-modal.service';

const TOURNAMENT_ID = 'mundial-2026';

interface ComodinPreview {
  id: string;
  type: string | null;
  status: string;
}

/**
 * Renderiza los modales globales de Premios y Comodines. Los botones
 * que los disparan ahora viven INLINE en cada page (debajo de
 * page__stats) — ya no FABs flotantes — y abren los modales vía
 * `RailModalsService` (signals compartidos).
 *
 * Este componente sigue mounted en el shell para tener un único host
 * que carga datos de comodines / grupos y un único punto de overlay.
 */
@Component({
  standalone: true,
  selector: 'app-right-rail',
  imports: [RouterLink],
  template: `
    <!-- Modal Premios -->
      @if (premiosOpen()) {
        <div class="picks-modal is-open" role="dialog" aria-modal="true">
          <button type="button" class="picks-modal__close-overlay"
                  (click)="closePremios()" aria-label="Cerrar"></button>
          <div class="picks-modal__card">
            <header class="picks-modal__head">
              <div>
                <div class="title">🏆 Premios</div>
                <div class="meta">
                  @if (groupsWithPrizes().length === 0) {
                    Sin premios definidos
                  } @else {
                    {{ groupsWithPrizes().length }} grupo{{ groupsWithPrizes().length === 1 ? '' : 's' }} con premios
                  }
                </div>
              </div>
              <button type="button" class="close" (click)="closePremios()" aria-label="Cerrar">✕</button>
            </header>
            <div class="picks-modal__body">
              @if (groupsWithPrizes().length === 0) {
                <p class="rail-empty" style="padding:14px;">
                  Tus grupos aún no tienen premios definidos. El admin
                  del grupo puede agregarlos en la pantalla del grupo.
                </p>
              } @else {
                @for (g of groupsWithPrizes(); track g.id) {
                  <div class="rail-premios" style="margin-bottom:8px;">
                    <div class="rail-premios__head">
                      <span class="rail-premios__icon">🏆</span>
                      <div>
                        <div class="kicker" style="color:#7a5d00;">{{ g.name.toUpperCase() }}</div>
                        <div class="rail-premios__total">{{ totalLabel(g.prize1st, g.prize2nd, g.prize3rd) }}</div>
                      </div>
                    </div>
                    <div style="background:var(--wf-paper);padding:8px 0;">
                      @if (g.prize1st) {
                        <div class="rail-premios__row">
                          <span style="font-size:14px;">🥇</span>
                          <span class="text-bold">1° lugar</span>
                          <span class="amount">{{ g.prize1st }}</span>
                        </div>
                      }
                      @if (g.prize2nd) {
                        <div class="rail-premios__row">
                          <span style="font-size:14px;">🥈</span>
                          <span class="text-bold">2° lugar</span>
                          <span class="amount">{{ g.prize2nd }}</span>
                        </div>
                      }
                      @if (g.prize3rd) {
                        <div class="rail-premios__row">
                          <span style="font-size:14px;">🥉</span>
                          <span class="text-bold">3° lugar</span>
                          <span class="amount">{{ g.prize3rd }}</span>
                        </div>
                      }
                    </div>
                  </div>
                }
              }
            </div>
            <footer class="picks-modal__foot">
              <span class="meta"></span>
              <button type="button" class="btn-wf btn-wf--sm btn-wf--primary"
                      (click)="closePremios()">Listo</button>
            </footer>
          </div>
        </div>
      }

      <!-- Modal Comodines -->
      @if (comodinesOpen()) {
        <div class="picks-modal is-open" role="dialog" aria-modal="true">
          <button type="button" class="picks-modal__close-overlay"
                  (click)="closeComodines()" aria-label="Cerrar"></button>
          <div class="picks-modal__card">
            <header class="picks-modal__head">
              <div>
                <div class="title">🎁 Mis comodines</div>
                <div class="meta">
                  @if (!hasComplete()) {
                    Disponibles solo en grupos modo completo
                  } @else {
                    {{ comodinesPreview().length }} de {{ comodinesTotal() }} mostrados
                  }
                </div>
              </div>
              <button type="button" class="close" (click)="closeComodines()" aria-label="Cerrar">✕</button>
            </header>
            <div class="picks-modal__body">
              @if (!hasComplete()) {
                <p class="rail-empty" style="padding:14px;">
                  Únete a un grupo en modo completo para usar comodines.
                </p>
              } @else if (comodinesLoading()) {
                <p class="rail-empty" style="padding:14px;">Cargando…</p>
              } @else if (comodinesPreview().length === 0) {
                <p class="rail-empty" style="padding:14px;">
                  Aún no tienes comodines. Canjea un código de sponsor o
                  espera a que se asignen los premios de trivia.
                </p>
              } @else {
                @for (c of comodinesPreview(); track c.id) {
                  <div class="rail-comodin"
                       [class.rail-comodin--warn]="c.status === 'PENDING_TYPE_CHOICE'">
                    <div class="rail-comodin__head">
                      @if (c.status === 'PENDING_TYPE_CHOICE') {
                        <span>⚠ {{ c.type ? typeShort(c.type) : 'Sin tipo' }}</span>
                      } @else {
                        <span>{{ c.type ? typeShort(c.type) : 'Sin tipo' }}</span>
                        <span class="pill pill--green" style="padding:1px 6px;font-size:9px;">
                          {{ statusShort(c.status) }}
                        </span>
                      }
                    </div>
                    <div class="rail-comodin__sub">{{ subFor(c) }}</div>
                  </div>
                }
              }

              <div style="display:flex;flex-direction:column;gap:8px;margin-top:12px;">
                <button type="button" class="btn-wf btn-wf--block btn-wf--sm"
                        (click)="openCanjear()">
                  🎁 Canjear código de sponsor
                </button>
                @if (hasComplete()) {
                  <a routerLink="/mis-comodines"
                     class="btn-wf btn-wf--block btn-wf--sm btn-wf--primary"
                     (click)="closeComodines()">
                    Ver todos los comodines →
                  </a>
                }
              </div>
            </div>
          </div>
        </div>
      }
  `,
  styles: [`
    :host { display: contents; }

    .rail-empty {
      font-size: 13px;
      color: var(--wf-ink-3);
      margin: 0;
      line-height: 1.5;
    }
  `],
})
export class RightRailComponent implements OnInit {
  rail = inject(RailModalsService);
  redeem = inject(RedeemModalService);
  private api = inject(ApiService);
  private auth = inject(AuthService);
  private userModes = inject(UserModesService);

  // Atajos para usar en el template (siguen siendo signals readonly desde service)
  premiosOpen = this.rail.premiosOpen;
  comodinesOpen = this.rail.comodinesOpen;
  closePremios = () => this.rail.closePremios();
  closeComodines = () => this.rail.closeComodines();

  hasComplete = computed(() => this.userModes.hasComplete());
  myGroups = computed<UserGroup[]>(() => this.userModes.groups());

  groupsWithPrizes = computed<UserGroup[]>(() =>
    this.myGroups().filter((g) => !!(g.prize1st || g.prize2nd || g.prize3rd)),
  );

  comodinesLoading = signal(true);
  private comodines = signal<ComodinPreview[]>([]);

  comodinesTotal = computed(() => this.comodines().length);

  /** Top 6 comodines no caducados, priorizando pendientes y disponibles. */
  comodinesPreview = computed<ComodinPreview[]>(() => {
    const list = this.comodines();
    const pending   = list.filter((c) => c.status === 'PENDING_TYPE_CHOICE');
    const available = list.filter((c) => c.status === 'UNASSIGNED');
    const assigned  = list.filter((c) => c.status === 'ASSIGNED');
    return [...pending, ...available, ...assigned].slice(0, 6);
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

  openCanjear() {
    this.rail.closeComodines();
    this.redeem.open();
  }

  typeShort(t: string): string {
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

  statusShort(s: string): string {
    switch (s) {
      case 'UNASSIGNED': return 'Disp.';
      case 'ASSIGNED':   return 'Asig.';
      case 'ACTIVATED':  return 'Activo';
      default:           return s;
    }
  }

  subFor(c: ComodinPreview): string {
    if (c.status === 'PENDING_TYPE_CHOICE') return 'Elige el tipo';
    if (c.status === 'ASSIGNED') return 'Aplicado a un partido';
    if (c.status === 'ACTIVATED') return 'Ya activado';
    return 'Listo para usar';
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
