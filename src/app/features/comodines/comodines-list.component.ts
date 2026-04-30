import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
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
type ComodinStatus = 'PENDING_TYPE_CHOICE' | 'UNASSIGNED' | 'ASSIGNED' | 'ACTIVATED' | 'EXPIRED';

interface ComodinRow {
  id: string;
  type: ComodinType | null;       // null en PENDING_TYPE_CHOICE
  source: ComodinSource;
  status: ComodinStatus;
  createdAt: string;
  // Target — set cuando status pasa a ASSIGNED. Forma depende del tipo.
  assignedMatchId?: string | null;
  assignedPhaseOrder?: number | null;
  assignedGroupLetter?: string | null;
  assignedPositionIndex?: number | null;
  assignedTeamSlug?: string | null;
  assignedComodinId?: string | null;
}

interface MatchOption {
  id: string;
  label: string;             // "ECU vs ARG · 14 jun 18:00"
  kickoffAt: string;
  phaseOrder: number;
}

interface TeamOption { slug: string; name: string; }

const ASSIGNABLE_TYPES = new Set<ComodinType>([
  'MULTIPLIER_X2', 'PHASE_BOOST', 'GROUP_SAFE_PICK',
  'BRACKET_SAFE_PICK', 'ANTI_PENALTY',
]);

// Tipos "activos" que se ejercen vía mutation propia (no asignación pasiva).
const USABLE_TYPES = new Set<ComodinType>([
  'LATE_EDIT', 'REASSIGN_CHAMP_RUNNER', 'GROUP_RESET', 'BRACKET_RESET',
]);

const PHASE_LABELS: Record<number, string> = {
  3: 'Octavos (R16)',
  4: 'Cuartos',
  5: 'Semifinales',
  6: 'Finalistas',
};

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
  PENDING_TYPE_CHOICE: 'Elige tipo',
  UNASSIGNED: 'Sin asignar',
  ASSIGNED: 'Asignado',
  ACTIVATED: 'Activado',
  EXPIRED: 'Caducado',
};

@Component({
  standalone: true,
  selector: 'app-comodines-list',
  imports: [RouterLink, FormsModule],
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
              } @else if (c.status === 'UNASSIGNED' && canAssign(c.type)) {
                <button class="btn btn--primary btn--sm" type="button"
                        (click)="openAssignModal(c)"
                        style="margin-top: var(--space-sm); justify-self: start;">
                  Asignar →
                </button>
              } @else if (c.status === 'UNASSIGNED' && canUse(c.type)) {
                <button class="btn btn--primary btn--sm" type="button"
                        (click)="openUseModal(c)"
                        style="margin-top: var(--space-sm); justify-self: start;">
                  Usar →
                </button>
              } @else if (c.status === 'ASSIGNED') {
                <p class="comodin-card__assigned">
                  ✓ Asignado a <strong>{{ formatTarget(c) }}</strong>
                </p>
              }
            </li>
          }
        </ul>
      }
    </div>

    <!-- Modal Asignar -->
    @if (assigning()) {
      @let comodin = assigning()!;
      <div class="claim-overlay" role="dialog" aria-modal="true"
           (click)="closeAssignModal()">
        <div class="claim-modal" (click)="$event.stopPropagation()">
          <header class="claim-modal__head">
            <h2>Asignar: {{ comodin.type ? typeInfo(comodin.type).name : '' }}</h2>
            <button type="button" class="claim-modal__x" (click)="closeAssignModal()">×</button>
          </header>
          <p class="form-card__hint">{{ comodin.type ? typeInfo(comodin.type).impact : '' }}</p>
          <p class="form-card__hint" style="margin-top: var(--space-xs);">
            ⚠ La asignación es <strong>vinculante</strong>: una vez confirmada
            no se puede mover ni cancelar.
          </p>

          <!-- Form por tipo -->
          @switch (comodin.type) {
            @case ('MULTIPLIER_X2') {
              <div class="form-card__field" style="margin-top: var(--space-md);">
                <label class="form-card__label">Partido (grupos / R32 / R16)</label>
                @if (assignLoadingOptions()) {
                  <p class="form-card__hint">Cargando partidos…</p>
                } @else if (matchOptions().length === 0) {
                  <p class="form-card__hint" style="color: var(--color-lost);">
                    No hay partidos elegibles próximos.
                  </p>
                } @else {
                  <select class="form-card__input" [(ngModel)]="selMatchId">
                    <option value="">— elige un partido —</option>
                    @for (m of matchOptions(); track m.id) {
                      <option [value]="m.id">{{ m.label }}</option>
                    }
                  </select>
                }
              </div>
            }

            @case ('PHASE_BOOST') {
              <div class="form-card__field" style="margin-top: var(--space-md);">
                <label class="form-card__label">Fase a boostear (x1.5)</label>
                <div style="display: flex; gap: var(--space-sm);">
                  <label class="phase-radio">
                    <input type="radio" name="boost-phase" [value]="3"
                           [(ngModel)]="selPhaseOrder">
                    <span>Octavos (R16)</span>
                  </label>
                  <label class="phase-radio">
                    <input type="radio" name="boost-phase" [value]="4"
                           [(ngModel)]="selPhaseOrder">
                    <span>Cuartos</span>
                  </label>
                </div>
              </div>
            }

            @case ('GROUP_SAFE_PICK') {
              <div style="display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-sm); margin-top: var(--space-md);">
                <div class="form-card__field" style="margin: 0;">
                  <label class="form-card__label">Grupo</label>
                  <select class="form-card__input" [(ngModel)]="selGroupLetter">
                    <option value="">—</option>
                    @for (l of GROUP_LETTERS; track l) {
                      <option [value]="l">Grupo {{ l }}</option>
                    }
                  </select>
                </div>
                <div class="form-card__field" style="margin: 0;">
                  <label class="form-card__label">Posición a asegurar</label>
                  <select class="form-card__input" [(ngModel)]="selPositionIndex">
                    <option [value]="0">—</option>
                    <option [value]="1">1° (primer puesto)</option>
                    <option [value]="2">2° (segundo puesto)</option>
                    <option [value]="3">3° (tercer puesto)</option>
                    <option [value]="4">4° (último)</option>
                  </select>
                </div>
              </div>
            }

            @case ('BRACKET_SAFE_PICK') {
              <div style="display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-sm); margin-top: var(--space-md);">
                <div class="form-card__field" style="margin: 0;">
                  <label class="form-card__label">Equipo a asegurar</label>
                  @if (assignLoadingOptions()) {
                    <p class="form-card__hint">Cargando equipos…</p>
                  } @else {
                    <select class="form-card__input" [(ngModel)]="selTeamSlug">
                      <option value="">—</option>
                      @for (t of teamOptions(); track t.slug) {
                        <option [value]="t.slug">{{ t.name }}</option>
                      }
                    </select>
                  }
                </div>
                <div class="form-card__field" style="margin: 0;">
                  <label class="form-card__label">Fase</label>
                  <select class="form-card__input" [(ngModel)]="selPhaseOrder">
                    <option [value]="0">—</option>
                    <option [value]="3">Octavos (R16)</option>
                    <option [value]="4">Cuartos</option>
                    <option [value]="5">Semifinales</option>
                    <option [value]="6">Finalistas</option>
                  </select>
                </div>
              </div>
            }

            @case ('ANTI_PENALTY') {
              <div class="form-card__field" style="margin-top: var(--space-md);">
                <label class="form-card__label">Bracket Safe Pick a cubrir</label>
                @if (antiPenaltyTargets().length === 0) {
                  <p class="form-card__hint" style="color: var(--color-lost);">
                    Necesitas tener un Pick seguro de llaves <strong>ya asignado</strong>
                    para cubrirlo con anti-penalización.
                  </p>
                } @else {
                  <select class="form-card__input" [(ngModel)]="selTargetComodinId">
                    <option value="">—</option>
                    @for (t of antiPenaltyTargets(); track t.id) {
                      <option [value]="t.id">{{ formatTarget(t) }}</option>
                    }
                  </select>
                }
              </div>
            }
          }

          @if (assignError()) {
            <p class="form-card__hint" style="color: var(--color-lost); margin-top: var(--space-sm);">
              {{ assignError() }}
            </p>
          }

          <div style="display: flex; gap: var(--space-sm); margin-top: var(--space-lg); justify-content: flex-end;">
            <button type="button" class="btn btn--ghost"
                    [disabled]="assigningNow()"
                    (click)="closeAssignModal()">Cancelar</button>
            <button type="button" class="btn btn--primary"
                    [disabled]="assigningNow() || !canSubmit()"
                    (click)="submitAssign()">
              {{ assigningNow() ? 'Asignando…' : 'Confirmar asignación' }}
            </button>
          </div>
        </div>
      </div>
    }

    <!-- Modal Usar (tipos activos #5 #6 #7 #8) -->
    @if (using()) {
      @let comodin = using()!;
      <div class="claim-overlay" role="dialog" aria-modal="true"
           (click)="closeUseModal()">
        <div class="claim-modal" (click)="$event.stopPropagation()">
          <header class="claim-modal__head">
            <h2>Usar: {{ comodin.type ? typeInfo(comodin.type).name : '' }}</h2>
            <button type="button" class="claim-modal__x" (click)="closeUseModal()">×</button>
          </header>
          <p class="form-card__hint">{{ comodin.type ? typeInfo(comodin.type).impact : '' }}</p>
          <p class="form-card__hint" style="margin-top: var(--space-xs);">
            ⚠ Una vez ejercido, no se puede revertir. El comodín queda
            <strong>ACTIVATED</strong> y modifica tu pick correspondiente.
          </p>

          @switch (comodin.type) {
            @case ('LATE_EDIT') {
              <div class="form-card__field" style="margin-top: var(--space-md);">
                <label class="form-card__label">Partido en vivo (grupos · 0–15 min post-kickoff)</label>
                @if (assignLoadingOptions()) {
                  <p class="form-card__hint">Cargando…</p>
                } @else if (lateEditMatches().length === 0) {
                  <p class="form-card__hint" style="color: var(--color-lost);">
                    No hay partidos elegibles ahora mismo (la ventana es 15 min post-kickoff de un grupo).
                  </p>
                } @else {
                  <select class="form-card__input" [(ngModel)]="selMatchId">
                    <option value="">— elige un partido —</option>
                    @for (m of lateEditMatches(); track m.id) {
                      <option [value]="m.id">{{ m.label }}</option>
                    }
                  </select>
                }
              </div>
              <div style="display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-sm); margin-top: var(--space-sm);">
                <div class="form-card__field" style="margin: 0;">
                  <label class="form-card__label">Marcador local</label>
                  <input class="form-card__input" type="number" min="0" max="20"
                         [(ngModel)]="selHomeScore">
                </div>
                <div class="form-card__field" style="margin: 0;">
                  <label class="form-card__label">Marcador visitante</label>
                  <input class="form-card__input" type="number" min="0" max="20"
                         [(ngModel)]="selAwayScore">
                </div>
              </div>
            }

            @case ('REASSIGN_CHAMP_RUNNER') {
              <div class="form-card__field" style="margin-top: var(--space-md);">
                <label class="form-card__label">¿Qué pick reasignar?</label>
                <div style="display: flex; gap: var(--space-sm);">
                  <label class="phase-radio">
                    <input type="radio" name="reassign-special" value="CHAMPION"
                           [(ngModel)]="selSpecialType">
                    <span>Campeón</span>
                  </label>
                  <label class="phase-radio">
                    <input type="radio" name="reassign-special" value="RUNNER_UP"
                           [(ngModel)]="selSpecialType">
                    <span>Subcampeón</span>
                  </label>
                </div>
              </div>
              <div class="form-card__field" style="margin-top: var(--space-sm);">
                <label class="form-card__label">Nuevo equipo</label>
                @if (assignLoadingOptions()) {
                  <p class="form-card__hint">Cargando equipos…</p>
                } @else {
                  <select class="form-card__input" [(ngModel)]="selTeamSlug">
                    <option value="">— elige equipo —</option>
                    @for (t of teamOptions(); track t.slug) {
                      <option [value]="t.slug">{{ t.name }}</option>
                    }
                  </select>
                }
              </div>
            }

            @case ('GROUP_RESET') {
              <div class="form-card__field" style="margin-top: var(--space-md);">
                <label class="form-card__label">Grupo a reordenar</label>
                <select class="form-card__input" [(ngModel)]="selGroupLetter"
                        (change)="onGroupResetGroupChange()">
                  <option value="">—</option>
                  @for (l of GROUP_LETTERS; track l) {
                    <option [value]="l">Grupo {{ l }}</option>
                  }
                </select>
              </div>
              @if (selGroupLetter && groupResetTeams().length === 4) {
                <p class="form-card__hint" style="margin-top: var(--space-sm);">
                  Reordena los 4 equipos de tu pick original (no se puede agregar/quitar):
                </p>
                <div style="display: grid; gap: var(--space-xs); margin-top: var(--space-sm);">
                  @for (pos of [1,2,3,4]; track pos) {
                    <div class="form-card__field" style="margin: 0; display: flex; align-items: center; gap: var(--space-sm);">
                      <strong style="min-width: 36px;">{{ pos }}°</strong>
                      <select class="form-card__input" style="flex: 1;"
                              [ngModel]="groupResetSelections()[pos - 1]"
                              (ngModelChange)="setGroupResetSelection(pos - 1, $event)">
                        <option value="">—</option>
                        @for (t of groupResetTeams(); track t) {
                          <option [value]="t">{{ teamName(t) }}</option>
                        }
                      </select>
                    </div>
                  }
                </div>
              } @else if (selGroupLetter) {
                <p class="form-card__hint" style="color: var(--color-lost); margin-top: var(--space-sm);">
                  No tienes pick previo en este grupo (modo completo).
                </p>
              }
            }

            @case ('BRACKET_RESET') {
              <div class="form-card__field" style="margin-top: var(--space-md);">
                <label class="form-card__label">Fase a resetear</label>
                <select class="form-card__input" [(ngModel)]="selPhaseOrder"
                        (change)="onBracketResetPhaseChange()">
                  <option [value]="0">—</option>
                  <option [value]="3">Octavos (R16) — 8 equipos</option>
                  <option [value]="4">Cuartos — 4 equipos</option>
                  <option [value]="5">Semifinales — 2 equipos</option>
                </select>
              </div>
              @if (bracketResetSize() > 0) {
                <p class="form-card__hint" style="margin-top: var(--space-sm);">
                  Elige los {{ bracketResetSize() }} equipos que avanzan a esta fase
                  (todos siguen en competencia):
                </p>
                @if (assignLoadingOptions()) {
                  <p class="form-card__hint">Cargando equipos…</p>
                } @else {
                  <div style="display: grid; gap: var(--space-xs); margin-top: var(--space-sm);">
                    @for (idx of bracketResetSlots(); track idx) {
                      <select class="form-card__input"
                              [ngModel]="bracketResetSelections()[idx]"
                              (ngModelChange)="setBracketResetSelection(idx, $event)">
                        <option value="">— equipo {{ idx + 1 }} —</option>
                        @for (t of teamOptions(); track t.slug) {
                          <option [value]="t.slug">{{ t.name }}</option>
                        }
                      </select>
                    }
                  </div>
                }
              }
            }
          }

          @if (assignError()) {
            <p class="form-card__hint" style="color: var(--color-lost); margin-top: var(--space-sm);">
              {{ assignError() }}
            </p>
          }

          <div style="display: flex; gap: var(--space-sm); margin-top: var(--space-lg); justify-content: flex-end;">
            <button type="button" class="btn btn--ghost"
                    [disabled]="assigningNow()"
                    (click)="closeUseModal()">Cancelar</button>
            <button type="button" class="btn btn--primary"
                    [disabled]="assigningNow() || !canSubmitUse()"
                    (click)="submitUse()">
              {{ assigningNow() ? 'Aplicando…' : 'Confirmar' }}
            </button>
          </div>
        </div>
      </div>
    }

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
      border: 1px solid var(--wf-line);
      border-left: 3px solid var(--wf-line);
      border-radius: 12px;
      padding: var(--space-md);
      display: grid;
      gap: var(--space-xs);
    }
    /* Border-left coloreado por estado (wireframe vibe) */
    .comodin-card:has(.comodin-card__status.is-pending) {
      border-left-color: var(--wf-warn);
      background: var(--wf-warn-soft);
    }
    .comodin-card:has(.comodin-card__status.is-unassigned) { border-left-color: var(--wf-green); }
    .comodin-card:has(.comodin-card__status.is-assigned) { border-left-color: var(--wf-ink); }
    .comodin-card:has(.comodin-card__status.is-activated) { border-left-color: var(--wf-green); }
    .comodin-card--expired {
      opacity: 0.55;
      border-left-color: var(--wf-danger);
    }
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
    .comodin-card__assigned {
      font-size: var(--fs-sm);
      color: var(--color-primary-green);
      margin-top: var(--space-sm);
      padding: var(--space-xs) var(--space-sm);
      background: rgba(0,200,100,0.10);
      border-radius: var(--radius-sm);
    }
    .phase-radio {
      flex: 1;
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 8px 12px;
      background: var(--color-primary-grey, #f4f4f4);
      border-radius: var(--radius-sm);
      cursor: pointer;
    }
    .phase-radio input { margin: 0; }

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
      border-radius: 12px;
      padding: var(--space-lg);
      box-shadow: 0 12px 40px rgba(0,0,0,0.3);
    }
    .claim-modal__head {
      display: flex; justify-content: space-between; align-items: center;
      margin-bottom: var(--space-sm);
    }
    .claim-modal__head h2 {
      font-family: var(--font-display);
      font-size: 24px;
      letter-spacing: 0.04em;
      line-height: 1.05; margin: 0;
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
      background: var(--wf-fill);
      border: 1.5px solid var(--wf-line);
      border-radius: 10px;
      padding: var(--space-md);
      cursor: pointer;
      display: grid; gap: 4px;
      transition: border 100ms, background 100ms;
    }
    .claim-option:hover:not(:disabled) {
      border-color: var(--color-primary-green);
      background: var(--wf-paper);
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
  GROUP_LETTERS = ['A','B','C','D','E','F','G','H'];

  loading = signal(true);
  comodines = signal<ComodinRow[]>([]);

  // Modal "Elegir tipo": el comodín que se está claimeando.
  claiming = signal<ComodinRow | null>(null);
  claimingNow = signal(false);

  // Modal "Asignar": el comodín que se está asignando + state del form.
  assigning = signal<ComodinRow | null>(null);
  assigningNow = signal(false);
  assignError = signal<string | null>(null);
  assignLoadingOptions = signal(false);
  matchOptions = signal<MatchOption[]>([]);
  teamOptions = signal<TeamOption[]>([]);
  selMatchId = '';
  selPhaseOrder = 0;
  selGroupLetter = '';
  selPositionIndex = 0;
  selTeamSlug = '';
  selTargetComodinId = '';

  // Modal "Usar" (tipos activos #5–#8). Comparte assigningNow + assignError.
  using = signal<ComodinRow | null>(null);
  selHomeScore = 0;
  selAwayScore = 0;
  selSpecialType: 'CHAMPION' | 'RUNNER_UP' | '' = '';
  lateEditMatches = signal<MatchOption[]>([]);
  groupResetTeams = signal<string[]>([]);     // teams del pick original del user en el grupo
  groupResetSelections = signal<string[]>(['', '', '', '']);
  bracketResetSelections = signal<string[]>([]);

  bracketResetSize = computed(() => {
    const o = this.selPhaseOrder;
    if (o === 3) return 8;
    if (o === 4) return 4;
    if (o === 5) return 2;
    return 0;
  });
  bracketResetSlots = computed(() => {
    return Array.from({ length: this.bracketResetSize() }, (_, i) => i);
  });

  antiPenaltyTargets = computed(() =>
    this.comodines().filter((c) =>
      c.type === 'BRACKET_SAFE_PICK' && c.status === 'ASSIGNED',
    ),
  );

  canAssign(t: ComodinType | null): boolean {
    return !!t && ASSIGNABLE_TYPES.has(t);
  }
  canUse(t: ComodinType | null): boolean {
    return !!t && USABLE_TYPES.has(t);
  }
  canSubmitUse(): boolean {
    const c = this.using();
    if (!c) return false;
    switch (c.type) {
      case 'LATE_EDIT':
        return !!this.selMatchId
          && this.selHomeScore >= 0 && this.selHomeScore <= 20
          && this.selAwayScore >= 0 && this.selAwayScore <= 20;
      case 'REASSIGN_CHAMP_RUNNER':
        return (this.selSpecialType === 'CHAMPION' || this.selSpecialType === 'RUNNER_UP')
          && !!this.selTeamSlug;
      case 'GROUP_RESET': {
        const sel = this.groupResetSelections();
        return !!this.selGroupLetter
          && sel.length === 4
          && sel.every((s) => !!s)
          && new Set(sel).size === 4;
      }
      case 'BRACKET_RESET': {
        const sel = this.bracketResetSelections();
        const size = this.bracketResetSize();
        return size > 0
          && sel.length === size
          && sel.every((s) => !!s)
          && new Set(sel).size === size;
      }
      default: return false;
    }
  }
  teamName(slug: string): string {
    return this.teamOptions().find((t) => t.slug === slug)?.name ?? slug;
  }
  setGroupResetSelection(idx: number, val: string) {
    this.groupResetSelections.update((arr) => {
      const next = [...arr];
      next[idx] = val;
      return next;
    });
  }
  setBracketResetSelection(idx: number, val: string) {
    this.bracketResetSelections.update((arr) => {
      const next = [...arr];
      next[idx] = val;
      return next;
    });
  }
  onGroupResetGroupChange() {
    void this.loadGroupResetTeams();
  }
  onBracketResetPhaseChange() {
    const size = this.bracketResetSize();
    this.bracketResetSelections.set(Array.from({ length: size }, () => ''));
  }

  canSubmit(): boolean {
    const c = this.assigning();
    if (!c) return false;
    switch (c.type) {
      case 'MULTIPLIER_X2':         return !!this.selMatchId;
      case 'PHASE_BOOST':           return this.selPhaseOrder === 3 || this.selPhaseOrder === 4;
      case 'GROUP_SAFE_PICK':       return !!this.selGroupLetter && this.selPositionIndex >= 1 && this.selPositionIndex <= 4;
      case 'BRACKET_SAFE_PICK':     return !!this.selTeamSlug && this.selPhaseOrder >= 3 && this.selPhaseOrder <= 6;
      case 'ANTI_PENALTY':          return !!this.selTargetComodinId;
      default: return false;
    }
  }

  formatTarget(c: ComodinRow): string {
    switch (c.type) {
      case 'MULTIPLIER_X2': {
        const m = this.matchOptions().find((x) => x.id === c.assignedMatchId);
        return m?.label ?? `partido ${c.assignedMatchId ?? '?'}`;
      }
      case 'PHASE_BOOST':
        return PHASE_LABELS[c.assignedPhaseOrder ?? 0] ?? `fase ${c.assignedPhaseOrder}`;
      case 'GROUP_SAFE_PICK':
        return `Grupo ${c.assignedGroupLetter} · pos ${c.assignedPositionIndex}°`;
      case 'BRACKET_SAFE_PICK': {
        const teamName = this.teamOptions().find((t) => t.slug === c.assignedTeamSlug)?.name ?? c.assignedTeamSlug;
        return `${teamName} en ${PHASE_LABELS[c.assignedPhaseOrder ?? 0] ?? `fase ${c.assignedPhaseOrder}`}`;
      }
      case 'ANTI_PENALTY': {
        const t = this.comodines().find((x) => x.id === c.assignedComodinId);
        return t ? `Anti-pen sobre: ${this.formatTarget(t)}` : 'safe pick desconocido';
      }
      default: return '—';
    }
  }

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

  async openAssignModal(c: ComodinRow) {
    this.assigning.set(c);
    this.selMatchId = '';
    this.selPhaseOrder = 0;
    this.selGroupLetter = '';
    this.selPositionIndex = 0;
    this.selTeamSlug = '';
    this.selTargetComodinId = '';
    this.assignError.set(null);

    // Cargar options según el tipo
    if (c.type === 'MULTIPLIER_X2') {
      await this.loadMatchOptions();
    } else if (c.type === 'BRACKET_SAFE_PICK') {
      await this.loadTeamOptions();
    }
  }

  closeAssignModal() {
    if (this.assigningNow()) return;
    this.assigning.set(null);
    this.assignError.set(null);
  }

  async openUseModal(c: ComodinRow) {
    this.using.set(c);
    this.selMatchId = '';
    this.selPhaseOrder = 0;
    this.selGroupLetter = '';
    this.selTeamSlug = '';
    this.selSpecialType = '';
    this.selHomeScore = 0;
    this.selAwayScore = 0;
    this.groupResetTeams.set([]);
    this.groupResetSelections.set(['', '', '', '']);
    this.bracketResetSelections.set([]);
    this.assignError.set(null);

    if (c.type === 'LATE_EDIT') {
      await this.loadLateEditMatches();
    } else if (c.type === 'REASSIGN_CHAMP_RUNNER' || c.type === 'BRACKET_RESET') {
      await this.loadTeamOptions();
    }
    // GROUP_RESET: teams del grupo se cargan al elegir el grupo letter.
  }

  closeUseModal() {
    if (this.assigningNow()) return;
    this.using.set(null);
    this.assignError.set(null);
  }

  private async loadLateEditMatches() {
    this.assignLoadingOptions.set(true);
    try {
      const [matchesRes, phasesRes, teamsRes] = await Promise.all([
        this.api.listMatches(TOURNAMENT_ID),
        this.api.listPhases(TOURNAMENT_ID),
        this.api.listTeams(TOURNAMENT_ID),
      ]);
      const phaseOrderById = new Map<string, number>();
      for (const p of phasesRes.data ?? []) phaseOrderById.set(p.id, p.order);
      const teamNameBySlug = new Map<string, string>();
      for (const t of teamsRes.data ?? []) teamNameBySlug.set(t.slug, t.name);

      const now = Date.now();
      const opts: MatchOption[] = (matchesRes.data ?? [])
        .map((m) => ({
          id: m.id,
          kickoffAt: m.kickoffAt,
          phaseOrder: phaseOrderById.get(m.phaseId) ?? 0,
          home: teamNameBySlug.get(m.homeTeamId) ?? m.homeTeamId,
          away: teamNameBySlug.get(m.awayTeamId) ?? m.awayTeamId,
        }))
        // Solo grupos (phaseOrder=1) en ventana 0..15min post-kickoff
        .filter((m) => m.phaseOrder === 1)
        .filter((m) => {
          const k = Date.parse(m.kickoffAt);
          return now >= k && now <= k + 15 * 60_000;
        })
        .sort((a, b) => a.kickoffAt.localeCompare(b.kickoffAt))
        .map((m) => ({
          id: m.id,
          kickoffAt: m.kickoffAt,
          phaseOrder: m.phaseOrder,
          label: `${m.home} vs ${m.away} · iniciado ${this.shortDate(m.kickoffAt)}`,
        }));
      this.lateEditMatches.set(opts);
      // Aprovechamos que ya cargamos teams para el modal:
      this.teamOptions.set((teamsRes.data ?? [])
        .map((t) => ({ slug: t.slug, name: t.name }))
        .sort((a, b) => a.name.localeCompare(b.name)));
    } finally {
      this.assignLoadingOptions.set(false);
    }
  }

  private async loadGroupResetTeams() {
    if (!this.selGroupLetter) {
      this.groupResetTeams.set([]);
      return;
    }
    const userId = this.auth.user()?.sub;
    if (!userId) return;
    try {
      // Cargar el GroupStandingPick del user en modo completo, filtrar el grupo.
      const res = await this.api.listGroupStandingPicks(userId, 'COMPLETE');
      const pick = ((res.data ?? []) as Array<{
        groupLetter: string; pos1: string; pos2: string; pos3: string; pos4: string;
      }>).find((p) => p.groupLetter === this.selGroupLetter);
      if (pick) {
        this.groupResetTeams.set([pick.pos1, pick.pos2, pick.pos3, pick.pos4]);
        this.groupResetSelections.set([pick.pos1, pick.pos2, pick.pos3, pick.pos4]);
      } else {
        this.groupResetTeams.set([]);
      }
    } catch {
      this.groupResetTeams.set([]);
    }
  }

  async submitUse() {
    const c = this.using();
    if (!c || !this.canSubmitUse()) return;
    this.assignError.set(null);
    this.assigningNow.set(true);
    try {
      let res;
      switch (c.type) {
        case 'LATE_EDIT':
          res = await this.api.useLateEdit({
            comodinId: c.id, matchId: this.selMatchId,
            homeScorePred: this.selHomeScore, awayScorePred: this.selAwayScore,
          });
          break;
        case 'REASSIGN_CHAMP_RUNNER':
          res = await this.api.useReassignChampRunner({
            comodinId: c.id,
            specialType: this.selSpecialType as 'CHAMPION' | 'RUNNER_UP',
            newTeamSlug: this.selTeamSlug,
          });
          break;
        case 'GROUP_RESET': {
          const sel = this.groupResetSelections();
          res = await this.api.useGroupReset({
            comodinId: c.id, groupLetter: this.selGroupLetter,
            pos1: sel[0]!, pos2: sel[1]!, pos3: sel[2]!, pos4: sel[3]!,
          });
          break;
        }
        case 'BRACKET_RESET':
          res = await this.api.useBracketReset({
            comodinId: c.id, phaseOrder: this.selPhaseOrder,
            newPicks: [...this.bracketResetSelections()],
          });
          break;
      }
      if (res?.errors && res.errors.length > 0) {
        this.assignError.set(res.errors[0]?.message ?? 'No se pudo aplicar');
        return;
      }
      this.toast.success('Comodín ejercido');
      this.using.set(null);
      const userId = this.auth.user()?.sub;
      if (userId) {
        const list = await this.api.listMyComodines(userId, TOURNAMENT_ID);
        const rows = ((list.data ?? []) as ComodinRow[])
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
        this.comodines.set(rows);
      }
    } catch (e) {
      this.assignError.set(humanizeError(e));
    } finally {
      this.assigningNow.set(false);
    }
  }

  private async loadMatchOptions() {
    this.assignLoadingOptions.set(true);
    try {
      const [matchesRes, phasesRes, teamsRes] = await Promise.all([
        this.api.listMatches(TOURNAMENT_ID),
        this.api.listPhases(TOURNAMENT_ID),
        this.api.listTeams(TOURNAMENT_ID),
      ]);
      const phaseOrderById = new Map<string, number>();
      for (const p of phasesRes.data ?? []) phaseOrderById.set(p.id, p.order);
      const teamNameBySlug = new Map<string, string>();
      for (const t of teamsRes.data ?? []) teamNameBySlug.set(t.slug, t.name);

      const now = Date.now();
      const opts: MatchOption[] = (matchesRes.data ?? [])
        .map((m) => ({
          id: m.id,
          kickoffAt: m.kickoffAt,
          phaseOrder: phaseOrderById.get(m.phaseId) ?? 0,
          home: teamNameBySlug.get(m.homeTeamId) ?? m.homeTeamId,
          away: teamNameBySlug.get(m.awayTeamId) ?? m.awayTeamId,
        }))
        .filter((m) => m.phaseOrder >= 1 && m.phaseOrder <= 3 && Date.parse(m.kickoffAt) > now)
        .sort((a, b) => a.kickoffAt.localeCompare(b.kickoffAt))
        .map((m) => ({
          id: m.id,
          kickoffAt: m.kickoffAt,
          phaseOrder: m.phaseOrder,
          label: `${m.home} vs ${m.away} · ${this.shortDate(m.kickoffAt)} · ${this.phaseShort(m.phaseOrder)}`,
        }));
      this.matchOptions.set(opts);
    } finally {
      this.assignLoadingOptions.set(false);
    }
  }

  private async loadTeamOptions() {
    this.assignLoadingOptions.set(true);
    try {
      const teamsRes = await this.api.listTeams(TOURNAMENT_ID);
      const opts: TeamOption[] = (teamsRes.data ?? [])
        .map((t) => ({ slug: t.slug, name: t.name }))
        .sort((a, b) => a.name.localeCompare(b.name));
      this.teamOptions.set(opts);
    } finally {
      this.assignLoadingOptions.set(false);
    }
  }

  private shortDate(iso: string): string {
    try {
      return new Date(iso).toLocaleString('es-EC', {
        day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
      });
    } catch { return iso; }
  }
  private phaseShort(order: number): string {
    if (order === 1) return 'grupos';
    if (order === 2) return 'R32';
    if (order === 3) return 'R16';
    return `fase ${order}`;
  }

  async submitAssign() {
    const c = this.assigning();
    if (!c || !this.canSubmit()) return;
    this.assignError.set(null);
    this.assigningNow.set(true);
    try {
      const args: {
        comodinId: string; matchId?: string; phaseOrder?: number;
        groupLetter?: string; positionIndex?: number;
        teamSlug?: string; targetComodinId?: string;
      } = { comodinId: c.id };

      switch (c.type) {
        case 'MULTIPLIER_X2':         args.matchId = this.selMatchId; break;
        case 'PHASE_BOOST':           args.phaseOrder = this.selPhaseOrder; break;
        case 'GROUP_SAFE_PICK':
          args.groupLetter = this.selGroupLetter;
          args.positionIndex = this.selPositionIndex;
          break;
        case 'BRACKET_SAFE_PICK':
          args.teamSlug = this.selTeamSlug;
          args.phaseOrder = this.selPhaseOrder;
          break;
        case 'ANTI_PENALTY':          args.targetComodinId = this.selTargetComodinId; break;
      }

      const res = await this.api.assignComodin(args);
      if (res?.errors && res.errors.length > 0) {
        this.assignError.set(res.errors[0]?.message ?? 'No se pudo asignar');
        return;
      }
      this.toast.success('Comodín asignado');
      this.assigning.set(null);
      // Refrescar lista
      const userId = this.auth.user()?.sub;
      if (userId) {
        const list = await this.api.listMyComodines(userId, TOURNAMENT_ID);
        const rows = ((list.data ?? []) as ComodinRow[])
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
        this.comodines.set(rows);
      }
    } catch (e) {
      this.assignError.set(humanizeError(e));
    } finally {
      this.assigningNow.set(false);
    }
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
