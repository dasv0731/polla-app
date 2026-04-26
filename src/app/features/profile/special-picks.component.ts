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
            <fieldset class="special-picks__card" [disabled]="locked() || saving()[t.key]">
              <legend class="special-picks__legend">{{ t.label }} <span class="special-picks__points">+{{ t.points }} pts</span></legend>
              <select class="form-card__input"
                      [value]="picksByType()[t.key] ?? ''"
                      (change)="setPick(t.key, $any($event.target).value)">
                <option value="">— elegir —</option>
                @for (team of teams(); track team.slug) {
                  <option [value]="team.slug">{{ team.name }}</option>
                }
              </select>
            </fieldset>
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
