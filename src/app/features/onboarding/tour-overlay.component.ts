import { Component, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { GroupActionsService } from '../../core/groups/group-actions.service';
import { UserModesService } from '../../core/user/user-modes.service';

const STORAGE_KEY = 'polla-tour-completed-v1';

interface TourStep {
  num: number;
  title: string;
  body: string;
  ctas: { label: string; action: 'create-group' | 'join-group' | 'goto-clasificados' | 'goto-picks' | 'next' | 'finish' }[];
}

/**
 * Tour de bienvenida — overlay que aparece la primera vez que el user
 * llega al home (post-onboarding). Guía 3 pasos:
 *   1) Crear o unirse a un grupo
 *   2) Hacer predicción de clasificados (fase de grupos)
 *   3) Hacer picks de marcadores en el cronológico
 *
 * Si el user ya completó el tour (flag en localStorage), no aparece.
 * Skippeable en cualquier paso. Auto-skip si el user ya tiene grupo
 * (asumimos que no necesita el tour).
 */
@Component({
  standalone: true,
  selector: 'app-tour-overlay',
  imports: [RouterLink],
  template: `
    @if (visible()) {
      <div class="tour-overlay" role="dialog" aria-modal="true">
        <button type="button" class="tour-overlay__backdrop"
                (click)="dismiss()" aria-label="Cerrar tour"></button>
        <div class="tour-card">
          <header class="tour-card__head">
            <span class="tour-card__step">PASO {{ currentStep().num }} DE {{ totalSteps }}</span>
            <button type="button" class="tour-card__skip"
                    (click)="dismiss()">Saltar tour</button>
          </header>

          <h2 class="tour-card__title">{{ currentStep().title }}</h2>
          <p class="tour-card__body">{{ currentStep().body }}</p>

          <div class="tour-card__dots">
            @for (s of steps; track s.num) {
              <span class="tour-card__dot"
                    [class.is-active]="s.num === current()"
                    [class.is-done]="s.num < current()"></span>
            }
          </div>

          <div class="tour-card__actions">
            @if (current() > 1) {
              <button type="button" class="btn-wf" (click)="back()">‹ Atrás</button>
            }
            <div class="tour-card__ctas">
              @for (cta of currentStep().ctas; track cta.label) {
                <button type="button"
                        class="btn-wf"
                        [class.btn-wf--primary]="cta === currentStep().ctas[currentStep().ctas.length - 1]"
                        (click)="run(cta.action)">
                  {{ cta.label }}
                </button>
              }
            </div>
          </div>
        </div>
      </div>
    }
  `,
  styles: [`
    :host { display: contents; }

    .tour-overlay {
      position: fixed;
      inset: 0;
      z-index: 100;
      display: flex;
      align-items: flex-end;
      justify-content: center;
      padding: 16px;
    }
    @media (min-width: 720px) {
      .tour-overlay { align-items: center; }
    }
    .tour-overlay__backdrop {
      position: absolute;
      inset: 0;
      background: rgba(0, 0, 0, 0.55);
      border: 0;
      cursor: pointer;
    }
    .tour-card {
      position: relative;
      background: var(--wf-paper);
      border-radius: 14px;
      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.35);
      padding: 22px 22px 18px;
      max-width: 500px;
      width: 100%;
      z-index: 1;
    }
    .tour-card__head {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 14px;
    }
    .tour-card__step {
      font-family: var(--wf-display);
      font-size: 11px;
      letter-spacing: .12em;
      color: var(--wf-green-ink);
      font-weight: 700;
    }
    .tour-card__skip {
      background: transparent;
      border: 0;
      color: var(--wf-ink-3);
      font-size: 12px;
      cursor: pointer;
      text-decoration: underline;
      font-family: inherit;
    }
    .tour-card__title {
      font-family: var(--wf-display);
      font-size: 24px;
      letter-spacing: .04em;
      margin: 0 0 10px;
      line-height: 1.15;
    }
    .tour-card__body {
      font-size: 14px;
      color: var(--wf-ink-2);
      line-height: 1.55;
      margin: 0 0 18px;
    }
    .tour-card__dots {
      display: flex;
      gap: 6px;
      justify-content: center;
      margin-bottom: 14px;
    }
    .tour-card__dot {
      width: 8px;
      height: 8px;
      border-radius: 999px;
      background: var(--wf-line);
      transition: background .2s, width .2s;
    }
    .tour-card__dot.is-active {
      background: var(--wf-green);
      width: 22px;
    }
    .tour-card__dot.is-done {
      background: var(--wf-green-soft);
    }
    .tour-card__actions {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 8px;
      flex-wrap: wrap;
    }
    .tour-card__ctas {
      display: flex;
      gap: 6px;
      margin-left: auto;
      flex-wrap: wrap;
    }
  `],
})
export class TourOverlayComponent {
  private router = inject(Router);
  private groupActions = inject(GroupActionsService);
  private userModes = inject(UserModesService);

  totalSteps = 3;
  current = signal(1);

  steps: TourStep[] = [
    {
      num: 1,
      title: 'Crea o únete a un grupo',
      body: 'Tu polla vive dentro de un grupo: tus panas, tu oficina, tu familia. ' +
            'Crea uno nuevo o usa el código que te pasaron.',
      ctas: [
        { label: 'Tengo un código', action: 'join-group' },
        { label: '＋ Crear grupo', action: 'create-group' },
      ],
    },
    {
      num: 2,
      title: 'Predicción de clasificados',
      body: 'Antes del Mundial: arma cómo crees que terminará cada grupo. ' +
            'Arrastra equipos del 1° al 4° y elige los 8 mejores 3eros.',
      ctas: [
        { label: 'Más tarde', action: 'next' },
        { label: 'Ir a Clasificados →', action: 'goto-clasificados' },
      ],
    },
    {
      num: 3,
      title: 'Marcadores partido a partido',
      body: 'Cuando arranca el torneo: predice marcadores antes de cada kickoff. ' +
            'Auto-guarda mientras tipeas. Editable hasta que el partido empiece.',
      ctas: [
        { label: 'Listo, vamos', action: 'finish' },
      ],
    },
  ];

  currentStep = computed(() => this.steps[this.current() - 1]!);

  /** Visible si: tour no completado AND user no tiene grupo aún (sino
   *  asumimos que ya entendió el flow y no le metemos overlay). */
  visible = computed(() => {
    if (this.dismissed()) return false;
    if (this.completedFromStorage) return false;
    return this.userModes.groups().length === 0;
  });

  private dismissed = signal(false);
  private completedFromStorage = false;

  constructor() {
    try {
      this.completedFromStorage = localStorage.getItem(STORAGE_KEY) === '1';
    } catch {
      /* no-op */
    }
  }

  back() {
    if (this.current() > 1) this.current.update((n) => n - 1);
  }

  run(action: TourStep['ctas'][number]['action']) {
    switch (action) {
      case 'create-group':
        this.groupActions.openCreate();
        this.dismiss();
        break;
      case 'join-group':
        this.groupActions.openJoin();
        this.dismiss();
        break;
      case 'goto-clasificados':
        void this.router.navigate(['/picks/group-stage/predict']);
        this.dismiss();
        break;
      case 'goto-picks':
        void this.router.navigate(['/picks']);
        this.dismiss();
        break;
      case 'next':
        if (this.current() < this.totalSteps) {
          this.current.update((n) => n + 1);
        } else {
          this.dismiss();
        }
        break;
      case 'finish':
        void this.router.navigate(['/picks']);
        this.dismiss();
        break;
    }
  }

  /** Marca como completado y oculta. Persistente en localStorage. */
  dismiss() {
    this.dismissed.set(true);
    try {
      localStorage.setItem(STORAGE_KEY, '1');
    } catch {
      /* no-op */
    }
  }
}
