# Análisis UX: Sidebar — SidebarComponent

> Surface #30 del walkthrough. **EL surface más visible de la app** — persistente en todas las pantallas autenticadas.
> Desktop ≥768px: vertical fija izquierda, 64px colapsada → 200px al hover.
> Mobile <768px: bottom-nav horizontal 60px height con 5 items + labels chicos.
> Selectors `.lsb` son los que el tour-overlay engancha.

---

## 1. Identidad

- **Propósito**: navegación primaria del producto. Acceso a las 5 áreas principales + admin + notif + profile.
- **Audiencia**: cualquier user autenticado.
- **Frecuencia**: visible en CADA pantalla.
- **Visibility**: el surface que el user ve MÁS minutos en su sesión total.

---

## 2. Estructura

### Desktop (≥768px) — vertical

```
┌──── colapsada 64px ────┐    ┌──── hover 200px ─────────────┐
│      [Golgana logo]    │    │ [Golgana logo] POLLA          │
│                        │    │                                │
│         🏠             │    │ 🏠 Inicio                      │
│         ⚽             │    │ ⚽ Mis picks                   │
│         👥             │    │ 👥 Grupos                      │
│         🏆             │    │ 🏆 Ranking                     │
│         🌎             │    │ 🌎 Mundial 2026                │
│ (🛠 si admin)          │    │ 🛠 Admin (si admin)            │
│                        │    │                                │
│         🔔             │    │ 🔔 Notificaciones              │
│        [Av]            │    │ [Av] @handle                   │
└────────────────────────┘    └────────────────────────────────┘
```

### Mobile (<768px) — bottom-nav horizontal

```
┌──────────────────────────────────────────────────┐
│        Contenido de la página                    │
│                                                  │
│                                                  │
│                                                  │
├──────────────────────────────────────────────────┤
│  🏠     ⚽       👥      🏆       🌎     (🛠)    │
│ INICIO PICKS  GRUPOS RANKING MUNDIAL  ADMIN      │
└──────────────────────────────────────────────────┘
       (notif + profile NO se ven en mobile)
```

**5-6 items principales + bottom area solo desktop**.

---

## 3. Componentes desglosados

### 3.1 Container

**A11y**:
- ✓ `<aside aria-label="Navegación principal">` — landmark correcto.
- ✓ Anchor links semánticos.

**Visual desktop**:
- Background `#0a0a0a` (casi negro absoluto)
- Border-right `rgba(255,255,255,0.08)` (sutil)
- Transition 0.2s width (collapse/expand)
- `overflow: hidden` cuando colapsada

**Análisis**:
- ✓ Landmark a11y correcto.
- ✓ Background negro = brand identity fuerte.
- ✓ Smooth transition collapse/expand.
- 🟠 **`overflow: hidden` colapsada**: requiere `box-shadow inset` para focus-visible (comentario en código lo explica). Pattern correcto pero **frágil** si alguien cambia el outline a `outline:` futuro sin actualizar este truco.
- 🟠 **Color text `rgba(255,255,255,0.7)`** — un poco bajo para WCAG sobre negro puro. Mejor 0.85.

### 3.2 Logo

**Render colapsada**:
```
[Golgana logo 28px]
```

**Render hover**:
```
[Golgana logo 28px] POLLA
```

**Análisis**:
- ✓ Click al logo → `/home`.
- ✓ `aria-label="Inicio"`.
- ✓ Display flex hover muestra brand "POLLA".
- 🔴 **Cuarta variante de branding**: "POLLA" texto aquí, vs "GOLGANA · MUNDIAL 2026" auth-shell desktop, vs "Polla Mundialista" mobile auth, vs "Golgana" footer group-join. **4 variantes documentadas globales**.
- 🟠 **Image `alt=""`** — vacío. Si el logo es decorativo (porque tenemos label), OK semánticamente. Pero "Inicio" como label cuando es el logo del brand es confuso para SR users.
- 🟠 **Logo height 28px** — quinta variante documentada (28 / 32 / 40 / sin valor en otros surfaces). Inconsistencia cross-app.

### 3.3 Nav items principales

**Estructura** (cada item):
```html
<a routerLink="/X" routerLinkActive="active">
  <span class="lsb__i" aria-hidden="true">[emoji]</span>
  <span class="lsb__t">Label</span>
</a>
```

**6 items**:
1. 🏠 Inicio → `/home` (routerLinkActiveOptions exact)
2. ⚽ Mis picks → `/picks`
3. 👥 Grupos → `/groups`
4. 🏆 Ranking → `/ranking`
5. 🌎 Mundial 2026 → `/picks/group-stage/predict`
6. 🛠 Admin → `/admin` (solo si isAdmin)

**Análisis**:
- 🔴 **EMOJI ICONS EN TODOS LOS NAV ITEMS**: 🏠 ⚽ 👥 🏆 🌎 🛠 🔔 — el surface MÁS visto de la app, con cross-platform render diferente cada item. **Anti-pattern grave** porque define la identidad visual de la navegación.
- 🔴 **"Mundial 2026" link va a `/picks/group-stage/predict`** — wording confuso. "Mundial 2026" sugiere overview del torneo (matches, grupos, brackets) pero el path es "predicciones de clasificados". User ve un nombre que no coincide con lo que va a encontrar.
- ✓ `routerLinkActive` para highlight current.
- ✓ `aria-hidden="true"` en icon span.
- ✓ `routerLinkActiveOptions.exact` solo en Inicio (correcto — `/home` no debería highlight si va a `/home/X`).
- 🟠 **"Inicio" vs "Home"**: en otros surfaces (login propaga a `/home`, fallback paths), el path es `/home`. Label "Inicio" introduce traducción inconsistente.
- 🟠 **Sin badge contador** en `Grupos` (cuántos tengo), `Notificaciones` (cuántas unread). El user no ve activity sin entrar.
- 🟠 **Admin item visualmente igual** que los demás items — debería diferenciarse (sub-section, kicker "ADMIN", o spacer arriba).
- 🟡 Sin keyboard shortcut hints (`G` for Grupos, etc.).

### 3.4 Bottom area (solo desktop)

**Render colapsada**:
```
        🔔
       [Av]
```

**Render hover**:
```
🔔 Notificaciones
[Av] @handle
```

**2 items**:
1. 🔔 Notificaciones → `/notificaciones`
2. Avatar + @handle → `/profile`

**Análisis**:
- ✓ Avatar generated initials (2 chars uppercase del handle).
- ✓ `translate="no"` en @handle.
- ✓ Margin-top: auto empuja al fondo.
- 🔴 **`🔔` emoji** (anti-pattern bell icon).
- 🔴 **SIN badge contador unread** en bell — comentario en notif-list mencionaba unread count, pero el bell aquí no lo muestra. **Gap funcional MAJOR**.
- 🔴 **Avatar es initials gradient verde** — no muestra avatar real subido en `/profile/edit`. **Si el user subió foto, no se ve aquí**. Inconsistencia.
- 🟠 **`@jugador` fallback** si handle null — pero handle siempre debería existir (post-onboarding). Fallback defensive ok.
- 🟠 **`avatarInitials()` slice(0,2)**: si handle es "j" (no debería pero...) → "J?". Edge case.

### 3.5 Mobile bottom-nav

**Render** (con admin):
```
┌──────────────────────────────────────────┐
│  🏠      ⚽     👥     🏆      🌎    🛠   │
│ INICIO PICKS GRUPOS RANKING MUNDIAL ADMIN│
└──────────────────────────────────────────┘
```

**CSS overrides en media query**:
- `top: auto; bottom: 0` (sticky bottom)
- `flex-direction: row` + `justify-content: space-around`
- 60px height
- safe-area-inset para iOS
- `.lsb__t` always visible (font 9px uppercase)
- `.lsb__logo` y `.lsb__bottom` hidden (sin notif + sin profile en mobile)

**Análisis**:
- ✓ Bottom-nav pattern correcto mobile.
- ✓ `env(safe-area-inset-bottom)` respetado.
- ✓ Labels visibles (icon + text).
- ✓ space-around distribute.
- 🔴 **`.lsb__bottom` DISPLAY:NONE en mobile** = **NO HAY ACCESO A NOTIFICACIONES NI PROFILE DESDE LA NAV EN MOBILE**. ¿Cómo accede el user?
  - Comentario código menciona "el bell vive en el topbar mobile" → implica que la nav top (NavComponent) tiene el bell en mobile.
  - Profile: probable un link desde el topbar también.
  - **Pero esto debería estar verificado en el nav.component** (próximo doc).
- 🔴 **6 items en mobile bottom-nav cuando hay admin** → viola la regla "bottom-nav max 5 items" (Material Design / Apple HIG). Con admin, hay 6.
- 🟠 **Sin home icon size diferencia entre activo/inactivo** — solo background color cambio. Sin escala/peso.
- 🟠 **Sin safe-area-inset-left/right** en landscape (notch fones).

### 3.6 isAdmin gate

**Behavior**:
- `isAdmin = computed(() => this.auth.user()?.isAdmin === true)`
- Si admin: muestra item Admin.

**Análisis**:
- ✓ Reactive computed con auth state.
- ✓ Default false si user no autenticado.
- 🟡 No hay loader visual cuando isAdmin resuelve.

### 3.7 checkBracketReady (vestigial)

**Behavior**:
- `bracketReady` signal carga `listMatches + listPhases` para chequear si hay KO matches.
- Comentario: "Kept for parity with the previous sidebar (the bracket link is no longer surfaced from here in v3, but consumers may still query the signal)".

**Análisis**:
- 🔴 **CÓDIGO DEAD**: el signal no se usa en el template. Pero `ngOnInit` dispara `checkBracketReady()` que hace **2 API calls** (`listMatches + listPhases`) en CADA carga del sidebar.
- 🔴 **Performance hit en cada navegación**: si el sidebar mount por route change (no debería pero potencialmente), 2 calls extra.
- 🔴 **Storage cost gap**: incluso si no es bloqueante, son calls innecesarios. **Refactor candidate: eliminar este código**.
- 🟡 `bracketReady` puede ser consumido externamente (export of signal), pero comentario sugiere "no longer surfaced".

### 3.8 Hover interaction desktop

**Behavior**:
- Default 64px width
- `.lsb:hover` → 200px width
- Transition 0.2s

**Análisis**:
- ✓ Smooth animation.
- 🟠 **Solo hover-trigger** — para touch desktop (tablets sin teclado/mouse) o keyboard-only users, NO hay forma de expandir el sidebar.
- 🟠 **Hover-only no es accesible**: keyboard nav resuelve via focus-visible (mostrar el item al focus), pero el HOVER mantiene la nav full-width mientras dura el hover. Si user pierde el hover, colapsa.
- 🟠 **Sin "pin" button** para mantener expanded.
- 🟡 **Sin animation hint** al user de que el sidebar se expande (cargar página primera vez no muestra).

### 3.9 routerLinkActive overlap

**`Mundial 2026` → `/picks/group-stage/predict`** y **`Mis picks` → `/picks`**:

- Si el user está en `/picks/group-stage/predict`:
  - `Mis picks` routerLinkActive matches (prefix `/picks`) → active
  - `Mundial 2026` routerLinkActive matches (exact) → active
  - **AMBOS items aparecen highlighted**.

**Análisis**:
- 🔴 **BUG visual**: 2 items active simultáneos. Sin `[routerLinkActiveOptions]="{exact: true}"` en "Mis picks", el match es prefix-based.
- 🟠 **Solo Inicio tiene `{exact: true}`** — otros items no. Por lo tanto `Grupos` también puede ambiguamente match con `/groups/123` (que es correcto en este caso, así que ok). Pero el caso `/picks/X` con "Mis picks" vs "Mundial 2026" sí es bug.

---

## 4. Cross-cutting · hallazgos UX (priorizados)

🔴 **EMOJIS en TODOS los nav items**: 🏠 ⚽ 👥 🏆 🌎 🛠 🔔 — surface más visto de la app con cross-platform render.

🔴 **"Mundial 2026" → /picks/group-stage/predict** wording confuso (sugiere overview, va a predicción).

🔴 **Bug routerLinkActive overlap**: "Mis picks" + "Mundial 2026" simultáneamente active si user en `/picks/group-stage/predict`.

🔴 **Sin acceso a Notificaciones + Profile en mobile bottom-nav** (depende de NavComponent topbar).

🔴 **6 items mobile bottom-nav con admin** — viola regla max 5 items (Material/Apple HIG).

🔴 **Avatar NO usa avatar real** subido (solo initials).

🔴 **Sin badge contador unread** en bell.

🔴 **`checkBracketReady` código DEAD**: 2 API calls innecesarios en cada mount.

🟠 **4ta variante branding "POLLA"** (vs Golgana, Polla Mundialista, GOLGANA · MUNDIAL 2026).

🟠 **5ta variante logo size 28px** (vs 32, 40, sin valor).

🟠 **Color text 0.7 sobre negro** — bajo para WCAG.

🟠 **Hover-only expand** desktop (no touch, no keyboard-pin).

🟠 **Sin badge contador** en Grupos / Notificaciones.

🟠 **Admin item visualmente igual** que items normales.

🟠 **"Inicio" vs `/home`** label/path inconsistente.

🟠 **`alt=""` en logo** con label "Inicio" — confuso semánticamente.

🟠 **Sin safe-area-inset left/right** landscape.

🟠 **`box-shadow inset` para focus-visible** workaround frágil.

🟠 **6 items mobile bottom-nav con admin** = density.

🟡 **Sin keyboard shortcut hints** (G/P/R).

🟡 **Sin animation hint** primera vez expand sidebar.

🟡 **Sin loader visual** isAdmin resolución.

🟡 **`@jugador` fallback** edge case.

🟢 **A11y landmark** `<aside aria-label>`.

🟢 **routerLinkActive** highlight current.

🟢 **routerLinkActiveOptions.exact** en Inicio.

🟢 **`translate="no"`** en @handle.

🟢 **safe-area-inset-bottom** mobile.

🟢 **Smooth transitions** collapse/expand.

🟢 **Reactive computed** isAdmin, handle.

🟢 **Bottom-nav pattern** mobile.

🟢 **Mobile bottom area hidden** intencional (depende de topbar).

🟢 **prefers-reduced-motion** debería respetarse (no veo handler aquí, pero transición es 0.2s — debe respetar).

🟢 **Brand consistency**: background negro = identidad fuerte.

---

## 5. Antipatrones detectados

| Regla | Violación |
|---|---|
| **no-emoji-icons** | 🏠⚽👥🏆🌎🛠🔔 en TODO el nav |
| **Bottom-nav max 5 items** | 6 con admin (Material/Apple) |
| **Label vs path consistency** | "Inicio" vs `/home`, "Mundial 2026" vs `/picks/...` |
| **routerLinkActive specificity** | Items overlapping → 2 active |
| **Avatar consistency** | Initials vs real avatar subido |
| **Badge contador missing** | Bell sin unread count |
| **Hover-only desktop** | No touch / keyboard-pin |
| **Dead code performance** | checkBracketReady 2 API calls |
| **Branding variants** | 4ta variante "POLLA" |
| **WCAG contrast** | 0.7 sobre negro tight |

---

## 6. Anclas para el redesign

### Core

1. **Sidebar negro fixed left** desktop
2. **Bottom-nav mobile** con safe-area
3. **6 nav items** + Inicio + Admin gate
4. **Bottom area** notif + profile (desktop)
5. **routerLinkActive** highlight
6. **Collapse/expand hover** desktop
7. **Avatar initials** fallback
8. **A11y aside landmark**

### Quitar

- 🏠⚽👥🏆🌎🛠🔔 emojis → SVG icons system (Lucide/Heroicons)
- 4ta variante branding → unificar
- 5ta variante logo size → token
- `checkBracketReady` dead code → eliminar
- "Inicio" label → "Home" (consistente con path)
- "Mundial 2026" link → renombrar o reapuntar

### Agregar

- 🔴 **SVG icon system** (Heroicons / Lucide / custom):
  - home, ball/cleats, users, trophy, globe, wrench, bell
- 🔴 **Badge contador** en bell (notif unread) + en Grupos (count)
- 🔴 **Avatar real subido** (si avatarKey, mostrar imagen, sino initials fallback)
- 🔴 **routerLinkActive `[exact]`** en "Mis picks" o configurar pattern de matching no-overlap
- 🔴 **Resolver overflow 6 items mobile**: alternativas:
  - Bottom-nav 5 items + "Más" sheet con admin + notif + profile
  - Admin solo desktop (no en mobile bottom-nav)
  - Drawer hamburguesa mobile en lugar de bottom-nav
- **"Pin" sidebar** button desktop (mantener expandido)
- **Focus-visible outline** outside-bounded (fix overflow:hidden workaround)
- **Color text 0.85** sobre negro (WCAG aware)
- **Keyboard shortcut hints** (Cmd+1, Cmd+2 navegación rápida)
- **Animation hint** primera vez user hovers sidebar (5s nudge)
- **Admin section separado** visually (divider o kicker "ADMIN")
- **Badge "live" en Mundial 2026** durante matches en curso
- **safe-area-inset left/right** landscape mobile
- **"Mundial 2026" wording** decidir: ¿overview link? ¿predicción link? ¿submenu?

### Considerar

- **Drawer mobile** alternativa: hamburger top + slide-out lateral con TODAS las opciones (incluyendo profile, notif, admin)
- **Tooltips on hover** (collapsed state) con icon labels
- **Recently visited** quick links
- **Search global** integrado en sidebar
- **Theme toggle** (light/dark) en bottom area

---

## 7. Resumen ejecutivo

**Surface más visto de la app** — vive en todas las pantallas autenticadas. Define la identidad visual y la nav experience. Los issues:

1. 🔴 **Emojis en TODOS los nav items**: 🏠⚽👥🏆🌎🛠🔔. Render diferente en Windows / macOS / iOS / Android. **El surface MÁS impactante para reemplazar con SVG icon system**.

2. 🔴 **"Mundial 2026" link** apunta a predicción de clasificados. Wording engaña al user.

3. 🔴 **Bug routerLinkActive overlap**: en `/picks/group-stage/predict`, ambos "Mis picks" y "Mundial 2026" highlighteados.

4. 🔴 **Mobile bottom-nav densa con admin**: 6 items vs regla max 5. Pierde acceso a notif + profile.

5. 🔴 **Bell sin badge** unread count. Avatar sin foto real.

6. 🔴 **`checkBracketReady` dead code**: 2 API calls innecesarios por mount.

### 3 decisiones de diseño que cambian todo

1. **SVG icon system app-wide**: ESTE es el detonador. Los 7 emojis del sidebar son los íconos MÁS vistos. Cambiarlos por SVG (Heroicons / Lucide / custom) **define un sistema** que después se reutiliza en TODOS los modales, CTAs, banners, toasts, etc. ROI exponencial.

2. **Mobile nav strategy**: 6 items no caben en bottom-nav. Decisión:
   - **Opción A**: Drawer hamburger mobile (slide-out con todas las opciones)
   - **Opción B**: Bottom-nav 5 items + "Más" sheet con admin/notif/profile
   - **Opción C**: Admin solo desktop, mobile siempre 5 items

3. **Avatar real + badges contador**: avatar muestra foto subida (vs initials), bell muestra unread count badge, Grupos muestra count. Sin estos, la sidebar es estática — con ellos, **se vuelve un dashboard de glance** que invita engagement.

### Cambios secundarios

- "Inicio" → "Home" (consistente)
- "Mundial 2026" link decidir
- routerLinkActive `[exact]` o pattern fix
- "Pin" sidebar button
- Focus-visible outline fix
- WCAG text 0.85
- Keyboard shortcuts
- Animation hint expand
- Admin section separator
- Badge live en Mundial 2026 durante matches
- safe-area-inset landscape
- Eliminar `checkBracketReady` dead code
- Logo size unificado

### Considerar features

- Drawer mobile alternative
- Tooltips collapsed state
- Recently visited quick links
- Search global integrado
- Theme toggle bottom area

**Nota retrospectiva**: este surface define la **identidad visual + flow de navegación de TODA la app**. Cualquier cambio aquí impacta CADA pantalla. **Es el surface con MAYOR ROI por línea de código modificada** del walkthrough. Iniciar con SVG icon system aquí y propagarlo desbloquea consistencia visual en cascada.
