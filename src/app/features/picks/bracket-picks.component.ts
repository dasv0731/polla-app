import { Component, HostListener, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { ActivatedRoute, Router, RouterLink, RouterLinkActive } from '@angular/router';
import { TeamFlagComponent } from '../../shared/ui/team-flag.component';
import { ApiService } from '../../core/api/api.service';
import { AuthService } from '../../core/auth/auth.service';
import { projectKnockoutTree, type ProjectionMissing } from '../../core/bracket/projected-bracket.service';
import { UserModesService } from '../../core/user/user-modes.service';
import { ToastService } from '../../core/notifications/toast.service';
import { TimeService } from '../../core/time/time.service';
import { humanizeError } from '../../core/notifications/domain-errors';
import { RailModalsService } from '../../core/layout/rail-modals.service';
import { PicksSyncService } from '../../core/sync/picks-sync.service';
import { GroupActionsService } from '../../core/groups/group-actions.service';
import { EmptyBlockComponent } from '../../shared/ui/empty-block/empty-block.component';
import { SkeletonComponent } from '../../shared/ui/skeleton/skeleton.component';
import { IconComponent } from '../../shared/ui/icon/icon.component';
import { ConfirmDialogService } from '../../shared/ui/confirm-dialog.service';

type GameMode = 'SIMPLE' | 'COMPLETE';

interface KnockoutMatch {
  id: string;
  phaseOrder: number;        // 2=R32(16avos), 3=R16(octavos), 4=cuartos, 5=semis, 6=final+3er
  homeTeamId: string;
  awayTeamId: string;
  kickoffAt: string;
  bracketPosition: number | null;
  status: string | null;
  homeScore: number | null;
  awayScore: number | null;
}

interface TeamLite {
  slug: string;
  name: string;
  flagCode: string;
}

const TOURNAMENT_ID = 'mundial-2026';
const STORAGE_KEY = (userId: string, mode: GameMode) => `polla-bracket-winners-${mode}-${userId}`;

/**
 * Bracket en formato wireframe Mundial 2026: tournament tree con 16avos
 * a ambos lados. 9 columnas: 16avos · Octavos · Cuartos · Semis · FINAL ·
 * Semis · Cuartos · Octavos · 16avos.
 *
 * Mapping bracketPosition → side:
 *  - 16avos (8+8): pos 1-8 izq, 9-16 der
 *  - Octavos (4+4): pos 1-4 izq, 5-8 der
 *  - Cuartos (2+2): pos 1-2 izq, 3-4 der
 *  - Semis (1+1):   pos 1 izq, 2 der
 *  - Final (1):     centro (bracketPosition 1)
 *  - 3er puesto (bracketPosition 2 dentro de phase 6): no se muestra
 *    en el grid (no scorea, queda fuera del visual del wireframe).
 */
@Component({
  standalone: true,
  selector: 'app-bracket-picks',
  imports: [
    RouterLink,
    RouterLinkActive,
    NgTemplateOutlet,
    TeamFlagComponent,
    EmptyBlockComponent,
    SkeletonComponent,
    IconComponent,
  ],
  template: `
    <section class="page">

      <!-- Header simplificado · stats canonicos viven en Home (A8b) -->
      <header class="page__header">
        <div>
          <div class="kicker">MUNDIAL 2026 · GOLGANA</div>
          <h1 class="page__title">Mis picks</h1>
        </div>
        <!-- Counter X/N prominent -->
        <div class="bracket-counter" aria-live="polite">
          <span class="bracket-counter__big">{{ pickedCount() }}<span class="bracket-counter__sep">/</span>{{ totalKnockoutMatches() }}</span>
          <span class="bracket-counter__lbl">predicciones</span>
        </div>
      </header>


      <nav class="page-tabs" aria-label="Vistas de picks">
        <a class="page-tabs__item" routerLink="/picks"
           routerLinkActive="is-active" [routerLinkActiveOptions]="{exact: true}">Cronológico</a>
        <a class="page-tabs__item" routerLink="/picks/group-stage"
           routerLinkActive="is-active">Tabla grupos</a>
        <a class="page-tabs__item is-active" routerLink="/picks/bracket">Bracket</a>
      </nav>

      <!-- Mode switch (si el user tiene > 1 modo) -->
      @if (availableModes().length > 1) {
        <div class="seg" style="max-width:280px;margin-bottom:14px;"
             role="tablist" aria-label="Modo de juego">
          @for (m of availableModes(); track m) {
            <button type="button" class="seg__item"
                    role="tab"
                    [attr.aria-selected]="mode() === m"
                    [class.is-active]="mode() === m"
                    (click)="switchMode(m)">
              {{ m === 'COMPLETE' ? 'Modo completo' : 'Modo simple' }}
            </button>
          }
        </div>
      }

      <!-- Intro: descripción + status + lock pill + scoring details -->
      <div class="bracket-intro">
        <p>
          Tu predicción de la fase eliminatoria. Click en un equipo para elegirlo como ganador.
        </p>
        <!-- Lock status as pill (was inline <br>) -->
        @if (bracketLocked()) {
          <span class="lock-pill lock-pill--locked">
            <app-icon name="lock" size="sm" />
            Bracket cerrado · {{ bracketLockFormatted() }}
          </span>
        } @else if (bracketLockFormatted()) {
          <span class="lock-pill">
            <app-icon name="clock" size="sm" />
            Cierra al kickoff de la 1ª llave · {{ bracketLockFormatted() }}
          </span>
        }
        <!-- Scoring table colapsable (sistema de puntos por fase) -->
        <details class="scoring-table">
          <summary>
            <app-icon name="trophy" size="sm" />
            Sistema de puntos por fase
          </summary>
          <table>
            <thead>
              <tr><th>Fase</th><th>Pts por equipo correcto</th></tr>
            </thead>
            <tbody>
              <tr><td>R32 (16avos)</td><td>+2 pts</td></tr>
              <tr><td>Octavos (R16)</td><td>+4 pts</td></tr>
              <tr><td>Cuartos</td><td>+8 pts</td></tr>
              <tr><td>Semifinal</td><td>+16 pts</td></tr>
              <tr><td>Final</td><td>+25 pts (campeón)</td></tr>
            </tbody>
          </table>
        </details>
        <div class="bracket-intro__actions" aria-live="polite">
          @if (saveStatus() === 'saving') {
            <span class="pill"><span aria-hidden="true">⏳ </span>Guardando…</span>
          } @else if (saveStatus() === 'saved') {
            <span class="pill pill--green">
              <app-icon name="check" size="sm" />Bracket guardado
            </span>
          } @else if (saveStatus() === 'dirty') {
            <span class="pill pill--warn"><span aria-hidden="true">● </span>Cambios sin guardar</span>
          } @else if (saveStatus() === 'error') {
            <span class="pill" role="alert" style="background:rgba(195,51,51,0.1);color:#c33;border-color:rgba(195,51,51,0.3);">
              <app-icon name="alert" size="sm" />Error
            </span>
          }
        </div>
      </div>

      <!-- Filter pills (visual; "Tu camino" hace dim al resto) -->
      <div class="bracket-filter" role="group" aria-label="Filtro del bracket">
        <button type="button" class="bracket-filter__pill"
                [attr.aria-pressed]="filter() === 'mine'"
                [class.is-active]="filter() === 'mine'"
                (click)="filter.set('mine')">Tu camino</button>
        <button type="button" class="bracket-filter__pill"
                [attr.aria-pressed]="filter() === 'all'"
                [class.is-active]="filter() === 'all'"
                (click)="filter.set('all')">Todos</button>
      </div>

      @if (loading()) {
        <app-skeleton variant="card" [count]="3" />
      } @else if (availableModes().length === 0) {
        <app-empty-block
          iconName="users"
          title="Sin grupos privados"
          sub="Necesitas pertenecer a al menos un grupo privado para usar el bracket.">
          <button type="button" class="btn-wf btn-wf--primary"
                  (click)="groupActions.openCreate()">Crear un grupo →</button>
          <button type="button" class="btn-wf btn-wf--ghost"
                  (click)="groupActions.openJoin()">Unirme con código →</button>
        </app-empty-block>
      } @else if (projectionMissing()) {
        @let miss = projectionMissing()!;
        <div class="empty-block">
          <h3>Para ver tu bracket primero termina tus predicciones</h3>
          <ul class="check-list">
            @if (miss.groupsWithoutFullStanding.length > 0) {
              <li>
                <span aria-hidden="true">⚠ </span>Faltan posiciones en {{ miss.groupsWithoutFullStanding.length }} grupo(s):
                {{ miss.groupsWithoutFullStanding.join(', ') }}
                <a routerLink="/picks/group-stage" [queryParams]="{ view: 'pred' }" class="btn-wf btn-wf--sm">
                  Ir a tabla de grupos <span aria-hidden="true">→</span>
                </a>
              </li>
            } @else {
              <li><span aria-hidden="true">✓ </span>Tablas de grupos completas</li>
            }
            @if (miss.thirdsCount !== 8) {
              <li>
                <span aria-hidden="true">⚠ </span>Marca exactamente 8 mejores 3.os (tienes {{ miss.thirdsCount }})
                <a routerLink="/picks/group-stage" [queryParams]="{ view: 'pred' }" class="btn-wf btn-wf--sm">
                  Ir a mis terceros <span aria-hidden="true">→</span>
                </a>
              </li>
            } @else {
              <li><span aria-hidden="true">✓ </span>8 mejores 3.os marcados</li>
            }
          </ul>
        </div>
      } @else {
        @if (isProjected()) {
          <div class="info-banner" style="margin-bottom:14px;padding:10px 12px;background:rgba(0,200,100,0.08);border:1px solid rgba(0,200,100,0.25);border-radius:8px;font-size:13px;color:var(--wf-ink-2);">
            <app-icon name="star" size="sm" /> Bracket armado desde tus predicciones de grupos.
            Tus elecciones aquí se quedan fijas — los resultados reales
            del Mundial puntúan tu BracketPick comparando equipos por fase.
          </div>
        }
        <!-- Mobile (<768px): accordion vertical por fase. -->
        <div class="bracket-mobile" role="region" aria-label="Bracket por fase">
          @for (phase of mobilePhases; track phase.order) {
            <details class="bracket-phase" [open]="isPhaseOpen(phase.order)" (toggle)="onPhaseToggle(phase.order, $event)">
              <summary class="bracket-phase__head">
                <span class="bracket-phase__title">{{ phase.label }}</span>
                <span class="bracket-phase__count">
                  {{ phaseCount(phase.order) }} {{ phaseCount(phase.order) === 1 ? 'llave' : 'llaves' }}
                </span>
                <span class="bracket-phase__chev" aria-hidden="true">▾</span>
              </summary>
              <div class="bracket-phase__body">
                @if (phase.order === 6) {
                  @let fm = finalMatch();
                  @if (fm) {
                    <div class="bracket-final-card">
                      <div class="bracket-final-card__title"><app-icon name="trophy" size="sm" /> FINAL</div>
                      <ng-container *ngTemplateOutlet="slotTpl; context: {match: fm, side: 'home'}"></ng-container>
                      <ng-container *ngTemplateOutlet="slotTpl; context: {match: fm, side: 'away'}"></ng-container>
                      @let champ = champion();
                      @if (champ) {
                        <div class="bracket-final-card__champion">
                          CAMPEÓN · <span translate="no">{{ champ }}</span>
                        </div>
                      }
                    </div>
                  } @else {
                    <div class="bracket-final-card">
                      <div class="bracket-final-card__title"><app-icon name="trophy" size="sm" /> FINAL</div>
                      <div class="text-mute" style="text-align:center;font-size:11px;padding:8px 4px;">
                        Aún sin definir
                      </div>
                    </div>
                  }
                } @else {
                  @for (m of matchesIn(phase.order, 'left'); track m.id) {
                    <ng-container *ngTemplateOutlet="matchTpl; context: {$implicit: m, prefix: phase.prefix}"></ng-container>
                  }
                  @for (m of matchesIn(phase.order, 'right'); track m.id) {
                    <ng-container *ngTemplateOutlet="matchTpl; context: {$implicit: m, prefix: phase.prefix}"></ng-container>
                  }
                }
              </div>
            </details>
          }
        </div>

        <!-- Desktop (≥768px): grid del bracket 9 columnas (16avos a ambos extremos) -->
        <div class="bracket-scroll">
          <div class="bracket-grid">

            <!-- Row 1: headers -->
            <div class="bracket-col-h">16avos</div>
            <div class="bracket-col-h">Octavos</div>
            <div class="bracket-col-h">Cuartos</div>
            <div class="bracket-col-h">Semis</div>
            <div class="bracket-col-h">Final</div>
            <div class="bracket-col-h">Semis</div>
            <div class="bracket-col-h">Cuartos</div>
            <div class="bracket-col-h">Octavos</div>
            <div class="bracket-col-h">16avos</div>

            <!-- Row 2: columnas con matches -->

            <!-- 16avos izq -->
            <div class="bracket-col bracket-col--16avos">
              @for (m of matchesIn(2, 'left'); track m.id) {
                <ng-container *ngTemplateOutlet="matchTpl; context: {$implicit: m, prefix: 'R32'}"></ng-container>
              }
            </div>

            <!-- Octavos izq -->
            <div class="bracket-col">
              @for (m of matchesIn(3, 'left'); track m.id) {
                <ng-container *ngTemplateOutlet="matchTpl; context: {$implicit: m, prefix: 'O'}"></ng-container>
              }
            </div>

            <!-- Cuartos izq -->
            <div class="bracket-col bracket-col--cuartos">
              @for (m of matchesIn(4, 'left'); track m.id) {
                <ng-container *ngTemplateOutlet="matchTpl; context: {$implicit: m, prefix: 'C'}"></ng-container>
              }
            </div>

            <!-- Semis izq -->
            <div class="bracket-col bracket-col--semis">
              @for (m of matchesIn(5, 'left'); track m.id) {
                <ng-container *ngTemplateOutlet="matchTpl; context: {$implicit: m, prefix: 'S'}"></ng-container>
              }
            </div>

            <!-- FINAL (centro) -->
            <div class="bracket-col bracket-col--final">
              @let fm = finalMatch();
              @if (fm) {
                <div class="bracket-final-card">
                  <div class="bracket-final-card__title"><app-icon name="trophy" size="sm" /> FINAL</div>
                  <ng-container *ngTemplateOutlet="slotTpl; context: {match: fm, side: 'home'}"></ng-container>
                  <ng-container *ngTemplateOutlet="slotTpl; context: {match: fm, side: 'away'}"></ng-container>
                  @let champ = champion();
                  @if (champ) {
                    <div class="bracket-final-card__champion">
                      CAMPEÓN · <span translate="no">{{ champ }}</span>
                    </div>
                  }
                </div>
              } @else {
                <div class="bracket-final-card">
                  <div class="bracket-final-card__title"><app-icon name="trophy" size="sm" /> FINAL</div>
                  <div class="text-mute" style="text-align:center;font-size:11px;padding:8px 4px;">
                    Aún sin definir
                  </div>
                </div>
              }
            </div>

            <!-- Semis der -->
            <div class="bracket-col bracket-col--semis">
              @for (m of matchesIn(5, 'right'); track m.id) {
                <ng-container *ngTemplateOutlet="matchTpl; context: {$implicit: m, prefix: 'S'}"></ng-container>
              }
            </div>

            <!-- Cuartos der -->
            <div class="bracket-col bracket-col--cuartos">
              @for (m of matchesIn(4, 'right'); track m.id) {
                <ng-container *ngTemplateOutlet="matchTpl; context: {$implicit: m, prefix: 'C'}"></ng-container>
              }
            </div>

            <!-- Octavos der -->
            <div class="bracket-col">
              @for (m of matchesIn(3, 'right'); track m.id) {
                <ng-container *ngTemplateOutlet="matchTpl; context: {$implicit: m, prefix: 'O'}"></ng-container>
              }
            </div>

            <!-- 16avos der -->
            <div class="bracket-col bracket-col--16avos">
              @for (m of matchesIn(2, 'right'); track m.id) {
                <ng-container *ngTemplateOutlet="matchTpl; context: {$implicit: m, prefix: 'R32'}"></ng-container>
              }
            </div>

          </div>
        </div>

        <!-- Leyenda completa · 6 estados (vs 2 anteriores) -->
        <div class="bracket-legend bracket-legend--full">
          <span class="bracket-legend__item" title="Equipo elegido por ti como ganador">
            <span class="bracket-legend__icon bracket-legend__icon--mine"></span>
            Tu predicción
          </span>
          <span class="bracket-legend__item" title="Equipo que ganó realmente (resultado FINAL) o que pasaría según tu proyección upstream">
            <span class="bracket-legend__icon bracket-legend__icon--win"></span>
            Ganador (real / proyectado)
          </span>
          <span class="bracket-legend__item" title="Equipo que elegiste pero ya fue eliminado por el resultado real">
            <span class="bracket-legend__icon bracket-legend__icon--discarded"></span>
            Descartado
          </span>
          <span class="bracket-legend__item" title="Slot bloqueado tras el kickoff de la primera llave">
            <span class="bracket-legend__icon bracket-legend__icon--locked">
              <app-icon name="lock" size="sm" />
            </span>
            Bloqueado
          </span>
          <span class="bracket-legend__item" title="Slot esperando el resultado de la fase anterior">
            <span class="bracket-legend__icon bracket-legend__icon--awaiting"></span>
            Esperando
          </span>
          <span class="bracket-legend__item" title="Slot editable (clickea para elegir)">
            <span class="bracket-legend__icon bracket-legend__icon--editable"></span>
            Editable
          </span>
        </div>
        <div class="bracket-legend__hint text-mute">
          @if (bracketLocked()) { Bloqueado, solo lectura. }
          @else { Click en un equipo para elegirlo como ganador. }
        </div>
      }

      <!-- Templates compartidos -->
      <ng-template #matchTpl let-m let-prefix="prefix">
        <div class="bracket-match" [style.opacity]="dimmedFor(m) ? 0.4 : 1">
          <span class="bracket-match__label">{{ prefix }}{{ m.bracketPosition }}</span>
          <ng-container *ngTemplateOutlet="slotTpl; context: {match: m, side: 'home'}"></ng-container>
          <ng-container *ngTemplateOutlet="slotTpl; context: {match: m, side: 'away'}"></ng-container>
        </div>
      </ng-template>

      <ng-template #slotTpl let-match="match" let-side="side">
        @let teamId = displayedTeam(match, side);
        @let team = teamMap().get(teamId);
        @let isEmpty = !teamId;
        @let isMine = !isEmpty && winners().get(match.id) === teamId;
        @let isWinner = !isEmpty && realWinner(match) === teamId;
        @let userPicked = winners().has(match.id);
        @let isDiscarded = userPicked && !isEmpty && !isMine && !isWinner;
        @let score = side === 'home' ? match.homeScore : match.awayScore;
        <button type="button" class="bracket-slot"
                [class.bracket-slot--win]="isWinner"
                [class.bracket-slot--mine]="isMine"
                [class.bracket-slot--discarded]="isDiscarded"
                [class.bracket-slot--locked]="bracketLocked()"
                [class.bracket-slot--empty]="isEmpty"
                [disabled]="bracketLocked() || isEmpty"
                (click)="pickWinner(match.id, teamId)">
          @if (isEmpty) {
            <span class="bracket-slot__team bracket-slot__placeholder">
              {{ placeholderLabel(match, side) }}
            </span>
          } @else {
            <span class="bracket-slot__team">
              <app-team-flag
                [flagCode]="team?.flagCode ?? ''"
                [name]="team?.name ?? null"
                [size]="14" />
              {{ team?.name || teamId }}
            </span>
          }
          <span class="bracket-slot__score">{{ score != null ? score : '' }}</span>
        </button>
      </ng-template>
    </section>
  `,
  styles: [`
    :host { display: block; }

    .empty-block {
      padding: 24px;
      text-align: center;
      background: var(--wf-paper);
      border: 1px dashed var(--wf-line);
      border-radius: 10px;
    }
    .empty-block h3 {
      font-family: var(--wf-display);
      font-size: 18px;
      letter-spacing: .04em;
      margin: 0 0 8px;
    }
    .empty-block p {
      color: var(--wf-ink-3);
      font-size: 13px;
      margin: 0 0 12px;
      line-height: 1.5;
    }

    /* Counter X/N prominent en header */
    .bracket-counter {
      display: flex;
      flex-direction: column;
      align-items: flex-end;
      gap: 2px;
    }
    .bracket-counter__big {
      font-family: var(--wf-display, var(--font-display));
      font-size: 28px;
      line-height: 1;
      color: var(--color-primary-green);
      font-weight: 700;
    }
    .bracket-counter__sep {
      opacity: 0.4;
      margin: 0 2px;
    }
    .bracket-counter__lbl {
      font-size: 10px;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: var(--wf-ink-3, var(--color-text-muted));
    }

    /* Lock status pill (vs anterior <br> inline) */
    .lock-pill {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 5px 10px;
      background: rgba(0,0,0,0.04);
      border: 1px solid rgba(0,0,0,0.08);
      border-radius: 999px;
      font-size: 11px;
      font-weight: 600;
      color: var(--wf-ink-2, #333);
      margin-top: 8px;
    }
    .lock-pill--locked {
      background: rgba(220,38,38,0.08);
      border-color: rgba(220,38,38,0.25);
      color: #991b1b;
    }

    /* Scoring details table colapsable */
    .scoring-table {
      margin-top: 12px;
      padding: 10px 14px;
      border: 1px solid var(--wf-line, var(--color-line));
      border-radius: 10px;
      background: var(--wf-paper, #fff);
    }
    .scoring-table summary {
      cursor: pointer;
      font-weight: 600;
      font-size: 13px;
      display: inline-flex;
      align-items: center;
      gap: 6px;
      color: var(--color-primary-green);
    }
    .scoring-table summary:focus-visible {
      outline: 2px solid var(--color-primary-green);
      outline-offset: 2px;
      border-radius: 4px;
    }
    .scoring-table[open] summary { margin-bottom: 8px; }
    .scoring-table table {
      width: 100%;
      border-collapse: collapse;
      font-size: 12px;
    }
    .scoring-table th,
    .scoring-table td {
      padding: 6px 8px;
      text-align: left;
      border-bottom: 1px solid rgba(0,0,0,0.06);
    }
    .scoring-table th {
      font-size: 10px;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: var(--wf-ink-3);
    }
    .scoring-table tr:last-child td { border-bottom: 0; }

    /* Legend full (6 estados) */
    .bracket-legend--full {
      display: flex;
      flex-wrap: wrap;
      gap: 12px 16px;
      padding: 10px 0;
    }
    .bracket-legend__item {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      font-size: 11px;
      color: var(--wf-ink-2, #333);
    }
    .bracket-legend__icon {
      width: 16px;
      height: 16px;
      border-radius: 4px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      background: var(--wf-fill, rgba(0,0,0,0.06));
      border: 1px solid var(--wf-line, var(--color-line));
    }
    .bracket-legend__icon--mine { background: rgba(2,204,116,0.2); border-color: var(--color-primary-green); }
    .bracket-legend__icon--win  { background: var(--color-primary-green); border-color: var(--color-primary-green); }
    .bracket-legend__icon--discarded { background: rgba(0,0,0,0.06); border-color: rgba(0,0,0,0.2); position: relative; }
    .bracket-legend__icon--discarded::after {
      content: '';
      position: absolute;
      inset: 50% 2px auto;
      height: 1px;
      background: rgba(0,0,0,0.5);
      transform: translateY(-50%);
    }
    .bracket-legend__icon--locked { color: var(--wf-ink-3); }
    .bracket-legend__icon--awaiting { background: rgba(255,180,0,0.18); border-color: rgba(255,180,0,0.4); }
    .bracket-legend__icon--editable { background: #fff; border-color: var(--color-primary-green); border-style: dashed; }
    .bracket-legend__hint {
      font-size: 11px;
      margin-top: 4px;
    }

    /* ---------------------------------------------------------------
       Mobile layout (<768px): phase-by-phase accordion (vs 9-column
       horizontal scroll). Mantiene el grid desktop intacto.
       --------------------------------------------------------------- */
    .bracket-mobile { display: none; }
    @media (max-width: 768px) {
      .bracket-mobile { display: block; margin: 0 0 14px; }
      .bracket-scroll { display: none; }
      .bracket-counter { align-items: flex-start; }
    }
    .bracket-phase {
      border: 1px solid var(--wf-line-2);
      border-radius: 10px;
      background: var(--wf-paper);
      margin-bottom: 10px;
      overflow: hidden;
    }
    .bracket-phase__head {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 12px 14px;
      cursor: pointer;
      list-style: none;
      font-size: 13px;
      font-weight: 700;
      background: var(--wf-fill, rgba(0,0,0,0.03));
    }
    .bracket-phase__head::-webkit-details-marker { display: none; }
    .bracket-phase__title {
      flex: 1;
      font-family: var(--wf-display, var(--font-display));
      letter-spacing: 0.05em;
      text-transform: uppercase;
    }
    .bracket-phase__count {
      font-size: 11px;
      color: var(--wf-ink-3);
      font-weight: 600;
    }
    .bracket-phase__chev {
      font-size: 14px;
      color: var(--wf-ink-3);
      transition: transform 0.18s ease;
    }
    .bracket-phase[open] .bracket-phase__chev { transform: rotate(180deg); }
    .bracket-phase__body {
      padding: 12px 14px 14px;
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    @media (prefers-reduced-motion: reduce) {
      .bracket-phase__chev { transition: none; }
    }
  `],
})
export class BracketPicksComponent implements OnInit, OnDestroy {
  private api = inject(ApiService);
  private auth = inject(AuthService);
  private userModes = inject(UserModesService);
  private toast = inject(ToastService);
  private time = inject(TimeService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private confirmDialog = inject(ConfirmDialogService);
  rail = inject(RailModalsService);
  sync = inject(PicksSyncService);
  groupActions = inject(GroupActionsService);

  hasUserPicks = computed(() => this.winners().size > 0);

  /** Label contextual del slot vacío. Si el padre upstream existe,
   *  muestra "Esperando {label}" (ej R32-1, O-3); sino el fallback
   *  genérico. */
  placeholderLabel(match: KnockoutMatch, side: 'home' | 'away'): string {
    const parent = this.parentOf(match, side);
    if (!parent || parent.bracketPosition == null) return 'Pick fase anterior';
    const prefix =
      parent.phaseOrder === 2 ? 'R32' :
      parent.phaseOrder === 3 ? 'O'   :
      parent.phaseOrder === 4 ? 'C'   :
      parent.phaseOrder === 5 ? 'S'   : 'F';
    return `Esperando ${prefix}-${parent.bracketPosition}`;
  }

  loading = signal(true);
  availableModes = computed(() => this.userModes.modes());
  mode = signal<GameMode | null>(null);

  teams = signal<TeamLite[]>([]);
  teamMap = signal<Map<string, TeamLite>>(new Map());

  matches = signal<KnockoutMatch[]>([]);
  isProjected = signal(false);
  projectionMissing = signal<ProjectionMissing | null>(null);
  /** matchId → ganador elegido (slug del team). */
  winners = signal<Map<string, string>>(new Map());

  filter = signal<'mine' | 'all'>('all');

  /** Estado del save derivado del sync. Reemplaza el viejo saveStatus
   *  signal local (idle/dirty/saving/saved/error). Lee del sync para
   *  esta key específica del bracket del user en el modo actual. */
  saveStatus = computed<'idle' | 'dirty' | 'saving' | 'saved' | 'error'>(() => {
    const m = this.mode();
    if (!m || !this.currentUserId) return 'idle';
    const key = `${this.currentUserId}:${m}`;
    if (this.sync.isPending('bracket', key)) {
      return this.sync.status() === 'syncing' ? 'saving' : 'dirty';
    }
    if (this.sync.getPending('bracket', key)) return 'saved';
    return 'idle';
  });
  private serverId: string | null = null;
  private currentUserId = '';

  // Totals (para el header de stats)
  totals = signal<{ points: number; exactCount: number; resultCount: number; globalRank: number | null }>(
    { points: 0, exactCount: 0, resultCount: 0, globalRank: null },
  );

  totalKnockoutMatches = computed(() => this.matches().length);
  pickedCount = computed(() => this.winners().size);

  // Lock: bracket cierra al kickoff del primer partido eliminatorio.
  private nowTick = signal(Date.now());
  private lockTicker: ReturnType<typeof setInterval> | undefined;
  bracketLockAt = computed<string | null>(() => {
    const withKickoff = this.matches().filter((m) => !!m.kickoffAt);
    if (withKickoff.length === 0) return null;
    let min = withKickoff[0]!.kickoffAt;
    for (const m of withKickoff) if (m.kickoffAt < min) min = m.kickoffAt;
    return min;
  });
  bracketLocked = computed(() => {
    const at = this.bracketLockAt();
    if (!at) return false;
    return this.nowTick() >= Date.parse(at);
  });
  bracketLockFormatted = computed(() => {
    const at = this.bracketLockAt();
    return at ? this.time.formatKickoff(at) : null;
  });

  finalMatch = computed<KnockoutMatch | null>(() => {
    return this.matches().find((m) => m.phaseOrder === 6 && m.bracketPosition === 1) ?? null;
  });

  /** El campeón es el ganador elegido del partido de la Final. */
  champion = computed<string | null>(() => {
    const fm = this.finalMatch();
    if (!fm) return null;
    const champSlug = this.winners().get(fm.id);
    if (!champSlug) return null;
    const team = this.teamMap().get(champSlug);
    return team ? team.name : champSlug;
  });

  /** Los equipos que el user predijo como ganadores en cada match.
   *  Se usa para el filtro "Tu camino": dim los matches donde NINGÚN
   *  equipo está en este set. */
  myAdvancers = computed<Set<string>>(() => {
    const out = new Set<string>();
    for (const slug of this.winners().values()) out.add(slug);
    return out;
  });

  /** Para el filter "Tu camino": un match es "tuyo" si elegiste a uno
   *  de los 2 equipos como ganador (en este match O en una ronda anterior
   *  que llevó a este match). Simplificado: si home o away están en
   *  myAdvancers, es parte de tu camino. */
  dimmedFor(m: KnockoutMatch): boolean {
    if (this.filter() !== 'mine') return false;
    const set = this.myAdvancers();
    return !set.has(m.homeTeamId) && !set.has(m.awayTeamId);
  }

  flagEmoji(code: string): string {
    if (!code || code.length < 2) return '';
    const A = 0x1F1E6;
    const a = code.toUpperCase().charCodeAt(0);
    const b = code.toUpperCase().charCodeAt(1);
    if (Number.isNaN(a) || Number.isNaN(b)) return '';
    return String.fromCodePoint(A + (a - 65), A + (b - 65));
  }

  /** Devuelve los matches de la fase, filtrados por lado del bracket
   *  según bracketPosition (mid = total/2). */
  matchesIn(phaseOrder: number, side: 'left' | 'right'): KnockoutMatch[] {
    // El partido por el 3er puesto (phase 6 bracketPosition 2) lo filtramos
    // del visual: no aparece en el bracket tree.
    const all = this.matches()
      .filter((m) => m.phaseOrder === phaseOrder)
      .filter((m) => !(phaseOrder === 6 && m.bracketPosition !== 1))
      .sort((a, b) => (a.bracketPosition ?? 999) - (b.bracketPosition ?? 999));
    if (all.length === 0) return [];
    if (phaseOrder === 6) return all; // solo la Final, pero Final va al col central, no aquí
    const mid = Math.ceil(all.length / 2);
    return side === 'left' ? all.slice(0, mid) : all.slice(mid);
  }

  // ---- Mobile accordion (vista por fase, <768px) -------------------
  /** Lista ordenada de fases que arman el accordion mobile. */
  readonly mobilePhases: Array<{ order: number; label: string; prefix: string }> = [
    { order: 2, label: '16avos · R32', prefix: 'R32' },
    { order: 3, label: 'Octavos', prefix: 'O' },
    { order: 4, label: 'Cuartos', prefix: 'C' },
    { order: 5, label: 'Semifinales', prefix: 'S' },
    { order: 6, label: 'Final', prefix: 'F' },
  ];

  /** Estado de open/close por fase. R32 default open. */
  private phaseOpen = signal<Record<number, boolean>>({ 2: true, 3: false, 4: false, 5: false, 6: false });

  isPhaseOpen(order: number): boolean {
    return this.phaseOpen()[order] ?? false;
  }

  onPhaseToggle(order: number, ev: Event) {
    const target = ev.target as HTMLDetailsElement;
    this.phaseOpen.update((cur) => ({ ...cur, [order]: target.open }));
  }

  /** Número total de matches (ambos lados) en la fase. Final cuenta como 1. */
  phaseCount(order: number): number {
    if (order === 6) return this.finalMatch() ? 1 : 0;
    return this.matchesIn(order, 'left').length + this.matchesIn(order, 'right').length;
  }

  /** Para un match con resultado FINAL, devuelve el slug del team que ganó.
   *  Empate (penales/etc) → ningún winner determinado; null. */
  realWinner(m: KnockoutMatch): string | null {
    if (m.status !== 'FINAL') return null;
    if (m.homeScore == null || m.awayScore == null) return null;
    if (m.homeScore > m.awayScore) return m.homeTeamId;
    if (m.awayScore > m.homeScore) return m.awayTeamId;
    return null;
  }

  /** Match de la fase anterior cuyo ganador alimenta el slot indicado.
   *  Convención del bracket Mundial 2026: R{N} pos K es alimentado por
   *  R{N-1} pos 2K-1 (home) y 2K (away). R32 (phaseOrder=2) no tiene
   *  padre dentro del knockout. */
  private parentOf(match: KnockoutMatch, side: 'home' | 'away'): KnockoutMatch | null {
    if (match.phaseOrder <= 2) return null;
    if (match.bracketPosition == null) return null;
    const parentPhase = match.phaseOrder - 1;
    const parentPos = side === 'home'
      ? match.bracketPosition * 2 - 1
      : match.bracketPosition * 2;
    return this.matches().find((m) =>
      m.phaseOrder === parentPhase && m.bracketPosition === parentPos,
    ) ?? null;
  }

  /** Equipo a renderizar en el slot. STRICT: si el padre no tiene
   *  winner picked (y no jugó realmente), el slot está vacío.
   *
   *  Esto garantiza que al des-elegir en una fase aguas arriba, todas
   *  las fases siguientes queden en blanco — sin caer al pre-set del
   *  admin que coincidentemente podría mostrar el mismo equipo y dar
   *  la sensación de que el cascade no funcionó. */
  displayedTeam(match: KnockoutMatch, side: 'home' | 'away'): string {
    return this.computeDisplayed(match, side, this.winners());
  }

  private computeDisplayed(
    match: KnockoutMatch,
    side: 'home' | 'away',
    winners: Map<string, string>,
  ): string {
    const parent = this.parentOf(match, side);
    if (parent) {
      // Padre ya jugó → resultado real prevalece sobre cualquier predicción.
      if (parent.status === 'FINAL') {
        const real = this.realWinner(parent);
        if (real) return real;
      }
      const w = winners.get(parent.id);
      return w ?? '';   // strict: vacío cuando no hay winner upstream
    }
    // R32 (sin padre en knockout) usa el setup del admin.
    return side === 'home' ? match.homeTeamId : match.awayTeamId;
  }


  async ngOnInit() {
    this.currentUserId = this.auth.user()?.sub ?? '';
    if (!this.currentUserId) {
      this.loading.set(false);
      return;
    }
    this.lockTicker = setInterval(() => this.nowTick.set(Date.now()), 30_000);

    const requested = this.route.snapshot.queryParamMap.get('mode') as GameMode | null;
    const modes = this.availableModes();
    if (requested && modes.includes(requested)) this.mode.set(requested);
    else if (modes.includes('COMPLETE')) this.mode.set('COMPLETE');
    else if (modes.length > 0) this.mode.set(modes[0]!);
    if (!this.mode()) {
      this.loading.set(false);
      return;
    }
    await this.loadForMode();
    // Default filter "Tu camino" si el user ya tiene picks (UX: foco
    // automático en su rama). Si no tiene picks, queda "Todos" para
    // ver el bracket completo y decidir.
    if (this.hasUserPicks()) {
      this.filter.set('mine');
    }
  }

  ngOnDestroy(): void {
    if (this.lockTicker) clearInterval(this.lockTicker);
    // No flush en unmount: el sync service ya tiene en localStorage
    // cualquier cambio pending y los flushea con su propio debounce
    // global (sobrevive al unmount).
  }

  async switchMode(m: GameMode) {
    if (this.mode() === m) return;
    // Warning si el user tiene picks: cambiar de modo NO migra el bracket
    // (cada modo tiene su propia colección). Consistencia con
    // group-stage-picks y special-picks.
    if (this.hasUserPicks()) {
      const ok = await this.confirmDialog.ask({
        title: 'Cambiar modo',
        message: 'Tu bracket actual NO se aplica al otro modo. El bracket del modo destino se carga desde su propia colección — lo podés recuperar volviendo al modo actual.',
        confirmLabel: 'Cambiar modo',
        cancelLabel: 'Cancelar',
      });
      if (!ok) return;
    }
    this.mode.set(m);
    this.serverId = null;
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { mode: m },
      queryParamsHandling: 'merge',
    });
    await this.loadForMode();
  }

  async loadForMode() {
    const m = this.mode();
    if (!m) return;
    this.loading.set(true);
    try {
      const [teamsRes, bracketRes, totalsRes, leaderboardRes] = await Promise.all([
        this.api.listTeams(TOURNAMENT_ID),
        this.api.getBracketPick(this.currentUserId, TOURNAMENT_ID, m),
        this.api.myTotal(this.currentUserId, TOURNAMENT_ID),
        this.api.listLeaderboard(TOURNAMENT_ID, 200),
      ]);

      const list = (teamsRes.data ?? [])
        .filter((t): t is NonNullable<typeof t> => !!t && !!t.slug)
        .map((t) => ({ slug: t.slug, name: t.name, flagCode: t.flagCode }))
        .sort((a, b) => a.name.localeCompare(b.name));
      this.teams.set(list);
      const tmap = new Map<string, TeamLite>();
      for (const t of list) tmap.set(t.slug, t);
      this.teamMap.set(tmap);

      // El bracket de /picks/bracket SIEMPRE es la proyección del propio
      // user. Los Match rows reales que admin carga viven en otras
      // pantallas y alimentan el scoring backend (no se renderizan aquí).
      const [standingsRes, thirdsRes] = await Promise.all([
        this.api.listGroupStandingPicks(this.currentUserId, m),
        this.api.getBestThirdsPick(this.currentUserId, TOURNAMENT_ID, m),
      ]);
      const standings = (standingsRes.data ?? [])
        .filter((s): s is NonNullable<typeof s> =>
          !!s && s.tournamentId === TOURNAMENT_ID && !!s.groupLetter)
        .map((s) => ({
          groupLetter: s.groupLetter,
          pos1: s.pos1 ?? '',
          pos2: s.pos2 ?? '',
          pos3: s.pos3 ?? '',
          pos4: s.pos4 ?? '',
        }));
      const advancing = new Set<string>(
        (thirdsRes.data?.[0]?.advancing ?? []).filter((l): l is string => !!l),
      );
      const result = projectKnockoutTree({
        groupStandings: standings,
        advancingThirds: advancing,
        mode: m,
      });

      let knockouts: KnockoutMatch[];
      if (result.kind === 'ok') {
        knockouts = result.matches as KnockoutMatch[];
        this.isProjected.set(true);
        this.projectionMissing.set(null);
      } else {
        knockouts = [];
        this.isProjected.set(false);
        this.projectionMissing.set(result.missing);
      }
      this.matches.set(knockouts);

      // Reconstruir winners: prioridad localStorage > DB row
      let winnersState = new Map<string, string>();
      const dbRow = (bracketRes.data ?? [])[0];
      if (dbRow) {
        this.serverId = dbRow.id;
        const winnerSets: Record<number, Set<string>> = {
          2: new Set((dbRow.octavos ?? []).filter((s: string | null): s is string => !!s)),
          3: new Set((dbRow.cuartos ?? []).filter((s: string | null): s is string => !!s)),
          4: new Set((dbRow.semis   ?? []).filter((s: string | null): s is string => !!s)),
          5: new Set((dbRow.final   ?? []).filter((s: string | null): s is string => !!s)),
          6: dbRow.champion ? new Set([dbRow.champion]) : new Set<string>(),
        };
        for (const km of knockouts) {
          const set = winnerSets[km.phaseOrder];
          if (!set) continue;
          if (set.has(km.homeTeamId)) winnersState.set(km.id, km.homeTeamId);
          else if (set.has(km.awayTeamId)) winnersState.set(km.id, km.awayTeamId);
        }
      }

      const lsRaw = localStorage.getItem(STORAGE_KEY(this.currentUserId, m));
      if (lsRaw) {
        try {
          const parsed = JSON.parse(lsRaw) as Record<string, string>;
          winnersState = new Map(Object.entries(parsed));
        } catch { /* corrupt */ }
      }

      // Descartar winners cuyo matchId ya no existe (puede pasar cuando
      // el user cambió sus preds y los IDs proyectados anteriores no
      // coinciden con los nuevos).
      const validIds = new Set(knockouts.map((k) => k.id));
      winnersState = new Map([...winnersState].filter(([id]) => validIds.has(id)));

      this.winners.set(winnersState);
      // saveStatus es ahora computed desde sync state — no se setea acá.

      // Totals + global rank
      const myTotal = (totalsRes.data ?? [])[0];
      const sorted = (leaderboardRes.data ?? []).sort((a, b) => (b.points ?? 0) - (a.points ?? 0));
      const rankIdx = sorted.findIndex((t) => t.userId === this.currentUserId);
      this.totals.set({
        points: myTotal?.points ?? 0,
        exactCount: myTotal?.exactCount ?? 0,
        resultCount: myTotal?.resultCount ?? 0,
        globalRank: rankIdx >= 0 ? rankIdx + 1 : null,
      });
    } finally {
      this.loading.set(false);
    }
  }

  pickWinner(matchId: string, teamSlug: string) {
    if (this.bracketLocked()) return;
    if (!teamSlug) return;   // slot vacío (chain upstream no determinada)
    this.winners.update((prev) => {
      const next = new Map(prev);
      if (next.get(matchId) === teamSlug) {
        next.delete(matchId);   // re-click → des-elige
      } else {
        next.set(matchId, teamSlug);
      }
      // Cascade limpia toda la rama descendiente del match cambiado.
      // Si el user picked X como ganador en R32, y luego en R16/R8/etc.
      // tenía picks que dependían de X (vía la chain de winners), esos
      // picks downstream quedan stale y deben borrarse — incluso si
      // coincidentemente la admin pre-set del Match next-round usa el
      // mismo team slug que el viejo winner.
      this.cascadeClear(matchId, next);
      return next;
    });
    this.persistLocal();
    this.enqueueBracketSave();
  }

  /** Recorre la rama descendiente del match (child → grand-child → …)
   *  y borra cada pick stale. Como computeDisplayed ya es strict (vacío
   *  cuando upstream no tiene winner), comparamos directamente w vs
   *  el nuevo home/away. */
  private cascadeClear(matchId: string, winners: Map<string, string>) {
    const m = this.matches().find((x) => x.id === matchId);
    if (!m || m.bracketPosition == null) return;
    const childPhase = m.phaseOrder + 1;
    if (childPhase > 6) return;
    const childPos = Math.ceil(m.bracketPosition / 2);
    const child = this.matches().find(
      (x) => x.phaseOrder === childPhase && x.bracketPosition === childPos,
    );
    if (!child) return;
    const homeId = this.computeDisplayed(child, 'home', winners);
    const awayId = this.computeDisplayed(child, 'away', winners);
    const w = winners.get(child.id);
    if (w && w !== homeId && w !== awayId) {
      winners.delete(child.id);
    }
    // Recurse SIEMPRE: aunque el child quede válido (su away viene de
    // otra rama no afectada), el grand-child puede tener pick stale.
    this.cascadeClear(child.id, winners);
  }

  private persistLocal() {
    const m = this.mode();
    if (!this.currentUserId || !m) return;
    try {
      const obj: Record<string, string> = {};
      for (const [k, v] of this.winners()) obj[k] = v;
      localStorage.setItem(STORAGE_KEY(this.currentUserId, m), JSON.stringify(obj));
    } catch { /* localStorage full or disabled */ }
  }

  /** Construye el payload completo de BracketPick (toda la fila con
   *  todos los winners por fase) y lo encola al sync. El sync hace
   *  debounce, retry y persistencia. Reemplaza el viejo scheduleSave
   *  + saveAll local. */
  private enqueueBracketSave() {
    const m = this.mode();
    if (!m) return;
    if (this.bracketLocked()) return;

    const winnersByPhase: Record<number, string[]> = { 2: [], 3: [], 4: [], 5: [], 6: [] };
    const sortedMatches = [...this.matches()].sort((a, b) => {
      if (a.phaseOrder !== b.phaseOrder) return a.phaseOrder - b.phaseOrder;
      return (a.bracketPosition ?? 999) - (b.bracketPosition ?? 999);
    });
    for (const km of sortedMatches) {
      const winner = this.winners().get(km.id);
      if (!winner) continue;
      const arr = winnersByPhase[km.phaseOrder];
      if (arr) arr.push(winner);
    }

    const payload = {
      id: this.serverId ?? undefined,
      userId: this.currentUserId,
      tournamentId: TOURNAMENT_ID,
      mode: m,
      octavos:  winnersByPhase[2] ?? [],
      cuartos:  winnersByPhase[3] ?? [],
      semis:    winnersByPhase[4] ?? [],
      final:    winnersByPhase[5] ?? [],
      champion: (winnersByPhase[6] ?? [])[0] ?? '',
    };

    this.sync.enqueue('bracket', `${this.currentUserId}:${m}`, payload);
  }

  @HostListener('document:keydown.escape')
  onEscape() {
    // Reservado para futuros modales si se agregan acá.
  }
}
