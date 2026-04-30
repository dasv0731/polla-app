import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ApiService } from '../../core/api/api.service';
import { AuthService } from '../../core/auth/auth.service';
import { UserModesService } from '../../core/user/user-modes.service';
import { ToastService } from '../../core/notifications/toast.service';
import { humanizeError } from '../../core/notifications/domain-errors';
import { TeamFlagComponent } from '../../shared/ui/team-flag.component';

type GameMode = 'SIMPLE' | 'COMPLETE';

const TOURNAMENT_ID = 'mundial-2026';

const TYPES = [
  { key: 'CHAMPION', label: 'Campeón', points: 30 },
  { key: 'RUNNER_UP', label: 'Subcampeón', points: 15 },
  { key: 'DARK_HORSE', label: 'Revelación', points: 10 },
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
  imports: [RouterLink, TeamFlagComponent],
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
        <div class="wf-seg" role="tablist" style="max-width: 320px; margin-top: var(--space-md);">
          @for (m of availableModes(); track m) {
            <button type="button" class="wf-seg__item"
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
        <div class="empty-state">
          <h3>Necesitas un grupo primero</h3>
          <p>
            Crea o únete a un grupo para empezar tus picks especiales.
            <a class="link-green" routerLink="/groups/new">Crear un grupo →</a>
          </p>
        </div>
      } @else {
      <div class="lock-banner">
        <span class="lock-banner__icon">⏰</span>
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
              </div>

              @let selected = picksByType()[t.key];
              @if (selected) {
                <div class="special-pick__current">
                  <app-team-flag [flagCode]="teamFlagFromSlug(selected)" [crestUrl]="teamCrestFromSlug(selected)"
                                 [name]="teamName(selected)" [size]="32" />
                  <span class="special-pick__current-name">{{ teamName(selected) }}</span>
                </div>
              } @else {
                <div class="special-pick__current special-pick__current--empty">
                  Aún no elegiste
                </div>
              }

              <div class="special-pick__teams">
                @for (team of teams(); track team.slug) {
                  <button class="special-pick__team" type="button"
                          [class.is-selected]="picksByType()[t.key] === team.slug"
                          [disabled]="locked() || saving()[t.key]"
                          (click)="setPick(t.key, team.slug)">
                    <app-team-flag [flagCode]="team.flagCode" [crestUrl]="team.crestUrl" [name]="team.name" [size]="28" />
                    <span class="special-pick__team-name">{{ team.name }}</span>
                  </button>
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
})
export class SpecialPicksComponent implements OnInit {
  private api = inject(ApiService);
  private auth = inject(AuthService);
  private userModes = inject(UserModesService);
  private toast = inject(ToastService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);

  types = TYPES;
  teams = signal<TeamItem[]>([]);
  teamMap = signal<Map<string, TeamItem>>(new Map());
  picksByType = signal<Partial<Record<SpecialKey, string>>>({});
  saving = signal<Partial<Record<SpecialKey, boolean>>>({});
  tournamentLockAt = signal<string | null>(null);
  loading = signal(true);
  lastSavedAt = signal<string | null>(null);
  mode = signal<GameMode | null>(null);
  availableModes = computed(() => this.userModes.modes());

  totalPotential = TYPES.reduce((s, t) => s + t.points, 0);

  locked = computed(() => {
    const lock = this.tournamentLockAt();
    return lock ? Date.now() >= Date.parse(lock) : false;
  });

  daysUntilLock = computed(() => {
    const lock = this.tournamentLockAt();
    if (!lock) return 0;
    return Math.max(0, Math.ceil((Date.parse(lock) - Date.now()) / 86_400_000));
  });

  lockDate = computed(() => {
    const lock = this.tournamentLockAt();
    if (!lock) return '—';
    return new Date(lock).toLocaleString('es-EC', {
      timeZone: 'America/Guayaquil',
      day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit',
    });
  });

  async ngOnInit() {
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

  async switchMode(m: GameMode) {
    if (this.mode() === m) return;
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
      const [teamsRes, tour, picks] = await Promise.all([
        this.api.listTeams(TOURNAMENT_ID),
        this.api.getTournament(TOURNAMENT_ID),
        this.api.mySpecialPicks(TOURNAMENT_ID, m),
      ]);

      const list = (teamsRes.data ?? [])
        .map((t) => ({ slug: t.slug, name: t.name, flagCode: t.flagCode, crestUrl: t.crestUrl ?? null }))
        .sort((a, b) => a.name.localeCompare(b.name));
      this.teams.set(list);
      const map = new Map<string, TeamItem>();
      for (const t of list) map.set(t.slug, t);
      this.teamMap.set(map);

      this.tournamentLockAt.set(tour.data?.specialsLockAt ?? null);

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

  flagClassForSlug(slug: string): string {
    const code = this.teamMap().get(slug)?.flagCode;
    return code ? `flag--${code.toLowerCase()}` : 'flag';
  }

  teamFlagFromSlug(slug: string): string {
    return this.teamMap().get(slug)?.flagCode ?? '';
  }
  teamCrestFromSlug(slug: string): string | null {
    return this.teamMap().get(slug)?.crestUrl ?? null;
  }

  flagClass(code: string): string {
    return `flag--${code.toLowerCase()}`;
  }

  async setPick(type: SpecialKey, teamId: string) {
    if (!teamId || this.locked()) return;
    const userId = this.auth.user()?.sub;
    const m = this.mode();
    if (!userId || !m) return;

    this.saving.update((s) => ({ ...s, [type]: true }));
    try {
      await this.api.upsertSpecialPick(userId, type, teamId, TOURNAMENT_ID, m);
      this.picksByType.update((p) => ({ ...p, [type]: teamId }));
      this.lastSavedAt.set(`hace unos segundos`);
      this.toast.success(`${TYPES.find((t) => t.key === type)?.label} actualizado`);
    } catch (e) {
      this.toast.error(humanizeError(e));
    } finally {
      this.saving.update((s) => ({ ...s, [type]: false }));
    }
  }
}
