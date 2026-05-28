# Design v3 Re-skin — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reskin pixel-perfect de la app siguiendo el prototype `polla-v3.html`: sidebar negro hover-expand, toast trivia, FAB trivia, right-rail reintroducido con next match + upcoming + news, home rediseñada con KPI strip + picks pendientes block dark + grupos + especiales+ranking + comodines.

**Architecture:** El proyecto YA tiene la paleta base lista (`tokens.css` con `#02CC74` y Bebas Neue + Montserrat). El re-skin se concentra en: ajustar 2 tokens (black ink → `#0A0A0A`, agregar `--color-bg-cream`), re-skin del sidebar a negro con hover-expand, reusar `trivia-popup` (ya tiene FAB) con nuevo styling, crear `trivia-toast` standalone, rewrite del `right-rail` y de la `home`. Sin cambios de backend.

**Tech Stack:** Angular 18 standalone components, signals, jest (`@angular-builders/jest`). Tokens CSS-vars existentes.

**Spec:** `polla-app/docs/superpowers/specs/2026-05-27-design-v3-redesign-design.md`

**Source prototype:** `polla-app/design-input/prueba-gg/project/polla-v3.html` (referencia visual; copiar estilos relevantes).

**Branch:** `feature/design-v3-redesign` en `polla-app`.

---

## File map

### Modify
- `polla-app/src/styles/tokens.css` — `--color-primary-black: #0A0A0A`, agregar `--color-bg-cream`.
- `polla-app/src/styles.css` — body base con cream bg.
- `polla-app/src/app/shared/layout/sidebar.component.ts` — re-skin negro, hover-expand sin toggle, items simplificados, bottom-nav responsive en mobile.
- `polla-app/src/app/shared/layout/shell.component.ts` — agregar toast, mantener fab existente, integrar right-rail re-skin.
- `polla-app/src/app/shared/layout/right-rail.component.ts` — rewrite con 3 bloques (next match, upcoming, news).
- `polla-app/src/app/features/home/home.component.ts` — rewrite con hero compacto + KPI strip + picks pendientes + grupos + row(especiales|ranking) + comodines.
- `polla-app/src/app/features/trivia/trivia-popup.component.ts` — re-skin del FAB (CSS only); modal re-skin.
- `polla-app/src/app/shared/layout/group-actions-modals.component.ts` — re-skin modales create / join.
- `polla-app/src/app/shared/layout/nav.component.ts` — adaptar topbar mobile (bell + avatar).

### Create
- `polla-app/src/app/shared/layout/trivia-toast.component.ts` — banner top consumiendo el signal trivia activa.
- `polla-app/public/assets/news-placeholder.svg` — placeholder simple para news cover cuando no hay imagen real.

### Delete
- `polla-app/src/app/shared/layout/bottom-nav.component.ts` — absorbido por sidebar responsive.

---

## Task 1: Tokens + body base

**Files:**
- Modify: `polla-app/src/styles/tokens.css`
- Modify: `polla-app/src/styles.css`

- [ ] **Step 1: Add `--color-bg-cream` and tweak black to `#0A0A0A`**

In `polla-app/src/styles/tokens.css`:

1a. Change line 10:

```css
  --color-primary-black: #1a1a1a;   /* softened from #000 — wireframe ink */
```

to:

```css
  --color-primary-black: #0A0A0A;   /* design v3 sidebar/dark blocks */
  --color-ink-soft:      #1A1A1A;   /* previous wireframe ink, preserved for text where needed */
```

1b. After the existing color block (around line 24), add the cream bg:

```css
  --color-bg-cream: #F5F4F0;   /* design v3 body background */
  --color-line:     rgba(0, 0, 0, 0.08);   /* design v3 card borders */
```

Don't remove anything else.

- [ ] **Step 2: Update body in `styles.css`**

Read `polla-app/src/styles.css`. Find the body / html base rules. Update the body's `background` to use cream:

```css
body {
  background: var(--color-bg-cream);
  font-family: var(--font-primary);
  color: var(--color-primary-black);
  margin: 0;
}
```

Preserve other body rules already present.

- [ ] **Step 3: Typecheck + build**

```bash
cd polla-app && npx tsc --noEmit -p tsconfig.app.json
cd polla-app && npx ng build --configuration=development 2>&1 | tail -10
```

Expected: 0 errors, clean build.

- [ ] **Step 4: Commit**

```bash
cd 'C:\Users\Marke\Documents\Respaldo\polla mundialista\polla-app' && git add src/styles/tokens.css src/styles.css
cd 'C:\Users\Marke\Documents\Respaldo\polla mundialista\polla-app' && git commit -m "feat(design-v3): tokens — black 0A0A0A + cream bg F5F4F0

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: Sidebar re-skin (black + hover-expand + bottom-nav responsive)

**Files:**
- Modify: `polla-app/src/app/shared/layout/sidebar.component.ts`

This rewrites the sidebar to match the design v3 visual: dark fill (`#0a0a0a`), 64px wide collapsed, expand to 200px on hover (no button toggle anymore), simplified item list, and in mobile (<768px) becomes a horizontal bottom-nav. Replaces `bottom-nav.component.ts` (Task 5 deletes it).

- [ ] **Step 1: Read the current sidebar**

Read `polla-app/src/app/shared/layout/sidebar.component.ts` to confirm its current signals (`isAdmin`, `myGroups`, `topGroups`, `bracketReady`, etc.) and methods (`goCreate`, `goJoin`).

- [ ] **Step 2: Replace the sidebar template + styles**

Replace the file contents with:

```typescript
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { ApiService } from '../../core/api/api.service';
import { AuthService } from '../../core/auth/auth.service';

const TOURNAMENT_ID = 'mundial-2026';

/**
 * Sidebar negro design-v3. Layout vertical fijo a la izquierda en desktop
 * (≥768px): 64px colapsado mostrando solo iconos, 200px al hover. En mobile
 * (<768px) se transforma en bottom-nav horizontal con 5 items + labels chicos
 * (reemplaza al bottom-nav.component.ts que se elimina).
 *
 * Items principales: Inicio · Mis picks · Grupos · Ranking · Mundial 2026
 * (+ Admin si isAdmin). Bottom area: notificaciones (con badge) + avatar/
 * handle. En mobile el bottom area se oculta — bell vive en el topbar mobile.
 */
@Component({
  standalone: true,
  selector: 'app-sidebar',
  imports: [RouterLink, RouterLinkActive],
  template: `
    <aside class="lsb" aria-label="Navegación principal">
      <a class="lsb__logo" routerLink="/home" aria-label="Inicio">
        <img src="assets/logo-golgana.png" alt="">
        <strong>POLLA</strong>
      </a>

      <a routerLink="/home" routerLinkActive="active" [routerLinkActiveOptions]="{exact: true}">
        <span class="lsb__i" aria-hidden="true">🏠</span><span class="lsb__t">Inicio</span>
      </a>
      <a routerLink="/picks" routerLinkActive="active">
        <span class="lsb__i" aria-hidden="true">⚽</span><span class="lsb__t">Mis picks</span>
      </a>
      <a routerLink="/groups" routerLinkActive="active">
        <span class="lsb__i" aria-hidden="true">👥</span><span class="lsb__t">Grupos</span>
      </a>
      <a routerLink="/ranking" routerLinkActive="active">
        <span class="lsb__i" aria-hidden="true">🏆</span><span class="lsb__t">Ranking</span>
      </a>
      <a routerLink="/picks/group-stage/predict" routerLinkActive="active">
        <span class="lsb__i" aria-hidden="true">🌎</span><span class="lsb__t">Mundial 2026</span>
      </a>
      @if (isAdmin()) {
        <a routerLink="/admin" routerLinkActive="active">
          <span class="lsb__i" aria-hidden="true">🛠</span><span class="lsb__t">Admin</span>
        </a>
      }

      <div class="lsb__bottom">
        <a routerLink="/notificaciones" routerLinkActive="active" class="lsb__bell">
          <span class="lsb__i" aria-hidden="true">🔔</span><span class="lsb__t">Notificaciones</span>
        </a>
        <a routerLink="/profile" class="lsb__usr">
          <div class="lsb__av">{{ avatarInitials() }}</div>
          <span class="lsb__t">{{ '@' + (handle() ?? 'jugador') }}</span>
        </a>
      </div>
    </aside>
  `,
  styles: [`
    :host { display: contents; }

    .lsb {
      position: fixed;
      top: 0; left: 0; bottom: 0;
      width: 64px;
      background: #0a0a0a;
      border-right: 1px solid rgba(255,255,255,0.08);
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: 14px 0;
      gap: 6px;
      z-index: 50;
      transition: width 0.2s;
      overflow: hidden;
    }
    .lsb:hover { width: 200px; align-items: stretch; }

    .lsb__logo {
      width: 36px; height: 36px;
      display: grid; place-items: center;
      margin-bottom: 18px;
      flex-shrink: 0;
    }
    .lsb:hover .lsb__logo {
      width: auto; margin-left: 14px;
      justify-content: flex-start;
      display: flex; align-items: center; gap: 10px;
    }
    .lsb__logo img { height: 28px; }
    .lsb__logo strong {
      display: none;
      color: #fff; font-family: var(--font-display);
      font-size: 18px; letter-spacing: 0.04em;
    }
    .lsb:hover .lsb__logo strong { display: block; }

    .lsb a {
      color: rgba(255,255,255,0.7);
      text-decoration: none;
      display: flex; align-items: center; gap: 14px;
      width: 48px; height: 44px;
      justify-content: center;
      border-radius: 8px;
      font-size: 18px;
      transition: all 0.15s;
      flex-shrink: 0;
      white-space: nowrap;
    }
    .lsb:hover a { width: auto; justify-content: flex-start; padding: 0 14px; margin: 0 8px; }
    .lsb__t {
      font-size: 13px; font-weight: 500; letter-spacing: 0.04em;
      display: none;
    }
    .lsb:hover .lsb__t { display: inline; }
    .lsb a:hover, .lsb a.active {
      background: rgba(2,204,116,0.18);
      color: #fff;
    }

    .lsb__bottom {
      margin-top: auto;
      display: flex;
      flex-direction: column;
      gap: 6px;
      align-items: center;
      width: 100%;
    }
    .lsb:hover .lsb__bottom { align-items: stretch; }

    .lsb__bell { position: relative; }

    .lsb__usr {
      display: flex; align-items: center; gap: 10px;
      width: 48px; height: 48px;
      justify-content: center;
      flex-shrink: 0;
    }
    .lsb:hover .lsb__usr { width: auto; justify-content: flex-start; padding: 0 14px; margin: 0 8px 8px; }
    .lsb__av {
      width: 32px; height: 32px;
      border-radius: 50%;
      background: linear-gradient(135deg, #067a4a, #02cc74);
      display: grid; place-items: center;
      color: #fff;
      font-weight: 600;
      font-size: 12px;
      flex-shrink: 0;
    }

    /* MOBILE / TABLET: bottom-nav horizontal */
    @media (max-width: 767px) {
      .lsb {
        top: auto; bottom: 0; left: 0; right: 0;
        width: 100%; height: 60px;
        flex-direction: row;
        padding: 0 calc(env(safe-area-inset-bottom, 0px) / 2) env(safe-area-inset-bottom, 0px);
        border-right: 0;
        border-top: 1px solid rgba(255,255,255,0.08);
        justify-content: space-around;
        align-items: center;
        overflow: visible;
      }
      .lsb:hover { width: 100%; align-items: center; }
      .lsb__logo { display: none; }
      .lsb a {
        width: auto; height: 46px;
        flex-direction: column;
        gap: 2px;
        padding: 6px 10px;
        font-size: 16px;
        margin: 0;
      }
      .lsb:hover a {
        width: auto; justify-content: center;
        padding: 6px 10px; margin: 0;
      }
      .lsb__t {
        display: block;
        font-size: 9px;
        letter-spacing: 0.04em;
        text-transform: uppercase;
      }
      .lsb__bottom { display: none; }
    }
  `],
})
export class SidebarComponent implements OnInit {
  private auth = inject(AuthService);
  private api = inject(ApiService);

  handle = computed(() => this.auth.user()?.handle ?? null);
  avatarInitials = computed(() => {
    const h = this.handle();
    if (!h) return '?';
    return h.slice(0, 2).toUpperCase();
  });
  isAdmin = computed(() => this.auth.user()?.isAdmin === true);

  // bracketReady is needed by other consumers (formerly nav-deferred). Keep the
  // signal here for future use even if the new sidebar doesn't show the link.
  bracketReady = signal(false);

  ngOnInit() {
    void this.checkBracketReady();
  }

  private async checkBracketReady() {
    try {
      const [matchesRes, phasesRes] = await Promise.all([
        this.api.listMatches(TOURNAMENT_ID),
        this.api.listPhases(TOURNAMENT_ID),
      ]);
      const phaseOrderById = new Map<string, number>();
      for (const p of (phasesRes.data ?? [])) {
        if (p?.id) phaseOrderById.set(p.id, p.order ?? 0);
      }
      const hasKo = (matchesRes.data ?? []).some((m) =>
        m && (phaseOrderById.get(m.phaseId) ?? 0) >= 2,
      );
      this.bracketReady.set(hasKo);
    } catch {
      /* no-op */
    }
  }
}
```

- [ ] **Step 3: Verify**

```bash
cd polla-app && npx tsc --noEmit -p tsconfig.app.json
cd polla-app && npx ng build --configuration=development 2>&1 | tail -10
cd polla-app && npx jest --no-coverage
```

Expected: 0 errors / clean / 40/40.

- [ ] **Step 4: Commit**

```bash
cd 'C:\Users\Marke\Documents\Respaldo\polla mundialista\polla-app' && git add src/app/shared/layout/sidebar.component.ts
cd 'C:\Users\Marke\Documents\Respaldo\polla mundialista\polla-app' && git commit -m "feat(design-v3): sidebar black + hover-expand + responsive bottom-nav

Replaces the previous collapse-with-toggle sidebar with the design-v3
visual: black #0a0a0a, 64px → 200px on hover (no click toggle), simplified
items (Inicio · Picks · Grupos · Ranking · Mundial 2026 + Admin if admin),
plus notifications bell and user avatar at the bottom. On <768px the same
component renders as a horizontal bottom-nav with 5 icon+label items —
absorbs the role of the standalone bottom-nav.component (next task deletes it).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: Trivia toast banner

**Files:**
- Create: `polla-app/src/app/shared/layout/trivia-toast.component.ts`

This is a thin component that reads the existing trivia state (from `TriviaModalService` or `trivia-popup` exposed signals) and renders a black banner at the top when there are unanswered active trivia questions.

- [ ] **Step 1: Inspect `TriviaModalService` to find the right signal**

Read `polla-app/src/app/core/trivia/trivia-modal.service.ts`. Find the signal/observable that exposes "there are active questions". Typical candidates: `activeCount`, `hasActive`, or methods. Note the exact name — the component will read it.

If the service only exposes an `open()` method but no state signal, find where `trivia-popup.component.ts` reads from — there's likely a list of unanswered questions held there as a signal. If both options are inaccessible, expose a new computed `hasActive` from the popup as a `@Output()` or move the state into the service. For v1, prefer reading whatever the popup uses, even if it means duplicating logic. Document any duplication.

- [ ] **Step 2: Create the component**

Create `polla-app/src/app/shared/layout/trivia-toast.component.ts`:

```typescript
import { Component, computed, inject } from '@angular/core';
import { TriviaModalService } from '../../core/trivia/trivia-modal.service';

/**
 * Top banner that appears (margin-left 64px on desktop to align with main
 * area beside the black sidebar) when there are unanswered live trivia
 * questions. Click "Responder" opens the trivia modal. Auto-hidden when
 * no active trivia.
 *
 * Reads the live-trivia state from TriviaModalService. If the service
 * doesn't expose a `hasActive` / `pendingCount` signal yet, see Step 1
 * note in the plan and adapt to whatever signal does exist.
 */
@Component({
  standalone: true,
  selector: 'app-trivia-toast',
  template: `
    @if (visible()) {
      <div class="trivia-toast" role="status" aria-live="polite">
        <span class="trivia-toast__dot" aria-hidden="true"></span>
        <span class="trivia-toast__text">
          Nueva trivia disponible · {{ pendingCount() }}
          {{ pendingCount() === 1 ? 'pregunta' : 'preguntas' }} para ganar comodín ·
        </span>
        <a class="trivia-toast__link" (click)="open()">Responder →</a>
      </div>
    }
  `,
  styles: [`
    :host { display: contents; }

    .trivia-toast {
      margin-left: 64px;
      background: #0a0a0a;
      color: #fff;
      border-bottom: 1px solid rgba(2,204,116,0.4);
      padding: 8px 24px;
      text-align: center;
      font-size: 12px;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 10px;
      cursor: default;
    }
    @media (max-width: 767px) {
      .trivia-toast {
        margin-left: 0;
        font-size: 11px;
        padding: 8px 14px;
      }
    }
    .trivia-toast__dot {
      width: 8px; height: 8px;
      border-radius: 50%;
      background: var(--color-primary-green);
      animation: trivia-toast-pulse 1.5s infinite;
    }
    @keyframes trivia-toast-pulse {
      0%, 100% { transform: scale(1); opacity: 1; }
      50%      { transform: scale(1.5); opacity: 0.6; }
    }
    .trivia-toast__link {
      color: var(--color-primary-green);
      font-weight: 600;
      text-decoration: none;
      cursor: pointer;
    }
  `],
})
export class TriviaToastComponent {
  private trivia = inject(TriviaModalService);

  // Replace these with the real signal names found in Step 1.
  // Fallback: hide the toast entirely if the service doesn't expose
  // any active-count signal — better empty than always-on.
  pendingCount = computed<number>(() => {
    const s = this.trivia as unknown as { activeCount?: () => number; pendingCount?: () => number };
    if (typeof s.activeCount === 'function') return s.activeCount();
    if (typeof s.pendingCount === 'function') return s.pendingCount();
    return 0;
  });
  visible = computed(() => this.pendingCount() > 0);

  open() { this.trivia.open(); }
}
```

The defensive `as unknown as { ... }` casts let the component compile even if `TriviaModalService` doesn't expose those signals yet. If both are missing, the toast stays hidden — graceful fallback.

If during Step 1 you found that the signal lives elsewhere (e.g., on `trivia-popup`), adapt the cast or inject the correct source. Document in a comment.

- [ ] **Step 3: Verify**

```bash
cd polla-app && npx tsc --noEmit -p tsconfig.app.json
cd polla-app && npx ng build --configuration=development 2>&1 | tail -10
```

Expected: 0 errors.

- [ ] **Step 4: Commit**

```bash
cd 'C:\Users\Marke\Documents\Respaldo\polla mundialista\polla-app' && git add src/app/shared/layout/trivia-toast.component.ts
cd 'C:\Users\Marke\Documents\Respaldo\polla mundialista\polla-app' && git commit -m "feat(design-v3): trivia toast banner (visible when trivia is active)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: Right-rail rewrite (next match + upcoming + news)

**Files:**
- Modify: `polla-app/src/app/shared/layout/right-rail.component.ts`

The current right-rail was deactivated in a prior task. We reactivate it with the design v3 content: next match card (with countdown + flags + meta + pick), upcoming picks list (4 rows), news (hero card + 3 rows from existing `Article` data).

- [ ] **Step 1: Replace `right-rail.component.ts` content**

Use this implementation:

```typescript
import { Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ApiService } from '../../core/api/api.service';
import { AuthService } from '../../core/auth/auth.service';
import { getUrl } from 'aws-amplify/storage';

const TOURNAMENT_ID = 'mundial-2026';
const NEWS_HUB_URL = 'https://golgana.net/news';

interface NextMatchVm {
  id: string;
  homeName: string;
  awayName: string;
  homeFlag: string;
  awayFlag: string;
  kickoffAt: string;
  venue: string | null;
  phaseLabel: string;
  countdown: { d: string; h: string; m: string; s: string };
  isLive: boolean;
  myPick: { home: number; away: number; winnerName: string | null } | null;
}

interface UpcomingPickRow {
  id: string;
  dateLabel: string;
  matchLabel: string;
  hasPick: boolean;
  pickLabel: string | null;
  countdownLabel: string | null;
}

interface NewsHero {
  id: string;
  title: string;
  externalUrl: string;
  resolvedImageUrl: string | null;
  relativeTime: string;
}

@Component({
  standalone: true,
  selector: 'app-right-rail',
  imports: [RouterLink],
  template: `
    <aside class="side">

      <!-- Next match -->
      @if (nextMatch(); as m) {
        <div class="np">
          <div class="np__bg"></div>
          <div class="np__in">
            <div class="np__top">
              <span class="np__live">{{ m.isLive ? '● EN VIVO' : 'Próximo' }}</span>
              <span class="np__tag">{{ m.phaseLabel }}</span>
            </div>
            <div class="np__hl">El <em>próximo</em> partido</div>
            <div class="np__sub">{{ m.venue ?? 'Sede por confirmar' }}</div>

            @if (!m.isLive) {
              <div class="np__cd">
                <div class="np__cd__c"><div class="np__cd__n">{{ m.countdown.d }}</div><div class="np__cd__l">Días</div></div>
                <div class="np__cd__c"><div class="np__cd__n">{{ m.countdown.h }}</div><div class="np__cd__l">Hrs</div></div>
                <div class="np__cd__c"><div class="np__cd__n">{{ m.countdown.m }}</div><div class="np__cd__l">Min</div></div>
                <div class="np__cd__c"><div class="np__cd__n">{{ m.countdown.s }}</div><div class="np__cd__l">Seg</div></div>
              </div>
            }

            <div class="np__t">
              <div class="np__tm np__tm--home">
                <div class="np__fl">
                  @if (m.homeFlag) { <span class="fi fi-{{ m.homeFlag.toLowerCase() }}"></span> } @else { 🏳️ }
                </div>
                <div class="np__n">{{ m.homeName }}</div>
              </div>
              <div class="np__vs">
                <div class="np__vs__l">VS</div>
              </div>
              <div class="np__tm">
                <div class="np__fl">
                  @if (m.awayFlag) { <span class="fi fi-{{ m.awayFlag.toLowerCase() }}"></span> } @else { 🏳️ }
                </div>
                <div class="np__n">{{ m.awayName }}</div>
              </div>
            </div>

            @if (m.myPick) {
              <div class="np__pk">
                <div>
                  <span class="np__pk__l">Tu pick</span>
                  <strong>{{ m.myPick.home }} – {{ m.myPick.away }}
                    @if (m.myPick.winnerName) { <em>{{ m.myPick.winnerName }}</em> }
                  </strong>
                </div>
                <a class="np__pk__e" [routerLink]="['/picks/match', m.id]">Editar</a>
              </div>
            } @else {
              <a class="np__pk np__pk--cta" [routerLink]="['/picks/match', m.id]">
                <div>
                  <span class="np__pk__l">Sin pick</span>
                  <strong>Hacer pick →</strong>
                </div>
              </a>
            }

            <a class="np__cta" [routerLink]="['/picks/match', m.id]">Ver previa completa →</a>
          </div>
        </div>
      }

      <!-- Upcoming picks -->
      @if (upcoming().length > 0) {
        <div class="up">
          <div class="up__h">
            <span>Siguientes picks</span>
            <a routerLink="/picks">Ver todos →</a>
          </div>
          @for (r of upcoming(); track r.id) {
            <a class="up__r" [routerLink]="['/picks/match', r.id]">
              <div class="up__r__h">
                <span>{{ r.dateLabel }} · {{ r.matchLabel }}</span>
                @if (r.hasPick) {
                  <span class="ok">✓ Pick</span>
                } @else {
                  <span class="pe">⚠ {{ r.countdownLabel }}</span>
                }
              </div>
              <div class="up__r__t" [class.m]="!r.hasPick" [style.color]="r.hasPick ? null : '#dc2626'">
                {{ r.hasPick ? r.pickLabel : 'Pendiente' }}
              </div>
            </a>
          }
        </div>
      }

      <!-- News -->
      @if (newsHero(); as hero) {
        <div class="news">
          <a [href]="hero.externalUrl" target="_blank" rel="noopener noreferrer" class="news__hero">
            @if (hero.resolvedImageUrl) {
              <img [src]="hero.resolvedImageUrl" [alt]="hero.title">
            } @else {
              <img src="assets/news-placeholder.svg" [alt]="hero.title">
            }
            <div class="news__hero__b">
              <div class="news__hero__k">Destacada · {{ hero.relativeTime }}</div>
              <div class="news__hero__t">{{ hero.title }}</div>
            </div>
          </a>
          @if (newsList().length > 0) {
            <div class="news__list">
              @for (a of newsList(); track a.id) {
                <a [href]="a.externalUrl" target="_blank" rel="noopener noreferrer" class="news__row">
                  <div class="news__row__img" [style.backgroundImage]="a.resolvedImageUrl ? 'url(' + a.resolvedImageUrl + ')' : null"></div>
                  <div class="news__row__b">
                    <div class="news__row__k">{{ a.relativeTime }}</div>
                    <div class="news__row__t">{{ a.title }}</div>
                  </div>
                </a>
              }
              <a [href]="newsHubUrl" target="_blank" rel="noopener noreferrer" class="news__more">Ver todas →</a>
            </div>
          }
        </div>
      }
    </aside>
  `,
  styles: [`
    :host { display: contents; }

    .side {
      position: sticky;
      top: 24px;
      align-self: start;
      display: flex;
      flex-direction: column;
      gap: 14px;
      max-height: calc(100vh - 48px);
      overflow-y: auto;
    }
    .side::-webkit-scrollbar { width: 4px; }
    .side::-webkit-scrollbar-thumb { background: rgba(0,0,0,0.15); border-radius: 99px; }

    @media (max-width: 1099px) {
      .side { position: static; max-height: none; overflow: visible; }
    }

    /* Next match — see polla-v3.html .np for the design source */
    .np {
      background: #0a0a0a;
      color: #fff;
      border-radius: 18px;
      position: relative;
      overflow: hidden;
      border: 1px solid rgba(2,204,116,0.3);
      box-shadow: 0 12px 40px rgba(0,0,0,0.18);
    }
    .np__bg {
      position: absolute; inset: 0; z-index: 0;
      background: linear-gradient(160deg, #0a0a0a 0%, #0a3d20 55%, #067a4a 120%);
    }
    .np__bg::before {
      content: ""; position: absolute; inset: 0;
      background:
        radial-gradient(80% 50% at 50% 0%, rgba(2,204,116,0.5), transparent 65%),
        radial-gradient(60% 60% at 100% 100%, rgba(2,204,116,0.2), transparent 60%);
    }
    .np__in { position: relative; z-index: 1; padding: 22px; }
    .np__top { display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px; }
    .np__live {
      display: inline-flex; align-items: center; gap: 8px;
      background: rgba(2,204,116,0.18);
      border: 1px solid rgba(2,204,116,0.4);
      border-radius: 999px;
      padding: 5px 12px;
      font-size: 10px; letter-spacing: 0.14em; text-transform: uppercase;
      font-weight: 700;
      color: var(--color-primary-green);
    }
    .np__tag { font-size: 10px; color: rgba(255,255,255,0.55); letter-spacing: 0.08em; }
    .np__hl { font-family: var(--font-display); font-size: 20px; line-height: 1.1; color: #fff; margin-bottom: 4px; }
    .np__hl em { font-style: normal; color: var(--color-primary-green); }
    .np__sub { font-size: 11px; color: rgba(255,255,255,0.55); margin-bottom: 16px; }

    .np__cd { display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; margin-bottom: 18px; }
    .np__cd__c {
      background: rgba(255,255,255,0.05);
      border: 1px solid rgba(255,255,255,0.12);
      border-radius: 10px;
      padding: 10px 0 8px;
      text-align: center;
    }
    .np__cd__n { font-family: var(--font-display); font-size: 26px; line-height: 1; color: #fff; }
    .np__cd__l { font-size: 9px; letter-spacing: 0.14em; text-transform: uppercase; color: rgba(255,255,255,0.5); margin-top: 4px; font-weight: 600; }

    .np__t {
      display: grid; grid-template-columns: 1fr auto 1fr; gap: 14px;
      align-items: center; padding: 18px 4px;
      border-top: 1px solid rgba(255,255,255,0.08);
      border-bottom: 1px solid rgba(255,255,255,0.08);
      margin-bottom: 14px;
      background: rgba(255,255,255,0.02);
    }
    .np__tm { text-align: center; display: flex; flex-direction: column; gap: 8px; align-items: center; }
    .np__fl {
      width: 54px; height: 54px;
      border-radius: 50%;
      background: rgba(255,255,255,0.08);
      display: grid; place-items: center;
      font-size: 32px;
      border: 2px solid rgba(255,255,255,0.18);
    }
    .np__tm--home .np__fl { border-color: rgba(2,204,116,0.5); box-shadow: 0 0 0 4px rgba(2,204,116,0.12); }
    .np__n { font-family: var(--font-display); font-size: 17px; line-height: 1; color: #fff; }
    .np__vs { display: flex; flex-direction: column; align-items: center; gap: 3px; }
    .np__vs__l { font-family: var(--font-display); font-size: 20px; color: var(--color-primary-green); line-height: 1; }

    .np__pk {
      display: flex; justify-content: space-between; align-items: center;
      padding: 12px 14px;
      background: linear-gradient(90deg, rgba(2,204,116,0.22), rgba(2,204,116,0.08));
      border: 1px solid rgba(2,204,116,0.45);
      border-radius: 10px;
      margin-bottom: 8px;
      text-decoration: none;
      color: inherit;
    }
    .np__pk__l { font-size: 10px; letter-spacing: 0.12em; text-transform: uppercase; color: rgba(255,255,255,0.7); font-weight: 600; display: block; margin-bottom: 2px; }
    .np__pk strong { font-family: var(--font-display); font-size: 22px; color: #fff; display: flex; align-items: center; gap: 6px; }
    .np__pk strong em { font-style: normal; font-size: 11px; letter-spacing: 0.06em; text-transform: uppercase; font-family: var(--font-primary); font-weight: 700; background: rgba(2,204,116,0.35); padding: 3px 8px; border-radius: 5px; }
    .np__pk__e {
      color: var(--color-primary-green);
      font-size: 11px; text-decoration: none; font-weight: 700;
      letter-spacing: 0.08em; text-transform: uppercase;
      padding: 6px 10px;
      background: rgba(2,204,116,0.15);
      border: 1px solid rgba(2,204,116,0.3);
      border-radius: 6px;
    }
    .np__cta {
      display: flex; align-items: center; justify-content: center; gap: 6px;
      width: 100%; padding: 10px;
      background: transparent;
      border: 1px solid rgba(255,255,255,0.15);
      border-radius: 8px;
      color: rgba(255,255,255,0.8);
      text-decoration: none;
      font-size: 11px;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      font-weight: 600;
      box-sizing: border-box;
    }

    /* Upcoming picks */
    .up {
      background: #fff;
      border: 1px solid var(--color-line);
      border-radius: 14px;
      padding: 16px;
    }
    .up__h {
      font-size: 11px; letter-spacing: 0.16em; text-transform: uppercase;
      color: var(--color-text-muted);
      margin-bottom: 10px;
      display: flex; justify-content: space-between;
    }
    .up__h a { color: var(--color-primary-green); font-weight: 600; text-decoration: none; }
    .up__r {
      padding: 8px 0;
      border-bottom: 1px solid rgba(0,0,0,0.06);
      text-decoration: none;
      color: inherit;
      display: flex; flex-direction: column; gap: 3px;
    }
    .up__r:last-child { border-bottom: 0; }
    .up__r__h { display: flex; justify-content: space-between; font-size: 10px; color: var(--color-text-muted); }
    .up__r__h .ok { color: var(--color-primary-green); font-weight: 700; }
    .up__r__h .pe { color: #dc2626; font-weight: 700; }
    .up__r__t { font-family: var(--font-display); font-size: 13px; }
    .up__r__t.m { color: var(--color-text-muted); }

    /* News */
    .news { display: flex; flex-direction: column; gap: 10px; }
    .news__hero {
      background: #0a0a0a;
      border-radius: 12px;
      overflow: hidden;
      text-decoration: none;
      color: #fff;
      position: relative;
      aspect-ratio: 5 / 3;
      display: flex;
      align-items: end;
    }
    .news__hero img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; opacity: 0.55; }
    .news__hero::before {
      content: ""; position: absolute; inset: 0;
      background: linear-gradient(to top, rgba(0,0,0,0.95) 0%, transparent 60%);
      z-index: 1;
    }
    .news__hero__b { position: relative; z-index: 2; padding: 14px; }
    .news__hero__k { font-size: 10px; letter-spacing: 0.14em; text-transform: uppercase; color: var(--color-primary-green); font-weight: 700; margin-bottom: 5px; }
    .news__hero__t { font-family: var(--font-display); font-size: 16px; line-height: 1.1; }
    .news__list {
      background: #fff;
      border: 1px solid var(--color-line);
      border-radius: 12px;
      padding: 4px 14px;
    }
    .news__row {
      display: flex; gap: 10px;
      padding: 11px 0;
      border-bottom: 1px solid rgba(0,0,0,0.05);
      text-decoration: none;
      color: inherit;
    }
    .news__row:last-of-type { border-bottom: 0; }
    .news__row__img {
      width: 46px; height: 46px;
      border-radius: 7px;
      background: linear-gradient(135deg, #0a3d20, #067a4a) center/cover no-repeat;
      flex-shrink: 0;
    }
    .news__row__b { flex: 1; min-width: 0; }
    .news__row__k { font-size: 9px; letter-spacing: 0.14em; text-transform: uppercase; color: var(--color-primary-green); font-weight: 700; margin-bottom: 3px; }
    .news__row__t { font-family: var(--font-display); font-size: 13px; line-height: 1.15; }
    .news__more {
      display: block; padding: 11px 0;
      text-align: center;
      font-size: 11px;
      letter-spacing: 0.12em;
      text-transform: uppercase;
      color: var(--color-primary-green);
      text-decoration: none;
      font-weight: 600;
    }
  `],
})
export class RightRailComponent implements OnInit, OnDestroy {
  private api = inject(ApiService);
  private auth = inject(AuthService);

  readonly newsHubUrl = NEWS_HUB_URL;

  nextMatch = signal<NextMatchVm | null>(null);
  upcoming = signal<UpcomingPickRow[]>([]);
  newsHero = signal<NewsHero | null>(null);
  newsList = signal<NewsHero[]>([]);

  private tickerId?: ReturnType<typeof setInterval>;
  private rawNext: { kickoffAt: string } | null = null;

  async ngOnInit() {
    void this.loadNextAndUpcoming();
    void this.loadNews();
    this.tickerId = setInterval(() => this.refreshCountdown(), 1000);
  }

  ngOnDestroy(): void {
    if (this.tickerId) clearInterval(this.tickerId);
  }

  private async loadNextAndUpcoming() {
    const userId = this.auth.user()?.sub ?? '';
    try {
      const [matchesRes, teamsRes, picksRes] = await Promise.all([
        this.api.listMatches(TOURNAMENT_ID),
        this.api.listTeams(TOURNAMENT_ID),
        userId ? this.api.myPicks(userId) : Promise.resolve({ data: [] as ReadonlyArray<{ matchId: string; homeScorePred: number; awayScorePred: number }> }),
      ]);

      const teamMap = new Map<string, { name: string; flag: string }>(
        (teamsRes.data ?? [])
          .filter((t): t is NonNullable<typeof t> => !!t?.slug)
          .map((t) => [t.slug, { name: t.name ?? t.slug, flag: t.flagCode ?? '' }]),
      );
      const pickMap = new Map<string, { home: number; away: number }>();
      for (const p of (picksRes.data ?? []) as ReadonlyArray<{ matchId: string; homeScorePred: number; awayScorePred: number }>) {
        pickMap.set(p.matchId, { home: p.homeScorePred, away: p.awayScorePred });
      }

      const now = Date.now();
      const all = (matchesRes.data ?? [])
        .filter((m): m is NonNullable<typeof m> => !!m?.id && !!m.kickoffAt)
        .filter((m) => new Date(m.kickoffAt!).getTime() > now - 2 * 3600 * 1000)
        .sort((a, b) => new Date(a.kickoffAt!).getTime() - new Date(b.kickoffAt!).getTime());

      const first = all[0];
      if (first) {
        const ko = new Date(first.kickoffAt!);
        const home = teamMap.get(first.homeTeamId) ?? { name: first.homeTeamId, flag: '' };
        const away = teamMap.get(first.awayTeamId) ?? { name: first.awayTeamId, flag: '' };
        const myPick = pickMap.get(first.id);
        const isLive = first.status === 'IN_PROGRESS' || first.status === 'LIVE';
        let winnerName: string | null = null;
        if (myPick) {
          if (myPick.home > myPick.away) winnerName = home.name;
          else if (myPick.away > myPick.home) winnerName = away.name;
        }
        this.rawNext = { kickoffAt: first.kickoffAt! };
        this.nextMatch.set({
          id: first.id,
          homeName: home.name,
          awayName: away.name,
          homeFlag: home.flag,
          awayFlag: away.flag,
          kickoffAt: first.kickoffAt!,
          venue: (first as { venue?: string | null }).venue ?? null,
          phaseLabel: 'Mundial 2026',
          countdown: this.computeCountdown(ko.getTime(), now),
          isLive,
          myPick: myPick ? { home: myPick.home, away: myPick.away, winnerName } : null,
        });
      }

      const upcomingRows: UpcomingPickRow[] = all.slice(1, 5).map((m) => {
        const ko = new Date(m.kickoffAt!);
        const home = teamMap.get(m.homeTeamId) ?? { name: m.homeTeamId, flag: '' };
        const away = teamMap.get(m.awayTeamId) ?? { name: m.awayTeamId, flag: '' };
        const myPick = pickMap.get(m.id);
        return {
          id: m.id,
          dateLabel: this.formatShortDate(ko),
          matchLabel: `${this.shortCode(home.name)} vs ${this.shortCode(away.name)}`,
          hasPick: !!myPick,
          pickLabel: myPick ? `${myPick.home}-${myPick.away} ${myPick.home >= myPick.away ? home.name : away.name}` : null,
          countdownLabel: !myPick ? this.formatCountdownLabel(ko.getTime() - Date.now()) : null,
        };
      });
      this.upcoming.set(upcomingRows);
    } catch (e) {
      console.warn('[right-rail] load next/upcoming failed', e);
    }
  }

  private async loadNews() {
    try {
      const res = await this.api.listPublishedArticles(4);
      const rows = (res.data ?? []).slice();
      const enriched: NewsHero[] = await Promise.all(rows.map(async (a) => {
        let resolvedImageUrl: string | null = null;
        if (a.imageKey) {
          try {
            const { url } = await getUrl({ path: a.imageKey, options: { expiresIn: 3600 } });
            resolvedImageUrl = url.toString();
          } catch { /* ignore */ }
        }
        return {
          id: a.id,
          title: a.title,
          externalUrl: a.externalUrl,
          resolvedImageUrl,
          relativeTime: this.formatRelative(a.publishedAt),
        };
      }));
      this.newsHero.set(enriched[0] ?? null);
      this.newsList.set(enriched.slice(1));
    } catch (e) {
      console.warn('[right-rail] load news failed', e);
    }
  }

  private refreshCountdown() {
    if (!this.rawNext) return;
    const ko = new Date(this.rawNext.kickoffAt).getTime();
    const now = Date.now();
    const cur = this.nextMatch();
    if (!cur || cur.isLive) return;
    if (ko - now <= 0) return;
    this.nextMatch.set({ ...cur, countdown: this.computeCountdown(ko, now) });
  }

  private computeCountdown(targetMs: number, nowMs: number) {
    const diff = Math.max(0, targetMs - nowMs);
    const d = Math.floor(diff / 86_400_000);
    const h = Math.floor((diff % 86_400_000) / 3_600_000);
    const m = Math.floor((diff % 3_600_000) / 60_000);
    const s = Math.floor((diff % 60_000) / 1000);
    const p2 = (n: number) => (n < 10 ? '0' : '') + n;
    return { d: String(d), h: p2(h), m: p2(m), s: p2(s) };
  }

  private formatShortDate(d: Date): string {
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    return `${day}/${month}`;
  }

  private shortCode(name: string): string {
    // Take first 3 letters uppercase as a short team code.
    return name.slice(0, 3).toUpperCase();
  }

  private formatCountdownLabel(diffMs: number): string {
    if (diffMs < 0) return 'cerrado';
    const h = Math.round(diffMs / 3_600_000);
    if (h < 1) return `${Math.round(diffMs / 60_000)}m`;
    if (h < 24) return `${h}h`;
    return `${Math.round(h / 24)}d`;
  }

  private formatRelative(iso: string): string {
    const diff = Date.now() - new Date(iso).getTime();
    const h = Math.round(diff / 3_600_000);
    if (h < 1) return 'hace minutos';
    if (h < 24) return `hace ${h}h`;
    const d = Math.round(h / 24);
    if (d < 7) return d === 1 ? 'hace 1 día' : `hace ${d} días`;
    return new Date(iso).toLocaleDateString();
  }
}
```

- [ ] **Step 2: Verify**

```bash
cd polla-app && npx tsc --noEmit -p tsconfig.app.json
cd polla-app && npx ng build --configuration=development 2>&1 | tail -10
```

Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
cd 'C:\Users\Marke\Documents\Respaldo\polla mundialista\polla-app' && git add src/app/shared/layout/right-rail.component.ts
cd 'C:\Users\Marke\Documents\Respaldo\polla mundialista\polla-app' && git commit -m "feat(design-v3): rewrite right-rail with next match + upcoming picks + news

3 blocks (per polla-v3.html design): next match card with countdown ticker
+ flags + my pick + CTA; siguientes picks (4 rows); news hero + 3 rows
from existing Article data. Reactivates the previously-deactivated rail.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: Shell integration + bottom-nav removal

**Files:**
- Modify: `polla-app/src/app/shared/layout/shell.component.ts`
- Delete: `polla-app/src/app/shared/layout/bottom-nav.component.ts`
- Create: `polla-app/public/assets/news-placeholder.svg`

- [ ] **Step 1: Update `shell.component.ts`**

Replace contents with:

```typescript
import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { NavComponent } from './nav.component';
import { SidebarComponent } from './sidebar.component';
import { TriviaToastComponent } from './trivia-toast.component';
import { RightRailComponent } from './right-rail.component';
import { FooterComponent } from './footer.component';
import { PicksPendingBannerComponent } from '../../features/picks/picks-pending-banner.component';
import { ToastHostComponent } from '../../core/notifications/toast-host.component';
import { TriviaPopupComponent } from '../../features/trivia/trivia-popup.component';
import { GroupActionsModalsComponent } from './group-actions-modals.component';
import { RedeemModalComponent } from './redeem-modal.component';

@Component({
  standalone: true,
  selector: 'app-shell',
  imports: [
    RouterOutlet, NavComponent, SidebarComponent, TriviaToastComponent,
    RightRailComponent, FooterComponent, PicksPendingBannerComponent,
    ToastHostComponent, TriviaPopupComponent,
    GroupActionsModalsComponent, RedeemModalComponent,
  ],
  template: `
    <div class="app-shell">
      <app-nav />
      <app-sidebar />
      <app-trivia-toast />
      <div class="shell">
        <main class="main">
          <app-picks-pending-banner />
          <router-outlet />
        </main>
        <app-right-rail />
      </div>
      <app-footer />
    </div>
    <app-toast-host />
    <app-trivia-popup />
    <app-group-actions-modals />
    <app-redeem-modal />
  `,
  styles: [`
    :host { display: block; }
    .app-shell { display: flex; flex-direction: column; min-height: 100dvh; }
    .shell {
      margin-left: 64px;
      display: grid;
      grid-template-columns: 1fr 320px;
      gap: 24px;
      padding: 24px;
      max-width: 1480px;
      flex: 1;
    }
    .main { display: flex; flex-direction: column; gap: 16px; }
    @media (max-width: 1099px) {
      .shell { grid-template-columns: 1fr; }
    }
    @media (max-width: 767px) {
      .shell {
        margin-left: 0;
        padding: 14px;
        padding-bottom: 74px;   /* clearance for bottom-nav */
        gap: 14px;
      }
    }
  `],
})
export class ShellComponent {}
```

- [ ] **Step 2: Delete `bottom-nav.component.ts`**

```bash
rm 'C:\Users\Marke\Documents\Respaldo\polla mundialista\polla-app\src\app\shared\layout\bottom-nav.component.ts'
```

Then search the codebase for any remaining imports of `BottomNavComponent` and remove them:

```bash
cd polla-app && grep -rn "BottomNavComponent\|bottom-nav.component" src/app/ 2>&1
```

Expected: no remaining references (shell already updated; sidebar absorbs the role). If any straggler imports exist, remove them.

- [ ] **Step 3: Create news placeholder SVG**

Create `polla-app/public/assets/news-placeholder.svg`:

```xml
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 500 300" preserveAspectRatio="xMidYMid slice">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#0a3d20"/>
      <stop offset="100%" stop-color="#067a4a"/>
    </linearGradient>
  </defs>
  <rect width="500" height="300" fill="url(#g)"/>
  <circle cx="250" cy="150" r="60" fill="none" stroke="rgba(255,255,255,0.18)" stroke-width="3"/>
  <text x="250" y="165" text-anchor="middle" font-family="Bebas Neue, sans-serif" font-size="48" fill="rgba(255,255,255,0.35)">GOLGANA</text>
</svg>
```

- [ ] **Step 4: Verify**

```bash
cd polla-app && npx tsc --noEmit -p tsconfig.app.json
cd polla-app && npx ng build --configuration=development 2>&1 | tail -15
cd polla-app && npx jest --no-coverage
```

Expected: 0 errors / clean / 40/40.

- [ ] **Step 5: Commit**

```bash
cd 'C:\Users\Marke\Documents\Respaldo\polla mundialista\polla-app' && git add src/app/shared/layout/shell.component.ts public/assets/news-placeholder.svg
cd 'C:\Users\Marke\Documents\Respaldo\polla mundialista\polla-app' && git rm src/app/shared/layout/bottom-nav.component.ts
cd 'C:\Users\Marke\Documents\Respaldo\polla mundialista\polla-app' && git commit -m "feat(design-v3): wire new shell + drop bottom-nav (absorbed by sidebar)

Shell now lays out: app-sidebar (fixed left 64px black, hover-expand or
bottom-nav on mobile) + topnav (mobile bell+avatar) + app-trivia-toast
(when active) + main grid 1fr/320px + app-right-rail (next match,
upcoming, news) + global modals/toasts. bottom-nav.component.ts is
removed since sidebar handles both desktop rail and mobile bottom-nav.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: Home rewrite (hero compacto + KPI strip + picks pendientes + grupos + row + comodines)

**Files:**
- Modify: `polla-app/src/app/features/home/home.component.ts`

Full rewrite (3rd iteration of this file in the project). Implements the design v3 content priority.

- [ ] **Step 1: Replace `home.component.ts`**

Use this complete implementation:

```typescript
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ApiService } from '../../core/api/api.service';
import { AuthService } from '../../core/auth/auth.service';
import { UserModesService } from '../../core/user/user-modes.service';
import { GroupActionsService } from '../../core/groups/group-actions.service';

const TOURNAMENT_ID = 'mundial-2026';
const TOURNAMENT_START_ISO = '2026-06-12T19:00:00-04:00';   // primer kickoff Mundial 2026

interface GroupRow {
  id: string; name: string; mode: 'SIMPLE' | 'COMPLETE';
  members: number; position: number | null; prizeLine: string;
  avatarBg: string; initials: string;
}

interface SpecialPickVm {
  type: 'CHAMPION' | 'RUNNER_UP' | 'DARK_HORSE';
  label: string;
  teamName: string | null;
  flag: string | null;
}

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [RouterLink],
  template: `
    <section class="home-page">

      <!-- HERO compacto -->
      <section class="hero">
        <div class="hero__in">
          <div class="hero__av">{{ avatarInitials() }}</div>
          <div>
            <div class="hero__k">Hola, {{ '@' + (handle() ?? 'jugador') }}</div>
            <div class="hero__t">
              Quedan <strong>{{ daysToTournament() }} días</strong>
              @if (totals().globalRank) {
                · estás en <strong>#{{ totals().globalRank }}</strong>
              }
            </div>
            <div class="hero__s">
              {{ totals().points }} pts · {{ myGroups().length }} grupos activos
              @if (accuracyPct() !== null) { · {{ accuracyPct() }}% de aciertos }
            </div>
            @if (pendingPicksCount() > 0 && nextDeadlineLabel()) {
              <div class="hero__alert">⚠ Cierra el primer pick en {{ nextDeadlineLabel() }}</div>
            }
          </div>
          <a routerLink="/picks" class="hero__cta">Hacer picks →</a>
        </div>
      </section>

      <!-- KPI strip -->
      <div class="kpis">
        <div class="kpi kpi--g">
          <div class="kpi__l">Ranking global</div>
          <div class="kpi__v">{{ totals().globalRank ? '#' + totals().globalRank : '—' }}</div>
          <div class="kpi__d">&nbsp;</div>
        </div>
        <div class="kpi">
          <div class="kpi__l">Puntos</div>
          <div class="kpi__v">{{ totals().points }}</div>
          <div class="kpi__d">&nbsp;</div>
        </div>
        <div class="kpi">
          <div class="kpi__l">Aciertos</div>
          <div class="kpi__v">{{ accuracyPct() !== null ? accuracyPct() + '%' : '—' }}
            @if (accuracyCount() !== null) { <small>{{ accuracyCount() }}</small> }
          </div>
          <div class="kpi__d">&nbsp;</div>
        </div>
        <div class="kpi">
          <div class="kpi__l">Grupos</div>
          <div class="kpi__v">{{ myGroups().length }}
            @if (bestPosition() !== null) { <small>{{ bestPositionLabel() }}</small> }
          </div>
          <div class="kpi__d">&nbsp;</div>
        </div>
        <div class="kpi">
          <div class="kpi__l">Comodines</div>
          <div class="kpi__v">{{ comodinesActive() }} <small>/{{ comodinesCap() }}</small></div>
          <div class="kpi__d">&nbsp;</div>
        </div>
      </div>

      <!-- Picks pendientes (dark) -->
      @if (pendingPicksCount() > 0) {
        <div class="pp">
          <div class="pp__n">{{ pendingPicksCount() }}</div>
          <div class="pp__t">
            <strong>{{ pendingPicksCount() === 1 ? 'Pick pendiente' : 'Picks pendientes' }} para hoy</strong>
            <small>Si los envías sumas hasta <em>{{ pendingPicksCount() * 10 }} pts</em>.
              @if (nextDeadlineLabel()) { El primero cierra en <em>{{ nextDeadlineLabel() }}</em>. }
            </small>
          </div>
          <a routerLink="/picks" class="pp__b">Hacer picks →</a>
        </div>
      }

      <!-- Mis grupos -->
      <div>
        <div class="sh">
          <h2>Mis grupos · {{ myGroupsList().length }} {{ myGroupsList().length === 1 ? 'activo' : 'activos' }}</h2>
          <a routerLink="/groups">Ver todos →</a>
        </div>
        <div class="gr-list">
          @if (myGroupsList().length === 0) {
            <p class="text-mute">Aún no estás en ningún grupo.</p>
          }
          @for (g of myGroupsList(); track g.id) {
            <a [routerLink]="['/groups', g.id]" class="gr">
              <div class="gr__av" [style.background]="g.avatarBg">{{ g.initials }}</div>
              <div class="gr__b">
                <div class="gr__n">{{ g.name }}</div>
                <div class="gr__m">{{ g.members }} jugadores · {{ g.prizeLine }}</div>
              </div>
              <span class="gr__r"
                    [class.gr__r--g]="g.position === 1"
                    [class.gr__r--b]="g.position && g.position <= 3 && g.position !== 1"
                    [class.gr__r--n]="!g.position || g.position > 3">
                {{ g.position ? '#' + g.position : '—' }}
              </span>
            </a>
          }
        </div>
        <div class="gr-act">
          <button type="button" (click)="onCreateGroup()">＋ Crear grupo</button>
          <button type="button" (click)="onJoinGroup()">→ Unirme con código</button>
        </div>
      </div>

      <!-- Row: especiales + ranking -->
      <div class="row2">
        <div class="spk">
          <div class="spk__h"><span>🏆 Picks especiales · hasta 65 pts</span></div>
          <div class="spk__row">
            @for (s of specialPicks(); track s.type) {
              <a routerLink="/profile/special-picks" class="spk__c"
                 [class.spk__c--g]="s.type === 'CHAMPION'"
                 [class.spk__c--s]="s.type === 'RUNNER_UP'"
                 [class.spk__c--e]="s.type === 'DARK_HORSE'">
                <div class="spk__big">
                  @if (s.flag) { <span class="fi fi-{{ s.flag.toLowerCase() }}"></span> } @else { ＋ }
                </div>
                <div class="spk__nm">{{ s.teamName ?? 'Elegir' }}</div>
              </a>
            }
          </div>
        </div>

        <div class="rk">
          <div class="rk__r">
            <div>
              <div class="rk__big">{{ totals().globalRank ? '#' + totals().globalRank : '—' }}</div>
              <div class="rk__l">Global</div>
            </div>
            @if (bestPosition() !== null) {
              <div class="rk__r2">
                <div class="rk__big">#{{ bestPosition() }}</div>
                <div class="rk__l">{{ bestPositionGroupName() }}</div>
              </div>
            }
          </div>
          <div class="rk__bar">
            <div class="rk__bar__f" [style.width.%]="rankPercentile()"></div>
          </div>
          <div class="rk__s">
            <span>{{ totals().points }} pts · {{ accuracyPct() ?? 0 }}% acierto</span>
            <span>&nbsp;</span>
          </div>
        </div>
      </div>

      <!-- Comodines -->
      @if (totals().hasComplete) {
        <div class="com">
          <div class="com__h">
            <span>⚡ Comodines · {{ comodinesActive() }} de {{ comodinesCap() }} disponibles</span>
            <a routerLink="/mis-comodines">Detalles →</a>
          </div>
          <div class="com__row">
            @for (slot of comodinSlots(); track slot.idx) {
              <div class="com__c"
                   [class.com__c--d]="slot.kind === 'avail'"
                   [class.com__c--s]="slot.kind === 'used'"
                   [class.com__c--e]="slot.kind === 'empty'">
                <div class="com__c__i">{{ slot.icon }}</div>{{ slot.label }}
              </div>
            }
          </div>
        </div>
      }

    </section>
  `,
  styles: [`
    :host { display: block; }

    .home-page { display: flex; flex-direction: column; gap: 16px; }

    /* Hero compacto */
    .hero {
      background: linear-gradient(135deg, #0a0a0a 0%, #0a3d20 60%, #067a4a 100%);
      color: #fff;
      border-radius: 16px;
      padding: 22px 26px;
      position: relative;
      overflow: hidden;
    }
    .hero::before {
      content: ""; position: absolute; inset: 0; z-index: 0;
      background: radial-gradient(60% 80% at 80% 30%, rgba(2,204,116,0.22), transparent 60%);
    }
    .hero__in {
      position: relative; z-index: 1;
      display: grid;
      grid-template-columns: auto 1fr auto;
      gap: 20px;
      align-items: center;
    }
    .hero__av {
      width: 54px; height: 54px;
      border-radius: 50%;
      background: linear-gradient(135deg, #02cc74, #016b3d);
      display: grid; place-items: center;
      font-family: var(--font-display);
      font-size: 20px;
      color: #fff;
    }
    .hero__k { font-size: 10px; letter-spacing: 0.18em; text-transform: uppercase; color: rgba(255,255,255,0.55); margin-bottom: 4px; }
    .hero__t { font-family: var(--font-display); font-size: 24px; line-height: 1.05; }
    .hero__t strong { color: var(--color-primary-green); font-style: normal; }
    .hero__s { font-size: 12px; color: rgba(255,255,255,0.7); margin-top: 4px; }
    .hero__alert {
      background: rgba(220,38,38,0.18);
      border: 1px solid rgba(220,38,38,0.45);
      color: #fca5a5;
      padding: 5px 10px;
      border-radius: 6px;
      font-size: 10px;
      display: inline-flex;
      align-items: center;
      gap: 6px;
      margin-top: 6px;
    }
    .hero__cta {
      background: var(--color-primary-green);
      color: #fff;
      padding: 11px 18px;
      border-radius: 8px;
      font-weight: 600;
      text-decoration: none;
      font-size: 12px;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      white-space: nowrap;
    }
    @media (max-width: 640px) {
      .hero__in { grid-template-columns: auto 1fr; gap: 12px; }
      .hero__av { width: 42px; height: 42px; font-size: 16px; align-self: start; }
      .hero__t { font-size: 20px; }
      .hero__cta { grid-column: 1 / -1; text-align: center; padding: 10px; font-size: 11px; }
    }

    /* KPI strip */
    .kpis {
      display: grid; grid-template-columns: repeat(5, 1fr);
      gap: 1px;
      background: rgba(0,0,0,0.08);
      border: 1px solid rgba(0,0,0,0.08);
      border-radius: 12px;
      overflow: hidden;
    }
    .kpi { background: #fff; padding: 14px 16px; }
    .kpi--g { background: linear-gradient(135deg, #02cc74, #016b3d); color: #fff; }
    .kpi__l { font-size: 9px; letter-spacing: 0.16em; text-transform: uppercase; color: var(--color-text-muted); margin-bottom: 4px; }
    .kpi--g .kpi__l { color: rgba(255,255,255,0.85); }
    .kpi__v { font-family: var(--font-display); font-size: 24px; line-height: 1; }
    .kpi__v small { font-size: 11px; color: var(--color-text-muted); font-family: var(--font-primary); }
    .kpi--g .kpi__v small { color: rgba(255,255,255,0.7); }
    .kpi__d { font-size: 10px; color: var(--color-primary-green); font-weight: 600; margin-top: 3px; }
    .kpi--g .kpi__d { color: rgba(255,255,255,0.85); }
    @media (max-width: 780px) { .kpis { grid-template-columns: repeat(2, 1fr); } }

    /* Picks pendientes dark */
    .pp {
      background: #0a0a0a;
      color: #fff;
      border-radius: 14px;
      padding: 22px;
      display: grid;
      grid-template-columns: auto 1fr auto;
      gap: 18px;
      align-items: center;
      position: relative;
      overflow: hidden;
    }
    .pp::before {
      content: ""; position: absolute; top: -50%; right: -20%;
      width: 280px; height: 280px;
      background: radial-gradient(circle, rgba(2,204,116,0.18), transparent 70%);
    }
    .pp__n { font-family: var(--font-display); font-size: 56px; color: var(--color-primary-green); line-height: 1; position: relative; }
    .pp__t { position: relative; }
    .pp__t strong { font-family: var(--font-display); font-size: 18px; display: block; }
    .pp__t small { font-size: 11px; color: rgba(255,255,255,0.6); }
    .pp__t small em { color: #fca5a5; font-style: normal; }
    .pp__b {
      background: var(--color-primary-green);
      color: #fff;
      padding: 11px 18px;
      border-radius: 8px;
      font-weight: 600;
      text-decoration: none;
      font-size: 12px;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      white-space: nowrap;
      position: relative;
    }
    @media (max-width: 600px) { .pp { grid-template-columns: auto 1fr; padding: 16px; } .pp__n { font-size: 42px; } .pp__t strong { font-size: 14px; } .pp__b { grid-column: 1 / -1; text-align: center; padding: 9px; font-size: 10px; } }

    /* Section header */
    .sh { display: flex; justify-content: space-between; align-items: baseline; margin-top: 8px; flex-wrap: wrap; gap: 10px; }
    .sh h2 { font-family: var(--font-display); font-size: 20px; margin: 0; }
    .sh a { font-size: 11px; letter-spacing: 0.08em; text-transform: uppercase; color: var(--color-primary-green); font-weight: 600; text-decoration: none; }

    /* Grupos */
    .gr-list { display: flex; flex-direction: column; gap: 8px; margin-top: 10px; }
    .gr { background: #fff; border: 1px solid rgba(0,0,0,0.08); border-radius: 10px; padding: 12px; display: flex; align-items: center; gap: 12px; text-decoration: none; color: inherit; transition: all 0.15s; }
    .gr:hover { border-color: rgba(2,204,116,0.4); background: rgba(2,204,116,0.02); }
    .gr__av { width: 38px; height: 38px; border-radius: 9px; display: grid; place-items: center; color: #fff; font-family: var(--font-display); font-size: 15px; flex-shrink: 0; }
    .gr__b { flex: 1; min-width: 0; }
    .gr__n { font-family: var(--font-display); font-size: 16px; line-height: 1; }
    .gr__m { font-size: 11px; color: var(--color-text-muted); margin-top: 3px; }
    .gr__r { padding: 3px 9px; border-radius: 6px; font-family: var(--font-display); font-size: 14px; }
    .gr__r--g { background: rgba(245,158,11,0.18); color: #b45309; }
    .gr__r--b { background: rgba(180,83,9,0.18); color: #92400e; }
    .gr__r--n { background: rgba(0,0,0,0.06); color: var(--color-text-muted); }
    .gr-act { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 8px; }
    .gr-act button { background: transparent; border: 1px dashed rgba(2,204,116,0.4); border-radius: 9px; padding: 9px; color: var(--color-primary-green); font-family: inherit; font-weight: 600; font-size: 11px; letter-spacing: 0.08em; text-transform: uppercase; cursor: pointer; }
    .gr-act button:hover { background: rgba(2,204,116,0.05); border-style: solid; }
    @media (max-width: 480px) { .gr-act { grid-template-columns: 1fr; } }

    /* Row 2-col */
    .row2 { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
    @media (max-width: 780px) { .row2 { grid-template-columns: 1fr; } }

    /* Especiales */
    .spk { background: #fff; border: 1px solid rgba(0,0,0,0.08); border-radius: 12px; padding: 12px 14px; }
    .spk__h { font-size: 10px; letter-spacing: 0.14em; text-transform: uppercase; color: var(--color-text-muted); margin-bottom: 8px; display: flex; justify-content: space-between; align-items: center; }
    .spk__row { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; }
    .spk__c { text-align: center; padding: 6px 4px; border-radius: 7px; text-decoration: none; color: inherit; transition: all 0.2s; display: flex; align-items: center; gap: 6px; justify-content: center; }
    .spk__c:hover { transform: translateY(-1px); }
    .spk__c--g { background: linear-gradient(135deg, #fde047, #f59e0b); color: #7c2d12; }
    .spk__c--s { background: linear-gradient(135deg, #e5e7eb, #9ca3af); color: #1f2937; }
    .spk__c--e { background: #f3f4f6; border: 1px dashed var(--color-primary-green); color: var(--color-primary-green); }
    .spk__big { font-size: 16px; line-height: 1; }
    .spk__nm { font-family: var(--font-display); font-size: 11px; line-height: 1; }

    /* Ranking */
    .rk { background: linear-gradient(135deg, #02cc74, #016b3d); color: #fff; border-radius: 14px; padding: 18px; }
    .rk__r { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 10px; }
    .rk__big { font-family: var(--font-display); font-size: 32px; line-height: 1; }
    .rk__l { font-size: 9px; letter-spacing: 0.14em; text-transform: uppercase; opacity: 0.85; margin-top: 3px; }
    .rk__r2 { text-align: right; }
    .rk__r2 .rk__big { font-size: 24px; }
    .rk__bar { height: 4px; background: rgba(255,255,255,0.25); border-radius: 999px; overflow: hidden; }
    .rk__bar__f { height: 100%; background: #fff; transition: width 0.3s; }
    .rk__s { font-size: 10px; opacity: 0.85; margin-top: 4px; display: flex; justify-content: space-between; }

    /* Comodines */
    .com { background: #fff; border: 1px solid rgba(0,0,0,0.08); border-radius: 12px; padding: 12px 14px; }
    .com__h { font-size: 10px; letter-spacing: 0.14em; text-transform: uppercase; color: var(--color-text-muted); margin-bottom: 8px; display: flex; justify-content: space-between; align-items: center; }
    .com__h a { color: var(--color-primary-green); text-decoration: none; font-weight: 600; }
    .com__row { display: flex; gap: 6px; }
    .com__c { flex: 1; height: 48px; border-radius: 8px; display: flex; align-items: center; justify-content: center; gap: 6px; color: #fff; text-align: center; font-size: 10px; letter-spacing: 0.04em; text-transform: uppercase; transition: transform 0.2s; }
    .com__c--d { background: linear-gradient(135deg, #02cc74, #016b3d); }
    .com__c--s { background: linear-gradient(135deg, #f59e0b, #b45309); }
    .com__c--e { background: rgba(0,0,0,0.04); color: rgba(0,0,0,0.35); border: 1px dashed rgba(0,0,0,0.2); }
    .com__c__i { font-size: 16px; line-height: 1; }
  `],
})
export class HomeComponent implements OnInit {
  private auth = inject(AuthService);
  private api = inject(ApiService);
  private userModes = inject(UserModesService);
  private groupActions = inject(GroupActionsService);

  handle = computed(() => this.auth.user()?.handle ?? null);
  avatarInitials = computed(() => (this.handle() ?? 'JG').slice(0, 2).toUpperCase());

  daysToTournament = computed(() => {
    const diff = new Date(TOURNAMENT_START_ISO).getTime() - Date.now();
    return Math.max(0, Math.ceil(diff / 86_400_000));
  });

  totals = signal<{ points: number; globalRank: number | null; hasComplete: boolean }>(
    { points: 0, globalRank: null, hasComplete: false },
  );
  pendingPicksCount = signal(0);
  nextDeadlineLabel = signal<string | null>(null);
  accuracyPct = signal<number | null>(null);
  accuracyCount = signal<string | null>(null);
  myGroupsList = signal<GroupRow[]>([]);
  bestPosition = signal<number | null>(null);
  bestPositionGroupName = signal<string>('');
  rankPercentile = signal<number>(0);
  specialPicks = signal<SpecialPickVm[]>([
    { type: 'CHAMPION', label: 'Campeón', teamName: null, flag: null },
    { type: 'RUNNER_UP', label: 'Sub', teamName: null, flag: null },
    { type: 'DARK_HORSE', label: 'Revelación', teamName: null, flag: null },
  ]);
  comodinesActive = signal(0);
  comodinesCap = signal(5);
  comodinSlots = computed(() => {
    const active = this.comodinesActive();
    const cap = this.comodinesCap();
    const slots: Array<{ idx: number; kind: 'avail' | 'used' | 'empty'; icon: string; label: string }> = [];
    for (let i = 0; i < Math.min(cap, 3); i++) {
      if (i < active) slots.push({ idx: i, kind: 'avail', icon: '×2', label: 'Disponible' });
      else slots.push({ idx: i, kind: 'empty', icon: '?', label: 'Vacío' });
    }
    return slots;
  });

  myGroups = computed(() => this.userModes.groups());

  async ngOnInit() {
    void this.loadMatchesAndStats();
    void this.loadGroups();
  }

  onCreateGroup() { this.groupActions.openCreate(); }
  onJoinGroup() { this.groupActions.openJoin(); }

  bestPositionLabel = computed(() => {
    const p = this.bestPosition();
    return p ? `${p}°` : '—';
  });

  private async loadMatchesAndStats() {
    try {
      const userId = this.auth.user()?.sub ?? '';
      const [matchesRes, totalRes, leaderboardRes, picksRes] = await Promise.all([
        this.api.listMatches(TOURNAMENT_ID),
        userId ? this.api.myTotal(userId, TOURNAMENT_ID) : Promise.resolve({ data: [] as readonly unknown[] }),
        this.api.listLeaderboard(TOURNAMENT_ID, 200),
        userId ? this.api.myPicks(userId) : Promise.resolve({ data: [] as ReadonlyArray<{ matchId: string; pointsEarned?: number | null }> }),
      ]);

      const totalRow = ((totalRes.data ?? []) as ReadonlyArray<{ points?: number }>)[0];
      const sorted = ((leaderboardRes.data ?? []) as ReadonlyArray<{ userId: string; points?: number }>)
        .slice().sort((a, b) => (b.points ?? 0) - (a.points ?? 0));
      const rankIdx = sorted.findIndex((t) => t.userId === userId);
      const globalRank = rankIdx >= 0 ? rankIdx + 1 : null;
      this.totals.set({
        points: totalRow?.points ?? 0,
        globalRank,
        hasComplete: this.userModes.hasComplete(),
      });

      if (globalRank && sorted.length > 0) {
        // Percentile bar: position from the top (lower rank = larger fill).
        const pct = Math.max(2, Math.round((1 - (globalRank - 1) / sorted.length) * 100));
        this.rankPercentile.set(pct);
      }

      const allMatches = ((matchesRes.data ?? []) as ReadonlyArray<{ id: string; kickoffAt?: string | null; status?: string | null }>)
        .filter((m): m is { id: string; kickoffAt: string; status?: string | null } => !!m.id && !!m.kickoffAt);

      const pickIds = new Set(((picksRes.data ?? []) as ReadonlyArray<{ matchId: string }>).map((p) => p.matchId));
      const now = Date.now();
      const cutoff = now + 48 * 3600 * 1000;
      const pending = allMatches.filter((m) => {
        const ko = new Date(m.kickoffAt).getTime();
        return ko > now && ko < cutoff && !pickIds.has(m.id);
      });
      this.pendingPicksCount.set(pending.length);

      if (pending.length > 0) {
        const next = pending.sort((a, b) => new Date(a.kickoffAt).getTime() - new Date(b.kickoffAt).getTime())[0]!;
        const diff = new Date(next.kickoffAt).getTime() - now;
        const h = Math.floor(diff / 3_600_000);
        const m = Math.floor((diff % 3_600_000) / 60_000);
        this.nextDeadlineLabel.set(h > 0 ? `${h}h ${m}min` : `${m} min`);
      }

      const finalPicks = ((picksRes.data ?? []) as ReadonlyArray<{ matchId: string; pointsEarned?: number | null }>)
        .filter((p) => {
          const match = allMatches.find((m) => m.id === p.matchId);
          return match?.status === 'FINAL';
        });
      const total = finalPicks.length;
      const hits = finalPicks.filter((p) => (p.pointsEarned ?? 0) > 0).length;
      if (total > 0) {
        this.accuracyPct.set(Math.round((hits / total) * 100));
        this.accuracyCount.set(`${hits}/${total}`);
      }
    } catch (e) {
      console.warn('[home] load matches/stats failed', e);
    }
  }

  private async loadGroups() {
    const userId = this.auth.user()?.sub ?? '';
    if (!userId) return;
    try {
      const groups = this.userModes.groups().slice(0, 5);
      const rows = await Promise.all(groups.map(async (g, idx): Promise<GroupRow> => {
        try {
          const lbRes = await this.api.groupLeaderboard(g.id);
          const sorted = ((lbRes.data ?? []) as ReadonlyArray<{ userId: string; points?: number }>)
            .slice().sort((a, b) => (b.points ?? 0) - (a.points ?? 0));
          const i = sorted.findIndex((x) => x.userId === userId);
          const position = i >= 0 ? i + 1 : null;
          const prizeLine = ((g as { prize1st?: string | null }).prize1st)
            ? `Premio ${(g as { prize1st?: string }).prize1st}`
            : 'Bragging rights';
          const initials = (g.name ?? 'GR').slice(0, 2).toUpperCase();
          const palette = [
            'linear-gradient(135deg,#067a4a,#02cc74)',
            'linear-gradient(135deg,#3b82f6,#1d4ed8)',
            'linear-gradient(135deg,#f59e0b,#b45309)',
            'linear-gradient(135deg,#8b5cf6,#6d28d9)',
            'linear-gradient(135deg,#dc2626,#7f1d1d)',
          ];
          return {
            id: g.id, name: g.name, mode: g.mode,
            members: sorted.length, position, prizeLine,
            avatarBg: palette[idx % palette.length]!, initials,
          };
        } catch {
          return {
            id: g.id, name: g.name, mode: g.mode,
            members: 0, position: null, prizeLine: 'Bragging rights',
            avatarBg: 'linear-gradient(135deg,#067a4a,#02cc74)',
            initials: (g.name ?? 'GR').slice(0, 2).toUpperCase(),
          };
        }
      }));
      this.myGroupsList.set(rows);

      let best: { p: number; n: string } | null = null;
      for (const r of rows) {
        if (r.position && (!best || r.position < best.p)) {
          best = { p: r.position, n: r.name };
        }
      }
      if (best) {
        this.bestPosition.set(best.p);
        this.bestPositionGroupName.set('En ' + best.n);
      }
    } catch (e) {
      console.warn('[home] load groups failed', e);
    }
  }
}
```

- [ ] **Step 2: Verify**

```bash
cd polla-app && npx tsc --noEmit -p tsconfig.app.json
cd polla-app && npx ng build --configuration=development 2>&1 | tail -10
cd polla-app && npx jest --no-coverage
```

Expected: 0 errors / clean / 40/40 (may need to update existing home component spec if it asserts on removed elements; if so, delete or update those tests).

- [ ] **Step 3: Commit**

```bash
cd 'C:\Users\Marke\Documents\Respaldo\polla mundialista\polla-app' && git add src/app/features/home/home.component.ts
cd 'C:\Users\Marke\Documents\Respaldo\polla mundialista\polla-app' && git commit -m "feat(design-v3): home rewrite — hero + KPI strip + picks pendientes + grupos + row + comodines

Layout per polla-v3.html: dark gradient hero compacto with greeting + days
to Mundial + pending alert; 5-up KPI strip (Ranking · Puntos · Aciertos ·
Grupos · Comodines) with first card in primary green gradient; dark picks-
pendientes block (only when there are pending picks); group list with
avatar+rank pill; 2-col row of special picks + ranking gradient card;
comodines slots (only for COMPLETE mode users).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 7: Modal re-skin + topnav mobile adaptations

**Files:**
- Modify: `polla-app/src/app/shared/layout/group-actions-modals.component.ts` (re-skin)
- Modify: `polla-app/src/app/features/trivia/trivia-popup.component.ts` (FAB re-skin)
- Modify: `polla-app/src/app/shared/layout/nav.component.ts` (mobile topbar bell+avatar present, desktop sidebar absorbs them)

These are cosmetic adjustments to align with design v3 visuals. Functional behavior stays the same.

- [ ] **Step 1: `group-actions-modals.component.ts` — re-skin to v3 modal style**

Read the file first. The modals exist already and work; we adjust visuals to match v3:
- Backdrop: `rgba(10,10,10,0.75)` with `backdrop-filter: blur(6px)`.
- Card: `border-radius: 16px; padding: 28px; max-width: 480px;`.
- Title: `font-family: var(--font-display); font-size: 28px; line-height: 1;`.
- Kicker above title: small uppercase with primary green color.
- Primary button: `background: var(--color-primary-green); color: #fff; font-weight: 600; text-transform: uppercase; letter-spacing: 0.04em;`.
- Inputs: `padding: 12px 14px; border: 1px solid rgba(0,0,0,0.12); border-radius: 8px; font-size: 15px;`. On focus: `border-color: var(--color-primary-green); box-shadow: 0 0 0 3px rgba(2,204,116,0.15);`.

Adapt the existing template/styles without changing the underlying signal/state logic. The two modals (create / join) should both adopt this look.

If the file is large (>500 lines) and the styles section is intermixed with template, focus only on the CSS block — replace just the styles, keep the template structure.

- [ ] **Step 2: `trivia-popup.component.ts` — FAB re-skin (CSS only)**

Read the file's FAB section. Replace the FAB CSS with:

```css
.fab {
  position: fixed;
  bottom: 20px; right: 20px;
  z-index: 60;
}
.fab__btn {
  background: linear-gradient(135deg, #02cc74, #016b3d);
  color: #fff;
  border: none;
  cursor: pointer;
  padding: 13px 20px;
  border-radius: 999px;
  box-shadow: 0 12px 30px rgba(2,204,116,0.4);
  display: flex; align-items: center; gap: 8px;
  font-family: inherit;
  font-weight: 600; font-size: 12px;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  animation: fab-pulse 2.5s infinite;
}
@keyframes fab-pulse {
  0%, 100% { transform: scale(1); }
  50%      { transform: scale(1.05); }
}
.fab__i {
  display: grid; place-items: center;
  width: 22px; height: 22px;
  background: #fff;
  color: var(--color-primary-green);
  border-radius: 50%;
  font-size: 12px;
}
@media (max-width: 767px) {
  .fab { bottom: 74px; right: 14px; }
  .fab__btn { padding: 11px 14px; font-size: 10px; }
  .fab__text { display: none; }
}
```

In the template, ensure the FAB button has `class="fab__btn"` and that the inner content is:

```html
<div class="fab">
  <button class="fab__btn" (click)="open()">
    <span class="fab__i" aria-hidden="true">⚡</span>
    <span class="fab__text">Trivia · Comodín</span>
  </button>
</div>
```

Adapt to the existing structure — the file already has a FAB; only swap classes/content.

- [ ] **Step 3: `nav.component.ts` — mobile topbar bell + avatar**

Read the existing mobile topbar template. Ensure that on mobile (<768px) the topbar shows:
- Logo (left)
- 🔔 Notifications icon (top-right, links to `/notificaciones`)
- Avatar (top-right, links to `/profile`)

The desktop topnav can keep its existing menu items (Picks · Grupos · Ranking dropdown · user dropdown) since the sidebar takes over the primary navigation. If the desktop topnav now feels redundant with the sidebar, just hide it on desktop (≥768px) leaving only the mobile topbar visible. Read the file to make this call.

Don't break the trivia-toast layout — it relies on `margin-left: 64px` on desktop, which expects no full-width topbar above it. If the desktop topbar persists, the toast still appears below the topbar (acceptable).

- [ ] **Step 4: Verify**

```bash
cd polla-app && npx tsc --noEmit -p tsconfig.app.json
cd polla-app && npx ng build --configuration=development 2>&1 | tail -10
cd polla-app && npx jest --no-coverage
```

Expected: 0 errors / clean / 40/40.

- [ ] **Step 5: Commit**

```bash
cd 'C:\Users\Marke\Documents\Respaldo\polla mundialista\polla-app' && git add src/app/shared/layout/group-actions-modals.component.ts src/app/features/trivia/trivia-popup.component.ts src/app/shared/layout/nav.component.ts
cd 'C:\Users\Marke\Documents\Respaldo\polla mundialista\polla-app' && git commit -m "feat(design-v3): modal + FAB + topbar visual adjustments

- group-actions-modals: re-skin to v3 modal style (dark backdrop with
  blur, Bebas Neue title, primary green CTA, focus rings).
- trivia-popup FAB: gradient green pill with pulse animation, white
  circle icon, hides label on mobile.
- nav.component: ensure mobile topbar has bell + avatar (sidebar takes
  over navigation on desktop, mobile uses bottom-nav).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 8: QA visual + adjustments

**Files:** none (manual verification + small fix-up commits as needed).

- [ ] **Step 1: Dev server check**

The dev server should auto-recompile after each commit. If not running:

```bash
cd polla-app && npm start
```

- [ ] **Step 2: Manual smoke test scenarios**

Open `http://localhost:4200` and verify:

**Desktop ≥1100px**:
- Black sidebar 64px on the left with icons. Hover expands to 200px revealing labels.
- Active link highlighted green.
- Main content area starts at left: 64px.
- Top of main: trivia-toast IF there's active trivia (else absent).
- Home: hero compacto with avatar+greeting+days+rank+CTA. KPI strip 5-up below. Picks pendientes dark card (only if pending). Mis grupos list with rank pills. Row of especiales + ranking gradient card. Comodines (only if COMPLETE).
- Right rail (320px sticky): next match dark card with countdown ticking down, upcoming picks list, news hero + 3 rows.
- FAB bottom-right with green gradient pulse (only if trivia active).

**Desktop 768-1099px**:
- Sidebar still visible. Right-rail stacks below main (not sticky).
- Home content collapses 2-col to 1-col where defined.

**Mobile <768px**:
- Sidebar transforms into bottom-nav: 5 icons horizontal (Inicio · Picks · Grupos · Ranking · Mundial 2026) + Admin if admin. Labels below icons in uppercase.
- No left margin on shell content.
- Trivia toast (if active) spans full width.
- FAB rises above bottom-nav.
- Topbar (mobile only) shows logo + bell + avatar.

- [ ] **Step 3: Cross-page check**

Navigate to `/picks`, `/groups`, `/ranking`, `/profile`. Verify:
- Sidebar persists with correct active state.
- Right-rail still shows on desktop ≥1100px.
- No layout regressions inside the routed pages (their internal styling should be unaffected by token changes since we kept compat aliases).
- Admin: `/admin` shows the dashboard with the new black sidebar.

- [ ] **Step 4: Article + trivia smoke checks**

- Create a new Article via `/admin/articles` (DRAFT then PUBLISHED). Verify it appears in the right-rail news (hero or row).
- If there's active trivia data in the sandbox, the toast banner should appear at the top and the FAB should be visible. Click → modal opens.

- [ ] **Step 5: Adjust + commit any tweaks**

If any visual regression is found in this QA pass, fix in a small commit:

```bash
cd 'C:\Users\Marke\Documents\Respaldo\polla mundialista\polla-app' && git add <files>
cd 'C:\Users\Marke\Documents\Respaldo\polla mundialista\polla-app' && git commit -m "fix(design-v3): <area> — <what was off>

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

When done with QA, the feature branch is ready to merge to main.
