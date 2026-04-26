import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ApiService } from '../../core/api/api.service';
import { AuthService } from '../../core/auth/auth.service';
import { ToastService } from '../../core/notifications/toast.service';
import { humanizeError } from '../../core/notifications/domain-errors';

const TOURNAMENT_ID = 'mundial-2026';

const TYPES = [
  { key: 'CHAMPION', label: 'Campeón', points: 30 },
  { key: 'RUNNER_UP', label: 'Subcampeón', points: 15 },
  { key: 'DARK_HORSE', label: 'Equipo revelación', points: 10 },
] as const;

type SpecialKey = (typeof TYPES)[number]['key'];

interface TeamItem {
  slug: string;
  name: string;
  flagCode: string;
}

@Component({
  standalone: true,
  selector: 'app-special-picks',
  imports: [RouterLink],
  template: `
    <section class="container">
      <a routerLink="/profile" class="back-link">← Volver al perfil</a>
      <h1>Picks especiales</h1>

      @if (locked()) {
        <p class="form-card__hint">Las picks especiales están bloqueadas — el torneo ya empezó.</p>
      } @else if (lockAt()) {
        <p class="form-card__hint">Cierra el {{ lockAt() }}.</p>
      }

      @if (loading()) {
        <p>Cargando equipos…</p>
      } @else {
        <div class="special-picks">
          @for (t of types; track t.key) {
            <article class="special-pick" [class.special-pick--locked]="locked()">
              <header class="special-pick__header">
                <h3 class="special-pick__type">{{ t.label }}</h3>
                <span class="special-pick__points">+{{ t.points }} pts</span>
              </header>

              @let selected = picksByType()[t.key];
              @if (selected) {
                <div class="special-pick__current">
                  <span class="special-pick__current-name">{{ teamName(selected) }}</span>
                </div>
              } @else {
                <div class="special-pick__current special-pick__current--empty">
                  Aún no elegiste
                </div>
              }

              <div class="special-pick__teams">
                @for (team of teams(); track team.slug) {
                  <button class="special-pick__team"
                          [class.is-selected]="picksByType()[t.key] === team.slug"
                          [disabled]="locked() || saving()[t.key]"
                          (click)="setPick(t.key, team.slug)">
                    <span class="special-pick__team-name">{{ team.name }}</span>
                  </button>
                }
              </div>
            </article>
          }
        </div>
      }
    </section>
  `,
})
export class SpecialPicksComponent implements OnInit {
  private api = inject(ApiService);
  private auth = inject(AuthService);
  private toast = inject(ToastService);

  types = TYPES;
  teams = signal<TeamItem[]>([]);
  picksByType = signal<Partial<Record<SpecialKey, string>>>({});
  saving = signal<Partial<Record<SpecialKey, boolean>>>({});
  tournamentLockAt = signal<string | null>(null);
  loading = signal(true);

  locked = computed(() => {
    const lock = this.tournamentLockAt();
    return lock ? Date.now() >= Date.parse(lock) : false;
  });
  lockAt = computed(() => {
    const lock = this.tournamentLockAt();
    if (!lock) return null;
    return new Date(lock).toLocaleString('es-EC', { timeZone: 'America/Guayaquil' });
  });

  async ngOnInit() {
    const userId = this.auth.user()?.sub;
    if (!userId) {
      this.loading.set(false);
      return;
    }
    try {
      const [teamsRes, tour, picks] = await Promise.all([
        this.api.listTeams(TOURNAMENT_ID),
        this.api.getTournament(TOURNAMENT_ID),
        this.api.mySpecialPicks(TOURNAMENT_ID),
      ]);

      this.teams.set(
        (teamsRes.data ?? [])
          .map((t) => ({ slug: t.slug, name: t.name, flagCode: t.flagCode }))
          .sort((a, b) => a.name.localeCompare(b.name)),
      );
      this.tournamentLockAt.set(tour.data?.specialsLockAt ?? null);

      const map: Partial<Record<SpecialKey, string>> = {};
      for (const p of picks.data ?? []) {
        if (p.type && p.teamId) map[p.type as SpecialKey] = p.teamId;
      }
      this.picksByType.set(map);
    } finally {
      this.loading.set(false);
    }
  }

  teamName(slug: string): string {
    return this.teams().find((t) => t.slug === slug)?.name ?? slug;
  }

  async setPick(type: SpecialKey, teamId: string) {
    if (!teamId) return;
    const userId = this.auth.user()?.sub;
    if (!userId) return;

    this.saving.update((s) => ({ ...s, [type]: true }));
    try {
      await this.api.upsertSpecialPick(userId, type, teamId, TOURNAMENT_ID);
      this.picksByType.update((p) => ({ ...p, [type]: teamId }));
      this.toast.success('Pick especial guardado');
    } catch (e) {
      this.toast.error(humanizeError(e));
    } finally {
      this.saving.update((s) => ({ ...s, [type]: false }));
    }
  }
}
