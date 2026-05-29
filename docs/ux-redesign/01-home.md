# Análisis UX: `/home` — HomeComponent

> Surface #1 del walkthrough. Análisis basado en `src/app/features/home/home.component.ts`
> y `src/app/features/picks/picks-pending-banner.component.ts`.
> Frameworks de evaluación: Vercel Web Interface Guidelines + UI/UX Pro Max.

## 1. Identidad

- **Propósito**: dashboard personal post-login. Responde "¿cómo voy?" en ≤3 segundos y dirige al user a la próxima acción.
- **Audiencia**: cualquier user autenticado. Tres perfiles dominantes:
  - **A. Player con picks pendientes** entra antes de un kickoff → quiere ir a `/picks` rápido
  - **B. Player después de un match** quiere ver ranking + cambio de posición
  - **C. First-time / pre-torneo** sin grupos → quiere crear/unirse
- **Frecuencia**: muy alta. Es la default route post-login + el ícono "Inicio" del sidebar
- **Entry points**: post-login redirect, sidebar "Inicio", logo click, `/` root

## 2. Estructura actual (mapa)

```
[picks-pending-banner]      ← solo si count > 0 y no dismissed hoy
[hero gradient]
  ├── avatar inicial
  ├── kicker "Hola, @handle"
  ├── título "Quedan X días · estás en #N" (mezcla 2 datos)
  ├── stats inline "X pts · N grupos activos · X% aciertos"
  ├── alert rojo "⚠ Cierra el primer pick en Xh" ← condicional
  └── CTA verde "Hacer picks →"
[KPI strip · 5 cards]
  ├── Ranking global
  ├── Puntos
  ├── Aciertos (+ count en small)
  ├── Grupos (+ best position en small)
  └── Comodines (X/Y)
[pp dark block]              ← solo si pendingPicksCount > 0
  ├── número grande
  ├── título + sub con potencial pts + countdown
  └── CTA "Hacer picks →"
[Mis grupos]
  ├── h2 "Mis grupos · N activos" + link "Ver todos →"
  ├── lista de grupos (avatar + nombre + members/prize + #rank pill)
  └── botones "Crear grupo" / "Unirme con código"
[Row 2-col]
  ├── Picks especiales (3 chips: CHAMPION/RUNNER_UP/DARK_HORSE)
  └── Ranking gradient card (#N global + #M mejor grupo + progress bar + stats)
[Comodines]                  ← solo si hasComplete
  ├── header "⚡ Comodines · X de Y disponibles" + link "Detalles →"
  └── slots row con icon + label
```

Sin tabs/states internos. Todo se renderiza en una columna scrollable.

## 3. Datos mostrados — inventario

| Sección | Dato | Origen | Refresh |
|---|---|---|---|
| pending-banner | count partidos sin pick en próx. 12h | API `pendingMatches(TOURNAMENT_ID, 12)` | mount + dismiss daily via localStorage |
| hero | avatar initials | user.handle / user.name | mount |
| hero | handle `@xxx` | auth.user | reactivo |
| hero | días al torneo | constant `TOURNAMENT_START_ISO` | computed |
| hero | global rank | totals.globalRank | mount |
| hero | points | totals.points | mount |
| hero | grupos count | userModes.groups | mount |
| hero | accuracy % | computed | mount |
| hero | next deadline label (alert) | computed sobre pendingPicks | mount |
| KPI Ranking global | #N | totals.globalRank | mount |
| KPI Puntos | número | totals.points | mount |
| KPI Aciertos | % + count small | computed | mount |
| KPI Grupos | count + bestPosition small | userModes | mount |
| KPI Comodines | X/Y | computed | mount |
| pp block | pendingPicksCount + potential pts + deadline | computed | mount |
| Mis grupos lista | N cards con name/members/prize/rank | userModes + leaderboard | mount |
| Especiales row | 3 picks (flag/name) | API `listSpecialPicks` | mount |
| Ranking card | global rank, best group rank, percentile bar, pts+accuracy | aggregate de varias fuentes | mount |
| Comodines row | slots con icon/label | API `listMyComodines` | mount |

## 4. Análisis de relevancia

| Dato | Decisión | Razón |
|---|---|---|
| **Global rank** (mostrado 3 veces: hero + KPI + ranking card) | ↻ **consolidar en 1** | Triplicación masiva. El ranking card es el lugar correcto (más contextual). Quitar de hero+KPI. |
| **Points** (mostrado 3 veces) | ↻ **consolidar en 1** | Mismo problema. Ranking card o KPI strip — uno solo. |
| **Accuracy %** (3 veces) | ↻ **consolidar en 1** | Mismo. Quitar del hero. |
| **Grupos count** (3 veces: hero + KPI + h2 "Mis grupos · N") | ↻ **consolidar en 1** | El h2 de la sección "Mis grupos" ya lo dice. Quitar de hero+KPI. |
| **Comodines X/Y** (KPI + sección comodines) | ↻ **consolidar en 1** | El KPI duplica. Si tiene sección comodines abajo, sacar del KPI. |
| **Pending picks** (banner + hero alert + pp block) | ↻ **consolidar en 1** | Triple alerta del mismo evento. Quedarse solo con el pp block (más rico, tiene potencial pts). Sacar banner + alert del hero. |
| **Días al torneo** | ✓ quedar | High value pre-torneo. Quitar post-kickoff. |
| **Handle "@xxx"** | ✓ quedar | Refuerza identidad + personalización del greeting. |
| **Avatar initials** | ✓ quedar | Visual cue de identidad. |
| **Especiales row (3 chips)** | ✓ quedar | Único site de entry rápido a `/profile/special-picks`. Pre-torneo es alta-señal. |
| **Mis grupos lista (con rank pill)** | ✓ quedar | Core. La pill #rank es el dato motivador. |
| **CTA "Crear grupo" / "Unirme con código"** | ↻ **mover a empty-state** | Si el user ya tiene grupos, estos 2 botones bajo la lista son ruido (lleva al modal global, ya accesible desde sidebar). En empty-state son críticos. |
| **Ranking card progress bar (percentile)** | ✓ quedar | Buena visualización emocional. Sustituye números con feeling. |
| **best position group name** (en ranking card) | ✓ quedar | "Sos #2 en Oficina Q1" tiene más impacto que "#N global". |
| **Comodines slots row** (visual de 5 slots con icons) | ↻ **simplificar o quitar** | Mientras el user no tenga comodines (mayoría pre-torneo), son 5 cuadros vacíos. Mostrar solo cuando count > 0. |

### Datos faltantes (deberían agregarse)

| Dato | Por qué |
|---|---|
| **Next match countdown** | Si hay un partido en <24h, el user quiere saber. El right-rail lo tiene pero rail es desktop-only. |
| **Recent activity / "Tu último resultado"** | Engagement: "Tu pick MEX vs ARG ganó · +10 pts" cuando entra al día siguiente del match. |
| **Trivia activa indicator** | Si hay una trivia abierta para un match LIVE, banner de prioridad — buena conversión. |
| **Group activity feed (light)** | "3 nuevos picks en Oficina Q1 hoy" — social-proof, sentido de actividad. |
| **Mode badge por grupo** | En la lista "Mis grupos" no se ve SIMPLE/COMPLETE. El user puede confundirse cuál cuenta para el ranking. |

## 5. Tabs/states

No hay tabs internas. Tiene 3 estados implícitos por contexto:

- **Pre-torneo** (días > 0): hero "Quedan X días" dominante, todas las KPIs probablemente "—", pp block oculto, comodines vacíos
- **Durante torneo** (matches en curso): pending banner + pp activos, ranking moves, comodines activos si COMPLETE
- **Post-torneo**: hero "torneo finalizado", ranking final destacado, comodines no aplicables

**Problema**: el componente no diferencia estos estados — muestra la MISMA estructura siempre. Pre-torneo el user ve 5 KPIs vacíos + sección comodines vacía. Post-torneo ve pending banner inútil + countdown a un torneo que ya terminó.

## 6. Hallazgos UX (priorizados)

🔴 **Triple redundancia de stats core** (hero + KPI strip + ranking card muestran lo mismo). Rompe la regla de "una sola fuente de verdad" + satura el viewport mobile.

🔴 **3 CTAs simultáneos "Hacer picks →"** (banner button, hero CTA, pp block). Anti-patrón: un screen debe tener **un solo primary action** (ui-ux-pro-max `primary-action`). Hoy hay 3.

🟠 **Estado pre-torneo se ve roto**: 5 KPIs con "—" + sección comodines vacía + ranking card "#—". El user nuevo ve la app como si estuviera vacía. Necesita **estado vacío específico** ("Faltan X días. Para empezar, creá tu primer grupo →").

🟠 **Hero packs 3 jerarquías en 1 bloque** (kicker handle + título días+rank + stats line + alert + CTA). Demasiado denso. La regla ui-ux-pro-max `visual-hierarchy` dice "establish via size, spacing, contrast — not just color".

🟠 **Hero stats line con `·` separadores** es difícil de escanear: "X pts · N grupos activos · X% de aciertos". 3 datos sin jerarquía. Mejor matriz/grid.

🟡 **Emojis como íconos estructurales**: 🏆⚡＋→ (anti-pattern `no-emoji-icons` de ui-ux-pro-max). Aunque están con `aria-hidden`, visualmente siguen siendo emojis. Cross-platform inconsistente. Sustituir por SVG (Lucide / Heroicons).

🟡 **KPI labels en mayúsculas + valores grandes Bebas** = visual heavy. 5 cards en línea satura. Reducir a 3 KPIs máximo o convertir en horizontal scroll en mobile.

🟡 **KPIs usan `.kpi__v` / `.kpi__d` NO `.kpi__num`**: el rule global tabular-nums (P4.C) no aplica acá. Polish gap: los dígitos hacen jiggle en re-renders.

🟡 **"Picks especiales · hasta 65 pts"** header habla de máximo posible pero no de cuántos ya elegidos (0/3, 1/3, 3/3). Falta progreso visible.

🟡 **Ranking card "best position group name"** se trunca con grupos de nombre largo. Sin `truncate` / `min-w-0`.

🟢 **Sección "Mis grupos" sin actividad reciente**: solo nombre + count + prize + rank. No hay signal de "movimiento" (alguien subió en el ranking interno hoy?).

🟢 **Comodines slots con texto "Multiplier X2" / "Boost fase"** es difícil de scanear visualmente. Usar íconos + label corto.

## 7. Anclas para el redesign

### Core (info que NUNCA debe faltar)

1. **Identity strip**: avatar + `@handle` + saludo contextual al estado del torneo (pre/durante/post)
2. **Primary CTA único** según contexto:
   - Pre-torneo sin grupos → "Crear tu primer grupo"
   - Pre-torneo con grupos → "Configurar especiales" (si faltan)
   - Durante torneo con pending → "Hacer N picks pendientes" (el más fuerte)
   - Durante torneo sin pending → "Ver mi último resultado"
3. **Mis grupos** (lista con #rank pill — el dato motivador)
4. **Ranking emocional** (percentile bar + mejor posición contextual)

### Contextual (mostrar según estado)

- **Pre-torneo**: countdown grande "Faltan X días" + especiales progress (N/3) + pending matches indicador (si hay)
- **Durante torneo**: next-match countdown + pending picks count (con potencial pts) + recent result celebration
- **Post-torneo**: final standings + total earned + best moments

### Quitar

- Hero stats line "X pts · N grupos · X% aciertos" (duplica KPIs y ranking card)
- Pending banner ARRIBA del hero (si ya hay pp block más rico abajo)
- Hero alert "⚠ Cierra el primer pick en Xh" (lo dice el pp block)
- KPI strip de 5 si hay ranking card abajo (consolidar a max 3, o un solo bloque "tu balance")
- Comodines slots vacíos (mostrar sección solo si count > 0)
- Botones "Crear grupo / Unirme" debajo de la lista si ya hay grupos

### Agregar

- **Next match card** (con countdown, equipos, tu pick si lo hiciste) — actualmente solo en right-rail desktop
- **Mode badge** en cada grupo de la lista (SIMPLE/COMPLETE pill)
- **Recent activity** ligera ("Hace 2 días: MEX vs ARG · tu pick: 2-1 · resultado: 1-1 · +5 pts")
- **Especiales progress** (0/3, 1/3, 3/3) en el header de la sección, no solo "hasta 65 pts"
- **Estado vacío específico** para first-time user (no mostrar 5 KPIs con "—")
- **Trivia activa indicator** si hay una abierta

## 8. Antipatrones detectados

| Regla | Violación |
|---|---|
| `primary-action` (ui-ux-pro-max) | 3 CTAs "Hacer picks" simultáneos |
| `no-emoji-icons` | 🏆⚡＋→🥇 etc. |
| `visual-hierarchy` | Hero mete 5 jerarquías en 1 bloque |
| `empty-states` (Forms & Feedback) | KPIs con "—" pre-torneo, ranking card "#—" sin empty state |
| `content-priority` (Layout) | Pre-torneo: comodines/KPIs vacíos por encima de "Crear grupo" CTA |
| `tabular-nums` | `.kpi__v` no incluido en rule global |
| `truncation-strategy` | Best group name puede romper la ranking card |
| **Web Interface Guidelines** | "Show one primary CTA per screen" + "Avoid duplicate data" |

## 9. Resumen ejecutivo para el redesign

**El home actual hace 1 cosa bien** (lista de grupos con rank pill — esa es la atracción real) y **3 cosas mal** (triplica stats, triplica CTAs, no diferencia estados pre/durante/post torneo).

**3 decisiones de diseño que cambian todo:**

1. **Reducir a un solo bloque de stats** (eliminar KPI strip O hero stats O ranking card — quedarse con uno). Recomendado: hero solo identidad + countdown contextual; ranking card abajo como única visualización emocional de "cómo voy".

2. **Primary CTA contextual único**: el componente debe computar cuál es la *próxima* acción del user y mostrar UN solo CTA dominante. Eliminar los otros 2 sites de "Hacer picks".

3. **Estados pre/durante/post diferenciados**: el componente actualmente es agnóstico al estado del torneo. Hay que segmentar la UI:
   - **Pre-torneo**: countdown + especiales (3 chips) + grupos + CTA principal "Configurá tus picks especiales" o "Crear grupo"
   - **Durante**: next-match + pending picks (uno solo) + grupos (con activity light) + ranking
   - **Post**: final standings card + total pts + best moments

Con esto, el viewport mobile pasa de ~7 secciones (~800px scroll) a ~4 secciones bien diferenciadas (~500px).
