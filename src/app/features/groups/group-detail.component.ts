import { Component, HostListener, Input, OnChanges, OnInit, SimpleChanges, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { ApiService } from '../../core/api/api.service';
import { AuthService } from '../../core/auth/auth.service';
import { ToastService } from '../../core/notifications/toast.service';
import { humanizeError } from '../../core/notifications/domain-errors';
import { ConfirmDialogService } from '../../shared/ui/confirm-dialog.service';
import { ModalComponent } from '../../shared/ui/modal/modal.component';
import { getUrl } from 'aws-amplify/storage';

type GroupTab = 'lb' | 'mb' | 'pr';

interface GroupHeader {
  id: string;
  name: string;
  joinCode: string;
  adminUserId: string;
  createdAt: string;
  mode: 'SIMPLE' | 'COMPLETE';
  imageKey: string | null;
  description: string | null;
  comodinesEnabled: boolean | null;
  prize1st: string | null;
  prize2nd: string | null;
  prize3rd: string | null;
  entryFeeEnabled: boolean | null;
  entryFeeInstructions: string | null;
}

interface RankRow {
  userId: string;
  handle: string;
  avatarKey?: string | null;
  points: number;
  exactCount: number;
  resultCount: number;
  entryFeePaidAt: string | null;
  /** Membership.createdAt — para "Se unió …" en la tab Miembros. */
  memberSince: string | null;
}

interface Duel {
  me: RankRow;
  rival: RankRow;
  gap: number;
  leading: boolean;
}

/**
 * Detalle de grupo — layout del diseño polla-group-detail.html, cableado con
 * DATOS REALES donde existen (grupo, miembros, leaderboard, premios, cuota).
 *
 * FALTA (hardcodeado como ejemplo hasta tener backend): puntos por jornada
 * (J1), % de acierto y movimiento (Mov) en el leaderboard; el subtítulo de
 * movimiento y la card "Jornada" del KPI strip; la narrativa del duelo; el
 * "$X por persona" y la fecha exacta de reparto del podio. Cada uno marcado
 * con un comentario `FALTA:` en el template / helpers.
 */
@Component({
  standalone: true,
  selector: 'app-group-detail',
  imports: [RouterLink, ModalComponent],
  template: `
    <section class="page gd">

      @if (loading()) {
        <p class="loading-msg">Cargando grupo…</p>
      } @else if (group() === null) {
        <p class="loading-msg">Grupo no encontrado.</p>
      }
      @if (!loading() && group(); as g) {

        <a routerLink="/groups" class="back-link">‹ Mis grupos</a>

        <!-- group hero (REAL) -->
        <div class="ghero">
          <div class="ghero__in">
            @if (groupImageUrl()) {
              <img class="ghero__av" style="object-fit:cover;border:1px solid rgba(255,255,255,0.3)" [src]="groupImageUrl()!" alt="">
            } @else {
              <div class="ghero__av">{{ initials(g.name) }}</div>
            }
            <div style="flex:1;min-width:160px">
              <h1 style="font-family:var(--font-display);font-size:30px;line-height:1">{{ g.name }}</h1>
              <div class="ghero__meta">
                <span class="pill pill--green">{{ g.mode === 'COMPLETE' ? 'COMPLETO' : 'SIMPLE' }}</span>
                <span>👥 {{ rows().length }} {{ rows().length === 1 ? 'jugador' : 'jugadores' }}</span>
                @if (hasPrizes()) { <span>💰 {{ prizesTotalLabel() }}</span> }
                <span>🔑 {{ g.joinCode }}</span>
              </div>
            </div>
            <div class="ghero__actions">
              <button class="btn btn--p btn--sm" type="button" (click)="inviteMenu.set(true)">Invitar</button>
              @if (isAdminOfGroup()) {
                <button class="btn btn--s btn--sm" type="button"
                        style="background:rgba(255,255,255,0.1);color:#fff;border-color:rgba(255,255,255,0.2)"
                        (click)="configMenu.set(true)">Configurar</button>
              }
            </div>
          </div>
        </div>

        <!-- KPI strip -->
        <div class="kpis">
          <div class="kpi kpi--g">
            <div class="kpi__l">Tu posición</div>
            <div class="kpi__v">{{ myPos() ? myPos() + '°' : '—' }} <small>/{{ rows().length }}</small></div>
            <!-- FALTA: movimiento por jornada (sin cortes de jornada en backend) -->
            <div class="kpi__d">{{ myPos() === 1 ? 'Lideras el grupo' : 'En carrera' }}</div>
          </div>
          <div class="kpi">
            <div class="kpi__l">Tus puntos</div>
            <div class="kpi__v">{{ myPoints() }}</div>
            <div class="kpi__d">{{ myPointsSub() }}</div>
          </div>
          <div class="kpi">
            <div class="kpi__l">{{ hasPrizes() ? 'Bote acumulado' : 'Miembros' }}</div>
            <div class="kpi__v">{{ hasPrizes() ? prizesTotalLabel() : rows().length }}</div>
            <div class="kpi__d">{{ boteSub() }}</div>
          </div>
          @if (currentJornada(); as j) {
            <div class="kpi">
              <div class="kpi__l">Jornada</div>
              <div class="kpi__v">{{ j.label }} <small>/{{ j.totalJornadas }}</small></div>
              <div class="kpi__d">{{ j.startsInDays === null ? 'En curso' : (j.startsInDays === 0 ? 'Arranca hoy' : 'Arranca en ' + j.startsInDays + (j.startsInDays === 1 ? ' día' : ' días')) }}</div>
            </div>
          } @else {
            <div class="kpi">
              <div class="kpi__l">Jornada</div>
              <div class="kpi__v">—</div>
              <div class="kpi__d">Sin fixture cargado</div>
            </div>
          }
        </div>

        <!-- duelo por la cima (sides REALES) -->
        @if (duel(); as d) {
          <div class="card">
            <div class="sec" style="margin-bottom:14px"><h2 style="font-size:16px">🔥 El duelo por la cima</h2><span class="pill" [class.pill--green]="d.leading">{{ d.leading ? 'Lideras' : 'A ' + d.gap + ' pts' }}</span></div>
            <div class="duel">
              <div class="duel__side"><span class="av av--md" style="background:var(--pa-green)">{{ ini(d.me.handle) }}</span><div style="font-weight:600;font-size:13px" translate="no">&#64;{{ d.me.handle }} (tú)</div><div class="duel__pts" style="color:var(--pa-green-d)">{{ d.me.points }}</div></div>
              <div class="duel__gap"><b>{{ d.leading ? '+' : '' }}{{ d.gap }}</b><span>{{ d.leading ? 'pts de ventaja' : 'pts para alcanzar' }}</span></div>
              <div class="duel__side"><span class="av av--md">{{ ini(d.rival.handle) }}</span><div style="font-weight:600;font-size:13px" translate="no">&#64;{{ d.rival.handle }}</div><div class="duel__pts">{{ d.rival.points }}</div></div>
              <div class="duel__bar"><i style="background:var(--pa-green)" [style.flex]="d.me.points || 1"></i><i style="background:#d4d2c8" [style.flex]="d.rival.points || 1"></i></div>
            </div>
            <div class="info" style="margin-top:14px">
              {{ d.leading ? 'Llevas ' + d.gap + ' pts de ventaja. Mantén el ritmo metiendo tus picks.' : 'Estás a ' + d.gap + ' pts. Acierta tus próximos marcadores para alcanzar el puesto de arriba.' }}
              <a routerLink="/picks" style="color:var(--pa-green);font-weight:600">Ir a mis picks →</a>
            </div>
          </div>
        }

        <!-- tabs -->
        <div class="tabs">
          <button [class.on]="tab() === 'lb'" (click)="tab.set('lb')">Leaderboard</button>
          <button [class.on]="tab() === 'mb'" (click)="tab.set('mb')">Miembros</button>
          <button [class.on]="tab() === 'pr'" (click)="tab.set('pr')">Premios</button>
        </div>

        <!-- TAB Leaderboard (filas REALES; J1/Acierto/Mov hardcodeados) -->
        @if (tab() === 'lb') {
          <div class="card card--pad0">
            <table class="tbl">
              <thead><tr>
                <th>#</th><th>Jugador</th><th class="num">J1</th><th class="num">Pts</th><th class="num">Acierto</th><th class="num">Mov</th>
                @if (isAdminOfGroup() && g.entryFeeEnabled) { <th class="cuota-col num">Cuota</th> }
                @if (isAdminOfGroup()) { <th class="num">Acción</th> }
              </tr></thead>
              <tbody>
                @for (r of rows(); track r.userId; let i = $index) {
                  <tr [class.me]="r.userId === currentUserId">
                    <td class="pos" [style.color]="r.userId === currentUserId ? 'var(--pa-green)' : null">{{ i + 1 }}</td>
                    <td><div class="tbl__team"><span class="av av--sm" [style.background]="r.userId === currentUserId ? 'var(--pa-green)' : null">{{ ini(r.handle) }}</span><span translate="no">&#64;{{ r.handle }}</span>@if (r.userId === currentUserId) { <span style="color:var(--pa-muted)">&nbsp;(tú)</span> }</div></td>
                    <!-- FALTA: J1 (puntos por jornada), Acierto (% de acierto) y Mov (movimiento) -->
                    <td class="num">{{ jornadaPts(r) }}</td>
                    <td class="pts" [style.color]="r.userId === currentUserId ? 'var(--pa-green-d)' : null">{{ r.points }}</td>
                    <td class="num">{{ acierto(r) }}</td>
                    <td class="num"><span class="mv" [class]="'mv ' + movement(r).c">{{ movement(r).l }}</span></td>
                    @if (isAdminOfGroup() && g.entryFeeEnabled) {
                      <td class="cuota-col num">
                        @if (r.userId === currentUserId) {
                          <span class="pill pill--green">Pagada</span>
                        } @else {
                          <button type="button" class="btn btn--sm" [class.btn--ghost]="r.entryFeePaidAt === null" [class.btn--s]="r.entryFeePaidAt !== null"
                                  (click)="toggleEntryFeePaid(r.userId, r.entryFeePaidAt !== null)">
                            {{ r.entryFeePaidAt !== null ? 'Pagada' : 'Marcar' }}
                          </button>
                        }
                      </td>
                    }
                    @if (isAdminOfGroup()) {
                      <td class="num">
                        @if (r.userId !== g.adminUserId) {
                          <button type="button" class="btn btn--danger btn--sm" [disabled]="removingUserId() === r.userId" (click)="confirmRemoveMember(r.userId, r.handle)">Eliminar</button>
                        }
                      </td>
                    }
                  </tr>
                } @empty {
                  <tr><td [attr.colspan]="isAdminOfGroup() ? (g.entryFeeEnabled ? 8 : 7) : 6" style="text-align:center;padding:22px;color:var(--pa-muted)">Aún no hay puntajes. Espera al primer partido.</td></tr>
                }
              </tbody>
            </table>
          </div>
          <!-- FALTA: J1/Acierto/Mov son de ejemplo hasta tener scoring por jornada -->
          <div class="info" style="margin-top:10px"><b>J1</b> (puntos de jornada), <b>Acierto</b> y <b>Mov</b> son valores de ejemplo hasta tener cortes por jornada en el backend.</div>
        }

        <!-- TAB Miembros (REAL) -->
        @if (tab() === 'mb') {
          <div class="card">
            @for (r of rows(); track r.userId) {
              <div class="member">
                <span class="av av--md" [style.background]="r.userId === currentUserId ? 'var(--pa-green)' : null">{{ ini(r.handle) }}</span>
                <div style="flex:1">
                  <b translate="no">&#64;{{ r.handle }}</b>
                  @if (r.userId === g.adminUserId) { <span class="pill pill--green" style="margin-left:6px">Admin</span> }
                  @if (r.userId === currentUserId) { <span style="color:var(--pa-muted);font-size:11px">&nbsp;(tú)</span> }
                  @if (r.memberSince) { <div style="font-size:11px;color:var(--pa-muted)">Se unió {{ joinedLabel(r.memberSince) }}</div> }
                </div>
                @if (isAdminOfGroup() && r.userId !== g.adminUserId) {
                  <button class="btn btn--ghost btn--sm" type="button" (click)="transferTo(r.userId, r.handle)">Hacer admin</button>
                  <button class="btn btn--danger btn--sm" type="button" [disabled]="removingUserId() === r.userId" (click)="confirmRemoveMember(r.userId, r.handle)">Eliminar</button>
                }
              </div>
            } @empty {
              <p style="text-align:center;color:var(--pa-muted);padding:18px">Aún no hay miembros con actividad.</p>
            }
          </div>
        }

        <!-- TAB Premios (montos + líderes REALES; $X por persona y fecha hardcodeados) -->
        @if (tab() === 'pr') {
          <div class="card">
            <div class="sec" style="margin-bottom:14px"><h2 style="font-size:16px">💰 Premios en juego</h2>@if (hasPrizes()) { <span class="pill pill--gold">Bote {{ prizesTotalLabel() }}</span> }</div>
            @if (hasPrizes()) {
              <div class="podium">
                <div class="pod pod--2"><div class="pod__pos">2°</div><div class="pod__amt" [style.font-size]="isShort(g.prize2nd) ? null : '24px'">{{ g.prize2nd || '—' }}</div><div class="pod__lbl">Subcampeón</div>@if (rows()[1]; as r2) { <div class="pod__who"><span class="av av--sm" style="width:18px;height:18px;font-size:9px">{{ ini(r2.handle) }}</span><span translate="no">&#64;{{ r2.handle }}</span></div> }</div>
                <div class="pod pod--1"><div class="pod__pos">🏆 1°</div><div class="pod__amt" [style.font-size]="isShort(g.prize1st) ? null : '28px'">{{ g.prize1st || '—' }}</div><div class="pod__lbl">Campeón del grupo</div>@if (rows()[0]; as r1) { <div class="pod__who"><span class="av av--sm" style="width:18px;height:18px;font-size:9px;background:var(--pa-green)">{{ ini(r1.handle) }}</span><span translate="no">&#64;{{ r1.handle }}</span></div> }</div>
                <div class="pod pod--3"><div class="pod__pos">3°</div><div class="pod__amt" [style.font-size]="isShort(g.prize3rd) ? null : '24px'">{{ g.prize3rd || '—' }}</div><div class="pod__lbl">Tercer lugar</div>@if (rows()[2]; as r3) { <div class="pod__who"><span class="av av--sm" style="width:18px;height:18px;font-size:9px">{{ ini(r3.handle) }}</span><span translate="no">&#64;{{ r3.handle }}</span></div> }</div>
              </div>
              <div style="display:flex;justify-content:space-between;align-items:center;margin-top:14px;padding-top:14px;border-top:1px solid var(--pa-line);font-size:12px;color:var(--pa-muted);flex-wrap:wrap;gap:8px">
                <!-- FALTA: "$X por persona" (no se guarda monto de cuota) -->
                <span>@if (g.entryFeeEnabled) { 👥 {{ paidCount() }} de {{ rows().length }} pagaron la cuota } @else { Reparto según el ranking final }</span>
                <!-- FALTA: fecha exacta de reparto (hardcodeada al fin del Mundial) -->
                <span>Se reparte al final del Mundial · <b style="color:var(--pa-ink)">19 jul</b></span>
              </div>
            } @else {
              <p style="color:var(--pa-muted);font-size:13px;padding:8px 0">
                Sin premios definidos.
                @if (isAdminOfGroup()) { <a [routerLink]="['/groups', g.id, 'prizes']" style="color:var(--pa-green);font-weight:600">Define los premios →</a> }
              </p>
            }
          </div>
          <div class="info">El reparto es automático según la tabla final. El admin puede editar la estructura de premios hasta el inicio del torneo.</div>
        }

        @if (!isAdminOfGroup()) {
          <button class="btn btn--danger" type="button" style="align-self:start" (click)="leave()">Salir del grupo</button>
        }

        <!-- Menú "Invitar": invitar por email + compartir -->
        @if (inviteMenu()) {
          <app-modal [open]="true" title="Invitar al grupo" description="Suma jugadores a tu grupo." size="sm" (close)="inviteMenu.set(false)">
            <div slot="body" style="display:flex;flex-direction:column;gap:8px;">
              @if (isAdminOfGroup()) {
                <a class="btn btn--p btn--block" [routerLink]="['/groups', g.id, 'invite']" (click)="inviteMenu.set(false)">✉ Invitar por email</a>
              }
              <button class="btn btn--s btn--block" type="button" (click)="inviteMenu.set(false); shareGroup()">🔗 Compartir grupo (link / QR)</button>
            </div>
          </app-modal>
        }

        <!-- Menú "Configurar": acciones de admin -->
        @if (configMenu()) {
          <app-modal [open]="true" title="Configurar grupo" description="Acciones de administrador." size="sm" (close)="configMenu.set(false)">
            <div slot="body" style="display:flex;flex-direction:column;gap:8px;">
              <a class="btn btn--s btn--block" [routerLink]="['/groups', g.id, 'edit']" (click)="configMenu.set(false)">✏ Editar grupo</a>
              <a class="btn btn--s btn--block" [routerLink]="['/groups', g.id, 'prizes']" (click)="configMenu.set(false)">💰 Editar premios</a>
              <button class="btn btn--s btn--block" type="button" [disabled]="rows().length <= 1" (click)="configMenu.set(false); openTransferAdmin()">👑 Transferir admin</button>
              <button class="btn btn--danger btn--block" type="button" (click)="configMenu.set(false); del()">🗑 Eliminar grupo</button>
            </div>
          </app-modal>
        }

        <!-- Compartir grupo · link + QR placeholder (REAL) -->
        @if (sharing()) {
          <app-modal [open]="true" title="Compartir grupo"
                     description="Comparte este link con tus amigos o muéstrales el QR cuando lo agreguemos."
                     size="sm" (close)="sharing.set(false)">
            <div slot="body" style="display:flex;flex-direction:column;gap:14px;">
              <div><div class="md__k">Código del grupo</div><div class="group-share__code">{{ g.joinCode }}</div></div>
              <div><div class="md__k">Link de invitación</div><div class="group-share__link" translate="no">{{ inviteUrl() }}</div></div>
              <div class="group-share__qr-placeholder" aria-hidden="true"><span>QR</span><small>Se mostrará aquí cuando integremos el generador.</small></div>
            </div>
            <div slot="footer">
              <button type="button" class="btn btn--s btn--sm" (click)="sharing.set(false)">Cerrar</button>
              <button type="button" class="btn btn--p btn--sm" (click)="copyLink()">{{ copied() ? '✓ Copiado' : 'Copiar link' }}</button>
            </div>
          </app-modal>
        }

        <!-- Recordatorio + modal de cuota (REAL, según el grupo) -->
        @if (showEntryFeeReminder()) {
          <button type="button" class="entry-fee-reminder" data-testid="entry-fee-reminder"
                  aria-label="Cuota de ingreso pendiente. Ver instrucciones." (click)="openEntryFeeModal()">
            <span aria-hidden="true">⚠</span>
            <span class="entry-fee-reminder__text"><strong>Tu cuota está pendiente</strong><small>Toca para ver las instrucciones</small></span>
          </button>
        }
        @if (entryFeeModalOpen()) {
          <app-modal [open]="true" title="Instrucciones de pago" size="sm" data-testid="entry-fee-modal" (close)="closeEntryFeeModal()">
            <div slot="body">
              <div class="entry-fee-modal-body">{{ group()?.entryFeeInstructions }}</div>
              <p class="entry-fee-modal-note">Cuando el admin marque tu cuota como pagada, este recordatorio desaparece.</p>
            </div>
            <div slot="footer"><button type="button" class="btn btn--p btn--sm" (click)="closeEntryFeeModal()">Entendido</button></div>
          </app-modal>
        }

        <!-- Transferir admin · lista de miembros reales -->
        @if (transferring()) {
          <app-modal [open]="true" title="Transferir admin"
                     description="El nuevo admin podrá editar, invitar y eliminar el grupo. Tú pasas a ser miembro normal."
                     size="sm" (close)="closeTransferAdmin()">
            <div slot="body" style="display:flex;flex-direction:column;gap:8px;">
              @for (m of nonAdminMembers(); track m.userId) {
                <label class="transfer-row" [class.is-selected]="newAdminId() === m.userId">
                  <input type="radio" name="newAdmin" [value]="m.userId" [checked]="newAdminId() === m.userId" (change)="newAdminId.set(m.userId)">
                  <div style="flex:1;"><div style="font-weight:700;" translate="no">&#64;{{ m.handle }}</div></div>
                </label>
              }
              @if (nonAdminMembers().length === 0) {
                <p style="font-size:13px;color:var(--pa-muted);">No hay otros miembros. Invita a alguien primero o elimina el grupo.</p>
              }
            </div>
            <div slot="footer">
              <button type="button" class="btn btn--s btn--sm" (click)="closeTransferAdmin()" [disabled]="transferring() === 'submitting'">Cancelar</button>
              <button type="button" class="btn btn--p btn--sm" (click)="submitTransferAdmin()" [disabled]="!newAdminId() || transferring() === 'submitting'">{{ transferring() === 'submitting' ? 'Transfiriendo…' : 'Transferir' }}</button>
            </div>
          </app-modal>
        }

      }
    </section>
  `,
  styles: [`
    :host {
      display: block;
      --pa-ink: #0a0a0a;
      --pa-green: #02cc74;
      --pa-green-d: #016b3d;
      --pa-line: rgba(0,0,0,0.08);
      --pa-muted: rgba(10,10,10,0.55);
    }

    .gd { display: flex; flex-direction: column; gap: 18px; }
    .loading-msg { padding: 48px 16px; text-align: center; color: var(--pa-muted); font-size: 14px; }
    .back-link { font-size: 13px; color: var(--pa-muted); }

    .sec { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
    .sec h2 { font-family: var(--font-display); letter-spacing: .01em; margin: 0; }
    .card { background: #fff; border: 1px solid var(--pa-line); border-radius: 14px; padding: 18px; }
    .card--pad0 { padding: 0; overflow: hidden; }

    .btn { display: inline-flex; align-items: center; justify-content: center; gap: 8px; font-family: var(--font-primary); font-weight: 600; font-size: 13px; letter-spacing: .04em; text-transform: uppercase; padding: 12px 20px; border-radius: 8px; cursor: pointer; border: 1px solid transparent; transition: all .15s; min-height: 44px; text-decoration: none; }
    .btn--p { background: var(--pa-green); color: #fff; border-color: var(--pa-green); }
    .btn--p:hover { background: var(--pa-green-d); border-color: var(--pa-green-d); }
    .btn--s { background: #fff; color: var(--pa-ink); border-color: var(--pa-line); }
    .btn--s:hover { border-color: rgba(0,0,0,0.2); }
    .btn--ghost { background: transparent; color: var(--pa-green); border-color: rgba(2,204,116,0.4); }
    .btn--ghost:hover { background: rgba(2,204,116,0.08); }
    .btn--danger { background: #fff; color: #dc2626; border-color: rgba(220,38,38,0.3); }
    .btn--danger:hover { background: rgba(220,38,38,0.06); }
    .btn--block { width: 100%; }
    .btn--sm { padding: 8px 14px; font-size: 11px; min-height: 0; }
    .btn:disabled { opacity: .5; cursor: not-allowed; }

    .pill { display: inline-flex; align-items: center; gap: 5px; padding: 3px 9px; border-radius: 999px; font-size: 10px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; background: rgba(0,0,0,0.06); color: var(--pa-muted); }
    .pill--green { background: rgba(2,204,116,0.15); color: var(--pa-green-d); }
    .pill--gold { background: rgba(245,158,11,0.18); color: #b45309; }
    .pill--bronze { background: rgba(180,83,9,0.18); color: #92400e; }
    .pill--grey { background: rgba(0,0,0,0.06); color: var(--pa-muted); }

    .av { border-radius: 50%; background: linear-gradient(135deg, var(--pa-green-d), var(--pa-green)); display: grid; place-items: center; color: #fff; font-weight: 600; flex-shrink: 0; }
    .av--sm { width: 32px; height: 32px; font-size: 12px; }
    .av--md { width: 40px; height: 40px; font-size: 14px; }

    .kpis { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 1px; background: var(--pa-line); border: 1px solid var(--pa-line); border-radius: 12px; overflow: hidden; }
    .kpi { background: #fff; padding: 14px 16px; }
    .kpi--g { background: linear-gradient(135deg, var(--pa-green), var(--pa-green-d)); color: #fff; }
    .kpi__l { font-size: 9px; letter-spacing: .16em; text-transform: uppercase; color: var(--pa-muted); margin-bottom: 4px; }
    .kpi--g .kpi__l { color: rgba(255,255,255,0.85); }
    .kpi__v { font-family: var(--font-display); font-size: 26px; line-height: 1; font-variant-numeric: tabular-nums; }
    .kpi__v small { font-size: 11px; color: var(--pa-muted); font-family: var(--font-primary); }
    .kpi--g .kpi__v small { color: rgba(255,255,255,0.7); }
    .kpi__d { font-size: 10px; color: var(--pa-green); font-weight: 600; margin-top: 3px; }
    .kpi--g .kpi__d { color: rgba(255,255,255,0.85); }

    .tbl { width: 100%; border-collapse: collapse; font-size: 13px; }
    .tbl th { text-align: left; font-size: 10px; letter-spacing: .12em; text-transform: uppercase; color: var(--pa-muted); font-weight: 600; padding: 10px 12px; border-bottom: 1px solid var(--pa-line); }
    .tbl td { padding: 11px 12px; border-bottom: 1px solid rgba(0,0,0,0.05); font-variant-numeric: tabular-nums; vertical-align: middle; }
    .tbl tr:last-child td { border-bottom: 0; }
    .tbl tbody tr:hover td { background: rgba(2,204,116,0.04); }
    .tbl tr.me td { background: rgba(2,204,116,0.07); }
    .tbl tr.me td:first-child { box-shadow: inset 3px 0 0 var(--pa-green); }
    .tbl .num { text-align: right; }
    .tbl .pos { font-family: var(--font-display); font-size: 16px; color: var(--pa-muted); width: 36px; }
    .tbl .pts { font-family: var(--font-display); font-size: 17px; text-align: right; }
    .tbl__team { display: flex; align-items: center; gap: 9px; font-weight: 600; }
    .cuota-col { white-space: nowrap; }

    .info { background: #fafaf6; border: 1px solid var(--pa-line); border-radius: 8px; padding: 12px; font-size: 12px; color: var(--pa-muted); line-height: 1.5; }
    .info a { color: var(--pa-green); }

    .tabs { display: flex; gap: 4px; border-bottom: 2px solid var(--pa-line); }
    .tabs button { border: 0; background: none; font-family: var(--font-primary); font-weight: 600; font-size: 13px; letter-spacing: .04em; padding: 12px 16px; border-bottom: 3px solid transparent; margin-bottom: -2px; color: var(--pa-muted); cursor: pointer; }
    .tabs button.on { color: var(--pa-ink); border-color: var(--pa-green); }

    .member { display: flex; align-items: center; gap: 12px; padding: 12px 0; border-bottom: 1px solid var(--pa-line); }
    .member:last-child { border-bottom: 0; }

    .ghero { background: linear-gradient(135deg, #0a0a0a 0%, #0a3d20 65%, #067a4a 130%); color: #fff; border-radius: 16px; padding: 22px; position: relative; overflow: hidden; }
    .ghero::before { content: ""; position: absolute; inset: 0; background: radial-gradient(60% 90% at 88% 20%, rgba(2,204,116,0.28), transparent 60%); }
    .ghero__in { position: relative; display: flex; align-items: center; gap: 18px; flex-wrap: wrap; }
    .ghero__av { width: 64px; height: 64px; border-radius: 16px; background: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.2); display: grid; place-items: center; font-family: var(--font-display); font-size: 28px; flex-shrink: 0; }
    .ghero__meta { font-size: 12px; color: rgba(255,255,255,0.7); margin-top: 6px; display: flex; gap: 10px; flex-wrap: wrap; align-items: center; }
    .ghero__actions { margin-left: auto; display: flex; gap: 8px; }
    @media (max-width: 560px) { .ghero__actions { margin-left: 0; width: 100%; } }

    .duel { display: grid; grid-template-columns: 1fr auto 1fr; gap: 14px; align-items: center; }
    .duel__side { display: flex; flex-direction: column; align-items: center; gap: 6px; text-align: center; }
    .duel__pts { font-family: var(--font-display); font-size: 34px; line-height: 1; }
    .duel__gap { text-align: center; }
    .duel__gap b { font-family: var(--font-display); font-size: 26px; color: var(--pa-green); display: block; line-height: 1; }
    .duel__gap span { font-size: 9px; letter-spacing: .14em; text-transform: uppercase; color: var(--pa-muted); }
    .duel__bar { grid-column: 1/-1; height: 8px; border-radius: 999px; background: #f0efe9; overflow: hidden; display: flex; margin-top: 4px; }
    .duel__bar i { height: 100%; display: block; }

    .mv { font-size: 11px; font-weight: 700; font-variant-numeric: tabular-nums; }
    .mv--up { color: var(--pa-green-d); } .mv--dn { color: #dc2626; } .mv--eq { color: var(--pa-muted); }

    .podium { display: grid; grid-template-columns: 1fr 1.2fr 1fr; gap: 10px; align-items: end; }
    @media (max-width: 560px) { .podium { grid-template-columns: 1fr; align-items: stretch; } }
    .pod { border-radius: 12px; padding: 16px 14px; text-align: center; color: #fff; position: relative; overflow: hidden; display: flex; flex-direction: column; align-items: center; gap: 6px; }
    .pod--1 { background: linear-gradient(160deg, #fde047, #f59e0b); color: #7c2d12; padding-top: 22px; }
    .pod--2 { background: linear-gradient(160deg, #e5e7eb, #9ca3af); color: #1f2937; }
    .pod--3 { background: linear-gradient(160deg, #fbbf77, #b45309); }
    .pod__pos { font-family: var(--font-display); font-size: 20px; line-height: 1; opacity: .8; }
    .pod__amt { font-family: var(--font-display); font-size: 34px; line-height: 1.05; word-break: break-word; }
    .pod--1 .pod__amt { font-size: 42px; }
    .pod__lbl { font-size: 11px; font-weight: 600; letter-spacing: .04em; opacity: .9; }
    .pod__who { display: inline-flex; align-items: center; gap: 6px; font-size: 11px; font-weight: 600; background: rgba(255,255,255,0.35); padding: 3px 9px; border-radius: 999px; margin-top: 2px; max-width: 100%; overflow: hidden; }

    .md__k { font-size: 11px; letter-spacing: .16em; text-transform: uppercase; color: var(--pa-green); font-weight: 700; margin-bottom: 6px; }
    .group-share__code { font-family: var(--font-display); font-size: 28px; letter-spacing: 0.12em; background: rgba(0,0,0,0.04); padding: 12px; border-radius: 8px; text-align: center; }
    .group-share__link { font-size: 12px; background: rgba(0,0,0,0.04); padding: 10px; border-radius: 6px; word-break: break-all; color: var(--pa-muted); }
    .group-share__qr-placeholder { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 6px; background: repeating-linear-gradient(45deg, rgba(0,0,0,0.06), rgba(0,0,0,0.06) 8px, transparent 8px, transparent 16px); padding: 24px; border-radius: 8px; color: var(--pa-muted); }
    .group-share__qr-placeholder span { font-weight: 700; font-size: 20px; }
    .group-share__qr-placeholder small { font-size: 11px; text-align: center; }

    .transfer-row { display: flex; align-items: center; gap: 10px; padding: 10px 12px; border: 1px solid var(--pa-line); border-radius: 10px; cursor: pointer; }
    .transfer-row.is-selected { border-color: var(--pa-green); background: rgba(2,204,116,0.08); }
    .transfer-row input[type="radio"] { margin: 0; accent-color: var(--pa-green); flex-shrink: 0; }

    .entry-fee-reminder { position: fixed; bottom: 24px; right: 24px; display: inline-flex; align-items: center; gap: 12px; padding: 14px 20px; min-height: 56px; border-radius: 12px; background: #fff7e6; border: 1px solid #f59e0b; color: var(--pa-ink); cursor: pointer; z-index: 100; box-shadow: 0 4px 12px rgba(0,0,0,0.12); }
    .entry-fee-reminder__text { display: flex; flex-direction: column; align-items: flex-start; line-height: 1.2; }
    .entry-fee-reminder__text small { color: var(--pa-muted); font-size: 12px; }
    @media (max-width: 767px) { .entry-fee-reminder { bottom: calc(var(--bp-bottom-nav, 64px) + 16px); right: 16px; left: 16px; justify-content: center; } }
    .entry-fee-modal-body { white-space: pre-line; font-size: 15px; line-height: 1.5; }
    .entry-fee-modal-note { margin-top: 16px; font-size: 13px; color: var(--pa-muted); }
  `],
})
export class GroupDetailComponent implements OnInit, OnChanges {
  @Input() id!: string;

  private api = inject(ApiService);
  private auth = inject(AuthService);
  private toast = inject(ToastService);
  private router = inject(Router);
  private confirmDialog = inject(ConfirmDialogService);

  tab = signal<GroupTab>('lb');
  inviteMenu = signal(false);
  configMenu = signal(false);
  sharing = signal(false);
  transferring = signal<null | 'open' | 'submitting'>(null);
  newAdminId = signal<string | null>(null);
  entryFeeModalOpen = signal(false);

  group = signal<GroupHeader | null>(null);
  groupImageUrl = signal<string | null>(null);
  rows = signal<RankRow[]>([]);
  phases = signal<Array<{ id: string; order: number; name: string }>>([]);
  matches = signal<Array<{ phaseId: string; status: string; kickoffAt: string }>>([]);
  loading = signal(true);
  copied = signal(false);
  removingUserId = signal<string | null>(null);
  currentUserId = '';

  isAdminOfGroup = computed(() => this.group()?.adminUserId === this.currentUserId);

  hasPrizes = computed(() => {
    const g = this.group();
    return !!(g?.prize1st || g?.prize2nd || g?.prize3rd);
  });

  /** "$N" si todos los premios son montos numéricos; si no, el 1° definido. */
  prizesTotalLabel = computed(() => {
    const g = this.group();
    if (!g) return '—';
    const raws = [g.prize1st, g.prize2nd, g.prize3rd].filter((v): v is string => !!v);
    if (raws.length === 0) return '—';
    const nums = raws.map((s) => {
      const m = s.match(/\$\s*(\d[\d.,]*)/);
      return m ? parseFloat(m[1].replace(/,/g, '')) : null;
    });
    if (nums.every((n) => n !== null)) return `$${Math.round((nums as number[]).reduce((a, n) => a + n, 0))}`;
    return raws[0]!;
  });

  myPos = computed(() => {
    const i = this.rows().findIndex((r) => r.userId === this.currentUserId);
    return i >= 0 ? i + 1 : null;
  });
  myPoints = computed(() => this.rows().find((r) => r.userId === this.currentUserId)?.points ?? 0);

  myPointsSub = computed(() => {
    const list = this.rows();
    const pos = this.myPos();
    if (!pos || list.length < 2) return 'puntos del grupo';
    if (pos === 1) return `+${this.myPoints() - (list[1]?.points ?? 0)} vs 2°`;
    return `${(list[pos - 2]?.points ?? 0) - this.myPoints()} para subir`;
  });

  /** Conteo de cuota pagada (admin auto-pagado). REAL. */
  paidCount = computed(() => {
    const g = this.group();
    return this.rows().filter((r) => r.entryFeePaidAt !== null || r.userId === g?.adminUserId).length;
  });

  boteSub = computed(() => {
    const g = this.group();
    if (!g) return '';
    if (!this.hasPrizes()) return g.mode === 'COMPLETE' ? 'modo completo' : 'modo simple';
    if (g.entryFeeEnabled) return `${this.paidCount()} de ${this.rows().length} pagaron`;
    return 'En juego';
  });

  /** Duelo con el rival más cercano (REAL): si lidero, vs 2°; si no, vs el de arriba. */
  duel = computed<Duel | null>(() => {
    const list = this.rows();
    if (list.length < 2) return null;
    const i = list.findIndex((r) => r.userId === this.currentUserId);
    const meIdx = i >= 0 ? i : 0;
    const leading = meIdx === 0;
    const rival = leading ? list[1]! : list[meIdx - 1]!;
    const me = list[meIdx]!;
    return { me, rival, gap: Math.abs(me.points - rival.points), leading };
  });

  /** Jornada actual = primera phase (order 1–8) con algún match no-FINAL.
   *  Si todas están jugadas, la última. Null si no hay matches. */
  currentJornada = computed<{ order: number; label: string; totalJornadas: number; startsInDays: number | null } | null>(() => {
    const phases = [...this.phases()].sort((a, b) => a.order - b.order);
    const matches = this.matches();
    if (phases.length === 0 || matches.length === 0) return null;
    const pending = phases.find((p) =>
      matches.some((m) => m.phaseId === p.id && m.status !== 'FINAL'));
    const current = pending ?? phases[phases.length - 1]!;
    const now = Date.now();
    const next = matches
      .filter((m) => m.phaseId === current.id)
      .map((m) => Date.parse(m.kickoffAt))
      .filter((t) => Number.isFinite(t) && t > now)
      .sort((a, b) => a - b)[0];
    const startsInDays = next != null ? Math.max(0, Math.ceil((next - now) / 86_400_000)) : null;
    return { order: current.order, label: `J${current.order}`, totalJornadas: phases.length, startsInDays };
  });

  inviteUrl = computed(() => {
    const g = this.group();
    return g ? `${location.origin}/groups/join/${g.joinCode}` : '';
  });

  nonAdminMembers = computed(() => {
    const g = this.group();
    if (!g) return [];
    return this.rows().filter((r) => r.userId !== g.adminUserId);
  });

  showEntryFeeReminder = computed<boolean>(() => {
    const g = this.group();
    if (!g || g.entryFeeEnabled !== true) return false;
    const mine = this.rows().find((r) => r.userId === this.currentUserId);
    if (!mine) return false;
    return mine.entryFeePaidAt === null;
  });

  // ---- helpers de presentación ----

  /** Iniciales (2) de un handle, para el avatar. */
  ini(handle: string): string {
    const c = (handle ?? '').replace(/[^a-zA-Z0-9]/g, '');
    return (c.slice(0, 2) || '··').toUpperCase();
  }
  /** Iniciales del nombre del grupo (hero). */
  initials(name: string): string {
    const clean = (name ?? '').trim();
    if (!clean) return '··';
    const parts = clean.split(/\s+/);
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    return clean.slice(0, 2).toUpperCase();
  }
  private static readonly joinFmt = new Intl.DateTimeFormat('es-EC', { day: 'numeric', month: 'short' });
  joinedLabel(iso: string): string {
    try { return GroupDetailComponent.joinFmt.format(new Date(iso)); } catch { return iso; }
  }
  /** Premio "corto" (≤6 chars, ej. "$40") usa el tamaño grande del podio. */
  isShort(v: string | null): boolean { return !!v && v.trim().length <= 6; }

  // ---- FALTA: placeholders hasta tener scoring por jornada en backend ----
  /** FALTA: puntos de la jornada. Placeholder determinista desde los totales. */
  jornadaPts(r: RankRow): string { return '+' + Math.max(0, Math.round(r.points / 8)); }
  /** Partidos con resultado publicado (denominador del acierto). */
  finalMatchesCount = computed(() => this.matches().filter((m) => m.status === 'FINAL').length);

  /** % de acierto del miembro = (exactos + resultados) / partidos jugados. */
  acierto(r: RankRow): string {
    const played = this.finalMatchesCount();
    if (played === 0) return '—';
    return Math.round(((r.exactCount + r.resultCount) / played) * 100) + '%';
  }
  /** FALTA: movimiento vs jornada anterior. Placeholder determinista. */
  movement(r: RankRow): { l: string; c: string } {
    const i = this.rows().findIndex((x) => x.userId === r.userId);
    if (i === 0) return { l: '▲2', c: 'mv--up' };
    const h = [...r.userId].reduce((a, c) => a + c.charCodeAt(0), 0) % 3;
    if (h === 0) return { l: '▲1', c: 'mv--up' };
    if (h === 1) return { l: '▼1', c: 'mv--dn' };
    return { l: '=', c: 'mv--eq' };
  }

  ngOnChanges(changes: SimpleChanges) {
    if (changes['id'] && !changes['id'].firstChange) void this.load();
  }

  shareGroup(): void { this.sharing.set(true); }
  openEntryFeeModal(): void { this.entryFeeModalOpen.set(true); }
  closeEntryFeeModal(): void { this.entryFeeModalOpen.set(false); }

  async ngOnInit() {
    this.currentUserId = this.auth.user()?.sub ?? '';
    await this.load();
  }

  private async load() {
    this.loading.set(true);
    this.group.set(null);
    this.groupImageUrl.set(null);
    this.rows.set([]);
    this.phases.set([]);
    this.matches.set([]);
    try {
      const [grp, totals, members, phasesRes, matchesRes] = await Promise.all([
        this.api.getGroup(this.id),
        this.api.groupLeaderboard(this.id),
        this.api.groupMembers(this.id),
        this.api.listPhases('mundial-2026'),
        this.api.listMatches('mundial-2026'),
      ]);
      if (grp.data) {
        const imageKey = (grp.data as { imageKey?: string | null }).imageKey ?? null;
        this.group.set({
          id: grp.data.id,
          name: grp.data.name,
          joinCode: grp.data.joinCode,
          adminUserId: grp.data.adminUserId,
          createdAt: grp.data.createdAt,
          mode: (grp.data.mode ?? 'COMPLETE') as 'SIMPLE' | 'COMPLETE',
          imageKey,
          description: (grp.data as { description?: string | null }).description ?? null,
          comodinesEnabled: (grp.data as { comodinesEnabled?: boolean | null }).comodinesEnabled ?? null,
          prize1st: grp.data.prize1st ?? null,
          prize2nd: grp.data.prize2nd ?? null,
          prize3rd: grp.data.prize3rd ?? null,
          entryFeeEnabled: (grp.data as { entryFeeEnabled?: boolean | null }).entryFeeEnabled ?? null,
          entryFeeInstructions: (grp.data as { entryFeeInstructions?: string | null }).entryFeeInstructions ?? null,
        });
        if (imageKey) {
          (async () => {
            try { this.groupImageUrl.set((await getUrl({ path: imageKey, options: { expiresIn: 3600 } })).url.toString()); }
            catch { /* sin imagen → fallback iniciales */ }
          })();
        }
      }

      const userMetaByUser = new Map<string, { handle: string; avatarKey: string | null }>();
      await Promise.all(
        (members.data ?? []).map(async (m) => {
          const u = await this.api.getUser(m.userId);
          const data = u.data as { handle?: string; avatarKey?: string | null } | undefined;
          userMetaByUser.set(m.userId, { handle: data?.handle ?? m.userId.slice(0, 6), avatarKey: data?.avatarKey ?? null });
        }),
      );

      const entryFeePaidByUser = new Map<string, string | null>();
      const memberSinceByUser = new Map<string, string | null>();
      for (const m of (members.data ?? [])) {
        entryFeePaidByUser.set(m.userId, (m as { entryFeePaidAt?: string | null }).entryFeePaidAt ?? null);
        memberSinceByUser.set(m.userId, (m as { createdAt?: string | null }).createdAt ?? null);
      }

      const sorted = (totals.data ?? []).sort((a, b) => (b.points ?? 0) - (a.points ?? 0));
      this.rows.set(
        sorted.map((t) => ({
          userId: t.userId,
          handle: userMetaByUser.get(t.userId)?.handle ?? t.userId.slice(0, 6),
          avatarKey: userMetaByUser.get(t.userId)?.avatarKey ?? null,
          points: t.points ?? 0,
          exactCount: t.exactCount ?? 0,
          resultCount: t.resultCount ?? 0,
          entryFeePaidAt: entryFeePaidByUser.get(t.userId) ?? null,
          memberSince: memberSinceByUser.get(t.userId) ?? null,
        })),
      );

      this.phases.set(((phasesRes.data ?? []) as Array<{ id: string; order: number; name: string }>)
        .filter((p) => p && p.order >= 1 && p.order <= 8));
      this.matches.set(((matchesRes.data ?? []) as Array<{ phaseId: string; status: string; kickoffAt: string }>)
        .filter((m) => !!m?.phaseId));
    } finally {
      this.loading.set(false);
    }
  }

  @HostListener('window:focus')
  onWindowFocus(): void { void this.refreshMemberships(); }

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
    } catch { /* focus no es user-initiated; sin toast */ }
  }

  async copyLink() {
    try {
      await navigator.clipboard.writeText(this.inviteUrl());
      this.copied.set(true);
      setTimeout(() => this.copied.set(false), 2000);
    } catch { this.toast.error('No se pudo copiar el link'); }
  }

  async del() {
    const ok = await this.confirmDialog.ask({
      title: 'Eliminar grupo',
      message: 'Esta acción borra el grupo para todos los miembros y no se puede deshacer.',
      confirmLabel: 'Eliminar grupo', cancelLabel: 'Cancelar', danger: true,
    });
    if (!ok) return;
    try {
      await this.api.deleteGroup(this.id);
      this.toast.success('Grupo eliminado');
      void this.router.navigate(['/groups']);
    } catch (e) { this.toast.error(humanizeError(e)); }
  }

  async confirmRemoveMember(userId: string, handle: string): Promise<void> {
    const confirmed = await this.confirmDialog.ask({
      title: 'Eliminar miembro',
      message: `Quitar a @${handle} del grupo borra su score acumulado en este grupo. Sus picks del torneo no se ven afectados.`,
      confirmLabel: 'Eliminar miembro', cancelLabel: 'Cancelar', danger: true,
    });
    if (!confirmed) return;
    const groupId = this.group()?.id;
    if (!groupId) return;
    this.removingUserId.set(userId);
    try {
      const res = await this.api.removeMember({ groupId, userId });
      if (!res.data?.ok) {
        this.toast.error(res.data?.message ?? 'No se pudo eliminar al miembro');
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

  async toggleEntryFeePaid(userId: string, currentlyPaid: boolean): Promise<void> {
    if (userId === this.currentUserId) return;
    if (!this.isAdminOfGroup()) return;
    const newPaidAt = currentlyPaid ? null : new Date().toISOString();
    const prev = this.rows();
    this.rows.set(prev.map((m) => (m.userId === userId ? { ...m, entryFeePaidAt: newPaidAt } : m)));
    try {
      await this.api.markEntryFeePaid({ groupId: this.id, userId, paid: !currentlyPaid });
    } catch (e) {
      this.rows.set(prev);
      this.toast.error(humanizeError(e));
    }
  }

  async leave(): Promise<void> {
    const g = this.group();
    if (!g) return;
    const ok = await this.confirmDialog.ask({
      title: 'Salir del grupo',
      message: `Vas a salir de "${g.name}". Tu score acumulado en este grupo se borra. Tus picks del torneo no se ven afectados. Esta acción no se puede deshacer.`,
      confirmLabel: 'Salir del grupo', cancelLabel: 'Cancelar', danger: true,
    });
    if (!ok) return;
    try {
      await this.api.leaveGroup(g.id);
      this.toast.success('Saliste del grupo');
      void this.router.navigate(['/groups']);
    } catch (e) { this.toast.error(humanizeError(e)); }
  }

  openTransferAdmin(): void { this.newAdminId.set(null); this.transferring.set('open'); }
  closeTransferAdmin(): void {
    if (this.transferring() === 'submitting') return;
    this.transferring.set(null);
    this.newAdminId.set(null);
  }

  /** Atajo desde la tab Miembros: transferir admin a un miembro concreto. */
  async transferTo(userId: string, handle: string): Promise<void> {
    const g = this.group();
    if (!g) return;
    const ok = await this.confirmDialog.ask({
      title: 'Transferir admin',
      message: `Vas a transferir el rol de admin de "${g.name}" a @${handle}. Vas a perder los privilegios de admin. Esta acción no se puede deshacer.`,
      confirmLabel: 'Transferir admin', cancelLabel: 'Cancelar', danger: true,
    });
    if (!ok) return;
    this.transferring.set('submitting');
    try {
      await this.api.transferGroupAdmin({ groupId: g.id, newAdminUserId: userId });
      this.toast.success(`@${handle} es el nuevo admin de "${g.name}"`);
      this.transferring.set(null);
      await this.load();
    } catch (e) {
      this.toast.error(humanizeError(e));
      this.transferring.set(null);
    }
  }

  async submitTransferAdmin(): Promise<void> {
    const newAdminId = this.newAdminId();
    const g = this.group();
    if (!newAdminId || !g) return;
    const target = this.rows().find((r) => r.userId === newAdminId);
    if (!target) return;
    const ok = await this.confirmDialog.ask({
      title: 'Transferir admin',
      message: `Vas a transferir el rol de admin de "${g.name}" a @${target.handle}. Vas a perder los privilegios de admin. Esta acción no se puede deshacer.`,
      confirmLabel: 'Transferir admin', cancelLabel: 'Cancelar', danger: true,
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
