import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ApiService } from '../../core/api/api.service';
import { AuthService } from '../../core/auth/auth.service';

const TOURNAMENT_ID = 'mundial-2026';

type ComodinType =
  | 'MULTIPLIER_X2' | 'PHASE_BOOST' | 'GROUP_SAFE_PICK' | 'BRACKET_SAFE_PICK'
  | 'REASSIGN_CHAMP_RUNNER' | 'LATE_EDIT' | 'BRACKET_RESET' | 'GROUP_RESET'
  | 'ANTI_PENALTY';

type ComodinSource = 'SPONSOR' | 'TRIVIA' | 'LOYALTY' | 'ENGAGEMENT';
type ComodinStatus = 'UNASSIGNED' | 'ASSIGNED' | 'ACTIVATED' | 'EXPIRED';

interface ComodinRow {
  id: string;
  type: ComodinType;
  source: ComodinSource;
  status: ComodinStatus;
  createdAt: string;
}

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
                <strong>{{ typeInfo(c.type).name }}</strong>
                <span class="comodin-card__status"
                      [class.is-unassigned]="c.status === 'UNASSIGNED'"
                      [class.is-assigned]="c.status === 'ASSIGNED'"
                      [class.is-activated]="c.status === 'ACTIVATED'"
                      [class.is-expired]="c.status === 'EXPIRED'">
                  {{ statusLabel(c.status) }}
                </span>
              </header>
              <p class="comodin-card__impact">{{ typeInfo(c.type).impact }}</p>
              <p class="comodin-card__meta">
                Fuente: <strong>{{ sourceLabel(c.source) }}</strong>
                · Obtenido: {{ formatDate(c.createdAt) }}
              </p>
              <p class="comodin-card__window">⏱ {{ typeInfo(c.type).window }}</p>
              @if (c.status === 'UNASSIGNED') {
                <p class="form-card__hint" style="margin-top: var(--space-sm);">
                  La asignación llega en la próxima fase del rollout.
                </p>
              }
            </li>
          }
        </ul>
      }
    </div>
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
  `],
})
export class ComodinesListComponent implements OnInit {
  private api = inject(ApiService);
  private auth = inject(AuthService);

  loading = signal(true);
  comodines = signal<ComodinRow[]>([]);

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
