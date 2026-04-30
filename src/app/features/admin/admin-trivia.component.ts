import { Component, Input, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ApiService } from '../../core/api/api.service';
import { ToastService } from '../../core/notifications/toast.service';
import { humanizeError } from '../../core/notifications/domain-errors';

const TOURNAMENT_ID = 'mundial-2026';

interface TriviaQuestion {
  id: string;
  matchId: string;
  tournamentId: string;
  prompt: string;
  optionA: string; optionB: string; optionC: string; optionD: string;
  correctOption: 'A' | 'B' | 'C' | 'D';
  publishedAt: string;
  timerSeconds: number;
  explanation: string | null;
}

interface MatchInfo {
  id: string;
  homeTeamId: string; awayTeamId: string;
  kickoffAt: string;
}

@Component({
  standalone: true,
  selector: 'app-admin-trivia',
  imports: [FormsModule, RouterLink],
  template: `
    <header class="page-header" style="padding: 0 0 var(--space-md);">
      <small>
        <a [routerLink]="['/admin/fixtures', matchId, 'edit']" style="color: var(--color-primary-green);">
          ← Editar partido
        </a>
      </small>
      <h1 style="font-family: var(--font-display); font-size: 36px; line-height: 1.05; letter-spacing: 0.04em;">
        Trivia
      </h1>
      @if (match()) {
        <p style="margin-top: var(--space-sm); color: var(--color-text-muted);">
          {{ teamName(match()!.homeTeamId) }} vs {{ teamName(match()!.awayTeamId) }}
          · kickoff {{ formatDate(match()!.kickoffAt) }}
        </p>
      }
    </header>

    @if (loading()) {
      <p>Cargando…</p>
    } @else {
      <!-- FORM -->
      <form class="form-card" (ngSubmit)="save()" style="max-width: 100%; margin-bottom: var(--space-xl);">
        <h2 class="form-card__title">{{ editingId() ? 'Editar pregunta' : 'Agregar pregunta' }}</h2>
        <p class="form-card__lead">
          La pregunta aparece automáticamente al user cuando llega su <strong>publishedAt</strong>.
          Tienen <strong>{{ form.timerSeconds }}s</strong> para responder con scoring (1 pt si aciertan).
          Después del cierre + reveal, la respuesta correcta + explicación se muestra como curiosidad.
        </p>

        <div class="form-card__field">
          <label class="form-card__label" for="prompt">Pregunta</label>
          <textarea class="form-card__input" id="prompt" name="prompt" rows="2"
                    [(ngModel)]="form.prompt" required maxlength="280"
                    placeholder="¿Quién marcó el primer gol del partido?"></textarea>
        </div>

        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-md);">
          <div class="form-card__field">
            <label class="form-card__label" for="oa">Opción A</label>
            <input class="form-card__input" id="oa" name="optionA" type="text"
                   [(ngModel)]="form.optionA" required maxlength="120">
          </div>
          <div class="form-card__field">
            <label class="form-card__label" for="ob">Opción B</label>
            <input class="form-card__input" id="ob" name="optionB" type="text"
                   [(ngModel)]="form.optionB" required maxlength="120">
          </div>
          <div class="form-card__field">
            <label class="form-card__label" for="oc">Opción C</label>
            <input class="form-card__input" id="oc" name="optionC" type="text"
                   [(ngModel)]="form.optionC" required maxlength="120">
          </div>
          <div class="form-card__field">
            <label class="form-card__label" for="od">Opción D</label>
            <input class="form-card__input" id="od" name="optionD" type="text"
                   [(ngModel)]="form.optionD" required maxlength="120">
          </div>
        </div>

        <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: var(--space-md);">
          <div class="form-card__field">
            <label class="form-card__label" for="correct">Correcta</label>
            <select class="form-card__select" id="correct" name="correctOption"
                    [(ngModel)]="form.correctOption" required>
              <option value="A">A</option>
              <option value="B">B</option>
              <option value="C">C</option>
              <option value="D">D</option>
            </select>
          </div>
          <div class="form-card__field">
            <label class="form-card__label" for="published">Publicar (Quito)</label>
            <input class="form-card__input" id="published" name="publishedAt" type="datetime-local"
                   [(ngModel)]="publishedLocal" required>
            <span class="form-card__hint">Hora local Ecuador. Aparece automática al user.</span>
          </div>
          <div class="form-card__field">
            <label class="form-card__label" for="timer">Timer (s)</label>
            <input class="form-card__input" id="timer" name="timerSeconds" type="number"
                   min="30" max="600" [(ngModel)]="form.timerSeconds" required>
            <span class="form-card__hint">Default 120 (2 min)</span>
          </div>
        </div>

        <div class="form-card__field">
          <label class="form-card__label" for="explanation">Explicación (post-reveal)</label>
          <textarea class="form-card__input" id="explanation" name="explanation" rows="2"
                    [(ngModel)]="form.explanation" maxlength="400"
                    placeholder="Opcional — se muestra después del cierre cuando se revela la respuesta correcta."></textarea>
        </div>

        @if (error()) {
          <p class="form-card__hint" style="color: var(--color-lost);">{{ error() }}</p>
        }

        <div style="display: flex; gap: var(--space-md); flex-wrap: wrap; margin-top: var(--space-lg);">
          <button class="btn btn--primary" type="submit" [disabled]="saving()">
            {{ saving() ? 'Guardando…' : (editingId() ? 'Actualizar' : '+ Agregar') }}
          </button>
          @if (editingId()) {
            <button class="btn btn--ghost" type="button" (click)="cancelEdit()">Cancelar</button>
          }
        </div>
      </form>

      <!-- LIST -->
      <header style="display: flex; justify-content: space-between; align-items: baseline; flex-wrap: wrap; gap: var(--space-md); margin-bottom: var(--space-md);">
        <h2 style="font-family: var(--font-display); font-size: var(--fs-xl); text-transform: uppercase; line-height: 1;">
          Banco ({{ questions().length }} preguntas)
        </h2>
        @if (questions().length > 0) {
          <button class="btn btn--primary" type="button"
                  [disabled]="scoring()"
                  (click)="runScoreTrivia()">
            {{ scoring() ? 'Calculando…' : '🧮 Calcular puntos de trivia' }}
          </button>
        }
      </header>
      @if (scoringMsg()) {
        <p class="form-card__hint" style="color: var(--color-primary-green); margin-bottom: var(--space-md);">
          {{ scoringMsg() }}
        </p>
      }

      @if (questions().length === 0) {
        <p class="empty-state">Aún no hay preguntas en este partido.</p>
      } @else {
        <div style="display: grid; gap: var(--space-md);">
          @for (q of sortedQuestions(); track q.id) {
            <article class="form-card" style="max-width: 100%;">
              <header style="display: flex; justify-content: space-between; align-items: baseline; flex-wrap: wrap; gap: var(--space-sm); margin-bottom: var(--space-sm);">
                <div>
                  <strong style="font-family: var(--font-display); font-size: var(--fs-lg); text-transform: uppercase; line-height: 1;">
                    {{ q.prompt }}
                  </strong>
                  <small style="display: block; color: var(--color-text-muted); margin-top: 4px;">
                    Sale {{ formatDate(q.publishedAt) }} · timer {{ q.timerSeconds }}s · correcta <strong>{{ q.correctOption }}</strong>
                  </small>
                </div>
                <div style="display: flex; gap: var(--space-sm);">
                  <a class="link-green" (click)="startEdit(q); $event.preventDefault()" style="cursor: pointer;">Editar</a>
                  ·
                  <a class="link-green" style="color: var(--color-lost); cursor: pointer;" (click)="del(q); $event.preventDefault()">Borrar</a>
                </div>
              </header>
              <ul style="list-style: none; padding: 0; margin: 0; display: grid; gap: 4px;">
                @for (opt of options; track opt) {
                  <li style="padding: 6px 10px; border-radius: var(--radius-sm); background: var(--color-primary-grey, #f4f4f4);"
                      [style.background]="q.correctOption === opt ? 'rgba(0, 200, 100, 0.18)' : ''"
                      [style.fontWeight]="q.correctOption === opt ? '600' : ''">
                    <strong>{{ opt }}.</strong> {{ optionText(q, opt) }}
                    @if (q.correctOption === opt) { <span style="color: var(--color-primary-green);"> ✓</span> }
                  </li>
                }
              </ul>
              @if (q.explanation) {
                <p style="margin-top: var(--space-sm); padding: var(--space-sm); background: rgba(0,0,0,0.04); border-radius: var(--radius-sm); font-size: var(--fs-sm); color: var(--color-text-muted);">
                  <strong>Explicación:</strong> {{ q.explanation }}
                </p>
              }
            </article>
          }
        </div>
      }
    }
  `,
})
export class AdminTriviaComponent implements OnInit {
  @Input() matchId!: string;

  private api = inject(ApiService);
  private toast = inject(ToastService);

  options: ('A' | 'B' | 'C' | 'D')[] = ['A', 'B', 'C', 'D'];

  loading = signal(true);
  saving = signal(false);
  scoring = signal(false);
  scoringMsg = signal<string | null>(null);
  error = signal<string | null>(null);
  editingId = signal<string | null>(null);

  match = signal<MatchInfo | null>(null);
  teams = signal<Map<string, string>>(new Map());
  questions = signal<TriviaQuestion[]>([]);

  publishedLocal = '';

  form = {
    prompt: '',
    optionA: '',
    optionB: '',
    optionC: '',
    optionD: '',
    correctOption: 'A' as 'A' | 'B' | 'C' | 'D',
    timerSeconds: 120,
    explanation: '',
  };

  sortedQuestions = computed(() =>
    [...this.questions()].sort((a, b) => a.publishedAt.localeCompare(b.publishedAt)),
  );

  async ngOnInit() {
    await this.load();
  }

  async load() {
    this.loading.set(true);
    try {
      const [mRes, tRes, qRes] = await Promise.all([
        this.api.getMatch(this.matchId),
        this.api.listTeams(TOURNAMENT_ID),
        this.api.listTriviaByMatch(this.matchId),
      ]);

      if (mRes.data) {
        this.match.set({
          id: mRes.data.id,
          homeTeamId: mRes.data.homeTeamId,
          awayTeamId: mRes.data.awayTeamId,
          kickoffAt: mRes.data.kickoffAt,
        });
        // Default publishedAt = kickoff
        this.publishedLocal = isoToLocalInput(mRes.data.kickoffAt);
      }

      const tm = new Map<string, string>();
      for (const t of tRes.data ?? []) tm.set(t.slug, t.name);
      this.teams.set(tm);

      this.questions.set(
        (qRes.data ?? []).map((q): TriviaQuestion => ({
          id: q.id,
          matchId: q.matchId,
          tournamentId: q.tournamentId,
          prompt: q.prompt,
          optionA: q.optionA, optionB: q.optionB, optionC: q.optionC, optionD: q.optionD,
          correctOption: (q.correctOption ?? 'A') as 'A' | 'B' | 'C' | 'D',
          publishedAt: q.publishedAt,
          timerSeconds: q.timerSeconds ?? 120,
          explanation: q.explanation ?? null,
        })),
      );
    } finally {
      this.loading.set(false);
    }
  }

  teamName(slug: string): string { return this.teams().get(slug) ?? slug; }
  optionText(q: TriviaQuestion, opt: 'A' | 'B' | 'C' | 'D'): string {
    return opt === 'A' ? q.optionA : opt === 'B' ? q.optionB : opt === 'C' ? q.optionC : q.optionD;
  }
  formatDate(iso: string): string {
    try {
      return new Date(iso).toLocaleString('es-EC', {
        timeZone: 'America/Guayaquil',
        day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
      });
    } catch { return iso; }
  }

  startEdit(q: TriviaQuestion) {
    this.editingId.set(q.id);
    this.form = {
      prompt: q.prompt,
      optionA: q.optionA, optionB: q.optionB, optionC: q.optionC, optionD: q.optionD,
      correctOption: q.correctOption,
      timerSeconds: q.timerSeconds,
      explanation: q.explanation ?? '',
    };
    this.publishedLocal = isoToLocalInput(q.publishedAt);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  cancelEdit() {
    this.editingId.set(null);
    this.resetForm();
  }

  resetForm() {
    this.form = {
      prompt: '',
      optionA: '', optionB: '', optionC: '', optionD: '',
      correctOption: 'A',
      timerSeconds: 120,
      explanation: '',
    };
    if (this.match()) this.publishedLocal = isoToLocalInput(this.match()!.kickoffAt);
    this.error.set(null);
  }

  async save() {
    if (!this.form.prompt.trim()) {
      this.error.set('Falta la pregunta');
      return;
    }
    this.error.set(null);
    this.saving.set(true);
    try {
      const publishedAt = localInputToIso(this.publishedLocal);
      const payload = {
        prompt: this.form.prompt.trim(),
        optionA: this.form.optionA.trim(),
        optionB: this.form.optionB.trim(),
        optionC: this.form.optionC.trim(),
        optionD: this.form.optionD.trim(),
        correctOption: this.form.correctOption,
        publishedAt,
        timerSeconds: this.form.timerSeconds,
        explanation: this.form.explanation.trim() || null,
      };

      if (this.editingId()) {
        const res = await this.api.updateTriviaQuestion({ id: this.editingId()!, ...payload });
        if (res?.errors && res.errors.length > 0) {
          // eslint-disable-next-line no-console
          console.error('[updateTrivia] errors:', res.errors);
          this.error.set(res.errors[0]!.message ?? 'No se pudo actualizar');
          return;
        }
        this.toast.success('Pregunta actualizada');
      } else {
        const res = await this.api.createTriviaQuestion({
          matchId: this.matchId,
          tournamentId: TOURNAMENT_ID,
          ...payload,
        });
        if (res?.errors && res.errors.length > 0) {
          // eslint-disable-next-line no-console
          console.error('[createTrivia] errors:', res.errors);
          this.error.set(res.errors[0]!.message ?? 'No se pudo crear');
          return;
        }
        this.toast.success('Pregunta agregada');
      }
      this.editingId.set(null);
      this.resetForm();
      void this.load();
    } catch (e) {
      this.error.set(humanizeError(e));
    } finally {
      this.saving.set(false);
    }
  }

  async runScoreTrivia() {
    if (!confirm('¿Calcular puntos de trivia para este partido? Solo usuarios con grupo modo completo que hayan respondido durante la ventana LIVE suman 1 pt por correcta. Idempotente.')) return;
    this.scoring.set(true);
    this.scoringMsg.set(null);
    try {
      const res = await this.api.scoreTrivia(this.matchId);
      if (res?.errors && res.errors.length > 0) {
        // eslint-disable-next-line no-console
        console.error('[scoreTrivia] errors:', res.errors);
        this.toast.error(res.errors[0]?.message ?? 'Error en scoreTrivia');
        return;
      }
      const scored = res?.data?.scored ?? 0;
      const awarded = res?.data?.awarded ?? 0;
      this.scoringMsg.set(`Procesadas ${scored} respuestas · ${awarded} pts otorgados.`);
      this.toast.success('Trivia scoreado');
      void this.load();
    } catch (e) {
      this.toast.error(humanizeError(e));
    } finally {
      this.scoring.set(false);
    }
  }

  async del(q: TriviaQuestion) {
    if (!confirm(`¿Borrar la pregunta "${q.prompt.slice(0, 60)}..."?`)) return;
    try {
      await this.api.deleteTriviaQuestion(q.id);
      this.toast.success('Pregunta borrada');
      void this.load();
    } catch (e) {
      this.toast.error(humanizeError(e));
    }
  }
}

function isoToLocalInput(iso: string): string {
  const d = new Date(iso);
  // Quito = UTC-5
  const local = new Date(d.getTime() - 5 * 3600_000);
  const yyyy = local.getUTCFullYear();
  const mm = String(local.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(local.getUTCDate()).padStart(2, '0');
  const hh = String(local.getUTCHours()).padStart(2, '0');
  const mi = String(local.getUTCMinutes()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}T${hh}:${mi}`;
}

function localInputToIso(local: string): string {
  const [date, time] = local.split('T');
  const [y, m, d] = (date ?? '').split('-').map(Number);
  const [hh, mm] = (time ?? '').split(':').map(Number);
  const utc = new Date(Date.UTC(y!, m! - 1, d!, hh! + 5, mm!));
  return utc.toISOString();
}
