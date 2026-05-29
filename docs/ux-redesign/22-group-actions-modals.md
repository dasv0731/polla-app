# Análisis UX: Modales de Group Actions — GroupActionsModalsComponent

> Surface #22 del walkthrough. 2 modales globales: **Crear grupo** + **Unirme con código**.
> Disparados desde múltiples surfaces (onboarding, home, groups-list, sidebar, empty states) via `GroupActionsService` (`providedIn:'root'`).
> Post Fase B: campo "Descripción" agregado al crear (pero bug B2 — no se renderiza en detalle).

---

## 1. Identidad

- **Propósito**: punto único de entrada para las 2 acciones más críticas del growth loop (crear grupo nuevo, unirse a grupo existente).
- **Audiencia**: cualquier user autenticado.
- **Frecuencia**: alta — disparados desde ~6 surfaces diferentes (sidebar, onboarding, home, groups list, group empty states, comodines empty state).
- **Entry points**: cross-route trigger via `GroupActionsService.openCreate()` / `openJoin()`. El service expone signals `createOpen` / `joinOpen` que la shell escucha.

---

## 2. Estructura — 2 modales independientes en mismo componente

```
GroupActionsModalsComponent (mounted in shell)
        │
        ├─► svc.createOpen() ────► Modal "Crear grupo"
        │                          - name (max 50)
        │                          - description (max 500)
        │                          - mode SIMPLE/COMPLETE
        │                          - comodinesEnabled (solo COMPLETE)
        │                          → createGroup → toast → /groups/:id
        │
        └─► svc.joinOpen() ──────► Modal "Unirme con código"
                                   - code 6 chars uppercase A-Z 0-9
                                   → joinGroup → toast → /groups/:id
```

**Render condicional** con `@if (svc.createOpen())` y `@if (svc.joinOpen())`. **Solo uno visible a la vez** (`closeAll()` antes de abrir cualquiera).

---

## 3. Modal A · Crear grupo

### 3.1 Backdrop + container

**Render**:
```css
.picks-modal {
  background: rgba(10, 10, 10, 0.75);
  backdrop-filter: blur(6px);
}
.picks-modal__card {
  max-width: 520px;
  border-radius: 16px;
  padding: 28px;
}
```

**A11y**:
- `role="dialog"`, `aria-modal="true"`, `aria-labelledby="create-group-title"`
- `cdkTrapFocus [cdkTrapFocusAutoCapture]="true"` (P0 done)
- `(keydown.escape)="closeCreate()"` (P0 done)
- Backdrop click close via `.picks-modal__close-overlay`

**Análisis**:
- ✓ **A11y completo**: focus trap + Escape + aria.
- ✓ Backdrop oscuro + blur (visualmente moderno).
- ✓ Border-radius generoso (16px).
- 🟡 Sin **animation entrada/salida** (modal aparece instantáneo).
- 🟡 `!important` en muchos styles — overriding global `.picks-modal` styles. Anti-pattern.

### 3.2 Header

**Render**:
```
Crear grupo                              [✕]
Privado, con código de invitación de 6 caracteres
```

**Análisis**:
- ✓ Title + meta line setup expectativas.
- ✓ Botón close con `aria-label="Cerrar"`.
- 🟠 **Close button con `✕` unicode** — anti-pattern.
- 🟠 **Meta line en verde uppercase 11px letter-spacing 0.08em** — es estilo "kicker" pero **ANTES del título** rompe la convención visual (kicker normalmente va arriba pequeño, título grande abajo). Aquí está al revés: título grande arriba, meta debajo.
- 🟡 "Privado" — implícito porque todos los grupos son privados; no agrega info útil.

### 3.3 Campo Nombre

**Render**:
```
Nombre del grupo
[Oficina Q1 2026___________________]
```

**Datos**:
- maxlength=50
- required
- autocomplete=off
- disabled durante loading

**Análisis**:
- ✓ Maxlength 50 razonable.
- ✓ Placeholder con ejemplo concreto ("Oficina Q1 2026").
- ✓ Disabled during loading.
- 🟠 **Sin character counter** ("12/50"). UX standard para inputs con maxlength.
- 🟠 **Sin live duplicate check** vs otros grupos del user.
- 🟡 Sin auto-focus en open del modal.
- 🟡 Sin trim live (espacios al inicio se permiten).

### 3.4 Campo Descripción (Fase B)

**Render**:
```
Descripción (opcional)
[Reglas extra, premios, info…]
[textarea rows=2]
Hasta 500 caracteres. Visible para todos los miembros.
```

**Datos**:
- maxlength=500
- rows=2
- resize:vertical, min-height:56px
- helper text explicativo

**Análisis**:
- ✓ Optional marcado claramente.
- ✓ Placeholder con ejemplos útiles.
- ✓ Helper text explica visibility ("Visible para todos").
- ✓ Resize vertical permite expandir.
- 🔴 **BUG B2 latente** (ya documentado en docs 09, 10): description se envía y se persiste, pero el detalle del grupo (`/groups/:id`) NO la renderiza. **El user llena un campo que nadie ve después.**
- 🟠 **Sin character counter** ("128/500").
- 🟠 **Sin markdown support** ni preview — para "Reglas extra" un textarea plain limita.
- 🟡 Sin auto-resize basado en contenido.

### 3.5 Selector "Modo de juego"

**Render**:
```
Modo de juego

┌──────────────────────────────────────────┐
│ ◉ Modo completo                          │
│   Marcadores + tabla + bracket + picks   │
│   especiales. Cuenta para el ranking     │
│   global.                                │
└──────────────────────────────────────────┘
┌──────────────────────────────────────────┐
│ ○ Modo simple                            │
│   Solo tabla de grupos, bracket y picks  │
│   especiales. No cuenta para el ranking  │
│   global.                                │
└──────────────────────────────────────────┘

Esta elección es permanente — no se puede cambiar después.
```

**Análisis**:
- ✓ **Cards con explicación** del diferencial.
- ✓ Border highlight cuando seleccionado.
- ✓ **Warning permanencia** ("permanente — no se puede cambiar") en bold.
- ✓ Radio buttons con accent-color verde.
- 🟠 **Sin recomendación default visual** — el `mode().set('COMPLETE')` está en código, pero el user no sabe que ese es "el recomendado". Etiqueta "(recomendado)" ayudaría.
- 🟠 **Diferencial confuso**: ambos modos mencionan "tabla de grupos" + "bracket" + "picks especiales". La diferencia real está enterrada en "Marcadores" + "ranking global". User no fluido necesita más contexto.
- 🟠 **"ranking global"** — sin contexto de qué es. Si user es nuevo, no sabe que existe.
- 🟠 **"No se puede cambiar"** sin explicación de POR QUÉ — molesto si el user duda.
- 🟡 Sin link "Comparar modos en detalle" para users indecisos.

### 3.6 Checkbox "Activar comodines" (solo COMPLETE)

**Render** (visible solo si mode==='COMPLETE'):
```
☑ Activar comodines
   Los miembros pueden ganar comodines vía sponsors/sweeps
   y aplicarlos en este grupo. Si está OFF, el grupo es
   modo completo pero sin comodines.
```

**Análisis**:
- ✓ Disclosure progresivo (solo aparece cuando relevante).
- ✓ Description explícita.
- ✓ Default checked (línea 306: `comodinesEnabled = signal(true)`).
- 🟠 **"sponsors/sweeps"** — jerga internal. El user no sabe qué son sweeps. Probablemente significa "sorteos" o "promociones".
- 🟠 **"Si está OFF" + "modo completo pero sin comodines"** — wording torpe. Mejor: "Sin comodines, el grupo solo usa marcadores y picks tradicionales."
- 🟡 Sin link "Ver tipos de comodines" para users curiosos.

### 3.7 Error block

```
{error()} (role=alert)
```

✓ role="alert" (P1 done).
✓ Posición consistente antes del footer.
🟡 Wording de errors viene de `humanizeError()` (helper de domain-errors).

### 3.8 Footer

**Render**:
```
Te asignamos como admin del grupo  [Cancelar] [Crear grupo]
```

**Análisis**:
- ✓ Meta info izquierda explica consecuencia ("Te asignamos como admin").
- ✓ 2 botones acción a la derecha (cancel + primary).
- ✓ Loading state "Creando…".
- ✓ Disabled si `loading() || !name.trim()`.
- 🟠 **Meta info NO es action-able** — puede mejor decir "Después podrás transferir admin a otro miembro" para informar también de la salida.
- 🟡 Cancelar disabled durante loading — bien, pero sin spinner indicator visible.

### 3.9 Post-create

**Behavior**:
1. createGroup() success
2. `toast.success("Grupo X creado")`
3. closeAll() + resetCreate()
4. refreshUserModes() para sincronizar sidebar/dropdown
5. navigate `/groups/:id`

**Análisis**:
- ✓ **UX completo**: toast + close + cache refresh + navigate.
- ✓ Cache refresh post-mutación correcto.
- 🟢 Pattern bien implementado.
- 🟡 Sin **animation transition** entre cierre modal y navegación.

---

## 4. Modal B · Unirme con código

### 4.1 Header

**Render**:
```
Unirme con código                        [✕]
Pegá el código de 6 caracteres que te compartieron
```

**Análisis**:
- ✓ Title + meta line.
- 🟠 **"Pegá" voseo argentino** — sexta instancia documentada.
- 🟠 **Close `✕` unicode** anti-pattern (mismo issue).

### 4.2 Input código (especial)

**Render**:
```
Código de invitación
[ A B C D 2 3 ]    (font display 24px letter-spacing 8px center upper)
El código se lo das a un admin de grupo.
```

**Behavior**:
- maxlength=6
- onCodeInput transforma: uppercase + filter [A-Z0-9] + slice 6
- Disabled during loading

**Análisis**:
- ✓ **Visual treatment fuerte**: Bebas Neue 24px, letter-spacing 8px, centrado, uppercase. **Se siente como un código real**.
- ✓ Validation live: solo permite A-Z y 0-9.
- ✓ Auto-uppercase.
- ✓ Helper text guía al user a pedir el código.
- 🟠 **Sin paste detection / format guide**: si el user pega "ABCD23 " con espacio o "abcd23-XYZ" extra, los chars ilegales se filtran silenciosamente. No hay feedback de "se eliminaron espacios".
- 🟠 **Sin separación visual A-B-C-D-2-3** — el letter-spacing ayuda pero un format `ABC-D23` o 6 boxes individuales sería más como OTP del register.
- 🟠 **Sin contador visible "X / 6"** durante input.
- 🟠 **"El código se lo das a un admin de grupo"** — wording confuso. Probablemente significa "El código te lo da un admin de grupo" (reversed). **Posible typo**.
- 🟡 Sin live preview del grupo (vs `/groups/join/:code` que SÍ hace preview).
- 🟡 Sin auto-submit al 6º char.

### 4.3 Error block

```
{error()}  (sin role=alert)
```

🔴 **`role="alert"` FALTA aquí** (línea 174, vs línea 115 en crear grupo). **Inconsistencia A11y intra-component**.

### 4.4 Footer

**Render**:
```
[empty]                            [Cancelar] [Unirme]
```

**Análisis**:
- ✓ Loading state "Validando…".
- ✓ Disabled si `code.length !== 6`.
- 🟠 **Meta info izquierda vacía** (line 179: `<span class="meta"></span>`). Vs crear grupo que tiene "Te asignamos como admin". Inconsistencia + espacio desperdiciado.

### 4.5 Post-join

**Behavior**:
1. joinGroup() success
2. `toast.success("¡Te uniste al grupo!")`
3. closeAll() + resetJoin()
4. refreshUserModes()
5. navigate `/groups/:id` (o `/groups` si no hay id)

**Análisis**:
- ✓ Similar a create.
- ✓ Fallback a `/groups` si id missing.
- 🟠 **El joinGroup no hace preview** — si el código es válido pero el grupo está full o user ya es miembro, recibe error que humanizeError formatea. Pero NO ofrece el rich preview que `/groups/join/:code` sí da. **2 paths diferentes para la misma acción** con UX divergente.

---

## 5. Cross-cutting · hallazgos UX (priorizados)

🔴 **BUG B2 latente**: description se guarda pero no se muestra en `/groups/:id`.

🔴 **`role="alert"` FALTA** en error del modal Unirme.

🔴 **Typo wording**: "El código se lo das a un admin" debería ser "te lo da".

🟠 **2 paths para unirse al grupo** con UX divergente:
- `/groups/join/:code` (deep-link): preview + stats + rich error states
- Modal Unirme: input + error genérico, sin preview
**Inconsistencia funcional**.

🟠 **`✕` close button** unicode anti-pattern (ambos modales).

🟠 **Meta line en verde uppercase** rompe convención kicker.

🟠 **Sin character counter** en name (50), description (500), code (6).

🟠 **Sin recomendación visual** "Modo completo (recomendado)".

🟠 **Diferencial de modos confuso** ("ranking global" sin contexto).

🟠 **"sponsors/sweeps"** jerga internal.

🟠 **"No se puede cambiar"** sin explicar por qué.

🟠 **"Pegá" voseo** (sexta instancia).

🟠 **Sin auto-focus** en open del modal.

🟠 **Sin animation entrada/salida** modales.

🟠 **`!important` overrides** masivos en CSS.

🟠 **Meta footer vacío** en modal Unirme (inconsistencia).

🟠 **Bug B2 latente** — campo description sin render en detalle.

🟡 **Sin live duplicate check** del nombre.

🟡 **Sin markdown** en description.

🟡 **Sin auto-resize textarea**.

🟡 **Sin live preview** del grupo en modal Unirme.

🟡 **Sin format hint** del código pegado.

🟡 **Sin contador visual "X/6"** en código.

🟡 **Sin auto-submit** al 6º char.

🟡 **Sin link "Comparar modos"** para indecisos.

🟡 **Sin link "Ver tipos de comodines"** para curiosos.

🟢 **A11y crear**: focus trap + aria + Escape + role=alert.

🟢 **Backdrop click close**.

🟢 **Cache refresh post-mutación**.

🟢 **Toast feedback**.

🟢 **Disclosure progresivo** comodines solo en COMPLETE.

🟢 **Visual treatment código** (Bebas + letter-spacing).

---

## 6. Antipatrones detectados

| Regla | Violación |
|---|---|
| **no-emoji-icons** | ✕ close (ambos), * unicode si hubiera |
| **Inconsistencia a11y intra-component** | role=alert solo en uno de los 2 errors |
| **Data leak / dead-end** | Description bug B2 |
| **Wording errors** | "se lo das" typo |
| **Path divergence** | join modal vs /groups/join/:code |
| **!important overrides** | CSS overrides global styles |
| **Sin character counters** | En 3 inputs con maxlength |
| **Sin animation modal** | Aparece/desaparece instantáneo |
| **Jerga internal** | "sweeps" |
| **i18n consistency** | "Pegá" voseo |
| **Sin auto-focus modal** | UX standard violado |
| **Meta footer asimétrica** | Crear tiene, Unirme vacía |

---

## 7. Anclas para el redesign

### Core

1. **2 modales independientes** mismo componente
2. **GroupActionsService** signals cross-route
3. **A11y completo** (focus trap, aria, Escape, backdrop close)
4. **Mode selector** con cards visuales
5. **Comodines disclosure** progresivo
6. **Code input visual treatment** Bebas + letter-spacing
7. **Toast + refresh + navigate** post-success
8. **Backdrop blur** dark

### Quitar

- ✕ unicode → SVG icon
- "sweeps" jerga
- "Pegá" voseo
- `!important` overrides
- Typo "se lo das" → "te lo da"
- Meta footer vacío (o llenar simétricamente)

### Agregar

- **Fix bug B2**: renderizar description en `/groups/:id`
- **role="alert"** en error del modal Unirme
- **Character counters** en name (12/50), description (128/500), code (X/6)
- **Auto-focus** primer input al open
- **Animation entrada/salida** modales (scale+fade)
- **"Modo completo (recomendado)"** etiqueta
- **Link "Comparar modos"** o tooltip con tabla diferencial
- **Live duplicate check** name vs otros grupos del user
- **Auto-resize textarea** description
- **Markdown soporte** description (mínimo bold/italic/links)
- **Live preview grupo** en modal Unirme (consolidar con /groups/join/:code)
- **Auto-submit código** al 6º char
- **Format hint** "Se eliminaron espacios y caracteres no válidos" si user pegó algo
- **"Sin comodines"** vs "Activar comodines" — reescribir wording
- **"Después podrás transferir admin"** info contextual en footer crear
- **Link "Ver tipos de comodines"** opcional

### Considerar

- **Consolidar Modal Unirme con `/groups/join/:code`**:
  - Hoy: 2 paths (modal sin preview, deep-link con preview)
  - Mejor: modal abre → input código → submit → muestra preview inline → confirm
  - O: modal redirige a `/groups/join/:code` con el código (single path)
- **¿Quitar el modal crear y mover a página dedicada?** Form de 4 fields + cards + checkbox es complejo para modal. Quizás página standalone con back link sería más respirado.

---

## 8. Resumen ejecutivo

**Modales bien implementados técnicamente** (A11y, cache refresh, toast, validation), pero arrastran issues estructurales y de wording. Los gaps principales:

1. 🔴 **Bug B2 description**: el campo más nuevo (Fase B) no se renderiza en `/groups/:id`. **Eslabón roto del flow**.

2. 🔴 **role="alert" inconsistente**: crear tiene, unirse no. A11y degradado a la mitad.

3. 🔴 **Typo "se lo das"**: probablemente "te lo da". Si soy correcto, este es **error de copy en producción**.

4. 🟠 **2 paths para unirse divergentes**: modal sin preview vs `/groups/join/:code` con preview rich. **Inconsistencia funcional**. Un user que pega código en modal recibe error si grupo está lleno, pero un user que abre deep-link ve sub-state "Grupo lleno" con sugerencias. Mismo problema, UX diferente.

### 3 decisiones de diseño que cambian todo

1. **Fix bug B2 + render description**: crítico. Sin renderizar el campo, el user llena un form fantasma.

2. **Consolidar paths join**: una opción es hacer que el modal "Unirme con código" hooke a `/groups/join/:code` (navigate post-input) para tener UN solo flow con preview rich. La otra es duplicar el preview lambda al modal. La primera es más limpia.

3. **Tone fix wording**: 6ª instancia voseo + typo "se lo das" + jerga "sweeps" — todos en un solo componente. **Esto es señal de necesitar una guía de redacción centralizada**.

### Cambios secundarios

- ✕ → SVG icon
- Character counters (3 inputs)
- Auto-focus modal open
- Animation entrada/salida
- "(recomendado)" en COMPLETE
- Comparativo modos
- "ranking global" contexto
- "Comodines OFF" wording
- Live duplicate check name
- Markdown description
- Auto-resize textarea
- Format hint code paste
- Auto-submit code al 6º
- Meta footer simétrica
- `!important` cleanup CSS

**Nota retrospectiva**: estos modales son **el corazón del growth loop conversacional**. Cualquier user nuevo pasa por al menos uno de los 2 en su primera sesión. El polish acá tiene **alto impacto en conversión**. El bug B2 + typo + duplicate path con divergencia funcional son señales de que el surface evolucionó orgánicamente sin consolidación. Es un buen candidato para **refactor consolidado** post-walkthrough.
