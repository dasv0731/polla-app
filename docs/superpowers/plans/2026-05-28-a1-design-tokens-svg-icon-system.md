# A1 · Design Tokens + SVG Icon System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. **All sub-agent dispatches MUST use opus 4.7** per project memory.

**Goal:** Construir la fundación visual y de iconografía que todos los sub-proyectos posteriores (A2-A8) consumirán: design tokens CSS extendidos, Lucide SVG icon system con `<app-icon>` wrapper, componentes shared reutilizables (`<app-empty-block>`, `<app-skeleton>`), demo route para validación visual, y inventory matrix documentado.

**Architecture:** Extender el existing `src/styles/tokens.css` (no recrear) con tokens faltantes. Lucide-angular como icon library — wrapped en `<app-icon>` para size variants automáticos y type-safety. Empty-block y skeleton como componentes standalone que consumen los nuevos tokens. Demo route condicional development en `/dev/components` (oculta en prod via route guard o flag). Inventory matrix en `docs/ux-redesign/icon-inventory.md` documenta cada uno de los ~30-35 emojis cross-app y su Lucide replacement name.

**Tech Stack:** Angular 18 standalone + signals + computed. Jest (preset-angular) para tests. Lucide-angular (Apache 2.0). CSS variables. No SCSS — el codebase usa CSS vanilla.

---

## File Structure

**Modify**:
- `package.json` — add `lucide-angular` dependency
- `src/styles/tokens.css` — extend con `--sidebar-w`, modal tokens, animation tokens, z-index scale, hit-target token
- `src/app/app.routes.ts` — agregar `/dev/components` route condicional

**Create**:
- `src/app/shared/ui/icon/icon.component.ts` — `<app-icon name="X" size="Y">` wrapper
- `src/app/shared/ui/icon/icon.component.spec.ts` — Jest tests
- `src/app/shared/ui/icon/icon-map.ts` — mapeo strict name → Lucide icon ref
- `src/app/shared/ui/empty-block/empty-block.component.ts` — `<app-empty-block title sub icon><button>` slots
- `src/app/shared/ui/empty-block/empty-block.component.spec.ts`
- `src/app/shared/ui/skeleton/skeleton.component.ts` — `<app-skeleton variant="text|card|list" count="N">`
- `src/app/shared/ui/skeleton/skeleton.component.spec.ts`
- `src/app/dev/dev-components.component.ts` — demo de iconos + empty-block + skeleton
- `docs/ux-redesign/icon-inventory.md` — matrix emojis → Lucide names → surfaces

**Files NOT touched in A1**: surfaces existentes, modales actuales, sidebar, nav. Esos vienen en A2/A7/A8 cuando consumen esta foundation.

---

## Tasks

### Task 1: Install lucide-angular + verify build

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json` (auto via npm)

- [ ] **Step 1: Install lucide-angular**

Run:
```bash
npm install lucide-angular
```

Expected: `package.json` agrega `"lucide-angular": "^X.X.X"` en `dependencies` (no `devDependencies`).

- [ ] **Step 2: Verify install**

Run:
```bash
node -e "console.log(require('lucide-angular/package.json').version)"
```

Expected output: version string (e.g. `0.469.0`).

- [ ] **Step 3: Verify build still passes**

Run:
```bash
npx ng build --configuration=production
```

Expected: build success sin warnings nuevos. Bundle size delta documentar en commit message.

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json
git commit -m "feat(deps): add lucide-angular for SVG icon system

Required by A1 sub-project (UX redesign master plan).
Spec: docs/superpowers/specs/2026-05-28-ux-redesign-master-plan-design.md"
```

---

### Task 2: Extend tokens.css with sidebar + modal + animation + z-index + hit-target tokens

**Files:**
- Modify: `src/styles/tokens.css` (append antes del cierre `}` del `:root` block)

- [ ] **Step 1: Read current tokens.css**

Read `src/styles/tokens.css` para encontrar la sección donde van los nuevos tokens. Los tokens nuevos van **dentro del `:root { ... }` existente**, agregados al final antes del cierre. **Mantener orden lógico**: layout primitives → animation → semantic helpers.

- [ ] **Step 2: Add new tokens**

Append los siguientes tokens dentro de `:root` block (justo antes del closing `}`):

```css

  /* -------- Layout primitives (sidebar, modal, hit-target) -------- */
  /* Sidebar width: collapsed default. Componente <app-sidebar> mutates
     this value to 200px on hover. Shell + trivia-toast consume reactively
     via margin-left calc to evitar overlap (A3 bug fix). */
  --sidebar-w: 64px;

  /* Modal sizing — single source of truth para todos los modales unificados
     en sub-proyecto A2 (sistema `<app-modal>` reemplaza 4 paralelos). */
  --modal-radius: 16px;
  --modal-padding: 28px;
  --modal-padding-sm: 20px;
  --modal-padding-lg: 36px;
  --modal-max-width-sm: 380px;
  --modal-max-width-md: 480px;
  --modal-max-width-lg: 640px;

  /* Backdrop tokens — usados por todos los modales. */
  --modal-backdrop-color: rgba(0, 0, 0, 0.75);
  --modal-backdrop-blur: 6px;

  /* Logo size unificado — 5ta variante (28/32/40) consolidada a 1 token. */
  --logo-size-md: 32px;
  --logo-size-sm: 24px;
  --logo-size-lg: 48px;

  /* Hit target mínimo recomendado (Apple HIG 44pt / Material 48dp).
     Aplicar a buttons icon-only, close buttons, delete member buttons. */
  --hit-target-min: 44px;

  /* -------- Z-index scale (mental model: low to high) -------- */
  --z-base: 0;
  --z-sticky: 10;
  --z-overlay: 100;     /* tour-overlay, drawer mobile */
  --z-modal: 1000;      /* modales y dialogs */
  --z-dropdown: 1100;   /* dropdowns dentro de modales */
  --z-toast: 1500;      /* toasts global */
  --z-tooltip: 2000;    /* tooltips */

  /* -------- Animation durations + easings -------- */
  --anim-fast: 150ms;
  --anim-base: 200ms;
  --anim-slow: 300ms;

  --easing-default: cubic-bezier(0.4, 0, 0.2, 1);
  --easing-enter: cubic-bezier(0, 0, 0.2, 1);
  --easing-exit: cubic-bezier(0.4, 0, 1, 1);

  /* -------- prefers-reduced-motion safe defaults --------
     Components que respeten reduced-motion deben envolver sus animations
     con `@media (prefers-reduced-motion: reduce) { animation: none; }`
     (ver SkeletonComponent como ejemplo). NO hay helper class global —
     pattern in-component es preferido para evitar coupling. */
```

Verificación visual del bloque insertado: el orden lógico debe ser layout → z-index → animation, en ese orden. NO duplicar tokens que ya existan en el file (verificar antes con grep).

- [ ] **Step 3: Verify no duplicate tokens**

Run:
```bash
grep -c '\-\-sidebar-w\|--modal-radius\|--z-modal\|--anim-base\|--hit-target-min' src/styles/tokens.css
```

Expected output: `5` (each token aparece exactamente 1 vez).

- [ ] **Step 4: Verify build still passes**

Run:
```bash
npx ng build --configuration=development
```

Expected: build success.

- [ ] **Step 5: Commit**

```bash
git add src/styles/tokens.css
git commit -m "feat(tokens): extend design tokens with sidebar+modal+animation+z-index

A1 foundation: sidebar-w (consumed por shell+toast en A3 bug fix),
modal tokens (consumed por A2 unificado), z-index scale, animation
durations con easings, hit-target min, logo sizes unificados.

Spec: docs/superpowers/specs/2026-05-28-ux-redesign-master-plan-design.md"
```

---

### Task 3: Create icon name enum + register Lucide icons via DI

**Files:**
- Create: `src/app/shared/ui/icon/icon-map.ts`
- Modify: `src/app/app.config.ts` — register Lucide icons via `provideLucideIcons`

**API note (post-install discovery)**: `@lucide/angular@1.x` (the maintained replacement for deprecated `lucide-angular@0.x`) uses standalone provider API, NOT the Module API. Icons register via `provideLucideIcons({ name: LucideXxx, ... })` in app config, then referenced by name in templates (`<svg lucideIcon="bell"/>` or dynamic `[lucideIcon]="name()"`). Keys passed to `provideLucideIcons` are lower-kebab-cased automatically.

- [ ] **Step 1: Create icon-map.ts (TypeScript types only)**

Create `src/app/shared/ui/icon/icon-map.ts`:

```typescript
/**
 * Icon Map — TypeScript types para los iconos disponibles en <app-icon>.
 *
 * Single source of truth de qué nombres son válidos. Los icons en sí
 * se registran en app.config.ts via provideLucideIcons() y se
 * referencian por nombre en templates.
 *
 * Para agregar un icono:
 * 1. Importar el componente Lucide en app.config.ts (e.g. LucideBell).
 * 2. Agregarlo al provideLucideIcons({ ... }) con el nombre kebab-case.
 * 3. Agregar el nombre a ICON_NAMES aquí (TypeScript strict valida).
 *
 * Convención de naming: kebab-case minúsculas.
 */

export const ICON_NAMES = [
  // Navigation
  'home',
  'trophy',
  'users',
  'globe',
  'wrench',
  'bell',

  // Actions
  'close',
  'eye',
  'eye-off',
  'plus',
  'arrow-right',
  'arrow-left',
  'chevron-right',
  'chevron-left',
  'check',
  'alert',

  // Domain
  'clock',
  'star',
  'zap',
  'dice',
  'gift',
  'crown',
  'trash',
  'logout',
  'pencil',
  'clipboard',
  'mail',
  'lock',
  'settings',
  'undo',
  'search',
  'filter',
] as const;

export type IconName = typeof ICON_NAMES[number];

/** Size variants → pixel value. Consumido por <app-icon> y debe
 *  alinearse con design system spacing (no inventar valores). */
export const ICON_SIZE_PX = {
  sm: 16,
  md: 20,
  lg: 24,
  xl: 32,
} as const;

export type IconSize = keyof typeof ICON_SIZE_PX;
```

- [ ] **Step 2: Register icons in app.config.ts via provideLucideIcons**

Read current `src/app/app.config.ts` to find the `providers` array. Append `provideLucideIcons(...)` to it:

```typescript
import {
  provideLucideIcons,
  LucideHome,
  LucideTrophy,
  LucideUsers,
  LucideGlobe,
  LucideWrench,
  LucideBell,
  LucideX,
  LucideEye,
  LucideEyeOff,
  LucidePlus,
  LucideArrowRight,
  LucideArrowLeft,
  LucideChevronRight,
  LucideChevronLeft,
  LucideCheck,
  LucideCircleAlert,
  LucideClock,
  LucideStar,
  LucideZap,
  LucideDice5,
  LucideGift,
  LucideCrown,
  LucideTrash2,
  LucideLogOut,
  LucidePencil,
  LucideClipboardList,
  LucideMail,
  LucideLock,
  LucideSettings,
  LucideRotateCcw,
  LucideSearch,
  LucideFilter,
} from '@lucide/angular';

// In appConfig.providers array, append:
provideLucideIcons({
  'home': LucideHome,
  'trophy': LucideTrophy,
  'users': LucideUsers,
  'globe': LucideGlobe,
  'wrench': LucideWrench,
  'bell': LucideBell,
  'close': LucideX,
  'eye': LucideEye,
  'eye-off': LucideEyeOff,
  'plus': LucidePlus,
  'arrow-right': LucideArrowRight,
  'arrow-left': LucideArrowLeft,
  'chevron-right': LucideChevronRight,
  'chevron-left': LucideChevronLeft,
  'check': LucideCheck,
  'alert': LucideCircleAlert,
  'clock': LucideClock,
  'star': LucideStar,
  'zap': LucideZap,
  'dice': LucideDice5,
  'gift': LucideGift,
  'crown': LucideCrown,
  'trash': LucideTrash2,
  'logout': LucideLogOut,
  'pencil': LucidePencil,
  'clipboard': LucideClipboardList,
  'mail': LucideMail,
  'lock': LucideLock,
  'settings': LucideSettings,
  'undo': LucideRotateCcw,
  'search': LucideSearch,
  'filter': LucideFilter,
}),
```

**Validation**: keys (e.g. `'eye-off'`, `'arrow-right'`) are already kebab-case so `provideLucideIcons` won't transform them. Names match `ICON_NAMES` array in icon-map.ts. If any Lucide class name doesn't exist (e.g. `LucideDice5` might be `LucideDice` in newer versions), grep `node_modules/@lucide/angular/types/lucide-angular.d.ts` for the correct name.

- [ ] **Step 3: Verify build**

Run:
```bash
npx ng build --configuration=development
```

Expected: build success. If TS errors, verify imports exist in `@lucide/angular` (`grep '^export.*LucideXxx' node_modules/@lucide/angular/types/lucide-angular.d.ts`).

- [ ] **Step 4: Commit**

```bash
git add src/app/shared/ui/icon/icon-map.ts src/app/app.config.ts
git commit -m "feat(icon): add icon-map + register 30 Lucide icons via DI

Single source of truth para nombres válidos en <app-icon>. TypeScript
strict valida IconName en compile time. Icons registered via
provideLucideIcons() in app.config.ts (v1 API of @lucide/angular)."
```

---

### Task 4: Write failing test for IconComponent basic render

**Files:**
- Create: `src/app/shared/ui/icon/icon.component.spec.ts`

- [ ] **Step 1: Create spec file with failing test**

Create `src/app/shared/ui/icon/icon.component.spec.ts`:

```typescript
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { IconComponent } from './icon.component';

describe('IconComponent', () => {
  let fixture: ComponentFixture<IconComponent>;
  let component: IconComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [IconComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(IconComponent);
    component = fixture.componentInstance;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('renders an svg element for valid icon name', () => {
    fixture.componentRef.setInput('name', 'bell');
    fixture.detectChanges();
    const svg = fixture.nativeElement.querySelector('svg');
    expect(svg).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test to verify it FAILS**

Run:
```bash
npx jest src/app/shared/ui/icon/icon.component.spec.ts
```

Expected: FAIL — "Cannot find module './icon.component'" o similar. **Esto confirma que estamos en TDD red phase**.

---

### Task 5: Implement minimal IconComponent

**Files:**
- Create: `src/app/shared/ui/icon/icon.component.ts`

**API note**: `@lucide/angular@1.x` uses the `LucideDynamicIcon` standalone component with selector `svg[lucideIcon]` and `[lucideIcon]` input binding for dynamic icon name. Icon names are resolved via the registry created by `provideLucideIcons()` in `app.config.ts` (see Task 3 Step 2).

- [ ] **Step 1: Create icon.component.ts**

Create `src/app/shared/ui/icon/icon.component.ts`:

```typescript
import { Component, computed, input } from '@angular/core';
import { LucideDynamicIcon } from '@lucide/angular';
import { ICON_SIZE_PX, type IconName, type IconSize } from './icon-map';

/**
 * `<app-icon name="bell" size="md">` — SVG icon wrapper sobre @lucide/angular.
 *
 * - `name` es type-checked contra IconName (icon-map.ts).
 * - `size` es one of sm/md/lg/xl, mapea a px desde design tokens.
 * - aria-hidden por default (decorative). Para iconos con meaning,
 *   setear `decorative="false"` y agregar `aria-label` en el container.
 *
 * Icons deben estar registrados en app.config.ts via provideLucideIcons()
 * con el mismo nombre kebab-case. Si el nombre no existe en el registry,
 * LucideDynamicIcon NO renderiza nada (no throws).
 */
@Component({
  standalone: true,
  selector: 'app-icon',
  imports: [LucideDynamicIcon],
  template: `
    <svg lucideIcon
         [lucideIcon]="name()"
         [size]="px()"
         [attr.aria-hidden]="decorative() ? 'true' : null"></svg>
  `,
  styles: [`
    :host {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
      line-height: 0;
    }
  `],
})
export class IconComponent {
  name = input.required<IconName>();
  size = input<IconSize>('md');
  decorative = input<boolean>(true);

  px = computed(() => ICON_SIZE_PX[this.size()]);
}
```

- [ ] **Step 2: Run test to verify it PASSES**

Run:
```bash
npx jest src/app/shared/ui/icon/icon.component.spec.ts
```

Expected output: `Tests: 2 passed, 2 total`.

**Note for test setup**: Tests need access to the `provideLucideIcons` registry. If test fails because icon doesn't render, the test TestBed needs the same provider as app.config.ts. Adapt the spec's `beforeEach` to add `providers: [provideLucideIcons({ bell: LucideBell, /* ... */ })]` if needed.

- [ ] **Step 3: Commit**

```bash
git add src/app/shared/ui/icon/icon.component.ts src/app/shared/ui/icon/icon.component.spec.ts
git commit -m "feat(icon): add IconComponent with basic render

TDD pattern: failing test first, then minimal implementation.
Wraps LucideDynamicIcon with type-safe name + size variants. Icons
resolved via provideLucideIcons() registry in app.config.ts."
```

---

### Task 6: Add size variant test + verify

**Files:**
- Modify: `src/app/shared/ui/icon/icon.component.spec.ts`

- [ ] **Step 1: Add size variant test**

Append al describe block en `icon.component.spec.ts`:

```typescript

  it('applies correct pixel size for each variant', () => {
    fixture.componentRef.setInput('name', 'bell');

    fixture.componentRef.setInput('size', 'sm');
    fixture.detectChanges();
    let svg = fixture.nativeElement.querySelector('svg');
    expect(svg.getAttribute('width')).toBe('16');

    fixture.componentRef.setInput('size', 'md');
    fixture.detectChanges();
    svg = fixture.nativeElement.querySelector('svg');
    expect(svg.getAttribute('width')).toBe('20');

    fixture.componentRef.setInput('size', 'lg');
    fixture.detectChanges();
    svg = fixture.nativeElement.querySelector('svg');
    expect(svg.getAttribute('width')).toBe('24');

    fixture.componentRef.setInput('size', 'xl');
    fixture.detectChanges();
    svg = fixture.nativeElement.querySelector('svg');
    expect(svg.getAttribute('width')).toBe('32');
  });
```

- [ ] **Step 2: Run test to verify PASS**

Run:
```bash
npx jest src/app/shared/ui/icon/icon.component.spec.ts
```

Expected output: `Tests: 3 passed, 3 total`.

- [ ] **Step 3: Commit**

```bash
git add src/app/shared/ui/icon/icon.component.spec.ts
git commit -m "test(icon): verify size variants apply correct pixel value"
```

---

### Task 7: Add aria-hidden test + verify

**Files:**
- Modify: `src/app/shared/ui/icon/icon.component.spec.ts`

- [ ] **Step 1: Add aria test**

Append al describe block:

```typescript

  it('sets aria-hidden=true when decorative (default)', () => {
    fixture.componentRef.setInput('name', 'bell');
    fixture.detectChanges();
    const lucideIcon = fixture.nativeElement.querySelector('lucide-icon');
    expect(lucideIcon.getAttribute('aria-hidden')).toBe('true');
  });

  it('omits aria-hidden when decorative=false (semantic icon)', () => {
    fixture.componentRef.setInput('name', 'bell');
    fixture.componentRef.setInput('decorative', false);
    fixture.detectChanges();
    const lucideIcon = fixture.nativeElement.querySelector('lucide-icon');
    expect(lucideIcon.getAttribute('aria-hidden')).toBeNull();
  });
```

- [ ] **Step 2: Run test**

Run:
```bash
npx jest src/app/shared/ui/icon/icon.component.spec.ts
```

Expected output: `Tests: 5 passed, 5 total`.

- [ ] **Step 3: Commit**

```bash
git add src/app/shared/ui/icon/icon.component.spec.ts
git commit -m "test(icon): verify aria-hidden handling for decorative vs semantic"
```

---

### Task 8: Create EmptyBlockComponent failing test

**Files:**
- Create: `src/app/shared/ui/empty-block/empty-block.component.spec.ts`

- [ ] **Step 1: Create spec file**

Create `src/app/shared/ui/empty-block/empty-block.component.spec.ts`:

```typescript
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { EmptyBlockComponent } from './empty-block.component';

describe('EmptyBlockComponent', () => {
  let fixture: ComponentFixture<EmptyBlockComponent>;
  let component: EmptyBlockComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [EmptyBlockComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(EmptyBlockComponent);
    component = fixture.componentInstance;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('renders title and sub when provided', () => {
    fixture.componentRef.setInput('title', 'Sin grupos');
    fixture.componentRef.setInput('sub', 'Crea uno para empezar');
    fixture.detectChanges();

    const h3 = fixture.nativeElement.querySelector('.empty-block__title');
    expect(h3.textContent.trim()).toBe('Sin grupos');

    const p = fixture.nativeElement.querySelector('.empty-block__sub');
    expect(p.textContent.trim()).toBe('Crea uno para empezar');
  });

  it('renders icon when iconName provided', () => {
    fixture.componentRef.setInput('title', 'Sin grupos');
    fixture.componentRef.setInput('iconName', 'users');
    fixture.detectChanges();

    const icon = fixture.nativeElement.querySelector('app-icon');
    expect(icon).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test to verify FAIL**

Run:
```bash
npx jest src/app/shared/ui/empty-block/empty-block.component.spec.ts
```

Expected: FAIL — "Cannot find module './empty-block.component'".

---

### Task 9: Implement EmptyBlockComponent

**Files:**
- Create: `src/app/shared/ui/empty-block/empty-block.component.ts`

- [ ] **Step 1: Create component**

Create `src/app/shared/ui/empty-block/empty-block.component.ts`:

```typescript
import { Component, input } from '@angular/core';
import { IconComponent } from '../icon/icon.component';
import type { IconName } from '../icon/icon-map';

/**
 * `<app-empty-block>` — Sistema unificado de empty state.
 * Reemplaza 5 sistemas paralelos documentados en el walkthrough UX:
 * `.empty-block` (bracket/groups/comodines), `.form-card__hint`, inline
 * styles `<div style=padding...>`, `.loading-msg`, `.empty-state`.
 *
 * Slots:
 * - title (input): h3 prominent del estado.
 * - sub (input): descripción opcional.
 * - iconName (input): Lucide icon name decorative arriba del title.
 * - <ng-content>: slot para CTAs (botones).
 *
 * Uso típico:
 *   <app-empty-block
 *     iconName="users"
 *     title="Sin grupos"
 *     sub="Crea uno para empezar a competir con tus panas.">
 *     <button class="btn btn--primary">Crear grupo</button>
 *     <button class="btn btn--ghost">Unirme con código</button>
 *   </app-empty-block>
 */
@Component({
  standalone: true,
  selector: 'app-empty-block',
  imports: [IconComponent],
  template: `
    <div class="empty-block">
      @if (iconName(); as icon) {
        <div class="empty-block__icon">
          <app-icon [name]="icon" size="xl" />
        </div>
      }
      <h3 class="empty-block__title">{{ title() }}</h3>
      @if (sub(); as sub) {
        <p class="empty-block__sub">{{ sub }}</p>
      }
      <div class="empty-block__actions">
        <ng-content />
      </div>
    </div>
  `,
  styles: [`
    :host { display: block; }
    .empty-block {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: var(--space-md);
      padding: var(--space-xl) var(--space-md);
      background: var(--color-primary-white);
      border: 1px solid var(--color-line);
      border-radius: 14px;
      text-align: center;
    }
    .empty-block__icon {
      color: var(--color-text-muted);
    }
    .empty-block__title {
      font-family: var(--font-display);
      font-size: var(--fs-lg);
      letter-spacing: 0.02em;
      margin: 0;
      color: var(--color-primary-black);
    }
    .empty-block__sub {
      font-size: var(--fs-sm);
      line-height: var(--lh-body);
      color: var(--color-text-muted);
      margin: 0;
      max-width: 360px;
    }
    .empty-block__actions {
      display: flex;
      gap: var(--space-sm);
      flex-wrap: wrap;
      justify-content: center;
      margin-top: var(--space-sm);
    }
    .empty-block__actions:empty {
      display: none;
    }
  `],
})
export class EmptyBlockComponent {
  title = input.required<string>();
  sub = input<string>();
  iconName = input<IconName>();
}
```

- [ ] **Step 2: Run test to verify PASS**

Run:
```bash
npx jest src/app/shared/ui/empty-block/empty-block.component.spec.ts
```

Expected output: `Tests: 3 passed, 3 total`.

- [ ] **Step 3: Commit**

```bash
git add src/app/shared/ui/empty-block/
git commit -m "feat(empty-block): add EmptyBlockComponent shared

Reemplaza 5 sistemas paralelos de empty states documentados en
walkthrough (G3 cross-cutting pattern). Consumido por A8 surfaces
durante refactor."
```

---

### Task 10: Create SkeletonComponent failing test

**Files:**
- Create: `src/app/shared/ui/skeleton/skeleton.component.spec.ts`

- [ ] **Step 1: Create spec file**

Create `src/app/shared/ui/skeleton/skeleton.component.spec.ts`:

```typescript
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { SkeletonComponent } from './skeleton.component';

describe('SkeletonComponent', () => {
  let fixture: ComponentFixture<SkeletonComponent>;
  let component: SkeletonComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SkeletonComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(SkeletonComponent);
    component = fixture.componentInstance;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('renders N skeleton items for count input', () => {
    fixture.componentRef.setInput('count', 3);
    fixture.detectChanges();
    const items = fixture.nativeElement.querySelectorAll('.skeleton__item');
    expect(items.length).toBe(3);
  });

  it('applies correct variant class', () => {
    fixture.componentRef.setInput('variant', 'card');
    fixture.detectChanges();
    const item = fixture.nativeElement.querySelector('.skeleton__item');
    expect(item.classList.contains('skeleton__item--card')).toBe(true);
  });

  it('has aria-busy true for screen readers', () => {
    fixture.detectChanges();
    const container = fixture.nativeElement.querySelector('.skeleton');
    expect(container.getAttribute('aria-busy')).toBe('true');
  });
});
```

- [ ] **Step 2: Run test to verify FAIL**

Run:
```bash
npx jest src/app/shared/ui/skeleton/skeleton.component.spec.ts
```

Expected: FAIL.

---

### Task 11: Implement SkeletonComponent

**Files:**
- Create: `src/app/shared/ui/skeleton/skeleton.component.ts`

- [ ] **Step 1: Create component**

Create `src/app/shared/ui/skeleton/skeleton.component.ts`:

```typescript
import { Component, computed, input } from '@angular/core';

export type SkeletonVariant = 'text' | 'card' | 'list' | 'circle';

/**
 * `<app-skeleton variant="card" count="3">` — Loading placeholder reutilizable.
 *
 * Reemplaza el pattern "Cargando…" plain text ubiquitous en surfaces
 * (G11 cross-cutting). Respeta prefers-reduced-motion automáticamente.
 *
 * Variants:
 * - text: línea horizontal (default)
 * - card: bloque rectangular para card placeholders
 * - list: filas con avatar + texto (member list, ranking)
 * - circle: avatar circular
 */
@Component({
  standalone: true,
  selector: 'app-skeleton',
  template: `
    <div class="skeleton" aria-busy="true" aria-label="Cargando contenido">
      @for (_ of countArray(); track $index) {
        <div class="skeleton__item" [class]="variantClass()"></div>
      }
    </div>
  `,
  styles: [`
    :host { display: block; }
    .skeleton {
      display: flex;
      flex-direction: column;
      gap: var(--space-sm);
    }
    .skeleton__item {
      background: linear-gradient(
        90deg,
        rgba(0, 0, 0, 0.06) 25%,
        rgba(0, 0, 0, 0.10) 50%,
        rgba(0, 0, 0, 0.06) 75%
      );
      background-size: 200% 100%;
      animation: skeleton-shimmer 1.5s var(--easing-default) infinite;
      border-radius: 6px;
    }
    @media (prefers-reduced-motion: reduce) {
      .skeleton__item {
        animation: none;
        background: rgba(0, 0, 0, 0.06);
      }
    }
    @keyframes skeleton-shimmer {
      0%   { background-position: 200% 0; }
      100% { background-position: -200% 0; }
    }

    .skeleton__item--text  { height: 14px; width: 100%; }
    .skeleton__item--card  { height: 120px; width: 100%; border-radius: 12px; }
    .skeleton__item--list  { height: 56px; width: 100%; border-radius: 8px; }
    .skeleton__item--circle{ height: 40px; width: 40px; border-radius: 50%; align-self: flex-start; }
  `],
})
export class SkeletonComponent {
  variant = input<SkeletonVariant>('text');
  count = input<number>(1);

  countArray = computed(() => Array.from({ length: this.count() }, (_, i) => i));
  variantClass = computed(() => `skeleton__item--${this.variant()}`);
}
```

- [ ] **Step 2: Run test to verify PASS**

Run:
```bash
npx jest src/app/shared/ui/skeleton/skeleton.component.spec.ts
```

Expected output: `Tests: 4 passed, 4 total`.

- [ ] **Step 3: Commit**

```bash
git add src/app/shared/ui/skeleton/
git commit -m "feat(skeleton): add SkeletonComponent with prefers-reduced-motion

Reemplaza 'Cargando…' plain text pattern ubiquitous (G11 cross-cutting).
4 variants: text, card, list, circle. Respeta prefers-reduced-motion."
```

---

### Task 12: Create dev/components demo route

**Files:**
- Create: `src/app/dev/dev-components.component.ts`
- Modify: `src/app/app.routes.ts`

- [ ] **Step 1: Create demo component**

Create `src/app/dev/dev-components.component.ts`:

```typescript
import { Component } from '@angular/core';
import { IconComponent } from '../shared/ui/icon/icon.component';
import { EmptyBlockComponent } from '../shared/ui/empty-block/empty-block.component';
import { SkeletonComponent } from '../shared/ui/skeleton/skeleton.component';
import { ICON_MAP } from '../shared/ui/icon/icon-map';

/**
 * Dev-only route at `/dev/components` para visualizar componentes
 * shared del design system: <app-icon>, <app-empty-block>, <app-skeleton>.
 *
 * Útil durante desarrollo + para QA visual review. Route oculta en prod
 * via environment.production check en app.routes.ts.
 */
@Component({
  standalone: true,
  selector: 'app-dev-components',
  imports: [IconComponent, EmptyBlockComponent, SkeletonComponent],
  template: `
    <main style="padding: 32px; max-width: 1100px; margin: 0 auto;">
      <h1 style="font-family: var(--font-display); margin-bottom: 24px;">
        Dev · Design System Components
      </h1>

      <section style="margin-bottom: 48px;">
        <h2 style="margin-bottom: 16px;">Icons ({{ iconNames.length }})</h2>
        <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(120px, 1fr)); gap: 12px;">
          @for (name of iconNames; track name) {
            <div style="display: flex; flex-direction: column; align-items: center; gap: 6px; padding: 12px; border: 1px solid var(--color-line); border-radius: 8px;">
              <app-icon [name]="name" size="lg" />
              <code style="font-size: 11px;">{{ name }}</code>
            </div>
          }
        </div>
        <h3 style="margin: 24px 0 8px;">Size variants</h3>
        <div style="display: flex; gap: 16px; align-items: center;">
          <app-icon name="bell" size="sm" /> <span>sm 16px</span>
          <app-icon name="bell" size="md" /> <span>md 20px</span>
          <app-icon name="bell" size="lg" /> <span>lg 24px</span>
          <app-icon name="bell" size="xl" /> <span>xl 32px</span>
        </div>
      </section>

      <section style="margin-bottom: 48px;">
        <h2 style="margin-bottom: 16px;">EmptyBlock variants</h2>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 24px;">
          <app-empty-block
            iconName="users"
            title="Sin grupos"
            sub="Crea uno para empezar a competir con tus panas." />
          <app-empty-block
            iconName="trophy"
            title="Sin ranking"
            sub="Aún no hay datos suficientes.">
            <button class="btn btn--primary">Hacer mis picks</button>
          </app-empty-block>
        </div>
      </section>

      <section style="margin-bottom: 48px;">
        <h2 style="margin-bottom: 16px;">Skeleton variants</h2>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 24px;">
          <div>
            <h4>text × 3</h4>
            <app-skeleton variant="text" [count]="3" />
          </div>
          <div>
            <h4>card × 2</h4>
            <app-skeleton variant="card" [count]="2" />
          </div>
          <div>
            <h4>list × 4</h4>
            <app-skeleton variant="list" [count]="4" />
          </div>
          <div>
            <h4>circle × 3</h4>
            <app-skeleton variant="circle" [count]="3" />
          </div>
        </div>
      </section>
    </main>
  `,
})
export class DevComponentsComponent {
  iconNames = Object.keys(ICON_MAP);
}
```

- [ ] **Step 2: Add route to app.routes.ts (only in non-prod)**

Read current `src/app/app.routes.ts` para encontrar el array `routes`. Agregar route condicional **DENTRO** del array:

```typescript
import { environment } from '../environments/environment';

// ... existing routes ...

// Dev-only route — solo cuando NO está en producción
...(environment.production ? [] : [{
  path: 'dev/components',
  loadComponent: () =>
    import('./dev/dev-components.component').then((m) => m.DevComponentsComponent),
}]),
```

Si `environments/environment.ts` no tiene `production` field, verificar el setup. Default Angular CLI lo tiene.

- [ ] **Step 3: Run dev server + verify visit**

Run:
```bash
npx ng serve
```

Wait until "Compiled successfully". Open browser at `http://localhost:4200/dev/components`.

Expected: page renders showing all icons + EmptyBlock variants + Skeleton variants. Sin errors en console.

- [ ] **Step 4: Verify production build doesn't include the route**

Run:
```bash
npx ng build --configuration=production
```

Inspect `dist/<project>/index.html` o el bundle output. Verify NO mention de "DevComponentsComponent" in production main bundle. Tree-shaking debe excluirlo via environment.production check.

- [ ] **Step 5: Commit**

```bash
git add src/app/dev/ src/app/app.routes.ts
git commit -m "feat(dev): add /dev/components demo route for A1 design system

Dev-only route visualizing IconComponent, EmptyBlockComponent,
SkeletonComponent. Excluded from production via environment check.
Used for visual QA during A1 implementation."
```

---

### Task 13: Create icon inventory matrix documentation

**Files:**
- Create: `docs/ux-redesign/icon-inventory.md`

- [ ] **Step 1: Create inventory matrix**

Create `docs/ux-redesign/icon-inventory.md`:

```markdown
# Icon Inventory Matrix

> Mapping de emojis usados como icons cross-app (anti-pattern documentado en walkthrough) a sus reemplazos Lucide. Sub-proyecto A1 implementa la fundación; A2-A8 reemplazan progresivamente cada emoji por `<app-icon name="X">`.

## Conventions

- Nombre Lucide: kebab-case minúsculas. Mapea 1:1 al `IconName` enum en `src/app/shared/ui/icon/icon-map.ts`.
- Si un emoji aparece en múltiples surfaces, se documenta cada surface.
- Si Lucide no tiene equivalente directo, propose alternativa.

## Inventory

| Emoji | Surface(s) | Doc(s) | Lucide name | Notas |
|---|---|---|---|---|
| 🏠 | sidebar, mobile bottom-nav, profile | 30, 14 | `home` | |
| ⚽ | sidebar, onboarding hero, picks page nav | 30, 21, 02 | `dice` o ilustración brand (sin equivalente fútbol directo Lucide) | Considerar SVG custom para ⚽ — fútbol específico. Onboarding hero: usar ilustración brand. |
| 👥 | sidebar | 30 | `users` | |
| 🏆 | sidebar, ranking, home KPI | 30, 07, 01 | `trophy` | |
| 🌎 | sidebar | 30 | `globe` | |
| 🛠 | sidebar (admin) | 30 | `wrench` | |
| 🔔 | sidebar, nav topbar mobile | 30, 31 | `bell` | |
| ⏻ | nav user dropdown | 31 | `logout` (Lucide `LogOut`) | |
| 👤 | nav user dropdown | 31 | (avatar component) | No reemplazar — usar `<app-user-avatar>`. |
| ✕ | TODOS los modales close button | 22-29, 34 | `close` (Lucide `X`) | Sweep ubiquitous |
| 👁 / 👁️‍🗨️ | login, register password toggle | 17, 18 | `eye` / `eye-off` | |
| ＋ | onboarding CTA, comodines, etc. | 21, 13 | `plus` | |
| → | múltiple CTAs ("Crear cuenta →", "Hacer picks →") | 17, 18, 21, ... | `arrow-right` | |
| ← | back links | 19, 20, 21 | `arrow-left` | |
| ‹ | auth back link | 17 | `chevron-left` | |
| › | sidebar/nav | 31 | `chevron-right` | |
| ✓ | varios estados success | 22, 25, 27 | `check` | |
| ⚠ | error states, warnings | 22, 25, 32 | `alert` (Lucide `CircleAlert`) | |
| ⏱ / 🕐 | timer, kickoff countdown | 23, 27, 32 | `clock` | |
| ★ | group-join (kicker) | 20 | `star` | |
| ⚡ | trivia FAB + modal | 23 | `zap` | |
| 🎲 | randomizer modal + button | 24 | `dice` | |
| 🃏 | comodines | 13, 25 | `gift` | Alternativa: SVG custom comodín card. |
| 🎁 | comodines CTA "Canjear" | 13, 25 | `gift` | |
| 👑 | transfer admin | 28 | `crown` | |
| 🗑 | delete actions | 09 | `trash` | |
| ✏ | edit actions | 09, 31 | `pencil` | |
| 📋 | clipboard / copy code | 09 | `clipboard` | |
| ✉ | invite by email | 12 | `mail` | |
| 🔒 | profile cuenta | 14 | `lock` | |
| ⚙ | profile settings | 14 | `settings` | |
| ↩ | profile back | 14 | `undo` | |
| 💡 | trivia tip + redeem tip | 18, 19, 25 | `alert` o sin icon | Tip text puede no necesitar icono. |
| 📅 | picks day kicker | 02 | (typography only) | Reemplazar con tipografía clara, no icon. |
| 🔮 | bracket projection banner | 05 | (sin reemplazo directo) | Considerar `wand` o ilustración. Decisión durante A8b. |
| 🏳️ | flag fallback right-rail | 32 | (sin reemplazo) | Eliminar fallback — usar `?` o team initials. |
| 🥇🥈🥉 | ranking podium, group-detail premios | 07, 09 | (typography only) | Reemplazar con "1º 2º 3º" o medals SVG si existen en Lucide (`Medal`, `Award`). |
| 🥤👟 | picks page ads hardcoded | 02 | (eliminar — son ads hardcoded a borrar en A4) | N/A |

## Totals (Sprint 1 target)

- Unique Lucide icons registered: **30** (ver `ICON_MAP` en icon-map.ts)
- Surfaces consumiendo: ~36 (todos los end-user surfaces)
- Sprint en que se reemplazan:
  - Sidebar 7 icons → A8a (sidebar mobile)
  - Modal closes ✕ × 8 → A2 (modal unification)
  - Auth password eye → A7 (auth family)
  - Resto progresivo en A8b/A8c/A8d

## Custom SVG candidates (no Lucide)

Algunos emojis no tienen equivalente Lucide directo. Estos casos requieren decisión durante implementation:

- ⚽ (fútbol): considerar custom SVG soccer ball OR ilustración brand Golgana
- 🃏 (comodín card): considerar custom SVG playing card
- 🔮 (crystal ball / proyección): considerar `wand` o ilustración bracket
- 🏳️ (flag fallback): eliminar fallback completamente, usar text initials

Decisiones documentar en commit messages de los sub-proyectos que las apliquen.

---

**Cross-reference**: spec `docs/superpowers/specs/2026-05-28-ux-redesign-master-plan-design.md` sección A1.
```

- [ ] **Step 2: Commit**

```bash
git add docs/ux-redesign/icon-inventory.md
git commit -m "docs(icon-inventory): map ~30 emojis cross-app to Lucide names

Documenta cada emoji usado como icon, surface origen, Lucide replacement.
Custom SVG candidates (⚽🃏🔮) flagged para decisión durante A2/A8."
```

---

### Task 14: Final verification + audit

**Files:** Ninguno modificado en este task — solo verificación.

- [ ] **Step 1: Run all tests**

Run:
```bash
npx jest src/app/shared/ui/
```

Expected: All passing. Total `Tests: 12 passed, 12 total` aproximadamente.

- [ ] **Step 2: Run production build**

Run:
```bash
npx ng build --configuration=production
```

Expected: build success. **Documentar bundle size delta** en final commit (compare with main branch).

```bash
ls -lh dist/*/main*.js | awk '{print $5, $9}'
```

- [ ] **Step 3: Verify token additions**

Run:
```bash
grep -c '\-\-sidebar-w\b' src/styles/tokens.css
grep -c '\-\-modal-radius\b' src/styles/tokens.css
grep -c '\-\-z-modal\b' src/styles/tokens.css
grep -c '\-\-anim-base\b' src/styles/tokens.css
grep -c '\-\-hit-target-min\b' src/styles/tokens.css
```

Expected: cada output = `1` (token exists, declared once).

- [ ] **Step 4: Verify component files**

Run:
```bash
ls src/app/shared/ui/icon/ src/app/shared/ui/empty-block/ src/app/shared/ui/skeleton/
```

Expected: cada directory contiene `*.component.ts` + `*.component.spec.ts` + (en icon) `icon-map.ts`.

- [ ] **Step 5: Verify demo route**

Run dev server + open `http://localhost:4200/dev/components`. Verify visual rendering correctly:
- All ~30 icons render
- Size variants visible
- EmptyBlock variants render
- Skeleton variants animate

- [ ] **Step 6: Final acceptance gate checklist**

Verificar contra los acceptance criteria del spec A1:

- [x] `src/styles/tokens.css` extended con todos los nuevos tokens documentados.
- [x] Lucide integrada via npm (lucide-angular installed).
- [x] `<app-icon>` renderiza en demo route `/dev/components` (development only).
- [x] **Inventory matrix** `docs/ux-redesign/icon-inventory.md` documenta ~30 emojis mapeados.
- [x] CI: `ng build --configuration=production` sin warnings nuevos.
- [x] No tocan surfaces existentes todavía (solo infra).
- [x] Componentes adicionales del synthesis: EmptyBlock + Skeleton creados.

- [ ] **Step 7: Final commit + summary**

Si hay cambios sin commitear (verificar `git status`), commit. Si todo está commiteado, crear merge commit summary opcional.

```bash
git log --oneline -10
```

Verify commits previos están bien organizados (1 por feature paso).

---

## Summary

A1 produce 5 outputs principales:
1. **Lucide-angular integrado** + `<app-icon>` wrapper type-safe con size variants
2. **Tokens extendidos** en `tokens.css`: sidebar-w, modal-*, z-index scale, animations, hit-target, logo sizes
3. **`<app-empty-block>`** componente shared para unificar 5 sistemas de empty states
4. **`<app-skeleton>`** componente shared con prefers-reduced-motion
5. **Inventory matrix** documentando ~30 emojis cross-app y sus reemplazos

**Sub-proyectos downstream que consumen A1**:
- A2 modal system → tokens modal-* + close icon
- A3 bugs → `--sidebar-w` token consumido por shell+toast (fix overlap)
- A7 auth family → eye toggle icons + empty-block + skeleton
- A8 surfaces → todas las consumirán + reemplazarán emojis

**Estimación**: ~1 semana (14 tasks × 5-15 min cada una + integration testing).

**Dispatch strategy**: 1 sub-agente opus 4.7 coordinador. Tasks granulares secuenciales — no se prestan a paralelización fina porque cada componente depende del anterior (icon → empty-block → skeleton → demo).

**Next**: una vez A1 mergeado, A2 (modal unificado), A5 (sweep tone+branding), y A8 sub-fases pueden empezar a consumir esta foundation.
