# Análisis UX: Shell + Nav — ShellComponent + NavComponent

> Surface #31 del walkthrough. **Wrapper de todas las rutas autenticadas + topbar**.
> Shell mountea: nav + sidebar + trivia-toast + main + right-rail + footer + 4 modales globales.
> Nav contiene: topnav desktop **OCULTO** + topbar mobile + tabbar mobile **OCULTO**.
> **Hallazgo crítico**: nav.component tiene 200+ líneas de markup zombie (desktop topnav + mobile tabbar) que están `display: none !important`.

---

## 1. Identidad

- **Propósito**: layout shell que envuelve todas las pantallas autenticadas + topbar mobile complementario al sidebar bottom-nav.
- **Audiencia**: cualquier user autenticado.
- **Frecuencia**: 100% — visible en todas las pantallas autenticadas.

---

## 2. Estructura

### Shell

```
┌──────────────────────────────────────────────────────────┐
│ <app-nav> [solo topbar mobile visible · resto display:none]│
│ <app-sidebar> [fixed left desktop / bottom-nav mobile]   │
│ <app-trivia-toast> [banner si trivia live]               │
│ <div class="shell">                                      │
│   ┌────────────────────────┬─────────────────────────┐   │
│   │  <main>                │  <app-right-rail>       │   │
│   │   <router-outlet />    │  (320px desktop ≥1100)  │   │
│   │   1fr                  │                         │   │
│   └────────────────────────┴─────────────────────────┘   │
│ <app-footer>                                             │
│ <app-toast-host>                                         │
│ <app-trivia-popup>                                       │
│ <app-group-actions-modals>                               │
│ <app-redeem-modal>                                       │
└──────────────────────────────────────────────────────────┘
```

### Nav — 3 secciones de markup, 1 sola visible

```
┌──────────────────────────────────────┐
│ DESKTOP TOPNAV (≥992)                │
│ display:none !important              │ ← ZOMBIE 130 líneas
│ Brand + menu + Ranking dropdown +    │
│ Sync pill + Bell + User dropdown     │
├──────────────────────────────────────┤
│ MOBILE TOPBAR (<992)                 │
│ display visible <992                 │ ← ÚNICO VISIBLE
│ Brand + Sync mobile + Bell + Avatar  │
├──────────────────────────────────────┤
│ MOBILE TABBAR (<992)                 │
│ display:none !important              │ ← ZOMBIE 30 líneas
│ Picks / Grupos / Ranking / Perfil    │
└──────────────────────────────────────┘
```

---

## 3. ShellComponent — desglose

### 3.1 Grid layout

**Desktop ≥1100px**:
```css
.shell {
  margin-left: 64px;       /* sidebar width colapsado */
  grid-template-columns: 1fr 320px;
  gap: 24px;
  padding: 24px;
  max-width: 1480px;
}
```

**Tablet 768-1099px**:
- `grid-template-columns: 1fr` (sin right-rail visible — pero todavía mountado, ocupa DOM)

**Mobile <768px**:
- `margin-left: 0` (sin sidebar lateral, es bottom-nav)
- `padding-bottom: 74px` clearance para bottom-nav

**Análisis**:
- ✓ Grid responsive simple y predecible.
- ✓ `max-width: 1480px` previene ancho excesivo en monitores ultrawide.
- ✓ `min-height: 100dvh` (dvh = dynamic viewport height, ideal mobile).
- ✓ `padding-bottom: 74px` mobile evita que el contenido quede debajo del bottom-nav (60px nav + safe-area).
- 🔴 **Grid-columns `1fr 320px`** pero `margin-left: 64px` **fijo** asume sidebar colapsada. **Si user hace hover → sidebar 200px**, el margin-left NO se actualiza. El main NO se mueve → overlap visual de 136px (200-64). **BUG visual layout**.
- 🟠 **Right-rail siempre mountado** (component existe en template). En mobile/tablet ocupa DOM aunque `display: none` — performance hit menor.
- 🟠 **Padding 24px desktop / 14px mobile** — inconsistente con 16/8 (Material) o 20/16 (Apple). Sistema spacing propio.
- 🟡 Sin `<main>` con `role="main"` explícito (HTML5 main element implica el role, pero algunos SR antiguos requieren explícito).

### 3.2 Modales globales montados

**4 modales en shell**:
- `<app-trivia-popup>` (doc 23)
- `<app-group-actions-modals>` (doc 22)
- `<app-redeem-modal>` (doc 25)
- `<app-toast-host>` (probable componente toast container)

**Análisis**:
- ✓ Pattern correcto: 1 punto de mount global vs N puntos en cada feature.
- ✓ Z-index management consolidado.
- 🟠 **`<app-toast-host>` no analizado** todavía — debería estar en la lista (sus hijos son notifications visuales).
- 🟠 **Tour-overlay NO está aquí** — probablemente se monta condicionalmente en /home (no en shell). Eso explica el `STORAGE_KEY` por user.

### 3.3 Bottom rail no montado

**Observación**: el shell monta `<app-trivia-toast>` pero NO hay un `<app-trivia-fab>` separado. El FAB de trivia vive **dentro** del `<app-trivia-popup>` (ya documentado en doc 23). Pattern correcto: 1 componente que renderiza FAB + modal.

---

## 4. NavComponent — desglose

### 4.1 Topnav desktop (ZOMBIE - display:none)

**130 líneas de markup** entre line 17-145 que están **siempre ocultas**:
- Brand + img
- Menu items: Dashboard/Grupos/Rankings/Partidos (admin) o Mis picks/Grupos (user)
- Ranking dropdown con global + per-group + "Ver todos"
- Sync pill desktop
- Bell con badge
- User dropdown con notif/perfil/cerrar sesión

**CSS** (lines 322):
```css
.app-topnav { display: none !important; }
```

**Análisis**:
- 🔴 **CÓDIGO ZOMBIE MASSIVE**: 130 líneas de markup + ~80 líneas de CSS estilos del topnav que NUNCA se renderizan.
- 🔴 **Logic activa**: `unreadCount()` subscription + `myGroups()` computed + `topGroups()` slice + `open` signal manage **se ejecutan** aunque el markup nunca aparece.
- 🔴 **Performance hit**: subscription a notificaciones activa, computeds + signals + reactividad. **En un componente que solo muestra mobile topbar**.
- 🔴 **Storage cost en build**: bundle size + CSS bytes innecesarios.
- 🟠 **Confirmación**: comentario código (lines 317-321) admite la situación: "design-v3 overrides: el sidebar negro absorbe la navegación primaria". **Refactor pendiente: eliminar topnav desktop + tabbar mobile completamente**.

### 4.2 Mobile topbar (ÚNICO VISIBLE)

**Render** (<992px):
```
[Golgana logo]    [sync pill?] [🔔3] [Avatar]
```

**Componentes**:
1. Brand link → `/home`
2. Sync pill condicional (visible si `sync.status() !== 'idle'`)
3. Bell con badge unread
4. Avatar link → `/profile`

**Análisis**:
- ✓ **Completa la nav mobile**: el sidebar bottom-nav cubre 4 items principales, el topbar agrega bell + profile + sync indicator.
- ✓ **Sync pill contextual** — solo aparece cuando hay actividad.
- ✓ aria-label per icon link.
- ✓ Avatar component shared (`<app-user-avatar>` — usa avatarKey real, no initials como sidebar bottom).
- 🔴 **Bell con `🔔` emoji** mismo issue.
- 🔴 **Badge unread count** ✓ aquí (mientras sidebar bottom NO lo tiene — confirmamos sidebar gap doc 30).
- 🟠 **No hay clases CSS visible** en el code (los styles no aparecen para `.app-topbar`). Probable definidos globally fuera del component.
- 🟠 **Sync pill emojis** ⏳ ● ⚠ — anti-patterns multi-icon.

### 4.3 Mobile tabbar (ZOMBIE - display:none)

**Lines 180-208**: 30 líneas de tabbar mobile con 4 items (Home/Grupos/Rankings/Partidos admin, o Picks/Grupos/Ranking/Perfil user).

**CSS** (lines 323):
```css
.app-tabbar { display: none !important; }
```

**Análisis**:
- 🔴 **MÁS CÓDIGO ZOMBIE**: el sidebar bottom-nav mobile absorbe esto. Pero aquí queda.
- 🔴 **Inconsistencia datos**: el tabbar admin mobile tiene `🏠 Home` (path `/admin`) + `👥 Grupos` + `🏆 Rankings` + `⚽ Partidos`. El sidebar admin mobile sería diferente (Dashboard). **Si nunca se renderiza, no rompe nada — pero confirma que NO debería estar acá**.

### 4.4 Topnav dropdowns desktop (ZOMBIE pero richer)

**Ranking dropdown** (lines 33-76):
- Global → `/ranking?scope=global`
- Per-group (top 5): `/groups/:id`
- "Ver todos" si > 5 grupos
- Empty state si 0 grupos

**User dropdown** (lines 107-143):
- 🔔 Notificaciones con badge
- 👤 Mi perfil
- ⏻ Cerrar sesión (danger)

**Análisis**:
- ✓ **Pattern brillante** que NO se ve: per-group ranking dropdown sería UX muy útil. **Diseño valuable perdido**.
- ✓ ConfirmDialog para logout (P0 done — confirma destructive action).
- 🔴 **Pattern desktop perdido**: si quedó por compatibilidad pero no se usa, **el sidebar pierde estos features** (no hay per-group ranking ni dropdown user).
- 🟠 **Logout via confirmDialog** wording: "¿Querés cerrar sesión? Vas a salir de tu cuenta y regresarás al login" — voseo "Querés" + "Vas a".

### 4.5 Subscription notificaciones

**ngOnInit**:
- `observeMyNotifications(userId).subscribe(...)` → cuenta unread
- `unreadCount` signal exposed para topnav (no render) + topbar mobile

**Análisis**:
- ✓ **Real-time subscription** correcta.
- ✓ Cleanup `ngOnDestroy`.
- ✓ Filter por `!readAt` correcto.
- 🟠 **`console.warn` en error** (línea 360) — telemetry gap.
- 🟠 **Sin reconnect logic** si subscription cae.

### 4.6 logout flow

**Behavior**:
1. closeAll() dropdowns
2. ConfirmDialog "¿Querés cerrar sesión?"
3. auth.logout()
4. Navigate /login

**Análisis**:
- ✓ Double-confirm pattern correcto.
- ✓ No clear localStorage del tour flag — user al re-login no vería tour de nuevo. **Bug latente o feature?**
- 🟠 **Sin pre-logout cleanup**: si hay picks pendientes en sync queue, se pierden. **Pattern correcto**: warn "Tenés N picks sin sincronizar".

### 4.7 Doc click + Escape handlers

**Behavior**:
- `@HostListener('document:click')` → closeAll
- `@HostListener('document:keydown.escape')` → closeAll si open

**Análisis**:
- ✓ Click outside cierra dropdowns.
- ✓ Escape cierra dropdowns.
- 🟠 **El handler está en el component, no en una directiva** — si NavComponent es destroyed (mobile navigation), handlers se desuscriben automáticamente. OK.
- 🟠 **`document:click` siempre on**: incluso cuando dropdowns están cerrados, sigue ejecutándose. Pequeño overhead.

---

## 5. Cross-cutting · hallazgos UX (priorizados)

🔴 **CÓDIGO ZOMBIE MASSIVE**: 130+30 líneas de markup + CSS de topnav desktop + tabbar mobile **siempre `display:none !important`**. Performance + bundle + maintainability gap.

🔴 **Patterns valiosos perdidos**: per-group ranking dropdown + user dropdown (notif/perfil/logout) — diseño brillante pero NO visible al user.

🔴 **Sidebar pierde features**: bell unread badge (sidebar bottom NO lo tiene, topbar mobile SÍ), per-group ranking, logout button.

🔴 **Bug visual sidebar hover overlap**: shell `margin-left: 64px` fijo, sidebar hover expande a 200px → main NO se mueve, overlap 136px.

🔴 **Emojis en topbar mobile**: 🔔 ⏳ ● ⚠ 🌐 🔔 👤 ⏻ — surface visible.

🟠 **Logout voseo** "Querés / Vas a" (11+ instancia).

🟠 **Sin pre-logout cleanup** picks pendientes.

🟠 **Sin reconnect logic** notif subscription.

🟠 **`console.warn` en prod**.

🟠 **Padding 24/14px** no estándar Material/Apple.

🟠 **`<main>` sin `role="main"`** explícito.

🟠 **Right-rail siempre mountado** en mobile (DOM cost).

🟠 **`display: none !important`** anti-pattern CSS.

🟡 **Sin Toast-host analizado** (subcomponent global).

🟡 **Tour-overlay no mountado en shell** — vive separado.

🟢 **Layout grid responsive predecible**.

🟢 **dvh viewport unit** mobile correcto.

🟢 **Padding-bottom 74px** clearance bottom-nav.

🟢 **Modal mount global pattern**.

🟢 **Subscription cleanup** ngOnDestroy.

🟢 **ConfirmDialog logout** (P0 done).

🟢 **Click outside + Escape** dropdowns.

🟢 **Avatar component shared** (real avatar mobile).

🟢 **Sync pill contextual** (solo cuando hay actividad).

🟢 **Real-time unread count** subscription.

🟢 **`aria-label` per link**.

---

## 6. Antipatrones detectados

| Regla | Violación |
|---|---|
| **Dead code visible** | 200+ líneas markup zombie |
| **`!important` anti-pattern** | display:none !important |
| **Layout fixed margin overlap** | Shell margin-left vs sidebar hover |
| **no-emoji-icons** | 🔔⏳●⚠🌐👤⏻ |
| **Pattern duplicado abandonado** | Topnav desktop + Sidebar nav |
| **Feature divergence** | Bell badge en topbar mobile, NO en sidebar |
| **Subscription leak risk** | console.warn sin reconnect |
| **i18n consistency** | Voseo "Querés / Vas a" |
| **`<main>` role** | Sin role="main" explícito |
| **Mounted DOM cost** | Right-rail mobile + zombie nav |

---

## 7. Anclas para el redesign

### Core

1. **Shell wrapper** con sidebar + main + right-rail + footer
2. **Modales globales mountados**
3. **Topbar mobile** complementario sidebar bottom-nav
4. **Sync pill contextual**
5. **Bell unread badge**
6. **Real-time unread subscription**
7. **ConfirmDialog logout**
8. **Click outside + Escape**

### Quitar (refactor crítico)

- 🔴 **`<header class="app-topnav">` completo** (130 líneas) — el sidebar lo absorbe
- 🔴 **`<nav class="app-tabbar">` completo** (30 líneas) — el sidebar mobile lo absorbe
- 🔴 **CSS del topnav + tabbar** (~80 líneas)
- 🔴 **Logic asociada**: `myGroups`, `topGroups`, dropdowns signals si solo se usaban en zombie
- Emojis 🔔 ⏳ ● ⚠ 🌐 👤 ⏻ → SVG icons
- `display: none !important` → eliminación física
- Voseo logout wording

### Agregar

- 🔴 **Sidebar features recuperados del zombie**:
  - Bell con unread badge (CRÍTICO - sidebar gap)
  - User dropdown bottom area (notif/perfil/logout) o equivalente
  - Per-group ranking dropdown (UX brillante perdido)
- 🔴 **Fix margin-left overlap**: shell debe responder a sidebar state. Opciones:
  - CSS variable `--sidebar-width` que cambia con hover
  - Sidebar NO hover-expand (sticky width)
  - Overlay (sidebar expanded está SOBRE el main, no empuja)
- **role="main"** explícito en `<main>`
- **Reconnect logic** notif subscription
- **Pre-logout warning** picks pendientes
- **Tour-overlay mount en shell** (centralizar)
- **Toast-host análisis** (próximo doc)
- **Padding estándar** Material/Apple
- **Right-rail conditional mount** (no render si <1100)
- **Telemetry** en lugar de console.warn

### Considerar

- **Drawer mobile alternativa**: hamburger top + slide-out con todas las opciones (incluyendo per-group ranking)
- **Compact sidebar desktop** (sin hover-expand, siempre 64px) con dropdowns
- **Sticky topbar mobile** durante scroll vs auto-hide
- **Search global** en topbar mobile

---

## 8. Resumen ejecutivo

**Wrapper layout funcional + Nav component con 200+ líneas de código zombie** que arrastra performance + complejidad sin valor. Los issues críticos:

1. 🔴 **Dead code 200+ líneas**: topnav desktop + tabbar mobile están `display: none !important`. El sidebar v3 los absorbió pero el código quedó. **Refactor candidate inmediato**.

2. 🔴 **Features brillantes perdidos**: per-group ranking dropdown + user dropdown estaban diseñados pero ahora ocultos. **El sidebar v3 NO los recuperó** → sidebar pierde funcionalidad (bell badge, ranking per-group, dropdown logout).

3. 🔴 **Bug visual sidebar hover overlap**: shell `margin-left: 64px` fijo, sidebar hover → 200px, main NO se mueve, overlap 136px.

4. 🔴 **Emojis multi-anti-pattern**: topbar mobile + sync pill + dropdowns todos con emojis.

### 3 decisiones de diseño que cambian todo

1. **Refactor consolidation**:
   - **Eliminar topnav desktop + tabbar mobile** del NavComponent (200+ líneas).
   - **Recuperar features valiosas en sidebar**: bell badge + per-group ranking dropdown + user dropdown bottom (notif/perfil/logout).
   - **Resultado**: nav.component pasa de 393 líneas a ~120 (solo topbar mobile + logic compartida).

2. **Sidebar hover overlap fix**: shell debe responder a sidebar state. Implementaciones:
   - CSS variable `--sidebar-w: 64px` → `200px` on hover (sidebar emite + shell consume)
   - O eliminar hover-expand (siempre 64px con tooltips)
   - O overlay style (sidebar expanded está SOBRE el main, no empuja)

3. **Per-group ranking dropdown**: el pattern de "Ranking global + per-group + Ver todos" en el desktop dropdown era UX brillante. Recuperarlo en el sidebar (acordeón) o en /ranking landing.

### Cambios secundarios

- SVG icon system (🔔⏳●⚠🌐👤⏻)
- `role="main"` explícito
- Voseo logout wording fix
- Reconnect logic subscription
- Pre-logout warning picks pendientes
- Tour-overlay mount centralización
- Right-rail conditional mount mobile
- Telemetry vs console.warn
- Padding estándar

### Considerar features

- Drawer hamburger mobile
- Compact sidebar siempre 64px
- Sticky topbar auto-hide scroll
- Search global topbar mobile

**Nota retrospectiva**: estos 2 componentes son el **esqueleto invisible** que sostiene cada pantalla. El zombie code reveals **migration debt**: el design v3 (sidebar negro) absorbió la nav primaria pero **nadie hizo el cleanup**. Refactor con prioridad alta porque:
- ~200 líneas de código innecesarias arrastran maintenance.
- Features brillantes perdidos cuestan UX.
- Bug del hover overlap es visible y reportable por users.
