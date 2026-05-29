# Polla Mundialista — Developer Handoff Document

> Comprehensive UX/development reference for the end-user-facing surfaces of la app.
> Excluye la familia `admin/*` (decisión de producto, fuera de scope para este handoff).
>
> Audiencia: developers que tomen el mantenimiento o evolución del producto.
> Cobertura: 36 superficies (5 auth + 16 features + 8 modales globales + 7 shell).
>
> Fuente: análisis UX en `docs/ux-redesign/01-36.md` + implementación en
> `src/app/**` después del master plan Sprint 1-13 + cleanup A11.

---

## Tabla de contenido

1. [Tech stack + decisiones globales](#1-tech-stack--decisiones-globales)
2. [Componentes compartidos](#2-componentes-compartidos)
3. [Design tokens](#3-design-tokens-css-variables)
4. [Reglas UX universales](#4-reglas-ux-universales)
5. [User flows](#5-user-flows)
6. [Superficies — referencia detallada](#6-superficies--referencia-detallada)
   - 6.1 Auth family (5)
   - 6.2 Main feature surfaces (16)
   - 6.3 Global modals (8)
   - 6.4 Shell + layout (7)

---

## 1. Tech stack + decisiones globales

### 1.1 Stack

| Capa | Tecnología |
|---|---|
| Frontend framework | Angular 18 (standalone components + signals) |
| Lenguaje | TypeScript (strict) |
| Build / dev | Angular CLI (`ng serve`, `ng build`) |
| Backend | AWS Amplify Gen 2 (repo separado `polla-backend`) |
| Auth | Amazon Cognito (email + OTP confirm) |
| Datos | AppSync GraphQL → DynamoDB |
| Storage | S3 (avatares vía `avatarKey`) |
| Iconos | `@lucide/angular@1.x` (SVG, 32 icons registrados — ver `icon-map.ts`) |
| Banderas | `flag-icons` CSS (clases `fi fi-xx`) |
| Estilos | CSS tokens + scoped per-component + utilidades Tailwind puntuales |
| Animación | CSS keyframes + transitions; `prefers-reduced-motion` respetado universalmente |

### 1.2 Decisiones de marca y tono

- **Marca**: Golgana — el sub-título es "Polla Mundialista 2026".
- **Logo**: `assets/logo-golgana.png` (199×98) con utility class `.brand-logo`,
  `.brand-logo--sm` (24px), `.brand-logo--md` (32px), `.brand-logo--lg` (48px).
- **Tono**: **tú** en toda la copy (no voseo). Ejemplos: "Hacé" → "Haz",
  "Querés" → "Quieres". Excepción: jerga (panas, polla) se mantiene.
- **Lenguaje del producto**: español.

### 1.3 Breakpoints responsivos

| Bucket | Rango | Características |
|---|---|---|
| Mobile | `<768px` | Bottom-nav, sheets, hit-target ≥44px, safe-area-inset, sin right-rail |
| Tablet | `768px – 1099px` | Sidebar vertical, sin right-rail, grids 1–2 columnas |
| Desktop | `≥1100px` | Sidebar hover-expandible (64↔200px), right-rail 320px, grids completos |

> Nota: `tokens.css` aún declara `--bp-tablet: 480px` y `--bp-desktop: 992px`
> como tokens legacy del manual de marca. La capa de redesign A1-A11 trabaja
> sobre los 3 buckets de arriba (`<768` / `768-1099` / `≥1100`).

### 1.4 Estructura de carpetas (resumen)

```
src/app/
  core/                  servicios singleton (auth, api, notifications)
  shared/
    layout/              shell, sidebar, nav, right-rail, footer, trivia-toast
    ui/                  componentes base (icon, modal, skeleton, empty-block…)
    user-avatar/         <app-user-avatar>
    util/                guards (authGuard, dirtyFormGuard) + DirtyAware
  features/
    auth/                login · register · forgot-password
    onboarding/          OnboardingComponent (post-register hub)
    home/                HomeComponent (dashboard)
    picks/               picks-list · pick-detail · picks-tabla-grupos · bracket
    groups/              groups-list · group-detail · group-edit · group-prizes-edit · group-invite-email · group-join
    ranking/             RankingComponent
    profile/             ProfileComponent · SpecialPicksComponent
    comodines/           ComodinesListComponent
    notifications/       NotificationsListComponent
    trivia/              trivia-popup
    admin/               (fuera de scope)
```

---

## 2. Componentes compartidos

Todos viven en `src/app/shared/`. Cada uno es standalone — importar
directamente en el `imports[]` del componente consumer.

### 2.1 `<app-icon>`

```html
<app-icon name="bell" size="md" />              <!-- decorative (default) -->
<app-icon name="bell" size="md" [decorative]="false" label="Notificaciones" />
```

- `name`: type-checked contra `IconName` (`shared/ui/icon/icon-map.ts`).
- `size`: `'sm' | 'md' | 'lg' | 'xl'` → 16/20/24/32 px.
- `decorative=true` por defecto → `aria-hidden`. Si es semántico, pasar `false`
  y un `label` (se inyecta como `<title>` interno).
- Wrapper sobre `@lucide/angular`. Icons deben estar registrados en
  `app.config.ts` vía `provideLucideIcons()`.

### 2.2 `<app-modal>`

```html
<app-modal
  title="Editar grupo"
  description="Cambia el nombre y los premios."
  size="md"
  (close)="onClose()">
  <div body>...</div>
  <div footer>...</div>
</app-modal>
```

- `size`: `'sm' | 'md' | 'lg'` → 380 / 480 / 640 px.
- Slots: `[body]` y `[footer]` por `ng-content select=`.
- Implementa CDK `cdkTrapFocus`, `role="dialog"`,
  `aria-labelledby="<title>"`, `aria-describedby="<description>"`.
- Cierra con `Esc`, click en backdrop, o botón ×.
- Respeta `prefers-reduced-motion` (fade-in 200ms o instant).

### 2.3 `<app-empty-block>`

```html
<app-empty-block
  iconName="users"
  title="No tienes grupos aún"
  sub="Crea uno o únete con un código para empezar.">
  <button class="btn-primary">Crear grupo</button>
  <button class="btn-secondary">Unirme con código</button>
</app-empty-block>
```

- Slot por defecto = acciones (botones).
- Uso obligatorio en cualquier lista que pueda estar vacía.

### 2.4 `<app-skeleton>`

```html
<app-skeleton variant="card" [count]="3" />
<app-skeleton variant="text" />
<app-skeleton variant="list" [count]="5" />
<app-skeleton variant="circle" />
```

- `variant`: `'text' | 'card' | 'list' | 'circle'`.
- `count`: número de placeholders.
- Animación shimmer envuelta en `@media (prefers-reduced-motion: reduce) { animation: none }`.
- **Regla**: reemplazar TODO "Cargando…" texto por skeleton.

### 2.5 `<app-more-sheet>`

```html
<app-more-sheet [open]="moreOpen()" (close)="moreOpen.set(false)">
  <a class="more-sheet__item" routerLink="/comodines">...</a>
</app-more-sheet>
```

- Slide-up sheet mobile (bottom-anchored).
- Backdrop click + Esc cierran.
- `role="dialog"` + focus-trap interno.
- Usa `env(safe-area-inset-bottom)` para padding inferior.

### 2.6 `<app-auth-brand-panel>`

- Panel izquierdo en `/login`, `/register`, `/forgot-password`, `/groups/join/:code`.
- Props: `[stats]="[{label, value}, ...]"`.
- Solo visible en desktop ≥992px; mobile usa header propio del form.

### 2.7 `<app-otp-input>`

- 6 inputs numéricos para confirmación de email.
- `(complete)="onCode($event)"` cuando se llenan los 6 dígitos.
- Auto-focus next + backspace navega previous + paste auto-distribuye.

### 2.8 `<app-password-rules-list>`

- Lista de reglas con estado live (✓/✗).
- Reglas: ≥8 chars, mayúscula, minúscula, dígito, símbolo.
- `[password]="password()"` reactivo.

### 2.9 `<app-confirm-dialog>` + `ConfirmDialogService`

```ts
const ok = await this.confirmDialog.ask({
  title: 'Eliminar grupo',
  message: '¿Estás seguro? Esta acción no se puede deshacer.',
  confirmLabel: 'Eliminar',
  cancelLabel: 'Cancelar',
  danger: true,
});
```

- Programático — no markup. Retorna `Promise<boolean>`.
- `danger: true` aplica estilo rojo al botón confirm.

### 2.10 `<app-team-flag>`

```html
<app-team-flag code="MEX" size="md" />
```

- `code`: ISO 3-letter (MEX, ARG, BRA…).
- `size`: `'sm' | 'md' | 'lg'`.
- Renderiza span con clase `flag-icons` (CSS background).

### 2.11 `<app-user-avatar>`

```html
<app-user-avatar
  [sub]="user.sub"
  [handle]="user.handle"
  [avatarKey]="user.avatarKey"
  size="md" />
```

- Si hay `avatarKey` → carga desde S3.
- Si no, fallback a iniciales del `handle` sobre gradient `#067a4a → #02cc74`.
- `size`: `'sm' (32px) | 'md' (40px) | 'lg' (64px) | 'xl' (96px)`.

### 2.12 `DirtyFormGuard` + `DirtyAware`

```ts
export class GroupEditComponent implements DirtyAware {
  isDirty = signal(false);
}

// app.routes.ts
{ path: 'groups/:id/edit', canDeactivate: [dirtyFormGuard], ... }
```

- El guard llama a `confirmDialog.ask()` si `isDirty()` es true al navegar fuera.
- Aplicado en `group-edit`, `group-prizes-edit`, `group-invite-email`.

---

## 3. Design tokens (CSS variables)

Fuente: `src/styles/tokens.css`. Tokens críticos:

### 3.1 Espaciado (8pt scale)

```css
--space-xs:  4px;   --space-sm:  8px;   --space-md:  16px;
--space-lg:  24px;  --space-xl:  32px;  --space-2xl: 48px;
--space-3xl: 64px;
```

### 3.2 Modal sizing

```css
--modal-radius: 16px;
--modal-padding: 28px;    --modal-padding-sm: 20px;    --modal-padding-lg: 36px;
--modal-max-width-sm: 380px;  --modal-max-width-md: 480px;  --modal-max-width-lg: 640px;
--modal-backdrop-color: rgba(0,0,0,0.75);
--modal-backdrop-blur: 6px;
```

### 3.3 Animación

```css
--anim-fast: 150ms;   --anim-base: 200ms;   --anim-slow: 300ms;
--easing-default: cubic-bezier(0.4, 0, 0.2, 1);
--easing-enter:   cubic-bezier(0, 0, 0.2, 1);
--easing-exit:    cubic-bezier(0.4, 0, 1, 1);
```

### 3.4 Z-index (mental model: low → high)

```css
--z-base: 0;        --z-sticky: 10;       --z-overlay: 100;
--z-modal: 1000;    --z-dropdown: 1100;   --z-toast: 1500;
--z-tooltip: 2000;
```

### 3.5 Hit-target

```css
--hit-target-min: 44px;   /* Apple HIG 44pt / Material 48dp */
```

### 3.6 Logo sizing

```css
--logo-size-sm: 24px;   --logo-size-md: 32px;   --logo-size-lg: 48px;
```

Utility class: `.brand-logo`, `.brand-logo--sm`, `.brand-logo--md`, `.brand-logo--lg`.

### 3.7 Sidebar reactivo

```css
--sidebar-w: 64px;   /* default; mutado a 200px on hover via JS */
```

`shell.component` consume `margin-left: var(--sidebar-w)` para evitar overlap.
`<app-sidebar>` muta `document.documentElement.style.setProperty('--sidebar-w', '200px')`
en `mouseenter` (no-op en mobile <768px).

### 3.8 Colores semánticos

```css
--color-win:  #02CC74;   --color-draw: #F4D03F;   --color-lost: #E74C3C;
--color-primary-green: #02CC74;
--color-primary-black: #0A0A0A;
--color-bg-cream:      #F5F4F0;
--color-line:          rgba(0,0,0,0.08);
```

---

## 4. Reglas UX universales

Aplican a **toda** superficie. El reviewer debe verificarlas en cualquier
PR que toque UI.

| # | Regla | Implementación |
|---|---|---|
| 1 | Hit-target mínimo 44×44px en mobile | `min-width: var(--hit-target-min); min-height: var(--hit-target-min)` en botones icon-only |
| 2 | Respetar `prefers-reduced-motion` | Wrappear animaciones con `@media (prefers-reduced-motion: reduce) { animation: none; transition: none; }` |
| 3 | A11y modales | `cdkTrapFocus` + `role="dialog"` + `aria-labelledby` + `aria-describedby` + `Esc` cierra |
| 4 | Loading states | Usar `<app-skeleton variant="...">` — NUNCA texto "Cargando…" |
| 5 | Empty states | Usar `<app-empty-block>` con icono + título + sub + CTA(s) |
| 6 | Error messages | `role="alert"` para que screen readers anuncien automáticamente |
| 7 | Formas con cambios sin guardar | `canDeactivate: [dirtyFormGuard]` + implementar `DirtyAware` |
| 8 | Estilos via tokens | No inline styles; consumir variables de `tokens.css` |
| 9 | Safe-area mobile | `padding-bottom: env(safe-area-inset-bottom)` en sticky bottoms |
| 10 | Iconos vía `<app-icon>` | No emojis estructurales (✓ permitidos en copy decorativa) |
| 11 | Tipografía tabular | `font-variant-numeric: tabular-nums` en KPIs/contadores |
| 12 | Truncate textos largos | `overflow: hidden; text-overflow: ellipsis; min-width: 0` en flex items |
| 13 | `data-tour` markers | Anchors del tour-overlay 3 pasos — preservar en sidebar/picks/groups/mundial |
| 14 | Focus visible | `:focus-visible` con outline o `box-shadow` inset 2px verde |
| 15 | Tabular keyboard nav | Flechas en tablas, Enter/Space en buttons custom |

---

## 5. User flows

### 5.1 Primer visitante

```
┌───────────────┐    ┌──────────────┐    ┌────────────────┐    ┌──────────────────────────────┐
│  /register    │───▶│ OTP confirm  │───▶│  /onboarding   │───▶│ /home  (o returnUrl si aplica) │
│  (3-step      │    │  inline en   │    │  3 pasos hub   │    │                                │
│   state mach) │    │  /register   │    │  + skip        │    │                                │
└───────────────┘    └──────────────┘    └────────────────┘    └──────────────────────────────┘
```

- Si en `/register` se detecta `?returnUrl=/groups/join/ABC`, el onboarding
  se **omite** automáticamente y se redirige a la `returnUrl`.

### 5.2 Returning user

```
┌────────┐    ┌────────────────────────────────────┐
│ /login │───▶│ /home  (o ?returnUrl=… si existe) │
└────────┘    └────────────────────────────────────┘
```

- `LoginComponent` maneja `UserNotConfirmedException` re-emitiendo
  un OTP y redirigiendo de vuelta al sign-in con email pre-rellenado.

### 5.3 Forgot password

```
┌────────┐    ┌──────────────────┐    ┌────────────┐    ┌──────────────────┐    ┌──────────┐
│ /login │───▶│ /forgot-password │───▶│ OTP email  │───▶│ Reset (step 2)  │───▶│ /home    │
│ "¿Olv?"│    │ (step 1 request) │    │  6 dígitos │    │ nueva password   │    │ auto-log │
└────────┘    └──────────────────┘    └────────────┘    └──────────────────┘    └──────────┘
```

### 5.4 Group join deep-link

```
External email/share link  →  /groups/join/:code
  ↓ (authGuard)
  Si no auth:  /login?returnUrl=/groups/join/:code
    o /register?returnUrl=…
  ↓
  /groups/join/:code  (preview del grupo + botón "Unirme")
  ↓
  /groups/:id  (group detail)
```

- El `returnUrl` se preserva a través del flujo register → onboarding
  (onboarding se salta si hay returnUrl).

### 5.5 Picks flow (core game loop)

```
/home
  ↓ "Hacer N picks pendientes"
/picks  (lista cronológica de partidos)
  ↓ click sobre un partido
/picks/match/:id  (pre-match: form de score · post-match: verdict)
  ↓ guardar pick
/picks  (back con flash de confirmación)
  ↺  repetir
```

Side-quests dentro de picks:

- `/picks/group-stage?view=real|pred` — toggle entre tabla real vs. predicción.
- `/picks/bracket` — bracket de eliminatorias (grid desktop, accordion mobile).

### 5.6 Group creation + management

```
/groups  o sidebar "+" mobile
  ↓
GroupActionsModalsComponent (modal global)
  ├─ "Crear grupo"   → flujo wizard inline en el modal
  └─ "Unirme con código" → input code → /groups/:id

Dentro de /groups/:id (siendo admin):
  ├─ /groups/:id/edit       (cambiar nombre, mode, privacy)
  ├─ /groups/:id/prizes     (premios por posición)
  ├─ /groups/:id/invite     (invitar por email)
  └─ Transfer admin modal   (inline, otorgar admin a otro miembro)
```

### 5.7 Comodín redemption

```
/comodines (o /mis-comodines — alias)
  ↓ click "Canjear código"
RedeemModalComponent (modal global, vive en shell)
  ├─ input code de sponsor
  ├─ submit → ApiService.redeemSponsorCode()
  └─ feedback inline + actualiza lista
```

### 5.8 Trivia game loop

```
Banner sticky TriviaToastComponent (cuando hay trivia LIVE)
  ↓ click
TriviaPopupComponent modal
  ├─ pregunta + opciones
  ├─ submit answer
  └─ feedback (correct/wrong + pts)
```

Variante con sponsor pill (cuando la trivia tiene sponsor) — botón FAB en lugar
de toast.

---

## 6. Superficies — referencia detallada

### 6.1 Auth family (5 superficies)

#### 1. `/login` — LoginComponent

**URL/Access**:
- Route: `/login`
- Acceso: redirect desde `authGuard` cuando no autenticado, `?returnUrl=` para volver a deep-link, link "Iniciar sesión" desde footer público.

**Auth requirement**: público.

**Objetivo**:
Autenticar al usuario. Returning users entran con email + password. Punto de entrada para deep-link sharing (`/groups/join/:code`).

**Elementos**:
- **Desktop ≥992**: layout 2 columnas — `<app-auth-brand-panel>` izquierda + form derecha.
- Brand panel: logo Golgana, h1 marketing, sub explicativo, stats 3-up (jugadores · grupos · premios), footer © + Términos · Privacidad.
- Form: kicker "BIENVENIDO", h1 "Entrar", input email, input password (con eye toggle), link "¿Olvidaste tu contraseña?", error con `role="alert"`, botón primary "Entrar", footer "¿Primera vez? Crear cuenta →".
- **Mobile <992**: header propio con logo + h1 "Polla Mundialista" + kicker. Form idéntico.
- Email se pre-rellena desde `?email=` (post-register o reset auto-login).

**Componentes usados**:
- `<app-auth-brand-panel>`, `<app-icon>` (eye toggle), inputs nativos validados.

**UX rules**:
- **Desktop ≥1100px**: 2 cols 50/50, brand panel sticky, form max-width 420px centrado.
- **Tablet 768-1099**: brand panel se oculta (form full-width centrado con max-width 480px).
- **Mobile <768**: header replace brand, padding lateral 20px, botón submit full-width sticky-bottom optional.

**A11y**:
- Tab order: email → password → eye → forgot → submit → register link.
- Errors `role="alert"` se anuncian automáticamente.
- `UserNotConfirmedException` redirige a `/register?step=confirm&email=` con OTP nueva.

**Backend dependencies**:
- `AuthService.signIn(email, password)` → Cognito.
- `AuthService.resendConfirmation(email)` cuando user not confirmed.

**Related docs**: `docs/ux-redesign/17-login.md`.

---

#### 2. `/register` — RegisterComponent

**URL/Access**:
- Route: `/register`
- Acceso: link desde `/login`, link desde landing, deep-link con `?returnUrl=`.

**Auth requirement**: público.

**Objetivo**:
Crear cuenta nueva. Maneja state machine de 3 pasos: form → OTP confirm → success.

**Elementos**:
- Brand panel izquierda (desktop), header propio (mobile).
- **Step 1 (form)**: kicker "CREAR CUENTA", h1 "Únete", inputs (handle único, email, password, confirm password), `<app-password-rules-list>` live, checkbox "Acepto términos y privacidad" (links a docs), botón "Crear cuenta".
- **Step 2 (OTP confirm)**: kicker "CONFIRMA TU EMAIL", h2 "Te enviamos un código a {{email}}", `<app-otp-input>` 6 dígitos, link "Reenviar código" (cooldown 30s), error inline.
- **Step 3 (success)**: ✓ check verde, "¡Cuenta creada!", redirect automático a `/onboarding` o `returnUrl`.

**Componentes usados**:
- `<app-auth-brand-panel>`, `<app-password-rules-list>`, `<app-otp-input>`, `<app-icon>`.

**UX rules**:
- **Desktop ≥1100px**: brand panel izquierda, form derecha max-width 420px.
- **Tablet 768-1099**: form full-width centrado.
- **Mobile <768**: padding 20px, inputs full-width, hit-target ≥44px.
- Transición entre steps: fade 200ms (respeta `reduced-motion`).
- Si `?returnUrl=` presente → al confirmar, saltar onboarding e ir directo a returnUrl.

**A11y**:
- OTP input: auto-focus next, backspace previous, paste auto-distribuye.
- Live region anuncia "Cuenta creada" / "Código inválido".
- Botón "Reenviar" deshabilitado durante cooldown con `aria-live="polite"` mostrando tiempo restante.

**Backend dependencies**:
- `AuthService.signUp(email, password, handle)`.
- `AuthService.confirmSignUp(email, code)`.
- `AuthService.resendConfirmation(email)`.

**Related docs**: `docs/ux-redesign/18-register.md`.

---

#### 3. `/forgot-password` — ForgotPasswordComponent

**URL/Access**:
- Route: `/forgot-password`
- Acceso: link "¿Olvidaste?" desde `/login`.

**Auth requirement**: público.

**Objetivo**:
Recuperar acceso. State machine 2 pasos: request → reset.

**Elementos**:
- Brand panel izquierda (desktop) + header mobile.
- **Step 1 (request)**: kicker "RECUPERAR ACCESO", h1 "Olvidaste tu password", input email, botón "Enviar código".
- **Step 2 (reset)**: kicker "CONFIRMA EL CÓDIGO", h2 "Código enviado a {{email}}", `<app-otp-input>`, input new password + confirm + `<app-password-rules-list>`, botón "Guardar nueva password".
- Success → auto-login → redirect `/home` (o `returnUrl`).
- Link "Volver al login" siempre visible.

**Componentes usados**:
- `<app-auth-brand-panel>`, `<app-otp-input>`, `<app-password-rules-list>`.

**UX rules**:
- Mismo layout responsivo que login/register.
- Transición entre steps fade 200ms.

**A11y**:
- Errores `role="alert"`.
- OTP idéntico al de register.

**Backend dependencies**:
- `AuthService.resetPassword(email)`.
- `AuthService.confirmResetPassword(email, code, newPassword)`.
- `AuthService.signIn()` para auto-login post-reset.

**Related docs**: `docs/ux-redesign/19-forgot-password.md`.

---

#### 4. `/groups/join/:code` — GroupJoinComponent

**URL/Access**:
- Route: `/groups/join/:code`
- Acceso: link compartido por email/chat por miembros del grupo.

**Auth requirement**: autenticado (`authGuard`). Si no, redirige a `/login?returnUrl=/groups/join/CODE`.

**Objetivo**:
Permitir a un usuario unirse a un grupo privado mediante código compartido. Render layout `auth-shell` (no el shell de la app).

**Elementos**:
- Brand panel desktop con stats del grupo (members count, premio total).
- Card central con: avatar/icono del grupo, nombre del grupo, descripción opcional, lista de miembros (first 5 + "y N más"), premio total, mode (SIMPLE/COMPLETE) pill.
- CTAs: "Unirme al grupo" (primary), "Cancelar" (link al home).
- Estado error: "Código inválido" con CTA a `/groups`.

**Componentes usados**:
- `<app-auth-brand-panel>`, `<app-user-avatar>` para miembros, `<app-icon>`, `<app-empty-block>` para error.

**UX rules**:
- **Desktop ≥1100px**: grid 2 cols con brand panel.
- **Tablet/Mobile**: 1 col, card centrada, padding 20px.
- Loading state mientras se resuelve el código: `<app-skeleton variant="card">`.

**A11y**:
- `role="alert"` en error de código inválido.
- Botón "Unirme" `aria-busy="true"` durante request.

**Backend dependencies**:
- `ApiService.previewGroupByCode(code)`.
- `ApiService.joinGroup(code)`.

**Related docs**: `docs/ux-redesign/20-group-join.md`.

---

#### 5. `/onboarding` — OnboardingComponent

**URL/Access**:
- Route: `/onboarding`
- Acceso: redirect post-register (cuando NO hay `returnUrl`).

**Auth requirement**: autenticado.

**Objetivo**:
Hub post-registro que invita a configurar 3 cosas críticas antes del torneo: foto/handle, picks especiales, primer grupo.

**Elementos**:
- Header brand + saludo "¡Bienvenido, @handle!".
- 3 cards de pasos (verticales en mobile, horizontales en desktop):
  1. **Foto y bio** → abre `EditProfileModal`.
  2. **Picks especiales** → link a `/profile/special-picks`.
  3. **Tu primer grupo** → abre `GroupActionsModal` (crear/unirme).
- Cada card tiene check ✓ cuando se completa (estado persistido en `AuthService.user`).
- Botón "Saltar y empezar a jugar →" siempre visible (link a `/home`).
- Progress indicator "X/3 completos".

**Componentes usados**:
- `<app-icon>`, `<app-user-avatar>`.
- Triggea `EditProfileModal` y `GroupActionsModal` (servicios).

**UX rules**:
- **Desktop ≥1100px**: 3 cards en row, max-width 960px centrado.
- **Tablet 768-1099**: 2 cols + 1 wrap, o 3 cards stacked.
- **Mobile <768**: 3 cards stacked vertical, padding 20px, scroll natural.
- Sin shell de la app (sin sidebar/nav) — layout standalone.

**A11y**:
- Cada card es un `<button>` o `<a>` con label descriptivo.
- Check ✓ con `aria-label="Completado"`.

**Backend dependencies**:
- `AuthService.user` reactivo para estado de completitud.
- TODO(A6): persistir "onboarding skipped" flag para no re-mostrar.

**Related docs**: `docs/ux-redesign/21-onboarding.md`.

---

### 6.2 Main feature surfaces (16 superficies)

#### 6. `/home` — HomeComponent

**URL/Access**:
- Route: `/home` (también `/` redirige a aquí).
- Acceso: post-login default, sidebar "Inicio", logo click.

**Auth requirement**: autenticado.

**Objetivo**:
Dashboard personal. Responde "¿cómo voy?" en ≤3s y dirige a la próxima acción.

**Elementos** (organizado por estado pre/durante/post torneo):
- **Identity strip**: avatar + `@handle` + saludo contextual.
- **Primary CTA contextual único**:
  - Pre-torneo sin grupos → "Crear tu primer grupo".
  - Pre-torneo con grupos → "Configurar especiales" (si faltan).
  - Durante torneo con pending → "Hacer N picks pendientes".
  - Durante torneo sin pending → "Ver mi último resultado".
- **Countdown** (solo pre-torneo): "Faltan X días al Mundial".
- **Mis grupos**: lista de grupos con avatar + nombre + members/prize + `#rank` pill + mode badge (SIMPLE/COMPLETE).
- **Ranking emocional**: card con percentile bar + mejor posición contextual ("Sos #2 en Oficina Q1").
- **Picks especiales row** (pre-torneo + durante): 3 chips (CHAMPION/RUNNER_UP/DARK_HORSE) con flag + progress N/3.
- **Comodines section**: solo se renderiza si `count > 0` (no slots vacíos).
- **Next match card** (durante torneo): countdown + equipos + tu pick.

**Componentes usados**:
- `<app-icon>`, `<app-user-avatar>`, `<app-team-flag>`, `<app-skeleton>`, `<app-empty-block>`.

**UX rules**:
- **Desktop ≥1100px**: layout 2 cols con right-rail (rail tiene next-match, trivia activa, group activity).
- **Tablet 768-1099**: 1 col, secciones stacked, sin right-rail.
- **Mobile <768**: 1 col compacta, padding 14px, padding-bottom 74px (clearance bottom-nav).
- Single primary CTA — no duplicar acciones.
- `tabular-nums` en todos los KPIs/contadores.

**A11y**:
- Skeleton durante carga (no "Cargando…").
- Each section h2 con `aria-level`.
- Rank pills con `aria-label="Posición #N en grupo X"`.

**Backend dependencies**:
- `ApiService.getMyTotals()`, `getMyGroups()`, `pendingMatches()`, `listSpecialPicks()`, `listMyComodines()`.

**Related docs**: `docs/ux-redesign/01-home.md`.

---

#### 7. `/picks` — PicksListComponent

**URL/Access**:
- Route: `/picks`
- Acceso: sidebar "Mis picks", home CTA, bottom-nav mobile.

**Auth requirement**: autenticado.

**Objetivo**:
Listado cronológico de partidos. Permite ver estado de cada pick (pendiente, guardado, verdict post-match).

**Elementos**:
- Filtros sticky top: chips "Pendientes" | "Próximos 24h" | "Todos" | "Por fase".
- Lista de matches agrupada por día (sticky day headers).
- Cada item: hora · `<app-team-flag>` × 2 · nombres · estado del pick:
  - **Pendiente**: badge naranja "Pendiente" + "Hacer pick" CTA.
  - **Guardado pre-match**: tu predicción (X-Y) + countdown.
  - **Post-match verdict**: tu pick · resultado real · +N pts (verde/amarillo/rojo).
- Banner contextual `<app-picks-pending-banner>` arriba si hay pendientes urgentes.
- Empty state: "No hay partidos en este filtro" con `<app-empty-block>`.

**Componentes usados**:
- `<app-team-flag>`, `<app-icon>`, `<app-skeleton variant="list">`, `<app-empty-block>`, `<app-picks-pending-banner>`.

**UX rules**:
- **Desktop ≥1100px**: lista con right-rail (rail con stats agregadas).
- **Tablet 768-1099**: 1 col, lista full-width.
- **Mobile <768**: padding 14px, day headers sticky con shadow al scroll.
- `prefers-reduced-motion`: deshabilita slide-in de items.

**A11y**:
- Cada match item es `<a>` o `<button>` con label "Pick para ARG vs MEX, 15 jun 16:00".
- Verdict badges con `role="status"`.

**Backend dependencies**:
- `ApiService.listMatches({tournamentId, filter})`.
- `ApiService.getMyPicks()`.

**Related docs**: `docs/ux-redesign/02-picks.md`.

---

#### 8. `/picks/match/:id` — PickDetailComponent

**URL/Access**:
- Route: `/picks/match/:id`
- Acceso: click sobre item en `/picks`, deep-link desde notificación.

**Auth requirement**: autenticado.

**Objetivo**:
Hacer/editar un pick para un partido específico, o ver el verdict post-match.

**Elementos**:
- Header: nombre del partido + fecha/hora + estadio + fase (Grupo A / Octavos / etc.).
- **Pre-match (kickoff > now)**:
  - 2 columnas: equipo local + equipo visitante con `<app-team-flag size="lg">`.
  - Score inputs (numéricos, 0-9) con +/- buttons mobile.
  - Opcional: predicción de goleador + chip de ganador.
  - Banner countdown "Cierra en Xh Ym".
  - Botón "Generar aleatorio" (abre `RandomizerModal`).
  - Botón primary "Guardar pick" → toast confirm + back a `/picks`.
- **Post-match (kickoff <= now)**:
  - Verdict card: tu pick · resultado real · +N pts.
  - Breakdown del scoring (exacto / ganador / goleador).
  - Trivia indicator si hay trivia activa para este partido.

**Componentes usados**:
- `<app-team-flag>`, `<app-icon>`, `<app-skeleton>`, `RandomizerModalComponent`.

**UX rules**:
- **Desktop ≥1100px**: layout 2 cols ancho con scoreboard centrado.
- **Tablet 768-1099**: scoreboard centrado, padding más generoso.
- **Mobile <768**: 2 cols 50/50 con flags grandes, inputs +/- de 44px+.
- Botón "Guardar" sticky-bottom en mobile con `env(safe-area-inset-bottom)`.
- `DirtyFormGuard` activo: si cambias el score y navegás fuera sin guardar → confirm dialog.

**A11y**:
- Inputs `aria-label="Goles {{team}}"`.
- Verdict announcement: `role="status" aria-live="polite"`.

**Backend dependencies**:
- `ApiService.getMatch(id)`, `getMyPickForMatch(id)`, `savePick(matchId, homeScore, awayScore, …)`.

**Related docs**: `docs/ux-redesign/03-pick-detail.md`.

---

#### 9. `/picks/group-stage` — PicksTablaGruposComponent

**URL/Access**:
- Route: `/picks/group-stage?view=real|pred`
- Acceso: sidebar "Mundial 2026" (con `view=pred`), link en `/picks`.

**Auth requirement**: autenticado.

**Objetivo**:
Visualizar la tabla de fase de grupos. Toggle entre resultados REALES vs. tu PREDICCIÓN.

**Elementos**:
- Toggle top: "Real" | "Predicción" (segmented control).
- 8 grupos (A-H) con sub-headers + tabla 4 equipos × columnas (PJ, G, E, P, GF, GC, DG, Pts).
- Highlight de top-2 (clasifican) con border-left verde.
- En vista "Predicción": permite reordenar drag-and-drop (desktop) o tap-up-down (mobile) — TODO(A6) backend persist.
- Footer "Avanzas a octavos: top 2 por grupo".

**Componentes usados**:
- `<app-team-flag>`, `<app-icon>`, tabla nativa con `font-variant-numeric: tabular-nums`.

**UX rules**:
- **Desktop ≥1100px**: grid 2 cols (4 grupos por columna).
- **Tablet 768-1099**: grid 2 cols apretada o 1 col según altura.
- **Mobile <768**: 1 col stacked, scroll vertical natural, sticky group header.
- Toggle persiste vía query param para deep-linking.

**A11y**:
- Tabla con `<thead>` `<tbody>`, headers `scope="col"`.
- Toggle segmented con `role="radiogroup"`.
- Reorder con teclado: ↑↓ + Space para confirmar.

**Backend dependencies**:
- `ApiService.getGroupStandings(view)` (real vs. computed-from-picks).

**Related docs**: `docs/ux-redesign/04-picks-group-stage.md`, `06-picks-group-stage-predict.md`.

---

#### 10. `/picks/bracket` — BracketPicksComponent

**URL/Access**:
- Route: `/picks/bracket`
- Acceso: link en `/picks` o sub-tab en Mundial 2026.

**Auth requirement**: autenticado.

**Objetivo**:
Predecir el bracket de eliminatorias (octavos → final).

**Elementos**:
- **Desktop**: grid horizontal con 5 columnas (Octavos · Cuartos · Semifinal · Final · Campeón). Líneas SVG conectoras entre matches.
- **Mobile**: accordion vertical — cada fase es un disclosure expandible.
- Cada slot: 2 equipos (flags + nombres) + selector de ganador.
- Score opcional para predicción exacta (chips +/-).
- Auto-propaga: ganador de un match aparece como participante del siguiente.
- Botón "Guardar bracket" sticky-bottom.

**Componentes usados**:
- `<app-team-flag>`, `<app-icon>`, custom accordion mobile.

**UX rules**:
- **Desktop ≥1100px**: horizontal scroll si la altura no alcanza, idealmente 100% visible.
- **Tablet 768-1099**: grid horizontal compacto o accordion según ancho.
- **Mobile <768**: accordion vertical, una fase expandida a la vez.
- `DirtyFormGuard` activo.

**A11y**:
- Accordion buttons con `aria-expanded`.
- Cada match con label descriptivo del ganador propuesto.

**Backend dependencies**:
- `ApiService.getBracket()`, `saveBracketPick(matchId, winnerCode)`.

**Related docs**: `docs/ux-redesign/05-picks-bracket.md`.

---

#### 11. `/ranking` — RankingComponent

**URL/Access**:
- Route: `/ranking`
- Acceso: sidebar "Ranking", bottom-nav mobile, KPI home click.

**Auth requirement**: autenticado.

**Objetivo**:
Mostrar el leaderboard global + por grupo. Visualizar posición propia y comparación con otros.

**Elementos**:
- Toggle "Global" | "Por grupo (selector)".
- Tu fila siempre highlighted (sticky-top cuando scroll fuera de viewport).
- Tabla: # · avatar/handle · puntos · aciertos % · racha actual · ↑/↓ vs. ronda anterior.
- Top 3 con medal icons (oro/plata/bronce vía `<app-icon>`).
- Filtro/búsqueda por handle.
- Paginación o infinite scroll (TODO definir).

**Componentes usados**:
- `<app-user-avatar size="sm">`, `<app-icon>`, `<app-skeleton variant="list">`.

**UX rules**:
- **Desktop ≥1100px**: tabla full + right-rail con stats personales.
- **Tablet 768-1099**: tabla compacta, sin rail.
- **Mobile <768**: tabla scrollable horizontal (con tu fila sticky), o card por user.
- Tu fila con border-left verde para ubicarte rápido.

**A11y**:
- Tabla semántica con `<th scope="col">`.
- Tu fila con `aria-current="true"`.

**Backend dependencies**:
- `ApiService.getLeaderboard({scope: 'global' | groupId, page})`.

**Related docs**: `docs/ux-redesign/07-ranking.md`.

---

#### 12. `/groups` — GroupsListComponent

**URL/Access**:
- Route: `/groups`
- Acceso: sidebar "Grupos", bottom-nav mobile.

**Auth requirement**: autenticado.

**Objetivo**:
Listar todos los grupos a los que pertenece el usuario. Punto de entrada para crear/unirse.

**Elementos**:
- Header con CTA "Crear grupo" (desktop) + "+" (mobile) → abre `GroupActionsModal`.
- Cards por grupo: avatar/icono · nombre · members count · mode pill (SIMPLE/COMPLETE) · premio total · tu posición `#N`.
- Empty state: `<app-empty-block iconName="users" title="Aún no tienes grupos">` con CTAs "Crear" / "Unirme".
- Loading: `<app-skeleton variant="card" [count]="3">`.

**Componentes usados**:
- `<app-user-avatar>`, `<app-icon>`, `<app-skeleton>`, `<app-empty-block>`.
- Trigger `GroupActionsModalsComponent`.

**UX rules**:
- **Desktop ≥1100px**: grid 2-3 cols + right-rail.
- **Tablet 768-1099**: grid 2 cols.
- **Mobile <768**: 1 col stacked, padding 14px.

**A11y**:
- Cada card es `<a>` con `aria-label="Grupo {{name}}, {{members}} miembros, posición #{{rank}}"`.

**Backend dependencies**:
- `ApiService.getMyGroups()`.

**Related docs**: `docs/ux-redesign/08-groups.md`.

---

#### 13. `/groups/:id` — GroupDetailComponent

**URL/Access**:
- Route: `/groups/:id`
- Acceso: click en `/groups`, deep-link desde notification, post-join redirect.

**Auth requirement**: autenticado.

**Objetivo**:
Hub del grupo. Ver leaderboard interno, miembros, premios, configuración (si admin).

**Elementos**:
- Header: avatar + nombre + mode pill + members count.
- Tabs: "Leaderboard" | "Miembros" | "Premios".
- **Leaderboard tab**: tabla con # · avatar · handle · pts · accuracy · tu fila highlighted.
- **Miembros tab**: lista de miembros con avatar · handle · join date · admin badge si aplica. Si eres admin: botón "Eliminar miembro" + "Transferir admin".
- **Premios tab**: lista de premios por posición (read-only para members; admin link a `/groups/:id/prizes`).
- Admin actions (visibles solo si admin): "Editar grupo" → `/groups/:id/edit`, "Invitar" → `/groups/:id/invite`, "Editar premios" → `/groups/:id/prizes`, "Transferir admin" → modal inline.
- Botón secundario "Salir del grupo" con `confirmDialog` danger.
- Share section: código + link copy + QR.

**Componentes usados**:
- `<app-user-avatar>`, `<app-icon>`, `<app-skeleton>`, `<app-empty-block>` para tabs vacíos, `<app-modal>` para transfer-admin, `confirmDialog`.

**UX rules**:
- **Desktop ≥1100px**: header + tabs + content + right-rail con admin actions condensadas.
- **Tablet 768-1099**: header + tabs + content, sin rail.
- **Mobile <768**: tabs como segmented control sticky-top, content scrollable, admin actions en botón "Configurar" → sheet.

**A11y**:
- Tabs con `role="tablist"` + `aria-selected`.
- Confirm dialogs antes de eliminar/salir.

**Backend dependencies**:
- `ApiService.getGroup(id)`, `getGroupLeaderboard(id)`, `getGroupMembers(id)`, `removeMember(id, sub)`, `transferAdmin(id, newAdminSub)`, `leaveGroup(id)`.

**Related docs**: `docs/ux-redesign/09-group-detail.md`.

---

#### 14. `/groups/:id/edit` — GroupEditComponent

**URL/Access**:
- Route: `/groups/:id/edit`
- Acceso: link "Editar grupo" desde `/groups/:id` (solo admin).

**Auth requirement**: autenticado + admin del grupo.

**Objetivo**:
Modificar metadata del grupo: nombre, descripción, privacy, mode (SIMPLE/COMPLETE).

**Elementos**:
- Header con back arrow + título "Editar grupo".
- Form:
  - Input nombre (max 40).
  - Textarea descripción (max 200).
  - Toggle "Grupo privado" (solo se entra con código).
  - Radio mode "Simple (solo aciertos)" vs. "Completo (con comodines y especiales)".
- Cambiar mode tras inicio del torneo: warning irreversible con `confirmDialog`.
- Botones footer: "Cancelar" · "Guardar cambios".

**Componentes usados**:
- `<app-icon>`, `confirmDialog`.

**UX rules**:
- **Desktop/Tablet**: form centrado max-width 640px.
- **Mobile <768**: full-width padding 14px, botones sticky-bottom.
- `canDeactivate: [dirtyFormGuard]` — confirm si hay cambios sin guardar.
- `prefers-reduced-motion`: sin slide-in.

**A11y**:
- Inputs con `<label>` asociados.
- Warning role="alert" cuando se cambia mode mid-tournament.

**Backend dependencies**:
- `ApiService.updateGroup(id, payload)`.

**Related docs**: `docs/ux-redesign/10-group-edit.md`.

---

#### 15. `/groups/:id/prizes` — GroupPrizesEditComponent

**URL/Access**:
- Route: `/groups/:id/prizes`
- Acceso: link "Editar premios" desde `/groups/:id` (admin) o `/groups/:id/edit`.

**Auth requirement**: autenticado + admin del grupo.

**Objetivo**:
Definir premios por posición (1°, 2°, 3°, …) en el grupo.

**Elementos**:
- Lista editable de premios: posición # + input amount + input descripción opcional.
- Botón "+ Añadir premio".
- Total computado automáticamente footer.
- Botones "Cancelar" / "Guardar".

**Componentes usados**:
- `<app-icon>`, inputs nativos con `inputmode="numeric"`.

**UX rules**:
- **Desktop/Tablet**: lista vertical con cada premio como row.
- **Mobile <768**: lista compacta, +/- buttons 44px.
- `canDeactivate: [dirtyFormGuard]` activo.

**A11y**:
- Cada row con label "Premio para posición {{N}}".
- Botón delete por row con `aria-label="Eliminar premio posición N"`.

**Backend dependencies**:
- `ApiService.updateGroupPrizes(id, prizes[])`.

**Related docs**: `docs/ux-redesign/11-group-prizes.md`.

---

#### 16. `/groups/:id/invite` — GroupInviteEmailComponent

**URL/Access**:
- Route: `/groups/:id/invite`
- Acceso: link "Invitar" desde `/groups/:id` (admin).

**Auth requirement**: autenticado + admin del grupo.

**Objetivo**:
Invitar miembros vía email. Genera link con código que abre `/groups/join/:code`.

**Elementos**:
- Sección "Compartir código": código grande copiable + botón "Copiar link" + botón "Compartir vía…" (Web Share API si disponible) + QR code visual.
- Sección "Invitar por email": textarea para múltiples emails separados por coma/newline + textarea mensaje opcional + botón "Enviar invitaciones".
- Histórico de invitaciones enviadas (lista compacta).
- Empty state si no hay histórico.

**Componentes usados**:
- `<app-icon>`, `<app-skeleton>` para histórico loading, `<app-empty-block>`.

**UX rules**:
- **Desktop/Tablet**: 2 secciones lado a lado o stacked.
- **Mobile <768**: stacked, código en card prominente con tap-to-copy.
- `canDeactivate: [dirtyFormGuard]` para textarea con cambios.

**A11y**:
- Botón "Copiar" anuncia "Copiado" con `aria-live="polite"`.
- Textarea con label.

**Backend dependencies**:
- `ApiService.inviteByEmail(groupId, emails[], message?)`.
- `ApiService.listInvitations(groupId)`.

**Related docs**: `docs/ux-redesign/12-group-invite.md`.

---

#### 17. `/comodines` (`/mis-comodines`) — ComodinesListComponent

**URL/Access**:
- Routes: `/mis-comodines` (canónica), `/comodines` (alias). Misma implementación.
- Acceso: sidebar More-sheet mobile, link desde home, link desde profile.

**Auth requirement**: autenticado.

**Objetivo**:
Listar comodines disponibles, usados, vencidos. Permitir canjear código de sponsor.

**Elementos**:
- Header con CTA "Canjear código" → abre `RedeemModalComponent`.
- Stats top: "X/Y disponibles · Z usados".
- Tabs: "Disponibles" | "Usados" | "Vencidos".
- Lista de comodines: icon + nombre + descripción + estado (Activo/Usado en…) + fecha límite.
- Empty state por tab.

**Componentes usados**:
- `<app-icon>`, `<app-skeleton>`, `<app-empty-block>`.
- Trigger `RedeemModalComponent`.

**UX rules**:
- **Desktop ≥1100px**: grid 2 cols + rail.
- **Tablet 768-1099**: grid 2 cols.
- **Mobile <768**: 1 col, tabs sticky-top.

**A11y**:
- Tabs `role="tablist"`.
- Cada comodín card con label completo.

**Backend dependencies**:
- `ApiService.listMyComodines()`, `redeemSponsorCode(code)`.

**Related docs**: `docs/ux-redesign/13-comodines.md`.

---

#### 18. `/profile` — ProfileComponent

**URL/Access**:
- Route: `/profile`
- Acceso: sidebar user menu, More-sheet mobile, link "Mi perfil".

**Auth requirement**: autenticado.

**Objetivo**:
Resumen del perfil del usuario + acceso a editar + preferencias + estadísticas personales.

**Elementos**:
- Header: avatar grande + handle + nombre + país (flag) + bio.
- Botón "Editar perfil" → abre `EditProfileModalComponent`.
- Stats card: total picks · accuracy · puntos · mejor posición · grupos activos.
- Link "Picks especiales" → `/profile/special-picks`.
- Link "Mis comodines" → `/mis-comodines`.
- Botón "Preferencias" → abre `PreferencesModal`.
- Botón "Cerrar sesión" con `confirmDialog` danger.

**Componentes usados**:
- `<app-user-avatar size="xl">`, `<app-team-flag>`, `<app-icon>`, `confirmDialog`.
- Trigger `EditProfileModal`, `PreferencesModal`.

**UX rules**:
- **Desktop ≥1100px**: 2 cols (info + stats) + rail.
- **Tablet 768-1099**: stacked.
- **Mobile <768**: stacked, padding 14px.

**A11y**:
- Botones con labels claros.
- Confirm dialog antes de logout.

**Backend dependencies**:
- `AuthService.user` reactivo.
- `ApiService.getMyStats()`.

**Related docs**: `docs/ux-redesign/14-profile.md`.

---

#### 19. `/profile/special-picks` — SpecialPicksComponent

**URL/Access**:
- Route: `/profile/special-picks`
- Acceso: link desde `/profile`, link desde home, onboarding step 2.

**Auth requirement**: autenticado.

**Objetivo**:
Predecir Campeón, Subcampeón y Caballo negro (Dark Horse) del torneo. Deadline: kickoff del primer partido.

**Elementos**:
- Header: "Picks especiales" + countdown a deadline.
- 3 sub-secciones (Campeón / Subcampeón / Caballo negro):
  - Picker: lista scrollable de 32 selecciones con flag + nombre.
  - Cuando hay pick activo: `<app-team-flag>` + nombre + "Cambiar".
- Footer info: "Hasta 65 pts" + breakdown del scoring.
- Botón "Guardar" sticky-bottom.

**Componentes usados**:
- `<app-team-flag>`, `<app-icon>`, picker custom o `<app-modal>` para selección.

**UX rules**:
- **Desktop/Tablet**: 3 cards en row.
- **Mobile <768**: 3 cards stacked.
- Después del deadline: read-only mode con badge "Locked".
- `DirtyFormGuard` activo (si user cambió pero no guardó).

**A11y**:
- Picker con `role="listbox"`, items `role="option"`.

**Backend dependencies**:
- `ApiService.listSpecialPicks()`, `saveSpecialPick(type, teamCode)`.

**Related docs**: `docs/ux-redesign/15-special-picks.md`.

---

#### 20. `/notificaciones` — NotificationsListComponent

**URL/Access**:
- Route: `/notificaciones`
- Acceso: bell icon sidebar, More-sheet mobile, user menu link.

**Auth requirement**: autenticado.

**Objetivo**:
Histórico de notificaciones del usuario. Permite marcar como leídas y navegar a la fuente.

**Elementos**:
- Header con botón "Marcar todas como leídas".
- Tabs: "Todas" | "No leídas".
- Lista de notificaciones:
  - Icono por tipo (pick · group · trivia · system · sponsor).
  - Título + sub + timestamp relativo ("hace 3h").
  - Unread: border-left verde + fondo ligeramente coloreado.
  - Click → marca como leída + navega a deep-link asociado.
- Empty state: `<app-empty-block>` con icon bell + "No tienes notificaciones".
- Loading: `<app-skeleton variant="list">`.

**Componentes usados**:
- `<app-icon>`, `<app-skeleton>`, `<app-empty-block>`.

**UX rules**:
- **Desktop ≥1100px**: lista + rail (rail con quick toggles preferences).
- **Tablet 768-1099**: lista sola.
- **Mobile <768**: full-width, padding 14px.
- Bell badge en sidebar se actualiza reactivo (subscription a `observeMyNotifications`).

**A11y**:
- Cada item es `<a>` o `<button>` con label completo.
- Badge unread `aria-label="Sin leer"`.

**Backend dependencies**:
- `ApiService.observeMyNotifications(userId)` (subscription).
- `ApiService.markNotificationRead(id)`, `markAllRead()`.

**Related docs**: `docs/ux-redesign/16-notifications.md`.

---

#### 21. `/mis-comodines` — alias de `/comodines`

Idéntico a #17 (ComodinesListComponent). Ambas rutas resuelven al mismo componente. La canónica para links internos es `/mis-comodines`; `/comodines` se mantiene por compatibilidad histórica de links externos.

---

### 6.3 Global modals (8 superficies)

Todos vivien montados en el `ShellComponent` (no en rutas), accionados por servicios.

#### 22. Group Actions Modals — GroupActionsModalsComponent

**URL/Access**:
- Sin route — modal global montado en `ShellComponent`.
- Trigger: botón "+" sidebar mobile, CTAs "Crear grupo" / "Unirme con código" desde `/groups`, `/home`, `/onboarding`.
- Servicio: `GroupActionsService.openCreate()` / `.openJoin()`.

**Auth requirement**: autenticado.

**Objetivo**:
Punto único para acciones de creación/incorporación a grupos sin navegar a otra ruta.

**Elementos**:
- **Modo "Crear grupo"** (size="md"):
  - Step 1: nombre + descripción opcional + privacy (privado/público).
  - Step 2: mode (SIMPLE/COMPLETE) + warning sobre cambio post-torneo.
  - Step 3: success "Grupo creado · código: ABCDE" + CTA "Ir al grupo" → `/groups/:id`.
- **Modo "Unirme con código"** (size="sm"):
  - Input código (auto-uppercase, max 8 chars).
  - Botón "Buscar grupo".
  - Preview del grupo encontrado + CTA "Unirme" → `/groups/:id`.
  - Error inline si código inválido.

**Componentes usados**:
- `<app-modal>`, `<app-icon>`, `<app-team-flag>`.

**UX rules**:
- Backdrop click + Esc cierran.
- Transición fade 200ms (`prefers-reduced-motion` → instant).
- `cdkTrapFocus` mantiene foco dentro.

**A11y**:
- `role="dialog"`, `aria-labelledby`, `aria-describedby`.
- Auto-focus en primer input.

**Backend dependencies**:
- `ApiService.createGroup(payload)`, `previewGroupByCode(code)`, `joinGroup(code)`.

**Related docs**: `docs/ux-redesign/22-group-actions-modals.md`.

---

#### 23. Trivia Popup — TriviaPopupComponent

**URL/Access**:
- Sin route — modal global montado en `ShellComponent`.
- Trigger: click sobre `TriviaToastComponent` (banner top) o pill FAB sponsored.
- Servicio: `TriviaService.open(triviaId)` (auto-open cuando subscription detecta LIVE).

**Auth requirement**: autenticado.

**Objetivo**:
Permitir al usuario responder triviales durante un partido LIVE. Variante sponsored con pill destacado.

**Elementos**:
- Header: pill "TRIVIA LIVE · {{ matchLabel }}" + countdown.
- Pregunta + 4 opciones (botones).
- Submit → feedback inmediato:
  - Correcta: ✓ verde + "+N puntos" + breakdown.
  - Incorrecta: ✗ rojo + opción correcta resaltada.
- Variante sponsored: logo sponsor + pill "PATROCINADO POR…" + recompensa especial.
- Footer: "Cerrar" + opcional "Ver más triviales".

**Componentes usados**:
- `<app-modal size="md">`, `<app-icon>`.

**UX rules**:
- **Desktop**: modal centrado, max-width 480px.
- **Mobile <768**: modal full-width con padding 20px.
- Auto-cierra después del feedback (4s) o click en "Cerrar".
- Si match termina mientras trivia abierta → mostrar "Trivia cerrada" + cerrar.

**A11y**:
- Opciones como `<button>` con `role="radio"` dentro de `role="radiogroup"`.
- Feedback con `role="status" aria-live="polite"`.

**Backend dependencies**:
- `ApiService.getActiveTrivia()`, `submitTriviaAnswer(triviaId, choice)`.

**Related docs**: `docs/ux-redesign/23-trivia-popup.md`.

---

#### 24. Randomizer Modal — RandomizerModalComponent

**URL/Access**:
- Sin route — modal montado on-demand.
- Trigger: botón "Generar aleatorio" en `/picks/match/:id` o batch desde `/picks`.

**Auth requirement**: autenticado.

**Objetivo**:
Generar picks aleatorios para uno o varios partidos (útil para usuarios que no quieren analizar cada match).

**Elementos**:
- Header "Generador aleatorio".
- Toggle "Solo este partido" | "Todos los pendientes".
- Sliders/inputs: rango de goles (0-5), probabilidad de empate, peso a favoritos.
- Preview de N picks generados (lista compacta scrolleable).
- Botones "Regenerar" + "Aplicar" (primary).

**Componentes usados**:
- `<app-modal size="md">`, `<app-team-flag>`, `<app-icon>`.

**UX rules**:
- **Desktop/Tablet/Mobile**: modal centrado, max-width 480px.
- Backdrop click confirma cancel (con `confirmDialog` si ya hay preview generado).

**A11y**:
- Sliders con `aria-valuemin`/`max`/`now`.
- Preview list con `aria-label` resumen.

**Backend dependencies**:
- Local-only para generar; `ApiService.savePick()` x N al aplicar.

**Related docs**: `docs/ux-redesign/24-randomizer-modal.md`.

---

#### 25. Redeem Modal — RedeemModalComponent

**URL/Access**:
- Sin route — modal global montado en `ShellComponent`.
- Trigger: botón "Canjear código" desde `/comodines` o `/mis-comodines`.
- Servicio: `RedeemService.open()`.

**Auth requirement**: autenticado.

**Objetivo**:
Canjear códigos de sponsor para obtener comodines bonus.

**Elementos**:
- Header "Canjear código de sponsor".
- Input código (auto-uppercase + spaces stripped).
- Botón "Canjear".
- Feedback:
  - Éxito: ✓ "Recibiste {{ comodín.name }}" + breakdown.
  - Error: ✗ "Código inválido o expirado".
- Sección informativa "¿Cómo conseguir códigos?" (links a sponsors).

**Componentes usados**:
- `<app-modal size="sm">`, `<app-icon>`.

**UX rules**:
- Mismo patrón modal estándar.
- Refresh de la lista de comodines al éxito (signal trigger).

**A11y**:
- Input con label.
- Feedback con `role="alert"`.

**Backend dependencies**:
- `ApiService.redeemSponsorCode(code)`.

**Related docs**: `docs/ux-redesign/25-redeem-modal.md`.

---

#### 26. Edit Profile Modal — EditProfileModalComponent

**URL/Access**:
- Sin route — modal accionado desde `/profile`, `/onboarding` step 1.
- Servicio: `EditProfileService.open()`.

**Auth requirement**: autenticado.

**Objetivo**:
Editar datos del perfil sin navegar fuera de la página actual.

**Elementos**:
- Header "Editar perfil" + tabs internas (sections):
  1. **Foto**: avatar actual + upload (drag/drop o file picker) → preview + crop → guardar a S3.
  2. **Handle**: input + validación de uniqueness en blur.
  3. **País**: select con flags (search by name).
  4. **Bio**: textarea max 200 chars.
  5. **Password**: current + new + confirm + `<app-password-rules-list>`.
- Cada section con su botón "Guardar" independiente.
- Footer modal: "Cerrar".

**Componentes usados**:
- `<app-modal size="lg">`, `<app-user-avatar>`, `<app-team-flag>`, `<app-icon>`, `<app-password-rules-list>`.

**UX rules**:
- **Desktop**: tabs lateral izquierda + content derecha.
- **Mobile <768**: tabs como tabs horizontales scrollables o acordeón.
- Cada section dirty se trackea independiente — confirm si cierra modal con cambios.

**A11y**:
- Tabs con `role="tablist"`.
- Upload con label "Subir nueva foto".

**Backend dependencies**:
- `AuthService.updateProfile(payload)`, `uploadAvatar(file)`, `changePassword(curr, new)`.

**Related docs**: `docs/ux-redesign/26-edit-profile-modal.md`.

---

#### 27. Preferences Modal — PreferencesModalComponent

**URL/Access**:
- Sin route — accionado desde `/profile` → botón "Preferencias".
- Servicio: `PreferencesService.open()`.

**Auth requirement**: autenticado.

**Objetivo**:
Configurar preferencias del usuario sin navegar.

**Elementos**:
- 4 toggles principales:
  1. **Notificaciones push** (on/off).
  2. **Email semanal de resumen** (on/off).
  3. **Modo oscuro** (auto/light/dark) — TODO(A6) si no implementado.
  4. **Switch role** (admin only): toggle entre vista admin y user-normal.
- Botón "Cerrar" / "Guardar".

**Componentes usados**:
- `<app-modal size="sm">`, `<app-icon>`, toggles custom o nativo.

**UX rules**:
- Cambios guardan optimistic con rollback en error.
- Confirm si el user cambia switch role mid-sesión.

**A11y**:
- Toggles con `role="switch"` + `aria-checked`.

**Backend dependencies**:
- `ApiService.updatePreferences(payload)`.

**Related docs**: `docs/ux-redesign/27-preferences-modal.md`.

---

#### 28. Transfer Admin Modal — inline en GroupDetail

**URL/Access**:
- Sin route — modal inline en `GroupDetailComponent`.
- Trigger: botón "Transferir admin" en tab Miembros (visible solo si current user es admin).

**Auth requirement**: autenticado + admin del grupo.

**Objetivo**:
Transferir el rol de admin a otro miembro. Acción irreversible.

**Elementos**:
- Lista searchable de miembros (excluye al admin actual).
- Selección de nuevo admin → preview "Vas a transferir admin a @handle".
- Warning danger: "Esta acción no se puede deshacer. Perderás permisos de configuración."
- Botones "Cancelar" / "Transferir admin" (danger).

**Componentes usados**:
- `<app-modal size="md">`, `<app-user-avatar>`, `<app-icon>`.
- `confirmDialog` final antes de ejecutar.

**UX rules**:
- Double-confirm (modal + confirmDialog).
- Cierre del modal post-success + refresh del grupo.

**A11y**:
- Lista miembros con `role="listbox"`.
- Warning con `role="alert"`.

**Backend dependencies**:
- `ApiService.transferAdmin(groupId, newAdminSub)`.

**Related docs**: `docs/ux-redesign/28-transfer-admin-modal.md`.

---

#### 29. Tour Overlay — TourOverlayComponent

**URL/Access**:
- Sin route — overlay global montado on-demand.
- Trigger: post-onboarding (primera vez), o desde `/profile` → "Ver tour".
- Servicio: `TourService.start()`.

**Auth requirement**: autenticado.

**Objetivo**:
Onboarding visual de 3 pasos resaltando las áreas core de la app.

**Elementos**:
- 3 pasos secuenciales con spotlight sobre elementos `[data-tour]`:
  1. **Picks** → highlight `[data-tour="picks"]` en sidebar + tooltip "Aquí haces tus picks de cada partido".
  2. **Grupos** → highlight `[data-tour="groups"]` + "Compite contra tus panas en grupos privados".
  3. **Mundial 2026** → highlight `[data-tour="mundial"]` + "Sigue la tabla y predice el bracket".
- Tooltip con texto + botones "Atrás" · "Siguiente" · "Saltar".
- Backdrop semi-transparente (no full-opaque) para mantener contexto.
- Persiste "tour_completed" en localStorage para no repetir.

**Componentes usados**:
- Markup custom + `<app-icon>`.

**UX rules**:
- z-index `--z-overlay: 100`.
- Spotlight calcula `getBoundingClientRect()` del target + transition al moverse entre pasos.
- `prefers-reduced-motion`: sin animación, jumps directos.
- Mobile: posiciona tooltip arriba/abajo del target según viewport.

**A11y**:
- `role="dialog"`, focus-trap.
- Escape cierra (interpreta como "Saltar").
- Cada paso anuncia su contenido con `aria-live="polite"`.

**Backend dependencies**: ninguna (estado localStorage).

**Related docs**: `docs/ux-redesign/29-tour-overlay.md`.

---

### 6.4 Shell + layout (7 superficies)

#### 30. Sidebar — SidebarComponent

**URL/Access**:
- Renderizado siempre por `ShellComponent` en cualquier ruta autenticada.

**Auth requirement**: autenticado.

**Objetivo**:
Navegación primaria. Desktop: vertical fija a la izquierda. Mobile: bottom-nav horizontal.

**Elementos**:
- **Desktop (≥768px)**:
  - Sticky left, width `64px` collapsed → `200px` on hover (transición 200ms).
  - Logo Golgana arriba + sub-title "Polla Mundialista 2026" (visible only on hover).
  - Items principales: Inicio · Mis picks (`data-tour="picks"`) · Grupos (`data-tour="groups"`) · Ranking · Mundial 2026 (`data-tour="mundial"`) + Admin (if `isAdmin`).
  - Bottom area: Notificaciones (bell con unread badge) + user button con avatar + handle.
  - User button → popover lateral con: Notificaciones · Mi perfil · Cerrar sesión.
- **Mobile (<768px)**:
  - Bottom-nav horizontal 60px height + safe-area-inset-bottom.
  - 5 items: Inicio · Picks · Grupos · Ranking · **Más** (button).
  - "Más" abre `<app-more-sheet>` con: Mundial 2026 · Comodines · Notificaciones (+badge) · Perfil · Admin (if admin).
  - Bell desktop se traslada al topbar mobile (`<app-nav>`).

**Componentes usados**:
- `<app-icon>`, `<app-more-sheet>`, `<app-user-avatar>`, `confirmDialog` (logout).

**UX rules**:
- Hover desktop muta `--sidebar-w` a nivel `:root` → shell + trivia-toast reaccionan reactivos.
- Outline focus-visible vía `box-shadow inset 2px verde` (no `outline`, porque overflow:hidden lo recorta).
- Logout abre `confirmDialog` danger antes de ejecutar.
- `prefers-reduced-motion`: transición width instant.
- Safe-area-inset-bottom en bottom-nav mobile (notch + home indicator).

**A11y**:
- `<aside aria-label="Navegación principal">`.
- Cada link con `<span class="lsb__t">` para label (visible on hover desktop / siempre en mobile).
- Bell badge con `aria-label="N notificaciones sin leer"`.
- User menu con `aria-haspopup="menu"` + `aria-expanded`.

**Backend dependencies**:
- `ApiService.observeMyNotifications(userId)` (subscription para unread count badge).

**Related docs**: `docs/ux-redesign/30-sidebar.md`. Implementación: `src/app/shared/layout/sidebar.component.ts`.

---

#### 31. Shell + Nav (mobile topbar) — ShellComponent + NavComponent

**URL/Access**:
- Renderizado en toda ruta dentro del shell autenticado.

**Auth requirement**: autenticado.

**Objetivo**:
Layout wrapper de la app. Mantiene sidebar + topbar + content + right-rail + footer + modales globales.

**Elementos**:
- `ShellComponent` (`src/app/shared/layout/shell.component.ts`):
  - `<app-nav>` topbar.
  - `<app-sidebar>`.
  - `<app-trivia-toast>` banner condicional.
  - `.shell` grid: `<main>` + `<app-right-rail>`.
  - `<app-footer>`.
  - Modales globales montados al final: `<app-toast-host>`, `<app-trivia-popup>`, `<app-group-actions-modals>`, `<app-redeem-modal>`.
- `<app-nav>` (topbar):
  - **Desktop**: header secundario (el sidebar cubre primary nav).
  - **Mobile <768**: muestra bell + avatar + opcionalmente botón burger.

**Componentes usados**:
- `<app-nav>`, `<app-sidebar>`, `<app-trivia-toast>`, `<app-right-rail>`, `<app-footer>`, `<app-toast-host>`, `<app-trivia-popup>`, `<app-group-actions-modals>`, `<app-redeem-modal>`.

**UX rules**:
- Grid `.shell`:
  - Desktop ≥1100: `grid-template-columns: 1fr 320px;` (main + rail), gap 24px, padding 24px, max-width 1480px.
  - Tablet 768-1099: `grid-template-columns: 1fr;` (sin rail).
  - Mobile <768: `margin-left: 0`, padding 14px, `padding-bottom: 74px` (clearance bottom-nav).
- `margin-left: var(--sidebar-w)` con transition 200ms.
- `min-height: 100dvh` para evitar height issues en viewports dinámicos.

**A11y**:
- `<main>` landmark.
- Topbar con `role="banner"`.

**Related docs**: `docs/ux-redesign/31-shell-nav.md`. Implementación: `src/app/shared/layout/shell.component.ts`, `nav.component.ts`.

---

#### 32. Right-rail — RightRailComponent

**URL/Access**:
- Renderizado en `ShellComponent` solo desktop ≥1100px (`grid-template-columns: 1fr 320px`).

**Auth requirement**: autenticado.

**Objetivo**:
Sidebar derecha contextual con widgets persistentes que enriquecen las pages principales sin saturarlas.

**Elementos**:
- Widget "Next match": countdown · equipos · tu pick (si existe) · CTA "Ver picks".
- Widget "Trivia activa" (si hay) con CTA "Responder ahora".
- Widget "Group activity" (light): últimos picks/eventos de tus grupos.
- Widget "Top 3 ranking" global mini.

**Componentes usados**:
- `<app-team-flag>`, `<app-icon>`, `<app-user-avatar>`, `<app-skeleton>`.

**UX rules**:
- Ancho fijo 320px.
- Sticky-top o scroll natural según altura del content.
- Solo desktop ≥1100px — completamente oculto en tablet/mobile.

**A11y**:
- `<aside aria-label="Información lateral">`.

**Backend dependencies**:
- Varios endpoints agregados; reusa data del home cuando posible.

**Related docs**: `docs/ux-redesign/32-right-rail.md`.

---

#### 33. Trivia Toast — TriviaToastComponent

**URL/Access**:
- Renderizado en `ShellComponent`, visible cuando hay trivia LIVE.

**Auth requirement**: autenticado.

**Objetivo**:
Banner sticky-top que avisa de trivia activa y abre el popup al click.

**Elementos**:
- Banner negro full-width arriba del shell content.
- Texto "TRIVIA LIVE · {{ matchLabel }}" + countdown + botón "Responder".
- Dismiss button (×) — vuelve a aparecer en próximo refresh si trivia sigue LIVE.

**Componentes usados**:
- `<app-icon>`.
- Trigger `TriviaPopupComponent`.

**UX rules**:
- z-index `--z-sticky: 10`.
- Animation slide-down 200ms al aparecer (respeta reduced-motion).
- En desktop: respeta `margin-left: var(--sidebar-w)`.
- En mobile: full-width sin sidebar offset.

**A11y**:
- `role="status" aria-live="polite"`.

**Backend dependencies**:
- Subscription a trivia LIVE state.

**Related docs**: `docs/ux-redesign/33-trivia-toast.md`.

---

#### 34. Confirm Dialog — programático via ConfirmDialogService

**URL/Access**:
- Sin route — programático.
- Trigger: `await this.confirmDialog.ask({...})` desde cualquier componente.

**Auth requirement**: cualquiera (puede usarse en flujos pre-auth).

**Objetivo**:
Confirm sincrónico estándar para acciones destructivas o irreversibles.

**Elementos**:
- Modal small con: título + mensaje + 2 botones (cancel / confirm).
- `danger: true` estiliza confirm en rojo.

**Componentes usados**:
- `<app-modal size="sm">` interno.

**UX rules**:
- Backdrop click = cancel.
- Esc = cancel.
- Auto-focus en botón confirm (o cancel si danger=true, para evitar acciones accidentales).
- `prefers-reduced-motion`: instant.

**A11y**:
- `role="alertdialog"` + `aria-labelledby` + `aria-describedby`.

**Backend dependencies**: ninguna.

**Related docs**: `docs/ux-redesign/34-confirm-dialog.md`.

---

#### 35. Picks-pending Banner — PicksPendingBannerComponent

**URL/Access**:
- Renderizado contextualmente en `/picks` y `/home`.

**Auth requirement**: autenticado.

**Objetivo**:
Avisar de picks pendientes urgentes (kickoff en <12h) con un CTA directo a `/picks`.

**Elementos**:
- Banner verde/naranja según urgencia.
- Texto "Tienes N picks pendientes · próximo kickoff en Xh".
- CTA "Hacer picks →".
- Dismiss × — persiste dismiss por 24h en localStorage (vuelve a aparecer mañana).

**Componentes usados**:
- `<app-icon>`.

**UX rules**:
- Solo se muestra si `pendingMatches(tournament, 12).count > 0`.
- Animation fade-in 200ms (respeta reduced-motion).
- Mobile: padding 14px, dismiss × hit-target 44px.

**A11y**:
- `role="status" aria-live="polite"`.
- Dismiss button con `aria-label="Ocultar aviso hasta mañana"`.

**Backend dependencies**:
- `ApiService.pendingMatches(tournamentId, hoursAhead)`.

**Related docs**: `docs/ux-redesign/35-picks-pending-banner.md`.

---

#### 36. Footer — FooterComponent

**URL/Access**:
- Renderizado en `ShellComponent` al final de la página.

**Auth requirement**: autenticado.

**Objetivo**:
Footer minimal con copyright + links legales + version.

**Elementos**:
- © 2026 Polla Mundialista by Golgana.
- Links: Términos · Privacidad · Soporte.
- Version label (desde build).
- (Auth-shell version): footer minimal sin shell — solo © en brand panel.

**Componentes usados**:
- Markup simple + `<app-icon>` opcional para social.

**UX rules**:
- **Desktop ≥1100**: row con copy izquierda + links derecha.
- **Tablet 768-1099**: stacked centered.
- **Mobile <768**: stacked centered, padding-bottom respeta `env(safe-area-inset-bottom)` (cuando no hay bottom-nav visible — improbable, pero defensive).
- No fixed/sticky — fluye natural al final del scroll.

**A11y**:
- `<footer>` landmark.
- Links con texto descriptivo (no "Click aquí").

**Backend dependencies**: ninguna.

**Related docs**: `docs/ux-redesign/36-footer-auth-shell.md`.

---

## Apéndice A — Mapa rápido superficie → ruta/trigger

| # | Superficie | Acceso |
|---|---|---|
| 1 | LoginComponent | `/login` |
| 2 | RegisterComponent | `/register` |
| 3 | ForgotPasswordComponent | `/forgot-password` |
| 4 | GroupJoinComponent | `/groups/join/:code` |
| 5 | OnboardingComponent | `/onboarding` |
| 6 | HomeComponent | `/home` |
| 7 | PicksListComponent | `/picks` |
| 8 | PickDetailComponent | `/picks/match/:id` |
| 9 | PicksTablaGruposComponent | `/picks/group-stage?view=real|pred` |
| 10 | BracketPicksComponent | `/picks/bracket` |
| 11 | RankingComponent | `/ranking` |
| 12 | GroupsListComponent | `/groups` |
| 13 | GroupDetailComponent | `/groups/:id` |
| 14 | GroupEditComponent | `/groups/:id/edit` |
| 15 | GroupPrizesEditComponent | `/groups/:id/prizes` |
| 16 | GroupInviteEmailComponent | `/groups/:id/invite` |
| 17 | ComodinesListComponent | `/comodines` (`/mis-comodines`) |
| 18 | ProfileComponent | `/profile` |
| 19 | SpecialPicksComponent | `/profile/special-picks` |
| 20 | NotificationsListComponent | `/notificaciones` |
| 21 | ComodinesListComponent (alias) | `/mis-comodines` |
| 22 | GroupActionsModalsComponent | `GroupActionsService.openCreate/openJoin()` |
| 23 | TriviaPopupComponent | trivia LIVE / `TriviaService.open()` |
| 24 | RandomizerModalComponent | btn en `/picks/match/:id` |
| 25 | RedeemModalComponent | btn "Canjear" en `/comodines` |
| 26 | EditProfileModalComponent | btn "Editar perfil" en `/profile` |
| 27 | PreferencesModalComponent | btn "Preferencias" en `/profile` |
| 28 | Transfer admin modal | tab Miembros en `/groups/:id` (admin) |
| 29 | TourOverlayComponent | `TourService.start()` post-onboarding |
| 30 | SidebarComponent | shell global |
| 31 | ShellComponent + NavComponent | shell global |
| 32 | RightRailComponent | shell ≥1100px |
| 33 | TriviaToastComponent | shell condicional |
| 34 | ConfirmDialog | `confirmDialog.ask()` programático |
| 35 | PicksPendingBannerComponent | contextual en `/home`, `/picks` |
| 36 | FooterComponent | shell final |

---

## Apéndice B — Convenciones de código

- **Standalone components**: NO usar `NgModule`. Todo standalone con `imports[]` propio.
- **Signals**: preferir `signal()`/`computed()` sobre RxJS para state local. RxJS solo donde Amplify lo requiere (subscriptions).
- **`inject()`**: usar para DI en lugar de constructor parameters.
- **`@for` / `@if`**: control-flow nuevo de Angular 18 — preferir sobre `*ngFor`/`*ngIf`.
- **Templates inline**: aceptables para componentes pequeños; archivos `.html` separados para >150 líneas.
- **Estilos scoped**: `styles: ['...']` en el component. Para tokens globales usar `tokens.css`.
- **No `ngModel`**: usar `[value]` + `(input)` con signals.
- **No `any`**: TypeScript strict — usar `unknown` + type guards si necesario.

---

## Apéndice C — Backend dependencies (ApiService methods)

> Los métodos llamados en cada surface están listados en las secciones individuales.
> Items marcados **TODO(A6)** indican backend pendiente — el frontend tiene fallback local o stub.

Endpoints clave (resumen):

- **Auth (Cognito)**: `signIn`, `signUp`, `confirmSignUp`, `resendConfirmation`, `signOut`, `resetPassword`, `confirmResetPassword`.
- **Profile**: `getMyProfile`, `updateProfile`, `uploadAvatar`, `changePassword`, `updatePreferences`.
- **Tournaments / Matches**: `listMatches`, `getMatch`, `pendingMatches`, `getGroupStandings`, `getBracket`.
- **Picks**: `getMyPicks`, `savePick`, `saveBracketPick`, `listSpecialPicks`, `saveSpecialPick`.
- **Groups**: `getMyGroups`, `createGroup`, `getGroup`, `updateGroup`, `updateGroupPrizes`, `previewGroupByCode`, `joinGroup`, `leaveGroup`, `getGroupLeaderboard`, `getGroupMembers`, `removeMember`, `transferAdmin`, `inviteByEmail`, `listInvitations`.
- **Ranking**: `getLeaderboard`, `getMyTotals`, `getMyStats`.
- **Comodines**: `listMyComodines`, `redeemSponsorCode`.
- **Trivia**: `getActiveTrivia`, `submitTriviaAnswer`.
- **Notifications**: `observeMyNotifications` (subscription), `markNotificationRead`, `markAllRead`.

---

## Apéndice D — Reference de docs UX-redesign

| Surface | Doc path |
|---|---|
| Home | `docs/ux-redesign/01-home.md` |
| Picks list | `docs/ux-redesign/02-picks.md` |
| Pick detail | `docs/ux-redesign/03-pick-detail.md` |
| Picks group stage | `docs/ux-redesign/04-picks-group-stage.md` |
| Picks bracket | `docs/ux-redesign/05-picks-bracket.md` |
| Picks group stage (predict view) | `docs/ux-redesign/06-picks-group-stage-predict.md` |
| Ranking | `docs/ux-redesign/07-ranking.md` |
| Groups list | `docs/ux-redesign/08-groups.md` |
| Group detail | `docs/ux-redesign/09-group-detail.md` |
| Group edit | `docs/ux-redesign/10-group-edit.md` |
| Group prizes | `docs/ux-redesign/11-group-prizes.md` |
| Group invite | `docs/ux-redesign/12-group-invite.md` |
| Comodines | `docs/ux-redesign/13-comodines.md` |
| Profile | `docs/ux-redesign/14-profile.md` |
| Special picks | `docs/ux-redesign/15-special-picks.md` |
| Notifications | `docs/ux-redesign/16-notifications.md` |
| Login | `docs/ux-redesign/17-login.md` |
| Register | `docs/ux-redesign/18-register.md` |
| Forgot password | `docs/ux-redesign/19-forgot-password.md` |
| Group join | `docs/ux-redesign/20-group-join.md` |
| Onboarding | `docs/ux-redesign/21-onboarding.md` |
| Group actions modals | `docs/ux-redesign/22-group-actions-modals.md` |
| Trivia popup | `docs/ux-redesign/23-trivia-popup.md` |
| Randomizer modal | `docs/ux-redesign/24-randomizer-modal.md` |
| Redeem modal | `docs/ux-redesign/25-redeem-modal.md` |
| Edit profile modal | `docs/ux-redesign/26-edit-profile-modal.md` |
| Preferences modal | `docs/ux-redesign/27-preferences-modal.md` |
| Transfer admin modal | `docs/ux-redesign/28-transfer-admin-modal.md` |
| Tour overlay | `docs/ux-redesign/29-tour-overlay.md` |
| Sidebar | `docs/ux-redesign/30-sidebar.md` |
| Shell + nav | `docs/ux-redesign/31-shell-nav.md` |
| Right-rail | `docs/ux-redesign/32-right-rail.md` |
| Trivia toast | `docs/ux-redesign/33-trivia-toast.md` |
| Confirm dialog | `docs/ux-redesign/34-confirm-dialog.md` |
| Picks-pending banner | `docs/ux-redesign/35-picks-pending-banner.md` |
| Footer (auth shell) | `docs/ux-redesign/36-footer-auth-shell.md` |
| Icon inventory | `docs/ux-redesign/icon-inventory.md` |
| Master plan spec | `docs/superpowers/specs/2026-05-28-ux-redesign-master-plan-design.md` |

---

**Fin del documento.**
