import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ApiService } from '../../core/api/api.service';
import { AuthService } from '../../core/auth/auth.service';
import { UserModesService } from '../../core/user/user-modes.service';
import { GroupActionsService } from '../../core/groups/group-actions.service';
import { PicksPendingBannerComponent } from '../picks/picks-pending-banner.component';
import { EmptyBlockComponent } from '../../shared/ui/empty-block/empty-block.component';
import { SkeletonComponent } from '../../shared/ui/skeleton/skeleton.component';
import { IconComponent } from '../../shared/ui/icon/icon.component';

const TOURNAMENT_ID = 'mundial-2026';
const TOURNAMENT_START_ISO = '2026-06-12T19:00:00-04:00';   // primer kickoff Mundial 2026
const TOURNAMENT_END_ISO = '2026-07-19T20:00:00-04:00';     // final Mundial 2026

interface GroupRow {
  id: string;
  name: string;
  mode: 'SIMPLE' | 'COMPLETE';
  members: number;
  position: number | null;
  prizeLine: string;
  avatarBg: string;
  initials: string;
}

interface SpecialPickVm {
  type: 'CHAMPION' | 'RUNNER_UP' | 'DARK_HORSE';
  label: string;
  teamName: string | null;
  flag: string | null;
}

interface ComodinSlotVm {
  idx: number;
  kind: 'avail' | 'used' | 'empty';
  icon: string;
  label: string;
}

type TournamentPhase = 'pre' | 'live' | 'post';

interface ContextualCta {
  label: string;
  routerLink: string | (string | number)[];
  queryParams?: Record<string, string>;
}

/**
 * Pantalla principal design-v3. Diseño content-priority:
 *   1. Hero gradient compacto (avatar + greeting + stats canónicos + CTA contextual).
 *   2. Picks pendientes dark block (sólo cuando hay picks por enviar en 48h).
 *   3. Mis grupos (list con rank pill + CTAs create/join, empty-block si 0).
 *   4. Row de Especiales (3 chips con progress) + Ranking gradient card.
 *   5. Comodines slots (sólo para users con grupo modo COMPLETE y count > 0).
 *
 * **A8b consolidation**: Stats antes triplicaban (hero + KPI strip + ranking card).
 * Ahora hero es la única fuente. KPI strip eliminado. Ranking card mantiene rank
 * único + percentil visual (sin duplicar puntos/aciertos del hero).
 *
 * **CTA contextual**: el hero CTA es uno solo y varía según phase:
 * - Pre-torneo: "Predecí clasificados →" → /picks/group-stage?view=pred
 * - Durante: "Hacé pick del próximo partido →" → /picks/match/:id (o /picks fallback)
 * - Post-final: "Ver mi ranking final →" → /ranking
 *
 * Source visual: polla-app/design-input/prueba-gg/project/polla-v3.html
 */
@Component({
  selector: 'app-home',
  standalone: true,
  imports: [
    RouterLink,
    PicksPendingBannerComponent,
    EmptyBlockComponent,
    SkeletonComponent,
    IconComponent,
  ],
  template: `
    <section class="home-page">

      <app-picks-pending-banner />

      <!-- HERO compacto (única fuente de stats canónicos) -->
      <section class="hero">
        <div class="hero__in">
          <div class="hero__av">{{ avatarInitials() }}</div>
          <div>
            <div class="hero__k">Hola, <span translate="no">{{ '@' + (handle() ?? 'jugador') }}</span></div>
            <div class="hero__t">
              @if (tournamentPhase() === 'pre') {
                Quedan <strong>{{ daysToTournament() }} días</strong>
              } @else if (tournamentPhase() === 'live') {
                @if (totals().globalRank) {
                  Estás en <strong>#{{ totals().globalRank }}</strong>
                } @else {
                  Vamos por el primer pick
                }
              } @else {
                @if (totals().globalRank) {
                  Final: <strong>#{{ totals().globalRank }}</strong>
                } @else {
                  El Mundial terminó
                }
              }
            </div>
            <div class="hero__s">
              {{ totals().points }} pts · {{ myGroupsCount() }} grupos activos
              @if (accuracyPct() !== null) { · {{ accuracyPct() }}% de aciertos }
            </div>
            @if (pendingPicksCount() > 0 && nextDeadlineLabel()) {
              <div class="hero__alert" role="status">
                <app-icon name="alert" size="sm" />
                Cierra el primer pick en {{ nextDeadlineLabel() }}
              </div>
            }
          </div>
          <a [routerLink]="contextualCta().routerLink" [queryParams]="contextualCta().queryParams ?? null" class="hero__cta">
            {{ contextualCta().label }} <span aria-hidden="true">→</span>
          </a>
        </div>
      </section>

      <!-- Picks pendientes dark -->
      @if (pendingPicksCount() > 0) {
        <div class="pp">
          <div class="pp__n">{{ pendingPicksCount() }}</div>
          <div class="pp__t">
            <strong>{{ pendingPicksCount() === 1 ? 'Pick pendiente' : 'Picks pendientes' }} para hoy</strong>
            <small>Si los envías sumas hasta <em>{{ pendingPicksCount() * 10 }} pts</em>.
              @if (nextDeadlineLabel()) { El primero cierra en <em>{{ nextDeadlineLabel() }}</em>. }
            </small>
          </div>
          <a routerLink="/picks" class="pp__b">Hacer picks <span aria-hidden="true">→</span></a>
        </div>
      }

      <!-- Mis grupos -->
      <div>
        <div class="sh">
          <h2>Mis grupos · {{ myGroupsList().length }} {{ myGroupsList().length === 1 ? 'activo' : 'activos' }}</h2>
          <a routerLink="/groups">Ver todos <span aria-hidden="true">→</span></a>
        </div>
        @if (groupsLoading()) {
          <app-skeleton variant="list" [count]="3" />
        } @else if (myGroupsList().length === 0) {
          <app-empty-block iconName="users"
                           title="Aún no estás en ningún grupo"
                           sub="Crea tu propio grupo o únete con un código de invitación.">
            <button type="button" class="empty-cta empty-cta--primary" (click)="onCreateGroup()">
              <app-icon name="plus" size="sm" />Crear grupo
            </button>
            <button type="button" class="empty-cta" (click)="onJoinGroup()">
              <app-icon name="arrow-right" size="sm" />Unirme con código
            </button>
          </app-empty-block>
        } @else {
          <div class="gr-list">
            @for (g of myGroupsList(); track g.id) {
              <a [routerLink]="['/groups', g.id]" class="gr">
                <div class="gr__av" [style.background]="g.avatarBg">{{ g.initials }}</div>
                <div class="gr__b">
                  <div class="gr__n">{{ g.name }}</div>
                  <div class="gr__m">{{ g.members }} jugadores · {{ g.prizeLine }}</div>
                </div>
                <span class="gr__r"
                      [class.gr__r--g]="g.position === 1"
                      [class.gr__r--b]="!!g.position && g.position <= 3 && g.position !== 1"
                      [class.gr__r--n]="!g.position || g.position > 3">
                  {{ g.position ? '#' + g.position : '—' }}
                </span>
              </a>
            }
          </div>
          <div class="gr-act">
            <button type="button" (click)="onCreateGroup()"><span aria-hidden="true">＋ </span>Crear grupo</button>
            <button type="button" (click)="onJoinGroup()"><span aria-hidden="true">→ </span>Unirme con código</button>
          </div>
        }
      </div>

      <!-- Row: especiales + ranking -->
      <div class="row2">
        <div class="spk">
          <div class="spk__h">
            <span><app-icon name="trophy" size="sm" /> Picks especiales · hasta 65 pts</span>
            <span class="spk__progress">{{ especialesProgress() }}/3</span>
          </div>
          <div class="spk__row">
            @for (s of specialPicks(); track s.type) {
              <a routerLink="/profile/special-picks" class="spk__c"
                 [class.spk__c--g]="s.type === 'CHAMPION'"
                 [class.spk__c--s]="s.type === 'RUNNER_UP'"
                 [class.spk__c--e]="s.type === 'DARK_HORSE'">
                <div class="spk__big" aria-hidden="true">
                  @if (s.flag) {
                    <span class="fi fi-{{ s.flag.toLowerCase() }}"></span>
                  } @else {
                    ＋
                  }
                </div>
                <div class="spk__nm">{{ s.teamName ?? 'Elegir' }}</div>
              </a>
            }
          </div>
        </div>

        <div class="rk">
          <div class="rk__r">
            <div>
              <div class="rk__big">{{ totals().globalRank ? '#' + totals().globalRank : '—' }}</div>
              <div class="rk__l">Global</div>
            </div>
            @if (bestPosition() !== null) {
              <div class="rk__r2">
                <div class="rk__big">#{{ bestPosition() }}</div>
                <div class="rk__l">
                  <span class="rk__best-group">{{ bestPositionGroupName() }}</span>
                </div>
              </div>
            }
          </div>
          <div class="rk__bar">
            <div class="rk__bar__f" [style.width.%]="rankPercentile()"></div>
          </div>
          <div class="rk__s">
            <span>Percentil {{ rankPercentile() }}</span>
            <a routerLink="/ranking" class="rk__link">Ver ranking <span aria-hidden="true">→</span></a>
          </div>
        </div>
      </div>

      <!-- Comodines (solo COMPLETE y si tiene comodines o cap > 0) -->
      @if (totals().hasComplete && comodinesCap() > 0) {
        <div class="com">
          <div class="com__h">
            <span><app-icon name="zap" size="sm" /> Comodines · {{ comodinesActive() }} de {{ comodinesCap() }} disponibles</span>
            <a routerLink="/mis-comodines">Detalles <span aria-hidden="true">→</span></a>
          </div>
          <div class="com__row">
            @for (slot of comodinSlots(); track slot.idx) {
              <div class="com__c"
                   [class.com__c--d]="slot.kind === 'avail'"
                   [class.com__c--s]="slot.kind === 'used'"
                   [class.com__c--e]="slot.kind === 'empty'">
                <div class="com__c__i">{{ slot.icon }}</div>{{ slot.label }}
              </div>
            }
          </div>
        </div>
      }

    </section>
  `,
  styles: [`
    :host { display: block; }

    .home-page { display: flex; flex-direction: column; gap: 16px; }

    .text-mute { color: var(--color-text-muted); font-size: 13px; }

    /* Hero compacto · override min-height del .hero editorial global */
    .hero {
      background: linear-gradient(135deg, #0a0a0a 0%, #0a3d20 60%, #067a4a 100%);
      color: #fff;
      border-radius: 16px;
      padding: 22px 26px;
      position: relative;
      overflow: hidden;
      min-height: 0;
      display: block;
      align-items: initial;
    }
    .hero::before {
      content: ""; position: absolute; inset: 0; z-index: 0;
      background: radial-gradient(60% 80% at 80% 30%, rgba(2,204,116,0.22), transparent 60%);
    }
    .hero__in {
      position: relative; z-index: 1;
      display: grid;
      grid-template-columns: auto 1fr auto;
      gap: 20px;
      align-items: center;
    }
    .hero__av {
      width: 54px; height: 54px;
      border-radius: 50%;
      background: linear-gradient(135deg, #02cc74, #016b3d);
      display: grid; place-items: center;
      font-family: var(--font-display);
      font-size: 20px;
      color: #fff;
    }
    .hero__k { font-size: 10px; letter-spacing: 0.18em; text-transform: uppercase; color: rgba(255,255,255,0.55); margin-bottom: 4px; }
    .hero__t { font-family: var(--font-display); font-size: 24px; line-height: 1.05; }
    .hero__t strong { color: var(--color-primary-green); font-style: normal; }
    .hero__s { font-size: 12px; color: rgba(255,255,255,0.7); margin-top: 4px; }
    .hero__alert {
      background: rgba(220,38,38,0.18);
      border: 1px solid rgba(220,38,38,0.45);
      color: #fca5a5;
      padding: 5px 10px;
      border-radius: 6px;
      font-size: 10px;
      display: inline-flex;
      align-items: center;
      gap: 6px;
      margin-top: 6px;
    }
    .hero__cta {
      background: var(--color-primary-green);
      color: #fff;
      padding: 11px 18px;
      border-radius: 8px;
      font-weight: 600;
      text-decoration: none;
      font-size: 12px;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      white-space: nowrap;
    }
    @media (max-width: 640px) {
      .hero__in { grid-template-columns: auto 1fr; gap: 12px; }
      .hero__av { width: 42px; height: 42px; font-size: 16px; align-self: start; }
      .hero__t { font-size: 20px; }
      .hero__cta { grid-column: 1 / -1; text-align: center; padding: 10px; font-size: 11px; }
    }

    /* Picks pendientes dark */
    .pp {
      background: #0a0a0a;
      color: #fff;
      border-radius: 14px;
      padding: 22px;
      display: grid;
      grid-template-columns: auto 1fr auto;
      gap: 18px;
      align-items: center;
      position: relative;
      overflow: hidden;
    }
    .pp::before {
      content: ""; position: absolute; top: -50%; right: -20%;
      width: 280px; height: 280px;
      background: radial-gradient(circle, rgba(2,204,116,0.18), transparent 70%);
    }
    .pp__n { font-family: var(--font-display); font-size: 56px; color: var(--color-primary-green); line-height: 1; position: relative; }
    .pp__t { position: relative; }
    .pp__t strong { font-family: var(--font-display); font-size: 18px; display: block; }
    .pp__t small { font-size: 11px; color: rgba(255,255,255,0.6); }
    .pp__t small em { color: #fca5a5; font-style: normal; }
    .pp__b {
      background: var(--color-primary-green);
      color: #fff;
      padding: 11px 18px;
      border-radius: 8px;
      font-weight: 600;
      text-decoration: none;
      font-size: 12px;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      white-space: nowrap;
      position: relative;
    }
    @media (max-width: 600px) {
      .pp { grid-template-columns: auto 1fr; padding: 16px; }
      .pp__n { font-size: 42px; }
      .pp__t strong { font-size: 14px; }
      .pp__b { grid-column: 1 / -1; text-align: center; padding: 9px; font-size: 10px; }
    }

    /* Section header */
    .sh { display: flex; justify-content: space-between; align-items: baseline; margin-top: 8px; flex-wrap: wrap; gap: 10px; }
    .sh h2 { font-family: var(--font-display); font-size: 20px; margin: 0; }
    .sh a { font-size: 11px; letter-spacing: 0.08em; text-transform: uppercase; color: var(--color-primary-green); font-weight: 600; text-decoration: none; }

    /* Grupos */
    .gr-list { display: flex; flex-direction: column; gap: 8px; margin-top: 10px; }
    .gr { background: #fff; border: 1px solid var(--color-line); border-radius: 10px; padding: 12px; display: flex; align-items: center; gap: 12px; text-decoration: none; color: inherit; transition: border-color 0.15s ease, background 0.15s ease, transform 0.15s ease; }
    .gr:hover { border-color: rgba(2,204,116,0.4); background: rgba(2,204,116,0.02); }
    .gr:focus-visible { outline: 2px solid var(--color-primary-green); outline-offset: 2px; border-color: rgba(2,204,116,0.4); }
    .gr__av { width: 38px; height: 38px; border-radius: 9px; display: grid; place-items: center; color: #fff; font-family: var(--font-display); font-size: 15px; flex-shrink: 0; }
    .gr__b { flex: 1; min-width: 0; }
    .gr__n { font-family: var(--font-display); font-size: 16px; line-height: 1; }
    .gr__m { font-size: 11px; color: var(--color-text-muted); margin-top: 3px; }
    .gr__r { padding: 3px 9px; border-radius: 6px; font-family: var(--font-display); font-size: 14px; }
    .gr__r--g { background: rgba(245,158,11,0.18); color: #b45309; }
    .gr__r--b { background: rgba(180,83,9,0.18); color: #92400e; }
    .gr__r--n { background: rgba(0,0,0,0.06); color: var(--color-text-muted); }
    .gr-act { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 8px; }
    .gr-act button { background: transparent; border: 1px dashed rgba(2,204,116,0.4); border-radius: 9px; padding: 9px; color: var(--color-primary-green); font-family: inherit; font-weight: 600; font-size: 11px; letter-spacing: 0.08em; text-transform: uppercase; cursor: pointer; }
    .gr-act button:hover { background: rgba(2,204,116,0.05); border-style: solid; }
    .gr-act button:focus-visible { outline: 2px solid var(--color-primary-green); outline-offset: 2px; border-style: solid; }
    @media (max-width: 480px) { .gr-act { grid-template-columns: 1fr; } }

    /* Empty CTAs en empty-block (no toman .gr-act styles) */
    .empty-cta {
      background: transparent;
      border: 1px solid var(--color-primary-green);
      border-radius: 9px;
      padding: 9px 14px;
      color: var(--color-primary-green);
      font-family: inherit;
      font-weight: 600;
      font-size: 11px;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 6px;
    }
    .empty-cta:hover { background: rgba(2,204,116,0.05); }
    .empty-cta:focus-visible { outline: 2px solid var(--color-primary-green); outline-offset: 2px; }
    .empty-cta--primary { background: var(--color-primary-green); color: #fff; border-color: var(--color-primary-green); }
    .empty-cta--primary:hover { background: var(--color-primary-green); filter: brightness(0.95); }

    /* Row 2-col */
    .row2 { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
    @media (max-width: 780px) { .row2 { grid-template-columns: 1fr; } }

    /* Especiales */
    .spk { background: #fff; border: 1px solid var(--color-line); border-radius: 12px; padding: 12px 14px; }
    .spk__h { font-size: 10px; letter-spacing: 0.14em; text-transform: uppercase; color: var(--color-text-muted); margin-bottom: 8px; display: flex; justify-content: space-between; align-items: center; gap: 8px; }
    .spk__h > span:first-child { display: inline-flex; align-items: center; gap: 6px; }
    .spk__progress {
      background: rgba(2,204,116,0.1);
      color: var(--color-primary-green);
      padding: 2px 8px;
      border-radius: 12px;
      font-family: var(--font-display);
      font-size: 11px;
      letter-spacing: 0.04em;
    }
    .spk__row { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; }
    .spk__c { text-align: center; padding: 6px 4px; border-radius: 7px; text-decoration: none; color: inherit; transition: transform 0.2s ease, box-shadow 0.2s ease; display: flex; align-items: center; gap: 6px; justify-content: center; }
    .spk__c:hover { transform: translateY(-1px); }
    .spk__c:focus-visible { outline: 2px solid var(--color-primary-green); outline-offset: 3px; }
    .spk__c--g { background: linear-gradient(135deg, #fde047, #f59e0b); color: #7c2d12; }
    .spk__c--s { background: linear-gradient(135deg, #e5e7eb, #9ca3af); color: #1f2937; }
    .spk__c--e { background: #f3f4f6; border: 1px dashed var(--color-primary-green); color: var(--color-primary-green); }
    .spk__big { font-size: 16px; line-height: 1; }
    .spk__nm { font-family: var(--font-display); font-size: 11px; line-height: 1; }

    /* Ranking */
    .rk { background: linear-gradient(135deg, #02cc74, #016b3d); color: #fff; border-radius: 14px; padding: 18px; }
    .rk__r { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 10px; gap: 12px; }
    .rk__big { font-family: var(--font-display); font-size: 32px; line-height: 1; }
    .rk__l { font-size: 9px; letter-spacing: 0.14em; text-transform: uppercase; opacity: 0.85; margin-top: 3px; }
    .rk__r2 { text-align: right; min-width: 0; flex: 0 1 auto; max-width: 50%; }
    .rk__r2 .rk__big { font-size: 24px; }
    .rk__best-group {
      display: inline-block;
      max-width: 100%;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      vertical-align: bottom;
    }
    .rk__bar { height: 4px; background: rgba(255,255,255,0.25); border-radius: 999px; overflow: hidden; }
    .rk__bar__f { height: 100%; background: #fff; transition: width 0.3s; }
    .rk__s { font-size: 10px; opacity: 0.85; margin-top: 4px; display: flex; justify-content: space-between; align-items: center; }
    .rk__link { color: #fff; text-decoration: none; font-weight: 600; opacity: 0.95; }
    .rk__link:hover { opacity: 1; text-decoration: underline; }

    /* Comodines */
    .com { background: #fff; border: 1px solid var(--color-line); border-radius: 12px; padding: 12px 14px; }
    .com__h { font-size: 10px; letter-spacing: 0.14em; text-transform: uppercase; color: var(--color-text-muted); margin-bottom: 8px; display: flex; justify-content: space-between; align-items: center; }
    .com__h > span:first-child { display: inline-flex; align-items: center; gap: 6px; }
    .com__h a { color: var(--color-primary-green); text-decoration: none; font-weight: 600; }
    .com__row { display: flex; gap: 6px; }
    .com__c { flex: 1; height: 48px; border-radius: 8px; display: flex; align-items: center; justify-content: center; gap: 6px; color: #fff; text-align: center; font-size: 10px; letter-spacing: 0.04em; text-transform: uppercase; transition: transform 0.2s; }
    .com__c--d { background: linear-gradient(135deg, #02cc74, #016b3d); }
    .com__c--s { background: linear-gradient(135deg, #f59e0b, #b45309); }
    .com__c--e { background: rgba(0,0,0,0.04); color: rgba(0,0,0,0.35); border: 1px dashed rgba(0,0,0,0.2); }
    .com__c__i { font-size: 16px; line-height: 1; }
  `],
})
export class HomeComponent implements OnInit {
  private auth = inject(AuthService);
  private api = inject(ApiService);
  private userModes = inject(UserModesService);
  private groupActions = inject(GroupActionsService);

  handle = computed(() => this.auth.user()?.handle ?? null);
  avatarInitials = computed(() => (this.handle() ?? 'JG').slice(0, 2).toUpperCase());

  daysToTournament = computed(() => {
    const diff = new Date(TOURNAMENT_START_ISO).getTime() - Date.now();
    return Math.max(0, Math.ceil(diff / 86_400_000));
  });

  /** Phase del torneo derivado de fechas — drives CTA contextual + hero copy. */
  tournamentPhase = computed<TournamentPhase>(() => {
    const now = Date.now();
    const startMs = new Date(TOURNAMENT_START_ISO).getTime();
    const endMs = new Date(TOURNAMENT_END_ISO).getTime();
    if (now < startMs) return 'pre';
    if (now > endMs) return 'post';
    return 'live';
  });

  /** ID del próximo partido sin pick (para CTA durante torneo). */
  private nextMatchId = signal<string | null>(null);

  /** CTA contextual única según phase del torneo. */
  contextualCta = computed<ContextualCta>(() => {
    const phase = this.tournamentPhase();
    if (phase === 'pre') {
      return { label: 'Predecí clasificados', routerLink: '/picks/group-stage', queryParams: { view: 'pred' } };
    }
    if (phase === 'post') {
      return { label: 'Ver mi ranking final', routerLink: '/ranking' };
    }
    // live: si tenemos next match, link específico; sino /picks como fallback
    const next = this.nextMatchId();
    if (next) {
      return { label: 'Hacé pick del próximo partido', routerLink: ['/picks/match', next] };
    }
    return { label: 'Hacer picks', routerLink: '/picks' };
  });

  totals = signal<{ points: number; globalRank: number | null; hasComplete: boolean }>({
    points: 0, globalRank: null, hasComplete: false,
  });
  pendingPicksCount = signal(0);
  nextDeadlineLabel = signal<string | null>(null);
  accuracyPct = signal<number | null>(null);
  accuracyCount = signal<string | null>(null);
  myGroupsList = signal<GroupRow[]>([]);
  groupsLoading = signal(true);
  bestPosition = signal<number | null>(null);
  bestPositionGroupName = signal<string>('');
  rankPercentile = signal<number>(0);
  specialPicks = signal<SpecialPickVm[]>([
    { type: 'CHAMPION', label: 'Campeón', teamName: null, flag: null },
    { type: 'RUNNER_UP', label: 'Sub', teamName: null, flag: null },
    { type: 'DARK_HORSE', label: 'Revelación', teamName: null, flag: null },
  ]);
  /** Cuántos de los 3 especiales tienen pick (visible en header). */
  especialesProgress = computed(() => this.specialPicks().filter((s) => !!s.teamName).length);

  comodinesActive = signal(0);
  comodinesCap = signal(5);
  comodinSlots = computed<ComodinSlotVm[]>(() => {
    const active = this.comodinesActive();
    const cap = this.comodinesCap();
    const slots: ComodinSlotVm[] = [];
    const visible = Math.min(cap, 3);
    for (let i = 0; i < visible; i++) {
      if (i < active) slots.push({ idx: i, kind: 'avail', icon: '×2', label: 'Disponible' });
      else slots.push({ idx: i, kind: 'empty', icon: '?', label: 'Vacío' });
    }
    return slots;
  });

  myGroupsCount = computed(() => this.userModes.groups().length);

  async ngOnInit() {
    void this.loadMatchesAndStats();
    void this.loadGroups();
  }

  onCreateGroup() { this.groupActions.openCreate(); }
  onJoinGroup() { this.groupActions.openJoin(); }

  bestPositionLabel = computed(() => {
    const p = this.bestPosition();
    return p ? `${p}°` : '—';
  });

  private async loadMatchesAndStats() {
    try {
      const userId = this.auth.user()?.sub ?? '';
      const [matchesRes, totalRes, leaderboardRes, picksRes] = await Promise.all([
        this.api.listMatches(TOURNAMENT_ID),
        userId ? this.api.myTotal(userId, TOURNAMENT_ID) : Promise.resolve({ data: [] as readonly unknown[] }),
        this.api.listLeaderboard(TOURNAMENT_ID, 200),
        userId
          ? this.api.myPicks(userId)
          : Promise.resolve({ data: [] as ReadonlyArray<{ matchId: string; pointsEarned?: number | null }> }),
      ]);

      const totalRow = ((totalRes.data ?? []) as ReadonlyArray<{ points?: number }>)[0];
      const sorted = ((leaderboardRes.data ?? []) as ReadonlyArray<{ userId: string; points?: number }>)
        .slice().sort((a, b) => (b.points ?? 0) - (a.points ?? 0));
      const rankIdx = sorted.findIndex((t) => t.userId === userId);
      const globalRank = rankIdx >= 0 ? rankIdx + 1 : null;
      this.totals.set({
        points: totalRow?.points ?? 0,
        globalRank,
        hasComplete: this.userModes.hasComplete(),
      });

      if (globalRank && sorted.length > 0) {
        // Percentile bar: lower rank → larger fill (1st = 100%).
        const pct = Math.max(2, Math.round((1 - (globalRank - 1) / sorted.length) * 100));
        this.rankPercentile.set(pct);
      }

      type MRow = { id: string; kickoffAt?: string | null; status?: string | null };
      const allMatches = ((matchesRes.data ?? []) as ReadonlyArray<MRow>)
        .filter((m): m is { id: string; kickoffAt: string; status?: string | null } => !!m?.id && !!m?.kickoffAt);

      const pickIds = new Set(((picksRes.data ?? []) as ReadonlyArray<{ matchId: string }>).map((p) => p.matchId));
      const now = Date.now();
      const cutoff = now + 48 * 3600 * 1000;
      const pending = allMatches.filter((m) => {
        const ko = new Date(m.kickoffAt).getTime();
        return ko > now && ko < cutoff && !pickIds.has(m.id);
      });
      this.pendingPicksCount.set(pending.length);

      if (pending.length > 0) {
        const next = pending.sort((a, b) => new Date(a.kickoffAt).getTime() - new Date(b.kickoffAt).getTime())[0]!;
        const diff = new Date(next.kickoffAt).getTime() - now;
        const h = Math.floor(diff / 3_600_000);
        const m = Math.floor((diff % 3_600_000) / 60_000);
        this.nextDeadlineLabel.set(h > 0 ? `${h}h ${m}min` : `${m} min`);
      }

      // Next match overall (futuro más próximo, con o sin pick) — drives CTA durante torneo
      const futureMatches = allMatches
        .filter((m) => new Date(m.kickoffAt).getTime() > now)
        .sort((a, b) => new Date(a.kickoffAt).getTime() - new Date(b.kickoffAt).getTime());
      // Prioriza el primer pending sin pick; si todos tienen pick, usa el próximo a jugarse
      const candidateMatchId = pending[0]?.id ?? futureMatches[0]?.id ?? null;
      this.nextMatchId.set(candidateMatchId);

      const finalPicks = ((picksRes.data ?? []) as ReadonlyArray<{ matchId: string; pointsEarned?: number | null }>)
        .filter((p) => {
          const match = allMatches.find((m) => m.id === p.matchId);
          return match?.status === 'FINAL';
        });
      const total = finalPicks.length;
      const hits = finalPicks.filter((p) => (p.pointsEarned ?? 0) > 0).length;
      if (total > 0) {
        this.accuracyPct.set(Math.round((hits / total) * 100));
        this.accuracyCount.set(`${hits}/${total}`);
      }
    } catch (e) {
      console.warn('[home] load matches/stats failed', e);
    }
  }

  private async loadGroups() {
    const userId = this.auth.user()?.sub ?? '';
    if (!userId) {
      this.groupsLoading.set(false);
      return;
    }
    try {
      const groups = this.userModes.groups().slice(0, 5);
      const palette = [
        'linear-gradient(135deg,#067a4a,#02cc74)',
        'linear-gradient(135deg,#3b82f6,#1d4ed8)',
        'linear-gradient(135deg,#f59e0b,#b45309)',
        'linear-gradient(135deg,#8b5cf6,#6d28d9)',
        'linear-gradient(135deg,#dc2626,#7f1d1d)',
      ];
      const rows = await Promise.all(groups.map(async (g, idx): Promise<GroupRow> => {
        try {
          const lbRes = await this.api.groupLeaderboard(g.id);
          const sortedLb = ((lbRes.data ?? []) as ReadonlyArray<{ userId: string; points?: number }>)
            .slice().sort((a, b) => (b.points ?? 0) - (a.points ?? 0));
          const i = sortedLb.findIndex((x) => x.userId === userId);
          const position = i >= 0 ? i + 1 : null;
          const prizeLine = g.prize1st
            ? `Premio ${g.prize1st}`
            : 'Bragging rights';
          const initials = (g.name ?? 'GR').slice(0, 2).toUpperCase();
          return {
            id: g.id, name: g.name, mode: g.mode,
            members: sortedLb.length, position, prizeLine,
            avatarBg: palette[idx % palette.length]!, initials,
          };
        } catch {
          return {
            id: g.id, name: g.name, mode: g.mode,
            members: 0, position: null, prizeLine: 'Bragging rights',
            avatarBg: palette[idx % palette.length]!,
            initials: (g.name ?? 'GR').slice(0, 2).toUpperCase(),
          };
        }
      }));
      this.myGroupsList.set(rows);

      let best: { p: number; n: string } | null = null;
      for (const r of rows) {
        if (r.position && (!best || r.position < best.p)) {
          best = { p: r.position, n: r.name };
        }
      }
      if (best) {
        this.bestPosition.set(best.p);
        this.bestPositionGroupName.set('En ' + best.n);
      }
    } catch (e) {
      console.warn('[home] load groups failed', e);
    } finally {
      this.groupsLoading.set(false);
    }
  }
}
