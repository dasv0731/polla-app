import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { ApiService } from '../../core/api/api.service';
import { ToastService } from '../../core/notifications/toast.service';
import { humanizeError } from '../../core/notifications/domain-errors';

type Step = 1 | 2 | 3;

@Component({
  selector: 'app-onboarding',
  standalone: true,
  imports: [FormsModule, RouterLink],
  template: `
    <div class="onb-shell">
      <header class="onb-top">
        <div class="brand">
          <span class="logo-icon">⚽</span>
          <span class="brand-name">POLLA</span>
        </div>
        <a class="skip-link" (click)="skip()">Saltar</a>
      </header>

      <div class="onb-dots">
        <span class="dot" [class.is-active]="step() === 1" [class.is-done]="step() > 1"></span>
        <span class="dot" [class.is-active]="step() === 2" [class.is-done]="step() > 2"></span>
        <span class="dot" [class.is-active]="step() === 3"></span>
      </div>

      <main class="onb-body">
        <!-- PASO 1 — Bienvenida -->
        @if (step() === 1) {
          <div class="hero-illustration">
            <div class="hero-emoji">⚽</div>
            <div class="hero-glow"></div>
          </div>
          <span class="kicker">PASO 1 DE 3</span>
          <h1 class="onb-title">Bienvenido<br>{{ '@' + (handle() ?? 'jugador') }}</h1>
          <p class="onb-desc">
            Predice el marcador de los <strong>104 partidos</strong> del Mundial 2026.
            Sumas pts por aciertos. Compites con tus panas en grupos privados.
          </p>

          <ul class="feat-list">
            <li><span class="feat-icon">⚽</span> Pronostica todos los partidos del torneo</li>
            <li><span class="feat-icon">👥</span> Crea o únete a grupos privados con código</li>
            <li><span class="feat-icon">🏆</span> Ranking en vivo · global y por grupo</li>
            <li><span class="feat-icon">🎁</span> Comodines de sponsors para potenciar tus picks</li>
          </ul>
        }

        <!-- PASO 2 — Grupo (centro del onboarding) -->
        @if (step() === 2) {
          <div class="hero-illustration">
            <div class="hero-emoji">👥</div>
            <div class="hero-glow"></div>
          </div>
          <span class="kicker">PASO 2 DE 3</span>
          <h1 class="onb-title">Únete a un grupo<br>o crea el tuyo</h1>
          <p class="onb-desc">
            Compite contra tus panas. Cada grupo tiene su propio ranking,
            premios y comodines.
          </p>

          @if (showJoinInput()) {
            <div class="join-input-wrap">
              <label class="kicker-label">CÓDIGO DE INVITACIÓN</label>
              <div class="input-card">
                <input type="text" [(ngModel)]="codeInput" name="code"
                       maxlength="6" placeholder="ABCD23"
                       (input)="codeInput = codeInput.toUpperCase()"
                       autocomplete="off"
                       style="font-family: var(--wf-display); font-size: 22px; letter-spacing: 6px; text-align: center;">
              </div>
              @if (joinError()) { <p class="form-error">{{ joinError() }}</p> }
              <button class="btn-wf btn-primary" type="button"
                      [disabled]="joining() || codeInput.length !== 6"
                      (click)="joinByCode()">
                {{ joining() ? 'Validando…' : 'Unirme con este código' }}
              </button>
              <button class="btn-wf btn-cancel" type="button"
                      (click)="showJoinInput.set(false)">
                ← Cancelar
              </button>
            </div>
          } @else {
            <div class="onb-actions">
              <button class="btn-wf btn-primary" type="button"
                      (click)="showJoinInput.set(true)">
                <span>👥</span> Tengo un código de invitación
              </button>
              <button class="btn-wf btn-secondary" type="button"
                      (click)="goCreateGroup()">
                <span>＋</span> Crear mi grupo
              </button>
              <button class="btn-wf btn-skip" type="button" (click)="step.set(3)">
                Más tarde
              </button>
            </div>
          }
        }

        <!-- PASO 3 — Listo -->
        @if (step() === 3) {
          <div class="hero-illustration">
            <div class="hero-emoji">🏆</div>
            <div class="hero-glow"></div>
          </div>
          <span class="kicker">PASO 3 DE 3</span>
          <h1 class="onb-title">¡Listo para empezar!</h1>
          <p class="onb-desc">
            Todo está configurado. Cuando empiece el Mundial el 11 de junio,
            vas a ver los partidos del día acá. <strong>Mientras tanto:</strong>
          </p>

          <ul class="feat-list">
            <li><span class="feat-icon">📅</span> Predice marcadores de los 72 partidos de fase de grupos</li>
            <li><span class="feat-icon">🌳</span> Arma tu bracket de octavos a final</li>
            <li><span class="feat-icon">⭐</span> Elige campeón, subcampeón y revelación pre-torneo</li>
          </ul>

          <p class="hint" style="margin-top: 18px;">
            Estos picks especiales cierran al kickoff inaugural —
            <strong>11 jun · 14:00</strong> hora Quito.
          </p>
        }
      </main>

      <footer class="onb-foot">
        @if (step() === 1) {
          <span></span>
          <button class="btn-wf btn-ink" type="button" (click)="next()">
            Siguiente →
          </button>
        }
        @if (step() === 2 && !showJoinInput()) {
          <button class="btn-wf btn-ghost" type="button" (click)="back()">
            ‹ Atrás
          </button>
          <button class="btn-wf btn-ink" type="button" (click)="next()">
            Siguiente →
          </button>
        }
        @if (step() === 3) {
          <button class="btn-wf btn-ghost" type="button" (click)="back()">
            ‹ Atrás
          </button>
          <button class="btn-wf btn-primary" type="button" (click)="finish()">
            Empezar a predecir →
          </button>
        }
      </footer>
    </div>
  `,
  styles: [`
    :host { display: block; }

    .onb-shell {
      max-width: 480px;
      margin: 0 auto;
      min-height: 100vh;
      background: var(--wf-paper);
      padding: 24px 22px;
      display: flex;
      flex-direction: column;
    }

    .onb-top {
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    .brand { display: flex; align-items: center; gap: 8px; }
    .logo-icon {
      width: 32px; height: 32px;
      background: var(--wf-green-soft);
      color: var(--wf-green-ink);
      border-radius: 8px;
      display: flex; align-items: center; justify-content: center;
      font-size: 16px;
    }
    .brand-name {
      font-family: var(--wf-display);
      font-size: 18px;
      letter-spacing: 0.08em;
    }
    .skip-link {
      font-size: 12px;
      color: var(--wf-ink-3);
      cursor: pointer;
      text-decoration: none;
    }
    .skip-link:hover { color: var(--wf-ink); }

    .onb-dots {
      display: flex;
      gap: 6px;
      justify-content: center;
      margin: 24px 0 16px;
    }
    .dot {
      width: 7px; height: 7px;
      border-radius: 999px;
      background: var(--wf-line);
      transition: all 200ms;
    }
    .dot.is-active { background: var(--wf-green); width: 22px; }
    .dot.is-done { background: var(--wf-green-ink); }

    .onb-body {
      flex: 1;
      display: flex;
      flex-direction: column;
    }

    .hero-illustration {
      position: relative;
      height: 140px;
      display: flex;
      align-items: center;
      justify-content: center;
      margin-bottom: 18px;
    }
    .hero-emoji {
      font-size: 64px;
      position: relative;
      z-index: 2;
      animation: bounce 2s ease-in-out infinite;
    }
    .hero-glow {
      position: absolute;
      inset: 0;
      background: radial-gradient(circle at center, var(--wf-green-soft) 0%, transparent 60%);
      z-index: 1;
    }
    @keyframes bounce {
      0%, 100% { transform: translateY(0); }
      50% { transform: translateY(-6px); }
    }

    .kicker {
      font-size: 9px;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      font-weight: 700;
      color: var(--wf-green-ink);
    }
    .onb-title {
      font-family: var(--wf-display);
      font-size: 30px;
      letter-spacing: 0.03em;
      line-height: 1.05;
      font-weight: normal;
      margin-top: 6px;
    }
    .onb-desc {
      font-size: 14px;
      color: var(--wf-ink-2);
      line-height: 1.5;
      margin-top: 10px;
    }

    .feat-list {
      list-style: none;
      padding: 0;
      margin: 18px 0 0;
      display: flex;
      flex-direction: column;
      gap: 10px;
    }
    .feat-list li {
      display: flex;
      align-items: center;
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
      display: flex; align-items: center; justify-content: center;
      font-size: 16px;
      flex-shrink: 0;
    }

    .onb-actions {
      display: flex;
      flex-direction: column;
      gap: 10px;
      margin-top: 18px;
    }

    .join-input-wrap {
      margin-top: 18px;
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    .kicker-label {
      font-size: 9px;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      font-weight: 700;
      color: var(--wf-ink-3);
      display: block;
    }
    .input-card {
      background: var(--wf-paper);
      border: 1px solid var(--wf-line);
      border-radius: 10px;
      padding: 12px 14px;
      transition: border-color 100ms;
    }
    .input-card:focus-within { border-color: var(--wf-green); }
    .input-card input {
      border: none;
      outline: none;
      width: 100%;
      font-family: var(--wf-ui);
      color: var(--wf-ink);
      background: transparent;
      text-transform: uppercase;
    }
    .input-card input::placeholder { color: var(--wf-ink-3); }

    .btn-wf {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      width: 100%;
      padding: 14px;
      border-radius: 10px;
      font-size: 14px;
      font-weight: 600;
      cursor: pointer;
      font-family: var(--wf-ui);
      border: 1px solid var(--wf-line);
      background: var(--wf-paper);
      color: var(--wf-ink);
    }
    .btn-wf:disabled { cursor: not-allowed; opacity: 0.6; }
    .btn-primary {
      background: var(--wf-green);
      color: white;
      border-color: var(--wf-green);
    }
    .btn-secondary { /* default look */ }
    .btn-skip {
      border-style: dashed;
      color: var(--wf-ink-3);
    }
    .btn-cancel {
      border: 0;
      background: transparent;
      color: var(--wf-ink-3);
      padding: 8px;
      font-size: 13px;
    }
    .btn-ink {
      background: var(--wf-ink);
      color: white;
      border-color: var(--wf-ink);
    }
    .btn-ghost {
      background: transparent;
      border: 0;
      color: var(--wf-ink-2);
    }
    .btn-ghost:hover { color: var(--wf-ink); }

    .onb-foot {
      margin-top: auto;
      padding-top: 18px;
      display: flex;
      justify-content: space-between;
      gap: 8px;
    }
    .onb-foot .btn-wf {
      width: auto;
      padding: 10px 14px;
      font-size: 13px;
    }

    .hint { font-size: 12px; color: var(--wf-ink-3); line-height: 1.5; }
    .form-error {
      font-size: 12px;
      color: var(--wf-danger, #c33);
      padding: 8px 12px;
      background: rgba(231, 76, 60, 0.08);
      border-radius: 6px;
      border: 1px solid rgba(231, 76, 60, 0.2);
      margin: 0;
    }
  `],
})
export class OnboardingComponent {
  private auth = inject(AuthService);
  private api = inject(ApiService);
  private router = inject(Router);
  private toast = inject(ToastService);

  step = signal<Step>(1);
  showJoinInput = signal(false);
  codeInput = '';
  joining = signal(false);
  joinError = signal<string | null>(null);

  handle = computed(() => this.auth.user()?.handle ?? null);

  next() {
    const cur = this.step();
    if (cur < 3) this.step.set((cur + 1) as Step);
  }

  back() {
    const cur = this.step();
    if (cur > 1) this.step.set((cur - 1) as Step);
  }

  skip() {
    void this.router.navigate(['/picks']);
  }

  goCreateGroup() {
    void this.router.navigate(['/groups/new']);
  }

  async joinByCode() {
    if (!this.codeInput || this.codeInput.length !== 6) return;
    this.joinError.set(null);
    this.joining.set(true);
    try {
      const code = this.codeInput.toUpperCase();
      const res = await this.api.joinGroup(code);
      const groupId = (res as { data?: { id?: string } })?.data?.id;
      this.toast.success('¡Te uniste al grupo!');
      if (groupId) {
        void this.router.navigate(['/groups', groupId]);
      } else {
        void this.router.navigate(['/groups']);
      }
    } catch (e) {
      this.joinError.set(humanizeError(e));
    } finally {
      this.joining.set(false);
    }
  }

  finish() {
    void this.router.navigate(['/picks']);
  }
}
