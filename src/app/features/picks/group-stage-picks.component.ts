import { Component, OnInit, computed, inject, input, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { CdkDrag, CdkDragDrop, CdkDropList, CdkDropListGroup, moveItemInArray } from '@angular/cdk/drag-drop';
import { ApiService } from '../../core/api/api.service';
import { AuthService } from '../../core/auth/auth.service';
import { ToastService } from '../../core/notifications/toast.service';
import { GroupActionsService } from '../../core/groups/group-actions.service';
import { ConfirmDialogService } from '../../shared/ui/confirm-dialog.service';
import { IconComponent } from '../../shared/ui/icon/icon.component';
import { TeamFlagComponent } from '../../shared/ui/team-flag.component';

type GameMode = 'SIMPLE' | 'COMPLETE';

const TOURNAMENT_ID = 'mundial-2026';
const GROUP_LETTERS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L'];
// Storage key incluye el modo: cada user puede tener UNA predicción simple
// y UNA completa, persistidas independientes en localStorage hasta el commit.
const STORAGE_KEY = (userId: string, mode: GameMode) => `polla-group-stage-picks-${mode}-${userId}`;

interface TeamLite { slug: string; name: string; flagCode: string; crestUrl: string | null; }

interface StagedState {
  // Por grupo: orden de slugs (índice 0 = pos1, 1 = pos2, etc.)
  groups: Record<string, string[]>;
  // Set de los 8 que avanzan via best-thirds. Solo 8 slugs.
  advancing: string[];
}

interface ServerIdMap {
  // ID del row de GroupStandingPick por groupLetter, si existe.
  standings: Record<string, string>;
  // ID del row de BestThirdsPick.
  thirds: string | null;
}

@Component({
  standalone: true,
  selector: 'app-group-stage-picks',
  imports: [CdkDropListGroup, CdkDropList, CdkDrag, TeamFlagComponent, IconComponent],
  template: `
    <!-- Header propio: solo cuando NO está embebido (en tabla-grupos
         el page__header del parent ya cubre el title). -->
    @if (!embedded()) {
      <header class="page-header">
        <div class="page-header__title">
          <small>Predicciones · fase de grupos</small>
          <h1>Tabla final por grupo</h1>
        </div>
      </header>
    }

    <!-- Sin grupos privados: NO bloqueamos la pantalla. Mostramos los equipos
         como vista previa (arrastrable, persistida local) con una nota slim
         que invita a unirse/crear un grupo para que la predicción cuente. -->
    @if (availableModes().length === 0 && !modesLoading()) {
      <div class="gs-preview-note">
        <span class="gs-preview-note__text">
          <app-icon name="users" size="sm" />
          Vista previa · arrastra para predecir. Únete o crea un grupo privado para que tu predicción cuente.
        </span>
        <span class="gs-preview-note__cta">
          <button type="button" class="empty-cta empty-cta--primary"
                  (click)="groupActions.openCreate()">Crear grupo</button>
          <button type="button" class="empty-cta"
                  (click)="groupActions.openJoin()">Unirme con código</button>
        </span>
      </div>
    } @else if (availableModes().length > 1) {
      <!-- Mode switch unificado (role=tablist + aria-selected, igual que
           special-picks post-A8c). switchMode pide confirm si hay picks. -->
      <div class="wf-seg" role="tablist" style="max-width: 320px; margin-top: var(--space-md);">
        @for (m of availableModes(); track m) {
          <button type="button" class="wf-seg__item" role="tab"
                  [attr.aria-selected]="mode() === m"
                  [class.is-active]="mode() === m"
                  (click)="switchMode(m)">
            {{ m === 'COMPLETE' ? 'Modo completo' : 'Modo simple' }}
          </button>
        }
      </div>
    } @else if (mode()) {
      <p class="form-card__hint" style="margin-top: var(--space-sm);">
        Predicción <strong>{{ mode() === 'COMPLETE' ? 'modo completo' : 'modo simple' }}</strong>.
        @if (mode() === 'COMPLETE') {
          Cuenta para el ranking global y para tus grupos completos.
        } @else {
          Cuenta para tus grupos simples (no afecta el ranking global).
        }
      </p>
    }

    @if (lockedAt()) {
      <p class="form-card__hint" style="color: var(--color-lost);">
        Las predicciones se cerraron al iniciar el torneo
        ({{ formatLockDate(lockedAt()!) }}). Solo lectura.
      </p>
    } @else if (mode()) {
      <!-- Contradicción resuelta: SOLO mensaje auto-save (era "se guardan
           automáticamente" + "Pulsa Guardar"). El botón final sigue pero
           se llama "Guardar y sincronizar" para clarificar su rol). -->
      <p class="form-card__hint">
        Arrastra los equipos para predecir cómo terminará cada grupo.
        Tus cambios se <strong>guardan automáticamente</strong> mientras editás.
        Sincronizá con la base al final para que cuenten en el scoring.
      </p>
    }

    @if (loading()) {
      <p style="padding: var(--space-2xl); text-align: center;">Cargando equipos…</p>
    } @else {
      <div class="gs-layout">
        <!-- Grid de grupos -->
        <section class="gs-groups">
          @for (g of GROUP_LETTERS; track g) {
            <article class="gs-card">
              <header class="gs-card__head">
                <h2>Grupo {{ g }}</h2>
                <small>1° · 2° · 3° · 4°</small>
              </header>
              <ol cdkDropList
                  [cdkDropListData]="staged().groups[g] || []"
                  [cdkDropListDisabled]="!!lockedAt()"
                  (cdkDropListDropped)="onDrop(g, $event)"
                  class="gs-list">
                @for (slug of staged().groups[g] || []; track slug; let idx = $index) {
                  <li cdkDrag class="gs-item"
                      [class.gs-item--qualified]="idx === 0 || idx === 1"
                      [class.gs-item--third]="idx === 2"
                      [class.gs-item--eliminated]="idx === 3"
                      [cdkDragDisabled]="!!lockedAt()">
                    <span class="gs-item__pos">{{ idx + 1 }}°</span>
                    <app-team-flag
                      class="gs-item__flag"
                      [flagCode]="teamMap().get(slug)?.flagCode || ''"
                      [name]="teamMap().get(slug)?.name || slug"
                      [size]="20" />
                    <span class="gs-item__name">{{ teamMap().get(slug)?.name || slug }}</span>
                    @if (idx === 0 || idx === 1) {
                      <span class="gs-item__tag gs-item__tag--ok">✓ Clasifica</span>
                    } @else if (idx === 2) {
                      <span class="gs-item__tag gs-item__tag--maybe">3°</span>
                    } @else {
                      <span class="gs-item__tag gs-item__tag--out"><app-icon name="close" size="sm" /> Eliminado</span>
                    }
                  </li>
                }
              </ol>
            </article>
          }
        </section>

        <!-- Sidebar terceros: click-to-toggle (no drag-drop — el orden no importa
             para scoring, solo importa que el equipo esté entre los 8 que pasan). -->
        <aside class="gs-sidebar">
          <header class="gs-sidebar__head">
            <h2>Mejores 3eros</h2>
            <small>De los 12 terceros de cada grupo, <strong>solo 8 clasifican</strong> a octavos. Marcalos con un click.</small>
          </header>

          <ol class="gs-thirds">
            @for (slug of thirdsList(); track slug) {
              @let advancing = isAdvancing(slug);
              <li class="gs-third"
                  [class.gs-third--in]="advancing"
                  [class.gs-third--disabled]="!!lockedAt()"
                  role="button"
                  [attr.aria-pressed]="advancing"
                  (click)="toggleAdvance(slug)">
                <span class="gs-third__check">{{ advancing ? '✓' : '+' }}</span>
                <app-team-flag
                  class="gs-third__flag"
                  [flagCode]="teamMap().get(slug)?.flagCode || ''"
                  [name]="teamMap().get(slug)?.name || slug"
                  [size]="20" />
                <span class="gs-third__name">{{ teamMap().get(slug)?.name || slug }}</span>
                <small class="gs-third__group">Gr {{ groupOf(slug) }}</small>
              </li>
            }
          </ol>

          <p class="form-card__hint" style="margin-top: var(--space-md);">
            Seleccionados: <strong>{{ staged().advancing.length }}/8</strong>
          </p>

          @if (saveError()) {
            <p class="form-card__hint" style="color: var(--color-lost);">{{ saveError() }}</p>
          }

          <button class="btn btn--primary" type="button"
                  style="width: 100%; margin-top: var(--space-md);"
                  [disabled]="saving() || !!lockedAt()"
                  (click)="saveAll()">
            {{ saving() ? 'Guardando…' : 'Ver mis Brackets' }}
          </button>

          @if (lastSavedAt()) {
            <p class="form-card__hint" style="margin-top: var(--space-sm); text-align: center;">
              Último guardado: {{ formatLockDate(lastSavedAt()!) }}
            </p>
          }
        </aside>
      </div>
    }
  `,
  styles: [`
    .gs-layout {
      display: grid;
      grid-template-columns: 1fr 320px;
      gap: var(--space-xl);
      padding: 0 var(--section-x-mobile, var(--space-md));
    }
    @media (max-width: 991px) {
      .gs-layout { grid-template-columns: 1fr; }
    }
    .gs-groups {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
      gap: var(--space-md);
    }
    .gs-card {
      background: var(--color-primary-white);
      border: 1px solid var(--wf-line);
      border-radius: 12px;
      padding: var(--space-md);
    }
    .gs-card__head {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      margin-bottom: var(--space-sm);
    }
    .gs-card__head h2 {
      font-family: var(--font-display);
      font-size: 18px;
      letter-spacing: 0.04em;
      line-height: 1.05;
    }
    .gs-card__head small {
      font-size: 9px;
      color: var(--color-text-muted);
      text-transform: uppercase;
      letter-spacing: 0.08em;
      font-weight: 700;
    }
    .gs-list {
      list-style: none;
      padding: 0;
      margin: 0;
      display: grid;
      gap: 4px;
      min-height: 200px;
    }
    .gs-item {
      display: grid;
      grid-template-columns: 28px 22px 1fr auto;
      gap: 8px;
      align-items: center;
      padding: 8px 10px;
      border: 1px solid var(--wf-line);
      border-left: 3px solid var(--wf-line);
      background: var(--wf-fill);
      border-radius: 8px;
      cursor: grab;
      user-select: none;
      transition: background 100ms, border-color 100ms;
    }
    .gs-item:active { cursor: grabbing; }
    .gs-item--qualified {
      background: rgba(0, 200, 100, 0.14);
      border-left-color: var(--color-primary-green);
    }
    .gs-item--third {
      background: rgba(255, 180, 0, 0.18);
      border-left-color: #d99b00;
    }
    .gs-item--eliminated {
      background: rgba(220, 50, 50, 0.10);
      border-left-color: var(--color-lost, #c33);
      opacity: 0.85;
    }
    .gs-item--eliminated .gs-item__name {
      color: var(--color-text-muted);
      text-decoration: line-through;
      text-decoration-color: rgba(0,0,0,0.35);
    }
    .gs-item__pos {
      font-family: var(--font-display);
      font-size: var(--fs-md);
      text-align: center;
      font-weight: bold;
    }
    .gs-item__flag { width: 20px; height: 20px; border-radius: 3px; }
    .gs-item__name {
      font-size: var(--fs-sm);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .gs-item__tag {
      font-size: 9px;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      padding: 2px 6px;
      border-radius: 999px;
      white-space: nowrap;
      font-weight: 600;
    }
    .gs-item__tag--ok {
      background: var(--color-primary-green);
      color: var(--color-primary-white);
    }
    .gs-item__tag--maybe {
      background: #d99b00;
      color: var(--color-primary-white);
    }
    .gs-item__tag--out {
      background: var(--color-lost, #c33);
      color: var(--color-primary-white);
    }
    .cdk-drag-preview {
      box-shadow: 0 4px 12px rgba(0,0,0,0.2);
    }
    .cdk-drag-placeholder { opacity: 0.4; }
    .cdk-drop-list-dragging .gs-item:not(.cdk-drag-placeholder) {
      transition: transform 200ms cubic-bezier(0,0,0.2,1);
    }

    /* Sidebar */
    .gs-sidebar {
      background: var(--color-primary-white);
      border: var(--border-grey);
      border-radius: var(--radius-md);
      padding: var(--space-md);
      align-self: start;
      position: sticky;
      top: var(--space-md);
    }
    .gs-sidebar__head { margin-bottom: var(--space-md); }
    .gs-sidebar__head h2 {
      font-family: var(--font-display);
      font-size: var(--fs-md);
      line-height: 1.1;
      text-transform: uppercase;
    }
    .gs-sidebar__head small {
      display: block;
      margin-top: 4px;
      font-size: var(--fs-xs);
      color: var(--color-text-muted);
    }
    .gs-thirds {
      list-style: none;
      padding: 0;
      margin: 0;
      display: grid;
      gap: 4px;
    }
    .gs-third {
      display: grid;
      grid-template-columns: 22px 22px 1fr auto;
      gap: 8px;
      align-items: center;
      padding: 8px 10px;
      border: 1px solid rgba(0,0,0,0.08);
      border-radius: var(--radius-sm);
      cursor: pointer;
      user-select: none;
      background: var(--color-primary-white);
      transition: background 100ms, border-color 100ms;
    }
    .gs-third:hover { background: rgba(0,0,0,0.04); border-color: rgba(0,0,0,0.18); }
    .gs-third--in {
      background: rgba(0, 200, 100, 0.14);
      border-color: var(--color-primary-green);
    }
    .gs-third--in .gs-third__check {
      background: var(--color-primary-green);
      color: var(--color-primary-white);
    }
    .gs-third--disabled {
      cursor: not-allowed;
      opacity: 0.6;
    }
    .gs-third__check {
      width: 22px;
      height: 22px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      border-radius: 50%;
      background: rgba(0,0,0,0.08);
      color: var(--color-text-muted);
      font-weight: bold;
      font-size: var(--fs-sm);
    }
    .gs-third__flag { width: 20px; height: 20px; border-radius: 3px; }
    .gs-third__name { font-size: var(--fs-sm); font-weight: 500; }
    .gs-third__group {
      font-size: 9px;
      color: var(--color-text-muted);
      text-transform: uppercase;
      letter-spacing: 0.06em;
      padding: 2px 6px;
      border-radius: 999px;
      background: rgba(0,0,0,0.06);
    }

    /* Nota slim "vista previa" cuando el user no tiene grupo privado */
    .gs-preview-note {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: var(--space-md);
      flex-wrap: wrap;
      padding: 12px 14px;
      margin: var(--space-md) var(--section-x-mobile, var(--space-md)) 0;
      background: rgba(2, 204, 116, 0.06);
      border: 1px solid rgba(2, 204, 116, 0.3);
      border-radius: 10px;
      font-size: 13px;
      color: var(--wf-ink-2, #333);
    }
    .gs-preview-note__text {
      display: inline-flex;
      align-items: center;
      gap: 6px;
    }
    .gs-preview-note__cta {
      display: inline-flex;
      gap: 8px;
      flex-wrap: wrap;
    }

    /* Empty state CTAs */
    .empty-cta {
      background: transparent;
      border: 1px solid var(--color-primary-green);
      border-radius: 8px;
      padding: 8px 14px;
      color: var(--color-primary-green);
      font-family: inherit;
      font-weight: 600;
      font-size: 12px;
      cursor: pointer;
      text-decoration: none;
      display: inline-flex;
      align-items: center;
      gap: 4px;
    }
    .empty-cta:hover { background: rgba(2,204,116,0.05); }
    .empty-cta:focus-visible { outline: 2px solid var(--color-primary-green); outline-offset: 2px; }
    .empty-cta--primary { background: var(--color-primary-green); color: #fff; }
    .empty-cta--primary:hover { background: var(--color-primary-green); filter: brightness(0.95); }
  `],
})
export class GroupStagePicksComponent implements OnInit {
  /** Cuando se embebe via <app-group-stage-picks [embedded]="true">,
   *  el componente NO renderiza su propio page-header (el parent ya
   *  tiene un h1 / kicker). Default false → standalone usa header propio. */
  embedded = input<boolean>(false);

  private api = inject(ApiService);
  private auth = inject(AuthService);
  private toast = inject(ToastService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private confirmDialog = inject(ConfirmDialogService);
  groupActions = inject(GroupActionsService);

  GROUP_LETTERS = GROUP_LETTERS;

  loading = signal(true);
  modesLoading = signal(true);
  saving = signal(false);
  saveError = signal<string | null>(null);
  lastSavedAt = signal<string | null>(null);
  lockedAt = signal<string | null>(null);

  // Modos disponibles según los grupos privados a los que pertenece el user.
  availableModes = signal<GameMode[]>([]);
  // Modo actualmente activo en la pantalla. Cuando cambia, recargamos
  // staged + serverIds desde DB/localStorage del modo nuevo.
  mode = signal<GameMode | null>(null);

  // Mapa slug → equipo, sólo lookups
  teamMap = signal<Map<string, TeamLite>>(new Map());

  // Para saber a qué grupo pertenece originalmente cada team
  teamGroup = signal<Map<string, string>>(new Map());

  staged = signal<StagedState>({ groups: {}, advancing: [] });

  // ID de las rows en la base por groupLetter (para diferenciar create vs update)
  private serverIds: ServerIdMap = { standings: {}, thirds: null };

  private currentUserId = '';

  /** ¿Tiene picks no-default guardados? Heurística: si hay advancing
   *  seleccionados, o si algún grupo NO está en orden alfabético, el
   *  user editó. Usado para warning al cambiar de modo. */
  hasAnyPicks = computed(() => {
    const s = this.staged();
    if (s.advancing.length > 0) return true;
    const tg = this.teamGroup();
    // Reconstruimos default por grupo (sorted alphabetically by slug)
    const defaultByGroup = new Map<string, string[]>();
    for (const [slug, gl] of tg) {
      const arr = defaultByGroup.get(gl) ?? [];
      arr.push(slug);
      defaultByGroup.set(gl, arr);
    }
    for (const [, arr] of defaultByGroup) arr.sort();
    // Compara cada grupo contra default
    for (const g of GROUP_LETTERS) {
      const current = s.groups[g] ?? [];
      const def = defaultByGroup.get(g) ?? [];
      const sliced = def.slice(0, 4);
      for (let i = 0; i < Math.min(current.length, sliced.length); i++) {
        if (current[i] !== sliced[i]) return true;
      }
    }
    return false;
  });

  // Lista de los terceros: el equipo que está en pos3 de cada grupo
  thirdsList = computed(() => {
    const groups = this.staged().groups;
    const out: string[] = [];
    for (const g of GROUP_LETTERS) {
      const arr = groups[g] || [];
      if (arr[2]) out.push(arr[2]);
    }
    return out;
  });

  async ngOnInit() {
    this.currentUserId = this.auth.user()?.sub ?? '';
    if (!this.currentUserId) {
      this.toast.error('Necesitas estar logueado');
      return;
    }
    await this.discoverModes();
    // Cargamos SIEMPRE: los equipos se muestran exista o no un grupo/modo.
    // Antes load() sólo corría con mode() seteado, así que sin grupo privado
    // el grid renderizaba 12 tarjetas vacías (sin equipos). load() ahora trae
    // los equipos siempre y sólo el fetch de picks guardadas depende del modo.
    await this.load();
  }

  /**
   * Determina los modos disponibles basados en los grupos privados a los
   * que el user pertenece. Si pertenece a >= 1 grupo COMPLETE, agrega
   * COMPLETE; idem SIMPLE. Si no pertenece a ningún grupo, vacío.
   * Selecciona el modo inicial leyendo ?mode= del query param o el
   * primero disponible.
   */
  private async discoverModes() {
    this.modesLoading.set(true);
    try {
      const memberships = await this.api.myGroups(this.currentUserId);
      const groupIds = (memberships.data ?? []).map((m) => m.groupId);
      const modeSet = new Set<GameMode>();
      for (const gid of groupIds) {
        try {
          const g = await this.api.getGroup(gid);
          const mode = g.data?.mode as GameMode | undefined;
          if (mode === 'SIMPLE' || mode === 'COMPLETE') modeSet.add(mode);
        } catch {
          // skip group we can't read
        }
      }
      const modes = Array.from(modeSet);
      this.availableModes.set(modes);

      const requested = this.route.snapshot.queryParamMap.get('mode') as GameMode | null;
      if (requested && modes.includes(requested)) {
        this.mode.set(requested);
      } else if (modes.length > 0) {
        // Default a COMPLETE si está disponible, sino al único disponible.
        this.mode.set(modes.includes('COMPLETE') ? 'COMPLETE' : modes[0]!);
      } else {
        this.mode.set(null);
      }
    } finally {
      this.modesLoading.set(false);
    }
  }

  async switchMode(m: GameMode) {
    if (this.mode() === m) return;
    // Warning si hay picks no-trivial: cambiar de modo NO migra los
    // datos (cada modo tiene su propia colección). Consistencia con
    // special-picks post-A8c.
    if (this.hasAnyPicks()) {
      const ok = await this.confirmDialog.ask({
        title: 'Cambiar modo',
        message: 'Tus selecciones actuales NO se aplican al otro modo. Las predicciones del modo destino se cargan desde su propia colección — las puedes recuperar volviendo al modo actual.',
        confirmLabel: 'Cambiar modo',
        cancelLabel: 'Cancelar',
      });
      if (!ok) return;
    }
    this.mode.set(m);
    // Reflejamos en URL para que un refresh respete la selección.
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { mode: m },
      queryParamsHandling: 'merge',
    });
    this.serverIds = { standings: {}, thirds: null };
    await this.load();
  }

  async load() {
    const currentMode = this.mode();   // puede ser null (sin grupo) → igual cargamos equipos
    this.loading.set(true);
    try {
      // Equipos + partidos son lecturas públicas (apiKey) y siempre deben
      // poblar el grid. Van en su propio Promise.all para que las picks
      // guardadas (owner-scoped, Cognito) no puedan bloquearlos.
      const [teamsRes, matchesRes] = await Promise.all([
        this.api.listTeams(TOURNAMENT_ID),
        this.api.listMatches(TOURNAMENT_ID),
      ]);

      const tm = new Map<string, TeamLite>();
      const tg = new Map<string, string>();
      for (const t of teamsRes.data ?? []) {
        tm.set(t.slug, {
          slug: t.slug,
          name: t.name,
          flagCode: t.flagCode,
          crestUrl: t.crestUrl ?? null,
        });
        if (t.groupLetter) tg.set(t.slug, t.groupLetter);
      }
      this.teamMap.set(tm);
      this.teamGroup.set(tg);

      // Lock: primer kickoff del torneo
      const firstKickoffMs = (matchesRes.data ?? [])
        .map((m) => Date.parse(m.kickoffAt))
        .filter((n) => Number.isFinite(n))
        .sort((a, b) => a - b)[0];
      if (firstKickoffMs && Date.now() >= firstKickoffMs) {
        this.lockedAt.set(new Date(firstKickoffMs).toISOString());
      }

      // Picks guardadas en DB: sólo si hay modo (vienen de un grupo privado).
      // Aparte y tolerante a fallos para no impedir mostrar los equipos.
      const dbState: StagedState = { groups: {}, advancing: [] };
      if (currentMode) {
        try {
          const [standingsRes, thirdsRes] = await Promise.all([
            this.api.listGroupStandingPicks(this.currentUserId, currentMode),
            this.api.getBestThirdsPick(this.currentUserId, TOURNAMENT_ID, currentMode),
          ]);
          for (const p of standingsRes.data ?? []) {
            if (!p?.groupLetter) continue;
            dbState.groups[p.groupLetter] = [p.pos1, p.pos2, p.pos3, p.pos4];
            this.serverIds.standings[p.groupLetter] = p.id;
          }
          const thirdsRow = (thirdsRes.data ?? [])[0];
          if (thirdsRow) {
            dbState.advancing = (thirdsRow.advancing ?? []).filter((s: string | null): s is string => !!s);
            this.serverIds.thirds = thirdsRow.id;
          }
        } catch (e) {
          console.warn('[group-stage-picks] load saved picks failed', e);
        }
      }

      // Si no hay state guardado para un grupo, default = orden alfabético de equipos del grupo
      const teamsByGroup = new Map<string, string[]>();
      for (const [slug, gl] of tg) {
        const arr = teamsByGroup.get(gl) ?? [];
        arr.push(slug);
        teamsByGroup.set(gl, arr);
      }
      for (const g of GROUP_LETTERS) {
        if (!dbState.groups[g]) {
          const teams = (teamsByGroup.get(g) ?? []).sort();
          // Pad a 4 para que el drag-drop funcione si faltan equipos
          dbState.groups[g] = teams.slice(0, 4);
        }
      }

      // Cargar de localStorage si existe (sobreescribe DB porque es lo más reciente del user)
      const lsRaw = localStorage.getItem(this.storageKey());
      if (lsRaw) {
        try {
          const ls = JSON.parse(lsRaw) as StagedState;
          if (ls.groups) Object.assign(dbState.groups, ls.groups);
          if (Array.isArray(ls.advancing)) dbState.advancing = ls.advancing;
        } catch { /* ignore corrupt local state */ }
      }

      this.staged.set(dbState);
    } finally {
      this.loading.set(false);
    }
  }

  onDrop(groupLetter: string, event: CdkDragDrop<string[]>) {
    if (this.lockedAt()) return;
    this.staged.update((prev) => {
      const arr = [...(prev.groups[groupLetter] ?? [])];
      moveItemInArray(arr, event.previousIndex, event.currentIndex);
      // Si el equipo en pos3 cambió, removerlo del set de avanzantes para
      // que el user lo vuelva a marcar conscientemente. Y si un equipo
      // dejó de ser pos3 pero seguía marcado como avanzante, se queda
      // (el user puede tenerlo de algún otro grupo... no, los terceros son
      // únicos por grupo). Removemos cualquier slug que ya no esté en el
      // thirds-list.
      const newGroups = { ...prev.groups, [groupLetter]: arr };
      const newThirds = new Set<string>();
      for (const g of GROUP_LETTERS) {
        const t = newGroups[g]?.[2];
        if (t) newThirds.add(t);
      }
      const newAdvancing = prev.advancing.filter((s) => newThirds.has(s));
      return { groups: newGroups, advancing: newAdvancing };
    });
    this.persistLocal();
  }

  isAdvancing(slug: string): boolean {
    return this.staged().advancing.includes(slug);
  }

  toggleAdvance(slug: string) {
    if (this.lockedAt()) return;
    this.staged.update((prev) => {
      const set = new Set(prev.advancing);
      if (set.has(slug)) set.delete(slug);
      else if (set.size < 8) set.add(slug);
      else return prev; // ya hay 8, ignorar nueva adición
      return { ...prev, advancing: Array.from(set) };
    });
    this.persistLocal();
  }

  groupOf(slug: string): string {
    return this.teamGroup().get(slug) ?? '—';
  }

  /** Clave de localStorage por modo. Sin grupo/modo (preview) usamos una
   *  clave 'PREVIEW' aparte para no pisar las predicciones reales SIMPLE/COMPLETE. */
  private storageKey(): string {
    return STORAGE_KEY(this.currentUserId, this.mode() ?? ('PREVIEW' as GameMode));
  }

  private persistLocal() {
    if (!this.currentUserId) return;
    try {
      localStorage.setItem(this.storageKey(), JSON.stringify(this.staged()));
    } catch { /* localStorage might be full or disabled — silently degrade */ }
  }

  formatLockDate(iso: string): string {
    try {
      return new Date(iso).toLocaleString('es-EC', {
        day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
      });
    } catch {
      return iso;
    }
  }

  async saveAll() {
    if (this.lockedAt()) return;
    const currentMode = this.mode();
    if (!currentMode) {
      // Sin grupo privado no hay colección (SIMPLE/COMPLETE) donde guardar.
      // El arrastre sigue funcionando como vista previa (persistida local).
      this.toast.error('Únete o crea un grupo privado para guardar tu predicción.');
      return;
    }

    // Validación completa antes de pegarle a la API: detectamos terceros
    // incompletos y grupos con < 4 equipos rankeados, y devolvemos un
    // mensaje único con todo lo que falta.
    const issues: string[] = [];
    const advancingCount = this.staged().advancing.length;
    if (advancingCount !== 8) {
      issues.push(
        `Marca ${advancingCount > 8 ? 'solo ' : ''}${8 - advancingCount > 0 ? (8 - advancingCount) + ' más de los ' : ''}mejores 3eros (tienes ${advancingCount}/8).`,
      );
    }
    const incompleteGroups: string[] = [];
    for (const g of GROUP_LETTERS) {
      const arr = this.staged().groups[g] ?? [];
      if (arr.length !== 4) incompleteGroups.push(g);
    }
    if (incompleteGroups.length > 0) {
      issues.push(
        `Grupo${incompleteGroups.length === 1 ? '' : 's'} sin completar: ${incompleteGroups.join(', ')}.`,
      );
    }
    if (issues.length > 0) {
      const msg = `Te faltan selecciones · ${issues.join(' ')}`;
      this.saveError.set(msg);
      this.toast.error(msg);
      return;
    }

    this.saveError.set(null);
    this.saving.set(true);
    try {
      const state = this.staged();
      // Guardado DIRECTO (awaited), no via sync service: este botón guarda y
      // redirige al bracket, que proyecta leyendo estas filas desde la base.
      // Necesitamos garantizar persistencia ANTES de navegar, así que
      // esperamos los upserts en vez de encolarlos en background.
      const writes: Promise<unknown>[] = [];
      for (const g of GROUP_LETTERS) {
        const arr = state.groups[g] ?? [];
        if (arr.length !== 4) continue;   // skip grupos incompletos
        writes.push(this.api.upsertGroupStandingPick({
          id: this.serverIds.standings[g],
          userId: this.currentUserId,
          tournamentId: TOURNAMENT_ID,
          mode: currentMode,
          groupLetter: g,
          pos1: arr[0]!, pos2: arr[1]!, pos3: arr[2]!, pos4: arr[3]!,
        }));
      }
      writes.push(this.api.upsertBestThirdsPick({
        id: this.serverIds.thirds ?? undefined,
        userId: this.currentUserId,
        tournamentId: TOURNAMENT_ID,
        mode: currentMode,
        advancing: state.advancing,
      }));

      const results = await Promise.all(writes);
      const failed = (results as Array<{ errors?: readonly unknown[] }>)
        .find((r) => Array.isArray(r?.errors) && r.errors.length > 0);
      if (failed) throw new Error(JSON.stringify(failed.errors![0]));

      this.lastSavedAt.set(new Date().toISOString());
      this.persistLocal();
      this.toast.success('Predicción guardada');
      // Redirige al bracket armado desde esta predicción.
      await this.router.navigate(['/picks/bracket']);
    } catch (e) {
      const msg = 'No se pudo guardar la predicción. Intenta de nuevo.';
      this.saveError.set(msg);
      this.toast.error(msg);
      // eslint-disable-next-line no-console
      console.warn('[group-stage-picks] saveAll failed', e);
    } finally {
      this.saving.set(false);
    }
  }
}
