# Análisis UX: Trivia Toast — TriviaToastComponent

> Surface #33 del walkthrough. Banner top contextual cuando hay trivia live.
> Complementa al trivia-popup (doc 23) + FAB pill (en popup).
> Backed by TriviaModalService que el popup actualiza vía effect.

---

## 1. Identidad

- **Propósito**: notificar al user que hay trivias pendientes que pueden ganar comodín, sin requerir que mire al FAB.
- **Audiencia**: users con `hasComplete()` + preguntas live no respondidas + modal cerrado.
- **Frecuencia**: aparece dinámicamente cuando hay trivias activas durante matches.
- **Posición**: top de la pantalla (no fixed — está dentro del shell flow), alineado con main content (`margin-left: 64px` desktop).

---

## 2. Estructura

**Visible solo si**:
- `count > 0` (hay trivias pending)
- `!isOpen` (modal trivia cerrado)

```
[Sidebar 64px]│ Top banner negro 36px alto                           │
                ● Nueva trivia disponible · 2 preguntas para ganar
                comodín · Responder →
              │                                                       │
              │           Main content                                │
```

**Mobile <768px**: full-width, sin margin-left.

---

## 3. Componentes desglosados

### 3.1 Container

**CSS**:
```css
.trivia-toast {
  margin-left: 64px;
  background: #0a0a0a;
  color: #fff;
  border-bottom: 1px solid rgba(2,204,116,0.4);
  padding: 8px 24px;
  text-align: center;
  font-size: 12px;
  display: flex;
  justify-content: center;
  gap: 10px;
}
```

**A11y**:
- ✓ `role="status"` + `aria-live="polite"` — SR-friendly announcement.

**Análisis**:
- ✓ **A11y correcto**: status + aria-live polite (no spam).
- ✓ Brand identity #0a0a0a + verde glow brand consistency.
- ✓ Border-bottom verde 40% delineación visual.
- ✓ Flex center alignment.
- 🔴 **`margin-left: 64px` hardcoded igual que shell** — hereda el mismo bug del sidebar overlap: si sidebar expande a 200px on hover, banner NO se mueve → overlap visible.
- 🟠 **Sin margen vertical** — banner toca el contenido siguiente sin breathing room.
- 🟠 **Sin animación entrada/salida** — aparece/desaparece instant cuando count cambia.
- 🟡 Sin `display: contents` en host? Actually sí está (línea 30).

### 3.2 Dot pulse animation

**CSS**:
```css
.trivia-toast__dot {
  width: 8px; height: 8px;
  border-radius: 50%;
  background: var(--color-primary-green);
  animation: trivia-toast-pulse 1.5s infinite;
}
@keyframes trivia-toast-pulse {
  0%, 100% { transform: scale(1); opacity: 1; }
  50% { transform: scale(1.5); opacity: 0.6; }
}
```

**Análisis**:
- ✓ **Pulse animation** = attention-grabbing pero no agresivo.
- ✓ 1.5s ciclo (no muy rápido, no muy lento).
- ✓ `aria-hidden="true"` correcto.
- 🔴 **Sin `@media (prefers-reduced-motion: reduce)` respect** — el dot sigue pulsando aunque user tenga reduced motion ON. **Anti-pattern A11y**.
- 🟠 **Scale 1.5x + opacity 0.6** — el dot crece hasta 12×12px. Si user es sensitive a movement, distrae.

### 3.3 Text

**Render**:
```
Nueva trivia disponible · 2 preguntas para ganar comodín ·
```

**Análisis**:
- ✓ Wording claro: "Nueva trivia disponible".
- ✓ Plural handling: "1 pregunta" / "2 preguntas".
- ✓ Specifies reward: "para ganar comodín".
- 🟠 **"·" como separador**: 3 instancias (entre "disponible · 2", "comodín ·"). Visualmente raro tener separador antes del link.
- 🟠 **"para ganar comodín"** — implica TODAS las trivias dan comodín. Pero las non-sponsored solo dan +10 pts. **Wording engañoso si hay mix**.
- 🟡 **Mensaje single-line** — si count crece (10+ trivias), se siente desproporcionado.

### 3.4 Link "Responder →"

**Render**:
```
Responder →
```

**Behavior**:
- `(click)="open()"` → `trivia.open()`

**Análisis**:
- ✓ Verb específico ("Responder").
- ✓ Color verde brand.
- 🔴 **`<a>` sin `href`** — anti-pattern semántico. Debería ser `<button>` porque NO navega, ejecuta acción. A11y screen reader anuncia "Responder, link" pero no es link.
- 🔴 **`(click)` en `<a>` sin href**: tab focus no funciona, Enter key no funciona, A11y violation.
- 🟠 **`→` unicode arrow** anti-pattern.
- 🟠 **Sin keyboard accessibility** (no focusable como `<a>` sin href).

### 3.5 Service integration

**Behavior**:
- `count = computed(() => this.trivia.pendingCount())`
- `visible = computed(() => count() > 0 && !isOpen())`

**Análisis**:
- ✓ Reactive — auto-aparece cuando count > 0 + modal cerrado.
- ✓ Auto-hide cuando modal se abre (no duplicar prompts).
- ✓ Service-driven (cohesion baja con popup).
- 🟢 Pattern correcto.

### 3.6 No dismiss button

**Observación**: el banner NO tiene botón "X" para cerrar/dismissear.

**Análisis**:
- 🔴 **Sin dismiss option** — si el user no quiere ver el banner, debe abrir el modal (open) o responder/saltar. **No tiene un "Más tarde" o "Cerrar"**.
- 🔴 **El user puede sentirse nagged**: el banner aparece cada vez que la cola se actualiza con preguntas live. Si trivia auto-open trivia está OFF en prefs pero el banner no la respeta, **doble notif (banner + modal manual)**.

---

## 4. Cross-cutting · hallazgos UX (priorizados)

🔴 **`margin-left: 64px` overlap bug** sidebar hover.

🔴 **Pulse sin `prefers-reduced-motion`** respect.

🔴 **`<a>` sin href ni keyboard support** — A11y violation.

🔴 **Sin dismiss button** — nagging potencial.

🟠 **"para ganar comodín" wording engañoso** si mix sponsored/non.

🟠 **`→` unicode arrow** anti-pattern.

🟠 **"·" separator antes del link** raro.

🟠 **Sin animation entrada/salida**.

🟠 **Sin breathing room** vertical entre banner y contenido siguiente.

🟠 **Pulse scale 1.5x** puede distraer sensitive users.

🟡 **Single-line message** desproporcionado con count alto.

🟢 **A11y status + aria-live polite**.

🟢 **Plural handling correcto**.

🟢 **Wording claro** del propósito.

🟢 **Auto-hide cuando modal open**.

🟢 **Reactive service-driven**.

🟢 **Brand identity dark + verde**.

🟢 **Dot pulse animation** attention sutil.

🟢 **`aria-hidden` en decorative dot**.

🟢 **Mobile responsive** (margin-left 0).

---

## 5. Antipatrones detectados

| Regla | Violación |
|---|---|
| **Layout overlap** | margin-left 64px vs sidebar hover |
| **prefers-reduced-motion** | Pulse no respeta OS setting |
| **`<a>` semantic** | Sin href + click handler |
| **No keyboard support** | No focusable, no Enter |
| **no-emoji-icons** | → unicode arrow |
| **No dismiss option** | Banner nagging |
| **Wording precisión** | "comodín" para non-sponsored |
| **No animation transition** | Aparece/desaparece instant |
| **No vertical breathing** | Banner pegado al main |

---

## 6. Anclas para el redesign

### Core

1. **Top banner contextual**
2. **Service-driven visibility** (count + !isOpen)
3. **A11y status + aria-live polite**
4. **Plural handling**
5. **Brand identity** dark + verde glow
6. **Mobile responsive** margin-left 0
7. **Dot pulse animation** attention sutil
8. **Auto-hide cuando modal open**

### Quitar

- → unicode arrow → SVG
- `<a>` sin href → `<button>`
- "para ganar comodín" wording engañoso → wording neutro

### Agregar

- 🔴 **`prefers-reduced-motion` respect**: animation paused/none si user prefers reduce
- 🔴 **CSS variable `--sidebar-w`** consistente con shell (no `margin-left: 64px` hardcoded)
- 🔴 **`<button>` keyboard accessible** + Enter trigger
- 🔴 **Dismiss button "X"** con localStorage cooldown (no-show por 1h o hasta nuevo match live)
- **Animation entrada/salida** (slide-down + fade)
- **Wording dinámico** según tipo: "Responder · gana comodín" si sponsored, "Responder · +10 pts" si no
- **Breathing room** vertical (margin-bottom 4-8px)
- **Pulse animation toggle** controlado por prefers-reduced-motion
- **Multi-line layout** si count > 3 ("Tenés 5 trivias pendientes · Responder")

### Considerar

- **Notif badge en sidebar bell** además del banner (visible aún si dismissed)
- **Toast sidebar slide-in** alternativa al banner top (menos invasive)
- **Sound notification** cuando aparece (respect prefs sounds toggle)
- **Auto-dismiss after N seconds** si user no interactúa

---

## 7. Resumen ejecutivo

**Banner contextual minimalista, bien diseñado en concepto** — A11y status + aria-live polite, plural handling, reactive service-driven, auto-hide cuando modal open. Lo que falla:

1. 🔴 **Bug `margin-left: 64px` overlap**: hereda el mismo issue documentado en shell-nav. Sidebar hover → 200px, banner se queda en 64px → overlap.

2. 🔴 **Pulse sin `prefers-reduced-motion`**: users con OS-level reduce motion siguen viendo el dot pulsando.

3. 🔴 **`<a>` sin href**: anti-pattern semántico + keyboard inaccessible.

4. 🔴 **Sin dismiss option**: banner nagging si user no quiere responder ahora.

### 3 decisiones de diseño que cambian todo

1. **`<button>` en lugar de `<a>` sin href**: 1 línea de markup change, A11y + keyboard fix.

2. **prefers-reduced-motion**: 3 líneas de CSS, respeta accessibility universally.

3. **Dismiss button + cooldown**: user agency. Banner reaparece tras nuevo match live o N minutos de cooldown.

### Cambios secundarios

- → unicode → SVG
- CSS variable `--sidebar-w` (consistente con shell fix)
- Wording dinámico según tipo trivia
- Animation entrada/salida
- Breathing room vertical
- Multi-line si count alto

### Considerar features

- Notif badge sidebar bell (redundancia visual)
- Toast slide-in alternative
- Sound on appear (respect prefs)
- Auto-dismiss after N seconds

**Nota retrospectiva**: surface **compacto y bien diseñado en concepto** (~80 líneas). Sus 4 issues serios son **fixes triviales** (1-3 líneas cada uno). ROI alto por inversión mínima. Bug del `margin-left` está acoplado al fix global del shell — resolverlo aquí también resuelve el sidebar overlap.
