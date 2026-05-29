# A3 · Bugs Globales Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. **All sub-agent dispatches MUST use opus 4.7** per project memory.

**Goal:** Resolver los bugs latentes documentados en el walkthrough UX que afectan múltiples surfaces y que no dependen de la nueva infra (icon system / modal unification). Cada bug es independientemente isolable y testeable. Total: 13 bugs originalmente 5 en spec + 8 surfaced por synthesis subagent.

**Architecture:** Bug fixes mecánicos — 1 task por bug, con repro manual + fix + verification. Algunos bugs requieren coordinación con A1 tokens (`--sidebar-w` para overlap fix) y NO con A2/A8. Bugs son paralelos a A1 — pueden empezar Día 1 Sprint 1.

**Tech Stack:** Angular 18 standalone + signals. Sin nuevas dependencias. Tests E2E donde aplique (Playwright si está configurado, sino manual smoke).

---

## Bug inventory (consolidado spec + synthesis)

### Críticos (🔴 spec A3 + synthesis G1-G20)
1. **margin-left overlap sidebar hover** (spec) — `.shell { margin-left: 64px }` + `.trivia-toast { margin-left: 64px }` hardcoded, sidebar hover expande a 200px → overlap 136px.
2. **routerLinkActive overlap sidebar** (spec) — "Mis picks" + "Mundial 2026" ambos active en `/picks/group-stage/predict`.
3. **B2 description no render** (spec) — `description` se guarda en backend pero no se renderiza en `/groups/:id`.
4. **Deep-link confirm sin password** (spec) — `?email=X&confirm=1` → submitConfirm con password='' → auto-login post-OTP falla silenciosamente.
5. **Link "Ir a mis terceros"** (spec) — `/picks/bracket` empty state link apunta a `/profile/special-picks`. Debe ir a `/picks/group-stage?view=pred`.

### Adicionales (synthesis docs 01-16)
6. **Score input `maxlength="1"`** — picks-list + pick-detail: bloquea marcadores 10+ (España 10 - Malta 0 imposible).
7. **Empty state `/groups` desktop sin CTAs** — dice "Usa los botones de arriba" pero design v3 oculta esos topnav buttons.
8. **Fragment mismatch notif resolver** — `#card-{comodinId}` vs comodines-list usa `id="card-pending-{id}"` → deep link silently fails.
9. **aria-hidden inconsistente** `/profile` — Cuenta icons 🔒⚙↩ SIN aria-hidden, Mi juego icons SÍ.
10. **`<li (click)>` no semántico** `/notificaciones` — debe ser `<a routerLink>` o `<button>`.
11. **Mode switch sin `role="tablist"`** `/picks/bracket` — los otros segmented controls (predict/special-picks) sí lo tienen.
12. **Hero card sin clase mobile-only** `/ranking` — bug visibilidad dual potencial entre badge + hero card.
13. **scrollToTop ignora `prefers-reduced-motion`** `/ranking`.

---

## File Structure

**Modify** (componentes existentes):
- `src/styles/components.css` o equivalente — fix margin-left con `var(--sidebar-w)` (requiere A1 token)
- `src/app/shared/layout/shell.component.ts` — consume `--sidebar-w` reactive
- `src/app/shared/layout/sidebar.component.ts` — emite hover state via CSS variable mutation
- `src/app/shared/layout/trivia-toast.component.ts` — consume `--sidebar-w`
- `src/app/shared/layout/sidebar.component.ts` — agregar `[routerLinkActiveOptions]="{exact:true}"` en "Mis picks"
- `src/app/features/groups/group-detail.component.ts` — render `description` en hero
- `src/app/features/auth/register.component.ts` — manejo deep-link con password ausente
- `src/app/features/auth/login.component.ts` — opción B: modal "Reenviar código" en lugar de redirect
- `src/app/features/picks/bracket-picks.component.ts` — fix link "Ir a mis terceros"
- `src/app/features/picks/picks-list.component.ts` — score input maxlength=2
- `src/app/features/picks/pick-detail.component.ts` — score input maxlength=2
- `src/app/features/groups/groups-list.component.ts` — empty state CTAs siempre visibles
- `src/app/features/notifications/notifications-list.component.ts` — fix `<li (click)>` + fragment ID
- `src/app/features/comodines/comodines-list.component.ts` — fix fragment ID (alternativa)
- `src/app/features/profile/profile.component.ts` — agregar aria-hidden a Cuenta icons
- `src/app/features/picks/bracket-picks.component.ts` — agregar `role="tablist"` al mode switch
- `src/app/features/ranking/ranking.component.ts` — clase mobile-only + prefers-reduced-motion check

**No new files**.

---

## Tasks

### Task 1: Bug #1 — Fix margin-left overlap sidebar hover

**Files:**
- Modify: `src/app/shared/layout/sidebar.component.ts` — emit `--sidebar-w` via host style
- Modify: `src/app/shared/layout/shell.component.ts` — consume `--sidebar-w`
- Modify: `src/app/shared/layout/trivia-toast.component.ts` — consume `--sidebar-w`

**Dependency**: A1 must be merged first (provides `--sidebar-w` token in tokens.css).

- [ ] **Step 1: Verify A1 is merged**

Run:
```bash
grep -c '\-\-sidebar-w' src/styles/tokens.css
```

Expected: `1` (token defined). If `0`, A1 plan must complete first.

- [ ] **Step 2: Modify sidebar.component.ts to emit hover state via CSS var**

Read current `src/app/shared/layout/sidebar.component.ts` líneas 65-80 (donde está `.lsb { width: 64px } .lsb:hover { width: 200px }`).

Cambiar el CSS para que el `:host` (component root) emita la variable, y los estilos consuman:

```css
:host { display: contents; }

.lsb {
  /* ... existing styles ... */
  width: var(--sidebar-w);
  /* ... */
}

.lsb:hover {
  --sidebar-w: 200px;  /* mutación local de la variable */
  width: var(--sidebar-w);  /* redundante visual pero claro */
  align-items: stretch;
}
```

**Importante**: También hacer que la sidebar mute la variable a nivel `:root` (no solo local) usando `:hover` + JS mutation OR `:host-context`. Si solo se muta en `.lsb:hover`, shell + trivia-toast NO ven el cambio (CSS variables son scoped al element).

**Mejor approach**: Sidebar mutate `document.documentElement.style.setProperty('--sidebar-w', value)` en mouseenter/mouseleave handlers.

Reescribir sidebar:

```typescript
// Agregar en SidebarComponent:
@HostListener('mouseenter')
onHoverEnter() {
  document.documentElement.style.setProperty('--sidebar-w', '200px');
}

@HostListener('mouseleave')
onHoverLeave() {
  document.documentElement.style.setProperty('--sidebar-w', '64px');
}
```

Import `HostListener` from `@angular/core`.

- [ ] **Step 3: Modify shell.component.ts to consume var**

Read current `src/app/shared/layout/shell.component.ts` líneas 56-77 donde está `.shell { margin-left: 64px }`.

Reemplazar `margin-left: 64px` con `margin-left: var(--sidebar-w);`:

```css
.shell {
  margin-left: var(--sidebar-w);
  /* ... rest unchanged ... */
}
```

Y agregar transition para smooth movement:
```css
.shell {
  margin-left: var(--sidebar-w);
  transition: margin-left 0.2s ease;
  /* ... */
}
```

En mobile (`@media (max-width: 767px)`) override:
```css
.shell {
  margin-left: 0;  /* sin sidebar lateral en mobile */
  /* ... */
}
```

- [ ] **Step 4: Modify trivia-toast.component.ts to consume var**

Read current `src/app/shared/layout/trivia-toast.component.ts` línea 33 donde está `.trivia-toast { margin-left: 64px }`.

Reemplazar:
```css
.trivia-toast {
  margin-left: var(--sidebar-w);
  transition: margin-left 0.2s ease;
  /* ... rest unchanged ... */
}
```

Mobile override existing (`@media (max-width: 767px)`):
```css
.trivia-toast {
  margin-left: 0;
  /* ... */
}
```

- [ ] **Step 5: Manual smoke test**

Run:
```bash
npx ng serve
```

Open `http://localhost:4200/home` (autenticado).

Manual checks:
1. **Default state**: sidebar 64px wide. Shell + trivia-toast (si visible) margin-left 64px. **NO overlap**.
2. **Hover sidebar**: sidebar expands a 200px. Shell + trivia-toast se mueven a margin-left 200px smooth. **NO overlap during transition**.
3. **Hover off**: sidebar collapses a 64px. Shell + trivia-toast vuelven a 64px. **Smooth**.
4. **Mobile (<768px)**: sidebar becomes bottom-nav. Shell margin-left 0. **No transitions weird**.

- [ ] **Step 6: Commit**

```bash
git add src/app/shared/layout/sidebar.component.ts src/app/shared/layout/shell.component.ts src/app/shared/layout/trivia-toast.component.ts
git commit -m "fix(layout): resolve sidebar hover overlap with shell+toast

Bug #1 (A3 plan). Sidebar mutates --sidebar-w CSS variable on hover
via HostListener. Shell + trivia-toast consume var reactively — no
more 136px overlap during hover transition.

Refs: docs/ux-redesign/30-sidebar.md, 31-shell-nav.md, 33-trivia-toast.md"
```

---

### Task 2: Bug #2 — Fix routerLinkActive overlap sidebar

**Files:**
- Modify: `src/app/shared/layout/sidebar.component.ts` — agregar `[routerLinkActiveOptions]="{exact:true}"` a "Mis picks" O reapuntar "Mundial 2026"

- [ ] **Step 1: Decide fix approach**

**Decisión rápida**: el bug es que "Mis picks" → `/picks` matchea prefix con `/picks/group-stage/predict` Y "Mundial 2026" → `/picks/group-stage/predict` matchea exacto. Ambos active simultáneamente.

**Fix option A (preferido)**: Agregar `[routerLinkActiveOptions]="{exact:true}"` a "Mis picks". Si user está en `/picks` exact, Mis picks active. Si está en `/picks/X`, NO está active (esto es UX correcto — Mis picks es el LISTA, no padre).

**Fix option B**: Cambiar URL "Mundial 2026" a una ruta diferente (ej. crear `/mundial-2026` landing). Más invasivo.

**Recomendación**: opción A.

- [ ] **Step 2: Apply fix**

Read `src/app/shared/layout/sidebar.component.ts` línea 33-35 donde está "Mis picks":

```html
<a routerLink="/picks" routerLinkActive="active">
  <span class="lsb__i" aria-hidden="true">⚽</span><span class="lsb__t">Mis picks</span>
</a>
```

Cambiar a:
```html
<a routerLink="/picks" routerLinkActive="active" [routerLinkActiveOptions]="{exact: true}">
  <span class="lsb__i" aria-hidden="true">⚽</span><span class="lsb__t">Mis picks</span>
</a>
```

- [ ] **Step 3: Manual verification**

Run dev server. Navigate to `/picks/group-stage/predict`.

Expected: SOLO "Mundial 2026" tiene `.active` class. "Mis picks" NO está active.

Navigate to `/picks` (lista cronológica).

Expected: SOLO "Mis picks" tiene `.active` class.

- [ ] **Step 4: Commit**

```bash
git add src/app/shared/layout/sidebar.component.ts
git commit -m "fix(sidebar): prevent routerLinkActive overlap between Mis picks and Mundial 2026

Bug #2 (A3 plan). 'Mis picks' /picks prefix-matched /picks/group-stage/predict
causing both items highlighted. Added [routerLinkActiveOptions]={exact:true}
so 'Mis picks' only active on exact /picks route.

Refs: docs/ux-redesign/30-sidebar.md"
```

---

### Task 3: Bug #3 — Render description en /groups/:id

**Files:**
- Modify: `src/app/features/groups/group-detail.component.ts`

- [ ] **Step 1: Read current group-detail.component.ts hero section**

Read `src/app/features/groups/group-detail.component.ts` para encontrar el hero section donde se renderiza `g.name`, `g.joinCode`, miembros, etc. Buscar dónde encajar el `description` field.

- [ ] **Step 2: Add description render**

Agregar conditional render del description debajo del nombre del grupo. Buscar el bloque que tiene `<h1>{{ g.name }}</h1>` y agregar después:

```html
<h1>{{ g.name }}</h1>
@if (g.description) {
  <p class="group-description">{{ g.description }}</p>
}
```

Y agregar al `styles`:

```css
.group-description {
  font-size: var(--fs-sm);
  line-height: var(--lh-body);
  color: var(--color-text-muted);
  margin: var(--space-sm) 0 0;
  max-width: 600px;
  /* Preserve line breaks si el user puso \n */
  white-space: pre-line;
}
```

- [ ] **Step 3: Verify GroupSummary interface has description field**

Read `src/app/features/groups/group-detail.component.ts` interfaz `Group` o tipo del signal `group`. Verify tiene `description: string | null`. Si no, agregar:

```typescript
interface Group {
  // ... existing fields ...
  description?: string | null;
}
```

Y el API service que carga el group debe retornar el field. Verify `ApiService.getGroup()` retorna description. Si el field se persiste pero no se requesteaba, agregar al GraphQL query.

- [ ] **Step 4: Manual smoke test**

Run dev server. Create un grupo con description "Reglas: marcadores exactos +5, resultado +3. Premio: cena.".

Navigate to `/groups/:id` del grupo creado.

Expected: description renderiza debajo del nombre, con line breaks preservados (si los tiene).

- [ ] **Step 5: Commit**

```bash
git add src/app/features/groups/group-detail.component.ts
git commit -m "fix(group-detail): render description in hero section

Bug #3 (A3 plan, B2 latente). description input agregado en Fase B
al modal Crear grupo pero NO renderizaba en /groups/:id. Field se
guardaba en backend pero invisible al user. Ahora renders debajo
del nombre con white-space: pre-line para line breaks.

Refs: docs/ux-redesign/09-group-detail.md, 10-group-edit.md, 22-group-actions-modals.md"
```

---

### Task 4: Bug #4 — Fix deep-link confirm sin password

**Files:**
- Modify: `src/app/features/auth/login.component.ts` — opción B: modal "Reenviar" en lugar de redirect

- [ ] **Step 1: Read current login.component.ts UserNotConfirmedException handler**

Read `src/app/features/auth/login.component.ts` `submit()` function donde maneja `UserNotConfirmedException`. Currently hace fire-and-forget resend + redirect a register?confirm=1.

- [ ] **Step 2: Replace redirect with inline error message + resend button**

Cambiar el handler para mantener al user en login con un message claro y un button para resend código + redirect a confirm flow CON el password en sessionStorage:

```typescript
async submit() {
  // ... existing code ...
  try {
    await this.auth.login(this.email, this.password);
    void this.router.navigateByUrl(this.safeReturnUrl());
  } catch (e: any) {
    if (e?.name === 'UserNotConfirmedException') {
      // BEFORE: fire-and-forget resend + redirect a register
      // AFTER: store password in sessionStorage (cleared post-confirm) + redirect
      try {
        sessionStorage.setItem('pending-confirm-password', this.password);
        await this.auth.resend(this.email);
        const returnUrl = this.safeReturnUrl();
        void this.router.navigate(['/register'], {
          queryParams: {
            email: this.email,
            confirm: '1',
            ...(returnUrl !== '/home' ? { returnUrl } : {}),
          },
        });
      } catch (resendErr) {
        this.error.set('No se pudo reenviar el código. Intenta de nuevo.');
      }
    } else {
      this.error.set(this.humanizeAuthError(e));
    }
  } finally {
    this.loading.set(false);
  }
}
```

- [ ] **Step 3: Modify register.component.ts to read password from sessionStorage**

Read `src/app/features/auth/register.component.ts` `submitConfirm()` function. Actualmente hace `await this.auth.login(this.email, this.password)` con this.password = '' (no en memory) si vino de deep-link.

Cambiar para leer de sessionStorage:

```typescript
async submitConfirm() {
  // ... existing OTP validation ...
  let loggedIn = false;
  try {
    await this.auth.confirm(this.email, this.code());

    // Read password from sessionStorage if came via deep-link from login
    const pendingPassword = sessionStorage.getItem('pending-confirm-password');
    const passwordToUse = pendingPassword || this.password;

    if (!passwordToUse) {
      // Edge case: no password available (direct register flow incomplete state)
      this.error.set('Sesión expirada. Volvé a iniciar sesión.');
      void this.router.navigate(['/login'], { queryParams: { email: this.email } });
      return;
    }

    await this.auth.login(this.email, passwordToUse);
    loggedIn = true;

    // Cleanup sessionStorage post-login
    sessionStorage.removeItem('pending-confirm-password');

    // ... rest of submitConfirm (createUserProfile, navigate, etc.) ...
  } catch (e) {
    // ... existing error handling ...
  }
}
```

- [ ] **Step 4: Test the flow end-to-end**

Manual E2E:
1. Register un user, NO confirmar OTP.
2. Logout (or open incognito).
3. Login con email + password del user no confirmado.
4. Verify: redirect a `/register?email=X&confirm=1` con OTP step.
5. Verify: sessionStorage tiene `pending-confirm-password`.
6. Tipear OTP código real (from email).
7. Click "Verificar".
8. Expected: auto-login success → navigate a /onboarding o returnUrl.
9. Verify: sessionStorage NO tiene `pending-confirm-password` (cleared).

- [ ] **Step 5: Commit**

```bash
git add src/app/features/auth/login.component.ts src/app/features/auth/register.component.ts
git commit -m "fix(auth): preserve password through UserNotConfirmedException deep-link

Bug #4 (A3 plan). UserNotConfirmedException flow redirected to register
?confirm=1 but lost password from memory → auto-login post-OTP failed
silently. Now stores password in sessionStorage temporarily (cleared
post-login success).

Refs: docs/ux-redesign/17-login.md, 18-register.md"
```

---

### Task 5: Bug #5 — Fix link "Ir a mis terceros"

**Files:**
- Modify: `src/app/features/picks/bracket-picks.component.ts`

- [ ] **Step 1: Find broken link in bracket-picks empty state**

Read `src/app/features/picks/bracket-picks.component.ts`. Buscar el link "Ir a mis terceros" que apunta a `/profile/special-picks`. Search for "terceros" o "special-picks".

- [ ] **Step 2: Fix link**

Cambiar el href/routerLink de `/profile/special-picks` a `/picks/group-stage` con query param `view=pred`:

```html
<!-- BEFORE -->
<a routerLink="/profile/special-picks" class="btn btn--ghost">
  Ir a mis terceros →
</a>

<!-- AFTER -->
<a routerLink="/picks/group-stage" [queryParams]="{ view: 'pred' }" class="btn btn--ghost">
  Ir a mis terceros →
</a>
```

- [ ] **Step 3: Verify destination handles ?view=pred**

Check `src/app/features/picks/picks-tabla-grupos.component.ts` (o el componente de `/picks/group-stage`). Verify que el query param `view=pred` cambia el toggle a "Mi predicción" inicialmente.

Si NO lo hace, agregar handler en ngOnInit:

```typescript
async ngOnInit() {
  // ... existing init ...
  const view = this.route.snapshot.queryParamMap.get('view');
  if (view === 'pred') {
    this.viewMode.set('pred');  // or whatever signal controls the toggle
  }
}
```

- [ ] **Step 4: Manual smoke test**

Run dev server. Navigate to `/picks/bracket` en empty state (sin picks de R32 todavía).

Click "Ir a mis terceros". Expected: navega a `/picks/group-stage?view=pred` con toggle en "Mi predicción".

- [ ] **Step 5: Commit**

```bash
git add src/app/features/picks/bracket-picks.component.ts src/app/features/picks/picks-tabla-grupos.component.ts
git commit -m "fix(bracket): correct 'Ir a mis terceros' link destination

Bug #5 (A3 plan). Link apuntaba a /profile/special-picks (incorrecto).
Sidebar terceros vive en /picks/group-stage con view=pred. Fixed link
+ verified destination handles ?view=pred query param.

Refs: docs/ux-redesign/05-picks-bracket.md, 06-picks-group-stage-predict.md"
```

---

### Task 6: Bug #6 — Score input maxlength=2 (no =1)

**Files:**
- Modify: `src/app/features/picks/picks-list.component.ts`
- Modify: `src/app/features/picks/pick-detail.component.ts`

- [ ] **Step 1: Find score inputs**

Run:
```bash
grep -n 'maxlength="1"\|maxlength=1' src/app/features/picks/
```

Expected output: lines en `picks-list.component.ts` + `pick-detail.component.ts` donde están los score inputs.

- [ ] **Step 2: Replace maxlength=1 → maxlength=2 en ambos files**

Cambiar `maxlength="1"` a `maxlength="2"` en los score inputs. Verificar que el regex/validation del onInput handler también accepta 2 dígitos (no solo 1).

Por ejemplo, si hay un handler como:
```typescript
onScoreInput(event: Event) {
  const v = (event.target as HTMLInputElement).value.replace(/\D/g, '').slice(0, 1);
  // ...
}
```

Cambiar a `.slice(0, 2)`.

- [ ] **Step 3: Verify no breaking validation**

Verify que el form validation acepta 2-digit scores. Si hay un Validator que limita a 1 dígito, ajustar.

- [ ] **Step 4: Manual smoke**

Run dev server. Navigate to `/picks`. Click un match upcoming, tipear "10-0" en los inputs. Expected: ambos dígitos aceptados.

- [ ] **Step 5: Commit**

```bash
git add src/app/features/picks/picks-list.component.ts src/app/features/picks/pick-detail.component.ts
git commit -m "fix(picks): allow 2-digit scores (10+)

Bug #6 (A3 plan, synthesis). maxlength=1 blocked scores 10+
(España 10 - Malta 0 imposible). Updated to maxlength=2 + slice(0,2)
in onInput handlers.

Refs: docs/ux-redesign/02-picks.md, 03-pick-detail.md"
```

---

### Task 7: Bug #7 — Empty state /groups desktop CTAs visibles

**Files:**
- Modify: `src/app/features/groups/groups-list.component.ts`

- [ ] **Step 1: Find empty state**

Read `src/app/features/groups/groups-list.component.ts`. Buscar el empty state que dice "Usa los botones de arriba".

- [ ] **Step 2: Reemplazar con `<app-empty-block>` (de A1) con CTAs visible siempre**

**Dependency**: A1 debe estar mergeado (provee `<app-empty-block>` component).

Cambiar el empty state inline para usar `<app-empty-block>`:

```typescript
// Import:
import { EmptyBlockComponent } from '../../shared/ui/empty-block/empty-block.component';
import { GroupActionsService } from '../../core/groups/group-actions.service';

// imports array:
imports: [..., EmptyBlockComponent],

// constructor:
private groupActions = inject(GroupActionsService);

// methods:
openCreateGroup() {
  this.groupActions.openCreate();
}
openJoinGroup() {
  this.groupActions.openJoin();
}
```

Template (reemplazar el bloque actual del empty state):

```html
@if (groups().length === 0 && !loading()) {
  <app-empty-block
    iconName="users"
    title="Sin grupos"
    sub="Crea uno o únete con un código para empezar a competir.">
    <button class="btn btn--primary" type="button" (click)="openCreateGroup()">
      Crear grupo
    </button>
    <button class="btn btn--ghost" type="button" (click)="openJoinGroup()">
      Unirme con código
    </button>
  </app-empty-block>
}
```

- [ ] **Step 3: Manual smoke test**

Run dev server. Open incognito + register new user. Navigate to `/groups`.

Expected: empty state renders con título "Sin grupos" + sub + 2 botones visible CLARO desktop + mobile. Botones funcionan (open create/join modal).

- [ ] **Step 4: Commit**

```bash
git add src/app/features/groups/groups-list.component.ts
git commit -m "fix(groups-list): show CTAs in empty state desktop

Bug #7 (A3 plan, synthesis). Empty state dijo 'Usa los botones de arriba'
pero design v3 topnav buttons display:none → first-time desktop user perdido.
Replaced inline empty state with <app-empty-block> + visible buttons that
trigger group-actions modal.

Refs: docs/ux-redesign/08-groups.md"
```

---

### Task 8: Bug #8 — Fragment mismatch notif → comodines

**Files:**
- Modify: `src/app/features/notifications/notifications-list.component.ts` O `src/app/features/comodines/comodines-list.component.ts` (decisión: cambiar uno)

- [ ] **Step 1: Verify mismatch**

Read both files:

```bash
grep -n 'card-{\|card-pending' src/app/features/notifications/ src/app/features/comodines/
```

Expected: notifications produces `#card-{comodinId}` para PENDING_TYPE_CHOICE notifs, but comodines-list renders `id="card-pending-{comodinId}"`. Mismatch documented.

- [ ] **Step 2: Choose fix direction**

**Recomendación**: cambiar comodines-list ID generation a `card-{comodinId}` (más simple — consistent with notification expectation).

Read `comodines-list.component.ts` y find el template que genera el ID. Cambiar:

```html
<!-- BEFORE -->
<div [id]="'card-pending-' + c.id" ...>

<!-- AFTER -->
<div [id]="'card-' + c.id" ...>
```

- [ ] **Step 3: Verify other usages**

Run:
```bash
grep -n 'card-pending' src/app/
```

Expected: solo el template anterior. Si hay otras referencias (e.g. CSS selectors), update también.

- [ ] **Step 4: Manual smoke test**

Manual E2E:
1. Create un comodín pending type choice (PENDING_TYPE_CHOICE state) — puede requerir admin action.
2. Verify notification aparece con link al comodín.
3. Click notification → expected: scroll a la card específica del comodín (`#card-{id}`).

Si imposible reproducir, al menos verify el ID en DOM matches el fragment del link.

- [ ] **Step 5: Commit**

```bash
git add src/app/features/comodines/comodines-list.component.ts
git commit -m "fix(comodines): align card ID with notification deep-link fragment

Bug #8 (A3 plan, synthesis). Notification resolver used #card-{comodinId}
but comodines-list rendered id='card-pending-{comodinId}'. Mismatch
caused deep-link silent failure. Unified to 'card-{id}'.

Refs: docs/ux-redesign/13-comodines.md, 16-notifications.md"
```

---

### Task 9: Bug #9 — aria-hidden inconsistente /profile Cuenta

**Files:**
- Modify: `src/app/features/profile/profile.component.ts`

- [ ] **Step 1: Find Cuenta icons sin aria-hidden**

Read `src/app/features/profile/profile.component.ts`. Buscar la sección Cuenta donde están los emojis 🔒⚙↩ sin `aria-hidden="true"`.

- [ ] **Step 2: Agregar aria-hidden a los 3 icons Cuenta**

Wrap each emoji con `<span aria-hidden="true">EMOJI</span>` consistente con cómo está hecho en Mi juego section.

- [ ] **Step 3: Manual a11y smoke**

Manual verification: open DevTools accessibility panel y verify que los 3 icons Cuenta tienen aria-hidden=true. Screen reader (NVDA/VoiceOver) NO debería leer los emojis.

- [ ] **Step 4: Commit**

```bash
git add src/app/features/profile/profile.component.ts
git commit -m "fix(profile): add aria-hidden to Cuenta icons (consistency with Mi juego)

Bug #9 (A3 plan, synthesis). 🔒⚙↩ icons en Cuenta missing aria-hidden
while Mi juego icons SÍ los tienen — inconsistencia P4 incomplete.
Fixed for SR consistency.

Refs: docs/ux-redesign/14-profile.md"
```

---

### Task 10: Bug #10 — `<li (click)>` no semántico → `<a routerLink>`

**Files:**
- Modify: `src/app/features/notifications/notifications-list.component.ts`

- [ ] **Step 1: Find `<li (click)>` pattern**

Read `src/app/features/notifications/notifications-list.component.ts`. Find `<li (click)="...">` pattern usado para clickable notifications.

- [ ] **Step 2: Refactor a `<a routerLink>` o `<button>`**

Cambiar `<li (click)>` a un structure que sea semántico:

```html
<!-- BEFORE -->
<ul>
  @for (n of notifications(); track n.id) {
    <li class="notif-item" (click)="onClick(n)">
      <!-- content -->
    </li>
  }
</ul>

<!-- AFTER -->
<ul>
  @for (n of notifications(); track n.id) {
    <li class="notif-item">
      <a [routerLink]="n.targetRoute" [fragment]="n.targetFragment"
         (click)="markRead(n.id)"
         class="notif-item__link">
        <!-- content -->
      </a>
    </li>
  }
</ul>
```

Adaptar el `onClick` handler para que el componente compute `targetRoute` + `targetFragment` per notification.

Si la notif no tiene target (es info-only), usar `<button>` instead.

- [ ] **Step 3: Adjust CSS para que el `<a>` herede los estilos del `<li>`**

```css
.notif-item__link {
  display: block;
  text-decoration: none;
  color: inherit;
  padding: ...; /* same as <li> before */
}
.notif-item__link:focus-visible {
  outline: 2px solid var(--color-primary-green);
  outline-offset: 2px;
}
```

- [ ] **Step 4: Manual smoke test**

Run dev server. Navigate to `/notificaciones`. Tab through notifications con keyboard. Expected: cada notification es focusable + Enter activa el link.

- [ ] **Step 5: Commit**

```bash
git add src/app/features/notifications/notifications-list.component.ts
git commit -m "fix(notifications): replace <li (click)> with semantic <a routerLink>

Bug #10 (A3 plan, synthesis). <li> no es interactive semantically.
Pattern violates Web Guidelines + a11y (no keyboard focus). Replaced
with <a routerLink> + fragment for proper navigation + focus support.

Refs: docs/ux-redesign/16-notifications.md"
```

---

### Task 11: Bug #11 — Mode switch role="tablist" en bracket

**Files:**
- Modify: `src/app/features/picks/bracket-picks.component.ts`

- [ ] **Step 1: Find mode switch (Completo/Simple)**

Read `src/app/features/picks/bracket-picks.component.ts`. Buscar el `<div class="seg">` con `<button class="seg__item">` para mode switch.

- [ ] **Step 2: Add role="tablist" + aria attributes**

Cambiar:

```html
<!-- BEFORE -->
<div class="seg">
  <button class="seg__item" [class.is-active]="mode() === 'COMPLETE'" (click)="mode.set('COMPLETE')">
    Completo
  </button>
  <button class="seg__item" [class.is-active]="mode() === 'SIMPLE'" (click)="mode.set('SIMPLE')">
    Simple
  </button>
</div>

<!-- AFTER -->
<div class="seg" role="tablist" aria-label="Modo de juego">
  <button class="seg__item"
          role="tab"
          [attr.aria-selected]="mode() === 'COMPLETE'"
          [class.is-active]="mode() === 'COMPLETE'"
          (click)="mode.set('COMPLETE')">
    Completo
  </button>
  <button class="seg__item"
          role="tab"
          [attr.aria-selected]="mode() === 'SIMPLE'"
          [class.is-active]="mode() === 'SIMPLE'"
          (click)="mode.set('SIMPLE')">
    Simple
  </button>
</div>
```

- [ ] **Step 3: Manual a11y smoke**

Manual verification: DevTools accessibility panel verify role=tab + aria-selected en cada button. Screen reader debería anunciar "tab, Completo, selected" cuando focuses.

- [ ] **Step 4: Commit**

```bash
git add src/app/features/picks/bracket-picks.component.ts
git commit -m "fix(bracket): add role=tablist + role=tab + aria-selected to mode switch

Bug #11 (A3 plan, synthesis). Mode switch missing role=tablist while
similar segmented controls en predict + special-picks SÍ lo tienen.
Inconsistencia a11y resuelta.

Refs: docs/ux-redesign/05-picks-bracket.md"
```

---

### Task 12: Bug #12 — Hero card mobile-only ranking

**Files:**
- Modify: `src/app/features/ranking/ranking.component.ts`

- [ ] **Step 1: Find hero card + badge sin mobile/desktop classes**

Read `src/app/features/ranking/ranking.component.ts`. Buscar hero card (mobile) y badge "TU POSICIÓN" (desktop) que pueden ser ambos visibles simultáneamente sin classes mobile-only/desktop-only.

- [ ] **Step 2: Add visibility classes**

Wrap hero card con clase mobile-only:

```html
<!-- Hero card mobile -->
<div class="rank-only-mobile">
  <div class="hero-card">...</div>
</div>

<!-- Badge desktop -->
<div class="rank-only-desk">
  <span class="badge">TU POSICIÓN</span>
</div>
```

Y agregar CSS:

```css
.rank-only-mobile { display: block; }
.rank-only-desk { display: none; }

@media (min-width: 768px) {
  .rank-only-mobile { display: none; }
  .rank-only-desk { display: block; }
}
```

- [ ] **Step 3: Manual smoke**

Run dev server. Navigate to `/ranking`. Resize viewport: mobile (<768) → solo hero card visible. Desktop (≥768) → solo badge visible.

- [ ] **Step 4: Commit**

```bash
git add src/app/features/ranking/ranking.component.ts
git commit -m "fix(ranking): mutually exclusive mobile hero card / desktop badge

Bug #12 (A3 plan, synthesis). Hero card mobile + 'TU POSICIÓN' badge
desktop potentially visible simultaneously without explicit
mobile-only / desk-only classes. Fixed with media query toggle.

Refs: docs/ux-redesign/07-ranking.md"
```

---

### Task 13: Bug #13 — scrollToTop prefers-reduced-motion

**Files:**
- Modify: `src/app/features/ranking/ranking.component.ts` (probable, donde está scrollToTop) — buscar en codebase

- [ ] **Step 1: Find scrollToTop usage**

Run:
```bash
grep -rn 'scrollTo\|scroll-behavior.*smooth\|smooth.*scroll' src/app/features/ranking/
```

Expected: 1+ matches en ranking.component.ts.

- [ ] **Step 2: Add prefers-reduced-motion check**

Wrap scrollTo call:

```typescript
scrollToTop() {
  const prefersReduced = typeof window !== 'undefined'
    && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  window.scrollTo({
    top: 0,
    behavior: prefersReduced ? 'auto' : 'smooth',
  });
}
```

- [ ] **Step 3: Manual smoke**

Manual: enable OS-level reduce motion (Windows: Settings → Accessibility → Visual effects → Animation effects = OFF). Reload `/ranking`. Click scrollToTop button. Expected: scroll happens instantly (no smooth animation).

- [ ] **Step 4: Commit**

```bash
git add src/app/features/ranking/ranking.component.ts
git commit -m "fix(ranking): respect prefers-reduced-motion in scrollToTop

Bug #13 (A3 plan, synthesis). scrollToTop forced behavior:smooth ignoring
OS-level reduce motion. Wrapped in matchMedia check.

Refs: docs/ux-redesign/07-ranking.md"
```

---

### Task 14: Final verification + audit

**Files:** Ninguno modificado.

- [ ] **Step 1: Run all tests**

```bash
npx jest
```

Expected: no new failures vs pre-A3 baseline.

- [ ] **Step 2: Run production build**

```bash
npx ng build --configuration=production
```

Expected: success.

- [ ] **Step 3: Verify each bug fix grep**

Run:
```bash
# Bug 1: shell + toast consume var
grep 'margin-left: var(--sidebar-w)' src/app/shared/layout/shell.component.ts src/app/shared/layout/trivia-toast.component.ts
# Expected: 2 matches.

# Bug 2: Mis picks exact
grep 'routerLink="/picks"' src/app/shared/layout/sidebar.component.ts | grep 'exact: true'
# Expected: 1 match.

# Bug 6: maxlength=2 no =1
grep -rE 'maxlength="1"' src/app/features/picks/
# Expected: 0 matches.

# Bug 8: card-pending-{ no longer in comodines
grep 'card-pending-' src/app/features/comodines/
# Expected: 0 matches.

# Bug 10: no <li (click)>
grep '<li.*(click)' src/app/features/notifications/
# Expected: 0 matches.

# Bug 11: bracket mode switch role=tablist
grep 'role="tablist"' src/app/features/picks/bracket-picks.component.ts
# Expected: 1 match.

# Bug 13: prefers-reduced-motion in ranking
grep 'prefers-reduced-motion' src/app/features/ranking/
# Expected: 1+ matches.
```

- [ ] **Step 4: Final smoke test through critical paths**

Manual smoke:
1. **Sidebar hover** → no overlap with shell.
2. **Navigate /picks/group-stage/predict** → only "Mundial 2026" active in sidebar.
3. **Create group with description** → render in /groups/:id.
4. **Register flow with UserNotConfirmedException** → password preserved through confirm step.
5. **Empty /picks/bracket** → "Ir a mis terceros" → /picks/group-stage?view=pred.
6. **Score input** → 2 digits accepted.
7. **Empty /groups (new user)** → CTAs visible desktop.

- [ ] **Step 5: Acceptance gate checklist**

Verificar contra spec A3:
- [x] CSS variable `--sidebar-w` consumido en shell + trivia-toast.
- [x] Sidebar nav 1 item active simultaneously en `/picks/group-stage/predict`.
- [x] `/groups/:id` renderiza description.
- [x] Register deep-link `?email=X&confirm=1` flow funcional con password preserved.
- [x] `/picks/bracket` empty link → `/picks/group-stage?view=pred`.
- [x] Bug fixes additional surfaced (#6-#13).
- [x] Regression: tests existentes verdes.

---

## Summary

A3 produce 13 bug fixes mecánicos en commits independientes. Cada commit referencia el doc UX original + el spec.

**Dependency**: Task 1 (margin-left overlap) requires A1 mergeado primero (provee `--sidebar-w` token). Otros tasks son independientes y pueden paralelizar.

**Sub-proyectos downstream que se benefician de A3**:
- A7 auth family → deep-link confirm flow funcional (bug #4)
- A8b core surfaces → score input 2 digits (bug #6), description render (bug #3)
- A8c sub-features → aria-hidden profile (bug #9), `<li (click)>` notif (bug #10), ranking mobile-only (bug #12), scroll prefers-reduced-motion (bug #13)

**Estimación**: ~5 días (13 tasks × 30 min cada una + integration testing). Spec original decía 3 días con 5 bugs; synthesis añadió 8 más.

**Dispatch strategy**: 1 sub-agente opus 4.7 coordinador. Tasks 2-13 son altamente paralelizables después de Task 1 — podrían splitearse en 2-3 sub-agentes simultáneos.

**Next**: A3 mergeable independiente. No bloquea otros sub-proyectos.
