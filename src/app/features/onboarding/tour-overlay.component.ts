import { Component, computed, effect, inject, signal } from '@angular/core';
import { Router } from '@angular/router';

const STORAGE_KEY = 'polla-tour-completed-v1';

interface TourStep {
  num: number;
  title: string;
  body: string;
  /** Selector CSS del elemento a resaltar en la página. El overlay
   *  pone un "agujero" sobre ese elemento. null = no spotlight. */
  spotlight?: string | null;
}

/**
 * Tour overlay con spotlight: oscurece toda la pantalla excepto el
 * elemento del paso actual. Solo botón "Siguiente" para avanzar (no
 * hace acciones — solo guía). El user navega manualmente luego.
 *
 * Aparece auto la primera vez que el user llega al home (sin grupos
 * creados todavía Y flag de localStorage no seteado), o cuando se
 * llama a `start()` desde un botón externo (ej. botón "Empezar tour"
 * en el home para users que ya cerraron el tour pero quieren reverlo).
 */
@Component({
  standalone: true,
  selector: 'app-tour-overlay',
  template: `
    @if (visible()) {
      <div class="tour-overlay" role="dialog" aria-modal="true">
        <!-- Backdrop oscuro con clip-path para crear el spotlight.
             Si no hay spotlight, es un backdrop opaco normal. -->
        <div class="tour-overlay__backdrop"
             [style.clip-path]="spotlightClipPath()"
             (click)="dismiss()"></div>

        <!-- Anillo de highlight sobre el elemento target -->
        @if (spotlightRect(); as r) {
          <div class="tour-overlay__ring"
               [style.top.px]="r.top - 6"
               [style.left.px]="r.left - 6"
               [style.width.px]="r.width + 12"
               [style.height.px]="r.height + 12"></div>
        }

        <!-- Card de explicación, posicionada al lado del spotlight -->
        <div class="tour-card"
             [style.top.px]="cardPos().top"
             [style.left.px]="cardPos().left">
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
            } @else {
              <span></span>
            }
            <button type="button" class="btn-wf btn-wf--primary" (click)="next()">
              {{ current() === totalSteps ? 'Listo, terminar' : 'Siguiente →' }}
            </button>
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
      pointer-events: none;
    }
    .tour-overlay__backdrop {
      position: absolute;
      inset: 0;
      background: rgba(0, 0, 0, 0.62);
      cursor: pointer;
      pointer-events: auto;
    }
    .tour-overlay__ring {
      position: absolute;
      border: 3px solid var(--wf-green);
      border-radius: 10px;
      box-shadow: 0 0 0 4px rgba(0, 200, 100, 0.25);
      pointer-events: none;
      transition: top 0.2s, left 0.2s, width 0.2s, height 0.2s;
    }
    .tour-card {
      position: absolute;
      background: var(--wf-paper);
      border-radius: 14px;
      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.45);
      padding: 18px 18px 14px;
      max-width: 380px;
      pointer-events: auto;
      transition: top 0.2s, left 0.2s;
    }
    @media (max-width: 720px) {
      .tour-card {
        left: 16px !important;
        right: 16px;
        max-width: none;
        bottom: 16px;
        top: auto !important;
      }
    }
    .tour-card__head {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 12px;
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
      font-size: 20px;
      letter-spacing: .04em;
      margin: 0 0 8px;
      line-height: 1.2;
    }
    .tour-card__body {
      font-size: 13px;
      color: var(--wf-ink-2);
      line-height: 1.5;
      margin: 0 0 14px;
    }
    .tour-card__dots {
      display: flex;
      gap: 5px;
      justify-content: center;
      margin-bottom: 12px;
    }
    .tour-card__dot {
      width: 7px;
      height: 7px;
      border-radius: 999px;
      background: var(--wf-line);
      transition: background .2s, width .2s;
    }
    .tour-card__dot.is-active {
      background: var(--wf-green);
      width: 20px;
    }
    .tour-card__dot.is-done {
      background: var(--wf-green-soft);
    }
    .tour-card__actions {
      display: flex;
      justify-content: space-between;
      gap: 8px;
    }
  `],
})
export class TourOverlayComponent {
  private router = inject(Router);

  totalSteps = 3;
  current = signal(1);
  private dismissed = signal(false);
  private completedFromStorage = false;
  /** Tick para reposicionar el spotlight cuando hay scroll/resize. */
  private positionTick = signal(0);

  steps: TourStep[] = [
    {
      num: 1,
      title: 'Crea o únete a un grupo',
      body: 'Tu polla vive dentro de un grupo (panas, oficina, familia). ' +
            'Usá los botones del menú lateral o la pantalla de Mis grupos.',
      spotlight: '.app-sidebar__section:nth-of-type(1)',  // Mis grupos section
    },
    {
      num: 2,
      title: 'Predicciones de clasificados',
      body: 'Antes del Mundial: arma cómo crees que terminará cada grupo. ' +
            'Aquí encontrás "Clasificados" y "Llaves".',
      spotlight: '.app-sidebar a[href="/picks/group-stage/predict"]',
    },
    {
      num: 3,
      title: 'Marcadores partido a partido',
      body: 'Cuando arranque el torneo: predice marcadores antes de cada kickoff. ' +
            'Auto-guarda mientras tipeas.',
      spotlight: '.app-topnav a[href="/picks"]',
    },
  ];

  currentStep = computed(() => this.steps[this.current() - 1]!);

  /** Visible si el tour no fue completado/dismissed Y o bien fue
   *  iniciado manualmente (`start()`) o auto al primer ingreso. */
  visible = computed(() => {
    if (this.dismissed()) return false;
    return !this.completedFromStorage || this.manuallyStarted();
  });

  private manuallyStarted = signal(false);

  /** Bounds rect del elemento a resaltar para el paso actual. */
  spotlightRect = computed<DOMRect | null>(() => {
    this.positionTick();   // dependencia para re-evaluar en scroll/resize
    const sel = this.currentStep().spotlight;
    if (!sel) return null;
    const el = document.querySelector(sel);
    if (!el) return null;
    return el.getBoundingClientRect();
  });

  /** Clip-path para que el backdrop tenga un "agujero" donde está el
   *  elemento del spotlight. Si no hay spotlight, full overlay. */
  spotlightClipPath = computed(() => {
    const r = this.spotlightRect();
    if (!r) return 'none';
    // SVG-like even-odd: outer rect minus inner rect
    return `polygon(
      0 0, 100% 0, 100% 100%, 0 100%, 0 0,
      ${r.left}px ${r.top}px,
      ${r.left}px ${r.top + r.height}px,
      ${r.left + r.width}px ${r.top + r.height}px,
      ${r.left + r.width}px ${r.top}px,
      ${r.left}px ${r.top}px
    )`;
  });

  /** Posición de la card explicativa: al lado del spotlight si hay
   *  espacio, sino bottom-right por default. */
  cardPos = computed<{ top: number; left: number }>(() => {
    const r = this.spotlightRect();
    if (!r || typeof window === 'undefined') {
      return { top: window.innerHeight - 280, left: window.innerWidth - 400 };
    }
    const cardWidth = 380;
    const cardHeight = 240;
    // Por default a la derecha del spotlight, alineado top
    let left = r.right + 20;
    let top = r.top;
    // Si no cabe a la derecha → izquierda del spotlight
    if (left + cardWidth > window.innerWidth) {
      left = r.left - cardWidth - 20;
      // Si tampoco cabe a la izquierda → debajo del spotlight
      if (left < 16) {
        left = Math.max(16, Math.min(window.innerWidth - cardWidth - 16, r.left));
        top = r.bottom + 20;
      }
    }
    // Verticalmente: clamp a la viewport
    if (top + cardHeight > window.innerHeight - 16) {
      top = window.innerHeight - cardHeight - 16;
    }
    if (top < 16) top = 16;
    return { top, left };
  });

  constructor() {
    try {
      this.completedFromStorage = localStorage.getItem(STORAGE_KEY) === '1';
    } catch {
      /* no-op */
    }

    // Re-posicionar spotlight en scroll/resize
    if (typeof window !== 'undefined') {
      const tick = () => this.positionTick.update((n) => n + 1);
      window.addEventListener('scroll', tick, { passive: true });
      window.addEventListener('resize', tick);
    }

    // Cuando el step cambia, scroll para que el spotlight target esté
    // visible (si no lo está).
    effect(() => {
      const sel = this.currentStep().spotlight;
      if (!sel || !this.visible()) return;
      const el = document.querySelector(sel) as HTMLElement | null;
      if (!el) return;
      // requestAnimationFrame para esperar que CD termine de renderizar.
      requestAnimationFrame(() => {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      });
    });
  }

  /** Inicia el tour manualmente (botón "Empezar" en home). */
  start() {
    this.manuallyStarted.set(true);
    this.dismissed.set(false);
    this.current.set(1);
  }

  back() {
    if (this.current() > 1) this.current.update((n) => n - 1);
  }

  next() {
    if (this.current() < this.totalSteps) {
      this.current.update((n) => n + 1);
    } else {
      this.dismiss();
    }
  }

  dismiss() {
    this.dismissed.set(true);
    this.manuallyStarted.set(false);
    try {
      localStorage.setItem(STORAGE_KEY, '1');
    } catch {
      /* no-op */
    }
  }
}
