import { Component, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { GroupActionsService } from '../../core/groups/group-actions.service';

type Step = 1 | 2 | 3 | 4 | 5;

@Component({
  selector: 'app-onboarding',
  standalone: true,
  imports: [RouterLink],
  template: `
    <div class="onb-shell">
      <div class="onb-card">

        <!-- Top: brand + skip -->
        <div class="onb-top">
          <a routerLink="/picks" class="topbar__brand" style="text-decoration:none;color:inherit;display:flex;align-items:center;gap:8px;">
            <img src="assets/logo-golgana.png" alt="Golgana" style="height:28px;width:auto;">
          </a>
          @if (step() < 5) {
            <a href="#" (click)="onSkip($event)" class="onb-skip">Saltar</a>
          }
        </div>

        <!-- Dots -->
        <div class="dots">
          @for (i of stepIndices; track i) {
            <span class="dots__d" [class.is-active]="step() === i"></span>
          }
        </div>

        <!-- ===== PASO 1: BIENVENIDA ===== -->
        @if (step() === 1) {
          <div class="onb-hero onb-hero--ready">⚽</div>
          <div class="kicker">PASO 1 DE 5</div>
          <h1 class="onb-title">Bienvenido,<br>{{ '@' + (handle() ?? 'jugador') }}</h1>
          <p class="onb-sub">
            El Mundial 2026 está a la vuelta. Te tomará 1 minuto entender cómo
            funciona y configurar tu polla.
          </p>

          <div class="onb-actions">
            <button class="btn-wf btn-wf--block btn-wf--primary" type="button" (click)="next()">
              Empezar →
            </button>
          </div>
        }

        <!-- ===== PASO 2: MODO SIMPLE ===== -->
        @if (step() === 2) {
          <div class="onb-hero onb-hero--simple">📋</div>
          <div class="kicker">PASO 2 DE 5 · MODO 1 DE 2</div>
          <h1 class="onb-title">Modo Simple</h1>
          <p class="onb-sub">
            Predice quién avanza en cada fase. Liviano y rápido,
            sin tener que adivinar marcadores.
          </p>

          <ul class="feat-list">
            <li><span class="feat-icon">📋</span><div><strong>Tabla de grupos</strong><div class="feat-sub">Orden final de cada grupo del Mundial</div></div></li>
            <li><span class="feat-icon">🌳</span><div><strong>Bracket eliminatorio</strong><div class="feat-sub">De octavos a la final</div></div></li>
            <li><span class="feat-icon">⭐</span><div><strong>Picks especiales</strong><div class="feat-sub">Campeón, subcampeón y revelación</div></div></li>
          </ul>

          <div class="onb-note">
            <strong>Importante:</strong> los grupos en modo simple <strong>no entran al ranking global</strong>.
          </div>

          <div class="onb-footer">
            <button class="btn-wf btn-wf--sm" type="button" (click)="back()">‹ Atrás</button>
            <button class="btn-wf btn-wf--sm btn-wf--ink" type="button" (click)="next()">Siguiente →</button>
          </div>
        }

        <!-- ===== PASO 3: MODO COMPLETO ===== -->
        @if (step() === 3) {
          <div class="onb-hero onb-hero--complete">⚽</div>
          <div class="kicker">PASO 3 DE 5 · MODO 2 DE 2</div>
          <h1 class="onb-title">Modo Completo</h1>
          <p class="onb-sub">
            Todo lo del simple, más el marcador exacto de cada partido.
            Más reto, más puntos.
          </p>

          <ul class="feat-list">
            <li><span class="feat-icon">⚽</span><div><strong>Marcadores</strong><div class="feat-sub">Predice el resultado exacto de los 104 partidos</div></div></li>
            <li><span class="feat-icon">🎁</span><div><strong>Comodines</strong><div class="feat-sub">Potencia tus picks con multiplicadores de sponsors</div></div></li>
            <li><span class="feat-icon">🧠</span><div><strong>Trivias</strong><div class="feat-sub">Gana puntos extra contestando preguntas en vivo</div></div></li>
          </ul>

          <div class="onb-note onb-note--good">
            <strong>Sí cuenta</strong> para el ranking global de la app.
          </div>

          <div class="onb-footer">
            <button class="btn-wf btn-wf--sm" type="button" (click)="back()">‹ Atrás</button>
            <button class="btn-wf btn-wf--sm btn-wf--ink" type="button" (click)="next()">Siguiente →</button>
          </div>
        }

        <!-- ===== PASO 4: ÚNETE A UN GRUPO ===== -->
        @if (step() === 4) {
          <div class="onb-hero onb-hero--group">👥</div>
          <div class="kicker">PASO 4 DE 5</div>
          <h1 class="onb-title">Únete a un grupo<br>o crea el tuyo</h1>
          <p class="onb-sub">
            Compite contra tus panas. Cada grupo tiene su propio modo de juego
            (simple o completo), ranking, premios y comodines.
          </p>

          <div class="onb-actions">
            <button class="btn-wf btn-wf--block btn-wf--primary" type="button"
                    (click)="goJoin()">
              <span>👥</span> Tengo un código de invitación
            </button>
            <button class="btn-wf btn-wf--block" type="button"
                    (click)="goCreate()">
              <span>＋</span> Crear mi grupo
            </button>
          </div>

          <div class="onb-footer">
            <button class="btn-wf btn-wf--sm" type="button" (click)="back()">‹ Atrás</button>
          </div>
        }

        <!-- ===== PASO 5: LISTO ===== -->
        @if (step() === 5) {
          <div class="onb-hero onb-hero--ready">🏆</div>
          <div class="kicker">PASO 5 DE 5</div>
          <h1 class="onb-title">¡Estás listo!</h1>
          <p class="onb-sub">
            Vamos a tu primer pick. El Mundial empieza pronto y cada partido
            cuenta para tu ranking.
          </p>

          <div class="onb-actions">
            <button class="btn-wf btn-wf--block btn-wf--primary" type="button" (click)="finish()">
              Empezar a jugar →
            </button>
          </div>

          <div class="onb-footer onb-footer--single">
            <button class="btn-wf btn-wf--sm" type="button" (click)="back()">‹ Atrás</button>
          </div>
        }

      </div>
    </div>
  `,
  styles: [`
    :host { display: block; }

    /* Variantes de hero por paso */
    .onb-hero--simple {
      background: linear-gradient(140deg, #d4a500 0%, #a37e00 100%);
      color: white;
      font-size: 64px;
      border: none;
      border-radius: 12px;
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow: 0 8px 24px rgba(212, 165, 0, 0.20);
    }
    .onb-hero--complete {
      background: linear-gradient(140deg, #1a1a1a 0%, #2a2a2a 100%);
      color: white;
      font-size: 64px;
      border: none;
      border-radius: 12px;
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.18);
    }
    .onb-hero--group {
      background: linear-gradient(140deg, #4a90e2 0%, #2c6ec3 100%);
      color: white;
      font-size: 64px;
      border: none;
      border-radius: 12px;
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow: 0 8px 24px rgba(74, 144, 226, 0.18);
    }

    .feat-list {
      list-style: none;
      padding: 0;
      margin: 18px 0 0;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .feat-list li {
      display: flex;
      align-items: flex-start;
      gap: 12px;
      padding: 10px 12px;
      background: var(--wf-fill);
      border-radius: 10px;
      font-size: 13px;
      line-height: 1.4;
    }
    .feat-icon {
      width: 32px; height: 32px;
      background: var(--wf-paper);
      border-radius: 8px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 16px;
      flex-shrink: 0;
    }
    .feat-sub {
      font-size: 11px;
      color: var(--wf-ink-3);
      margin-top: 2px;
      line-height: 1.4;
    }

    .onb-note {
      margin-top: 14px;
      padding: 10px 12px;
      background: rgba(212, 165, 0, 0.10);
      border: 1px solid rgba(212, 165, 0, 0.3);
      border-radius: 8px;
      font-size: 12px;
      color: #7a5d00;
      line-height: 1.4;
    }
    .onb-note--good {
      background: var(--wf-green-soft);
      border-color: rgba(0, 200, 100, 0.3);
      color: var(--wf-green-ink);
    }

    .auth-error {
      font-size: 12px;
      color: var(--wf-danger);
      padding: 8px 12px;
      background: rgba(195, 51, 51, 0.08);
      border-radius: 6px;
      border: 1px solid rgba(195, 51, 51, 0.2);
      margin: 0;
    }
  `],
})
export class OnboardingComponent {
  private auth = inject(AuthService);
  private router = inject(Router);
  private groupActions = inject(GroupActionsService);

  step = signal<Step>(1);
  readonly stepIndices: Step[] = [1, 2, 3, 4, 5];

  handle = computed(() => this.auth.user()?.handle ?? null);

  next() {
    const cur = this.step();
    if (cur < 5) this.step.set((cur + 1) as Step);
  }

  back() {
    const cur = this.step();
    if (cur > 1) this.step.set((cur - 1) as Step);
  }

  onSkip(event: Event) {
    event.preventDefault();
    void this.router.navigate(['/home']);
  }

  /** Paso 4: el modal de crear/unir grupo vive en `<app-group-actions-modals>`
   *  que se monta en el shell post-auth (NO en /onboarding). Por eso solo
   *  abrir el signal acá no muestra nada. La fix: navegar a /home y abrir
   *  el modal — `GroupActionsService` es providedIn:'root', así que el
   *  signal sobrevive a la navegación y el modal aparece al montar el shell. */
  goCreate() {
    this.groupActions.openCreate();
    void this.router.navigate(['/home']);
  }

  goJoin() {
    this.groupActions.openJoin();
    void this.router.navigate(['/home']);
  }

  finish() {
    void this.router.navigate(['/home']);
  }
}
