import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ApiService } from '../../core/api/api.service';
import { AuthService } from '../../core/auth/auth.service';
import { ToastService } from '../../core/notifications/toast.service';
import { humanizeError } from '../../core/notifications/domain-errors';

const TOURNAMENT_ID = 'mundial-2026';

type ComodinType =
  | 'MULTIPLIER_X2' | 'PHASE_BOOST' | 'GROUP_SAFE_PICK' | 'BRACKET_SAFE_PICK'
  | 'REASSIGN_CHAMP_RUNNER' | 'LATE_EDIT' | 'BRACKET_RESET' | 'GROUP_RESET'
  | 'ANTI_PENALTY';

type ComodinSource = 'SPONSOR' | 'TRIVIA' | 'LOYALTY' | 'ENGAGEMENT';
type ComodinStatus = 'UNASSIGNED' | 'ASSIGNED' | 'ACTIVATED' | 'EXPIRED';

interface ComodinRow {
  id: string;
  type: ComodinType | null;       // null en PENDING_TYPE_CHOICE
  source: ComodinSource;
  status: ComodinStatus;
  createdAt: string;
}

const ALL_TYPES: ComodinType[] = [
  'MULTIPLIER_X2', 'PHASE_BOOST', 'GROUP_SAFE_PICK', 'BRACKET_SAFE_PICK',
  'REASSIGN_CHAMP_RUNNER', 'LATE_EDIT', 'BRACKET_RESET', 'GROUP_RESET',
  'ANTI_PENALTY',
];

const TYPE_INFO: Record<ComodinType, { name: string; impact: string; window: string; }> = {
  MULTIPLIER_X2: {
    name: 'Multiplicador x2',
    impact: 'Duplica los puntos de marcador en 1 partido (grupos u octavos).',
    window: 'Asignar antes del kickoff del partido. Caduca al inicio de cuartos.',
  },
  PHASE_BOOST: {
    name: 'Boost de fase',
    impact: 'x1.5 a marcadores de toda una fase eliminatoria (octavos o cuartos).',
    window: 'Asignar antes del kickoff del primer partido de la fase. Caduca al inicio de semis.',
  },
  GROUP_SAFE_PICK: {
    name: 'Pick seguro de grupos',
    impact: 'Si fallás 1 posición específica, recibís 50% de los puntos.',
    window: 'Asignar antes del primer partido del torneo.',
  },
  BRACKET_SAFE_PICK: {
    name: 'Pick seguro de llaves',
    impact: 'Si fallás 1 equipo en una fase, recibís 50% de los puntos.',
    window: 'Asignar antes del kickoff de la fase elegida. Caduca al inicio de la final.',
  },
  REASSIGN_CHAMP_RUNNER: {
    name: 'Reasignación campeón/subcampeón',
    impact: 'Cambiar tu predicción de campeón o subcampeón post-grupos. Paga 50%.',
    window: 'Solo entre fin de grupos e inicio de octavos.',
  },
  LATE_EDIT: {
    name: 'Edición tardía',
    impact: 'Editar marcador hasta 15 min después del kickoff (solo grupos). Paga 50%.',
    window: 'Se ejerce, no se asigna. 1 sola vez en el torneo.',
  },
  BRACKET_RESET: {
    name: 'Reseteo de fase eliminatoria',
    impact: 'Reordenar todos los picks de una fase (octavos, cuartos o semis). Paga 60%.',
    window: 'Entre fin de la fase anterior e inicio de la fase a resetear.',
  },
  GROUP_RESET: {
    name: 'Reseteo de grupo',
    impact: 'Reordenar las 4 posiciones de un grupo después de la jornada 1. Paga 50%.',
    window: 'Entre fin de J1 del grupo e inicio de J2.',
  },
  ANTI_PENALTY: {
    name: 'Anti-penalización',
    impact: 'Anula la penalización del Pick seguro de llaves: 100% en vez de 50% si fallás.',
    window: 'Asignar al Pick seguro de llaves antes del kickoff de su fase.',
  },
};

const SOURCE_LABEL: Record<ComodinSource, string> = {
  SPONSOR: 'Sponsor',
  TRIVIA: 'Trivia',
  LOYALTY: 'Fidelidad temprana',
  ENGAGEMENT: 'Engagement',
};

const STATUS_LABEL: Record<ComodinStatus, string> = {
  UNASSIGNED: 'Sin asignar',
  ASSIGNED: 'Asignado',
  ACTIVATED: 'Activado',
  EXPIRED: 'Caducado',
};

@Component({
  standalone: true,
  selector: 'app-comodines-list',
  imports: [RouterLink],
  template: `
    <header class="page-header">
      <div class="page-header__top">
        <div class="page-header__title">
          <small>Mundial 2026 · sistema de comodines</small>
          <h1>Mis comodines</h1>
        </div>
        <div class="page-header__counts">
          <div><strong>{{ activeCount() }}/5</strong><small>Acumulados</small></div>
          <div><strong>{{ unassignedCount() }}</strong><small>Por asignar</small></div>
          <div><strong>{{ assignedCount() }}</strong><small>Asignados</small></div>
        </div>
      </div>
      <p class="form-card__hint" style="margin-top: var(--space-md);">
        Solo aplica a Modo Completo. Máximo 5 comodines por usuario y máximo 1
        de cada tipo. Las fuentes son: códigos de sponsor (máx 2), 20 trivias
        correctas (1), llenar tus picks 7d antes del torneo (1) y predecir ≥80%
        de marcadores antes del kickoff (1).
      </p>
    </header>

    <div class="container-app">
      @if (loading()) {
        <p>Cargando…</p>
      } @else if (comodines().length === 0) {
        <div class="empty-state">
          <h3>Aún no tienes comodines</h3>
          <p>
            Canjeá un código de sponsor en
            <a class="link-green" routerLink="/picks">tu home</a>
            o sumá 20 trivias correctas para conseguir tu primer comodín.
          </p>
        </div>
      } @else {
        <ul class="comodin-list">
          @for (c of comodines(); track c.id) {
            <li class="comodin-card" [class.comodin-card--expired]="c.status === 'EXPIRED'">
              <header class="comodin-card__head">
                <strong>{{ c.type ? typeInfo(c.type).name : 'Sin tipo elegido' }}</strong>
                <span class="comodin-card__status"
                      [class.is-pending]="c.status === 'PENDING_TYPE_CHOICE'"
                      [class.is-unassigned]="c.status === 'UNASSIGNED'"
                      [class.is-assigned]="c.status === 'ASSIGNED'"
                      [class.is-activated]="c.status === 'ACTIVATED'"
                      [class.is-expired]="c.status === 'EXPIRED'">
                  {{ statusLabel(c.status) }}
                </span>
              </header>
              @if (c.type) {
                <p class="comodin-card__impact">{{ typeInfo(c.type).impact }}</p>
              } @else {
                <p class="comodin-card__impact" style="color: var(--color-text-muted);">
                  Otorgado por {{ sourceLabel(c.source) }}. Elige uno de los 9
                  tipos disponibles para activarlo.
                </p>
              }
              <p class="comodin-card__meta">
                Fuente: <strong>{{ sourceLabel(c.source) }}</strong>
                · Obtenido: {{ formatDate(c.createdAt) }}
              </p>
              @if (c.type) {
                <p class="comodin-card__window">⏱ {{ typeInfo(c.type).window }}</p>
              }
              @if (c.status === 'PENDING_TYPE_CHOICE') {
                <button class="btn btn--primary btn--sm" type="button"
                        (click)="openClaimModal(c)"
                        style="margin-top: var(--space-sm); justify-self: start;">
                  Elegir tipo →
                </button>
              } @else if (c.status === 'UNASSIGNED') {
                <p class="form-card__hint" style="margin-top: var(--space-sm);">
                  La asignación llega en la próxima fase del rollout.
                </p>
              }
            </li>
          }
        </ul>
      }
    </div>

    <!-- Modal Elegir tipo -->
    @if (claiming()) {
      @let pending = claiming()!;
      <div class="claim-overlay" role="dialog" aria-modal="true"
           (click)="closeClaimModal()">
        <div class="claim-modal" (click)="$event.stopPropagation()">
          <header class="claim-modal__head">
            <h2>Elegir tipo de comodín</h2>
            <button type="button" class="claim-modal__x" (click)="closeClaimModal()">×</button>
          </header>
          <p class="form-card__hint">
            Otorgado por <strong>{{ sourceLabel(pending.source) }}</strong>.
            Elegí uno de los 9 tipos. Los que ya tenés activos están deshabilitados.
            La elección es <strong>vinculante</strong> — no se puede cambiar después.
          </p>
          <ul class="claim-options">
            @for (t of ALL_TYPES; track t) {
              @let owned = ownedTypes().has(t);
              <li>
                <button type="button" class="claim-option"
                        [disabled]="owned || claimingNow()"
                        [class.is-owned]="owned"
                        (click)="confirmClaim(pending, t)">
                  <strong>{{ typeInfo(t).name }}</strong>
                  <span>{{ typeInfo(t).impact }}</span>
                  @if (owned) {
                    <small style="color: var(--color-lost, #c33);">Ya tenés este tipo</small>
                  }
                </button>
              </li>
            }
          </ul>
        </div>
      </div>
    }
  `,
  styles: [`
    .comodin-list {
      list-style: none;
      padding: 0;
      margin: 0;
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
      gap: var(--space-md);
    }
    .comodin-card {
      background: var(--color-primary-white);
      border: var(--border-grey);
      border-radius: var(--radius-md);
      padding: var(--space-md);
      display: grid;
      gap: var(--space-xs);
    }
    .comodin-card--expired { opacity: 0.55; }
    .comodin-card__head {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      gap: var(--space-sm);
    }
    .comodin-card__head strong {
      font-family: var(--font-display);
      font-size: var(--fs-lg);
      text-transform: uppercase;
      line-height: 1;
    }
    .comodin-card__status {
      font-size: var(--fs-xs);
      text-transform: uppercase;
      letter-spacing: 0.06em;
      padding: 3px 8px;
      border-radius: 999px;
      background: rgba(0,0,0,0.06);
    }
    .comodin-card__status.is-pending {
      background: rgba(0, 130, 255, 0.18);
      color: #1d6fc4;
    }
    .comodin-card__status.is-unassigned {
      background: rgba(255,200,0,0.18);
      color: var(--color-primary-black);
    }
    .comodin-card__status.is-assigned {
      background: rgba(0,200,100,0.14);
      color: var(--color-primary-green);
    }
    .comodin-card__status.is-activated {
      background: var(--color-primary-green);
      color: var(--color-primary-white);
    }
    .comodin-card__status.is-expired {
      background: rgba(220,50,50,0.10);
      color: var(--color-lost, #c33);
    }
    .comodin-card__impact { font-size: var(--fs-sm); line-height: 1.4; }
    .comodin-card__meta {
      font-size: var(--fs-xs);
      color: var(--color-text-muted);
    }
    .comodin-card__window {
      font-size: var(--fs-xs);
      color: var(--color-text-muted);
      font-style: italic;
    }

    /* Modal Elegir tipo */
    .claim-overlay {
      position: fixed; inset: 0;
      background: rgba(0,0,0,0.55);
      display: flex; align-items: center; justify-content: center;
      z-index: 1000; padding: var(--space-md);
    }
    .claim-modal {
      max-width: 720px; width: 100%;
      max-height: 88vh; overflow-y: auto;
      background: var(--color-primary-white);
      border-radius: var(--radius-md);
      padding: var(--space-lg);
    }
    .claim-modal__head {
      display: flex; justify-content: space-between; align-items: center;
      margin-bottom: var(--space-sm);
    }
    .claim-modal__head h2 {
      font-family: var(--font-display);
      font-size: var(--fs-2xl);
      text-transform: uppercase;
      line-height: 1; margin: 0;
    }
    .claim-modal__x {
      background: transparent; border: 0;
      font-size: 28px; line-height: 1; cursor: pointer;
      color: var(--color-text-muted);
    }
    .claim-options {
      list-style: none; padding: 0; margin: var(--space-md) 0 0;
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
      gap: var(--space-sm);
    }
    .claim-option {
      width: 100%; text-align: left;
      background: var(--color-primary-grey, #f4f4f4);
      border: 2px solid transparent;
      border-radius: var(--radius-sm);
      padding: var(--space-md);
      cursor: pointer;
      display: grid; gap: 4px;
      transition: border 100ms;
    }
    .claim-option:hover:not(:disabled) {
      border-color: var(--color-primary-green);
    }
    .claim-option:disabled, .claim-option.is-owned {
      cursor: not-allowed; opacity: 0.5;
    }
    .claim-option strong {
      font-family: var(--font-display);
      font-size: var(--fs-md);
      text-transform: uppercase;
      line-height: 1;
    }
    .claim-option span {
      font-size: var(--fs-xs);
      color: var(--color-text-muted);
      line-height: 1.3;
    }
  `],
})
export class ComodinesListComponent implements OnInit {
  private api = inject(ApiService);
  private auth = inject(AuthService);
  private toast = inject(ToastService);

  ALL_TYPES = ALL_TYPES;

  loading = signal(true);
  comodines = signal<ComodinRow[]>([]);

  // Modal "Elegir tipo": el comodín que se está claimeando.
  claiming = signal<ComodinRow | null>(null);
  claimingNow = signal(false);

  // Tipos que el user ya tiene (excluyendo EXPIRED) — usado para
  // deshabilitar opciones en el modal.
  ownedTypes = computed(() => {
    const set = new Set<ComodinType>();
    for (const c of this.comodines()) {
      if (c.type && c.status !== 'EXPIRED') set.add(c.type);
    }
    return set;
  });

  // El "techo" cuenta solo los que no están EXPIRED (un comodín caducado
  // libera el slot, mismo criterio que usa el backend).
  activeCount = computed(() =>
    this.comodines().filter((c) => c.status !== 'EXPIRED').length,
  );
  unassignedCount = computed(() =>
    this.comodines().filter((c) => c.status === 'UNASSIGNED').length,
  );
  assignedCount = computed(() =>
    this.comodines().filter((c) => c.status === 'ASSIGNED').length,
  );

  typeInfo(t: ComodinType) { return TYPE_INFO[t]; }
  sourceLabel(s: ComodinSource) { return SOURCE_LABEL[s]; }
  statusLabel(s: ComodinStatus) { return STATUS_LABEL[s]; }

  openClaimModal(c: ComodinRow) {
    this.claiming.set(c);
  }
  closeClaimModal() {
    if (this.claimingNow()) return;
    this.claiming.set(null);
  }

  async confirmClaim(c: ComodinRow, type: ComodinType) {
    if (this.ownedTypes().has(type)) return;     // doble check
    this.claimingNow.set(true);
    try {
      const res = await this.api.claimComodinType(c.id, type);
      if (res?.errors && res.errors.length > 0) {
        this.toast.error(res.errors[0]?.message ?? 'No se pudo elegir tipo');
        return;
      }
      this.toast.success(`Tipo elegido: ${TYPE_INFO[type].name}`);
      this.claiming.set(null);
      // refrescar
      const userId = this.auth.user()?.sub;
      if (userId) {
        const list = await this.api.listMyComodines(userId, TOURNAMENT_ID);
        const rows = ((list.data ?? []) as ComodinRow[])
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
        this.comodines.set(rows);
      }
    } catch (e) {
      this.toast.error(humanizeError(e));
    } finally {
      this.claimingNow.set(false);
    }
  }

  formatDate(iso: string): string {
    try {
      return new Date(iso).toLocaleString('es-EC', {
        day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
      });
    } catch { return iso; }
  }

  async ngOnInit() {
    const userId = this.auth.user()?.sub;
    if (!userId) { this.loading.set(false); return; }
    try {
      const res = await this.api.listMyComodines(userId, TOURNAMENT_ID);
      const rows = ((res.data ?? []) as ComodinRow[])
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      this.comodines.set(rows);
    } finally {
      this.loading.set(false);
    }
  }
}
