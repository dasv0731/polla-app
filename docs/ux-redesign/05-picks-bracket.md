# Análisis UX: `/picks/bracket` — BracketPicksComponent

> Surface #5 del walkthrough. Vista canónica del bracket de eliminatorias.
> Es el componente visualmente más complejo de la app (grid de 9 columnas).
> Análisis profundo de filter pills, slot states y empty states encadenados.

---

## 1. Identidad

- **Propósito**: predecir/ver el bracket de eliminatorias del Mundial 2026 (R32 → octavos → cuartos → semis → final). Click en un equipo lo marca como ganador de esa llave, lo cual propaga al siguiente match.
- **Audiencia**: user que ya completó la predicción de fase de grupos. Sin grupos predichos, este flow está bloqueado.
- **Frecuencia**: media-alta pre-torneo (durante setup) y baja durante (no hay edit). Spike de uso al inicio de eliminatorias.
- **Entry points**: page-tabs "Bracket" desde `/picks` o `/picks/group-stage`, sidebar (no link directo), redirect post-completar predicción de grupos.

---

## 2. Estructura — mapa general

```
┌──────────────────────────────────────────────────────────┐
│ PAGE-LEVEL                                                │
├──────────────────────────────────────────────────────────┤
│ [page header] — kicker + h1 "Mis picks" + 4 stats         │
│   ↑ MISMO que /picks y /picks/group-stage                 │
│                                                           │
│ [page-tabs] Cronológico · Tabla grupos · Bracket          │
│                                                           │
│ [mode switch] · solo si user tiene > 1 modo               │
│  ├── Modo completo                                        │
│  └── Modo simple                                          │
│                                                           │
│ [bracket-intro]                                           │
│  ├── párrafo explicativo:                                 │
│  │   "Tu predicción de la fase eliminatoria.              │
│  │    +2 a +16 pts por equipo correcto según fase         │
│  │    (R32 → final) · +25 pts por el campeón."            │
│  ├── lock status: "Cierra al kickoff de la 1ª llave · X"  │
│  └── actions row:                                         │
│      ├── save-state pill (saving/saved/dirty/error)       │
│      └── counter "X / N" picks                            │
│                                                           │
│ [filter pills]                                            │
│  ├── Tu camino  ← dimea matches no-tuyos                  │
│  └── Todos                                                │
└──────────────────────────────────────────────────────────┘

CONTENIDO PRINCIPAL (5 estados mutuamente excluyentes):

  ┌─ Estado 1: loading ────────────────────────────────────┐
  │  "Cargando bracket…"                                    │
  └─────────────────────────────────────────────────────────┘
  
  ┌─ Estado 2: empty — Sin grupos privados ────────────────┐
  │  H3 "Sin grupos privados"                               │
  │  "Necesitas pertenecer a al menos un grupo privado…"    │
  │  [Crear un grupo →]                                     │
  └─────────────────────────────────────────────────────────┘
  
  ┌─ Estado 3: projection missing (checklist) ─────────────┐
  │  H3 "Para ver tu bracket primero termina tus picks"     │
  │  ☐/✓ "Faltan posiciones en N grupo(s): A, B, D"         │
  │      [Ir a tabla de grupos →]                           │
  │  ☐/✓ "Marca exactamente 8 mejores 3ros (tienes N)"      │
  │      [Ir a mis terceros →]                              │
  └─────────────────────────────────────────────────────────┘
  
  ┌─ Estado 4: bracket activo (proyectado o real) ─────────┐
  │  [info-banner] "🔮 Bracket armado desde tus            │
  │   predicciones…" ← solo si isProjected()                │
  │                                                         │
  │  [bracket-scroll horizontal]                            │
  │   ┌─────────────────────────────────────────────────┐   │
  │   │ R32 · Oct · C · S · FINAL · S · C · Oct · R32   │   │
  │   │ 8x   4x   2x  1x   1     1x  2x  4x   8x        │   │
  │   └─────────────────────────────────────────────────┘   │
  │                                                         │
  │  [legend]                                               │
  │   ■ Tu predicción                                       │
  │   ■ Ganador (real / proyectado)                         │
  │   "Click en un equipo para elegirlo como ganador."      │
  └─────────────────────────────────────────────────────────┘
```

**No hay tabs internos user-switchable**. El switch entre estados es automático según condiciones del data. La única elección manual es:
- Filter pills (Tu camino / Todos) — afecta dim visual
- Mode switch — solo si user tiene los dos modos

---

## 3. Componentes page-level

### 3.1 Page header (idéntico a /picks y /picks/group-stage)

🔴 **Mismo header en 4 surfaces** ya (home + /picks + /picks/group-stage + /picks/bracket). 4 stats × 4 surfaces = 16 instancias del mismo dato.

Recomendación: ver doc 02-picks.md §3.1.

### 3.2 Page tabs (cross-page nav)

✓ Mismo pattern. Sin observación nueva.

### 3.3 Mode switch (condicional)

**Render**: 2 botones segmented si `availableModes().length > 1`.
```
[ Modo completo ]  [ Modo simple ]
```

**Análisis**:
- ✓ Útil para users con grupos en ambos modos — el bracket es distinto entre modos (SIMPLE no incluye 16avos quizás? — depende del scoring).
- ⚠ Aparece **solo en este surface**. En `/picks` cronológico no hay mode switch — el user no entiende por qué acá sí.
- 🟠 Si el user cambia de modo, ¿se pierde su predicción del modo previo? El código sugiere que sí (bracket es un set único por user). Sin warning.
- 🟡 No tiene aria-pressed / role=tablist. Falta a11y (P1.2 podría haberlo omitido).

### 3.4 Intro section

**Render**:
```
Tu predicción de la fase eliminatoria.
+2 a +16 pts por equipo correcto según fase (R32 → final) · +25 pts por el campeón.
Cierra al kickoff de la 1ª llave · 11 jun 2026 13:00.

[Save state pill]    8 / 31
```

**Datos**:
- Párrafo explicativo (constante)
- Lock status:
  - Si `bracketLocked()`: "Bracket cerrado · {date}."
  - Sino si `bracketLockFormatted()`: "Cierra al kickoff de la 1ª llave · {date}."
- Save state pill (4 estados):
  - saving: "⏳ Guardando…"
  - saved: "✓ Bracket guardado"
  - dirty: "● Cambios sin guardar"
  - error: "⚠ Error" con role="alert"
- Counter: `pickedCount() / totalKnockoutMatches()`

**Análisis**:
- ✓ Información dense pero crítica para entender scoring.
- ⚠ "+2 a +16 pts por equipo correcto" es rango amplio sin contexto — el user querría ver la tabla de scoring por fase (R32 = +2, octavos = +4, cuartos = +6, semis = +10, final = +16).
- ⚠ Save state pill con `aria-live="polite"` ✓ pero compite por atención con el lock status y el counter en el mismo bloque.
- 🟡 El counter "X / N" usa text-mute pequeño — info importante (cuánto te falta) que debería ser más prominente, no a 11px gris.
- 🟡 Lock status va a una segunda línea con `<br>` — frágil layout. Mejor como pill o badge dedicado.

### 3.5 Filter pills (Tu camino / Todos)

**Render**: 2 botones con `role="group"`.

**Datos**:
- Filter signal: 'mine' o 'all'
- `dimmedFor(m)` → opacity 0.4 para matches que no son del "tu camino"

**Análisis**:
- ✓ Idea valiosa: "Tu camino" foca al user en su predicción específica entre el ruido del bracket completo.
- ✓ aria-pressed correcto (P1.2 done).
- 🟠 **El efecto del filter no es discoverable**: cambia opacity 0.4 a matches no-tuyos. El user puede no notar que algo pasó. Mejor: dim más fuerte (0.2) o blur o hidden.
- 🟠 "Tu camino" requiere que el user tenga picks hechos. Si no tiene picks aún, el filter está vacío. Sin empty state específico para esto.
- 🟡 Default es "Todos" — para un user que entra con picks ya hechos, "Tu camino" sería más útil como default.

---

## 4. Empty states encadenados (3 estados)

Esta pantalla tiene **3 empty states distintos** según el progreso del user. Es el surface con la lógica de gating más rica de la app.

### 4.1 Estado: Sin grupos privados

**Trigger**: `availableModes().length === 0` — el user no está en ningún grupo.

**Render**:
```
H3 "Sin grupos privados"
"Necesitas pertenecer a al menos un grupo privado para usar el bracket."
[Crear un grupo →]
```

**Análisis**:
- ✓ Mensaje claro.
- ✓ CTA al final.
- ⚠ CTA es `routerLink="/groups/new"` — la página de crear grupo (todavía existe). Mejor: abrir modal `openCreate()` para consistencia con resto de la app.
- 🟡 Falta opción "Unirme con código" — solo crear. Si el user fue invitado a un grupo, debería poder unirse desde acá.

### 4.2 Estado: Projection missing (checklist)

**Trigger**: `projectionMissing()` retorna objeto con `groupsWithoutFullStanding[]` y/o `thirdsCount !== 8`.

**Render**:
```
H3 "Para ver tu bracket primero termina tus predicciones"

☐ "Faltan posiciones en 2 grupo(s): A, C"
   [Ir a tabla de grupos →]
✓ "Tablas de grupos completas"

✗ "Marca exactamente 8 mejores 3.os (tienes 5)"
   [Ir a mis terceros →]
✓ "8 mejores 3.os marcados"
```

**Datos**:
- 2 checks que se evalúan separadamente
- Por cada check: estado actual + CTA contextual si está incompleto

**Análisis**:
- ✓ **Excelente UX**: checklist es claro, el user ve exactamente qué le falta.
- ✓ CTAs contextuales por cada check.
- 🟠 **Bug de flow detectado**: el segundo check linkea a `/profile/special-picks` (link "Ir a mis terceros") — pero los **mejores 3eros se marcan en `/picks/group-stage/predict`** (en la sidebar de ese componente, no en special-picks). El link CTA va a un lugar incorrecto.
- 🟠 Verificar: el componente standalone `GroupStagePicksComponent` tiene la sidebar de terceros. `SpecialPicksComponent` es para CHAMPION/RUNNER_UP/DARK_HORSE. Son cosas distintas.
- 🟡 Si ambos checks fallan, hay 2 CTAs simultáneos — el user no sabe en qué orden hacerlos. Mejor: jerarquizar ("Primero completa grupos → luego marca 8 terceros").

### 4.3 Estado: Loading

**Render**: "Cargando bracket…"

**Análisis**:
- ⚠ Texto plano sin skeleton. El bracket es grande — un skeleton del grid mejoraría perceived performance.

---

## 5. Estado 4: bracket activo (el core)

### 5.1 Sub-estado: bracket proyectado

**Trigger**: `isProjected()` — el user no ha hecho picks de bracket propios, pero hay un bracket projeción desde sus predicciones de grupos.

**Render banner**:
```
🔮 Bracket armado desde tus predicciones de grupos.
Tus elecciones aquí se quedan fijas — los resultados reales
del Mundial puntúan tu BracketPick comparando equipos por fase.
```

**Análisis**:
- ✓ Banner explicativo del mecanismo (proyección automática vs picks explícitos).
- 🟡 Emoji 🔮 anti-pattern.
- 🟡 Texto largo — el user puede no leer. Comprimir: "ⓘ Bracket auto-proyectado desde tus grupos. Click un equipo para elegirlo explícitamente."

### 5.2 Bracket grid (9 columnas)

**Render layout**:
```
   R32     Oct    C     S    FINAL    S    C    Oct    R32
   ┌─┐    ┌─┐   ┌─┐   ┌─┐   ┌─┐    ┌─┐  ┌─┐   ┌─┐    ┌─┐
   │8│    │4│   │2│   │1│   │🏆│   │1│  │2│   │4│    │8│
   │ │    │ │   │ │   │ │   │  │   │ │  │ │   │ │    │ │
   └─┘    └─┘   └─┘   └─┘   └─┘    └─┘  └─┘   └─┘    └─┘
```

- 9 columnas
- Layout: izq (8 R32 + 4 octavos + 2 cuartos + 1 semi) + FINAL + der (1 semi + 2 cuartos + 4 octavos + 8 R32)
- Headers en row 1
- Matches en row 2
- FINAL card especial (centro)

**Análisis**:
- ✓ Layout simétrico es claro para entender la progresión.
- ✓ Final destacada al centro con card propio.
- 🔴 **9 columnas en mobile**: overflow horizontal con `.bracket-scroll`. El user debe scrollear lateralmente para ver R32 + Final + R32 — fragmenta la lectura.
- 🔴 **En mobile**, ¿cómo se ve esto? Sin haber probado: probable que solo se vea 2-3 columnas a la vez, el user pierde el contexto del bracket completo.
- 🟠 Sin scroll indicators visuales (← →) que indiquen que hay más contenido al lado.
- 🟡 Headers de columna "16avos / Octavos / Cuartos / Semis / Final" en mayúscula + Bebas — buena tipografía. Pero el R32 vs "16avos" inconsistente (el code usa "R32" como prefix del slot pero label dice "16avos").

### 5.3 Match (matchTpl) · bracket-match

**Render**:
```
┌─────────────────┐
│ R32-1           │  ← position label
│ ───────────     │
│ 🇲🇽 MÉXICO  2   │  ← home slot
│ 🇦🇷 ARGENTINA 1 │  ← away slot
└─────────────────┘
```

**Datos**:
- Position label: prefix + bracketPosition (R32-1, O-3, C-2, S-1, etc.)
- 2 slots: home + away
- `dimmedFor(m)` → opacity 0.4 si filter='mine' y no es tu match

**Análisis**:
- ✓ Position label útil para referenciar (el admin puede pedir "el resultado de O-3").
- ✓ Compact layout.
- ⚠ Score (homeScore/awayScore) está dentro del slot button, no como meta separada. Hace que cada slot sea ancho variable.

### 5.4 Slot (slotTpl) · bracket-slot

Es el componente más complejo del surface. Tiene **6 estados visuales** según la combinación de condiciones:

| Estado | Condiciones | Visual | Click? |
|---|---|---|---|
| **Empty** | `!teamId` | "Pick fase anterior" placeholder gris | disabled |
| **Mine + Winner** | userPicked && isMine && isWinner | verde fuerte (acertó!) | toggle |
| **Mine + No winner** | userPicked && isMine && !isWinner | borde verde (predicción) | toggle |
| **Real winner** | !isMine && isWinner | fondo highlight (resultado real) | toggle |
| **Discarded** | userPicked && !isMine && !isWinner | tachado / dim | toggle |
| **Locked** | bracketLocked() | disabled visual | — |

**Análisis**:
- ✓ **Rico sistema de estados** — comunica visualmente todo el feedback necesario.
- ⚠ **6 estados visuales en un button** son muchos. El user debe aprender el code (verde fuerte vs borde verde vs highlight vs tachado). Sin tooltip/legend interactivo, es difícil discoverable.
- ✓ La legend al final intenta resolver esto (ver §5.6).
- 🟠 Estado "Mine + No winner" (predijiste pero match aún no terminó) y "Mine + Winner" se ven similares — el user puede no notar la diferencia entre "esperando resultado" y "acerté".
- 🟠 "Discarded" (predijiste pero el equipo perdió) es info crítica para el user — debería ser más prominente, no solo dim.
- 🟡 Placeholder "Pick fase anterior" es críptico. Mejor: "Esperando R32 →" o "Definido en R32-1".

### 5.5 Final card

**Render**:
```
┌─────────────────┐
│  🏆 FINAL       │
│ ─────────────   │
│ 🇲🇽 MÉXICO  ?   │
│ 🇧🇷 BRASIL  ?   │
│ ─────────────   │
│ CAMPEÓN · MÉXICO│ ← solo si user tiene champion definido
└─────────────────┘
```

**Análisis**:
- ✓ Visualmente destacada como destino del bracket.
- ✓ Champion display al final cierra el flow.
- 🟡 Emoji 🏆 anti-pattern.
- 🟠 Si el champion del user no acertó pero la final ya se jugó, no hay feedback ("Predijiste MÉXICO pero el campeón real es BRASIL"). Solo se ve "CAMPEÓN · MÉXICO" sin compare.
- 🟠 La final ofrece +25 pts (mencionado en intro) — el card no muestra "+25 pts si acertás" como incentivo cuando aún no se jugó.

### 5.6 Legend (footer)

**Render**:
```
■ Tu predicción      ■ Ganador (real / proyectado)
· Click en un equipo para elegirlo como ganador.
```

**Análisis**:
- ✓ Legend para los 2 estados principales.
- ⚠ **Solo 2 entries pero hay 6 estados visuales**. "Mine + Winner" (verde fuerte = acertaste!) no está en la legend. Tampoco "Discarded" (tachado = predijiste el perdedor).
- 🟡 "Click en un equipo para elegirlo como ganador" — si está locked, dice "Bloqueado, solo lectura". Buen contextual hint.

---

## 6. Hallazgos UX cross-cutting (priorizados)

🔴 **Mismo page header con 4 stats** en 4 surfaces (home + 3 picks routes). 16 instancias del mismo dato.

🔴 **Bracket en mobile requiere scroll horizontal de 9 columnas** — fragmenta la lectura, sin scroll indicators.

🔴 **Bug de flow**: link CTA "Ir a mis terceros" lleva a `/profile/special-picks` pero los terceros se marcan en `/picks/group-stage/predict`. Va a lugar incorrecto.

🟠 **Filter "Tu camino" tiene efecto sutil** (opacity 0.4) que el user puede no notar.

🟠 **6 estados visuales del slot** son muchos para aprender — legend solo cubre 2.

🟠 **Save state + lock status + counter compiten** en el mismo bloque de intro actions.

🟠 **Mode switch sin warning** al cambiar (pierde predicción del modo previo).

🟠 **isProjected banner explicativo largo** — texto denso.

🟠 **Sin scroll indicators** en `.bracket-scroll` horizontal.

🟠 **Champion sin comparison post-final** ("Predijiste X · campeón real Y").

🟠 **Empty state "Sin grupos privados"** sin opción "Unirme con código".

🟡 **"R32" prefix vs "16avos" header inconsistencia naming**.

🟡 **Placeholder "Pick fase anterior"** críptico — debería ser "Esperando R32-1 →".

🟡 **Loading sin skeleton**.

🟡 **Counter "X / N" en text-mute 11px** — info importante muy chica.

🟡 **Lock status con `<br>`** layout frágil.

🟡 **Score dentro del slot button** — ancho variable.

🟡 **No hay tabla de scoring por fase** visible (solo "+2 a +16 pts" como rango).

🟡 **Emojis** 🔮🏆⏳✓●⚠ — anti-pattern.

🟡 **Default filter "Todos"** — "Tu camino" sería más útil para users con picks.

🟢 **Mode switch sin a11y** (`role="tablist"` falta).

🟢 **CTAs hint contextual al final** del legend es buen pattern.

---

## 7. Antipatrones detectados

| Regla | Violación |
|---|---|
| **Avoid duplicate data** | 4 stats × 4 surfaces |
| **Density adaptation** | Bracket de 9 cols sin variante mobile |
| **Scroll affordance** | No hay scroll indicators en .bracket-scroll |
| **Visual states clarity** (ui-ux-pro-max) | 6 slot states, legend cubre solo 2 |
| **Empty states** (Forms & Feedback) | Loading sin skeleton |
| **State warning** | Mode switch pierde predicción sin warn |
| **Flow consistency** | Link "Ir a mis terceros" mal targeteado |
| **no-emoji-icons** | 🔮🏆⏳ |
| **CTA label specificity** | "Crear un grupo →" OK; "Unirme" falta |

---

## 8. Anclas para el redesign

### Core

1. **Grid de bracket** con visualización clara de progresión
2. **Slot button con estado** (mine vs winner vs empty vs discarded)
3. **Champion display** en final card
4. **Empty states encadenados** (sin grupos → sin grupos predichos → sin terceros)
5. **Save state visible** (4 estados)
6. **Lock status pre-/post-kickoff**

### Contextual

- **Pre-torneo**: bracket vacío o proyectado, foco en "predict explicit" CTA
- **Durante torneo**: bracket proyectado se vuelve real, mode switch decisivo
- **Post-torneo**: histórico con todos los aciertos/fallos marcados

### Quitar

- Page header 4 stats (duplica 3 surfaces más)
- Page tabs (consolidar con el resto de picks routes — ya está OK)
- Emojis 🔮🏆⏳

### Agregar

- **Skeleton loading** del grid
- **Scroll indicators** (← →) cuando bracket overflow
- **Mobile bracket layout** — accordion por fase o zoom in/out
- **Scoring table** visible (R32=+2, Oct=+4, etc.) en vez de rango "+2 a +16"
- **Champion comparison** post-final ("Predijiste X · real Y")
- **Discarded slot enhanced** (más prominente, no solo dim)
- **Tooltip on slot hover** explicando estado actual
- **Warning al mode switch** que se pierde predicción
- **Default filter "Tu camino"** para users con picks
- **Empty state "Sin grupos"** con opción "Unirme con código"
- **Counter más prominente** ("Has predicho 8 de 31 llaves")
- **Final card con incentivo** "+25 pts si acertás" pre-match
- **Better placeholder** "Esperando R32-1 →" en lugar de "Pick fase anterior"

### Bug fix

- **Link "Ir a mis terceros"** → cambiar a `/picks/group-stage?view=pred` (donde están en la sidebar) en lugar de `/profile/special-picks`.

---

## 9. Resumen ejecutivo para el redesign

**El bracket es la pantalla visualmente más rica y más demandante de la app.** Hace 4 cosas bien:
1. Empty states encadenados (checklist es excelente)
2. Save state diferenciado (4 variantes con aria-live)
3. Mode switch para users con grupos en ambos modos
4. Layout simétrico que comunica progresión

Pero falla en 3 cosas:
1. **Mobile no escala**: 9 columnas en scroll horizontal sin indicators
2. **6 estados visuales sin legend completa** — el user no aprende todos
3. **Bug de flow** en empty state (terceros mal linkeado)

### 3 decisiones de diseño que cambian todo

1. **Mobile-first redesign del bracket grid**. Options:
   - Accordion por fase (mostrar 1 fase a la vez, navegar con tabs R32/Oct/C/S/F)
   - Zoom in/out (gesto pinch)
   - Layout vertical en mobile (R32 stacked, scroll vertical normal)
   El layout actual sirve desktop pero rompe en mobile.

2. **Sistema unificado de slot states con legend completa + tooltips**. 6 estados merecen:
   - Iconos sutiles dentro del slot (✓ acertaste, ✕ fallaste, ⏳ esperando, _ vacío)
   - Tooltip on hover/tap explicando "Predijiste X · resultado Y · +N pts" o "Esperando R32-1"
   - Legend que muestre los 6 estados, no solo 2.

3. **Scoring table visible** en lugar de rango "+2 a +16":
   ```
   R32   +2 pts    Cuartos +6 pts    Final  +16 pts
   Oct   +4 pts    Semis   +10 pts   Campeón +25 pts
   ```
   El user querría saber dónde están los puntos antes de decidir.

### Bug fix urgente

- Cambiar link CTA "Ir a mis terceros" de `/profile/special-picks` (incorrecto) a `/picks/group-stage` con view=pred (donde sidebar de terceros vive). El user que sigue ese link hoy aterriza en la pantalla equivocada.
