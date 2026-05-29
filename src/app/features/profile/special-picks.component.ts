import { Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../core/api/api.service';
import { AuthService } from '../../core/auth/auth.service';
import { UserModesService } from '../../core/user/user-modes.service';
import { ToastService } from '../../core/notifications/toast.service';
import { TeamFlagComponent } from '../../shared/ui/team-flag.component';
import { PicksSyncService } from '../../core/sync/picks-sync.service';
import { GroupActionsService } from '../../core/groups/group-actions.service';
import { ConfirmDialogService } from '../../shared/ui/confirm-dialog.service';
import { IconComponent } from '../../shared/ui/icon/icon.component';
import { EmptyBlockComponent } from '../../shared/ui/empty-block/empty-block.component';

type GameMode = 'SIMPLE' | 'COMPLETE';

const TOURNAMENT_ID = 'mundial-2026';

const TYPES = [
  { key: 'CHAMPION', label: 'Campeón', points: 20 },
  { key: 'RUNNER_UP', label: 'Subcampeón', points: 12 },
  { key: 'DARK_HORSE', label: 'Revelación', points: 8 },
] as const;

type SpecialKey = (typeof TYPES)[number]['key'];

interface TeamItem {
  slug: string;
  name: string;
  flagCode: string;
  crestUrl: string | null;
}

@Component({
  standalone: true,
  selector: 'app-special-picks',
  imports: [RouterLink, FormsModule, TeamFlagComponent, IconComponent, EmptyBlockComponent],
  template: `
    <header class="page-header">
      <div class="page-header__title">
        <small>
          <a routerLink="/profile" style="color: var(--color-primary-green);">← Mi perfil</a>
          · {{ totalPotential }} puntos potenciales
        </small>
        <h1>Picks especiales</h1>
      </div>

      @if (availableModes().length > 1) {
        <div class="wf-seg" role="tablist" aria-label="Modo de predicción" style="max-width: 320px; margin-top: var(--space-md);">
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
        <p style="margin-top: var(--space-sm); font-size: var(--fs-sm); color: var(--color-text-muted);">
          Predicción <strong>{{ mode() === 'COMPLETE' ? 'modo completo' : 'modo simple' }}</strong>.
        </p>
      }

      <p style="color: var(--color-text-muted); font-size: var(--fs-sm); margin-top: var(--space-md); max-width: 720px;">
        Eliges 3 selecciones <strong>antes del kickoff del primer partido</strong> del Mundial.
        Una vez que arranque el torneo, no podrás editar.
      </p>
    </header>

    <main class="container-app">
      @if (availableModes().length === 0) {
        <app-empty-block iconName="users"
                         title="Necesitas un grupo primero"
                         sub="Crea o únete a un grupo para empezar tus picks especiales.">
          <button type="button" class="btn-wf btn-wf--primary"
                  (click)="groupActions.openCreate()">Crear un grupo</button>
          <button type="button" class="btn-wf btn-wf--ghost"
                  (click)="groupActions.openJoin()">Unirme con código</button>
        </app-empty-block>
      } @else {
      <div class="lock-banner">
        <span class="lock-banner__icon" aria-hidden="true">
          <app-icon name="clock" size="md" />
        </span>
        <div class="lock-banner__body">
          @if (locked()) {
            <h3>Bloqueados — el torneo ya empezó</h3>
            <p>Las picks especiales se cerraron al kickoff del primer partido.</p>
          } @else {
            <h3>Cierra el {{ lockDate() }}</h3>
            <p>
              Te quedan <strong>{{ daysUntilLock() }}</strong> días para definir tus picks.
              Después del primer partido los selectors se bloquean.
            </p>
          }
        </div>
      </div>

      @if (loading()) {
        <p>Cargando equipos…</p>
      } @else {
        <div class="special-picks">
          @for (t of types; track t.key) {
            <article class="special-pick" [class.special-pick--locked]="locked()">
              <div class="special-pick__header">
                <h3 class="special-pick__type">{{ t.label }}</h3>
                <span class="special-pick__points">{{ t.points }} pts</span>
                @if (saving()[t.key]) {
                  <span class="special-pick__saving" aria-live="polite">
                    <app-icon name="clock" size="sm" /> Guardando…
                  </span>
                }
              </div>

              @let selected = picksByType()[t.key];
              @if (selected) {
                <div class="special-pick__current">
                  <app-team-flag [flagCode]="teamFlagFromSlug(selected)" [crestUrl]="teamCrestFromSlug(selected)"
                                 [name]="teamName(selected)" [size]="32" />
                  <span class="special-pick__current-name">{{ teamName(selected) }}</span>
                  @if (!locked()) {
                    <button type="button" class="special-pick__deselect"
                            [disabled]="saving()[t.key]"
                            (click)="deselect(t.key)"
                            aria-label="Quitar selección">
                      <app-icon name="close" size="sm" /> Quitar
                    </button>
                  }
                </div>
              } @else {
                <div class="special-pick__current special-pick__current--empty">
                  Aún no elegiste
                </div>
              }

              @if (t.key === 'DARK_HORSE') {
                @let dh = picksByType()['DARK_HORSE'];
                @if (dh && (picksByType()['CHAMPION'] === dh || picksByType()['RUNNER_UP'] === dh)) {
                  <p class="special-pick__hint" role="status">
                    <app-icon name="alert" size="sm" /> Ya seleccionado como
                    {{ picksByType()['CHAMPION'] === dh ? 'Campeón' : 'Subcampeón' }}
                    — el bonus de Revelación NO se acumula si coincide.
                  </p>
                }
              }

              <!-- Search input para filtrar 32 equipos (UX gap doc 15) -->
              <label class="special-pick__search">
                <span class="visually-hidden">Buscar equipo en {{ t.label }}</span>
                <app-icon name="search" size="sm" />
                <input type="search"
                       [placeholder]="'Buscar equipo en ' + t.label"
                       [ngModel]="searchTerms()[t.key] ?? ''"
                       (ngModelChange)="setSearchTerm(t.key, $event)">
              </label>

              <div class="special-pick__teams">
                @for (team of filteredTeams(t.key); track team.slug) {
                  @let invalid = !isValidPick(t.key, team.slug);
                  <button class="special-pick__team" type="button"
                          [class.is-selected]="picksByType()[t.key] === team.slug"
                          [class.is-invalid]="invalid"
                          [disabled]="locked() || saving()[t.key] || invalid"
                          [attr.title]="invalid ? 'Ya elegido como ' + invalidReason(t.key, team.slug) : null"
                          [attr.aria-label]="team.name + (invalid ? ' (no disponible: ' + invalidReason(t.key, team.slug) + ')' : '')"
                          (click)="setPick(t.key, team.slug)">
                    <app-team-flag [flagCode]="team.flagCode" [crestUrl]="team.crestUrl" [name]="team.name" [size]="32" />
                    <span class="special-pick__team-name">{{ team.name }}</span>
                  </button>
                }
                @if (filteredTeams(t.key).length === 0) {
                  <p class="special-pick__no-results">
                    Sin coincidencias para "{{ searchTerms()[t.key] }}".
                  </p>
                }
              </div>
            </article>
          }
        </div>

        <div style="text-align: center; margin-top: var(--space-2xl);">
          @if (lastSavedAt()) {
            <p style="color: var(--color-text-muted); font-size: var(--fs-sm); margin-bottom: var(--space-md);">
              Auto-guarda al cambiar la selección.
              <strong style="color: var(--color-primary-green);">Última edición: {{ lastSavedAt() }}</strong>
            </p>
          }
          <a routerLink="/profile" class="btn btn--ghost">Volver a perfil</a>
        </div>
      }
      }
    </main>
  `,
  styles: [`
    :host { display: block; }
    .visually-hidden {
      position: absolute;
      width: 1px;
      height: 1px;
      padding: 0;
      margin: -1px;
      overflow: hidden;
      clip: rect(0,0,0,0);
      white-space: nowrap;
      border: 0;
    }
    .special-pick__saving {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      font-size: var(--fs-xs);
      color: var(--color-text-muted);
      margin-left: var(--space-sm);
    }
    .special-pick__deselect {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      margin-left: auto;
      background: transparent;
      border: 1px solid var(--color-line);
      color: var(--color-text-muted);
      padding: 4px 8px;
      border-radius: 6px;
      cursor: pointer;
      font-size: var(--fs-xs);
    }
    .special-pick__deselect:hover:not(:disabled) {
      border-color: var(--color-danger, #c33);
      color: var(--color-danger, #c33);
    }
    .special-pick__deselect:focus-visible {
      outline: 2px solid var(--color-primary-green);
      outline-offset: 2px;
    }
    .special-pick__hint {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: var(--fs-xs);
      color: var(--color-text-muted);
      background: var(--wf-warn-soft, rgba(255, 200, 0, 0.08));
      padding: 6px 10px;
      border-radius: 8px;
      margin: var(--space-xs) 0;
    }
    .special-pick__search {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 6px 10px;
      border: 1px solid var(--color-line);
      border-radius: 8px;
      margin: var(--space-sm) 0;
      background: var(--color-primary-white);
    }
    .special-pick__search input {
      flex: 1;
      border: 0;
      outline: 0;
      background: transparent;
      font-size: var(--fs-sm);
    }
    .special-pick__search:focus-within {
      border-color: var(--color-primary-green);
      box-shadow: 0 0 0 2px rgba(2, 204, 116, 0.18);
    }
    .special-pick__team.is-invalid {
      opacity: 0.4;
      text-decoration: line-through;
      cursor: not-allowed;
    }
    .special-pick__no-results {
      grid-column: 1 / -1;
      text-align: center;
      color: var(--color-text-muted);
      font-size: var(--fs-sm);
      padding: var(--space-md);
    }
  `],
})
export class SpecialPicksComponent implements OnInit, OnDestroy {
  private api = inject(ApiService);
  private auth = inject(AuthService);
  groupActions = inject(GroupActionsService);
  private userModes = inject(UserModesService);
  private toast = inject(ToastService);
  private sync = inject(PicksSyncService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private confirmDialog = inject(ConfirmDialogService);

  types = TYPES;
  teams = signal<TeamItem[]>([]);
  teamMap = signal<Map<string, TeamItem>>(new Map());
  picksByType = signal<Partial<Record<SpecialKey, string>>>({});
  saving = signal<Partial<Record<SpecialKey, boolean>>>({});
  /** Per-category search terms for the team grid filter. */
  searchTerms = signal<Partial<Record<SpecialKey, string>>>({});
  tournamentLockAt = signal<string | null>(null);
  loading = signal(true);
  lastSavedAt = signal<string | null>(null);
  mode = signal<GameMode | null>(null);
  availableModes = computed(() => this.userModes.modes());

  totalPotential = TYPES.reduce((s, t) => s + t.points, 0);

  /** Tick reactivo cada 5s para que `locked` re-evalúe sin necesidad
   *  de refresh cuando llega la hora del primer kickoff con la pantalla
   *  abierta. */
  private nowTick = signal(Date.now());
  private tickTimer: ReturnType<typeof setInterval> | undefined;

  locked = computed(() => {
    const lock = this.tournamentLockAt();
    return lock ? this.nowTick() >= Date.parse(lock) : false;
  });

  daysUntilLock = computed(() => {
    const lock = this.tournamentLockAt();
    if (!lock) return 0;
    return Math.max(0, Math.ceil((Date.parse(lock) - this.nowTick()) / 86_400_000));
  });

  lockDate = computed(() => {
    const lock = this.tournamentLockAt();
    if (!lock) return '—';
    return new Date(lock).toLocaleString('es-EC', {
      timeZone: 'America/Guayaquil',
      day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit',
    });
  });

  /** True iff the user has at least one pick set (used for mode-switch warning). */
  hasPicks = computed(() => Object.keys(this.picksByType()).length > 0);

  async ngOnInit() {
    this.tickTimer = setInterval(() => this.nowTick.set(Date.now()), 5000);

    const userId = this.auth.user()?.sub;
    if (!userId) {
      this.loading.set(false);
      return;
    }
    // Resolver modo: ?mode=... > primero disponible (COMPLETE preferido)
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
  }

  ngOnDestroy() {
    if (this.tickTimer) clearInterval(this.tickTimer);
  }

  async switchMode(m: GameMode) {
    if (this.mode() === m) return;
    // Warning when picks exist — cambiar de modo no destruye los picks, pero
    // los del modo destino son una colección separada (puede sorprender).
    if (this.hasPicks()) {
      const ok = await this.confirmDialog.ask({
        title: 'Cambiar modo',
        message: 'Tus selecciones actuales NO se aplican al otro modo. Las picks del modo destino se cargan desde su propia colección — las podes recuperar volviendo al modo actual.',
        confirmLabel: 'Cambiar modo',
        cancelLabel: 'Cancelar',
      });
      if (!ok) return;
    }
    this.mode.set(m);
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { mode: m },
      queryParamsHandling: 'merge',
    });
    await this.loadForMode();
  }

  private async loadForMode() {
    const m = this.mode();
    if (!m) return;
    this.loading.set(true);
    try {
      const [teamsRes, matchesRes, picks] = await Promise.all([
        this.api.listTeams(TOURNAMENT_ID),
        this.api.listMatches(TOURNAMENT_ID),
        this.api.mySpecialPicks(TOURNAMENT_ID, m),
      ]);

      const list = (teamsRes.data ?? [])
        .map((t) => ({ slug: t.slug, name: t.name, flagCode: t.flagCode, crestUrl: t.crestUrl ?? null }))
        .sort((a, b) => a.name.localeCompare(b.name));
      this.teams.set(list);
      const map = new Map<string, TeamItem>();
      for (const t of list) map.set(t.slug, t);
      this.teamMap.set(map);

      // Lock al kickoff del primer partido programado del torneo. Antes
      // se usaba tour.data?.specialsLockAt (campo manual), pero ahora
      // se deriva automáticamente de los matches: el lock = min kickoffAt
      // de partidos no FINAL. Si no hay matches scheduled, lock = null
      // (los selectors siguen abiertos).
      const upcoming = (matchesRes.data ?? [])
        .filter((mm) => mm && mm.kickoffAt && mm.status !== 'FINAL')
        .map((mm) => mm!.kickoffAt)
        .sort((a, b) => a.localeCompare(b));
      this.tournamentLockAt.set(upcoming[0] ?? null);

      const pmap: Partial<Record<SpecialKey, string>> = {};
      for (const p of picks.data ?? []) {
        if (p.type && p.teamId) pmap[p.type as SpecialKey] = p.teamId;
      }
      this.picksByType.set(pmap);
    } finally {
      this.loading.set(false);
    }
  }

  teamName(slug: string): string {
    return this.teamMap().get(slug)?.name ?? slug;
  }

  teamFlagFromSlug(slug: string): string {
    return this.teamMap().get(slug)?.flagCode ?? '';
  }
  teamCrestFromSlug(slug: string): string | null {
    return this.teamMap().get(slug)?.crestUrl ?? null;
  }

  /** Filtra teams según el search term de cada categoría. */
  filteredTeams(type: SpecialKey): TeamItem[] {
    const term = (this.searchTerms()[type] ?? '').trim().toLowerCase();
    if (!term) return this.teams();
    return this.teams().filter((t) => t.name.toLowerCase().includes(term));
  }

  setSearchTerm(type: SpecialKey, value: string) {
    this.searchTerms.update((s) => ({ ...s, [type]: value }));
  }

  /**
   * Valida que la pick sea legal antes de permitirla:
   *  - CHAMPION ≠ RUNNER_UP (lógicamente uno gana al otro).
   *  - DARK_HORSE puede coincidir, pero se muestra un hint visual.
   */
  isValidPick(type: SpecialKey, teamId: string): boolean {
    const picks = this.picksByType();
    if (type === 'CHAMPION'  && picks.RUNNER_UP === teamId) return false;
    if (type === 'RUNNER_UP' && picks.CHAMPION === teamId) return false;
    return true;
  }

  invalidReason(type: SpecialKey, teamId: string): string {
    const picks = this.picksByType();
    if (type === 'CHAMPION'  && picks.RUNNER_UP === teamId) return 'Subcampeón';
    if (type === 'RUNNER_UP' && picks.CHAMPION === teamId) return 'Campeón';
    return '';
  }

  setPick(type: SpecialKey, teamId: string) {
    if (!teamId || this.locked()) return;
    if (!this.isValidPick(type, teamId)) return;
    const userId = this.auth.user()?.sub;
    const m = this.mode();
    if (!userId || !m) return;

    // Optimistic UI: el signal local se actualiza al instante. El sync
    // service escribe a localStorage + manda al backend con su debounce
    // global (1500ms). Si falla, retry expo automático.
    //
    // No mostramos toast de "actualizado" — el cambio visual es feedback
    // suficiente y los users reportaron que el toast spam (uno por cada
    // cambio rápido) era molesto. Solo dejamos el saving indicator inline.
    this.picksByType.update((p) => ({ ...p, [type]: teamId }));
    this.saving.update((s) => ({ ...s, [type]: true }));
    this.lastSavedAt.set('justo ahora');
    this.sync.enqueue('special', `${userId}:${type}:${m}`, {
      userId, type, teamId, tournamentId: TOURNAMENT_ID, mode: m,
    });
    // Best-effort: reset saving indicator after debounce window (1.5s sync + buffer).
    setTimeout(() => {
      this.saving.update((s) => ({ ...s, [type]: false }));
    }, 2500);
  }

  /** Permite quitar la selección de una categoría (UX gap doc 15). */
  deselect(type: SpecialKey) {
    if (this.locked()) return;
    const userId = this.auth.user()?.sub;
    const m = this.mode();
    if (!userId || !m) return;
    this.picksByType.update((p) => {
      const next = { ...p };
      delete next[type];
      return next;
    });
    this.saving.update((s) => ({ ...s, [type]: true }));
    this.lastSavedAt.set('justo ahora');
    // El sync service trata teamId vacío como "borrar el slot".
    this.sync.enqueue('special', `${userId}:${type}:${m}`, {
      userId, type, teamId: '', tournamentId: TOURNAMENT_ID, mode: m,
    });
    setTimeout(() => {
      this.saving.update((s) => ({ ...s, [type]: false }));
    }, 2500);
  }
}
