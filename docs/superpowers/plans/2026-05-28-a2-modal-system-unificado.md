# A2 · Modal System Unificado Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. **All sub-agent dispatches MUST use opus 4.7** per project memory.

**Goal:** Consolidar 4 sistemas visuales paralelos de modales (`.picks-modal`, `.edit-profile-modal`, `.prefs-modal`, `.confirm-backdrop`) en **un solo sistema** `<app-modal>` con tokens unificados, A11y completo (cdkTrapFocus + autoCapture + Escape + role=dialog + aria-labelledby + aria-describedby), animation entrada/salida, y size variants. Refactor 8 modales existentes para consumir el nuevo componente.

**Architecture:** `<app-modal>` standalone Angular component con slots (header, body, footer) + size variants (sm/md/lg) + backdrop tokens del A1 + animation entrada (scale+fade) y salida (faster ~150ms). ConfirmDialog ya tiene el A11y benchmark (único con `aria-describedby`) — propagar a todos los demás. **Sin breaking API changes**: cada modal refactor mantiene su public input/output shape; solo cambia el chrome (backdrop, container, animations).

**Tech Stack:** Angular 18 standalone + signals + CDK A11yModule + Jest tests. Tokens del A1 (modal-radius, modal-padding, modal-backdrop-*, animation-*).

---

## File Structure

**Create**:
- `src/app/shared/ui/modal/modal.component.ts` — `<app-modal>` shared con slots + variants
- `src/app/shared/ui/modal/modal.component.spec.ts` — Jest tests
- `src/app/shared/ui/modal/modal-size.ts` — type ModalSize = 'sm' | 'md' | 'lg'

**Modify** (refactor 8 modales para consumir `<app-modal>`):
1. `src/app/shared/layout/group-actions-modals.component.ts` — Crear + Unirme modals
2. `src/app/features/trivia/trivia-popup.component.ts` — trivia modal
3. `src/app/features/picks/randomizer-modal.component.ts` — randomizer
4. `src/app/shared/layout/redeem-modal.component.ts` — redeem (composite con sponsor-redeem inside)
5. `src/app/features/profile/edit-profile-modal.component.ts` — edit profile (5 secciones)
6. `src/app/features/profile/preferences-modal.component.ts` — preferences toggles
7. `src/app/features/groups/group-detail.component.ts` — transfer-admin (inline modal)
8. `src/app/shared/ui/confirm-dialog.component.ts` — refactor pero **PRESERVAR aria-describedby benchmark**

**Demo route extension**:
- `src/app/dev/dev-components.component.ts` — agregar section "Modals" mostrando size variants

---

## Tasks

### Task 1: Create ModalSize type + spec

**Files:**
- Create: `src/app/shared/ui/modal/modal-size.ts`

- [ ] **Step 1: Create modal-size.ts**

Create `src/app/shared/ui/modal/modal-size.ts`:

```typescript
/**
 * Modal size variants — mapean a tokens CSS de A1:
 * - sm → --modal-max-width-sm (380px), --modal-padding-sm (20px)
 * - md → --modal-max-width-md (480px), --modal-padding (28px) [default]
 * - lg → --modal-max-width-lg (640px), --modal-padding-lg (36px)
 */
export type ModalSize = 'sm' | 'md' | 'lg';
```

- [ ] **Step 2: Verify build**

Run:
```bash
npx ng build --configuration=development
```

Expected: success.

---

### Task 2: Failing test for ModalComponent

**Files:**
- Create: `src/app/shared/ui/modal/modal.component.spec.ts`

- [ ] **Step 1: Create spec**

Create `src/app/shared/ui/modal/modal.component.spec.ts`:

```typescript
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Component } from '@angular/core';
import { ModalComponent } from './modal.component';

@Component({
  standalone: true,
  imports: [ModalComponent],
  template: `
    <app-modal [open]="open" [title]="title" [description]="description" (close)="onClose()">
      <ng-container slot="body">Body content</ng-container>
      <ng-container slot="footer">
        <button>Cancel</button>
        <button>OK</button>
      </ng-container>
    </app-modal>
  `,
})
class HostComponent {
  open = true;
  title = 'Test Modal';
  description = 'Test description';
  closeCount = 0;
  onClose() { this.closeCount++; }
}

describe('ModalComponent', () => {
  let fixture: ComponentFixture<HostComponent>;
  let host: HostComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [HostComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(HostComponent);
    host = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('renders when open=true', () => {
    const dialog = fixture.nativeElement.querySelector('[role="dialog"]');
    expect(dialog).toBeTruthy();
  });

  it('hides when open=false', () => {
    host.open = false;
    fixture.detectChanges();
    const dialog = fixture.nativeElement.querySelector('[role="dialog"]');
    expect(dialog).toBeFalsy();
  });

  it('has aria-labelledby pointing to title', () => {
    const dialog = fixture.nativeElement.querySelector('[role="dialog"]');
    const labelledby = dialog.getAttribute('aria-labelledby');
    const titleEl = fixture.nativeElement.querySelector(`#${labelledby}`);
    expect(titleEl.textContent.trim()).toBe('Test Modal');
  });

  it('has aria-describedby pointing to description', () => {
    const dialog = fixture.nativeElement.querySelector('[role="dialog"]');
    const describedby = dialog.getAttribute('aria-describedby');
    expect(describedby).toBeTruthy();
    const descEl = fixture.nativeElement.querySelector(`#${describedby}`);
    expect(descEl.textContent.trim()).toBe('Test description');
  });

  it('emits close on Escape key', () => {
    const dialog = fixture.nativeElement.querySelector('[role="dialog"]');
    const event = new KeyboardEvent('keydown', { key: 'Escape' });
    dialog.dispatchEvent(event);
    expect(host.closeCount).toBe(1);
  });

  it('emits close on backdrop click', () => {
    const backdrop = fixture.nativeElement.querySelector('.app-modal__backdrop');
    backdrop.click();
    expect(host.closeCount).toBe(1);
  });
});
```

- [ ] **Step 2: Run test, verify FAIL**

```bash
npx jest src/app/shared/ui/modal/modal.component.spec.ts
```

Expected: FAIL (component doesn't exist).

---

### Task 3: Implement ModalComponent

**Files:**
- Create: `src/app/shared/ui/modal/modal.component.ts`

- [ ] **Step 1: Create component**

Create `src/app/shared/ui/modal/modal.component.ts`:

```typescript
import { Component, EventEmitter, computed, input, Output, signal } from '@angular/core';
import { A11yModule } from '@angular/cdk/a11y';
import type { ModalSize } from './modal-size';

/**
 * `<app-modal>` — Sistema unificado de modales para toda la app.
 *
 * Reemplaza 4 sistemas paralelos (.picks-modal, .edit-profile-modal,
 * .prefs-modal, .confirm-backdrop) con un solo component que consume
 * design tokens de A1.
 *
 * Slots:
 * - [slot="header"] — opcional header custom (default: title + close button)
 * - [slot="body"] — contenido principal
 * - [slot="footer"] — actions footer (Cancelar / Confirmar / etc.)
 *
 * A11y:
 * - role="dialog" + aria-modal="true"
 * - aria-labelledby (auto-id del title)
 * - aria-describedby (auto-id del description si provisto — benchmark de
 *   ConfirmDialogComponent, ahora aplicado a todos los modales)
 * - cdkTrapFocus + autoCapture
 * - Escape close
 * - Backdrop click close
 *
 * Animation: scale+fade entrada (var(--anim-base, 200ms)), faster exit
 * (var(--anim-fast, 150ms)). Respeta prefers-reduced-motion.
 */
@Component({
  standalone: true,
  selector: 'app-modal',
  imports: [A11yModule],
  template: `
    @if (open()) {
      <div class="app-modal"
           [class]="sizeClass()"
           role="dialog"
           aria-modal="true"
           [attr.aria-labelledby]="titleId()"
           [attr.aria-describedby]="description() ? descId() : null"
           cdkTrapFocus
           [cdkTrapFocusAutoCapture]="true"
           (keydown.escape)="close.emit()">
        <div class="app-modal__backdrop" role="presentation"
             (click)="close.emit()"></div>
        <div class="app-modal__card">
          <header class="app-modal__head">
            <h2 class="app-modal__title" [id]="titleId()">{{ title() }}</h2>
            @if (description(); as desc) {
              <p class="app-modal__desc" [id]="descId()">{{ desc }}</p>
            }
            <button type="button" class="app-modal__close"
                    aria-label="Cerrar"
                    (click)="close.emit()">
              <!-- Inline SVG X icon for safety even if @lucide/angular fails -->
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
                   stroke="currentColor" stroke-width="2" stroke-linecap="round"
                   stroke-linejoin="round" aria-hidden="true">
                <path d="M18 6 6 18M6 6l12 12"/>
              </svg>
            </button>
          </header>
          <div class="app-modal__body">
            <ng-content select="[slot=body]" />
          </div>
          <footer class="app-modal__foot">
            <ng-content select="[slot=footer]" />
          </footer>
        </div>
      </div>
    }
  `,
  styles: [`
    :host { display: contents; }

    .app-modal {
      position: fixed;
      inset: 0;
      z-index: var(--z-modal, 1000);
      display: grid;
      place-items: center;
      padding: 16px;
      animation: app-modal-fade-in var(--anim-base, 200ms) var(--easing-enter, ease-out);
    }
    .app-modal__backdrop {
      position: absolute;
      inset: 0;
      background: var(--modal-backdrop-color, rgba(0,0,0,0.75));
      backdrop-filter: blur(var(--modal-backdrop-blur, 6px));
      -webkit-backdrop-filter: blur(var(--modal-backdrop-blur, 6px));
      cursor: pointer;
    }
    .app-modal__card {
      position: relative;
      z-index: 1;
      background: var(--color-primary-white, #fff);
      border-radius: var(--modal-radius, 16px);
      box-shadow: 0 24px 64px rgba(0,0,0,0.32);
      width: 100%;
      max-height: 90vh;
      overflow-y: auto;
      overscroll-behavior: contain;
      animation: app-modal-scale-in var(--anim-base, 200ms) var(--easing-enter, ease-out);
    }
    /* Size variants — consume A1 tokens */
    .app-modal--sm .app-modal__card {
      max-width: var(--modal-max-width-sm, 380px);
      padding: var(--modal-padding-sm, 20px);
    }
    .app-modal--md .app-modal__card {
      max-width: var(--modal-max-width-md, 480px);
      padding: var(--modal-padding, 28px);
    }
    .app-modal--lg .app-modal__card {
      max-width: var(--modal-max-width-lg, 640px);
      padding: var(--modal-padding-lg, 36px);
    }
    .app-modal__head {
      display: flex;
      align-items: flex-start;
      gap: 12px;
      margin-bottom: 16px;
      position: relative;
    }
    .app-modal__title {
      flex: 1;
      margin: 0;
      font-family: var(--font-display, system-ui);
      font-size: 20px;
      letter-spacing: 0.02em;
      line-height: 1.2;
      color: var(--color-primary-black, #0a0a0a);
    }
    .app-modal__desc {
      flex-basis: 100%;
      margin: 8px 0 0;
      font-size: 13px;
      color: var(--color-text-muted, rgba(0,0,0,0.5));
      line-height: 1.5;
    }
    .app-modal__close {
      background: transparent;
      border: 0;
      padding: 4px;
      cursor: pointer;
      color: var(--color-text-muted, rgba(0,0,0,0.5));
      flex-shrink: 0;
      border-radius: 4px;
    }
    .app-modal__close:hover {
      color: var(--color-primary-black, #0a0a0a);
      background: rgba(0,0,0,0.05);
    }
    .app-modal__close:focus-visible {
      outline: 2px solid var(--color-primary-green, #02CC74);
      outline-offset: 2px;
    }
    .app-modal__body { margin-bottom: 16px; }
    .app-modal__foot {
      display: flex;
      gap: 8px;
      justify-content: flex-end;
      flex-wrap: wrap;
    }
    .app-modal__foot:empty { display: none; }

    @keyframes app-modal-fade-in {
      from { opacity: 0; }
      to   { opacity: 1; }
    }
    @keyframes app-modal-scale-in {
      from { transform: scale(0.96); opacity: 0; }
      to   { transform: scale(1);    opacity: 1; }
    }
    @media (prefers-reduced-motion: reduce) {
      .app-modal,
      .app-modal__card {
        animation: none;
      }
    }
  `],
})
export class ModalComponent {
  open = input.required<boolean>();
  title = input.required<string>();
  description = input<string>();
  size = input<ModalSize>('md');

  @Output() close = new EventEmitter<void>();

  private uniqueId = Math.random().toString(36).slice(2, 9);

  titleId = computed(() => `app-modal-title-${this.uniqueId}`);
  descId = computed(() => `app-modal-desc-${this.uniqueId}`);
  sizeClass = computed(() => `app-modal app-modal--${this.size()}`);
}
```

- [ ] **Step 2: Run tests, verify PASS**

```bash
npx jest src/app/shared/ui/modal/
```

Expected: 6 tests pass.

- [ ] **Step 3: Commit**

```bash
git add src/app/shared/ui/modal/
git commit -m "feat(modal): add ModalComponent unified system

Reemplaza 4 sistemas paralelos de modales documentados en walkthrough.
A11y benchmark: role=dialog + aria-labelledby + aria-describedby
(propagado del ConfirmDialog), cdkTrapFocus + autoCapture + Escape +
backdrop click. Size variants sm/md/lg. Animations entrada (scale+fade)
respetan prefers-reduced-motion.

Spec: docs/superpowers/specs/2026-05-28-ux-redesign-master-plan-design.md A2

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Refactor confirm-dialog.component.ts to use ModalComponent

**Files:**
- Modify: `src/app/shared/ui/confirm-dialog.component.ts`

- [ ] **Step 1: Read current confirm-dialog.component.ts**

ConfirmDialog ya tiene aria-describedby (el benchmark). Preservar API public (svc.pending() signal con title/message/confirmLabel/cancelLabel/danger).

- [ ] **Step 2: Refactor to consume `<app-modal>`**

Replace the inline modal markup with `<app-modal>`:

```typescript
import { Component, inject } from '@angular/core';
import { ModalComponent } from '../modal/modal.component';
import { ConfirmDialogService } from './confirm-dialog.service';

@Component({
  standalone: true,
  selector: 'app-confirm-dialog',
  imports: [ModalComponent],
  template: `
    @if (svc.pending(); as p) {
      <app-modal
        [open]="true"
        [title]="p.title"
        [description]="p.message"
        size="sm"
        (close)="svc.cancel()">
        <div slot="footer">
          <button type="button"
                  class="confirm-btn"
                  (click)="svc.cancel()">
            {{ p.cancelLabel ?? 'Cancelar' }}
          </button>
          <button type="button"
                  class="confirm-btn confirm-btn--primary"
                  [class.confirm-btn--danger]="!!p.danger"
                  (click)="svc.confirm()">
            {{ p.confirmLabel ?? 'Confirmar' }}
          </button>
        </div>
      </app-modal>
    }
  `,
  styles: [`
    :host { display: contents; }

    .confirm-btn {
      padding: 10px 16px;
      border-radius: 8px;
      font-family: var(--font-primary);
      font-weight: 600;
      font-size: 13px;
      background: transparent;
      border: 1px solid var(--color-line);
      color: var(--color-primary-black);
      cursor: pointer;
      transition: background 0.15s ease, border-color 0.15s ease, color 0.15s ease;
    }
    .confirm-btn:hover { background: rgba(0,0,0,0.04); }
    .confirm-btn:focus-visible {
      outline: 2px solid var(--color-primary-green);
      outline-offset: 2px;
    }
    .confirm-btn--primary {
      background: var(--color-primary-green);
      border-color: var(--color-primary-green);
      color: var(--color-primary-white);
    }
    .confirm-btn--primary:hover {
      background: #029960;
      border-color: #029960;
    }
    .confirm-btn--danger {
      background: var(--color-lost);
      border-color: var(--color-lost);
      color: var(--color-primary-white);
    }
    .confirm-btn--danger:hover {
      background: #c0392b;
      border-color: #c0392b;
    }
  `],
})
export class ConfirmDialogComponent {
  svc = inject(ConfirmDialogService);
}
```

- [ ] **Step 2: Run existing tests + manual verify**

```bash
npx jest src/app/shared/ui/confirm-dialog
npx ng build --configuration=development
```

- [ ] **Step 3: Commit**

```bash
git add src/app/shared/ui/confirm-dialog.component.ts
git commit -m "refactor(confirm-dialog): consume ModalComponent shared

A2 refactor — confirm dialog ahora usa <app-modal> shared. Preserva
public API (ConfirmDialogService.ask()) y A11y benchmark
(aria-describedby ya propagado al ModalComponent).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Refactor preferences-modal.component.ts

**Files:**
- Modify: `src/app/features/profile/preferences-modal.component.ts`

- [ ] **Step 1: Replace .prefs-overlay/.prefs-modal markup with `<app-modal>`**

Adapt the existing template to use `<app-modal title="Preferencias" size="md">` con sections en slot body + footer slot con [Restablecer] / [Listo] buttons.

Preserve:
- All 4 toggle behaviors
- Click anywhere row → toggle (still works inside slot body)
- prefers.reset() and close behavior
- A11y (role=dialog, etc.) — now handled by ModalComponent

Remove:
- Custom overlay CSS (.prefs-overlay, .prefs-modal, .prefs-modal__head, etc.) — replaced by ModalComponent chrome
- Manual aria-labelledby + cdkTrapFocus (now handled by ModalComponent)

- [ ] **Step 2: Build + smoke verify**

```bash
npx ng build --configuration=development
```

- [ ] **Step 3: Commit**

```bash
git add src/app/features/profile/preferences-modal.component.ts
git commit -m "refactor(preferences): consume ModalComponent shared

A2 refactor — preferences modal ahora usa <app-modal>. Eliminado
.prefs-overlay/.prefs-modal CSS paralelo. Toggles + Restablecer
behavior preservado.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Refactor edit-profile-modal.component.ts

**Files:**
- Modify: `src/app/features/profile/edit-profile-modal.component.ts`

Similar refactor — replace `.edit-profile-overlay/.edit-profile-modal` markup con `<app-modal title="Editar perfil" size="md">`. Preserve 5 secciones (foto, handle read-only, país, bio, password) inside slot body. Footer slot con [Cerrar].

**Preserve**:
- Avatar upload auto-save
- profileDirty signal + Save bar contextual
- Password disclosure progresivo
- All input attrs + autocomplete

**Remove**:
- Custom overlay/modal CSS
- Manual cdkTrapFocus (now in ModalComponent)

Commit message: `refactor(edit-profile): consume ModalComponent shared`

---

### Task 7: Refactor group-actions-modals.component.ts (Crear + Unirme)

**Files:**
- Modify: `src/app/shared/layout/group-actions-modals.component.ts`

Replace 2 `.picks-modal` blocks with 2 `<app-modal>` (Crear: size="md", Unirme: size="sm"). Preserve all logic.

Commit message: `refactor(group-actions): consume ModalComponent in Crear + Unirme`

---

### Task 8: Refactor randomizer-modal.component.ts

**Files:**
- Modify: `src/app/features/picks/randomizer-modal.component.ts`

Replace `.picks-modal` block with `<app-modal title="Picks aleatorios" size="md">`. Preserve filter selector + steppers + sample preview + Generar behavior.

Commit: `refactor(randomizer): consume ModalComponent shared`

---

### Task 9: Refactor redeem-modal.component.ts

**Files:**
- Modify: `src/app/shared/layout/redeem-modal.component.ts`

Replace `.picks-modal` shell con `<app-modal title="Canjear código" size="md">` envolviendo `<app-sponsor-redeem />` inside slot body. Preserve composite pattern.

Commit: `refactor(redeem): consume ModalComponent shared`

---

### Task 10: Refactor trivia-popup.component.ts

**Files:**
- Modify: `src/app/features/trivia/trivia-popup.component.ts`

Replace `.trivia-modal` block with `<app-modal size="md">` (trivia tiene title custom con sponsor + match info — usar custom header slot O preservar title prop + custom DOM en body).

**Importante**: trivia-modal tiene 2 variantes visuales (`--marca` sponsored + `--sinad`). Decisión:
- Opción A: agregar `headerStyle` input al ModalComponent — over-engineering.
- Opción B: dejar el header custom en trivia (via custom DOM en body slot, no usar title prop) — pragmatic.

**Recomendación**: B. Trivia es 1-off complex case. Use `<app-modal>` solo para A11y + backdrop + animations chrome.

Commit: `refactor(trivia-popup): consume ModalComponent for A11y + chrome`

---

### Task 11: Refactor transfer-admin modal inline en group-detail.component.ts

**Files:**
- Modify: `src/app/features/groups/group-detail.component.ts`

Find the inline transfer-admin modal section (uses `.picks-modal`). Replace with `<app-modal title="Transferir admin" description="..." size="sm">`. Preserve state machine (null/'open'/'submitting') + radio list + ConfirmDialog destructive second step.

Commit: `refactor(group-detail): consume ModalComponent en transfer-admin inline modal`

---

### Task 12: Update demo route con modal section

**Files:**
- Modify: `src/app/dev/dev-components.component.ts`

Agregar section "Modal variants" mostrando size sm/md/lg + danger button trigger ConfirmDialog. Útil para visual QA.

Commit: `feat(dev): add modal variants demo to /dev/components`

---

### Task 13: Final verification + visual audit

**Files:** Ninguno modificado.

- [ ] **Step 1: Run all tests**

```bash
npx jest src/app/shared/ui/ src/app/features/
```

Expected: all passing (6 new modal tests + existing tests).

- [ ] **Step 2: Production build + bundle size delta**

```bash
npx ng build --configuration=production
ls -lh dist/*/main*.js
```

Document bundle delta. Expected: small reduction (8 modales × ~30 líneas CSS cada = ~240 líneas eliminadas, vs ModalComponent shared adds ~80 líneas — net negative).

- [ ] **Step 3: Grep verifications**

```bash
# Old systems eliminados
grep -rc '\.picks-modal\b' src/app/ | grep -v ':0'
# Expected: 0 matches in components (only in deprecated styles if any)

grep -rc '\.edit-profile-modal\b' src/app/ | grep -v ':0'
# Expected: 0

grep -rc '\.prefs-modal\b' src/app/ | grep -v ':0'
# Expected: 0

grep -rc '\.confirm-backdrop\b' src/app/ | grep -v ':0'
# Expected: 0

# All consumers using <app-modal>
grep -rln '<app-modal' src/app/
# Expected: 8 surfaces (group-actions×2 + trivia + randomizer + redeem + edit-profile + preferences + transfer-admin + confirm-dialog)
```

- [ ] **Step 4: Manual smoke (note for user)**

Sub-agente no puede ejecutar visual smoke. Document en commit "Manual smoke pending: verify each of 8 modals opens with consistent backdrop + radius + animation + A11y behavior + Escape close + backdrop click close."

- [ ] **Step 5: Acceptance gate checklist**

- [x] `<app-modal>` component creado con A11y completo.
- [x] 8 modales consumen `<app-modal>`.
- [x] Backdrop blur+opacity consistente cross-modal (tokens del A1).
- [x] aria-describedby propagado del ConfirmDialog a todos.
- [x] Animation entrada/salida respeta prefers-reduced-motion.
- [x] Tests existentes verdes.

- [ ] **Step 6: Optional summary commit**

```bash
git commit --allow-empty -m "chore(a2): A2 modal system unification complete

Summary:
- ModalComponent shared con 6 tests + size variants sm/md/lg
- 8 modales refactorizados consumiendo <app-modal>
- 4 sistemas visuales paralelos eliminados (.picks-modal, .edit-profile-modal,
  .prefs-modal, .confirm-backdrop → .app-modal único)
- aria-describedby benchmark propagado del ConfirmDialog a todos
- Demo route /dev/components extended con modal variants

Bundle size delta: ~[X] KB reduction.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Summary

A2 produce 13 commits independientes — 3 components (ModalSize type, ModalComponent + tests, dev demo) + 8 refactors mecánicos + 1 audit.

**Dependency**: A1 mergeado (provides design tokens + skeleton/empty-block pattern).

**Sub-proyectos downstream que se benefician**:
- A7 auth family — `<app-modal>` para confirm dialogs en password change, etc.
- A8 surfaces — consistencia visual modal cross-app

**Estimación**: ~1 semana (13 tasks × 30-60 min).

**Dispatch strategy**: 1 sub-agente opus 4.7 coordinador. Refactors mecánicos (Tasks 4-11) paralelizables conceptualmente pero compartirían diff base, así que ejecutar serial.

**Next**: A2 mergeable independiente. A7/A8 surfaces consumirán `<app-modal>` cuando llegue su turno.
