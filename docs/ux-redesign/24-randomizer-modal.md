# Análisis UX: Randomizer Modal — RandomizerModalComponent

> Surface #24 del walkthrough. Modal auto-pick generator.
> Permite al user pre-llenar picks de marcadores con números aleatorios en un rango configurable.
> Disparado desde `/picks` (lista de partidos) via instance child component.
> Uso: "exploratorio" — los picks resultantes son editables después.

---

## 1. Identidad

- **Propósito**: reducir fricción para users que quieren "rellenar" muchos picks rápido sin pensar cada uno.
- **Audiencia**: users con muchos partidos pendientes que prefieren pre-fill + ajustar selectivamente.
- **Frecuencia**: media-baja. Útil al inicio del torneo (96 partidos × marcador). Después, solo para casos puntuales.
- **Entry points**: botón en `/picks` toolbar (probable). Surface accesible solo desde picks-list parent.

---

## 2. Estructura — flow simple

```
Click "🎲 Aleatorio" en /picks
        │
        ▼
   ┌─────────────────────────────────────┐
   │ Modal abierto                       │
   │                                     │
   │ Section 1: ¿Para qué partidos?      │
   │  - Hoy (N partidos)                 │
   │  - 1ª fecha · 4 jun (N)             │
   │  - 2ª fecha · 5 jun (N)             │
   │  - 3ª fecha · 6 jun (N)             │
   │  - Todos los próximos (N)           │
   │                                     │
   │ Section 2: Rango de marcadores      │
   │  Mínimo [- 0 +]                     │
   │  Máximo [- 3 +]                     │
   │  Ejemplo: 2—1                       │
   │                                     │
   │ Footer:                             │
   │  [Cancelar] [🎲 Generar para N]      │
   └──────────┬──────────────────────────┘
              │ click "Generar"
              ▼
   Para cada match:
   - home = randInt(min, max)
   - away = randInt(min, max)
   - enqueue al sync
   ───────►
   Toast: "Picks generados para N partidos · sincronizando…"
   syncNow()
   close()
```

**1 step + 2 sections + footer**. UI lineal, sin estados intermedios.

---

## 3. Componentes desglosados

### 3.1 Modal container

**A11y**:
- ✓ `role="dialog"`, `aria-modal="true"`, `aria-labelledby="randomizer-modal-title"`
- ✓ `cdkTrapFocus [cdkTrapFocusAutoCapture]="true"` (P0 done)
- ✓ `(keydown.escape)="close()"`
- ✓ Backdrop click close via `.picks-modal__close-overlay`
- 🟡 Sin animation entrada/salida.

### 3.2 Header

**Render**:
```
🎲 Picks aleatorios                              [✕]
12 partidos · rango 0–3
```

**Análisis**:
- ✓ Title + meta line con feedback live (count + range).
- ✓ Plural handling ("1 partido" vs "2 partidos").
- ✓ `aria-hidden="true"` en 🎲 emoji.
- 🟠 **Emoji 🎲** en title — anti-pattern (mismo issue que toda la app).
- 🟠 **`✕` close button** unicode anti-pattern.
- 🟡 Meta line muy útil (count + rango actualizando en tiempo real).

### 3.3 Section 1 — Selector de partidos

**Render**:
```
¿Para qué partidos?

┌──────────────────────┐  ┌──────────────────────┐
│ 📅 Hoy               │  │ 1ª fecha · 4 jun     │
│ 6 partidos           │  │ 8 partidos           │
└──────────────────────┘  └──────────────────────┘
┌──────────────────────┐  ┌──────────────────────┐
│ 2ª fecha · 5 jun     │  │ 3ª fecha · 6 jun     │
│ 8 partidos           │  │ 4 partidos           │
└──────────────────────┘  └──────────────────────┘
┌──────────────────────────────────────────────┐
│ 🎲 Todos los próximos                        │
│ 26 partidos                                  │
└──────────────────────────────────────────────┘
```

**Estados**:
- Default: border-radius + border gray
- Hover: border darker
- Active (selected): border green + background green-soft
- Disabled (count===0): opacity 0.45 + cursor not-allowed

**A11y**:
- ✓ `role="group"` con aria-label "Filtro de partidos"
- ✓ `aria-pressed` para indicar estado seleccionado
- ✓ Disabled cuando count===0

**Análisis**:
- ✓ **Cards con count visible** — affordance + transparencia (user sabe cuántos antes de elegir).
- ✓ Grid 1col mobile, 2col desktop.
- ✓ Plural handling correcto.
- ✓ Disabled visual + funcional cuando 0 partidos.
- ✓ "Todos los próximos" como escape al final.
- 🔴 **"📅 Hoy" + "🎲 Todos los próximos" emojis** en labels — anti-pattern.
- 🟠 **Las cards 1ª/2ª/3ª fecha sin emoji** pero "Hoy" y "Todos" sí — **inconsistencia visual entre options**.
- 🟠 **"1ª fecha · 4 jun"** — formato date "4 jun" sin year. Si torneo cruza years (no este caso pero genérico), ambiguo.
- 🟠 **No hay opción "Personalizado"** (multi-select específico de matches). User pega para tomar el set completo o nada.
- 🟠 **"Hoy" puede estar duplicado con "1ª fecha"** si hoy coincide con la fecha 1. User ve 2 cards con misma data.
- 🟡 **Sin indicador de partidos YA con pick** — si el set incluye matches que el user ya tiene pick custom, **se sobrescriben** sin warning.

### 3.4 Section 2 — Rango de marcadores

**Render**:
```
Rango de marcadores
Sistema asigna 2 números aleatorios entre min y max.

   MÍNIMO          MÁXIMO
  [−  0  +]       [−  3  +]

Ejemplo: 2—1
```

**Steppers**:
- Min y Max independent
- Bounds: [0, 9]
- Auto-correct: si min > max, max = min (y viceversa)
- Disabled boundaries

**A11y**:
- ✓ Botones +/− con disabled state
- ✓ Focus-visible outline correcto (P4 done)
- 🟠 **Sin aria-label en los steppers** — un screen reader oye "− 0 +" sin contexto de que es "rango mínimo".
- 🟠 **Sin aria-valuenow / aria-valuemin / aria-valuemax** — pattern correcto para steppers a11y.

**Análisis**:
- ✓ **2 steppers visuales** son claros y táctiles.
- ✓ Auto-correct entre min/max previene state inválido.
- ✓ Bounds [0, 9] razonables.
- ✓ Hint explicativo arriba.
- ✓ Sample preview live ("Ejemplo: 2—1") — **brillante UX**: user ve qué tipo de scores va a obtener.
- 🟠 **`−` y `+` unicode** en stepper buttons — funcional pero anti-pattern. SVG icons más limpios.
- 🟠 **Sample preview cambia en cada change-detect** (es random) — visualmente "tiembla" al ajustar el range. Hard to read. Quizás mostrar 3 ejemplos fijos en lugar de 1 que cambia.
- 🟠 **Min y Max independientes pero acoplados visualmente** — si user setea min=5 max=2, hay auto-correct silencioso. Sin animation o feedback que muestre "ajustamos el otro slider para vos".
- 🟡 **Sin opciones preset** (ej. "Conservador 0-2", "Mixto 0-3", "Goleado 2-5") — power user feature.
- 🟡 **Sin distribución preview** ("Esto generará probablemente 0-3 más que 4-9").

### 3.5 Footer

**Render**:
```
[Cancelar]                  [🎲 Generar para 12 partidos]
```

**Análisis**:
- ✓ Cancelar a la izq + primary a la der.
- ✓ Plural handling.
- ✓ Disabled si selectedCount === 0.
- ✓ Texto del botón refleja la acción específica.
- 🟠 **Emoji 🎲** en botón — anti-pattern.
- 🟠 **Sin loading state** — el `generate()` es síncrono (enqueue), pero `syncNow()` no es awaited. User no ve si la sincronización falla.
- 🟠 **Sin confirmación si sobrescribe picks existentes**:
  - Si el user ya tiene picks custom en algunos matches del set, el generate los sobrescribe SIN preguntar.
  - Esto puede destruir trabajo del user.

### 3.6 generate() behavior

**Behavior**:
1. Para cada match del set:
   - `home = randInt(min, max)`
   - `away = randInt(min, max)`
   - `sync.enqueue('pick', m.id, { home, away, homeTouched: true, awayTouched: true })`
2. Toast success "Picks generados para N partidos · sincronizando…"
3. `syncNow()`
4. `close()`

**Análisis**:
- ✓ Enqueue al sync (consistente con UX local-first de picks).
- ✓ `homeTouched: true, awayTouched: true` marca como editado por user (para tracking).
- ✓ Toast immediate feedback.
- ✓ syncNow inmediato para subir picks al backend.
- 🔴 **Sobrescribe picks existentes sin warning** — bug UX serio. Si el user gastó 30 min armando predicciones de un grupo, y clickea Generar con filter="3ª fecha" pensando que solo agrega los que faltan, **destruye** los que ya tenía.
- 🟠 **`syncNow()` no es awaited** — si la sincronización falla, el toast ya dijo "sincronizando…" pero no hay update posterior.
- 🟠 **No undo / no preview** — el user no puede revisar los picks antes de confirmarlos.
- 🟡 **`Math.random()` no es criptográficamente seguro** — irrelevante para este caso (no es competición seria) pero worth noting.

### 3.7 dateGroups computed

**Lógica**:
1. Group upcoming matches por YYYY-MM-DD
2. Sort por date ascending
3. Map a label "Nª fecha · D mmm"

**Análisis**:
- ✓ Computed reactivo (re-eval al cambiar matches input).
- ✓ Solo upcoming (filter status !== FINAL && kickoff > now).
- 🟠 **"fecha" en español puede confundir** — en futbol "fecha" significa "matchday" pero también significa "date". "Jornada" o "Día" sería más universal.
- 🟠 **Solo muestra primeras 3 fechas** — si el torneo tiene 10 matchdays restantes, las fechas 4-10 quedan inaccesibles. Solo el escape "Todos" puede tomarlas todas.
- 🟠 **"Hoy"** depende del browser timezone — si el user está en zone X y kickoff es en zone Y, puede haber discrepancia.

### 3.8 Cross-cutting consistency con auth family

- 🟠 **`✕` close button** — mismo issue de auth modals.
- 🟠 **Emoji icons** — mismo issue.
- ✓ **Backdrop blur** consistente con group-actions modals.
- ✓ **CDK A11yModule** consistente.

---

## 4. Cross-cutting · hallazgos UX (priorizados)

🔴 **Sobrescribe picks existentes sin warning** — bug UX grave.

🔴 **Emojis críticos en CTAs**: 🎲 title, 🎲 botón Generar, 📅 Hoy, 🎲 "Todos los próximos".

🟠 **Inconsistencia emoji entre options** (Hoy + Todos sí, fechas 1/2/3 no).

🟠 **Sin opción "Personalizado"** (multi-select específico).

🟠 **"Hoy" duplicable con "1ª fecha"** si coinciden.

🟠 **Sin indicador picks ya custom** en el set.

🟠 **Sin loading state** en Generar / syncNow no awaited.

🟠 **Sin undo / preview** post-generate.

🟠 **Solo 3 fechas visibles** (resto solo via "Todos").

🟠 **Sample preview cambia en cada render** — visualmente ruidoso.

🟠 **Sin animation auto-correct** min/max swap.

🟠 **Sin aria-label en steppers** + sin aria-valuenow.

🟠 **`−` y `+` unicode** en stepper.

🟠 **"fecha" ambiguo** español (matchday vs date).

🟠 **"Hoy" timezone-dependent**.

🟠 **`syncNow()` no awaited**.

🟡 **Sin preset ranges** ("Conservador", "Goleado").

🟡 **Sin distribución preview**.

🟡 **Sin animation modal**.

🟡 **`Math.random()` no crypto** (irrelevante).

🟡 **Sin date "4 jun"** sin year (no aplica acá pero genérico).

🟡 **Sin warning "sobrescribe picks existentes"**.

🟢 **A11y core** (focus trap, aria, Escape).

🟢 **Plural handling** correcto.

🟢 **Sample preview** concepto brillante.

🟢 **Auto-correct min/max** preserva state válido.

🟢 **Cards con count visible** (transparencia).

🟢 **Disabled state** cuando count===0.

🟢 **Backdrop click close**.

---

## 5. Antipatrones detectados

| Regla | Violación |
|---|---|
| **no-emoji-icons** | 🎲 title + botón, 📅 Hoy, 🎲 Todos, −/+ steppers, ✕ close |
| **Destructive sin confirm** | Sobrescribe picks existentes |
| **Inconsistencia visual** | Emojis solo en algunas options |
| **A11y stepper pattern** | Sin aria-valuenow/min/max |
| **Side effect no observable** | syncNow no awaited |
| **Power-user gaps** | Sin preset / sin custom multi-select |
| **Ruido visual** | Sample preview cambia en cada render |
| **Coverage limitation** | Solo 3 fechas accesibles directo |
| **i18n ambiguity** | "fecha" matchday vs date |

---

## 6. Anclas para el redesign

### Core

1. **Modal con 2 sections**: filter + range
2. **Filter cards** con count visible
3. **Steppers min/max** con auto-correct
4. **Sample preview** live
5. **Backdrop blur** + A11y completo
6. **Enqueue al sync** + toast feedback
7. **Disabled cuando count===0**

### Quitar

- Emojis 🎲 📅 (title, button, options) → SVG icons o letras
- −/+ unicode steppers → SVG ±
- ✕ close → SVG icon
- Emoji inconsistency entre options

### Agregar

- 🔴 **Warning "sobrescribe picks existentes"**: detectar cuántos matches del set ya tienen pick custom y advertir antes de Generar
- 🔴 **Confirmation dialog** secundario: "Sobrescribirás 5 picks que ya tenías. ¿Continuar?"
- **Opción "Solo partidos sin pick"** filter
- **Opción "Personalizado" (multi-select)**: lista con checkboxes para elegir matches puntuales
- **Pagination de fechas**: 4ª/5ª/6ª... o un dropdown si son muchas
- **Sample preview FIJO** o 3 ejemplos en lugar de 1 que cambia
- **Animation auto-correct** min/max swap (subtle toast o highlight)
- **aria-valuenow/min/max** en steppers
- **aria-label** en steppers ("Rango mínimo de goles")
- **Loading state** durante syncNow (botón disabled + spinner)
- **Undo toast** post-generate ("Picks generados. [Deshacer] 5s")
- **Preset ranges**: "Conservador 0-2", "Mixto 0-4", "Goleado 1-6"
- **Distribución preview**: "0-3 son 70% más probables que 4-9"
- **Animation entrada modal** (scale + fade)
- **"Día" en lugar de "fecha"** o tooltip aclarando

### Considerar

- **Bias options**: "Favorecer al local" / "Equilibrado" / "Favorecer visitante"
- **Smart randomizer**: usar historial de equipos (ranking FIFA) para sesgar probabilidades
- **Save preset**: "Guardar mi rango favorito"
- **Multi-tournament**: extensible si surge segundo torneo

---

## 7. Resumen ejecutivo

**Surface bien implementado en concepto** — filter cards + steppers + sample preview + backdrop modal con A11y. Lo que falla:

1. 🔴 **Sobrescribe picks existentes sin warning**: el problema MÁS grave. Si user clickea "Generar para 3ª fecha" pensando que solo rellena los vacíos, **destruye los que ya tenía**. Bug UX que cuesta trust.

2. 🔴 **Emojis críticos**: 🎲 title + botón Generar + 📅 Hoy + 🎲 Todos los próximos. Para un componente con propósito utility (auto-pick), el emoji-icon load es alto.

3. 🟠 **Power-user gaps**: sin "Personalizado" / sin "Solo sin pick" / sin presets. El randomizer es un power-user feature pero le falta optionality.

### 3 decisiones de diseño que cambian todo

1. **Warning + confirmation antes de sobrescribir**: detectar matches con pick custom y mostrar count en card del filter ("Hoy · 6 partidos, 3 con pick"). Si user clickea Generar, dialog "Sobrescribirás 3 picks. ¿Continuar?". **Fix MÁS importante** — previene destruir trabajo del user.

2. **Filter "Solo partidos sin pick"**: agregar al menos esta option para evitar el problema sin requerir confirm. Otras opciones útiles: "Personalizado" (multi-select), "1ª fecha sin pick", etc.

3. **Undo post-generate**: toast con "[Deshacer] 5s" durante los primeros 5s post-Generar. Si user se arrepiente, rollback. Pattern UX standard (Gmail, Slack delete).

### Cambios secundarios

- SVG icon system reemplazando 🎲 📅 ✕ −/+
- aria-valuenow + aria-label steppers
- Loading state Generar + syncNow awaited
- Sample preview FIJO (3 ejemplos)
- Animation auto-correct swap
- Preset ranges
- Distribución preview
- "Día" en lugar de "fecha"
- Pagination o dropdown 4ª-Nª fecha
- Confirmation si "Hoy" duplica "1ª fecha"
- Animation entrada modal

### Considerar features

- Bias options (local/visitante)
- Smart randomizer (FIFA ranking)
- Save preset favorite
- Multi-tournament extensibility

**Nota retrospectiva**: este surface es **utility power-user** — los users avanzados que lo usan esperan más control. El gap principal es la **falta de respeto al estado existente del user** (sobrescribe sin avisar) + opciones limitadas. Es un buen candidato para iteración Q3 si el feedback de retención muestra usage actual.
