# Análisis UX: `/picks/group-stage/predict` — GroupStagePicksComponent standalone

> Surface #6 del walkthrough. Vista standalone del editor de predicción de grupos.
> El **mismo component** se renderiza embebido en `/picks/group-stage` (tab "Mi predicción") — análisis del cuerpo (gs-layout, drag&drop, sidebar terceros) ya está en doc 04.
> Este doc se enfoca en lo **específico de la versión standalone**: header propio, mode switch, header text, y la **decisión crítica de consolidación de rutas**.

---

## 1. Identidad

- **Propósito**: editar la predicción de fase de grupos (orden 1° al 4° de cada uno de los 12 grupos + 8 mejores 3eros). Misma funcionalidad que el embed pero con header propio.
- **Audiencia**: igual que doc 04 — user en setup pre-torneo.
- **Frecuencia**: alta pre-torneo, nula durante/post (read-only).
- **Entry points**:
  - **Sidebar "Mundial 2026"** (el más visible)
  - Link "Ir a tabla de grupos →" desde empty state de `/picks/bracket`
  - Link "Editar mi predicción →" que era code-dead (limpiado en Fase A)
  - Deep-link directo

---

## 2. Estructura — mapa general

```
┌──────────────────────────────────────────────────────────┐
│ HEADER PROPIO (page-header)                              │
├──────────────────────────────────────────────────────────┤
│ [page-header__title]                                     │
│  ├── small "Predicciones · fase de grupos"               │
│  └── h1 "Tabla final por grupo"                          │
│                                                          │
│ [empty state SI no hay grupos privados]                  │
│  └── "Necesitas pertenecer a al menos un grupo…          │
│      [Crea uno →]"                                       │
│                                                          │
│ [mode switch SI > 1 modo disponible]                     │
│  └── wf-seg con role="tablist"                          │
│      ├── Modo completo                                   │
│      └── Modo simple                                     │
│                                                          │
│ [mode info SI mode() seleccionado]                       │
│  └── "Predicción modo X. Cuenta para Y."                 │
│                                                          │
│ [lock status]                                            │
│  ├── SI lockedAt: "Las predicciones se cerraron…         │
│  │   Solo lectura."                                      │
│  └── SI NO lockedAt: "Arrastra los equipos… Los          │
│      cambios se guardan automáticamente… Pulsa           │
│      'Guardar en la base'…"                              │
└──────────────────────────────────────────────────────────┘

[CONTENIDO PRINCIPAL]
└── gs-layout (1fr + 320px sidebar desktop)
    ├── gs-groups: 12 cards drag&drop  ← ya analizado en doc 04 §5.3
    └── gs-sidebar: Mejores 3eros        ← ya analizado en doc 04 §5.3
```

**El cuerpo es 100% idéntico al embedded en `/picks/group-stage`**. La única diferencia es el header propio y la ausencia de las page-tabs Cronológico/Tabla grupos/Bracket.

---

## 3. Las 2 formas de acceder al mismo componente

| Path | Aterriza en | Renderiza |
|---|---|---|
| **Sidebar "Mundial 2026"** | `/picks/group-stage/predict` | Standalone: solo el component con su header propio |
| **Page-tabs "Tabla grupos" + toggle "Mi predicción"** | `/picks/group-stage` | Parent component + embedded `<app-group-stage-picks />` |
| **Empty state /picks/bracket "Ir a tabla de grupos →"** | `/picks/group-stage/predict` | Standalone (mismo que sidebar) |

### Diferencias visuales según path

#### Path A · Standalone (`/picks/group-stage/predict`)

Lo que el user ve:
```
[Sidebar global]   Predicciones · fase de grupos
                   Tabla final por grupo
                   
                   [Modo completo] [Modo simple]    ← solo si > 1 modo
                   
                   Predicción modo completo. Cuenta para ranking.
                   
                   Arrastra los equipos para predecir cómo terminará cada grupo.
                   Los cambios se guardan automáticamente en este navegador.
                   Pulsa "Guardar en la base" cuando termines para que cuente.
                   
                   [12 cards drag&drop]                        [Sidebar 3eros]
```

#### Path B · Embed (`/picks/group-stage` con view=pred)

Lo que el user ve:
```
[Sidebar global]   MUNDIAL 2026 · GOLGANA       [4 stats]
                   Mis picks
                   
                   [Cronológico] [Tabla grupos] [Bracket]
                   
                   12 grupos · clasifican los 2 primeros…
                                                    [Tabla real] [Mi predicción]
                   ─────────────────────────────────────────────────
                   
                   Predicciones · fase de grupos
                   Tabla final por grupo
                   
                   [Modo completo] [Modo simple]    ← solo si > 1 modo
                   
                   Predicción modo completo. Cuenta para ranking.
                   
                   Arrastra los equipos para predecir cómo terminará cada grupo.
                   Los cambios se guardan automáticamente en este navegador.
                   Pulsa "Guardar en la base" cuando termines para que cuente.
                   
                   [12 cards drag&drop]                        [Sidebar 3eros]
```

### 🔴 Problema identificado: DOBLE HEADER cuando se accede vía page-tabs

Cuando el user llega vía `/picks/group-stage` y toggle "Mi predicción", **dos headers se apilan**:

1. **Parent header**: "MUNDIAL 2026 · GOLGANA / Mis picks" + 4 stats
2. **Embed header**: "Predicciones · fase de grupos / Tabla final por grupo"

Ambos compiten por jerarquía visual. El user ve **2 títulos h1-like en la misma pantalla**:
- "Mis picks" (parent h1)
- "Tabla final por grupo" (embed h1)

A11y issue: 2 elementos `<h1>` en la misma pantalla rompen la jerarquía semántica.

UX issue: el user no sabe cuál es el contexto principal. ¿Está en "Mis picks" o en "Tabla final por grupo"?

---

## 4. Componentes específicos al standalone

### 4.1 Page header propio

**Render**:
```
small "Predicciones · fase de grupos"
h1   "Tabla final por grupo"
```

**Análisis**:
- ✓ Título descriptivo en standalone.
- 🔴 **Compite con el header del parent cuando se embebe** (ver §3).
- 🟡 La small "Predicciones · fase de grupos" es semánticamente similar al h1 "Tabla final por grupo" — redundante.

### 4.2 Empty state "Sin grupos privados"

**Render**:
```
"Necesitas pertenecer a al menos un grupo privado para ingresar tus predicciones.
[Crea uno →]"
```

**Análisis**:
- ✓ Mensaje claro.
- ⚠ **Mismo empty state que `/picks/bracket`** (`§4.1` doc 05). Idéntico texto + idéntico link `/groups/new`.
- 🟠 Inconsistencia: en bracket el empty es un `<div class="empty-block">` con H3 + p + button. En group-stage-predict es un `<p class="form-card__hint">` con link inline. Misma información, presentación distinta.
- 🟡 Sin opción "Unirme con código" — mismo gap que bracket.
- 🟡 Link `/groups/new` mientras el resto de la app usa el modal `openCreate()`.

### 4.3 Mode switch

**Render** (solo si `availableModes().length > 1`):
```
[Modo completo]  [Modo simple]
```

**Análisis**:
- ✓ Usa `role="tablist"` y class `wf-seg` (a11y wired).
- ⚠ **Diferente del mode switch de `/picks/bracket`**: bracket usa `<div class="seg">` con `<button class="seg__item">` (sin role=tablist en parent). Acá usa `<div class="wf-seg" role="tablist">` con `<button class="wf-seg__item">`. **Dos sistemas distintos de segmented controls** en componentes vecinos.
- ⚠ Pierde predicción al cambiar de modo (LocalStorage tiene keys distintas por modo, pero el user no se entera del switch silencioso). Sin warning.
- 🟡 Igual que el de bracket no muestra qué predicción tiene en cada modo antes de cambiar.

### 4.4 Mode info hint

**Render** (después del mode switch):
```
Predicción modo completo. Cuenta para el ranking global y para tus grupos completos.
```
o
```
Predicción modo simple. Cuenta para tus grupos simples (no afecta el ranking global).
```

**Análisis**:
- ✓ Explica qué hace cada modo — info crítica.
- ⚠ Solo se muestra acá. El user en `/picks` o `/picks/bracket` no ve este hint a pesar de que también puede tener picks en distintos modos.
- 🟡 Redundancia: si el user solo tiene 1 modo, el mode switch no se muestra pero este hint sí. Útil.

### 4.5 Lock status / instrucciones

**Render** (estado pre-lock):
```
Arrastra los equipos para predecir cómo terminará cada grupo.
Los cambios se guardan automáticamente en este navegador.
Pulsa "Guardar en la base" cuando termines para que cuente.
```

**Render** (estado post-lock):
```
Las predicciones se cerraron al iniciar el torneo ({date}). Solo lectura.
```

**Análisis**:
- 🔴 **Texto contradictorio confirmado** (ya señalado en doc 04 §5.3.a): "se guardan automáticamente" + "Pulsa Guardar en la base para que cuente". El user no sabe si está guardado o no.
- 🟠 Texto largo de 3 líneas — denso. El user lo skip y aprieta drag&drop sin entender el dualismo save.
- 🟡 Tipografía hint pequeña — info load-bearing (especialmente la línea de "Pulsa Guardar"). Debería ser más prominente.

---

## 5. Hallazgos específicos del standalone

🔴 **Doble header h1 cuando se embebe** — rompe jerarquía semántica.

🔴 **2 paths que aterrizan en el mismo flujo con UI distinta** — sidebar manda a standalone, page-tabs manda a embedded. El user no entiende por qué se ve distinto según cómo llegó.

🔴 **Bug de link confirmado en doc 05**: empty state de /picks/bracket dice "Ir a tabla de grupos →" linkeando a `/picks/group-stage/predict`. Pero el CTA dice "tabla de grupos" — el user puede pensar que va a `/picks/group-stage` (la tabla real, no la predicción).

🟠 **Mode switch usa wf-seg + role=tablist** mientras el de bracket usa seg + sin role=tablist. Inconsistencia de sistema.

🟠 **Save state dual confuso** (mismo que doc 04 — ya documented).

🟠 **Empty state "Sin grupos"** usa estilo distinto que el de bracket (p form-card__hint vs empty-block H3+p+button).

🟡 **Header text largo** — el user puede no leer la línea crítica "Pulsa Guardar".

🟡 **Link `/groups/new` mientras app usa modal `openCreate()`**.

🟡 **small "Predicciones · fase de grupos"** redundante con h1 "Tabla final por grupo".

🟡 **No tiene back navigation** — el user que llegó desde bracket-empty se pierde sin breadcrumb a /picks/bracket.

---

## 6. Antipatrones detectados

| Regla | Violación |
|---|---|
| **Single h1 per page** | 2 h1 visibles cuando embedded |
| **Route consolidation** | 2 paths para mismo flujo |
| **Consistency** (ui-ux-pro-max) | Mode switch + empty state inconsistentes con bracket |
| **Dual-state messaging confuso** | Save automático vs manual |
| **Empty state CTAs** | "Unirme con código" falta |
| **CTA consistency** | `/groups/new` vs `openCreate()` modal |

---

## 7. Decisión de consolidación (la pregunta clave)

Hay 3 opciones para resolver la duplicación:

### Opción A · Borrar la ruta standalone

- Eliminar `/picks/group-stage/predict` del routing.
- El user que llega ahí (vía deep-link / link viejo) se redirige a `/picks/group-stage?view=pred`.
- Sidebar "Mundial 2026" se actualiza para apuntar a `/picks/group-stage` con view=pred default.
- Empty state de bracket cambia link a `/picks/group-stage?view=pred`.
- **Pros**: una sola UI, una sola URL canónica.
- **Cons**: la URL tiene query param, no es tan limpia. El user que comparte un link a "mi predicción" comparte `/picks/group-stage?view=pred`.

### Opción B · Borrar el embed

- En `/picks/group-stage`, el toggle "Mi predicción" se vuelve un link a `/picks/group-stage/predict` (no un toggle local).
- Tabla real es la única vista de `/picks/group-stage`.
- **Pros**: separación clara de URLs. Tabla real ≠ predicción.
- **Cons**: el toggle deja de ser un toggle (es un link disfrazado). User espera ver el cambio inmediato pero hay navegación.

### Opción C · Mantener ambos pero corregir el embed

- En el embed, suprimir el header propio del component cuando se renderiza dentro de un parent (input flag `[embedded]="true"`).
- El parent renderiza su propio header. El embed solo aporta el body.
- Standalone sigue funcionando con su header propio.
- **Pros**: zero refactor de routing. Solo cambia el render condicional del header.
- **Cons**: el component tiene un input flag para controlar su header — código un poco más complejo.

### Recomendación: Opción A

Razones:
1. **Una sola fuente de verdad**: URL canónica.
2. **Sidebar coherente**: "Mundial 2026" lleva a la pantalla canónica de fase de grupos (con toggle interno).
3. **Empty states de otros surfaces** apuntan al mismo lugar.
4. **Deep-links shareables**: `/picks/group-stage?view=pred` se puede compartir y abre directo en la vista de predicción.
5. **Match con el patrón actual de la app**: `/picks` no tiene `/picks/upcoming` y `/picks/played` como URLs separadas — usa un sub-seg interno. Group-stage debería seguir el mismo patrón.

Implementación:
1. Eliminar ruta `/picks/group-stage/predict` del routing.
2. Sidebar "Mundial 2026" → `/picks/group-stage?view=pred`.
3. Empty state bracket → `/picks/group-stage?view=pred`.
4. PicksTablaGruposComponent lee `?view=pred` del query param para inicializar el toggle.
5. El `<app-group-stage-picks />` component recibe input flag `[embedded]="true"` y oculta su header propio.
6. El parent /picks/group-stage añade el header text "Arrastra los equipos…" como parte del propio cuando view=pred.

---

## 8. Anclas para el redesign

### Core

1. **gs-layout** con 12 grupos drag&drop + sidebar 3eros (ya OK, ver doc 04)
2. **Mode switch** cuando aplica
3. **Lock status visible**

### Quitar

- Ruta standalone `/picks/group-stage/predict`
- Header propio del component (oculto cuando embedded)
- Texto contradictorio "auto-save vs manual" — consolidar a auto-save consistente

### Agregar

- Input flag `[embedded]="true"` para suprimir el header propio
- Empty state con opción "Unirme con código"
- Diff visible entre predicción guardada y predicción actual (post-Fase A reform)

### Bug fixes

- Link "Ir a tabla de grupos →" en bracket empty state → cambiar a "Ir a predicción de grupos →" (más específico)
- Link "Ir a mis terceros →" en bracket empty state → ya documented en doc 05 (apuntar a este surface, no a `/profile/special-picks`)

---

## 9. Resumen ejecutivo

**Esta surface es 90% redundante con el embed de `/picks/group-stage`.** El cuerpo (gs-layout drag&drop) es idéntico. Lo único específico es:

- Header propio (que **causa conflicto** cuando se embebe en /picks/group-stage)
- Variantes del mode switch (wf-seg vs seg — inconsistencia con bracket)
- Texto contradictorio sobre save state (mismo problema que doc 04)

### 1 decisión que resuelve todo

**Consolidar a `/picks/group-stage?view=pred` y eliminar la ruta standalone.** Sigue el patrón de `/picks` (no hay `/picks/upcoming` separado) y resuelve:
- Doble h1 cuando embedded
- 2 paths con UI distinta
- Empty states inconsistentes
- Routing duplication ya identificada en buckets 2 y Fase A

### Cambios secundarios

- Auto-save consistente (eliminar el dualismo)
- Empty state con "Unirme con código"
- Mode switch unificado con el de bracket (mismo system de segmented control)
- Link "Ir a mis terceros" de bracket → corregir al destino correcto

**Nota retrospectiva**: en Fase A no se borró esta ruta porque el sidebar la usa. La decisión correcta era borrarla pero **actualizar el sidebar simultáneamente**. Es un trabajo pendiente del bucket 2 + bug del audit de Fase A.
