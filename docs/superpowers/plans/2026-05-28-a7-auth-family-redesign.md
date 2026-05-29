# A7 · Auth Family Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. **All sub-agent dispatches MUST use opus 4.7** per project memory.

**Goal:** Refactorizar los 5 surfaces auth (login + register + forgot-password + group-join + onboarding) para consumir la nueva infra de Sprint 1+2: `<app-modal>` (A2), tokens A1, bug fixes A3, sweep A5, y backend RPCs A6 (getPublicStats, previewJoinCode extended). Mantener public API stable; cambia chrome + copy + bugs fixed.

**Architecture:** Cada surface tiene su Task individual con scope estrecho. Brand panel desktop consolidated into shared `<app-auth-brand-panel>` component consumed by login + register + forgot. Tests E2E críticos por flow.

**Tech Stack:** Angular 18 standalone + signals. Existing Cognito + AppSync APIs (extended via A6). Jest unit tests + Playwright E2E (if configured).

---

## Dependencies

**Required mergeado antes de A7**:
- A1: `<app-icon>` (eye toggle), tokens, `<app-empty-block>`, `<app-skeleton>`
- A2: `<app-modal>` (no big modal usage in auth except confirm dialogs)
- A3: bug fixes (deep-link confirm sin password, score input, etc.)
- A5: tone (tú) + branding (Golgana + Polla Mundialista 2026 sub) + legal links
- A6 partial: getPublicStats lambda + previewJoinCode extended (stats reales + maxMembers/tournament)

**Optional**: A4 (per-group ranking via /ranking enhancement) — doesn't block A7.

---

## File Structure

**Create**:
- `src/app/shared/ui/auth-brand-panel/auth-brand-panel.component.ts` — shared brand panel (logo + headline + sub + stats from getPublicStats + footer legal)
- `src/app/shared/ui/auth-brand-panel/auth-brand-panel.component.spec.ts`
- `src/app/shared/ui/otp-input/otp-input.component.ts` — shared 6-digit OTP input (extract from register + forgot duplication)
- `src/app/shared/ui/otp-input/otp-input.component.spec.ts`

**Modify**:
- `src/app/features/auth/login.component.ts`
- `src/app/features/auth/register.component.ts`
- `src/app/features/auth/forgot-password.component.ts`
- `src/app/features/groups/group-join.component.ts`
- `src/app/features/onboarding/onboarding.component.ts`

---

## Tasks

### Task 1: Create AuthBrandPanelComponent shared

**Files:**
- Create: `src/app/shared/ui/auth-brand-panel/auth-brand-panel.component.ts`
- Create: `auth-brand-panel.component.spec.ts`

Component template:

```typescript
@Component({
  standalone: true,
  selector: 'app-auth-brand-panel',
  imports: [],
  template: `
    <aside class="auth-brand">
      <div class="auth-brand__top">
        <img src="assets/logo-golgana.png" alt="Golgana" class="brand-logo">
        <span class="auth-brand__title">Polla Mundialista 2026</span>
      </div>
      <div>
        <h1 class="auth-brand__h1">
          Predice cada partido.<br>
          Gana contra tus panas.
        </h1>
        <p class="auth-brand__sub">
          Crea grupos privados, asigna premios, gana comodines y demuestra
          quién sabe más de fútbol.
        </p>
        @if (stats(); as s) {
          <div class="auth-brand__stats">
            <div><div class="num">{{ formatK(s.totalUsers) }}</div><div class="lbl">Jugadores</div></div>
            <div><div class="num">{{ s.totalGroups }}</div><div class="lbl">Grupos activos</div></div>
            <div><div class="num">{{ formatMoney(s.totalPrizesAccrued) }}</div><div class="lbl">En premios</div></div>
          </div>
        } @else {
          <!-- Loading skeleton while stats fetch -->
          <app-skeleton variant="text" [count]="3" />
        }
      </div>
      <div class="auth-brand__foot">
        © {{ year }} Golgana ·
        <a href="https://polla.golgana.net/terminos" target="_blank" rel="noopener noreferrer">Términos</a> ·
        <a href="https://polla.golgana.net/privacidad" target="_blank" rel="noopener noreferrer">Privacidad</a>
      </div>
    </aside>
  `,
  styles: [`/* ...adapt from existing login auth-brand styles... */`],
})
export class AuthBrandPanelComponent {
  stats = input<{ totalUsers: number; totalGroups: number; totalPrizesAccrued: number } | undefined>();
  year = new Date().getFullYear();

  formatK = (n: number) => n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);
  formatMoney = (n: number) => n > 0 ? `$${this.formatK(n)}` : '—';
}
```

Test: render with mock stats + verify dom + skeleton state.

Commit: `feat(auth-brand-panel): add shared component for login/register/forgot`

---

### Task 2: Create OtpInputComponent shared

**Files:**
- Create: `src/app/shared/ui/otp-input/otp-input.component.ts`

Extract the duplicated 6-digit OTP logic from register + forgot-password into shared component:

```typescript
@Component({
  standalone: true,
  selector: 'app-otp-input',
  template: `
    <div class="otp">
      @for (i of indices; track i) {
        <input
          #otpInput
          class="otp__d"
          maxlength="1"
          inputmode="numeric"
          autocomplete="one-time-code"
          [attr.name]="'otp-' + (i + 1)"
          [attr.aria-label]="'Dígito ' + (i + 1)"
          [value]="digits()[i]"
          (input)="onInput($event, i)"
          (keydown)="onKey($event, i)"
          (paste)="onPaste($event)">
      }
    </div>
  `,
  styles: [`/* ... */`],
})
export class OtpInputComponent {
  readonly indices = [0, 1, 2, 3, 4, 5];
  digits = signal<string[]>(['', '', '', '', '', '']);
  code = computed(() => this.digits().join(''));

  @Output() complete = new EventEmitter<string>();  // emit when 6 dígitos

  @ViewChildren('otpInput') refs?: QueryList<ElementRef<HTMLInputElement>>;

  // ... handlers idénticos a los actuales en register + forgot ...

  // Auto-submit when complete
  private checkComplete() {
    if (this.code().length === 6) {
      this.complete.emit(this.code());
    }
  }
}
```

Test: paste 6 digits → emits complete. Input each digit → focus advances. Backspace → focus retreats. Complete event fires.

Commit: `feat(otp-input): add shared component (extracts register + forgot duplication)`

---

### Task 3: Refactor login.component.ts

**Files:**
- Modify: `src/app/features/auth/login.component.ts`

Changes:
- Replace inline brand panel with `<app-auth-brand-panel [stats]="stats()">`. Call getPublicStats in ngOnInit.
- Replace 👁/👁️‍🗨️ emoji eye toggle with `<app-icon name="eye"/>` / `<app-icon name="eye-off"/>`.
- Apply A5 tone (already done) + branding (already done) + legal links (already done).
- UserNotConfirmedException handler: already fixed in A3 (path B with password preserved via sessionStorage).
- Remove logo inline style → use `.brand-logo` class.

Commit: `refactor(login): consume AuthBrandPanel + SVG icons + getPublicStats`

---

### Task 4: Refactor register.component.ts

**Files:**
- Modify: `src/app/features/auth/register.component.ts`

Changes:
- Replace inline brand panel with `<app-auth-brand-panel [stats]="stats()">`.
- Replace 👁 eye toggle with `<app-icon name="eye"/>` / `<app-icon name="eye-off"/>`.
- Replace OTP markup with `<app-otp-input (complete)="onOtpComplete($event)">`. Auto-submit when 6 dígitos via complete event.
- Replace ✓/✗ handle availability pills with `<app-icon name="check"/>` / `<app-icon name="close"/>` decorative.
- Replace 💡 OTP tip with text-only (no icon per A1 decision).
- Already-fixed deep-link confirm bug (A3) — verify still works.
- Cooldown escalation (60→120→300s) — agregar logic if not exists.
- Sin handle suggestions when taken — defer to A8 or implement here (UX walkthrough mentioned).

Commit: `refactor(register): consume AuthBrandPanel + OtpInput + SVG icons + handle availability icons`

---

### Task 5: Refactor forgot-password.component.ts

**Files:**
- Modify: `src/app/features/auth/forgot-password.component.ts`

Changes:
- Replace inline brand panel with `<app-auth-brand-panel>`.
- Add toggle eye to newPassword (parity with register/login — bug walkthrough doc 19).
- Add `<app-password-rules-list>` consumption (parity with register).
- Replace OTP with `<app-otp-input>`.
- Add "Confirma password" second field (mitigate typo invisible — doc 19).
- Add returnUrl propagation (currently missing — doc 19 gap):
  - Read returnUrl from queryParam in ngOnInit.
  - Propagate to /login fallback navigation post-reset failure.
  - On success auto-login, navigate to returnUrl instead of /home.
- Toast success post-reset antes del redirect.

Commit: `refactor(forgot-password): consume AuthBrandPanel + OtpInput + parity with register (eye toggle, password rules, confirm password) + returnUrl propagation`

---

### Task 6: Refactor group-join.component.ts

**Files:**
- Modify: `src/app/features/groups/group-join.component.ts`

Changes:
- Replace ⭐ kicker icon (if exists) — already typography in walkthrough.
- Replace 🏳️ flag fallback with text initials (no flag fallback per A1 inventory).
- Consume A6 extended previewJoinCode: render `createdAt` (real, not "—"), `maxMembers` (real, not hardcoded 30), `tournamentCode` (real, not "WC26").
- Add spinner loading (vs solo "Validando código…" text) using `<app-skeleton>`.
- Add "Copiar código" button.
- aria-label fix: match `alt="Golgana"` (already done in A5).
- Header link → `/home` (already done in A5).
- Recovery UX on invalid code: suggest similar code (Levenshtein distance) + support link.

Commit: `refactor(group-join): consume A6 extended previewJoinCode + skeleton + copy button`

---

### Task 7: Refactor onboarding.component.ts

**Files:**
- Modify: `src/app/features/onboarding/onboarding.component.ts`

Changes:
- Replace ⚽ hero emoji with SVG illustration or brand graphic. **Decision pending** during implementation: use brand image (logo-golgana enlarged) OR custom SVG illustration. Recommend the former for v1.
- Replace ＋ / → unicode in CTAs with `<app-icon name="plus"/>` / `<app-icon name="arrow-right"/>`.
- Logo size unified (already done in A5 via .brand-logo class).
- Brand title consistent — add small "Polla Mundialista 2026" sub-title visible.
- Mobile head differentiated — agregar variant for mobile if not present.
- Tone tú (already done in A5).

Commit: `refactor(onboarding): SVG icons + brand graphic hero + Polla Mundialista 2026 sub-title`

---

### Task 8: E2E flow verification

**Files:** Ninguno modificado. Solo verification.

- [ ] **Step 1: Run all tests**

```bash
npx jest
```

Expected: all passing including new auth-brand-panel + otp-input.

- [ ] **Step 2: Production build**

```bash
npx ng build --configuration=production
```

- [ ] **Step 3: E2E flows manuales (note for user)**

Sub-agent cannot execute browser E2E. Document the flows that need manual verification:

1. **Register flow**:
   - Open /register
   - Fill form (handle, email, password, accept terms)
   - Verify handle availability check live (icon SVG ✓/✗)
   - Submit → receive OTP email
   - Enter 6 digits in OTP → auto-submits
   - Verify navigate to /onboarding with returnUrl preserved

2. **Login flow**:
   - Open /login
   - Verify brand panel stats from backend (not hardcoded 2.4k/180/$15k)
   - Click eye toggle → password text/hidden
   - Submit valid → navigate /home
   - Submit unverified email → register?confirm=1 with password preserved

3. **Forgot password flow**:
   - Open /forgot-password (from /login link)
   - Submit email
   - Enter OTP
   - Enter new password + confirm password (verify mismatch warning)
   - Verify auto-login post-reset → navigate to returnUrl (if any) or /home

4. **Group-join deep-link**:
   - Open /groups/join/ABC123 deep-link
   - Verify auth-guard bounces to /login?returnUrl=...
   - Login successful → navigate back to /groups/join/ABC123
   - Verify preview shows: real createdAt + real maxMembers + real tournament
   - Click "Unirme al grupo" → navigate /groups/:id

5. **Onboarding deep-link skip**:
   - Register a new user
   - In register URL was ?returnUrl=/groups/join/ABC123
   - After confirm OTP, verify skip onboarding card → navigate directly to /groups/join/ABC123

- [ ] **Step 4: Acceptance gate checklist**

- [x] AuthBrandPanelComponent created + consumed by 3 surfaces (login/register/forgot).
- [x] OtpInputComponent created + consumed by 2 surfaces (register/forgot).
- [x] Stats reales rendered en brand panel via getPublicStats.
- [x] SVG icons replace eye toggle + OTP feedback + CTAs.
- [x] forgot-password parity con register (eye toggle, password rules, confirm).
- [x] returnUrl propagation en forgot-password.
- [x] Group-join consumes A6 extended previewJoinCode.
- [x] Onboarding hero ⚽ → brand graphic.
- [x] Production build success.
- [x] E2E flows documented for manual smoke.

- [ ] **Step 5: Optional summary commit**

```bash
git commit --allow-empty -m "chore(a7): A7 auth family redesign complete

Summary:
- AuthBrandPanelComponent shared (login/register/forgot)
- OtpInputComponent shared (register/forgot, eliminates duplication)
- Stats reales via getPublicStats (A6 dependency)
- SVG icons throughout (eye toggle, OTP feedback, CTAs)
- forgot-password parity con register (eye, rules, confirm pw, returnUrl)
- group-join consumes A6 extended previewJoinCode
- onboarding hero brand graphic vs ⚽ emoji

E2E flows pending manual smoke (documented in commit).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Summary

A7 produce 8 commits — 2 new shared components + 5 surface refactors + final audit.

**Dependency**: A1 + A2 + A3 + A5 + A6 (parcial: getPublicStats + previewJoinCode extended).

**Sub-proyectos downstream**: A8 surfaces (consistency con auth pattern).

**Estimación**: ~2 semanas.

**Dispatch strategy**: 1 coordinator OR 5 parallel per-surface (after Task 1+2 shared components mergeados). Cuidado con conflicts en common patterns (brand panel + OTP).

**Risk**: Auth es crítico. Feature flag opcional para new flow vs old durante testing.
