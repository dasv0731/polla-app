# Análisis UX: `/picks/match/:id` — PickDetailComponent

> Surface #3 del walkthrough. Vista profunda de un partido individual.
> Es derivativa de `/picks` (link "Ver detalles →" de cada match card).

---

## 1. Identidad

- **Propósito**: profundizar en un partido específico. Pre-match: ver contexto + editar pick + countdown. Post-match: ver veredicto + breakdown de puntos + cómo le fue al resto.
- **Audiencia**: user que quiere entender un partido en particular — antes de predecir (research) o después (revisión).
- **Frecuencia**: media. No es daily-use como `/picks`, pero high-value para partidos clave.
- **Entry points**: link "Ver detalles →" desde cada match-card en `/picks`, eventualmente desde notificaciones (post-match) o desde el right-rail "Ver previa completa →".

---

## 2. Estructura — mapa general

Esta pantalla tiene **2 estados muy distintos** según `isFinal()` que rompen el layout en branches separados:

```
┌─────────────────────────────────────────────────────┐
│ COMÚN A LOS DOS ESTADOS                             │
├─────────────────────────────────────────────────────┤
│ [hero .mh]                                          │
│ [breadcrumb] Mis picks / X vs Y                     │
│ [back CTA] "‹ Volver a mis picks"                   │
└─────────────────────────────────────────────────────┘

PRE-MATCH (status !== FINAL)        POST-MATCH (isFinal())
─────────────────────────────       ─────────────────────────────
[hero pre-match]                     [hero post-match]
  ├── competition                     ├── "FT · Final"
  ├── teams (size 80)                 ├── competition
  ├── status label                    ├── teams (con winner highlight)
  ├── kickoff time + day              ├── score "2 — 1"
  ├── INLINE PICK EDITOR              └── result label per side
  │   ├── label "Tu pick"                 (Victoria/Derrota/Empate)
  │   ├── 2 score inputs              
  │   └── save state msg              [pick-vs-result section]
  │     ├── "Cerrado · kickoff…"        ├── verdict text + variant
  │     ├── "Guardando…"                ├── verdict sub
  │     ├── "✓ Guardado"                ├── pts ganados "+N"
  │     └── "Sin pick · escribí…"       ├── cells: Tu pick / Resultado real
  │                                     └── breakdown:
  └── countdown D/H/M/S                     ├── Marcador exacto ✓/✗ · 5 pts
      (solo si !isPast())                   ├── Diff + resultado ✓/— · 3 pts
                                            ├── Solo resultado ✓/— · 1 pt
[match info section]                        ├── Multiplicador (xN)
  ├── Fase                                  └── Total +N pts
  ├── Multiplicador (xN · max Y pts) 
  ├── Kickoff (full date)             [aggregate stats section]
  ├── Estadio "Por confirmar"           ├── kicker "Polla en vivo"
  ├── Sede "—"                          ├── h2 "Cómo le fue al resto"
  └── Árbitro "Por confirmar"           ├── "{N} picks recibidos"
                                        └── 2 progress bars:
                                            ├── Acertaron resultado %
                                            └── Acertaron marcador exacto %
```

**No tiene tabs internos user-switchable.** El switch es automático según el estado del partido.

---

## 3. Estado A · Pre-match (incluye LIVE)

### 3.1 Sub-estados implícitos

| Sub-estado | Condición | Diferencia visual |
|---|---|---|
| **Próximo** | kickoff > now | Editor habilitado + countdown visible |
| **LIVE** | kickoff < now && status !== FINAL | Editor deshabilitado con msg "Cerrado · kickoff alcanzado" + countdown oculto |
| **Esperando FT** | status === FINAL pero scores null | Mismo que LIVE (raro — la lógica del condicional cae acá) |

### 3.2 Componentes pre-match

#### a) Hero `.mh` — sección visual top

**Render**:
```
                Mundial 2026 · Octavos

  🇲🇽          [status / "Para empezar"]              🇦🇷
  MEX                                                  ARG
            13:00                          
            Sáb 14 jun

            ┌─────────────────────┐
            │  Tu pick            │
            │  [ 2 ] — [ 1 ]      │
            │  ✓ Guardado          │
            └─────────────────────┘

          ╔═══════════════════════╗
          ║ 12  03  45  22        ║
          ║ Días Hrs Min Seg      ║
          ╚═══════════════════════╝
```

**Datos**:

| Dato | Origen | ¿Relevante? |
|---|---|---|
| Competition "Mundial 2026" | constante | ✗ redundante (sidebar lo marca) |
| Phase name "Octavos" | API phase | ✓ contextual |
| Team flag + name × 2 | API teams | ✓ core |
| Status label | computed | ✓ (pero ver §3.4) |
| Kickoff time + day | computed | ✓ core |
| Inline pick editor (2 inputs) | sync service | ✓ core |
| Save state msg (4 variantes) | computed | ✓ buen feedback |
| Countdown D/H/M/S | computed reactivo cada 1s | ✓ pero verboso |

**Análisis**:
- ✓ Editor inline en hero — buen pattern. El user puede predecir sin scrollear.
- ✓ Save state con 4 variantes diferenciadas — feedback rico.
- ✓ Disabled durante isPast() con mensaje claro.
- ⚠ Countdown D/H/M/S es muy grande (4 cells × ~80px alto). Para un partido en 12 días, los 4 valores grandes son innecesarios. Mejor: "En 12 días" simple, y desplegar D/H/M/S solo cuando < 24h.
- ⚠ Status label + kickoff time + day apilados en el centro del hero — denso en mobile.
- 🟡 "FT · Final" badge en post-match es elegante. Pre-match el equivalente debería ser "EN 12 DÍAS" o "EN 2H 34M" — un solo dato grande, no 4.

#### b) Pick editor (banner)

**Render**:
```
       Tu pick
   [ 2 ] — [ 1 ]
    ✓ Guardado
```

**Datos**:
- 2 inputs con `inputmode="numeric"` `maxlength="1"`
- Disabled si `isPast()`
- Save state con 4 mensajes según estado

**Análisis**:
- ✓ Auto-save via `PicksSyncService`.
- ✓ Estados de save bien comunicados (4 variantes).
- ⚠ `maxlength="1"` — bloquea marcadores 10+ (raro pero posible).
- ⚠ Sin step buttons (`inc()` / `dec()` existen en código pero no se exponen). En desktop con keyboard ⬆⬇ no funcionan. Considerar steppers tap-friendlier en mobile.
- 🟡 Sin diff visible. Si el user predice 2-1 pero ya tenía 3-0 guardado, no se ve el diff — el placeholder vacío y el valor previo se mezclan.

#### c) Countdown

**Render**: 4 cells (D/H/M/S) con value grande + label pequeño.

**Análisis**:
- ✓ Re-evalúa cada 1s vía `timer`.
- ⚠ Sobrediseñado para partidos lejanos. "12 días 3 horas" suena bien hasta T-24h, después sí tiene sentido el detalle D/H/M/S.
- ⚠ En mobile 4 cells ~120px wide = 480px total → wrap o squeeze.
- 🟡 No respeta `prefers-reduced-motion` (timer cada 1s genera reflows en el SR). Aceptable porque solo cambian los digits.

#### d) Breadcrumb

**Render**: `Mis picks / MEX vs ARG`.

**Análisis**:
- ✓ Buen orientación.
- ⚠ En FINAL muestra "MEX 2-1 ARG" en el breadcrumb. Útil pero podría ser más informativo: "MEX 2-1 ARG · tu pick: 2-1".
- 🟡 No tiene back-button — el user usa el browser back o el CTA al final de la página.

#### e) Match info section (datos del partido)

**Render**: grid 6-up:
```
[Fase Octavos] [Multiplicador x2 · max 10 pts] [Kickoff 14 jun 13:00]
[Estadio Por confirmar] [Sede —] [Árbitro Por confirmar]
```

**Datos**:

| Dato | Valor mostrado actualmente | ¿Relevante? |
|---|---|---|
| Fase | "Octavos" | ✓ pero ya está en hero |
| Multiplicador | "x2 · max 10 pts" | ✓ educativo |
| Kickoff full | "14 jun 13:00" | ✗ ya está en hero (kickoff time + day) |
| Estadio | **"Por confirmar"** | ✗ placeholder vacío |
| Sede | **"—"** | ✗ placeholder vacío |
| Árbitro | **"Por confirmar"** | ✗ placeholder vacío |

**Análisis crítico**:
- 🔴 **Estadio / Sede / Árbitro son placeholders permanentes** — el backend nunca completa estos datos. Mostrar "Por confirmar" indefinidamente da impresión de app no terminada.
- 🔴 **Fase y Kickoff duplican el hero** — el user ya los vio arriba.
- **Resultado neto**: de los 6 items, solo el Multiplicador aporta info nueva pre-match.

**Veredicto**: la sección entera es **casi pura redundancia + placeholders**. Eliminar o reemplazar con info de verdad útil:
- Forma reciente de cada equipo (últimos 5 partidos)
- Historia head-to-head ("Mundial 2014: ARG 1-0 MEX")
- Aggregate del resto: "67% de la polla picó victoria de MEX"
- Bonus phase indicator visual (no solo "Multiplicador x2")
- Trivia activa CTA si aplica

### 3.3 Hallazgos pre-match

🔴 **Estadio / Sede / Árbitro placeholders permanentes** sin contenido real.

🔴 **Fase y kickoff duplicados** en hero + match info section.

🟠 **Pre-match no muestra "aggregate del resto"** — `stats()` existe pero solo se renderiza en post-match. Useful pre-match para social proof.

🟠 **Countdown D/H/M/S verboso** para partidos lejanos.

🟠 **No hay trivia indicator** en este surface (siendo que es la vista profunda del partido, debería destacar si hay trivia activa).

🟡 **No hay forma / historia head-to-head**.

🟡 **Multiplier solo como texto** sin badge visual destacado.

🟡 **Editor sin diff visible** entre pick previo y nuevo.

---

## 4. Estado B · Post-match (isFinal)

### 4.1 Componentes post-match

#### a) Hero post-match

**Render**:
```
[FT · Final]              [Mundial 2026 · Octavos]

🇲🇽  MEX        2 — 1        ARG  🇦🇷
   [Victoria]            [Derrota]
```

**Datos**:
- Badge "FT · Final" — claro y distintivo
- Competition + phase
- Teams con `mh__side--winner` class cuando el lado ganó (highlight visual)
- Score "2 — 1"
- `resultLabel('home')` / `resultLabel('away')`: "Victoria" / "Derrota" / "Empate"

**Análisis**:
- ✓ Bien diferenciado del pre-match (clear visual cue de "esto ya pasó").
- ✓ Winner highlight es elegante.
- ✓ Labels Victoria/Derrota/Empate son redundantes con el score pero confirman semánticamente.
- 🟡 "Empate" se ve en ambos sides — podría ser un solo badge centrado abajo.

#### b) Pick vs Result section

**Render**:
```
        ┌─────────────────────────────────────┐
        │  ¡Acertaste el marcador exacto!     │  ← verdict text
        │  Tier 1 (5 pts base) × x2 = 10 pts. │  ← verdict sub
        │                                      │
        │  +10                                 │
        │      Puntos ganados                  │
        └─────────────────────────────────────┘

        ┌─────────────────┬─────────────────┐
        │   Tu pick       │  Resultado real │
        │     2 — 1       │      2 — 1      │
        └─────────────────┴─────────────────┘

        Cómo se calculan tus puntos
        (Tier de acierto excluyente × mult de fase)

        Marcador exacto         ✓    5 pts base
        Diferencia + resultado  —    3 pts base
        Solo resultado (V/E/D)  —    1 pt base
        Multiplicador (Octavos)      ×2
        ───────────────────────────────────
        Total                          +10 pts
```

**Datos**:

| Sub-componente | Dato | Origen | ¿Relevante? |
|---|---|---|---|
| Verdict text | 4 variantes (exact/result/miss/none) | computed `verdictText` | ✓ core |
| Verdict variant class | `--miss` / `--none` | computed `verdictKind` | ✓ |
| Verdict sub | descripción + multiplicador | computed `verdictSub` | ✓ educativo |
| Pts ganados | `p.pointsEarned` | API | ✓ core |
| Cells: Tu pick / Resultado real | from pick + match | ✓ core (comparación) |
| Breakdown table | 4 rows (3 tiers + multiplier) + total | computed | ✓ educativo |

**Análisis**:
- ✓ Excellence en información. Es el detalle más rico de la app.
- ✓ Educación clara sobre el sistema de scoring.
- ✓ "Tier excluyente" comunicado bien — el user entiende que solo el mejor tier cuenta.
- ⚠ Tabla de breakdown texto-pesada. Podría visualizarse como progress bar escalonado:
  ```
  Solo resultado ───▶ Diff+resultado ───▶ Marcador exacto
      1 pt              3 pts                 5 pts
                                           ✓ YOU
  ```
- 🟡 Verdict variants no incluyen "exact" como clase — solo `--miss` y `--none`. Probablemente "hit" usa el default style. Inconsistencia menor.
- 🟡 La línea "Tier de acierto excluyente — solo el más alto cuenta" tiene tipografía muy chica (11px). Es información load-bearing.

#### c) Aggregate stats section ("Cómo le fue al resto")

**Render**:
```
Polla en vivo
Cómo le fue al resto

{N} picks recibidos

Acertaron resultado            45%
[████████████░░░░░░░░░░░░]

Acertaron marcador exacto      12%
[██████░░░░░░░░░░░░░░░░░░]
```

**Datos**:

| Dato | Origen | ¿Relevante? |
|---|---|---|
| Total picks | `s.total` | ✓ context |
| Result % | `s.resultPct` | ✓ social proof |
| Exact % | `s.exactPct` | ✓ social proof |

**Análisis**:
- ✓ Excelente data — social proof + ego boost ("Yo soy de los 12% que acertó exacto").
- ⚠ **Solo se muestra POST-FT** — debería mostrarse pre-match también ("60% de la polla picó victoria de MEX") como social proof / context.
- 🟡 Progress bars sin labels en los extremos (0% — 100%).
- 🟡 No muestra cómo se distribuye el pick popular ("60% home win · 25% empate · 15% away win"). Solo aciertos.

### 4.2 Hallazgos post-match

🔴 **Aggregate stats deberían mostrarse pre-match también** — social proof + context valioso.

🟠 **Breakdown table podría ser visual** (stepped progress bar en lugar de tabla texto).

🟠 **No hay comparación con la performance global del user** ("Hoy: +10 pts · Promedio últimos 5: +6 pts").

🟡 **Variants className `--miss` / `--none` pero no `--exact`** — inconsistencia.

🟡 **Verdict sub-line muy pequeña** (11px) para info load-bearing.

🟡 **No hay link a la trivia post-match** (si hubo trivia para este match, mostrar resultados).

🟡 **No hay link al ranking del grupo** ("Sos #3 en Oficina Q1 con estos 10 pts").

---

## 5. Componentes shared

### 5.1 `app-team-flag`

Re-uso del component analizado en doc 02-picks.

**Aquí**: `size=80` (vs `size=22` en match-card). Más grande, más prominente. Crest si admin subió, fallback flag-icons.

**Análisis**:
- ✓ Size=80 es bien visible.
- 🟢 En partidos con crest URL fallback, el user debe esperar la carga visual (no hay skeleton).

### 5.2 Breadcrumb

**Render**: `Mis picks / MEX vs ARG`

**Análisis**:
- ✓ Anchor a `/picks` funciona.
- ⚠ En FINAL podría incluir el resultado: "MEX 2-1 ARG · tu pick: 2-1".
- 🟡 Si el user llegó vía notif deep-link, el breadcrumb dice "Mis picks" pero no es donde estaba antes.

### 5.3 Back CTA

**Render**: botón primary "‹ Volver a mis picks" centrado al final.

**Análisis**:
- ✓ Acción clara para regresar.
- ⚠ Solo al final — un user en mobile debe scrollear todo. Considerar back arrow sticky-top o el browser-back-friendly.
- 🟡 Label "Volver a mis picks" es bueno. Si vino vía notif, debería decir "Volver a notificaciones" (no implementado).

---

## 6. Datos completos — inventario unificado

### Pre-match

| Dato | Sección | Estado |
|---|---|---|
| Competition "Mundial 2026" | hero | duplica sidebar |
| Phase "Octavos" | hero + match-info | ↻ consolidar |
| Team flag/name × 2 | hero | ✓ core |
| Status label | hero | ✓ |
| Kickoff time + day | hero | ✓ core |
| Pick editor (2 inputs + save state) | hero | ✓ core |
| Countdown D/H/M/S | hero | verboso pre-T-24h |
| Multiplicador "x2 · max 10 pts" | match-info | ✓ educativo |
| Kickoff full | match-info | ✗ duplica hero |
| Estadio "Por confirmar" | match-info | ✗ placeholder vacío |
| Sede "—" | match-info | ✗ placeholder vacío |
| Árbitro "Por confirmar" | match-info | ✗ placeholder vacío |

### Post-match

| Dato | Sección | Estado |
|---|---|---|
| Badge "FT · Final" | hero | ✓ |
| Phase | hero | ↻ consolidar (también en breakdown) |
| Team flag/name + winner highlight | hero | ✓ core |
| Score final | hero | ✓ core |
| Result label (Vic/Der/Emp) | hero | ✓ semánticamente confirma score |
| Verdict text + variant | pvr | ✓ core |
| Verdict sub (explicación) | pvr | ✓ educativo |
| Puntos ganados | pvr | ✓ core |
| Tu pick / Resultado real cells | pvr | ✓ comparación |
| Breakdown table (4 rows + total) | pvr | ✓ educativo, pero podría visualizarse mejor |
| Phase en breakdown | pvr | ↻ ya estaba en hero |
| Total picks | aggregate | ✓ |
| Result % bar | aggregate | ✓ social proof |
| Exact % bar | aggregate | ✓ social proof |

### Datos faltantes (ambos estados)

| Dato | Por qué |
|---|---|
| **Forma reciente** (últimos 5 de cada equipo) | Context pre-match |
| **Head-to-head historia** | Context pre-match |
| **Aggregate de picks distribution** ("60% home · 25% draw · 15% away") | Social proof pre-match |
| **Trivia activa indicator** | Si hay trivia para este match, debería destacarse |
| **Link a ranking del grupo** | Post-match: "Sos #3 con estos pts" |
| **Comparación con tu promedio** | Post-match: "Hoy +10 pts · promedio +6" |
| **Compartir resultado** (botón) | Post-match: "¡Acerté exacto! Compartir" |

---

## 7. Hallazgos UX cross-cutting (priorizados)

🔴 **Match info section es 50% placeholders permanentes** (Estadio "Por confirmar", Sede "—", Árbitro "Por confirmar"). Decisión: o se obtienen estos datos del backend, o se quita la sección.

🔴 **Fase + Kickoff duplicados** entre hero y match-info section.

🔴 **Aggregate stats solo post-match** — desperdicia el social proof pre-match.

🟠 **Pre-match section "Datos del partido" subutilizada** — debería tener forma reciente, head-to-head, distribución de picks (no placeholders).

🟠 **Countdown 4-cell verboso** para partidos lejanos (>24h).

🟠 **Breakdown table podría visualizarse** como stepped progress bar — más memorable.

🟠 **No hay trivia indicator** en pick-detail (sí está en `/picks` match cards).

🟠 **No hay link al ranking del grupo** post-match.

🟠 **Back CTA solo al final**.

🟡 **Editor sin steppers visible** (lógica existe pero no expuesta).

🟡 **maxlength="1"** bloquea marcadores 10+.

🟡 **Breadcrumb post-match podría incluir tu pick**.

🟡 **Verdict variants `--miss` / `--none` sin equivalente para hit**.

🟡 **Verdict sub muy pequeña** (11px).

🟢 **Skeleton para crest URLs faltante**.

🟢 **No respeta scroll restoration al volver a /picks**.

---

## 8. Antipatrones detectados

| Regla | Violación |
|---|---|
| **Avoid placeholder data** | "Por confirmar" / "—" en Estadio/Sede/Árbitro |
| **Avoid duplicate data** (Web Guidelines) | Fase + Kickoff en hero y match-info |
| **Empty states** | El match-info section es de hecho un empty state disfrazado |
| **Density adaptation** | Countdown 4-cell en partidos T+12d es overkill |
| **Visual hierarchy** | Multiplier mostrado solo como texto, no como bonus phase badge |
| **CTA labels específicos** | "Volver a mis picks" OK, pero no contextualiza si vino de notif |

---

## 9. Anclas para el redesign

### Core (ambos estados)

1. **Hero con teams + status + tiempo** (kickoff o FT)
2. **Pick (editor pre-match O comparación post-match)**
3. **Verdict + breakdown** (post-match)
4. **Aggregate stats** (idealmente ambos estados)

### Pre-match

- Countdown contextual (simple "En 12 días", detalle D/H/M/S solo cuando < 24h)
- Phase multiplier como **badge visual** (no texto)
- **Forma reciente** de cada equipo (últimos 5)
- **Head-to-head** (último encuentro o histórico)
- **Distribución de picks** (60% home · 25% empate · 15% away)
- Trivia activa indicator si aplica

### Post-match

- Verdict prominente con celebration variant si acertó exacto
- Breakdown **visual** (stepped progress bar)
- Aggregate stats + comparación personal ("Hoy +10 · promedio +6")
- Link al ranking del grupo
- Compartir CTA (opcional)

### Quitar

- **Match info section completa** (Fase + Kickoff duplicados + 3 placeholders)
- Competition "Mundial 2026" en hero (ya está en sidebar)

### Agregar

- Forma reciente / H2H
- Picks distribution
- Trivia indicator
- Group ranking link
- Comparison stats
- Variant class para verdict 'hit' (consistency)
- Skeleton para crest URLs
- Scroll restoration

---

## 10. Resumen ejecutivo

**El detail page es 2 páginas en 1** (pre-match research vs post-match recap), pero ambas comparten **3 problemas estructurales**:

1. **Match info section vacía**: 50% son placeholders permanentes ("Por confirmar", "—"). Decisión binaria: completar con datos reales (forma, H2H, picks distribution) o eliminar.

2. **Información duplicada hero ↔ match-info** (Fase, Kickoff). Consolidar en hero.

3. **Aggregate stats subutilizadas**: hoy solo post-match. Pre-match son **el contexto más valioso** que el user puede obtener para predecir — el "60% picó home" es señal fuerte.

### 3 decisiones de diseño que cambian todo

1. **Eliminar el "Datos del partido" placebo** y reemplazar con info de verdad útil pre-match:
   - Forma reciente (últimos 5)
   - Head-to-head
   - Distribución de picks de la polla
   - Phase multiplier badge

2. **Aggregate stats en AMBOS estados**: pre-match = "social proof + intel"; post-match = "comparison + ego".

3. **Visualizar el breakdown** como stepped progress bar en lugar de tabla texto:
   ```
   Solo res. → Diff+res. → Exacto
     1 pt       3 pts     5 pts
                          ✓ YOU · ×2 mult = +10
   ```
   Es más memorable y educativo.

### Cambios secundarios

- Countdown contextual (simple lejos, detalle cerca).
- Trivia indicator si aplica.
- Group ranking link post-match.
- Comparison con promedio ("hoy +10 · tu promedio +6").
- Forma reciente + H2H pre-match (data nueva, requiere backend).
- Skeleton para imágenes de crest.
- Back arrow sticky-top (no solo CTA al final).
- Sistema de variants consistente (incluir `--hit`).
- Trivia indicator si aplica.

**Nota Fase C**: el comentario en código (`pick-detail.component.ts:258`) confirma que el editor duplicado ya se removió. El editor inline en hero es el único — esto está bien. La recomendación de "leer-only" del agente bucket 2 fue equivocada (el editor en hero es el correcto).
