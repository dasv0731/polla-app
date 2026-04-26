import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ApiService } from '../../core/api/api.service';
import { TeamFlagComponent } from '../../shared/ui/team-flag.component';

const TOURNAMENT_ID = 'mundial-2026';

// Slot count per phase order. Order 1 = Grupos (no bracket).
const SLOTS_BY_ORDER: Record<number, number> = {
  2: 16, // Round of 32 — 16 matches
  3: 8,  // Octavos — 8 matches
  4: 4,  // Cuartos — 4 matches
  5: 2,  // Semifinales — 2 matches
  6: 2,  // Final + 3er — 2 matches (final + tercer puesto)
};

interface PhaseInfo { id: string; name: string; multiplier: number; order: number; slots: number; }
interface TeamInfo { name: string; flagCode: string; crestUrl: string | null; }
interface MatchSlot {
  bracketPosition: number;
  match: {
    id: string;
    homeTeamId: string;
    awayTeamId: string;
    kickoffAt: string;
    status: string;
    homeScore?: number | null;
    awayScore?: number | null;
  } | null;
}

@Component({
  standalone: true,
  selector: 'app-admin-bracket',
  imports: [RouterLink, TeamFlagComponent],
  template: `
    <header class="page-header" style="padding: 0 0 var(--space-md);">
      <small>Mundial 2026 · Eliminatorias</small>
      <h1 style="font-family: var(--font-display); font-size: 56px; line-height: 1; text-transform: uppercase;">Llaves</h1>
    </header>

    <p style="color: var(--color-text-muted); margin-bottom: var(--space-lg); max-width: 720px;">
      Cada slot está numerado según su posición en la llave (1..N).
      Click en un slot vacío para crear el partido en la posición correcta.
      Click en un slot con datos para editarlo.
    </p>

    @if (loading()) {
      <p>Cargando llaves…</p>
    } @else if (knockoutPhases().length === 0) {
      <p class="empty-state">
        No se encontraron fases eliminatorias. Verifica que existan al menos 2 fases con multiplicador &gt; 1.
      </p>
    } @else {
      <div class="bracket-admin">
        @for (phase of knockoutPhases(); track phase.id) {
          <div class="bracket-admin__col">
            <h2 class="bracket-admin__head">
              {{ phase.name }}
              <small style="display: block; font-size: var(--fs-xs); color: var(--color-text-muted); font-family: var(--font-primary); letter-spacing: 0.08em; margin-top: 4px;">
                x{{ phase.multiplier }} · {{ phase.slots }} partidos
              </small>
            </h2>

            @for (slot of slotsFor(phase); track slot.bracketPosition) {
              @if (slot.match; as m) {
                <a class="bracket-slot" [routerLink]="['/admin/fixtures', m.id, 'edit']"
                   [queryParams]="{ phaseId: phase.id, bracketPosition: slot.bracketPosition }">
                  <span class="bracket-slot__pos">#{{ slot.bracketPosition }}</span>
                  <div class="bracket-slot__row" [class.bracket-slot__row--winner]="isHomeWinner(m)">
                    <app-team-flag [flagCode]="teamFlag(m.homeTeamId)" [crestUrl]="teamCrest(m.homeTeamId)"
                                   [name]="teamName(m.homeTeamId)" [size]="28" />
                    <span class="bracket-slot__name">{{ teamName(m.homeTeamId) }}</span>
                    <span class="bracket-slot__score">{{ scoreOrDash(m.homeScore) }}</span>
                  </div>
                  <div class="bracket-slot__row" [class.bracket-slot__row--winner]="isAwayWinner(m)">
                    <app-team-flag [flagCode]="teamFlag(m.awayTeamId)" [crestUrl]="teamCrest(m.awayTeamId)"
                                   [name]="teamName(m.awayTeamId)" [size]="28" />
                    <span class="bracket-slot__name">{{ teamName(m.awayTeamId) }}</span>
                    <span class="bracket-slot__score">{{ scoreOrDash(m.awayScore) }}</span>
                  </div>
                  <p class="bracket-slot__meta">
                    {{ formatKickoff(m.kickoffAt) }} · {{ statusLabel(m.status) }}
                  </p>
                </a>
              } @else {
                <a class="bracket-slot bracket-slot--empty"
                   routerLink="/admin/fixtures/new"
                   [queryParams]="{ phaseId: phase.id, bracketPosition: slot.bracketPosition }">
                  <span class="bracket-slot__pos" style="position: static;">#{{ slot.bracketPosition }}</span>
                  &nbsp;· + Crear partido
                </a>
              }
            }
          </div>
        }
      </div>
    }
  `,
})
export class AdminBracketComponent implements OnInit {
  private api = inject(ApiService);

  loading = signal(true);
  phases = signal<PhaseInfo[]>([]);
  matches = signal<NonNullable<MatchSlot['match']>[]>([]);
  matchesByPhase = signal<Map<string, NonNullable<MatchSlot['match']>[]>>(new Map());
  matchesByPhaseAndPos = signal<Map<string, Map<number, NonNullable<MatchSlot['match']>>>>(new Map());

  private teams = signal<Map<string, TeamInfo>>(new Map());

  knockoutPhases = computed(() => this.phases().filter((p) => p.order >= 2).sort((a, b) => a.order - b.order));

  async ngOnInit() {
    try {
      const [phasesRes, teamsRes, matchesRes] = await Promise.all([
        this.api.listPhases(TOURNAMENT_ID),
        this.api.listTeams(TOURNAMENT_ID),
        this.api.listMatches(TOURNAMENT_ID),
      ]);

      this.phases.set(
        (phasesRes.data ?? [])
          .map((p) => ({
            id: p.id,
            name: p.name,
            multiplier: p.multiplier,
            order: p.order,
            slots: SLOTS_BY_ORDER[p.order] ?? 0,
          }))
          .filter((p) => p.slots > 0 || p.order === 1),
      );

      const tm = new Map<string, TeamInfo>();
      for (const t of teamsRes.data ?? []) {
        tm.set(t.slug, { name: t.name, flagCode: t.flagCode, crestUrl: t.crestUrl ?? null });
      }
      this.teams.set(tm);

      const matches = (matchesRes.data ?? []).map((m) => ({
        id: m.id,
        homeTeamId: m.homeTeamId,
        awayTeamId: m.awayTeamId,
        kickoffAt: m.kickoffAt,
        status: m.status ?? 'SCHEDULED',
        homeScore: m.homeScore,
        awayScore: m.awayScore,
        phaseId: m.phaseId,
        bracketPosition: m.bracketPosition,
      }));
      this.matches.set(matches);

      const byPhasePos = new Map<string, Map<number, NonNullable<MatchSlot['match']>>>();
      for (const m of matches) {
        if (m.bracketPosition == null) continue;
        const sub = byPhasePos.get(m.phaseId) ?? new Map<number, NonNullable<MatchSlot['match']>>();
        sub.set(m.bracketPosition, {
          id: m.id, homeTeamId: m.homeTeamId, awayTeamId: m.awayTeamId,
          kickoffAt: m.kickoffAt, status: m.status,
          homeScore: m.homeScore, awayScore: m.awayScore,
        });
        byPhasePos.set(m.phaseId, sub);
      }
      this.matchesByPhaseAndPos.set(byPhasePos);
    } finally {
      this.loading.set(false);
    }
  }

  slotsFor(phase: PhaseInfo): MatchSlot[] {
    const positionMap = this.matchesByPhaseAndPos().get(phase.id) ?? new Map();
    return Array.from({ length: phase.slots }, (_, i) => {
      const position = i + 1;
      return { bracketPosition: position, match: positionMap.get(position) ?? null };
    });
  }

  teamName(slug: string): string { return this.teams().get(slug)?.name ?? slug; }
  teamFlag(slug: string): string { return this.teams().get(slug)?.flagCode ?? ''; }
  teamCrest(slug: string): string | null { return this.teams().get(slug)?.crestUrl ?? null; }

  scoreOrDash(s: number | null | undefined): string {
    return s == null ? '—' : String(s);
  }

  isHomeWinner(m: NonNullable<MatchSlot['match']>): boolean {
    return m.status === 'FINAL' && m.homeScore != null && m.awayScore != null && m.homeScore > m.awayScore;
  }
  isAwayWinner(m: NonNullable<MatchSlot['match']>): boolean {
    return m.status === 'FINAL' && m.homeScore != null && m.awayScore != null && m.awayScore > m.homeScore;
  }

  statusLabel(s: string): string {
    if (s === 'SCHEDULED') return 'Programado';
    if (s === 'LIVE') return 'En vivo';
    if (s === 'FINAL') return 'Final';
    return s;
  }

  formatKickoff(iso: string): string {
    return new Date(iso).toLocaleString('es-EC', {
      timeZone: 'America/Guayaquil',
      day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false,
    });
  }
}
