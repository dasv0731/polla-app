# A8a · Sidebar Mobile Drawer + Sheet "Más" Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. **All sub-agent dispatches MUST use opus 4.7** per project memory.

**Goal:** Implementar decisión de producto: mobile bottom-nav 5 items fijos (Inicio + Picks + Grupos + Ranking + **Más**) + "Más" abre slide-up sheet con items extra (Mundial 2026 + Comodines + Notificaciones + Perfil + Admin si aplica). Sidebar desktop sin cambios — solo refactor del bloque mobile.

**Architecture:** Sidebar component mantiene su estructura desktop pero se simplifica el mobile media query. Nuevo `<app-more-sheet>` componente con animación slide-up + backdrop + A11y completo (focus trap + Escape). Sheet state controlado via signal local en sidebar (no service global — sheet vive scoped).

**Tech Stack:** Angular 18 standalone + signals + CDK A11yModule. Tokens A1 (z-overlay, anim-base, easing-enter). `<app-icon>` para items.

---

## Dependencies

**Required mergeado**:
- A1: `<app-icon>` (todos los nav items necesitan icons SVG)
- A4: sidebar enriquecido (bell badge + user dropdown bottom area — desktop only)
- A5: tone+branding (labels finales: tú-tone, "Polla Mundialista 2026")

## File Structure

**Modify**:
- `src/app/shared/layout/sidebar.component.ts` — mobile bottom-nav simplificada a 5 items + trigger "Más" sheet

**Create**:
- `src/app/shared/layout/more-sheet.component.ts` — slide-up sheet component
- `src/app/shared/layout/more-sheet.component.spec.ts` — tests A11y + open/close

---

## Tasks

### Task 1: Create MoreSheetComponent failing test

**Files:**
- Create: `src/app/shared/ui/more-sheet/more-sheet.component.spec.ts` (path: `shared/ui/` for shared UI component consistency)

- [ ] **Step 1: Create spec file**

```typescript
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Component } from '@angular/core';
import { MoreSheetComponent } from './more-sheet.component';

@Component({
  standalone: true,
  imports: [MoreSheetComponent],
  template: `
    <app-more-sheet [open]="open" (close)="onClose()">
      <a class="sheet-item" href="/profile">Perfil</a>
      <a class="sheet-item" href="/notificaciones">Notificaciones</a>
    </app-more-sheet>
  `,
})
class HostComponent {
  open = false;
  closeCount = 0;
  onClose() { this.closeCount++; }
}

describe('MoreSheetComponent', () => {
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

  it('hides sheet when open=false (default)', () => {
    const sheet = fixture.nativeElement.querySelector('[role="dialog"]');
    expect(sheet).toBeFalsy();
  });

  it('renders sheet when open=true', () => {
    host.open = true;
    fixture.detectChanges();
    const sheet = fixture.nativeElement.querySelector('[role="dialog"]');
    expect(sheet).toBeTruthy();
  });

  it('emits close on Escape key', () => {
    host.open = true;
    fixture.detectChanges();
    const sheet = fixture.nativeElement.querySelector('[role="dialog"]');
    const event = new KeyboardEvent('keydown', { key: 'Escape' });
    sheet.dispatchEvent(event);
    expect(host.closeCount).toBe(1);
  });

  it('emits close on backdrop click', () => {
    host.open = true;
    fixture.detectChanges();
    const backdrop = fixture.nativeElement.querySelector('.more-sheet__backdrop');
    backdrop.click();
    expect(host.closeCount).toBe(1);
  });

  it('projects content into sheet body', () => {
    host.open = true;
    fixture.detectChanges();
    const items = fixture.nativeElement.querySelectorAll('.sheet-item');
    expect(items.length).toBe(2);
  });

  it('has aria-modal=true for proper modal semantics', () => {
    host.open = true;
    fixture.detectChanges();
    const sheet = fixture.nativeElement.querySelector('[role="dialog"]');
    expect(sheet.getAttribute('aria-modal')).toBe('true');
  });
});
```

- [ ] **Step 2: Run test, verify FAIL**

```bash
npx jest src/app/shared/ui/more-sheet/
```

Expected: FAIL (component doesn't exist).

---

### Task 2: Implement MoreSheetComponent

**Files:**
- Create: `src/app/shared/ui/more-sheet/more-sheet.component.ts`

- [ ] **Step 1: Create component**

```typescript
import { Component, EventEmitter, Output, input } from '@angular/core';
import { A11yModule } from '@angular/cdk/a11y';

/**
 * `<app-more-sheet>` — Slide-up sheet from bottom for mobile "Más" menu.
 *
 * Decisión producto (A8a): bottom-nav 5 items fijos + sheet "Más" con
 * items extra (Mundial 2026, Comodines, Notificaciones, Perfil,
 * Admin si aplica).
 *
 * A11y:
 * - role="dialog" + aria-modal="true" + aria-labelledby (auto-id)
 * - cdkTrapFocus + autoCapture
 * - Escape close
 * - Backdrop click close
 *
 * Animation: slide-up entrada (translateY 100% → 0), backdrop fade.
 * Respect prefers-reduced-motion.
 *
 * Usage:
 *   <app-more-sheet [open]="moreOpen()" (close)="moreOpen.set(false)">
 *     <a routerLink="/picks/group-stage/predict">Mundial 2026</a>
 *     <a routerLink="/comodines">Comodines</a>
 *     ...
 *   </app-more-sheet>
 */
@Component({
  standalone: true,
  selector: 'app-more-sheet',
  imports: [A11yModule],
  template: `
    @if (open()) {
      <div class="more-sheet"
           role="dialog"
           aria-modal="true"
           aria-labelledby="more-sheet-title"
           cdkTrapFocus
           [cdkTrapFocusAutoCapture]="true"
           (keydown.escape)="close.emit()">
        <div class="more-sheet__backdrop"
             role="presentation"
             (click)="close.emit()"></div>
        <div class="more-sheet__card">
          <div class="more-sheet__handle" aria-hidden="true"></div>
          <h2 class="more-sheet__title" id="more-sheet-title">Más</h2>
          <div class="more-sheet__items">
            <ng-content />
          </div>
        </div>
      </div>
    }
  `,
  styles: [`
    :host { display: contents; }

    .more-sheet {
      position: fixed;
      inset: 0;
      z-index: var(--z-overlay, 100);
      display: flex;
      flex-direction: column;
      justify-content: flex-end;
      animation: ms-fade-in var(--anim-base, 200ms) var(--easing-enter, ease-out);
    }
    .more-sheet__backdrop {
      position: absolute;
      inset: 0;
      background: var(--modal-backdrop-color, rgba(0,0,0,0.55));
      backdrop-filter: blur(4px);
      -webkit-backdrop-filter: blur(4px);
      cursor: pointer;
    }
    .more-sheet__card {
      position: relative;
      z-index: 1;
      background: var(--color-primary-white, #fff);
      border-radius: 16px 16px 0 0;
      box-shadow: 0 -8px 32px rgba(0,0,0,0.18);
      padding: 8px 0 calc(16px + env(safe-area-inset-bottom, 0px));
      max-height: 70vh;
      overflow-y: auto;
      animation: ms-slide-up var(--anim-base, 200ms) var(--easing-enter, ease-out);
    }
    .more-sheet__handle {
      width: 36px;
      height: 4px;
      background: rgba(0,0,0,0.15);
      border-radius: 2px;
      margin: 8px auto 12px;
    }
    .more-sheet__title {
      font-family: var(--font-display, system-ui);
      font-size: 13px;
      letter-spacing: 0.12em;
      text-transform: uppercase;
      color: var(--color-text-muted, rgba(0,0,0,0.5));
      margin: 0 0 8px;
      padding: 0 20px;
      font-weight: 700;
    }
    .more-sheet__items {
      display: flex;
      flex-direction: column;
    }

    @keyframes ms-fade-in {
      from { opacity: 0; }
      to   { opacity: 1; }
    }
    @keyframes ms-slide-up {
      from { transform: translateY(100%); }
      to   { transform: translateY(0); }
    }
    @media (prefers-reduced-motion: reduce) {
      .more-sheet,
      .more-sheet__card {
        animation: none;
      }
    }
  `],
})
export class MoreSheetComponent {
  open = input.required<boolean>();
  @Output() close = new EventEmitter<void>();
}
```

- [ ] **Step 2: Run tests, verify PASS**

```bash
npx jest src/app/shared/ui/more-sheet/
```

Expected: 6 tests PASS.

- [ ] **Step 3: Commit**

```bash
git add src/app/shared/ui/more-sheet/
git commit -m "feat(more-sheet): add MoreSheetComponent for mobile 'Más' menu

A8a foundation: slide-up sheet from bottom with A11y (focus trap +
Escape + backdrop click), backdrop blur, safe-area-inset bottom padding.
Respect prefers-reduced-motion.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Refactor sidebar.component.ts mobile bottom-nav

**Files:**
- Modify: `src/app/shared/layout/sidebar.component.ts`

- [ ] **Step 1: Read current sidebar.component.ts mobile section**

Find the `@media (max-width: 767px)` block. Current state:
- `.lsb` becomes bottom-nav (flex-direction: row)
- All desktop nav items still render (6 items + admin = up to 7 in mobile bottom-nav)
- `.lsb__bottom { display: none }` hides bell + user dropdown in mobile

This violates Material/Apple HIG max 5 items bottom-nav.

- [ ] **Step 2: Split mobile vs desktop template**

Use `@if` template branches or CSS to render different markup:

Approach: keep desktop markup; add separate mobile bottom-nav markup gated by `@if (isMobile())` OR use CSS to hide/show.

Recommended: CSS-based with explicit mobile/desktop sections, since signals for viewport are complex.

Modify template to have 2 sections:

```html
<aside class="lsb" aria-label="Navegación principal">
  <!-- DESKTOP MARKUP (unchanged - hidden on mobile via CSS) -->
  <a class="lsb__logo" routerLink="/home">
    <img src="assets/logo-golgana.png" alt="Golgana" class="brand-logo">
    <strong class="lsb__brand-sub">Polla Mundialista 2026</strong>
  </a>
  <div class="lsb__nav-desktop">
    <a routerLink="/home" routerLinkActive="active" [routerLinkActiveOptions]="{exact: true}">
      <app-icon name="home" size="md" />
      <span class="lsb__t">Inicio</span>
    </a>
    <a routerLink="/picks" routerLinkActive="active" [routerLinkActiveOptions]="{exact: true}">
      <app-icon name="dice" size="md" />
      <span class="lsb__t">Mis picks</span>
    </a>
    <a routerLink="/groups" routerLinkActive="active">
      <app-icon name="users" size="md" />
      <span class="lsb__t">Grupos</span>
    </a>
    <a routerLink="/ranking" routerLinkActive="active">
      <app-icon name="trophy" size="md" />
      <span class="lsb__t">Ranking</span>
    </a>
    <a routerLink="/picks/group-stage/predict" routerLinkActive="active">
      <app-icon name="globe" size="md" />
      <span class="lsb__t">Mundial 2026</span>
    </a>
    @if (isAdmin()) {
      <a routerLink="/admin" routerLinkActive="active">
        <app-icon name="wrench" size="md" />
        <span class="lsb__t">Admin</span>
      </a>
    }
  </div>
  <!-- existing .lsb__bottom (desktop only) with bell badge + user dropdown -->
  <div class="lsb__bottom">
    <!-- ... existing bell badge link + user dropdown trigger ... -->
  </div>

  <!-- MOBILE BOTTOM-NAV (5 items + Más) -->
  <nav class="lsb__nav-mobile">
    <a routerLink="/home" routerLinkActive="active" [routerLinkActiveOptions]="{exact: true}">
      <app-icon name="home" size="md" />
      <span>Inicio</span>
    </a>
    <a routerLink="/picks" routerLinkActive="active" [routerLinkActiveOptions]="{exact: true}">
      <app-icon name="dice" size="md" />
      <span>Picks</span>
    </a>
    <a routerLink="/groups" routerLinkActive="active">
      <app-icon name="users" size="md" />
      <span>Grupos</span>
    </a>
    <a routerLink="/ranking" routerLinkActive="active">
      <app-icon name="trophy" size="md" />
      <span>Ranking</span>
    </a>
    <button type="button" (click)="toggleMore()"
            [class.active]="moreOpen()"
            [attr.aria-expanded]="moreOpen()"
            aria-haspopup="dialog">
      <app-icon name="plus" size="md" />
      <span>Más</span>
    </button>
  </nav>
</aside>

<!-- Mobile sheet "Más" — outside aside for proper portal stacking -->
<app-more-sheet [open]="moreOpen()" (close)="moreOpen.set(false)">
  <a class="more-sheet__item" routerLink="/picks/group-stage/predict" (click)="moreOpen.set(false)">
    <app-icon name="globe" size="md" />
    <span>Mundial 2026</span>
  </a>
  <a class="more-sheet__item" routerLink="/comodines" (click)="moreOpen.set(false)">
    <app-icon name="gift" size="md" />
    <span>Comodines</span>
  </a>
  <a class="more-sheet__item" routerLink="/notificaciones" (click)="moreOpen.set(false)">
    <app-icon name="bell" size="md" />
    <span>Notificaciones</span>
    @if (unreadCount() > 0) {
      <span class="more-sheet__badge">{{ unreadCount() }}</span>
    }
  </a>
  <a class="more-sheet__item" routerLink="/profile" (click)="moreOpen.set(false)">
    <app-icon name="settings" size="md" />
    <span>Perfil</span>
  </a>
  @if (isAdmin()) {
    <a class="more-sheet__item" routerLink="/admin" (click)="moreOpen.set(false)">
      <app-icon name="wrench" size="md" />
      <span>Admin</span>
    </a>
  }
</app-more-sheet>
```

- [ ] **Step 3: Add signal + method**

```typescript
moreOpen = signal(false);
toggleMore() {
  this.moreOpen.update(v => !v);
}
```

- [ ] **Step 4: Update CSS to hide/show mobile vs desktop**

```css
/* Desktop: hide mobile nav */
.lsb__nav-mobile { display: none; }

/* Mobile: hide desktop nav + bottom area, show mobile bottom-nav */
@media (max-width: 767px) {
  .lsb__nav-desktop, .lsb__bottom, .lsb__logo { display: none; }
  .lsb__nav-mobile {
    display: flex;
    justify-content: space-around;
    align-items: center;
    /* ... existing mobile bottom-nav positioning ... */
  }
}

/* More-sheet item styles */
.more-sheet__item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 20px;
  color: var(--color-primary-black);
  text-decoration: none;
  background: transparent;
  border: 0;
  width: 100%;
  font: inherit;
  text-align: left;
  cursor: pointer;
  border-bottom: 1px solid var(--color-line);
}
.more-sheet__item:last-child { border-bottom: 0; }
.more-sheet__item:hover { background: var(--color-green-5); }
.more-sheet__item:focus-visible {
  outline: 2px solid var(--color-primary-green);
  outline-offset: -2px;
  background: var(--color-green-5);
}
.more-sheet__badge {
  margin-left: auto;
  background: var(--color-lost);
  color: #fff;
  border-radius: 9px;
  padding: 2px 7px;
  font-size: 10px;
  font-weight: 700;
}
```

- [ ] **Step 5: Import MoreSheetComponent + app-icon**

```typescript
import { MoreSheetComponent } from '../ui/more-sheet/more-sheet.component';
import { IconComponent } from '../ui/icon/icon.component';

@Component({
  // ...
  imports: [RouterLink, RouterLinkActive, MoreSheetComponent, IconComponent /* + existing */],
  // ...
})
```

- [ ] **Step 6: Verify build + smoke test**

```bash
npx ng build --configuration=development
npx jest
```

Expected: build OK, tests pass (53 baseline + 6 modal + 6 more-sheet = 65).

- [ ] **Step 7: Commit**

```bash
git add src/app/shared/layout/sidebar.component.ts
git commit -m "feat(sidebar): refactor mobile bottom-nav to 5 items + 'Más' sheet

A8a product decision: mobile bottom-nav 5 fijos (Inicio + Picks +
Grupos + Ranking + Más) + sheet con Mundial 2026 + Comodines +
Notificaciones + Perfil + Admin (si aplica). Resuelve violación
Material/Apple HIG max 5 items.

Desktop sidebar unchanged. Mobile bottom-nav uses SVG icons
(<app-icon>). Admin gated in sheet if isAdmin().

Refs: docs/ux-redesign/30-sidebar.md, 31-shell-nav.md (6 items con admin)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Final verification

- [ ] **Step 1: Run all tests**

```bash
npx jest
```

Expected: 65+ passing (no regression).

- [ ] **Step 2: Production build**

```bash
npx ng build --configuration=production
```

- [ ] **Step 3: Verify mobile bottom-nav count**

```bash
grep -A 30 'lsb__nav-mobile' src/app/shared/layout/sidebar.component.ts | head -40
```

Verify: 4 routerLink items + 1 button = 5 items max.

- [ ] **Step 4: Acceptance gate**

- [x] 5 items en mobile bottom-nav.
- [x] Sheet "Más" abre/cierra con animación slide-up.
- [x] Admin solo visible en sheet si isAdmin().
- [x] safe-area-inset-bottom respetado en sheet card.
- [x] SVG icons en lugar de emojis.
- [x] Bell badge en sheet "Notificaciones" item si unread > 0.
- [x] A11y: focus trap + Escape + backdrop click close.
- [x] Tests existentes verdes.

- [ ] **Step 5: Manual smoke pending (note for user)**

Sub-agente no puede ejecutar visual smoke. Document:
- Mobile viewport (<768px): verify 5 items render + "Más" opens sheet.
- Click sheet items → navega + sheet cierra.
- Backdrop click → cierra. Escape → cierra.
- Desktop unchanged.
- prefers-reduced-motion: ON → animations off.
- safe-area-inset: notch iPhones don't overlap sheet content.

---

## Summary

A8a produce 3 commits — MoreSheetComponent (test + impl) + sidebar refactor + final audit.

**Dependency**: A1 (`<app-icon>`) + A4 (sidebar already structured with bell + user dropdown desktop).

**Sub-proyectos downstream**: A8b/c/d benefit por consistency con mobile patterns.

**Estimación**: ~3-4 días.

**Dispatch strategy**: 1 sub-agente opus 4.7 coordinador. 4 tasks discretos.

**Risk**: Medium — sidebar es persistent + most-viewed. Test thoroughly via manual smoke.
