import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ApiService } from '../../core/api/api.service';
import { AuthService } from '../../core/auth/auth.service';
import { UserModesService } from '../../core/user/user-modes.service';
import { GroupActionsService } from '../../core/groups/group-actions.service';

const TOURNAMENT_ID = 'mundial-2026';
const TOURNAMENT_START_ISO = '2026-06-12T19:00:00-04:00';   // primer kickoff Mundial 2026

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

/**
 * Pantalla principal design-v3. Diseño content-priority:
 *   1. Hero gradient compacto (avatar + greeting + días al torneo + alert).
 *   2. KPI strip 5-up (Ranking · Puntos · Aciertos · Grupos · Comodines).
 *   3. Picks pendientes dark block (sólo cuando hay picks por enviar en 48h).
 *   4. Mis grupos (list con rank pill + CTAs create/join).
 *   5. Row de Especiales (3 chips) + Ranking gradient card.
 *   6. Comodines slots (sólo para users con grupo modo COMPLETE).
 *
 * Source visual: polla-app/design-input/prueba-gg/project/polla-v3.html
 */
@Component({
  selector: 'app-home',
  standalone: true,
  imports: [RouterLink],
  template: `
    <section class="home-page">

      <!-- HERO compacto: tira delgada (single-row) con info esencial -->
      <section class="hero">
        <div class="hero__in">
          <div class="hero__av">{{ avatarInitials() }}</div>
          <div class="hero__b">
            <div class="hero__t">
              <span class="hero__h">{{ '@' + (handle() ?? 'jugador') }}</span> ·
              <strong>{{ daysToTournament() }}d</strong> al Mundial
              @if (totals().globalRank) {
                · <strong>#{{ totals().globalRank }}</strong> global
              }
              · {{ totals().points }} pts
            </div>
            @if (pendingPicksCount() > 0 && nextDeadlineLabel()) {
              <div class="hero__alert">⚠ Cierra en {{ nextDeadlineLabel() }}</div>
            }
          </div>
          <a routerLink="/picks" class="hero__cta">Hacer picks →</a>
        </div>
      </section>

      <!-- KPI strip -->
      <div class="kpis">
        <div class="kpi kpi--g">
          <div class="kpi__l">Ranking global</div>
          <div class="kpi__v">{{ totals().globalRank ? '#' + totals().globalRank : '—' }}</div>
          <div class="kpi__d">&nbsp;</div>
        </div>
        <div class="kpi">
          <div class="kpi__l">Puntos</div>
          <div class="kpi__v">{{ totals().points }}</div>
          <div class="kpi__d">&nbsp;</div>
        </div>
        <div class="kpi">
          <div class="kpi__l">Aciertos</div>
          <div class="kpi__v">{{ accuracyPct() !== null ? accuracyPct() + '%' : '—' }}
            @if (accuracyCount() !== null) { <small>{{ accuracyCount() }}</small> }
          </div>
          <div class="kpi__d">&nbsp;</div>
        </div>
        <div class="kpi">
          <div class="kpi__l">Grupos</div>
          <div class="kpi__v">{{ myGroupsCount() }}
            @if (bestPosition() !== null) { <small>{{ bestPositionLabel() }}</small> }
          </div>
          <div class="kpi__d">&nbsp;</div>
        </div>
        <div class="kpi">
          <div class="kpi__l">Comodines</div>
          <div class="kpi__v">{{ comodinesActive() }} <small>/{{ comodinesCap() }}</small></div>
          <div class="kpi__d">&nbsp;</div>
        </div>
      </div>

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
          <a routerLink="/picks" class="pp__b">Hacer picks →</a>
        </div>
      }

      <!-- Mis grupos -->
      <div>
        <div class="sh">
          <h2>Mis grupos · {{ myGroupsList().length }} {{ myGroupsList().length === 1 ? 'activo' : 'activos' }}</h2>
          <a routerLink="/groups">Ver todos →</a>
        </div>
        <div class="gr-list">
          @if (myGroupsList().length === 0) {
            <p class="text-mute">Aún no estás en ningún grupo.</p>
          }
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
          <button type="button" (click)="onCreateGroup()">＋ Crear grupo</button>
          <button type="button" (click)="onJoinGroup()">→ Unirme con código</button>
        </div>
      </div>

      <!-- Row: especiales + ranking -->
      <div class="row2">
        <div class="spk">
          <div class="spk__h"><span>🏆 Picks especiales · hasta 65 pts</span></div>
          <div class="spk__row">
            @for (s of specialPicks(); track s.type) {
              <a routerLink="/profile/special-picks" class="spk__c"
                 [class.spk__c--g]="s.type === 'CHAMPION'"
                 [class.spk__c--s]="s.type === 'RUNNER_UP'"
                 [class.spk__c--e]="s.type === 'DARK_HORSE'">
                <div class="spk__big">
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
                <div class="rk__l">{{ bestPositionGroupName() }}</div>
              </div>
            }
          </div>
          <div class="rk__bar">
            <div class="rk__bar__f" [style.width.%]="rankPercentile()"></div>
          </div>
          <div class="rk__s">
            <span>{{ totals().points }} pts · {{ accuracyPct() ?? 0 }}% acierto</span>
            <span>&nbsp;</span>
          </div>
        </div>
      </div>

      <!-- Comodines (solo COMPLETE) -->
      @if (totals().hasComplete) {
        <div class="com">
          <div class="com__h">
            <span>⚡ Comodines · {{ comodinesActive() }} de {{ comodinesCap() }} disponibles</span>
            <a routerLink="/mis-comodines">Detalles →</a>
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

    /* Hero · tira delgada (single-row strip) */
    .hero {
      background: linear-gradient(135deg, #0a0a0a 0%, #0a3d20 60%, #067a4a 100%);
      color: #fff;
      border-radius: 10px;
      padding: 8px 14px;
      position: relative;
      overflow: hidden;
    }
    .hero::before {
      content: ""; position: absolute; inset: 0; z-index: 0;
      background: radial-gradient(60% 100% at 80% 50%, rgba(2,204,116,0.20), transparent 60%);
    }
    .hero__in {
      position: relative; z-index: 1;
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .hero__av {
      width: 32px; height: 32px;
      border-radius: 50%;
      background: linear-gradient(135deg, #02cc74, #016b3d);
      display: grid; place-items: center;
      font-family: var(--font-display);
      font-size: 13px;
      color: #fff;
      flex-shrink: 0;
    }
    .hero__b { flex: 1; min-width: 0; display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
    .hero__t {
      font-size: 13px;
      line-height: 1.2;
    }
    .hero__h { font-family: var(--font-display); font-size: 14px; letter-spacing: 0.02em; }
    .hero__t strong { color: var(--color-primary-green); font-weight: 700; }
    .hero__alert {
      background: rgba(220,38,38,0.18);
      border: 1px solid rgba(220,38,38,0.45);
      color: #fca5a5;
      padding: 2px 8px;
      border-radius: 4px;
      font-size: 10px;
      display: inline-flex;
      align-items: center;
      gap: 6px;
      white-space: nowrap;
    }
    .hero__cta {
      background: var(--color-primary-green);
      color: #fff;
      padding: 6px 12px;
      border-radius: 6px;
      font-weight: 600;
      text-decoration: none;
      font-size: 11px;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      white-space: nowrap;
      flex-shrink: 0;
    }
    @media (max-width: 640px) {
      .hero { padding: 8px 12px; }
      .hero__in { gap: 10px; }
      .hero__av { width: 28px; height: 28px; font-size: 11px; }
      .hero__t { font-size: 12px; }
      .hero__h { font-size: 12px; }
      .hero__cta { padding: 5px 10px; font-size: 10px; }
    }

    /* KPI strip */
    .kpis {
      display: grid; grid-template-columns: repeat(5, 1fr);
      gap: 1px;
      background: rgba(0,0,0,0.08);
      border: 1px solid rgba(0,0,0,0.08);
      border-radius: 12px;
      overflow: hidden;
    }
    .kpi { background: #fff; padding: 14px 16px; }
    .kpi--g { background: linear-gradient(135deg, #02cc74, #016b3d); color: #fff; }
    .kpi__l { font-size: 9px; letter-spacing: 0.16em; text-transform: uppercase; color: var(--color-text-muted); margin-bottom: 4px; }
    .kpi--g .kpi__l { color: rgba(255,255,255,0.85); }
    .kpi__v { font-family: var(--font-display); font-size: 24px; line-height: 1; }
    .kpi__v small { font-size: 11px; color: var(--color-text-muted); font-family: var(--font-primary); }
    .kpi--g .kpi__v small { color: rgba(255,255,255,0.7); }
    .kpi__d { font-size: 10px; color: var(--color-primary-green); font-weight: 600; margin-top: 3px; }
    .kpi--g .kpi__d { color: rgba(255,255,255,0.85); }
    @media (max-width: 780px) { .kpis { grid-template-columns: repeat(2, 1fr); } }

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
    .gr { background: #fff; border: 1px solid var(--color-line); border-radius: 10px; padding: 12px; display: flex; align-items: center; gap: 12px; text-decoration: none; color: inherit; transition: all 0.15s; }
    .gr:hover { border-color: rgba(2,204,116,0.4); background: rgba(2,204,116,0.02); }
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
    @media (max-width: 480px) { .gr-act { grid-template-columns: 1fr; } }

    /* Row 2-col */
    .row2 { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
    @media (max-width: 780px) { .row2 { grid-template-columns: 1fr; } }

    /* Especiales */
    .spk { background: #fff; border: 1px solid var(--color-line); border-radius: 12px; padding: 12px 14px; }
    .spk__h { font-size: 10px; letter-spacing: 0.14em; text-transform: uppercase; color: var(--color-text-muted); margin-bottom: 8px; display: flex; justify-content: space-between; align-items: center; }
    .spk__row { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; }
    .spk__c { text-align: center; padding: 6px 4px; border-radius: 7px; text-decoration: none; color: inherit; transition: all 0.2s; display: flex; align-items: center; gap: 6px; justify-content: center; }
    .spk__c:hover { transform: translateY(-1px); }
    .spk__c--g { background: linear-gradient(135deg, #fde047, #f59e0b); color: #7c2d12; }
    .spk__c--s { background: linear-gradient(135deg, #e5e7eb, #9ca3af); color: #1f2937; }
    .spk__c--e { background: #f3f4f6; border: 1px dashed var(--color-primary-green); color: var(--color-primary-green); }
    .spk__big { font-size: 16px; line-height: 1; }
    .spk__nm { font-family: var(--font-display); font-size: 11px; line-height: 1; }

    /* Ranking */
    .rk { background: linear-gradient(135deg, #02cc74, #016b3d); color: #fff; border-radius: 14px; padding: 18px; }
    .rk__r { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 10px; }
    .rk__big { font-family: var(--font-display); font-size: 32px; line-height: 1; }
    .rk__l { font-size: 9px; letter-spacing: 0.14em; text-transform: uppercase; opacity: 0.85; margin-top: 3px; }
    .rk__r2 { text-align: right; }
    .rk__r2 .rk__big { font-size: 24px; }
    .rk__bar { height: 4px; background: rgba(255,255,255,0.25); border-radius: 999px; overflow: hidden; }
    .rk__bar__f { height: 100%; background: #fff; transition: width 0.3s; }
    .rk__s { font-size: 10px; opacity: 0.85; margin-top: 4px; display: flex; justify-content: space-between; }

    /* Comodines */
    .com { background: #fff; border: 1px solid var(--color-line); border-radius: 12px; padding: 12px 14px; }
    .com__h { font-size: 10px; letter-spacing: 0.14em; text-transform: uppercase; color: var(--color-text-muted); margin-bottom: 8px; display: flex; justify-content: space-between; align-items: center; }
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

  totals = signal<{ points: number; globalRank: number | null; hasComplete: boolean }>({
    points: 0, globalRank: null, hasComplete: false,
  });
  pendingPicksCount = signal(0);
  nextDeadlineLabel = signal<string | null>(null);
  accuracyPct = signal<number | null>(null);
  accuracyCount = signal<string | null>(null);
  myGroupsList = signal<GroupRow[]>([]);
  bestPosition = signal<number | null>(null);
  bestPositionGroupName = signal<string>('');
  rankPercentile = signal<number>(0);
  specialPicks = signal<SpecialPickVm[]>([
    { type: 'CHAMPION', label: 'Campeón', teamName: null, flag: null },
    { type: 'RUNNER_UP', label: 'Sub', teamName: null, flag: null },
    { type: 'DARK_HORSE', label: 'Revelación', teamName: null, flag: null },
  ]);
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
    if (!userId) return;
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
    }
  }
}
