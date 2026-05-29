# Análisis UX: `/picks/group-stage` — PicksTablaGruposComponent

> Surface #4 del walkthrough. Vista canónica de fase de grupos con toggle Tabla real / Mi predicción.
> Incluye **componente embebido** (`<app-group-stage-picks />` drag&drop) y **modal interno** (Hacer picks por grupo).
> Análisis tab-por-tab + componentes anidados.

---

## 1. Identidad

- **Propósito**: ver/editar la fase de grupos del Mundial. Toggle entre "estado real del torneo" (tabla actualizada por resultados) y "tu predicción" (cómo crees que terminarán los grupos).
- **Audiencia**: user que quiere planear (pre-torneo: predicción) o monitorear (durante: real). El toggle deja al user cambiar de perspectiva en la misma vista.
- **Frecuencia**: alta pre-torneo (para configurar predicción), media durante (chequear standings).
- **Entry points**: page-tabs desde `/picks` o `/picks/bracket` ("Tabla grupos"), sidebar item "Mundial 2026" (que apunta a `/picks/group-stage/predict` no acá), deep-link.

---

## 2. Estructura — mapa general

```
┌──────────────────────────────────────────────────────────┐
│ PAGE-LEVEL · siempre visibles                             │
├──────────────────────────────────────────────────────────┤
│ [page header]                                             │
│  ├── kicker "MUNDIAL 2026 · GOLGANA"                      │
│  ├── h1 "Mis picks"                                       │
│  └── 4 stats (pts, exactos, resultados, global)           │
│                                                           │
│ [page-tabs · cross-page nav]                              │
│  ├── Cronológico (/picks)                                 │
│  ├── Tabla grupos (current, /picks/group-stage)           │
│  └── Bracket (/picks/bracket)                             │
│                                                           │
│ [picks-tabla-intro]                                       │
│  ├── texto "{N} grupos · clasifican los 2 primeros…"     │
│  └── sub-seg toggle:                                      │
│      ├── Tabla real                                       │
│      └── Mi predicción                                    │
│                                                           │
├──────────────────────────────────────────────────────────┤
│ TAB A · Tabla real                                        │
├──────────────────────────────────────────────────────────┤
│ [standings-grid · 12 cards]                               │
│  └── [standings-card] × 12                                │
│      ├── head: "GRUPO A" + "Top 2 clasifican"             │
│      ├── table (# | Selección | PJ | DG | PTS)            │
│      │   └── rows con .qualify si i < 2                   │
│      └── footer: btn "⚽ Hacer picks del Grupo A · 6      │
│          partidos →" → abre modal                         │
│ [legend]                                                  │
│  ├── "■ Clasifica a octavos"                              │
│  └── "La tabla se actualiza con resultados…"              │
│                                                           │
├──────────────────────────────────────────────────────────┤
│ TAB B · Mi predicción                                     │
├──────────────────────────────────────────────────────────┤
│ [<app-group-stage-picks /> · EMBEBIDO]                    │
│  ├── header text: "Arrastra los equipos…"                 │
│  ├── gs-layout (grid 1fr + 320px sidebar)                 │
│  │   ├── gs-groups: 12 cards drag&drop                    │
│  │   │   └── gs-card                                      │
│  │   │       ├── h2 "Grupo A" + "1° · 2° · 3° · 4°"       │
│  │   │       └── cdkDropList ol                           │
│  │   │           └── li cdkDrag × 4                       │
│  │   │               ├── pos "1°"                         │
│  │   │               ├── flag                             │
│  │   │               ├── name                             │
│  │   │               └── tag "✓ Clasifica" / "3°" / "✕"   │
│  │   └── gs-sidebar: Mejores 3eros                        │
│  │       ├── h2 "Mejores 3eros"                           │
│  │       ├── ol .gs-thirds (12 candidatos toggle)         │
│  │       ├── counter "X/8 seleccionados"                  │
│  │       ├── btn "Guardar en la base"                     │
│  │       └── "Último guardado: …"                         │
│                                                           │
│ Alterna a "Sin predicción" empty state                    │
│ ALT: si lockedAt, todo el componente queda read-only      │
│                                                           │
├──────────────────────────────────────────────────────────┤
│ MODAL INTERNO · "Hacer picks · Grupo X"                   │
│ Trigger: btn footer de cualquier standings-card           │
├──────────────────────────────────────────────────────────┤
│ [picks-modal is-open]                                     │
│  ├── header: title "Hacer picks · Grupo X" + meta         │
│  │   "{played}/{total} jugados · +{pts} pts"              │
│  ├── body: lista de match-cards (mismas que /picks)       │
│  │   └── 6 match-cards (1 por partido del grupo)          │
│  └── footer: "Auto-guardado al cambiar" + btn "Listo"     │
└──────────────────────────────────────────────────────────┘
```

---

## 3. Componentes page-level

### 3.1 Page header (idéntico a /picks)

**Render**: mismo que `/picks` — kicker + h1 + 4 stats.

**Análisis**:
- 🔴 **Mismo header en 3 rutas** (`/picks`, `/picks/group-stage`, `/picks/bracket`). 4 stats duplicados × 3 surfaces.
- Veredicto: ver doc 02-picks.md §3.1. Misma recomendación: reducir o quitar.

### 3.2 Page tabs (cross-page nav)

**Render**: Cronológico · **Tabla grupos** · Bracket.

**Análisis**:
- ✓ Mantienen orientación. Bien implementado con `routerLinkActive`.
- ⚠ Cuando el user llega vía sidebar "Mundial 2026" → aterriza en `/picks/group-stage/predict` (la página standalone, no la embebida). Esto duplica las dos rutas. Ver §5.3.

### 3.3 Picks-tabla-intro

**Render**:
```
12 grupos · clasifican los 2 primeros de cada grupo a octavos.
                                          [Tabla real] [Mi predicción]
```

**Datos**:
- `groups().length` → "12"
- Toggle aria-pressed por view()

**Análisis**:
- ✓ Texto educativo claro sobre el formato.
- ⚠ Toggle a la derecha "compite" con el texto del título — mejor centrar el toggle como sub-tab o moverlo arriba como tabs reales.
- 🟡 Texto fijo "2 primeros" no explica los "mejores 8 terceros" del formato Mundial 2026 — esa info aparece después en el embed.

### 3.4 Legend (footer del tab Tabla real)

**Render**:
```
■ Clasifica a octavos    · La tabla se actualiza a medida que se publican resultados.
```

**Análisis**:
- ✓ Útil para entender qué significa el highlight verde.
- 🟡 No explica el código de color de la fila "qualify" (verde) — debería ser explícito.

---

## 4. TAB A · Tabla real

### 4.1 Propósito

Mostrar el **estado real** de la fase de grupos. Cada card muestra el standings actual de un grupo (basado en resultados publicados por admin).

### 4.2 Componentes del tab

#### a) Standings grid

**Render**: grid responsive (`grid-template-columns: repeat(auto-fill, minmax(260px, 1fr))`) — 1 a 4 columnas según viewport.

**Análisis**:
- ✓ Responsive bien — desktop 4-up, tablet 2-up, mobile 1-up.
- ✓ Cards independientes — fácil escanear.

#### b) Standings card

**Render por card**:
```
GRUPO A                              Top 2 clasifican
─────────────────────────────────────────────────────
#   Selección              PJ   DG   PTS
1   🇲🇽 MÉXICO              3   +2    7      ← .qualify
2   🇦🇷 ARGENTINA           3   +1    6      ← .qualify
3   🇸🇦 ARABIA              3   -1    3
4   🇵🇱 POLONIA             3   -2    0
─────────────────────────────────────────────────────
        [⚽ Hacer picks del Grupo A · 6 partidos →]
```

**Datos por row** (Tabla real):
- pos (1-4)
- team flag + name
- PJ (partidos jugados)
- DG (diff goles, formato +N o -N)
- PTS (puntos en el grupo)
- `.qualify` class si i < 2

**Análisis**:
- ✓ Datos correctos y compactos.
- ✓ Highlight verde de top 2 es claro.
- ⚠ El bonus "+8 terceros mejores" del formato Mundial 2026 (12 grupos × top 2 + 8 mejores 3eros = 32 a octavos) **no se muestra en Tabla real**. Solo aparece como sidebar en Mi predicción.
- ⚠ Pre-torneo todos los grupos muestran PJ=0, DG=0, PTS=0 — tabla "vacía" (todos los teams empatados en 0). Sin orden alguno. Genera impresión de que la tabla está rota.
- 🟡 Card footer button "⚽ Hacer picks del Grupo X" tiene emoji ⚽ (anti-pattern) y label largo. Mejor: solo "Predecir marcadores · 6 partidos".

### 4.3 Hallazgos tab Tabla real

🔴 **Pre-torneo la tabla está vacía** (todos 0—0—0). Sin empty state específico — el user ve 12 cards casi idénticas. Decisión: agregar empty state "Tabla vacía · el torneo empieza en X días" o agrupar.

🟠 **No se muestran los "mejores 8 terceros"** — info crítica del formato Mundial 2026.

🟠 **DG=0 ambiguous pre-torneo** vs "DG=0 después de empate 1-1". Sin contexto.

🟡 **Card footer button con emoji ⚽** + label largo.

🟡 **Legend solo aparece debajo del grid** — en mobile con grid 1-col, el user puede no llegar hasta abajo.

---

## 5. TAB B · Mi predicción

### 5.1 Propósito

Predecir el **orden final** de cada grupo (no por partido sino por posición final) + seleccionar los **8 mejores 3eros** que pasan a octavos.

### 5.2 Tab embebido vs standalone

Este tab embebe `<app-group-stage-picks />` — el mismo componente que existe en `/picks/group-stage/predict` como página standalone. Es decir:

- **`/picks/group-stage/predict`** = standalone page con header propio "Predicción · Mis Picks", header text con instrucciones, sidebar terceros
- **`/picks/group-stage` (tab=pred)** = embebido sin el header propio, dentro del page-tabs Cronológico/Tabla grupos/Bracket

**Problema** (ya señalado en bucket 2 + Fase A):
- Sidebar "Mundial 2026" → `/picks/group-stage/predict` (standalone)
- Page-tab "Tabla grupos" + toggle "Mi predicción" → `/picks/group-stage` con embebido
- **El usuario tiene 2 paths para llegar a casi la misma vista**

Decisión: mantener una sola entrada. Yo sugeriría:
- Sidebar "Mundial 2026" debería apuntar a `/picks/group-stage` (con `?view=pred` default si quieren landearlos en predicción)
- Borrar la ruta `/picks/group-stage/predict` (la del standalone embed)

### 5.3 Componentes del tab (embed)

#### a) Header text del embed

**Render**:
- Si NO locked: "Arrastra los equipos para predecir cómo terminará cada grupo. Los **cambios se guardan automáticamente en este navegador**. Pulsa **'Guardar en la base'** cuando termines para que cuente."
- Si locked: "Las predicciones se cerraron al iniciar el torneo ({date}). Solo lectura."

**Análisis**:
- ⚠ Header text se contradice con sí mismo: "se guardan automáticamente" PERO "Pulsa Guardar en la base cuando termines para que cuente". Esto es **dual-state confuso**:
  - Auto-save → localStorage (visible solo en este navegador)
  - Manual save → backend (visible para el ranking)
- 🔴 Inconsistencia con el resto de la app: todos los otros flujos de picks usan `PicksSyncService` con auto-save al backend. Este flujo es **el único** con save manual a backend.
- 🟡 Texto largo y denso. El user puede no leerlo y perder picks.

#### b) gs-layout

**Render**: grid `1fr 320px` desktop, 1-col mobile.
- Left: 12 group cards en grid auto-fit
- Right: sidebar "Mejores 3eros"

**Análisis**:
- ✓ Layout claro en desktop.
- ⚠ En mobile (1-col): primero ves los 12 grupos (long scroll), luego la sidebar. La sidebar de terceros se vuelve invisible hasta el final — fácil de olvidar.
- 🟡 Sidebar fixed-width 320px en desktop puede ser estrecho con nombres largos (Arabia Saudita, Bosnia-Herzegovina, etc.).

#### c) gs-card · grupo con drag&drop

**Render por grupo**:
```
Grupo A                                       1° · 2° · 3° · 4°
┌────────────────────────────────────────────────────────────┐
│ 1°  🇲🇽 MÉXICO          ✓ Clasifica                       │  drag handle
├────────────────────────────────────────────────────────────┤
│ 2°  🇦🇷 ARGENTINA       ✓ Clasifica                       │
├────────────────────────────────────────────────────────────┤
│ 3°  🇸🇦 ARABIA          3°                                 │
├────────────────────────────────────────────────────────────┤
│ 4°  🇵🇱 POLONIA         ✕ Eliminado                       │
└────────────────────────────────────────────────────────────┘
```

**Datos por li**:
- pos (1° - 4°)
- flag (CSS flag-icons, NO `app-team-flag` component — inconsistencia)
- team name
- tag: "✓ Clasifica" / "3°" / "✕ Eliminado"

**Análisis**:
- ✓ Drag&drop con cdkDropList — buen pattern para reordenar.
- ✓ Tags clarisimos del estado de cada equipo.
- 🔴 **Drag&drop frustrante en mobile** — tap-and-hold + drag para reordenar 4 equipos × 12 grupos = mucho friction.
- 🟠 Pre-torneo todos los 12 grupos tienen un orden default (random? alfabético?). El user debe modificar 12 grupos × 4 teams cada uno — 48 micro-decisiones por interactuar.
- ⚠ **Inconsistencia con app-team-flag component**: este flow usa flag CSS directo (`fi fi-{code}`), no el `<app-team-flag>` que usa el resto. Implica que si admin sube crests custom, no se ven acá.
- 🟡 No hay shortcut "auto-fill por seed actual" o "sortear" — el user empieza desde un estado default.

#### d) gs-sidebar · Mejores 3eros

**Render**:
```
Mejores 3eros
De los 12 terceros de cada grupo, solo 8 clasifican a octavos.
Marcalos con un click.

┌──────────────────────────────────────┐
│ + 🇸🇦 ARABIA              Gr A       │  ← not selected
│ ✓ 🇩🇰 DINAMARCA           Gr B       │  ← selected
│ + 🇨🇷 COSTA RICA          Gr C       │
│ ... (12 total)                       │
└──────────────────────────────────────┘

Seleccionados: 6/8

[Guardar en la base]

Último guardado: 23 jun 14:00
```

**Datos**:
- `thirdsList()` — 12 candidatos (3° de cada grupo)
- Per item: flag, name, group label
- Click → toggleAdvance
- Counter "X/8"
- "Guardar en la base" button
- "Último guardado" timestamp

**Análisis**:
- ✓ Click-to-toggle es mejor que drag aquí (orden no importa, solo membership).
- ✓ Counter claro de progreso.
- ✓ "Último guardado" da feedback.
- 🟠 Pre-torneo + pre-grupos predichos: el "3°" de cada grupo depende del orden del grupo. Si el user no terminó de ordenar los grupos, la lista de candidatos puede ser confusa (el "3°" cambia al reordenar).
- ⚠ Si selecciona > 8, no se ve cuál destachar. Mejor: hint "Ya tienes 8, desmarcá uno para cambiar".

#### e) Save state UX

Dos formas de "guardar" en el mismo flow:
1. **Auto a localStorage** (cualquier interacción)
2. **Manual al backend** (botón "Guardar en la base")

**Análisis**:
- 🔴 **Inconsistencia mayor con el resto de la app**:
  - `/picks` (cronológico): auto-save al backend vía `PicksSyncService`
  - `/picks/match/:id`: auto-save al backend
  - `/picks/bracket`: local-first + auto-save al backend explícito + botón "Guardar"
  - `/picks/group-stage` (predict): local-first + **botón manual** "Guardar en la base"
- El bracket y group-stage-predict tienen save manual pero **el bracket auto-guarda y el group-stage NO** (según los comentarios del código).
- Esto rompe el mental model: el user en cronológico aprende que todo auto-save. Cuando llega acá, puede no apretar "Guardar" y perder todo.
- 🟡 "Último guardado" timestamp es buen indicador, pero solo aparece después del primer save.

### 5.4 Hallazgos tab Mi predicción

🔴 **Save manual al backend** (inconsistente con resto de la app que auto-save).

🔴 **Drag&drop tap-and-hold en mobile** — friction alto. 48 micro-decisiones.

🔴 **Componente embebido vs página standalone** — duplicación de rutas.

🟠 **Pre-torneo todos los grupos tienen default order** que el user debe modificar de cero.

🟠 **Mejores 3eros depende del orden** — la lista de candidatos cambia al reordenar grupos, sin warning.

🟠 **Inconsistencia visual con app-team-flag** (este flow usa CSS flag-icons directo).

🟠 **Sidebar terceros invisible en mobile** hasta llegar al final del scroll.

🟡 **Header text largo y dual-state confuso**.

🟡 **No hay shortcut "auto-fill" o "sortear"** para acelerar el inicial.

🟡 **Si selecciona >8 terceros**, no hay hint claro de cuál destachar.

---

## 6. MODAL INTERNO · "Hacer picks · Grupo X"

### 6.1 Propósito

Permitir al user editar los **marcadores de los 6 partidos** de un grupo específico sin salir de la vista de standings.

### 6.2 Trigger

Botón "⚽ Hacer picks del Grupo X · 6 partidos →" en el footer de cada standings-card.

### 6.3 Componentes del modal

#### a) Header del modal

**Render**:
```
Hacer picks · Grupo A                                    ✕
6 / 6 jugados · +18 pts
```

**Datos**:
- Title con letra del grupo
- Meta: "{played}/{total} jugados" + "{myPoints} pts" si > 0

**Análisis**:
- ✓ Title claro.
- ✓ Meta informativa.
- ⚠ Si pts = 0, no se muestra — pero el user querría ver "0 pts" explícito.

#### b) Body · match cards (6)

**Render**: lista de match cards similar a `/picks` pero más compacta (sin trivia chips, sin "Tu pick" line, sin "Ver detalles →" CTA).

**Comparación con match-card de /picks**:

| Elemento | /picks match-card | /picks/group-stage modal card |
|---|---|---|
| Header (kickoff + status pill) | ✓ | ✓ |
| Match row (flag + score + flag) | ✓ | ✓ |
| Score inputs (upcoming) | ✓ | ✓ |
| "Tu pick" line (played/live) | ✓ | ✗ replaced by `match-card__pills` "Tu pick: X-Y" |
| Pills row (saved/pending/etc.) | ✓ | ✓ |
| Trivia sub-card | ✓ | ✗ no aparece |
| Detail link "Ver detalles →" | ✓ | ✗ |

**Análisis**:
- ✓ Subset reasonable del match-card original.
- ⚠ Falta de trivia chips: si hay trivia activa para un match del grupo, el user no la ve desde acá. Debería incluirse.
- 🟡 Inconsistencia con `/picks` — quien aprendió a usar "Ver detalles →" en `/picks` no lo encuentra acá.

#### c) Footer del modal

**Render**:
```
[Auto-guardado al cambiar]                        [Listo]
```

**Análisis**:
- ✓ Save state indicado claramente.
- ✓ "Listo" cierra el modal — buen pattern.
- ⚠ "Auto-guardado al cambiar" en este modal vs "Guardar en la base" manual del embed predicción — **inconsistencia dentro del mismo screen**.

### 6.4 Hallazgos modal interno

🟠 **Sin trivia indicators** dentro de las match-cards del modal.

🟠 **Inconsistencia con match-card de /picks**: subset visual pero el user no entiende por qué.

🟡 **Inconsistencia de save state** con el resto del screen (modal auto-save vs embed manual).

🟡 **Modal podría reaprovecharse como component shared** entre /picks y este screen.

---

## 7. Cross-cutting · hallazgos UX (priorizados)

🔴 **Page header con 4 stats duplica /picks** (y home y bracket).

🔴 **Save state inconsistente** entre el embed predicción (manual) y el modal (auto).

🔴 **Drag&drop en mobile** para reordenar 12 grupos × 4 teams.

🔴 **Duplicación de rutas**: `/picks/group-stage/predict` standalone vs `/picks/group-stage` con embed.

🟠 **Pre-torneo Tabla real vacía** sin empty state.

🟠 **Mejores 8 terceros invisible en Tabla real** (solo aparece en Mi predicción).

🟠 **Mejores 3eros depende del orden grupos** — sin warning.

🟠 **Inconsistencia visual con app-team-flag** en el embed.

🟠 **No hay link a "ver bracket basado en mi predicción"** — el user predice grupos pero no ve consecuencias en bracket.

🟠 **Modal sin trivia indicators** ni link a detalle.

🟡 **Toggle Tabla real / Mi predicción a la derecha** compite con título.

🟡 **Legend al final del grid** invisible en mobile.

🟡 **Botón footer card con emoji ⚽** + label largo.

🟡 **Sin shortcuts para acelerar predicción** inicial (auto-fill, sortear).

🟡 **"Sin pts" pill ambigua** en modal (mismo problema que /picks).

🟢 **No hay diff visible** entre la predicción inicial y la guardada (post-save).

🟢 **Sidebar terceros podría tener "ordenar por grupo"** para escanear más fácil.

---

## 8. Antipatrones detectados

| Regla | Violación |
|---|---|
| **Avoid duplicate data** | 4 stats de header en 3 rutas + ahora /picks/group-stage |
| **Consistency** (ui-ux-pro-max) | Save manual vs auto entre flows |
| **drag-threshold + gesture-alternative** | Drag-only para reordenar — falta keyboard alternative |
| **no-emoji-icons** | ⚽ en card footer button |
| **Empty states** | Pre-torneo Tabla real sin specific empty state |
| **Density adaptation** | Sidebar mobile invisible hasta scroll fin |
| **Mode badge inconsistency** | Match-card inconsistente entre /picks y modal |

---

## 9. Anclas para el redesign

### Core (todos los estados)

1. **Toggle Tabla real / Mi predicción** como tabs primarios (más prominente)
2. **Standings grid** de 12 grupos
3. **Modal interno** para edit por grupo
4. **Save state consistente** (auto-save al backend en TODOS los flows)

### Contextual

- **Pre-torneo**: Mi predicción default tab (más importante en este momento)
- **Durante**: Tabla real default tab
- **Post-torneo**: Tabla real como histórico

### Quitar

- Page header 4 stats (duplica home)
- Ruta `/picks/group-stage/predict` standalone (consolidar con `/picks/group-stage?view=pred`)
- Botón "Guardar en la base" manual (cambiar a auto-save)
- Emoji ⚽ en card footer button

### Agregar

- **Empty state pre-torneo en Tabla real** ("Torneo arranca en X días")
- **Mejores 8 terceros indicador** en Tabla real (no solo en Mi predicción)
- **Warning al reordenar** que afecta 3eros candidatos
- **Auto-fill shortcut** para predicción inicial
- **"Ver bracket basado en mi predicción" link** desde Mi predicción
- **Trivia indicators** en match-cards del modal
- **Detail link** en match-cards del modal (consistencia con /picks)
- **Save status sticky** en lugar de modal-footer cuando hay cambios pendientes

---

## 10. Resumen ejecutivo para el redesign

**Esta pantalla tiene 3 sub-surfaces (Tabla real, Mi predicción embed, modal por grupo) con UX inconsistente entre ellos.** Lo que funciona:
- Toggle conceptual entre 2 vistas
- Modal interno para edit por grupo (auto-save)
- Click-to-toggle de mejores 3eros

Lo que no funciona:
- Drag&drop en mobile
- Save state inconsistente (manual vs auto)
- Duplicación de rutas

### 3 decisiones de diseño que cambian todo

1. **Consolidar save state a auto-save al backend en TODOS los flows** (eliminar el dualismo localStorage + manual). El bracket ya lo hace híbrido bien — group-stage-predict debe seguirlo.

2. **Eliminar drag&drop como única forma** de reordenar grupos. Alternativas:
   - Stepper +/- por equipo (mover arriba/abajo)
   - Click-to-promote (tap equipo → "Mover a 1°" / "Mover a 2°" buttons)
   - Auto-fill desde ranking FIFA + ajustes finos
   El drag&drop puede quedar como opción avanzada en desktop.

3. **Mostrar mejores 8 terceros en Tabla real** (no solo en Mi predicción). El formato Mundial 2026 incluye esto — la vista de standings real debe reflejarlo. Tabla real con "Top 2 + Top 8 3eros" highlight.

### Cambios secundarios

- Consolidar `/picks/group-stage/predict` standalone con `/picks/group-stage?view=pred` (deeplink + tab default).
- Sticky sidebar "Mejores 3eros" en desktop, bottom-sheet en mobile.
- Empty state pre-torneo para Tabla real.
- Match-cards en modal consistentes con `/picks` (trivia, detail link).
- Toggle Tabla real / Mi predicción más prominente (no embebido en intro).
- Header text del embed más conciso.
- Auto-fill / sortear shortcuts.
- Warning al reordenar grupos que afecta candidatos 3eros.
- "Ver bracket basado en mi predicción" link desde Mi predicción.
- Eliminar 4 stats del page header.
