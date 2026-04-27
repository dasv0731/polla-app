import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { CdkDrag, CdkDragDrop, CdkDropList, CdkDropListGroup, moveItemInArray } from '@angular/cdk/drag-drop';
import { ApiService } from '../../core/api/api.service';
import { AuthService } from '../../core/auth/auth.service';
import { ToastService } from '../../core/notifications/toast.service';
import { humanizeError } from '../../core/notifications/domain-errors';

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
  imports: [CdkDropListGroup, CdkDropList, CdkDrag, RouterLink],
  template: `
    <header class="page-header">
      <small>Predicciones · fase de grupos</small>
      <h1>Tabla final por grupo</h1>

      @if (availableModes().length === 0 && !modesLoading()) {
        <p class="form-card__hint" style="color: var(--color-lost);">
          Necesitas pertenecer a al menos un grupo privado para ingresar tus predicciones.
          <a class="link-green" routerLink="/groups/new">Crea uno →</a>
        </p>
      } @else if (availableModes().length > 1) {
        <div style="display: flex; gap: var(--space-sm); margin-top: var(--space-md); flex-wrap: wrap;">
          @for (m of availableModes(); track m) {
            <button class="btn" type="button"
                    [class.btn--primary]="mode() === m"
                    [class.btn--ghost]="mode() !== m"
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
        <p class="form-card__hint">
          Arrastra los equipos para predecir cómo terminará cada grupo.
          Los <strong>cambios se guardan automáticamente en este navegador</strong>.
          Pulsa <strong>"Guardar en la base"</strong> cuando termines para que cuente.
        </p>
      }
    </header>

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
                  <li cdkDrag class="gs-item" [class.gs-item--3rd]="idx === 2"
                      [cdkDragDisabled]="!!lockedAt()">
                    <span class="gs-item__pos">{{ idx + 1 }}</span>
                    <span class="gs-item__flag fi" [class]="'fi-' + (teamMap().get(slug)?.flagCode || '').toLowerCase()"></span>
                    <span class="gs-item__name">{{ teamMap().get(slug)?.name || slug }}</span>
                    @if (idx === 2) {
                      <span class="gs-item__tag">3°</span>
                    }
                  </li>
                }
              </ol>
            </article>
          }
        </section>

        <!-- Sidebar terceros -->
        <aside class="gs-sidebar">
          <header class="gs-sidebar__head">
            <h2>Mejores 3eros (avanzan 8 de 12)</h2>
            <small>Marca con click los 8 que pasan a octavos.</small>
          </header>

          <ol class="gs-thirds">
            @for (slug of thirdsList(); track slug) {
              @let advancing = isAdvancing(slug);
              <li class="gs-third"
                  [class.gs-third--in]="advancing"
                  [class.gs-third--disabled]="!!lockedAt()"
                  (click)="toggleAdvance(slug)">
                <span class="gs-third__check">{{ advancing ? '✓' : '·' }}</span>
                <span class="gs-third__flag fi" [class]="'fi-' + (teamMap().get(slug)?.flagCode || '').toLowerCase()"></span>
                <span class="gs-third__name">{{ teamMap().get(slug)?.name || slug }}</span>
                <small class="gs-third__group">{{ groupOf(slug) }}</small>
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
                  [disabled]="saving() || !!lockedAt() || staged().advancing.length !== 8"
                  (click)="saveAll()">
            {{ saving() ? 'Guardando…' : 'Guardar en la base' }}
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
      border: var(--border-grey);
      border-radius: var(--radius-md);
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
      font-size: var(--fs-lg);
      line-height: 1;
      text-transform: uppercase;
    }
    .gs-card__head small {
      font-size: var(--fs-xs);
      color: var(--color-text-muted);
      text-transform: uppercase;
      letter-spacing: 0.06em;
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
      grid-template-columns: 24px 24px 1fr auto;
      gap: 8px;
      align-items: center;
      padding: 8px 10px;
      background: var(--color-primary-grey, #f4f4f4);
      border-radius: var(--radius-sm);
      cursor: grab;
      user-select: none;
    }
    .gs-item:active { cursor: grabbing; }
    .gs-item--3rd { background: rgba(255, 200, 0, 0.18); }
    .gs-item__pos {
      font-family: var(--font-display);
      font-size: var(--fs-md);
      text-align: center;
    }
    .gs-item__flag { width: 20px; height: 20px; border-radius: 3px; }
    .gs-item__name {
      font-size: var(--fs-sm);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .gs-item__tag {
      font-size: 10px;
      color: var(--color-text-muted);
      text-transform: uppercase;
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
      grid-template-columns: 20px 24px 1fr 28px;
      gap: 8px;
      align-items: center;
      padding: 6px 10px;
      border-radius: var(--radius-sm);
      cursor: pointer;
      user-select: none;
      background: var(--color-primary-grey, #f4f4f4);
      transition: background 100ms;
    }
    .gs-third:hover { background: rgba(0,0,0,0.06); }
    .gs-third--in {
      background: rgba(0, 200, 100, 0.15);
      outline: 1px solid var(--color-primary-green);
    }
    .gs-third--disabled {
      cursor: not-allowed;
      opacity: 0.6;
    }
    .gs-third__check { text-align: center; font-weight: bold; }
    .gs-third__flag { width: 20px; height: 20px; border-radius: 3px; }
    .gs-third__name { font-size: var(--fs-sm); }
    .gs-third__group {
      font-size: var(--fs-xs);
      color: var(--color-text-muted);
      text-transform: uppercase;
    }
  `],
})
export class GroupStagePicksComponent implements OnInit {
  private api = inject(ApiService);
  private auth = inject(AuthService);
  private toast = inject(ToastService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);

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
    if (this.mode()) {
      await this.load();
    } else {
      this.loading.set(false);
    }
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
    const currentMode = this.mode();
    if (!currentMode) return;
    this.loading.set(true);
    try {
      const [teamsRes, matchesRes, standingsRes, thirdsRes] = await Promise.all([
        this.api.listTeams(TOURNAMENT_ID),
        this.api.listMatches(TOURNAMENT_ID),
        this.api.listGroupStandingPicks(this.currentUserId, currentMode),
        this.api.getBestThirdsPick(this.currentUserId, TOURNAMENT_ID, currentMode),
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

      // Cargar de DB las picks existentes
      const dbState: StagedState = { groups: {}, advancing: [] };
      for (const p of standingsRes.data ?? []) {
        if (!p.groupLetter) continue;
        dbState.groups[p.groupLetter] = [p.pos1, p.pos2, p.pos3, p.pos4];
        this.serverIds.standings[p.groupLetter] = p.id;
      }
      const thirdsRow = (thirdsRes.data ?? [])[0];
      if (thirdsRow) {
        dbState.advancing = (thirdsRow.advancing ?? []).filter((s: string | null): s is string => !!s);
        this.serverIds.thirds = thirdsRow.id;
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
      const lsRaw = localStorage.getItem(STORAGE_KEY(this.currentUserId, currentMode));
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

  private persistLocal() {
    const m = this.mode();
    if (!this.currentUserId || !m) return;
    try {
      localStorage.setItem(STORAGE_KEY(this.currentUserId, m), JSON.stringify(this.staged()));
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
    if (!currentMode) return;
    if (this.staged().advancing.length !== 8) {
      this.saveError.set('Debes marcar exactamente 8 terceros que avanzan');
      return;
    }
    this.saveError.set(null);
    this.saving.set(true);
    let errored = 0;
    try {
      const state = this.staged();
      // Standings: 1 row por grupo
      for (const g of GROUP_LETTERS) {
        const arr = state.groups[g] ?? [];
        if (arr.length !== 4) {
          // Skip grupos incompletos (probablemente seed parcial); el user
          // puede no querer guardar predicciones de un grupo no completo.
          continue;
        }
        try {
          const res = await this.api.upsertGroupStandingPick({
            id: this.serverIds.standings[g],
            userId: this.currentUserId,
            tournamentId: TOURNAMENT_ID,
            mode: currentMode,
            groupLetter: g,
            pos1: arr[0]!, pos2: arr[1]!, pos3: arr[2]!, pos4: arr[3]!,
          });
          if (res?.errors && res.errors.length > 0) {
            // eslint-disable-next-line no-console
            console.error(`[upsertGroupStandingPick ${g}] errors:`, res.errors);
            errored++;
          } else if (res?.data?.id) {
            this.serverIds.standings[g] = res.data.id;
          }
        } catch (e) {
          // eslint-disable-next-line no-console
          console.error(`[upsertGroupStandingPick ${g}] threw:`, e);
          errored++;
        }
      }
      // Best thirds
      try {
        const res = await this.api.upsertBestThirdsPick({
          id: this.serverIds.thirds ?? undefined,
          userId: this.currentUserId,
          tournamentId: TOURNAMENT_ID,
          mode: currentMode,
          advancing: state.advancing,
        });
        if (res?.errors && res.errors.length > 0) {
          // eslint-disable-next-line no-console
          console.error('[upsertBestThirdsPick] errors:', res.errors);
          errored++;
        } else if (res?.data?.id) {
          this.serverIds.thirds = res.data.id;
        }
      } catch (e) {
        // eslint-disable-next-line no-console
        console.error('[upsertBestThirdsPick] threw:', e);
        errored++;
      }

      if (errored > 0) {
        this.saveError.set(`${errored} fila${errored === 1 ? '' : 's'} fallaron — revisa la consola`);
        this.toast.error(`Algunas predicciones no se guardaron (${errored})`);
      } else {
        this.lastSavedAt.set(new Date().toISOString());
        this.toast.success('Predicciones guardadas');
      }
    } catch (e) {
      this.saveError.set(humanizeError(e));
    } finally {
      this.saving.set(false);
    }
  }
}
