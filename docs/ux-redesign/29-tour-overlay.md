# Análisis UX: Tour Overlay — TourOverlayComponent

> Surface #29 del walkthrough. **Único surface con spotlight pattern** en toda la app.
> Tour interactivo de 3 pasos: presenta features clave (grupos, predicciones, marcadores).
> Auto-aparece al primer ingreso al home (sin localStorage flag).
> Reactivamente reposiciona spotlight en scroll/resize.
> Backed por localStorage `polla-tour-completed-v1` flag.

---

## 1. Identidad

- **Propósito**: onboarding visual post-creación cuenta — mostrar al user dónde están las features principales.
- **Audiencia**: users nuevos al primer ingreso al home + power users que re-quieren ver el tour.
- **Frecuencia**: 1 vez auto (primer ingreso) + N veces manual via `start()`.
- **Entry points**:
  - Auto en home cuando `!localStorage[STORAGE_KEY]`
  - Manual via método `start()` (presumablemente desde botón en home tipo "Ver tour")

---

## 2. Estructura — overlay + 3 steps

```
   ┌─────────────────────────────────────────────────┐
   │ TOUR OVERLAY (z-index 100)                      │
   │                                                 │
   │  Backdrop oscuro con CLIP-PATH spotlight        │
   │  ┌──────────┐                                   │
   │  │ Anillo   │  ← .lsb a[href="/groups"]         │
   │  │ verde    │                                   │
   │  └──────────┘                                   │
   │                                                 │
   │              ┌───────────────────────────────┐  │
   │              │ Tour Card (positioned)        │  │
   │              │                               │  │
   │              │ PASO 1 DE 3      [Saltar tour]│  │
   │              │ Crea o únete a un grupo       │  │
   │              │ Tu polla vive dentro de...    │  │
   │              │ ● ○ ○                         │  │
   │              │ [‹Atrás] [Siguiente →]        │  │
   │              └───────────────────────────────┘  │
   └─────────────────────────────────────────────────┘
```

**Cambio de step**: spotlight + card reposicionados con scroll automático al elemento target.

---

## 3. Componentes desglosados

### 3.1 Overlay container

**Render**:
```css
.tour-overlay {
  position: fixed; inset: 0;
  z-index: 100;
  pointer-events: none;
}
```

**A11y**:
- ✓ `role="dialog"`, `aria-modal="true"`, `aria-labelledby="tour-card-title"`
- ✓ Escape close (handler manual en window)
- 🟠 **NO usa `cdkTrapFocus`** — único modal sin CDK focus trap.
- 🟠 **`pointer-events: none`** en container con `pointer-events: auto` en backdrop y card. Diseño correcto pero **el ring spotlight es `pointer-events: none`** — user NO puede clickear el elemento highlighted. **Anti-pattern UX para spotlight tours**: el patrón estándar es PERMITIR clickear el highlighted element (Intro.js, Shepherd.js).

### 3.2 Backdrop con clip-path

**Behavior**:
- Backdrop `rgba(0, 0, 0, 0.62)` cubre todo
- `clip-path: polygon(...)` corta un "agujero" en el spotlight area
- Click en backdrop → `dismiss()`

**Análisis**:
- ✓ **Pattern moderno con clip-path** — sin necesidad de SVG mask o 4 divs.
- ✓ Backdrop click cierra.
- 🟠 **Click en el "agujero" del backdrop** — passes through al elemento (porque no hay backdrop ahí). Pero **el ring de spotlight tiene `pointer-events: none`** así que no intercepta. El user PUEDE clickear el elemento highlighted... PERO el comportamiento del tour entonces es ambiguo:
  - ¿Click navega? Sí (es un `<a>`).
  - ¿El tour avanza? No.
  - ¿El tour se cierra? Depende — si el user navega a otra ruta, el TourOverlay sigue mounted en shell (?).
- 🟠 **Background opacity 0.62** — un poco light. Más estándar 0.7-0.8 para mejor contraste.

### 3.3 Spotlight ring

**Render**:
```css
border: 3px solid var(--wf-green);
border-radius: 10px;
box-shadow: 0 0 0 4px rgba(0, 200, 100, 0.25);
```

**Behavior**:
- Posición/size = `getBoundingClientRect()` del elemento target ±6px padding
- Transición `0.2s ease` para todos los attrs (smooth movement entre steps)
- `pointer-events: none`

**Análisis**:
- ✓ **Color verde brand consistency**.
- ✓ Glow exterior (box-shadow rgba) — visual fuerte.
- ✓ Smooth transition entre steps.
- ✓ `prefers-reduced-motion` respetado (transitions disabled).
- 🟠 **Padding ±6px hardcoded** — si el elemento target es muy pequeño, el ring se ve disproporcionado.
- 🟠 **Si el elemento no existe** (`document.querySelector` retorna null), `spotlightRect()` retorna null → backdrop full sin "agujero" + sin ring. **Failure silencioso**.

### 3.4 Tour card

**Posición auto**:
1. Default: derecha del spotlight + alineado top
2. Si no cabe a la derecha → izquierda
3. Si tampoco cabe → debajo del spotlight
4. Clamp viewport [16, viewport - 16]

**Análisis**:
- ✓ **Auto-positioning robusto** con fallbacks múltiples.
- ✓ Clamp viewport previene off-screen.
- ✓ Smooth transition top/left entre steps.
- ✓ **Mobile (≤720px)**: card siempre bottom-fixed, left/right 16px (overrides top/left con `!important`).
- 🟠 **`!important` en mobile media query** — anti-pattern CSS pero funcional.
- 🟠 **`cardHeight = 240` hardcoded** — si el body text es muy largo, la card crece y el clamp puede ser inexacto.
- 🟠 **Position calcs en SSR**: si `typeof window === 'undefined'`, retorna `{0,0}` → card aparece arriba-izq del viewport. **Probablemente funciona porque el componente solo aparece post-hydration**, pero edge case.
- 🟡 **Sin animation entrada de la card** — aparece instant.

### 3.5 Header

**Render**:
```
PASO 1 DE 3                              Saltar tour
```

**Análisis**:
- ✓ Step indicator claro.
- ✓ Skip option prominente (no oculta).
- ✓ Skip wording "Saltar tour" (no "Cerrar").
- 🟠 **"Saltar tour"** wording — sugiere "voy a otra parte" pero realmente cierra. Probable "Saltar" tipo register/forgot que también es ambiguo.
- 🟡 **Sin contador "queda 1 paso"** o tiempo estimado.

### 3.6 Body — title + body text

**Step 1**:
```
Crea o únete a un grupo
Tu polla vive dentro de un grupo (panas, oficina, familia).
Usá los botones del menú lateral o la pantalla de Mis grupos.
```

**Step 2**:
```
Predicciones de clasificados
Antes del Mundial: arma cómo crees que terminará cada grupo.
Aquí encontrás "Clasificados" y "Llaves".
```

**Step 3**:
```
Marcadores partido a partido
Cuando arranque el torneo: predice marcadores antes de cada kickoff.
Auto-guarda mientras tipeas.
```

**Análisis**:
- ✓ Wording conversational.
- ✓ Body explica QUÉ + DÓNDE.
- 🟠 **"Usá"** + "encontrás" + "tipeas" voseo — décima+ instancia documentada.
- 🟠 **Step 1 menciona "panas, oficina, familia"** — culturalmente Latam pero específico.
- 🟠 **Step 2 wording "Aquí encontrás"** — pero el spotlight es sobre **un link de la sidebar** (`/picks/group-stage/predict`), no el contenido. Confuso: ¿el "aquí" es la card o el link?
- 🟠 **Step 3 wording "Auto-guarda mientras tipeas"** — buena info pero específica solo para marcadores.
- 🟡 Sin imágenes / iconos en el body.

### 3.7 Progress dots

**Render**:
```
● ○ ○      (step 1)
✓ ● ○      (step 2)
✓ ✓ ●      (step 3)
```

**CSS**:
- Default: gray 7×7px circle
- `.is-active`: green 20×7px (pill)
- `.is-done`: green-soft 7×7

**Análisis**:
- ✓ **Visual elegante**: active = pill alargado, done = pill suave.
- ✓ Transition smooth entre states.
- 🟠 **3 dots para 3 pasos** — bien, pero si crece a 5+ steps el pattern se rompe.
- 🟡 Sin click-to-jump (user no puede ir al step 3 si quiere).

### 3.8 Actions

**Render**:
```
[‹ Atrás]                                  [Siguiente →]
```

o (step 1):
```
                                           [Siguiente →]
```

o (último step):
```
[‹ Atrás]                            [Listo, terminar]
```

**Análisis**:
- ✓ "Atrás" oculto en step 1 (con `<span></span>` placeholder para flex layout).
- ✓ "Listo, terminar" en el último step (no "Siguiente").
- ✓ Wording "terminar" final.
- 🟠 **`<span></span>` placeholder** — mismo issue trivia-popup. Anti-pattern semántico.
- 🟠 **"‹ Atrás"** unicode arrow + emoji prevención inconsistente. ¿Es symbol o emoji? Probable "‹" es safe.
- 🟠 **"Siguiente →"** unicode arrow — anti-pattern (igual que en register/forgot).

### 3.9 Storage flag persistance

**localStorage `polla-tour-completed-v1`**:
- Setea `'1'` al dismiss/complete
- Lee en constructor — si '1', `completedFromStorage=true` → `visible() = manuallyStarted()`

**Análisis**:
- ✓ Versioned key (`-v1`) permite reset si cambian el tour.
- ✓ try/catch para SSR safety.
- ✓ Auto-skip si ya completado, salvo manual start.
- 🟠 **Sin reset auto** si user crea nueva cuenta — flag persiste cross-account en mismo browser.
- 🟠 **Sin sync server-side** — user con 2 dispositivos puede ver el tour 2 veces.

### 3.10 Reposicionamiento scroll/resize

**Behavior**:
- Listeners `scroll` (passive) + `resize` actualizan `positionTick` signal
- `spotlightRect` computed re-evalúa al cambiar tick
- Listeners cleanup en destroy via DestroyRef

**Análisis**:
- ✓ Reactivo a layout shifts.
- ✓ `passive: true` en scroll evita jank.
- ✓ Cleanup correcto.
- 🟠 **`getBoundingClientRect` en cada tick + scroll** — performance hit si el user scrollea rápido. Throttle/debounce ayudaría.

### 3.11 Auto-scroll al elemento target

**Effect**:
- Cuando step cambia: querySelector + scrollIntoView({ behavior, block:'center' })
- Behavior depende de `prefers-reduced-motion`
- requestAnimationFrame antes de scroll (espera CD)

**Análisis**:
- ✓ **Brillante**: si el elemento target está fuera de viewport, scroll auto.
- ✓ Respeto reduced-motion.
- ✓ rAF previene scroll antes de DOM update.
- 🟢 **Polish UX correcto**.

### 3.12 Spotlights y selectors

**Step 1**: `.lsb a[href="/groups"]`
**Step 2**: `.lsb a[href="/picks/group-stage/predict"]`
**Step 3**: `.lsb a[href="/picks"]`

**Análisis**:
- 🔴 **Selectors hardcoded acoplan al markup del sidebar**. Si la sidebar v3 cambia a `.lsb-v4` o el href se renombra, el tour rompe SILENCIOSAMENTE (sin fallback, sin warning).
- 🟠 **Sidebar tiene comportamiento mobile diferente** — comentario en código menciona "bottom-nav en mobile". El selector `.lsb` debería funcionar en ambos pero **no hay test que lo confirme**.
- 🟠 **`document.querySelector`** sin watcher: si el sidebar carga lazy, el querySelector retorna null al primer tick. El `positionTick` ayuda pero no hay reactive observer del DOM.

---

## 4. Cross-cutting · hallazgos UX (priorizados)

🔴 **Selectors hardcoded** acoplan a markup sidebar.

🔴 **NO usa `cdkTrapFocus`** — único modal sin focus trap.

🔴 **Ring no permite clickear** elemento target (anti-pattern spotlight tours).

🟠 **Voseo "Usá", "encontrás", "tipeas"** (décima+ instancia).

🟠 **Solo 3 steps** — onboarding minimalista.

🟠 **Sin imagen/icon** en body.

🟠 **`!important` mobile** anti-pattern CSS.

🟠 **Card height hardcoded 240** vs body crece.

🟠 **Backdrop 0.62 opacity** débil.

🟠 **Ring padding 6px hardcoded**.

🟠 **Failure silencioso** si querySelector null.

🟠 **getBoundingClientRect en cada scroll tick** sin throttle.

🟠 **`<span></span>` placeholder** layout hack.

🟠 **"Siguiente →" unicode arrow** anti-pattern.

🟠 **Sin reset cross-account** localStorage flag.

🟠 **Sin sync server-side** flag.

🟠 **"Saltar tour"** wording ambiguo.

🟠 **Step 2 "Aquí encontrás"** ambiguo (card vs link).

🟠 **Sin animation entrada card**.

🟠 **Sin click-to-jump** progress dots.

🟡 **Sin tiempo estimado** tour.

🟡 **Sin watcher DOM** sidebar lazy load.

🟡 **Sin contador "queda N paso"**.

🟢 **A11y core**: aria + Escape.

🟢 **prefers-reduced-motion respetado**.

🟢 **Auto-positioning robusto** card.

🟢 **Smooth transitions** ring + card.

🟢 **Storage versioned key**.

🟢 **Cleanup correcto** listeners.

🟢 **Auto-scroll al elemento target**.

🟢 **Mobile bottom-fixed** card.

🟢 **Clip-path spotlight** moderno.

🟢 **passive scroll listener**.

🟢 **SSR safe** typeof window checks.

🟢 **Reactive positionTick** signal.

🟢 **Wording explica QUÉ + DÓNDE**.

🟢 **Progress dots active/done states**.

🟢 **rAF antes de scroll**.

🟢 **try/catch localStorage**.

---

## 5. Antipatrones detectados

| Regla | Violación |
|---|---|
| **DOM-coupled selectors** | `.lsb a[href="/groups"]` rompe con refactor sidebar |
| **No focus trap** | Falta cdkTrapFocus |
| **Spotlight no clickable** | Anti-pattern tours interactivos |
| **!important CSS** | Mobile override |
| **Hardcoded dimensions** | cardHeight, ring padding |
| **Performance** | getBoundingClientRect sin throttle |
| **Layout hacks** | `<span></span>` empty |
| **i18n consistency** | Voseo |
| **Failure silencioso** | querySelector null no warning |
| **No cross-account sync** | localStorage flag stale |

---

## 6. Anclas para el redesign

### Core

1. **Overlay con clip-path spotlight**
2. **3-step tour** con dots progress
3. **Auto-positioning card** con fallbacks
4. **Auto-scroll target** + rAF
5. **prefers-reduced-motion** respeto
6. **localStorage versioned flag**
7. **Mobile bottom-fixed card**
8. **Skip button** prominente
9. **Reactive position tick** scroll/resize

### Quitar

- Voseo "Usá", "encontrás", "tipeas" → decisión tone
- `→` unicode arrow → SVG icon o sin arrow
- `<span></span>` placeholder layout
- `!important` mobile media query → re-estructurar CSS
- Failure silencioso querySelector

### Agregar

- 🔴 **Selectors via data-tour attrs**: `[data-tour="groups-link"]` en lugar de `.lsb a[href]`. Tour code stable, sidebar refactorable.
- 🔴 **cdkTrapFocus** + autoCapture (consistencia con resto modales)
- 🔴 **Permitir click en spotlight element**: cambiar `pointer-events: none` en ring + comportamiento "tour continúa después de click"
- **Fallback warning** si querySelector null: `console.warn` + skip-step o show "Esta sección no está disponible aún"
- **Animation entrada card** (slide-up + fade)
- **Click-to-jump dots** (navegación a step N)
- **Imagen/icon en body** por step
- **Backdrop opacity 0.75** más fuerte
- **Throttle scroll listener** (requestAnimationFrame)
- **Watcher DOM** para sidebar lazy load (MutationObserver del shell)
- **Server-side flag** para cross-device sync
- **Tiempo estimado** (~30s)
- **Step contador** ("Queda 1 paso")
- **Card body length-aware** dimensiones (no hardcoded)
- **Cross-account reset** del flag (al logout limpiar?)
- **Tour analytics**: registrar qué step se dismissan (telemetry para iteración)

### Considerar features

- **Tour multi-feature**: registrar tours separados (post-grupo creado, post-primer-pick, etc.)
- **Tour highlight modal**: si el elemento está en un modal, abrir el modal + scroll
- **Tour gamified**: completar tour da +50 pts onboarding
- **Tour A/B testing**: 3-step vs 5-step vs zero-tour
- **Skip-to-end** option

---

## 7. Resumen ejecutivo

**Surface técnicamente brillante** — único con spotlight pattern, auto-positioning múltiples fallbacks, scroll reposicionamiento reactivo, prefers-reduced-motion, mobile-responsive, storage versioned, cleanup correcto. Lo que falla:

1. 🔴 **Selectors hardcoded al markup**: `.lsb a[href="/groups"]`. Si sidebar refactorea (de v3 a v4, o renombras paths), el tour rompe silenciosamente. Fix: `[data-tour="..."]` data attributes en sidebar.

2. 🔴 **Spotlight no clickable**: el ring tiene `pointer-events: none` permitiendo click pero el tour no responde al click. Anti-pattern para tours interactivos. Pattern correcto: permitir click + tour avanza o cierra dependiendo.

3. 🔴 **NO usa cdkTrapFocus**: único modal sin focus trap. Inconsistencia A11y vs resto modales.

4. 🟠 **Voseo "Usá", "encontrás", "tipeas"**: décima+ instancia documentada. Pattern app-wide.

### 3 decisiones de diseño que cambian todo

1. **Data attributes para tour anchors**: cambiar selectors hardcoded a `[data-tour="anchor-name"]`. El sidebar/shell expone `data-tour` en sus elementos clave, el tour los consume. Refactor de markup no rompe tour.

2. **Spotlight interaction**: definir patrón claro:
   - Opción A (Intro.js): permitir click + tour avanza al next step
   - Opción B (Shepherd): click solo cierra el tour (deja navegar)
   - Opción C: spotlight es solo decorativo, click en backdrop dismisses, tour avanza solo via botones

3. **Tour analytics**: registrar telemetry de qué step se dismissan + completion rate. Sin esto, no sabemos si el tour realmente funciona vs es ruido.

### Cambios secundarios

- cdkTrapFocus (consistency modales)
- Voseo decisión tone
- → unicode arrow → SVG
- `<span></span>` → CSS grid layout
- !important mobile → CSS refactor
- Animation entrada card
- Click-to-jump dots
- Imagen/icon body por step
- Throttle scroll listener
- Watcher DOM lazy sidebar
- Fallback warning querySelector null
- Backdrop 0.75 opacity más fuerte
- Tiempo estimado / contador queda
- Body length-aware sizing

### Considerar features

- Multi-feature tours (post-grupo, post-pick, etc.)
- Modal-aware tour (abre modales)
- Gamified completion
- A/B testing
- Skip-to-end

**Nota retrospectiva**: este surface es **el más técnicamente sofisticado del walkthrough** — auto-positioning, scroll reposicionamiento, clip-path spotlight, prefers-reduced-motion, versioned flag, cleanup correcto. Pero la **fragilidad de los selectors** (`.lsb a[href]`) lo hace **el surface con MÁS riesgo de break invisible** en cualquier refactor de sidebar o navegación. Es crítico el fix con data attributes.
