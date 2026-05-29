# A8d · Micro-Surfaces Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. **All sub-agent dispatches MUST use opus 4.7** per project memory.

**Goal:** Refactorizar los 4 micro-surfaces de Sprint 7: picks-pending-banner + trivia-toast + footer + right-rail. Cada uno consume infra completa de Sprints 1-3: tokens A1, `<app-icon>`, `<app-modal>` (donde aplique), tone+branding A5, backend RPCs A6 (right-rail consume `getMyRightRail` consolidated).

**Architecture:** Cada surface task discreta. Right-rail es el más complejo (consume A6 lambda + skeleton states + role="timer"). Resto son polish + accessibility fixes documented en walkthrough.

**Tech Stack:** Angular 18 standalone + signals. Existing CDK A11yModule. Tokens A1 + shared components.

---

## Dependencies

**Required mergeado**:
- A1: tokens (`--sidebar-w`, animation, z-index) + `<app-icon>` + `<app-skeleton>`
- A2: `<app-modal>` (no usage en micro-surfaces, pero podría aplicar a future)
- A3: bugs fixed (sidebar margin-left fix consumed by toast + banner)
- A5: tone+branding+legal links
- A6: `getMyRightRail` consolidated lambda (right-rail consumer)

## File Structure

**Modify**:
- `src/app/features/picks/picks-pending-banner.component.ts`
- `src/app/shared/layout/trivia-toast.component.ts`
- `src/app/shared/layout/footer.component.ts`
- `src/app/shared/layout/right-rail.component.ts`

**No new files**.

---

## Tasks

### Task 1: Refactor picks-pending-banner.component.ts

**File**: `src/app/features/picks/picks-pending-banner.component.ts`

**Changes**:
- Replace `×` close button with `<app-icon name="close" size="sm"/>`
- `visible` computed signal (vs arrow function — pattern consistency)
- CTA contextual: si count==1, link directo a match. Si count>1, link a `/picks` con scroll anchor.
  - For count==1: need to know which match. If pendingMatches() returns the array, use first.
  - For count>1: keep `/picks` link.
- Timezone-aware dismiss: use local date via `Intl.DateTimeFormat('es-EC', { timeZone: 'America/Guayaquil' })` instead of `toISOString().slice(0,10)`
- Cross-tab sync: BroadcastChannel API to dismiss across tabs
- Loading skeleton during initial fetch (currently nothing — banner just appears when API returns)
- aria-label "Cerrar" capitalized (was lowercase)
- Use `app-` class prefix convention: `.app-pending-banner__close` etc (if not already)

**Steps**:
1. Read banner file
2. Apply changes
3. Add IconComponent import + SkeletonComponent import if needed
4. Verify build + tests
5. Commit

**Commit**:
```
refactor(picks-pending-banner): SVG close + contextual CTA + cross-tab + timezone-aware

A8d polish: consume <app-icon> for close button, computed signal vs
arrow function for visibility pattern, contextual CTA (link to match
if count=1, /picks if count>1), Intl.DateTimeFormat with TZ for dismiss
date, BroadcastChannel for cross-tab sync, capitalized aria-label.

Refs: docs/ux-redesign/35-picks-pending-banner.md

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
```

---

### Task 2: Refactor trivia-toast.component.ts

**File**: `src/app/shared/layout/trivia-toast.component.ts`

**Changes**:
- Replace `<a>` (no href) + onClick handler with `<button>` for proper semantics + keyboard accessibility
- Replace `→` unicode arrow with `<app-icon name="arrow-right" size="sm"/>`
- Pulse animation: respect `prefers-reduced-motion`:
  ```css
  @media (prefers-reduced-motion: reduce) {
    .trivia-toast__dot { animation: none; }
  }
  ```
- Add dismiss button "✕" → `<app-icon name="close" size="sm"/>` with localStorage cooldown (e.g. don't show again for next 1h after dismissal)
- Use CSS variable `--sidebar-w` (A3 fix already applied — verify)
- Wording dinámico según tipo trivia: if sponsored, "+gana comodín"; else "+10 pts"
- Add breathing room between banner and content (margin-bottom 4-8px)

**Steps**:
1. Read trivia-toast
2. Add IconComponent import
3. Apply changes
4. Verify build + tests
5. Commit

**Commit**:
```
refactor(trivia-toast): semantic button + SVG icons + prefers-reduced-motion + dismiss

A8d polish: <a> sin href → <button> keyboard accessible. SVG icons for
arrow + close. Pulse animation respects prefers-reduced-motion. Dismiss
button with 1h localStorage cooldown. Wording dinámico según sponsor.

Refs: docs/ux-redesign/33-trivia-toast.md

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
```

---

### Task 3: Refactor footer.component.ts

**File**: `src/app/shared/layout/footer.component.ts`

**Changes**:
- Replace any emoji icons with `<app-icon>` (verify what's there post-A5)
- Logout `danger: true` (verify A4 already set this in confirmDialog.ask call)
- "Editar perfil" link decision: change wording to "Mi perfil" since the link goes to `/profile` view, not directly to edit modal. (Alternative: change link to open modal — more complex; recommend wording fix only)
- Verify external "Reglas" has `rel="noopener noreferrer"` (A5 already applied)
- Consolidate logout method with sidebar (A4 added similar):
  - Create `AuthService.logoutWithConfirm()` method that encapsulates: confirmDialog + auth.logout + navigate /login
  - Replace duplicate logout logic in footer + sidebar with this shared method
  - This is optional refactor — if scope creep, defer to follow-up

**Steps**:
1. Grep emoji usage in footer
2. Apply SVG icon replacements (probably no icons — A5 may have handled)
3. Decision: wording "Mi perfil"
4. Optional: extract shared logout method
5. Verify build
6. Commit

**Commit**:
```
refactor(footer): SVG icons + 'Mi perfil' wording + verify logout danger

A8d polish: any emoji icons replaced with <app-icon>. 'Editar perfil'
→ 'Mi perfil' wording (link goes to view, not edit modal). Logout
confirmDialog danger=true verified (set by A4).

Refs: docs/ux-redesign/36-footer-auth-shell.md

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
```

---

### Task 4: Refactor right-rail.component.ts (biggest in A8d)

**File**: `src/app/shared/layout/right-rail.component.ts`

**Changes**:

**4.1 Backend consolidation** (consumes A6):
- Replace 5+ separate calls + N×getUrl with single `getMyRightRail` call:
  ```typescript
  // BEFORE: loadNextAndUpcoming + loadNews (5+ calls)
  // AFTER:
  async ngOnInit() {
    const res = await this.api.getMyRightRail();
    if (res.data) {
      this.nextMatch.set(res.data.nextMatch);
      this.upcoming.set(res.data.upcomingPicks);
      this.newsHero.set(res.data.news[0] ?? null);
      this.newsList.set(res.data.news.slice(1));
    }
    // Seed fallback for sandbox
    if (!nextLoaded) this.nextMatch.set(this.seedNextMatch());
    if (!upcomingLoaded) this.upcoming.set(this.seedUpcoming());
    if (!newsLoaded) { /* news seed */ }
    this.tickerId = setInterval(() => this.refreshCountdown(), 1000);
  }
  ```

  **TODO(A6) stub if A6 not deployed**: if `api.getMyRightRail` doesn't exist yet in ApiService, keep current implementation and add TODO comment. Mark for backend hookup post-A6.

**4.2 SVG icons**:
- 🏳️ flag fallback → text initials (2 chars team name uppercase)
- ✓ Pick → `<app-icon name="check" size="sm">`
- ⚠ pendiente → `<app-icon name="alert" size="sm">`
- → "Ver previa completa" → `<app-icon name="arrow-right" size="sm">`

**4.3 Skeleton loading states**:
- Wrap blocks with `@if (loading()) { <app-skeleton variant="card" /> } @else { ... }`
- Skeleton 1 for next-match card, skeleton for upcoming list, skeleton for news block

**4.4 Countdown enhancements**:
- Pad-zero `days` (currently sin pad — visualmente inconsistente)
- Add `role="timer" aria-label="Tiempo hasta kickoff"` to countdown container
- "Empieza ya" state when countdown reaches 0:
  ```typescript
  countdown: this.diffMs() <= 0 ? null : this.computeCountdown(...)
  ```
- Show "EN VIVO" state when diff < 0 and match started

**4.5 Image lazy loading**:
- Add `loading="lazy"` to news images
- Add `decoding="async"` for non-blocking image decode

**4.6 Date format consistency**:
- Use `Intl.RelativeTimeFormat('es-EC')` for "hace 4 horas" pattern (already partly using)

**Steps**:
1. Read right-rail.component.ts (large file — use Grep + Edit)
2. Apply 6 changes above
3. Verify build + tests
4. If A6 backend deployed, hook up. Else TODO comments.
5. Commit

**Commit**:
```
refactor(right-rail): consume getMyRightRail (A6) + SVG icons + skeleton + countdown polish

A8d major refactor:
- Consolidate to single getMyRightRail call (vs 5+ currently)
  TODO(A6): connect when polla-backend lambda deployed
- SVG icons replace 🏳️ ✓ ⚠ → unicode
- Skeleton loading states for all 3 blocks (next-match, upcoming, news)
- Countdown polish: pad-zero days, role=timer, 'Empieza ya' state, 'EN VIVO' state
- Image lazy loading + decoding=async
- Intl.RelativeTimeFormat for news dates

Refs: docs/ux-redesign/32-right-rail.md

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
```

---

### Task 5: Final verification

```bash
# Run all tests
npx jest

# Production build
npx ng build --configuration=production

# Verify emoji removal in micro-surfaces
echo "Banner emojis residual:"
grep -E '×|→|⚠|✓|🏳️' src/app/features/picks/picks-pending-banner.component.ts | wc -l
# Expected: 0

echo "Toast emojis residual:"
grep -E '→|✕|●' src/app/shared/layout/trivia-toast.component.ts | wc -l
# Expected: 0 (or only the . dot CSS character)

echo "Right-rail emojis residual:"
grep -E '🏳️|✓|⚠|→' src/app/shared/layout/right-rail.component.ts | wc -l
# Expected: 0

# Verify app-icon usage
grep -rln 'app-icon' src/app/features/picks/picks-pending-banner.component.ts src/app/shared/layout/
# Expected: 4 files (banner + toast + footer + right-rail)

# Skeleton usage in right-rail
grep -n 'app-skeleton' src/app/shared/layout/right-rail.component.ts
# Expected: at least 3 instances (one per block)

# role=timer for countdown
grep -n 'role="timer"' src/app/shared/layout/right-rail.component.ts
# Expected: 1

# TODO(A6) comments (if backend not deployed)
grep -n 'TODO(A6)' src/app/shared/layout/right-rail.component.ts
# Expected: 0 or 1 depending on A6 status
```

**Acceptance gate**:
- [x] 4 micro-surfaces refactored using new infra.
- [x] No emojis residuales en .ts/.html.
- [x] Right-rail consumes consolidated lambda (or TODO comment).
- [x] Skeleton loading states applied.
- [x] role="timer" countdown.
- [x] prefers-reduced-motion respected in trivia-toast pulse.
- [x] Tests existentes verdes.
- [x] Production build OK.

**Manual smoke pending** (no browser):
- Mobile + desktop viewport tests for each micro-surface
- Trivia-toast dismiss button + cooldown
- Right-rail skeleton appears during initial load + transitions to content smoothly
- Right-rail "Empieza ya" + "EN VIVO" states during match transitions
- Countdown role="timer" announced by screen reader
- Banner contextual CTA goes to correct match when count=1

Optional summary commit:
```
chore(a8d): A8d micro-surfaces refactor complete

4 surfaces:
- picks-pending-banner: SVG close, contextual CTA, cross-tab sync
- trivia-toast: semantic button, SVG icons, prefers-reduced-motion, dismiss
- footer: SVG icons, 'Mi perfil' wording
- right-rail: getMyRightRail consolidation (or A6 TODO), SVG icons,
  skeleton states, countdown polish, lazy images

Tests passing. Production build OK.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
```

---

## Summary

A8d produce 4-5 commits (4 surface refactors + optional summary).

**Dependency**: A1 + A2 + A3 + A4 + A5 (+ A6 partial for right-rail).

**Sub-proyectos downstream**: NONE — A8d cierra A8.

**Estimación**: ~1 semana (4 surfaces, varying complexity).

**Dispatch strategy**: 1 sub-agente opus 4.7 coordinator. 4 surfaces secuencialmente.

**Risk**: Low-medium — micro-surfaces but right-rail is complex.
