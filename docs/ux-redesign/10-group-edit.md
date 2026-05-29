# Análisis UX: `/groups/:id/edit` — GroupEditComponent

> Surface #10 del walkthrough. Form de edición de un grupo (admin-only).
> Editable: nombre · descripción · imagen. Read-only: modo de juego · comodines.
> CanDeactivate guard ya wired (Fase C feature).

---

## 1. Identidad

- **Propósito**: editar metadata del grupo (admin-only). Cambios persistidos a backend via `api.updateGroup`.
- **Audiencia**: solo admin del grupo. Non-admin ve empty state.
- **Frecuencia**: baja. Edits ocasionales (cambiar imagen al inicio, ajustar descripción).
- **Entry points**: link "✏ Editar grupo (nombre · descripción · imagen)" desde Acciones admin en `/groups/:id`.

---

## 2. Estructura — mapa general

```
┌──────────────────────────────────────────────────────────┐
│ [page-header]                                            │
│  ├── small "← Volver al grupo" (link a /groups/:id)      │
│  └── h1 "Editar grupo"                                   │
│                                                          │
│ [main container-app]                                     │
│                                                          │
│ [3 estados mutuamente excluyentes]                       │
│  ├── loading: "Cargando…"                                │
│  ├── not-admin: "Solo el admin puede editar…" + ← Volver │
│  └── form (cuando group() && isAdmin())                  │
│      └── [form-card]                                     │
│          ├── h2 "Datos del grupo"                        │
│          ├── lead "El modo de juego (X) es permanente…" │
│          ├── field Nombre (input, 3-40 chars)            │
│          ├── field Descripción (textarea, 500 max)       │
│          ├── field Imagen (preview + file input + hint)  │
│          ├── field Comodines (READ-ONLY, COMPLETE only)  │
│          │   ├── pill verde "🃏 Activados"               │
│          │   │   o pill gris "🃏 Desactivados"           │
│          │   └── text "Esta config se eligió al crear…"  │
│          ├── error message (si error())                  │
│          └── actions: [Guardar cambios] [Cancelar]       │
└──────────────────────────────────────────────────────────┘
```

**Sin tabs internos.** Form simple linear con 3 fields editables + 2 read-only.

---

## 3. Componentes desglosados

### 3.1 Page header

**Render**:
```
← Volver al grupo
Editar grupo
```

**Análisis**:
- ✓ Back link prominente.
- ✓ h1 claro del contexto.
- 🟡 No muestra qué grupo se está editando (solo "Editar grupo" sin "Oficina Q1 2026"). Si user navega entre múltiples edits, pierde contexto.
- 🟡 "← Volver al grupo" como small text — affordance modesta.

### 3.2 Empty state — non-admin

**Render**:
```
Solo el admin del grupo puede editar estos datos.
← Volver
```

**Análisis**:
- ✓ Mensaje claro.
- ⚠ **¿Cómo llega un non-admin acá?** Solo si tipea la URL directamente o tiene un link viejo. La acción "Editar grupo" en `/groups/:id` solo se muestra para admin (`@if (isAdminOfGroup())`). Edge case raro pero válido como guard.
- 🟡 Sin styling consistente — usa `.empty-state` class. Otros surfaces usan `.empty-block` con H3 + p + button.
- 🟡 Sin contexto del grupo ("No sos admin de **Oficina Q1**").

### 3.3 Form card

#### a) Header del card

**Render**:
```
Datos del grupo
El modo de juego (Completo) es permanente y no se puede cambiar.
```

**Análisis**:
- ✓ h2 + lead pattern claro.
- ⚠ **Mode info como lead text** — funciona pero podría ser un badge visual al lado del h2 (más rápido de escanear).

#### b) Field: Nombre

**Render**:
```
Nombre
[Oficina Q1 2026                                ]
3-40 caracteres.
```

**Datos**:
- `name` (string)
- Validación: required, minlength=3, maxlength=40
- `name` field actual + `id="edit-name"` + `for="edit-name"` ✓ (P3 done)

**Análisis**:
- ✓ A11y correctly wired.
- ✓ Validation client-side.
- 🟡 Sin character counter visible ("X / 40").
- 🟡 Sin validation message inline (solo native HTML5 tooltip).

#### c) Field: Descripción

**Render**:
```
Descripción
[textarea, 4 rows, placeholder "Reglas extra, premios, info del grupo…"]
Hasta 500 caracteres. Visible para todos los miembros.
```

**Datos**:
- `description` (string)
- maxlength=500, rows=4
- placeholder con ellipsis (P4.A done)

**Análisis**:
- ✓ Placeholder informativo.
- ✓ Hint clarifica "Visible para todos los miembros" — privacy clear.
- 🟠 **Bug correlacionado (doc 09)**: la description se edita acá y persiste al backend, pero **el detail page `/groups/:id` no la renderiza**. El admin la edita pero ningún miembro la ve. Edit en vacío.
- 🟡 Sin character counter ("X / 500").
- 🟡 Sin support markdown / line breaks visibles en preview.
- 🟡 rows=4 fijo — no autosize.

#### d) Field: Imagen del grupo

**Render**:
```
Imagen del grupo

[120×120 preview if previewUrl()]

[Choose File] [No file chosen]   ← native file input

Subiendo… (durante upload)
  o
Imagen cargada · podés cambiarla
  o
Imagen opcional · JPG/PNG hasta 5 MB
```

**Datos**:
- `previewUrl` (signed URL signal)
- `uploading` flag
- `imageKey` signal (Storage path)
- File input nativo

**Análisis**:
- ✓ Preview muestra imagen actual o nueva.
- ✓ 3 estados de hint comunicados.
- ✓ Disabled durante upload.
- 🔴 **Sin opción "Eliminar imagen"** — el admin que subió por error solo puede reemplazarla con otra, no quitarla (volver a "default icon" con initials).
- 🟠 **File input nativo** (`<input type="file">`) — UI inconsistente con el resto de la app (mostraría "Choose File" estilo navegador).
- 🟠 **Sin drag & drop**.
- 🟠 **Sin crop** — admin sube imagen que se renderiza con `object-fit: cover` (corta sides) sin preview de cómo se verá en card.
- 🟠 **Sin progress bar** durante upload — solo "Subiendo…". Si imagen grande + red lenta, sin feedback.
- 🟠 **5 MB cap mencionado en hint** pero sin validación visible — si user sube 10 MB, ¿qué pasa?
- 🟡 Label "Imagen del grupo" sin `for` — el file input no tiene id asociado (a11y gap).
- 🟡 No hay error específico si upload falla — solo el global `error()` message.

#### e) Field: Comodines (read-only, COMPLETE only)

**Render** (cuando COMPLETE):
```
Comodines

[🃏 Activados] / [🃏 Desactivados]
Esta configuración se eligió al crear el grupo y no se puede modificar.
```

**Análisis**:
- ✓ Información read-only clara.
- ⚠ **Visual heavy** para info read-only: label + pill grande + explicación. Si la info es inmutable, podría ser una pill chica al lado del h2 "Datos del grupo".
- ⚠ "Esta configuración se eligió al crear el grupo" — segunda repetición del concepto "permanente" (lead ya lo dijo para modo). Redundante.
- 🟡 Inline styles para los pills (background, color, border, etc.) — design system inconsistency.
- 🟡 Emoji 🃏 anti-pattern.

#### f) Error message

**Render**:
```
{error()} (color rojo)
```

**Análisis**:
- ✓ Aparece bajo el form si falla save.
- 🟡 Sin `role="alert"` ni `aria-live="polite"` específico (P1 lo agregó al login/register/forgot — acá no).

#### g) Actions

**Render**:
```
[Guardar cambios] [Cancelar]
```

**Datos**:
- Guardar disabled si `saving() || !dirty()`
- Cancelar es link a `/groups/:id`

**Análisis**:
- ✓ **`dirty()` computed disable** — buen UX: el botón está apagado hasta que algo cambia.
- ✓ "Guardando…" label durante save.
- ✓ "Cancelar" link a detail.
- ✓ CanDeactivate guard wired (Fase C) — si user navega away con cambios, ConfirmDialog "Salir sin guardar?".
- 🟡 "Guardar cambios" en mode SIMPLE button. ¿Cambia color a primary verde? Asumido sí pero los styles inline son ad-hoc.
- 🟡 Sin "Reset form" action — si user toca campos pero quiere volver a los valores originales, debe Cancelar + volver a abrir.

---

## 4. Cross-cutting · hallazgos UX (priorizados)

🔴 **Bug correlacionado** (doc 09): description se edita pero detail page no la renderiza. Edit en vacío para miembros.

🔴 **Sin opción "Eliminar imagen"** — solo reemplazar.

🟠 **File input nativo** sin estilo consistente + sin drag&drop + sin crop + sin progress.

🟠 **Empty state non-admin** sin contexto del grupo + styling inconsistente.

🟠 **Page header sin nombre del grupo** — "Editar grupo" sin "de Oficina Q1".

🟠 **Comodines read-only visual heavy** + redundante con lead text "permanente".

🟠 **Sin character counters** en name + descripción.

🟠 **5 MB cap sin validación visible** — comportamiento si user excede no claro.

🟡 **Error message sin `role="alert"`**.

🟡 **Label imagen sin `for`** (a11y gap).

🟡 **Sin "Reset form"** action.

🟡 **Sin autosize textarea**.

🟡 **Sin preview de cómo se ve la imagen** en cards (con `object-fit: cover`).

🟡 **Inline styles** para pills y preview image (design system inconsistency).

🟡 **rows=4 fijo** en textarea sin auto-grow.

🟡 **Emoji 🃏** anti-pattern.

🟡 **Sin support markdown** o line-breaks visibles en descripción.

🟢 **Hint "Visible para todos los miembros"** privacy clear.

🟢 **dirty() compute** disable button.

---

## 5. Antipatrones detectados

| Regla | Violación |
|---|---|
| **Latent bug** (Web Guidelines) | Description editada sin render en detail |
| **CTA missing** | No hay "Eliminar imagen" |
| **Form UX** (ui-ux-pro-max) | File input nativo + sin drag&drop |
| **Empty state polish** | Non-admin sin contexto |
| **Visual consistency** | Inline styles vs design tokens |
| **Image upload polish** | Sin progress, sin crop, sin preview cómo se ve |
| **A11y** | Label imagen sin `for`, error sin role="alert" |
| **CTA labels** | "Guardar cambios" OK, "Cancelar" OK; falta "Restablecer" |
| **no-emoji-icons** | 🃏 |

---

## 6. Anclas para el redesign

### Core

1. **Form simple** con 3 fields editables
2. **Read-only badges** para mode + comodines (compactos)
3. **Image preview con upload UX rich** (drag&drop, crop, progress)
4. **CanDeactivate guard** (ya wired)
5. **Dirty-aware Guardar button**

### Quitar

- File input nativo → custom uploader
- Comodines field heavy → pill compacto en header
- Lead text "permanente" + comodines text repeat (consolidar a 1 lugar)
- Emoji 🃏 → SVG
- Inline styles → classes

### Agregar

- **Description render en detail page** (bug fix B2)
- **Eliminar imagen** option (volver a default initials)
- **Drag & drop image upload**
- **Image crop / preview con object-fit**
- **Progress bar durante upload**
- **Character counter** en name + description
- **Validation 5MB cap** visible (mensaje de error claro si excede)
- **Page header con nombre del grupo** ("Editar Oficina Q1 2026")
- **role="alert"** en error message
- **Label imagen con for**
- **Autosize textarea** o rows dinámicos
- **Markdown / line-breaks** support visible
- **Reset form** action
- **Field grouping** visual (sección "Identidad" para name + image, sección "Detalle" para description, sección "Settings" para mode + comodines read-only)

### Bug fix

- **Description render en `/groups/:id`** (D9 bug — admin la edita pero miembros no la ven)
- **Add `aria-label` o `for` al file input**
- **Error message con `role="alert"`**

---

## 7. Resumen ejecutivo

**Surface simple y funcional pero con 3 mejoras claras:**

1. 🔴 **Bug B2 correlacionado**: la description editada acá no se renderiza en `/groups/:id`. **Field invisible** para miembros — el admin edita en vacío.

2. 🟠 **Image upload UX básico**: file input nativo, sin drag&drop, sin crop, sin progress, sin opción eliminar. Para una app que valora la personalización del grupo (custom logo), el upload UX es flojo.

3. 🟠 **Comodines field heavy** para info read-only. Pill compacto en el header del card sería más limpio.

### 3 decisiones de diseño que cambian todo

1. **Bug fix description**: agregar render de description en `/groups/:id` (debajo del hero o en una sección dedicada). Sin esto, el field es decorativo.

2. **Image upload rich**:
   - Drag & drop area (mantener file input como fallback)
   - Crop con preview de cómo se verá en card (object-fit: cover)
   - Progress bar real durante upload
   - "Eliminar imagen" option para volver a initials default
   - Validation 5MB cap visible (con error message claro)

3. **Form structure refinado**:
   - Page header con nombre del grupo ("Editar Oficina Q1 2026")
   - Field grouping: Identidad (name + image) / Detalle (description) / Settings read-only (mode + comodines como pills compactos en el header)
   - Character counters en name + description
   - Reset form action
   - role="alert" en error

### Cambios secundarios

- Empty state non-admin con contexto y CTAs consistentes con el resto de la app
- Eliminar inline styles → design tokens / classes
- Autosize textarea
- Markdown support en description (al menos line breaks)
- SVG icons en lugar de emojis
- Field for / aria-labels completos en file input

**Polish overall**: este surface es **80% del camino** — el form funciona, save funciona, CanDeactivate guard funciona. Lo que falta es polish en el image upload + el bug fix de description.
