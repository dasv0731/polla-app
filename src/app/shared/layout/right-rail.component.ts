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

@Component({
  standalone: true,
  selector: 'app-right-rail',
  imports: [RouterLink],
  template: `
    @if (rail.visible()) {
      <aside class="app-rail">

        <!-- Premios mini del primer grupo del usuario con premios definidos -->
        @if (primaryPrize(); as p) {
          <div class="rail-section">
            <div class="rail-premios">
              <div class="rail-premios__head">
                <span class="rail-premios__icon">🏆</span>
                <div>
                  <div class="kicker" style="color:#7a5d00;">PREMIOS · {{ p.groupName.toUpperCase() }}</div>
                  <div class="rail-premios__total">{{ p.totalLabel }}</div>
                </div>
              </div>
              <div style="background:var(--wf-paper);padding:8px 0;">
                @if (p.prize1st) {
                  <div class="rail-premios__row">
                    <span style="font-size:14px;">🥇</span>
                    <span class="text-bold">1° lugar</span>
                    <span class="amount">{{ p.prize1st }}</span>
                  </div>
                }
                @if (p.prize2nd) {
                  <div class="rail-premios__row">
                    <span style="font-size:14px;">🥈</span>
                    <span class="text-bold">2° lugar</span>
                    <span class="amount">{{ p.prize2nd }}</span>
                  </div>
                }
                @if (p.prize3rd) {
                  <div class="rail-premios__row">
                    <span style="font-size:14px;">🥉</span>
                    <span class="text-bold">3° lugar</span>
                    <span class="amount">{{ p.prize3rd }}</span>
                  </div>
                }
              </div>
            </div>
          </div>
        }

        <!-- Mis comodines preview + canjear (modal) -->
        <div class="rail-section">
          <h3 class="rail-section__title">🎁 Mis comodines</h3>
          @if (hasComplete()) {
            @if (comodinesLoading()) {
              <p class="rail-empty">Cargando…</p>
            } @else if (comodinesPreview().length === 0) {
              <p class="rail-empty">Aún no tienes comodines.</p>
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
          } @else {
            <p class="rail-empty">
              Únete a un grupo en modo completo para usar comodines.
            </p>
          }
          <button type="button" class="btn-wf btn-wf--block btn-wf--sm"
                  style="margin-top:10px;"
                  (click)="redeem.open()">
            🎁 Canjear código
          </button>
          @if (hasComplete()) {
            <a routerLink="/mis-comodines" class="rail-section__link"
               style="margin-top:6px;">Ver todos →</a>
          }
        </div>

        <!-- Botón cerrar (solo en bracket) -->
        @if (rail.isCollapsibleRoute()) {
          <button type="button" class="rail-collapse-btn"
                  (click)="rail.collapse()"
                  aria-label="Ocultar rail">
            ✕ Ocultar
          </button>
        }
      </aside>
    } @else if (rail.showExpandButton()) {
      <!-- Botón flotante para expandir el rail (solo en bracket colapsado).
           Visible en desktop ≥1280px porque el rail no aparece en mobile. -->
      <button type="button" class="rail-expand-btn"
              (click)="rail.expand()"
              aria-label="Mostrar premios y comodines">
        🏆 Premios
      </button>
    }
  `,
  styles: [`
    :host { display: contents; }

    .rail-empty {
      font-size: 12px;
      color: var(--wf-ink-3);
      padding: 8px 0;
      margin: 0;
    }

    .rail-collapse-btn {
      margin-top: 14px;
      padding: 8px 12px;
      background: var(--wf-fill);
      border: 1px solid var(--wf-line);
      border-radius: 6px;
      font-size: 11px;
      font-weight: 600;
      cursor: pointer;
      width: 100%;
      color: var(--wf-ink-3);
      font-family: inherit;
    }
    .rail-collapse-btn:hover { background: var(--wf-fill-2); color: var(--wf-ink); }

    /* Botón flotante para abrir el rail en bracket (solo desktop ≥1280) */
    .rail-expand-btn {
      display: none;
    }
    @media (min-width: 1280px) {
      .rail-expand-btn {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        position: fixed;
        right: 16px;
        top: 80px;
        z-index: 40;
        background: var(--wf-ink);
        color: white;
        padding: 8px 14px;
        border-radius: 999px;
        font-size: 12px;
        font-weight: 700;
        border: 0;
        cursor: pointer;
        box-shadow: 0 6px 18px rgba(0,0,0,0.18);
      }
      .rail-expand-btn:hover { transform: translateY(-1px); }
    }
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

  comodinesLoading = signal(true);
  private comodines = signal<ComodinPreview[]>([]);

  /** Top 3 comodines no caducados, priorizando pendientes y disponibles. */
  comodinesPreview = computed<ComodinPreview[]>(() => {
    const list = this.comodines();
    const pending   = list.filter((c) => c.status === 'PENDING_TYPE_CHOICE');
    const available = list.filter((c) => c.status === 'UNASSIGNED');
    const assigned  = list.filter((c) => c.status === 'ASSIGNED');
    return [...pending, ...available, ...assigned].slice(0, 3);
  });

  /** Primer grupo con premios (texto) — para la card de premios mini. */
  primaryPrize = computed(() => {
    const g = this.myGroups().find((x) => !!(x.prize1st || x.prize2nd || x.prize3rd));
    if (!g) return null;
    const totalLabel = totalPrizeLabel(g.prize1st, g.prize2nd, g.prize3rd);
    return {
      groupId: g.id,
      groupName: g.name,
      prize1st: g.prize1st,
      prize2nd: g.prize2nd,
      prize3rd: g.prize3rd,
      totalLabel,
    };
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
}

/** Suma $X de los 3 premios; si alguno no es numérico cae a "N premios". */
function totalPrizeLabel(p1: string | null, p2: string | null, p3: string | null): string {
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
