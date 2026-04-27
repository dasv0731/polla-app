import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ApiService } from '../../core/api/api.service';
import { AuthService } from '../../core/auth/auth.service';
import { UserModesService } from '../../core/user/user-modes.service';
import { ToastService } from '../../core/notifications/toast.service';
import { humanizeError } from '../../core/notifications/domain-errors';

type GameMode = 'SIMPLE' | 'COMPLETE';
type Round = 'octavos' | 'cuartos' | 'semis' | 'final' | 'champion';

interface RoundDef { key: Round; label: string; capacity: number; pointsPerTeam: number; }

const ROUNDS: RoundDef[] = [
  { key: 'octavos',  label: 'Octavos (R16)',  capacity: 16, pointsPerTeam: 3 },
  { key: 'cuartos',  label: 'Cuartos',        capacity: 8,  pointsPerTeam: 6 },
  { key: 'semis',    label: 'Semifinales',    capacity: 4,  pointsPerTeam: 8 },
  { key: 'final',    label: 'Final',          capacity: 2,  pointsPerTeam: 10 },
  { key: 'champion', label: 'Campeón',        capacity: 1,  pointsPerTeam: 15 },
];

const TOURNAMENT_ID = 'mundial-2026';
const STORAGE_KEY = (userId: string, mode: GameMode) => `polla-bracket-picks-${mode}-${userId}`;

interface TeamLite { slug: string; name: string; flagCode: string; }

interface StagedBracket {
  octavos: string[];
  cuartos: string[];
  semis: string[];
  final: string[];
  champion: string;
}

const EMPTY_BRACKET: StagedBracket = {
  octavos: [], cuartos: [], semis: [], final: [], champion: '',
};

@Component({
  standalone: true,
  selector: 'app-bracket-picks',
  imports: [RouterLink],
  template: `
    <header class="page-header">
      <small>Predicciones · llaves eliminatorias</small>
      <h1>Bracket</h1>

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
        </p>
      }

      @if (mode()) {
        <p class="form-card__hint">
          Click un equipo del pool para añadirlo a la ronda activa. Click un equipo en la ronda
          para removerlo. Doble contabilidad: un equipo correctamente puesto desde octavos a
          campeón suma <strong>3+6+8+10+15 = 42 pts</strong>.
        </p>
      }
    </header>

    @if (loading()) {
      <p style="padding: var(--space-2xl); text-align: center;">Cargando…</p>
    } @else if (mode()) {
      <div class="bp-layout">
        <!-- Pool: 48 selecciones agrupadas por grupo -->
        <aside class="bp-pool">
          <h2>Selecciones</h2>
          <p class="form-card__hint">{{ teams().length }} equipos disponibles</p>
          <div class="bp-pool__grid">
            @for (t of teams(); track t.slug) {
              <button class="bp-team" type="button"
                      [class.bp-team--in]="isInActiveRound(t.slug)"
                      (click)="toggleInActive(t.slug)">
                <span class="bp-team__flag fi" [class]="'fi-' + t.flagCode.toLowerCase()"></span>
                <span class="bp-team__name">{{ t.name }}</span>
              </button>
            }
          </div>
        </aside>

        <!-- Rondas -->
        <section class="bp-rounds">
          @for (r of ROUNDS; track r.key) {
            <article class="bp-round" [class.bp-round--active]="activeRound() === r.key">
              <header class="bp-round__head" (click)="setActive(r.key)">
                <h2>{{ r.label }}</h2>
                <small>
                  {{ countOf(r.key) }} / {{ r.capacity }}
                  · {{ r.pointsPerTeam }} pts c/u
                </small>
              </header>
              <ul class="bp-round__list">
                @for (slug of slugsOf(r.key); track slug) {
                  <li class="bp-slot bp-slot--filled" (click)="removeFromRound(r.key, slug)">
                    <span class="bp-team__flag fi" [class]="'fi-' + (teamMap().get(slug)?.flagCode || '').toLowerCase()"></span>
                    <span class="bp-team__name">{{ teamMap().get(slug)?.name || slug }}</span>
                    <span class="bp-slot__remove">×</span>
                  </li>
                }
                @for (i of fillerSlots(r); track i) {
                  <li class="bp-slot bp-slot--empty">—</li>
                }
              </ul>
            </article>
          }

          @if (saveError()) {
            <p class="form-card__hint" style="color: var(--color-lost);">{{ saveError() }}</p>
          }

          <button class="btn btn--primary" type="button"
                  style="margin-top: var(--space-md); width: 100%;"
                  [disabled]="saving() || !isComplete()"
                  (click)="saveAll()">
            {{ saving() ? 'Guardando…' : 'Guardar en la base' }}
          </button>

          @if (!isComplete()) {
            <p class="form-card__hint" style="margin-top: var(--space-sm); text-align: center;">
              Llena las {{ ROUNDS.length }} rondas para habilitar el guardado.
            </p>
          }

          @if (lastSavedAt()) {
            <p class="form-card__hint" style="margin-top: var(--space-sm); text-align: center;">
              Último guardado: {{ formatDate(lastSavedAt()!) }}
            </p>
          }
        </section>
      </div>
    }
  `,
  styles: [`
    .bp-layout {
      display: grid;
      grid-template-columns: 320px 1fr;
      gap: var(--space-xl);
      padding: 0 var(--section-x-mobile, var(--space-md));
    }
    @media (max-width: 991px) {
      .bp-layout { grid-template-columns: 1fr; }
    }

    /* Pool */
    .bp-pool {
      background: var(--color-primary-white);
      border: var(--border-grey);
      border-radius: var(--radius-md);
      padding: var(--space-md);
      align-self: start;
      position: sticky;
      top: var(--space-md);
      max-height: calc(100vh - 80px);
      overflow-y: auto;
    }
    .bp-pool h2 {
      font-family: var(--font-display);
      font-size: var(--fs-md);
      text-transform: uppercase;
      line-height: 1;
    }
    .bp-pool__grid {
      display: grid;
      gap: 4px;
      margin-top: var(--space-sm);
    }
    .bp-team {
      display: grid;
      grid-template-columns: 24px 1fr;
      align-items: center;
      gap: 8px;
      padding: 6px 10px;
      background: var(--color-primary-grey, #f4f4f4);
      border: 1px solid transparent;
      border-radius: var(--radius-sm);
      cursor: pointer;
      font: inherit;
      text-align: left;
      transition: background 100ms;
    }
    .bp-team:hover { background: rgba(0,0,0,0.06); }
    .bp-team--in {
      background: rgba(0, 200, 100, 0.18);
      border-color: var(--color-primary-green);
      font-weight: 600;
    }
    .bp-team__flag { width: 20px; height: 20px; border-radius: 3px; }
    .bp-team__name { font-size: var(--fs-sm); }

    /* Rounds */
    .bp-rounds { display: grid; gap: var(--space-md); }
    .bp-round {
      background: var(--color-primary-white);
      border: var(--border-grey);
      border-radius: var(--radius-md);
      padding: var(--space-md);
    }
    .bp-round--active { outline: 2px solid var(--color-primary-green); }
    .bp-round__head {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      cursor: pointer;
      padding-bottom: var(--space-sm);
    }
    .bp-round__head h2 {
      font-family: var(--font-display);
      font-size: var(--fs-md);
      text-transform: uppercase;
      line-height: 1;
    }
    .bp-round__list {
      list-style: none;
      padding: 0;
      margin: 0;
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
      gap: 4px;
    }
    .bp-slot {
      display: grid;
      grid-template-columns: 24px 1fr 16px;
      align-items: center;
      gap: 8px;
      padding: 6px 10px;
      border-radius: var(--radius-sm);
      font-size: var(--fs-sm);
    }
    .bp-slot--filled {
      background: rgba(0, 200, 100, 0.12);
      cursor: pointer;
    }
    .bp-slot--filled:hover { background: rgba(0,0,0,0.06); }
    .bp-slot--empty {
      background: var(--color-primary-grey, #f4f4f4);
      color: var(--color-text-muted);
      grid-template-columns: 1fr;
      text-align: center;
    }
    .bp-slot__remove { color: var(--color-lost); font-weight: bold; }
  `],
})
export class BracketPicksComponent implements OnInit {
  private api = inject(ApiService);
  private auth = inject(AuthService);
  private userModes = inject(UserModesService);
  private toast = inject(ToastService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);

  ROUNDS = ROUNDS;

  loading = signal(true);
  modesLoading = signal(true);
  saving = signal(false);
  saveError = signal<string | null>(null);
  lastSavedAt = signal<string | null>(null);

  availableModes = computed(() => this.userModes.modes());
  mode = signal<GameMode | null>(null);
  activeRound = signal<Round>('octavos');

  teams = signal<TeamLite[]>([]);
  teamMap = signal<Map<string, TeamLite>>(new Map());

  staged = signal<StagedBracket>({ ...EMPTY_BRACKET });

  private serverId: string | null = null;
  private currentUserId = '';

  isComplete = computed(() => {
    const s = this.staged();
    return s.octavos.length === 16
      && s.cuartos.length === 8
      && s.semis.length === 4
      && s.final.length === 2
      && !!s.champion;
  });

  async ngOnInit() {
    this.currentUserId = this.auth.user()?.sub ?? '';
    if (!this.currentUserId) {
      this.toast.error('Necesitas estar logueado');
      this.modesLoading.set(false);
      this.loading.set(false);
      return;
    }
    this.modesLoading.set(false);

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
      const [teamsRes, bracketRes] = await Promise.all([
        this.api.listTeams(TOURNAMENT_ID),
        this.api.getBracketPick(this.currentUserId, TOURNAMENT_ID, m),
      ]);

      const list = (teamsRes.data ?? [])
        .map((t) => ({ slug: t.slug, name: t.name, flagCode: t.flagCode }))
        .sort((a, b) => a.name.localeCompare(b.name));
      this.teams.set(list);
      const map = new Map<string, TeamLite>();
      for (const t of list) map.set(t.slug, t);
      this.teamMap.set(map);

      const dbRow = (bracketRes.data ?? [])[0];
      let nextStage: StagedBracket = { ...EMPTY_BRACKET };
      if (dbRow) {
        nextStage = {
          octavos: (dbRow.octavos ?? []).filter((s: string | null): s is string => !!s),
          cuartos: (dbRow.cuartos ?? []).filter((s: string | null): s is string => !!s),
          semis:   (dbRow.semis   ?? []).filter((s: string | null): s is string => !!s),
          final:   (dbRow.final   ?? []).filter((s: string | null): s is string => !!s),
          champion: dbRow.champion ?? '',
        };
        this.serverId = dbRow.id;
      }

      const lsRaw = localStorage.getItem(STORAGE_KEY(this.currentUserId, m));
      if (lsRaw) {
        try { nextStage = JSON.parse(lsRaw) as StagedBracket; } catch { /* corrupt */ }
      }

      this.staged.set(nextStage);
    } finally {
      this.loading.set(false);
    }
  }

  setActive(r: Round) { this.activeRound.set(r); }

  isInActiveRound(slug: string): boolean {
    const r = this.activeRound();
    if (r === 'champion') return this.staged().champion === slug;
    return (this.staged()[r] as string[]).includes(slug);
  }

  toggleInActive(slug: string) {
    const r = this.activeRound();
    const def = ROUNDS.find((x) => x.key === r)!;
    this.staged.update((prev) => {
      const next: StagedBracket = { ...prev };
      if (r === 'champion') {
        next.champion = next.champion === slug ? '' : slug;
      } else {
        const arr = [...(next[r] as string[])];
        const idx = arr.indexOf(slug);
        if (idx >= 0) {
          arr.splice(idx, 1);
        } else if (arr.length < def.capacity) {
          arr.push(slug);
        } else {
          this.toast.error(`Capacidad ${def.label}: ${def.capacity}`);
          return prev;
        }
        (next[r] as string[]) = arr;
      }
      return next;
    });
    this.persistLocal();
  }

  removeFromRound(r: Round, slug: string) {
    this.staged.update((prev) => {
      const next: StagedBracket = { ...prev };
      if (r === 'champion') next.champion = '';
      else (next[r] as string[]) = (next[r] as string[]).filter((s) => s !== slug);
      return next;
    });
    this.persistLocal();
  }

  countOf(r: Round): number {
    const s = this.staged();
    if (r === 'champion') return s.champion ? 1 : 0;
    return (s[r] as string[]).length;
  }

  slugsOf(r: Round): string[] {
    const s = this.staged();
    if (r === 'champion') return s.champion ? [s.champion] : [];
    return s[r] as string[];
  }

  fillerSlots(def: RoundDef): number[] {
    const filled = this.countOf(def.key);
    const empty = Math.max(0, def.capacity - filled);
    return Array.from({ length: empty }, (_, i) => i);
  }

  formatDate(iso: string): string {
    try {
      return new Date(iso).toLocaleString('es-EC', {
        day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
      });
    } catch { return iso; }
  }

  private persistLocal() {
    const m = this.mode();
    if (!this.currentUserId || !m) return;
    try {
      localStorage.setItem(STORAGE_KEY(this.currentUserId, m), JSON.stringify(this.staged()));
    } catch { /* localStorage full or disabled */ }
  }

  async saveAll() {
    if (!this.isComplete()) {
      this.saveError.set('Llena todas las rondas antes de guardar');
      return;
    }
    const m = this.mode();
    if (!m) return;
    this.saveError.set(null);
    this.saving.set(true);
    try {
      const s = this.staged();
      const res = await this.api.upsertBracketPick({
        id: this.serverId ?? undefined,
        userId: this.currentUserId,
        tournamentId: TOURNAMENT_ID,
        mode: m,
        octavos: s.octavos,
        cuartos: s.cuartos,
        semis: s.semis,
        final: s.final,
        champion: s.champion,
      });
      if (res?.errors && res.errors.length > 0) {
        // eslint-disable-next-line no-console
        console.error('[upsertBracketPick] errors:', res.errors);
        this.saveError.set(res.errors[0]!.message ?? 'No se pudo guardar el bracket');
        return;
      }
      if (res?.data?.id) this.serverId = res.data.id;
      this.lastSavedAt.set(new Date().toISOString());
      this.toast.success('Bracket guardado');
    } catch (e) {
      this.saveError.set(humanizeError(e));
    } finally {
      this.saving.set(false);
    }
  }
}
