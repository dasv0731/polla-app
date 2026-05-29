import { Component, HostListener, Input, OnChanges, OnInit, SimpleChanges, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { ApiService } from '../../core/api/api.service';
import { AuthService } from '../../core/auth/auth.service';
import { ToastService } from '../../core/notifications/toast.service';
import { humanizeError } from '../../core/notifications/domain-errors';
import { ConfirmDialogService } from '../../shared/ui/confirm-dialog.service';
import { ModalComponent } from '../../shared/ui/modal/modal.component';
import { IconComponent } from '../../shared/ui/icon/icon.component';
import { UserAvatarComponent } from '../../shared/user-avatar/user-avatar.component';
import { getUrl } from 'aws-amplify/storage';

type RankSortKey = 'pos' | 'handle' | 'points' | 'exact' | 'result';
type RankSortDir = 'asc' | 'desc';

interface GroupHeader {
  id: string;
  name: string;
  joinCode: string;
  adminUserId: string;
  createdAt: string;
  mode: 'SIMPLE' | 'COMPLETE';
  /** Storage key del logo/avatar del grupo. null si no se subió.
   *  Resuelve a signed URL en `groupImageUrl` signal. */
  imageKey: string | null;
  /** Reglas, premios, contexto extra. Editable desde /groups/:id/edit. */
  description: string | null;
  /** Si el grupo tiene comodines activos. Solo aplica a mode=COMPLETE.
   *  Null/undefined = legacy group, tratamos como ON (!== false). */
  comodinesEnabled: boolean | null;
  prize1st: string | null;
  prize2nd: string | null;
  prize3rd: string | null;
  /** Cuota de ingreso enabled by admin. Null = legacy group, treat as false. */
  entryFeeEnabled: boolean | null;
  /** Free-text payment instructions. Null when feature is off. */
  entryFeeInstructions: string | null;
}

interface RankRow {
  userId: string;
  handle: string;
  avatarKey?: string | null;
  points: number;
  exactCount: number;
  resultCount: number;
  /** Timestamp when admin marked the user's entry fee as paid. Null = pending. */
  entryFeePaidAt: string | null;
}

@Component({
  standalone: true,
  selector: 'app-group-detail',
  imports: [RouterLink, UserAvatarComponent, ModalComponent, IconComponent],
  template: `
    <section class="page">

      @if (loading()) {
        <p class="loading-msg">Cargando grupo…</p>
      } @else if (group() === null) {
        <p class="loading-msg">Grupo no encontrado.</p>
      }
      @if (!loading() && group(); as g) {

        <a routerLink="/groups" class="back-link">‹ Mis grupos</a>

        <!-- Hero verde -->
        <header class="group-hero">
          <div class="group-hero__top">
            <div style="display:flex;align-items:center;gap:14px;flex:1;min-width:0;">
              @if (groupImageUrl()) {
                <img [src]="groupImageUrl()!" alt="Logo del grupo"
                     style="width:64px;height:64px;border-radius:12px;object-fit:cover;flex-shrink:0;border:2px solid rgba(255,255,255,.4);">
              }
              <div style="min-width:0;">
                <!-- Hero compactación: identidad + stats inline. La línea
                     anterior repetía "modo · miembros" y abajo había un row
                     extra con tu pos / tus pts / miembros, casi siempre
                     mostrando "—". Compactamos todo en una sola línea de
                     stats coherente con el resto del producto. -->
                <div class="group-hero__meta">
                  {{ g.mode === 'COMPLETE' ? 'MODO COMPLETO' : 'MODO SIMPLE' }}
                  @if (isAdminOfGroup()) { · TÚ ERES ADMIN }
                </div>
                <h1 class="group-hero__name">{{ g.name }}</h1>
                <div class="group-hero__stats-inline">
                  <span class="group-hero__stat-item">
                    <span class="num">{{ myPos() ? myPos() + '°' : '—' }}</span>
                    <span class="lbl">Tu pos.</span>
                  </span>
                  <span class="group-hero__stat-sep" aria-hidden="true">·</span>
                  <span class="group-hero__stat-item">
                    <span class="num">{{ myPoints() }}</span>
                    <span class="lbl">Tus pts</span>
                  </span>
                  <span class="group-hero__stat-sep" aria-hidden="true">·</span>
                  <span class="group-hero__stat-item">
                    <span class="num">{{ rows().length }}</span>
                    <span class="lbl">{{ rows().length === 1 ? 'Miembro' : 'Miembros' }}</span>
                  </span>
                </div>
                @if (g.description) {
                  <p class="group-hero__description">{{ g.description }}</p>
                }
                @if (g.mode === 'COMPLETE') {
                  <div style="margin-top:6px;">
                    @if (g.comodinesEnabled !== false) {
                      <span class="pill pill--accent"
                            style="display:inline-flex;align-items:center;gap:4px;font-size:11px;padding:3px 8px;border-radius:999px;background:rgba(0,200,100,0.18);color:#fff;border:1px solid rgba(255,255,255,0.35);">
                        <app-icon name="dice" size="sm" [decorative]="true" />
                        Comodines activos
                      </span>
                    } @else {
                      <span class="pill pill--mute"
                            style="display:inline-flex;align-items:center;gap:4px;font-size:11px;padding:3px 8px;border-radius:999px;background:rgba(255,255,255,0.12);color:#fff;border:1px solid rgba(255,255,255,0.25);">
                        <app-icon name="dice" size="sm" [decorative]="true" />
                        Sin comodines
                      </span>
                    }
                  </div>
                }
              </div>
            </div>
            @if (isAdminOfGroup()) {
              <!-- Affordance: ahora con label visible "Admin" en desktop +
                   tooltip + aria-label. Antes era "⋯" sin contexto y sin
                   título de hover; users no descubrían las acciones admin. -->
              <button class="group-hero__menu" type="button"
                      aria-label="Saltar a acciones de admin"
                      title="Acciones de admin"
                      (click)="scrollToAdmin()">
                <span class="group-hero__menu-label">Acciones admin</span>
                <span class="group-hero__menu-dots" aria-hidden="true">⋯</span>
              </button>
            }
          </div>
        </header>

        <!-- Pareja invitar + premios (en mobile invitar primero; desktop reordena) -->
        <div class="group-pair">

          <aside class="group-invitar">
            <div class="kicker">CÓDIGO DE INVITACIÓN</div>
            <div class="group-invitar__code">{{ g.joinCode }}</div>
            <div class="group-invitar__actions">
              <button class="btn-wf btn-wf--sm" type="button" (click)="copyLink()">
                @if (copied()) {
                  <app-icon name="check" size="sm" [decorative]="true" />
                  Copiado
                } @else {
                  <app-icon name="clipboard" size="sm" [decorative]="true" />
                  Copiar link
                }
              </button>
              <button class="btn-wf btn-wf--sm" type="button" (click)="shareGroup()">
                <app-icon name="arrow-right" size="sm" [decorative]="true" />
                Compartir / QR
              </button>
              @if (isAdminOfGroup()) {
                <a class="btn-wf btn-wf--sm btn-wf--primary"
                   [routerLink]="['/groups', g.id, 'invite']">
                  <app-icon name="mail" size="sm" [decorative]="true" />
                  Invitar por email
                </a>
              }
            </div>
          </aside>

          <aside class="group-premios">
            <header class="group-premios__head">
              <div class="left">
                <span class="group-premios__icon" aria-hidden="true">
                  <app-icon name="trophy" size="lg" [decorative]="true" />
                </span>
                <div>
                  <div class="kicker" style="color:#7a5d00;">EN JUEGO</div>
                  <div class="group-premios__total">{{ prizesTotalLabel() }}</div>
                </div>
              </div>
              @if (isAdminOfGroup()) {
                <a class="group-premios__edit" [routerLink]="['/groups', g.id, 'prizes']">
                  Editar →
                </a>
              }
            </header>
            @if (hasPrizes()) {
              @if (g.prize1st) {
                <div class="group-premios__row">
                  <div class="medal medal--gold">1°</div>
                  <div class="info">
                    <div class="ptitle">1° lugar</div>
                    <div class="psub">Premio mayor</div>
                  </div>
                  <div class="amount">{{ g.prize1st }}</div>
                </div>
              }
              @if (g.prize2nd) {
                <div class="group-premios__row">
                  <div class="medal medal--silver">2°</div>
                  <div class="info"><div class="ptitle">2° lugar</div></div>
                  <div class="amount">{{ g.prize2nd }}</div>
                </div>
              }
              @if (g.prize3rd) {
                <div class="group-premios__row">
                  <div class="medal medal--bronze">3°</div>
                  <div class="info"><div class="ptitle">3° lugar</div></div>
                  <div class="amount">{{ g.prize3rd }}</div>
                </div>
              }
            } @else {
              <div class="group-premios__row">
                <div class="medal">·</div>
                <div class="info">
                  <div class="ptitle">Sin premios definidos</div>
                  @if (isAdminOfGroup()) {
                    <div class="psub">Define los premios para motivar al grupo</div>
                  }
                </div>
              </div>
            }
          </aside>

        </div>

        <!-- Ranking interno · La vista "Por jornada" disabled fue removida:
             era UI muerta sin endpoint que ofreciera el corte por matchday. -->
        <section class="group-section">
          <header class="group-section__head">
            <h2 class="group-section__title">
              Ranking interno · {{ rows().length }} {{ rows().length === 1 ? 'miembro' : 'miembros' }}
            </h2>
          </header>

          @if (g.mode === 'COMPLETE' && g.comodinesEnabled === false) {
            <div class="info-banner info-banner--mute"
                 style="margin:10px 0;padding:10px 12px;background:rgba(160,160,160,0.10);border:1px solid rgba(160,160,160,0.30);border-radius:8px;font-size:13px;color:var(--wf-ink-2);">
              ℹ Los puntos de este grupo se computan sin efectos de comodines.
              Tu posición global (ranking del torneo) sigue incluyéndolos.
            </div>
          }

          <div class="group-member-count" style="display:flex;justify-content:space-between;align-items:center;margin:0 0 10px;font-size:13px;color:var(--wf-ink-2);">
            <span class="text-bold">Miembros</span>
            <span [class.text-warn]="rows().length >= 30">
              <span class="text-bold">{{ rows().length }}</span> / 30
            </span>
          </div>

          <div class="rank-table-wrap">
            <table class="rank-table">
              <thead>
                <tr>
                  <th>
                    <button type="button" class="rank-th-btn"
                            (click)="toggleSort('pos')"
                            [attr.aria-sort]="ariaSortFor('pos')">
                      # {{ sortIndicator('pos') }}
                    </button>
                  </th>
                  <th>
                    <button type="button" class="rank-th-btn"
                            (click)="toggleSort('handle')"
                            [attr.aria-sort]="ariaSortFor('handle')">
                      Jugador {{ sortIndicator('handle') }}
                    </button>
                  </th>
                  <th>
                    <button type="button" class="rank-th-btn"
                            (click)="toggleSort('points')"
                            [attr.aria-sort]="ariaSortFor('points')">
                      Pts {{ sortIndicator('points') }}
                    </button>
                  </th>
                  <th class="rank-table__desk">
                    <button type="button" class="rank-th-btn"
                            (click)="toggleSort('exact')"
                            [attr.aria-sort]="ariaSortFor('exact')">
                      Exactos {{ sortIndicator('exact') }}
                    </button>
                  </th>
                  <th class="rank-table__desk">
                    <button type="button" class="rank-th-btn"
                            (click)="toggleSort('result')"
                            [attr.aria-sort]="ariaSortFor('result')">
                      Result. {{ sortIndicator('result') }}
                    </button>
                  </th>
                  @if (isAdminOfGroup() && group()?.entryFeeEnabled) {
                    <th class="cuota-col" scope="col">Cuota</th>
                  }
                  @if (isAdminOfGroup()) {
                    <th style="width:60px;text-align:center;">Acción</th>
                  }
                </tr>
              </thead>
              <tbody>
                @for (r of sortedRows(); track r.userId; let i = $index) {
                  <tr [class.is-me]="r.userId === currentUserId">
                    <!-- Posición = índice en el ranking general (rows()),
                         no en la vista actual. Si el user ordena por exact
                         desc, "#1" sigue siendo el líder general. -->
                    <td class="rank-table__pos">{{ rankIndexOf(r.userId) }}</td>
                    <td class="text-bold">
                      <span style="display:inline-flex;align-items:center;gap:8px;">
                        <app-user-avatar
                          [sub]="r.userId"
                          [handle]="r.handle"
                          [avatarKey]="r.avatarKey"
                          size="sm" />
                        {{ '@' + r.handle }}@if (r.userId === currentUserId) { <span class="text-mute"> (tú)</span> }
                      </span>
                    </td>
                    <td class="rank-table__pts">{{ r.points }}</td>
                    <td class="rank-table__desk">{{ r.exactCount }}</td>
                    <td class="rank-table__desk">{{ r.resultCount }}</td>
                    @if (isAdminOfGroup() && g.entryFeeEnabled) {
                      <td class="cuota-col">
                        @if (r.userId === currentUserId) {
                          <span class="cuota-tag cuota-tag--paid" aria-label="Cuota pagada">
                            <app-icon name="check" [decorative]="true" [size]="14"></app-icon>
                            Pagada
                          </span>
                        } @else {
                          <button type="button"
                                  class="cuota-checkbox"
                                  [class.is-paid]="r.entryFeePaidAt !== null"
                                  [attr.aria-pressed]="r.entryFeePaidAt !== null"
                                  [attr.aria-label]="r.entryFeePaidAt !== null ? 'Quitar marca de pago' : 'Marcar como pagada'"
                                  [title]="r.entryFeePaidAt !== null ? 'Quitar marca' : 'Marcar como pagada'"
                                  (click)="toggleEntryFeePaid(r.userId, r.entryFeePaidAt !== null)">
                            @if (r.entryFeePaidAt !== null) {
                              <app-icon name="check" [decorative]="true" [size]="14"></app-icon>
                              Pagada
                            } @else {
                              Marcar pagada
                            }
                          </button>
                        }
                      </td>
                    }
                    @if (isAdminOfGroup()) {
                      <td style="text-align:center;">
                        @if (r.userId !== g.adminUserId) {
                          <button type="button"
                                  class="btn-wf btn-wf--sm btn-wf--danger delete-member-btn"
                                  [disabled]="removingUserId() === r.userId"
                                  (click)="confirmRemoveMember(r.userId, r.handle)"
                                  [attr.aria-label]="'Eliminar a ' + r.handle">
                            @if (removingUserId() === r.userId) {
                              <span aria-hidden="true">…</span>
                            } @else {
                              <app-icon name="trash" size="sm" [decorative]="true" />
                            }
                          </button>
                        }
                      </td>
                    }
                  </tr>
                } @empty {
                  <tr>
                    <td [attr.colspan]="isAdminOfGroup() ? (g.entryFeeEnabled ? 7 : 6) : 5" style="text-align:center; padding: 22px; color: var(--wf-ink-3);">
                      Aún no hay puntajes. Espera al primer partido.
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>

          <p class="rank-foot">
            La tabla se actualiza automáticamente cuando se publican los resultados.
          </p>
        </section>

        <!-- Acciones admin · solo las que no tienen un CTA contextual
             arriba (invitar email y editar premios ya viven en group-pair). -->
        @if (isAdminOfGroup()) {
          <section class="group-section" #adminAnchor>
            <h2 class="group-section__title" style="margin-bottom:10px;">Acciones de admin</h2>
            <div class="group-admin-actions">
              <a class="btn-wf btn-wf--block" [routerLink]="['/groups', g.id, 'edit']">
                <app-icon name="pencil" size="sm" [decorative]="true" />
                Editar grupo (nombre · descripción · imagen)
              </a>
              <button class="btn-wf btn-wf--block" type="button"
                      [disabled]="rows().length <= 1"
                      (click)="openTransferAdmin()">
                <app-icon name="crown" size="sm" [decorative]="true" />
                Transferir admin
              </button>
              <button class="btn-wf btn-wf--block" type="button"
                      (click)="shareGroup()">
                <app-icon name="clipboard" size="sm" [decorative]="true" />
                Compartir grupo (link / QR)
              </button>
              <button class="btn-wf btn-wf--block btn-wf--danger" type="button" (click)="del()">
                <app-icon name="trash" size="sm" [decorative]="true" />
                Eliminar grupo
              </button>
            </div>
          </section>
        } @else {
          <!-- Acciones miembro (no-admin): abandonar grupo -->
          <section class="group-section">
            <h2 class="group-section__title" style="margin-bottom:10px;">Tu membresía</h2>
            <div class="group-admin-actions">
              <button class="btn-wf btn-wf--block" type="button" (click)="shareGroup()">
                <app-icon name="clipboard" size="sm" [decorative]="true" />
                Compartir grupo (link / QR)
              </button>
              <!-- TODO(A6): "Silenciar notif del grupo" — requiere endpoint
                   setGroupNotifPrefs(groupId, muted) y persistencia en la
                   tabla MembershipPrefs (no existe). Wireado UI-only por ahora. -->
              <button class="btn-wf btn-wf--block" type="button" disabled
                      title="Próximamente · A6 backend">
                <app-icon name="bell" size="sm" [decorative]="true" />
                Silenciar notif del grupo
              </button>
              <button class="btn-wf btn-wf--block btn-wf--danger" type="button"
                      (click)="leave()">
                <app-icon name="logout" size="sm" [decorative]="true" />
                Abandonar grupo
              </button>
              <p class="text-mute" style="font-size:11px;line-height:1.4;margin:6px 0 0;">
                Si abandonas, tu score acumulado en este grupo se borra.
                Tus picks del torneo no se ven afectados.
              </p>
            </div>
          </section>
        }

        <!-- Compartir grupo · link + QR placeholder.
             TODO(A6): integrar lib qr (qrcode-svg o similar) para renderizar
             el QR inline. Por ahora mostramos el link y un botón Copiar. -->
        @if (sharing()) {
          <app-modal [open]="true"
                     title="Compartir grupo"
                     description="Comparte este link con tus panas o muéstrales el QR cuando lo agreguemos."
                     size="sm"
                     (close)="sharing.set(false)">
            <div slot="body" style="display:flex;flex-direction:column;gap:14px;">
              <div>
                <div class="kicker" style="margin-bottom:6px;">CÓDIGO</div>
                <div class="group-share__code">{{ g.joinCode }}</div>
              </div>
              <div>
                <div class="kicker" style="margin-bottom:6px;">LINK DE INVITACIÓN</div>
                <div class="group-share__link" translate="no">{{ inviteUrl() }}</div>
              </div>
              <div class="group-share__qr-placeholder" aria-hidden="true">
                <span>QR</span>
                <small>Se mostrará aquí cuando integremos el generador.</small>
              </div>
            </div>
            <div slot="footer">
              <button type="button" class="btn-wf btn-wf--sm" (click)="sharing.set(false)">
                Cerrar
              </button>
              <button type="button" class="btn-wf btn-wf--sm btn-wf--primary"
                      (click)="copyLink()">
                @if (copied()) {
                  <app-icon name="check" size="sm" [decorative]="true" />
                  Copiado
                } @else {
                  <app-icon name="clipboard" size="sm" [decorative]="true" />
                  Copiar link
                }
              </button>
            </div>
          </app-modal>
        }

        @if (showEntryFeeReminder()) {
          <button type="button"
                  class="entry-fee-reminder"
                  data-testid="entry-fee-reminder"
                  aria-label="Cuota de ingreso pendiente. Ver instrucciones."
                  (click)="openEntryFeeModal()">
            <app-icon name="alert" [decorative]="true" size="md" />
            <span class="entry-fee-reminder__text">
              <strong>Tu cuota está pendiente</strong>
              <small>Tocá para ver las instrucciones</small>
            </span>
          </button>
        }

        @if (entryFeeModalOpen()) {
          <app-modal [open]="true"
                     title="Instrucciones de pago"
                     size="sm"
                     data-testid="entry-fee-modal"
                     (close)="closeEntryFeeModal()">
            <div slot="body">
              <div class="entry-fee-modal-body">{{ group()?.entryFeeInstructions }}</div>
              <p class="entry-fee-modal-note">
                Cuando el admin marque tu cuota como pagada, este recordatorio desaparece.
              </p>
            </div>
            <div slot="footer">
              <button type="button" class="btn-wf btn-wf--sm btn-wf--primary"
                      (click)="closeEntryFeeModal()">Entendido</button>
            </div>
          </app-modal>
        }

        <!-- Transferir admin · modal con lista de members -->
        @if (transferring()) {
          <app-modal [open]="true"
                     title="Transferir admin"
                     description="El nuevo admin podrá editar, invitar y eliminar el grupo. Tú pasas a ser miembro normal."
                     size="sm"
                     (close)="closeTransferAdmin()">
            <div slot="body" style="display:flex;flex-direction:column;gap:8px;">
              @for (m of nonAdminMembers(); track m.userId) {
                <label class="transfer-row" [class.is-selected]="newAdminId() === m.userId">
                  <input type="radio" name="newAdmin"
                         [value]="m.userId"
                         [checked]="newAdminId() === m.userId"
                         (change)="newAdminId.set(m.userId)">
                  <div style="flex:1;">
                    <div class="text-bold" translate="no">{{ '@' + m.handle }}</div>
                  </div>
                </label>
              }
              @if (nonAdminMembers().length === 0) {
                <p class="text-mute" style="font-size:13px;">
                  No hay otros miembros en el grupo. Invitá a alguien primero
                  o eliminá el grupo.
                </p>
              }
            </div>

            <div slot="footer">
              <button type="button" class="btn-wf btn-wf--sm"
                      (click)="closeTransferAdmin()" [disabled]="transferring() === 'submitting'">
                Cancelar
              </button>
              <button type="button" class="btn-wf btn-wf--sm btn-wf--primary"
                      (click)="submitTransferAdmin()"
                      [disabled]="!newAdminId() || transferring() === 'submitting'">
                {{ transferring() === 'submitting' ? 'Transfiriendo…' : 'Transferir' }}
              </button>
            </div>
          </app-modal>
        }

      }
    </section>
  `,
  styles: [`
    :host { display: block; }

    .loading-msg {
      padding: 48px 16px;
      text-align: center;
      color: var(--wf-ink-3);
      font-size: 14px;
    }

    .rank-foot {
      margin-top: 12px;
      font-size: 11px;
      color: var(--wf-ink-3);
      line-height: 1.4;
    }

    /* Transfer admin modal · row de selección */
    .transfer-row {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 10px 12px;
      border: 1px solid var(--color-line);
      border-radius: 10px;
      cursor: pointer;
      transition: border-color .15s, background .15s;
    }
    .transfer-row:hover { border-color: rgba(2, 204, 116, 0.5); }
    .transfer-row.is-selected {
      border-color: var(--color-primary-green);
      background: rgba(2, 204, 116, 0.08);
    }
    .transfer-row input[type="radio"] {
      margin: 0;
      accent-color: var(--color-primary-green);
      flex-shrink: 0;
    }

    /* Bug #3 fix: description del grupo (B2 latente). Heredamos color
     * blanco del hero verde, line-breaks preservados si el user los puso
     * desde el modal de Crear grupo / Editar grupo. */
    .group-hero__description {
      font-size: 13px;
      line-height: 1.45;
      color: rgba(255,255,255,0.85);
      margin: 6px 0 0;
      max-width: 600px;
      white-space: pre-line;
    }

    /* Hero compactación · stats inline (reemplaza el row de 3 columnas
       grandes con una sola línea coherente). */
    .group-hero__stats-inline {
      display: flex;
      align-items: baseline;
      gap: 10px;
      margin-top: 8px;
      color: rgba(255,255,255,0.92);
    }
    .group-hero__stat-item { display: inline-flex; align-items: baseline; gap: 6px; }
    .group-hero__stat-item .num {
      font-family: var(--wf-display, inherit);
      font-size: 18px;
      font-weight: 700;
    }
    .group-hero__stat-item .lbl {
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      opacity: 0.75;
    }
    .group-hero__stat-sep { opacity: 0.5; }

    /* Affordance: "Acciones admin" con label visible en desktop, dots en mobile. */
    .group-hero__menu {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 6px 10px;
      min-height: var(--hit-target-min, 44px);
      min-width: var(--hit-target-min, 44px);
      background: rgba(255,255,255,0.18);
      border: 1px solid rgba(255,255,255,0.35);
      border-radius: 8px;
      color: #fff;
      font: inherit;
      cursor: pointer;
    }
    .group-hero__menu-dots { font-size: 20px; line-height: 1; }
    @media (max-width: 640px) {
      .group-hero__menu-label { display: none; }
    }

    /* Hit-target token: 44px mínimo (WCAG AAA). */
    .delete-member-btn {
      min-width: var(--hit-target-min, 44px);
      min-height: var(--hit-target-min, 44px);
      padding: 4px 8px;
      font-size: 11px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
    }

    /* Sortable column header buttons */
    .rank-th-btn {
      background: transparent;
      border: 0;
      padding: 0;
      font: inherit;
      cursor: pointer;
      color: inherit;
      text-align: inherit;
      display: inline-flex;
      align-items: center;
      gap: 4px;
    }
    .rank-th-btn:hover { color: var(--wf-green-ink, currentColor); }
    .rank-th-btn:focus-visible {
      outline: 2px solid var(--wf-green, currentColor);
      outline-offset: 2px;
      border-radius: 3px;
    }

    /* Medals: replacement de los emojis por badges semánticos. */
    .group-premios__row .medal {
      width: 32px; height: 32px;
      border-radius: 999px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      font-weight: 700;
      font-size: 12px;
      background: var(--wf-fill, rgba(0,0,0,0.06));
      color: var(--wf-ink-2, #555);
    }
    .group-premios__row .medal--gold {
      background: #ffd75e; color: #6a4a00;
    }
    .group-premios__row .medal--silver {
      background: #d8dde6; color: #404754;
    }
    .group-premios__row .medal--bronze {
      background: #e0a779; color: #5c2f0d;
    }

    /* Share modal */
    .group-share__code {
      font-family: var(--wf-display, monospace);
      font-size: 28px;
      letter-spacing: 0.12em;
      background: var(--wf-fill);
      padding: 12px;
      border-radius: 8px;
      text-align: center;
    }
    .group-share__link {
      font-size: 12px;
      background: var(--wf-fill);
      padding: 10px;
      border-radius: 6px;
      word-break: break-all;
      color: var(--wf-ink-2);
    }
    .group-share__qr-placeholder {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 6px;
      background: repeating-linear-gradient(
        45deg, rgba(0,0,0,0.06), rgba(0,0,0,0.06) 8px, transparent 8px, transparent 16px
      );
      padding: 24px;
      border-radius: 8px;
      color: var(--wf-ink-3);
    }
    .group-share__qr-placeholder span { font-weight: 700; font-size: 20px; }
    .group-share__qr-placeholder small { font-size: 11px; text-align: center; }

    /* Cuota de ingreso column (admin only) */
    .cuota-col { white-space: nowrap; min-width: 132px; }
    .cuota-tag {
      display: inline-flex; align-items: center; gap: 6px;
      padding: 4px 10px; border-radius: 999px; font-size: 13px;
      background: rgba(2, 204, 116, 0.12); color: var(--color-primary-green);
    }
    .cuota-tag--paid { font-weight: 500; }
    .cuota-checkbox {
      display: inline-flex; align-items: center; gap: 6px;
      min-height: 44px; padding: 6px 12px;
      border: 1px solid var(--color-line); border-radius: 999px;
      background: transparent; color: var(--color-text-muted);
      font-size: 13px; cursor: pointer;
      transition: background .15s, border-color .15s, color .15s;
    }
    .cuota-checkbox:hover { border-color: var(--color-primary-green); color: var(--color-text); }
    .cuota-checkbox.is-paid {
      background: rgba(2, 204, 116, 0.12);
      color: var(--color-primary-green);
      border-color: rgba(2, 204, 116, 0.4);
    }
    .cuota-checkbox:focus-visible {
      outline: 2px solid var(--color-primary-green);
      outline-offset: 2px;
    }

    .entry-fee-reminder {
      position: fixed;
      bottom: 24px; right: 24px;
      display: inline-flex; align-items: center; gap: 12px;
      padding: 14px 20px;
      min-height: 56px;
      border-radius: 12px;
      background: var(--wf-warn-soft);
      border: 1px solid var(--wf-warn);
      color: var(--color-text, #111);
      cursor: pointer;
      z-index: var(--z-overlay, 100);
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.12);
      animation: entry-fee-fade-in 200ms ease-out;
    }
    .entry-fee-reminder:focus-visible {
      outline: 2px solid var(--wf-warn);
      outline-offset: 2px;
    }
    .entry-fee-reminder__text {
      display: flex; flex-direction: column; align-items: flex-start;
      line-height: 1.2;
    }
    .entry-fee-reminder__text small { color: var(--color-text-muted); font-size: 12px; }

    @media (max-width: 767px) {
      .entry-fee-reminder {
        bottom: calc(var(--bp-bottom-nav, 64px) + 16px);
        right: 16px;
        left: 16px;
        justify-content: center;
      }
    }

    @keyframes entry-fee-fade-in {
      from { opacity: 0; transform: translateY(8px); }
      to { opacity: 1; transform: translateY(0); }
    }

    @media (prefers-reduced-motion: reduce) {
      .entry-fee-reminder { animation: none; }
    }

    .entry-fee-modal-body {
      white-space: pre-line;
      font-size: 15px; line-height: 1.5;
      color: var(--color-text);
    }
    .entry-fee-modal-note {
      margin-top: 16px;
      font-size: 13px; color: var(--color-text-muted);
    }
  `],
})
export class GroupDetailComponent implements OnInit, OnChanges {
  @Input() id!: string;

  private api = inject(ApiService);
  private auth = inject(AuthService);
  private toast = inject(ToastService);
  private router = inject(Router);
  private confirmDialog = inject(ConfirmDialogService);

  /** Estado del modal de transferir admin.
   *  null = cerrado; 'open' = elegir destinatario; 'submitting' = enviando. */
  transferring = signal<null | 'open' | 'submitting'>(null);
  newAdminId = signal<string | null>(null);

  /** Modal de compartir grupo (link + QR placeholder). */
  sharing = signal(false);

  /** Sort de la tabla de ranking. Default: posición ascendente (ya es el
   *  orden natural de `rows()`). */
  sortKey = signal<RankSortKey>('pos');
  sortDir = signal<RankSortDir>('asc');

  /** Cuando el user navega de /groups/A → /groups/B, Angular reutiliza
   *  esta misma component instance y solo cambia el @Input id. ngOnInit
   *  no vuelve a correr — sin un OnChanges nos quedaríamos mostrando los
   *  datos del grupo A para siempre. */
  ngOnChanges(changes: SimpleChanges) {
    if (changes['id'] && !changes['id'].firstChange) {
      void this.load();
    }
  }

  group = signal<GroupHeader | null>(null);
  /** Signed URL del logo del grupo (vence en 1h, se re-resuelve en cada
   *  load del componente). */
  groupImageUrl = signal<string | null>(null);
  rows = signal<RankRow[]>([]);
  loading = signal(true);
  copied = signal(false);
  removingUserId = signal<string | null>(null);
  currentUserId = '';

  /** UI: instructions modal open state. */
  entryFeeModalOpen = signal(false);

  /** True when the floating reminder should be visible for the active user.
   *  Hidden if: group has no entry fee, user is the admin (auto-paid), or
   *  the user's row already has entryFeePaidAt set. */
  showEntryFeeReminder = computed<boolean>(() => {
    const g = this.group();
    if (!g || g.entryFeeEnabled !== true) return false;
    const meSub = this.currentUserId;
    if (!meSub) return false;
    const mine = this.rows().find((r) => r.userId === meSub);
    if (!mine) return false;
    return mine.entryFeePaidAt === null;
  });

  openEntryFeeModal(): void { this.entryFeeModalOpen.set(true); }
  closeEntryFeeModal(): void { this.entryFeeModalOpen.set(false); }

  isAdminOfGroup = computed(() => this.group()?.adminUserId === this.currentUserId);

  hasPrizes = computed(() => {
    const g = this.group();
    return !!(g?.prize1st || g?.prize2nd || g?.prize3rd);
  });

  /** Suma los $X de los 3 premios. Si todos parsean a número, devuelve "$N";
   *  si hay alguno no numérico (ej. "Cena"), cae a contar premios. */
  prizesTotalLabel = computed(() => {
    const g = this.group();
    if (!g) return '—';
    const raws = [g.prize1st, g.prize2nd, g.prize3rd].filter((v): v is string => !!v);
    if (raws.length === 0) return 'Sin definir';
    const numbers = raws.map((s) => {
      const m = s.match(/\$\s*(\d[\d.,]*)/);
      return m ? parseFloat(m[1].replace(/,/g, '')) : null;
    });
    const allParsed = numbers.every((n) => n !== null);
    if (allParsed) {
      const sum = (numbers as number[]).reduce((a, n) => a + n, 0);
      return `$${Math.round(sum)}`;
    }
    return `${raws.length} ${raws.length === 1 ? 'premio' : 'premios'}`;
  });

  inviteUrl = computed(() => {
    const g = this.group();
    return g ? `${location.origin}/groups/join/${g.joinCode}` : '';
  });

  myPos = computed(() => {
    const i = this.rows().findIndex((r) => r.userId === this.currentUserId);
    return i >= 0 ? i + 1 : null;
  });
  myPoints = computed(() =>
    this.rows().find((r) => r.userId === this.currentUserId)?.points ?? 0,
  );

  /** Vista ordenada de `rows()` según sortKey/sortDir. Por default es 'pos'
   *  ascendente, que coincide con `rows()` (sorted server-side by points). */
  sortedRows = computed<RankRow[]>(() => {
    const list = [...this.rows()];
    const key = this.sortKey();
    const dir = this.sortDir();
    const sign = dir === 'asc' ? 1 : -1;
    if (key === 'pos') {
      return dir === 'asc' ? list : list.slice().reverse();
    }
    list.sort((a, b) => {
      switch (key) {
        case 'handle':
          return a.handle.localeCompare(b.handle) * sign;
        case 'points':
          return (a.points - b.points) * sign;
        case 'exact':
          return (a.exactCount - b.exactCount) * sign;
        case 'result':
          return (a.resultCount - b.resultCount) * sign;
        default:
          return 0;
      }
    });
    return list;
  });

  toggleSort(key: RankSortKey): void {
    if (this.sortKey() === key) {
      this.sortDir.set(this.sortDir() === 'asc' ? 'desc' : 'asc');
    } else {
      this.sortKey.set(key);
      // Numéricas arrancan desc (más alto primero), texto/pos asc.
      this.sortDir.set(key === 'pos' || key === 'handle' ? 'asc' : 'desc');
    }
  }

  sortIndicator(key: RankSortKey): string {
    if (this.sortKey() !== key) return '';
    return this.sortDir() === 'asc' ? '▲' : '▼';
  }

  ariaSortFor(key: RankSortKey): 'ascending' | 'descending' | 'none' {
    if (this.sortKey() !== key) return 'none';
    return this.sortDir() === 'asc' ? 'ascending' : 'descending';
  }

  /** Posición canónica del user en el ranking general (1-indexed). */
  rankIndexOf(userId: string): number {
    const i = this.rows().findIndex((r) => r.userId === userId);
    return i >= 0 ? i + 1 : 0;
  }

  shareGroup(): void {
    this.sharing.set(true);
  }

  async ngOnInit() {
    this.currentUserId = this.auth.user()?.sub ?? '';
    await this.load();
  }

  /** Carga datos del grupo. Extraído de ngOnInit para que ngOnChanges
   *  pueda re-llamarlo cuando el @Input id cambia (navegación de
   *  /groups/A → /groups/B reusa el mismo component instance). */
  private async load() {
    this.loading.set(true);
    this.group.set(null);
    this.groupImageUrl.set(null);
    this.rows.set([]);
    try {
      const [grp, totals, members] = await Promise.all([
        this.api.getGroup(this.id),
        this.api.groupLeaderboard(this.id),
        this.api.groupMembers(this.id),
      ]);
      if (grp.data) {
        const imageKey = (grp.data as { imageKey?: string | null }).imageKey ?? null;
        // comodinesEnabled cast — schema todavía no deployado en sandbox.
        // Task 5 regenera schema.d.ts y este cast deja de ser necesario.
        const comodinesEnabled =
          (grp.data as { comodinesEnabled?: boolean | null }).comodinesEnabled ?? null;
        const description =
          (grp.data as { description?: string | null }).description ?? null;
        const entryFeeEnabled =
          (grp.data as { entryFeeEnabled?: boolean | null }).entryFeeEnabled ?? null;
        const entryFeeInstructions =
          (grp.data as { entryFeeInstructions?: string | null }).entryFeeInstructions ?? null;
        this.group.set({
          id: grp.data.id,
          name: grp.data.name,
          joinCode: grp.data.joinCode,
          adminUserId: grp.data.adminUserId,
          createdAt: grp.data.createdAt,
          mode: (grp.data.mode ?? 'COMPLETE') as 'SIMPLE' | 'COMPLETE',
          imageKey,
          description,
          comodinesEnabled,
          prize1st: grp.data.prize1st ?? null,
          prize2nd: grp.data.prize2nd ?? null,
          prize3rd: grp.data.prize3rd ?? null,
          entryFeeEnabled,
          entryFeeInstructions,
        });
        // Resolver signed URL para el logo en background. Si falla (cert
        // expirado, key fantasma), groupImageUrl queda null y el header
        // muestra solo el nombre.
        if (imageKey) {
          (async () => {
            try {
              const out = await getUrl({ path: imageKey, options: { expiresIn: 3600 } });
              this.groupImageUrl.set(out.url.toString());
            } catch {
              /* silencioso — sin imagen, fallback texto */
            }
          })();
        }
      }

      const userMetaByUser = new Map<string, { handle: string; avatarKey: string | null }>();
      await Promise.all(
        (members.data ?? []).map(async (m) => {
          const u = await this.api.getUser(m.userId);
          const data = u.data as { handle?: string; avatarKey?: string | null } | undefined;
          userMetaByUser.set(m.userId, {
            handle: data?.handle ?? m.userId.slice(0, 6),
            avatarKey: data?.avatarKey ?? null,
          });
        }),
      );

      const entryFeePaidByUser = new Map<string, string | null>();
      for (const m of (members.data ?? [])) {
        entryFeePaidByUser.set(
          m.userId,
          (m as { entryFeePaidAt?: string | null }).entryFeePaidAt ?? null,
        );
      }

      const sorted = (totals.data ?? []).sort(
        (a, b) => (b.points ?? 0) - (a.points ?? 0),
      );
      this.rows.set(
        sorted.map((t) => ({
          userId: t.userId,
          handle: userMetaByUser.get(t.userId)?.handle ?? t.userId.slice(0, 6),
          avatarKey: userMetaByUser.get(t.userId)?.avatarKey ?? null,
          points: t.points ?? 0,
          exactCount: t.exactCount ?? 0,
          resultCount: t.resultCount ?? 0,
          entryFeePaidAt: entryFeePaidByUser.get(t.userId) ?? null,
        })),
      );
    } finally {
      this.loading.set(false);
    }
  }

  @HostListener('window:focus')
  onWindowFocus(): void {
    void this.refreshMemberships();
  }

  /** Refetch memberships for this group to pick up admin-side
   *  entryFeePaidAt updates. Lighter than full load() — only touches the
   *  entryFeePaidAt field on existing rows; does not refetch leaderboard. */
  private async refreshMemberships(): Promise<void> {
    if (!this.id) return;
    try {
      const res = await this.api.groupMembers(this.id);
      const map = new Map<string, string | null>();
      for (const m of (res.data ?? [])) {
        map.set(m.userId, (m as { entryFeePaidAt?: string | null }).entryFeePaidAt ?? null);
      }
      this.rows.set(this.rows().map((r) => ({
        ...r,
        entryFeePaidAt: map.has(r.userId) ? map.get(r.userId) ?? null : r.entryFeePaidAt,
      })));
    } catch {
      /* Focus is not user-initiated; do not pop a toast on failure. */
    }
  }

  async copyLink() {
    try {
      await navigator.clipboard.writeText(this.inviteUrl());
      this.copied.set(true);
      setTimeout(() => this.copied.set(false), 2000);
    } catch {
      this.toast.error('No se pudo copiar el link');
    }
  }

  scrollToAdmin() {
    const el = document.querySelector('section.group-section:last-of-type');
    el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  async del() {
    const ok = await this.confirmDialog.ask({
      title: 'Eliminar grupo',
      message: 'Esta acción borra el grupo para todos los miembros y no se puede deshacer.',
      confirmLabel: 'Eliminar grupo',
      cancelLabel: 'Cancelar',
      danger: true,
    });
    if (!ok) return;
    try {
      await this.api.deleteGroup(this.id);
      this.toast.success('Grupo eliminado');
      void this.router.navigate(['/groups']);
    } catch (e) {
      this.toast.error(humanizeError(e));
    }
  }

  async confirmRemoveMember(userId: string, handle: string): Promise<void> {
    const confirmed = await this.confirmDialog.ask({
      title: 'Eliminar miembro',
      message:
        `Quitar a @${handle} del grupo borra su score acumulado en este grupo. ` +
        'Sus picks del torneo no se ven afectados.',
      confirmLabel: 'Eliminar miembro',
      cancelLabel: 'Cancelar',
      danger: true,
    });
    if (!confirmed) return;
    const groupId = this.group()?.id;
    if (!groupId) return;

    this.removingUserId.set(userId);
    try {
      const res = await this.api.removeMember({ groupId, userId });
      if (!res.data?.ok) {
        const msg = res.data?.message ?? 'No se pudo eliminar al miembro';
        this.toast.error(msg);
        return;
      }
      this.toast.success(`@${handle} eliminado del grupo`);
      await this.load();
    } catch (e) {
      this.toast.error(humanizeError(e));
    } finally {
      this.removingUserId.set(null);
    }
  }

  // ---------- Cuota de ingreso (admin) ----------

  /** Admin toggles a member's entry-fee paid state. Optimistic update with
   *  rollback on failure. No-op on the admin's own row (use Editar grupo to
   *  turn off the feature entirely). */
  async toggleEntryFeePaid(userId: string, currentlyPaid: boolean): Promise<void> {
    if (userId === this.currentUserId) return;
    if (!this.isAdminOfGroup()) return;

    const newPaidAt = currentlyPaid ? null : new Date().toISOString();
    const prev = this.rows();
    const next = prev.map((m) =>
      m.userId === userId ? { ...m, entryFeePaidAt: newPaidAt } : m,
    );
    this.rows.set(next);

    try {
      await this.api.markEntryFeePaid({ groupId: this.id, userId, paid: !currentlyPaid });
    } catch (e) {
      this.rows.set(prev); // rollback
      this.toast.error(humanizeError(e));
    }
  }

  // ---------- Abandonar grupo (no-admin) ----------

  async leave(): Promise<void> {
    const g = this.group();
    if (!g) return;
    const ok = await this.confirmDialog.ask({
      title: 'Abandonar grupo',
      message:
        `Vas a abandonar "${g.name}". Tu score acumulado en este grupo ` +
        'se borra. Tus picks del torneo no se ven afectados. Esta acción ' +
        'no se puede deshacer.',
      confirmLabel: 'Abandonar grupo',
      cancelLabel: 'Cancelar',
      danger: true,
    });
    if (!ok) return;
    try {
      await this.api.leaveGroup(g.id);
      this.toast.success('Abandonaste el grupo');
      void this.router.navigate(['/groups']);
    } catch (e) {
      this.toast.error(humanizeError(e));
    }
  }

  // ---------- Transferir admin ----------

  /** Lista de miembros del grupo que NO son el admin actual. Candidatos
   *  válidos para recibir el rol. Usado por el modal de transferir. */
  nonAdminMembers = computed(() => {
    const g = this.group();
    if (!g) return [];
    return this.rows().filter((r) => r.userId !== g.adminUserId);
  });

  openTransferAdmin(): void {
    this.newAdminId.set(null);
    this.transferring.set('open');
  }

  closeTransferAdmin(): void {
    if (this.transferring() === 'submitting') return;
    this.transferring.set(null);
    this.newAdminId.set(null);
  }

  async submitTransferAdmin(): Promise<void> {
    const newAdminId = this.newAdminId();
    const g = this.group();
    if (!newAdminId || !g) return;
    const target = this.rows().find((r) => r.userId === newAdminId);
    if (!target) return;

    const ok = await this.confirmDialog.ask({
      title: 'Transferir admin',
      message:
        `Vas a transferir el rol de admin de "${g.name}" a @${target.handle}. ` +
        'Vas a perder los privilegios de admin: no podrás editar el grupo, ' +
        'invitar miembros ni eliminarlo. Esta acción no se puede deshacer.',
      confirmLabel: 'Transferir admin',
      cancelLabel: 'Cancelar',
      danger: true,
    });
    if (!ok) return;

    this.transferring.set('submitting');
    try {
      await this.api.transferGroupAdmin({ groupId: g.id, newAdminUserId: newAdminId });
      this.toast.success(`@${target.handle} es el nuevo admin de "${g.name}"`);
      this.transferring.set(null);
      this.newAdminId.set(null);
      await this.load();
    } catch (e) {
      this.toast.error(humanizeError(e));
      this.transferring.set('open');
    }
  }
}
