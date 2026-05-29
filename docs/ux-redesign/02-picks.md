# Análisis UX: `/picks` — PicksListComponent

> Surface #2 del walkthrough. Vista cronológica de partidos con edit inline + auto-save.
> Es el core funcional de la app — la pantalla que el user va a usar más veces durante el torneo.
> Análisis tab-por-tab + componente-por-componente.

---

## 1. Identidad

- **Propósito**: hacer/editar picks de marcador para todos los partidos del torneo, ordenados por fecha. Auto-save vía `PicksSyncService`.
- **Audiencia**: user en modo COMPLETE (predice marcadores). Modo SIMPLE puede ver la lista pero los marcadores no cuentan para ranking — ve banner informativo.
- **Frecuencia**: la más alta de la app durante el torneo. Pre-torneo: visita ocasional para ver fixtures.
- **Entry points**: sidebar "Mis picks", home CTA "Hacer picks →", pp dark block, pending-banner del shell. Tab dentro de las `page-tabs` Cronológico/Tabla grupos/Bracket.

---

## 2. Estructura — mapa general

```
┌───────────────────────────────────────────────────────────┐
│ PAGE-LEVEL · siempre visibles                              │
├───────────────────────────────────────────────────────────┤
│ [page header]                                              │
│  ├── kicker "MUNDIAL 2026 · GOLGANA"                       │
│  ├── h1 "Mis picks"                                        │
│  └── stats inline (4 stats: pts, exactos, resultados, #N)  │
│                                                            │
│ [picks-actions]                                            │
│  └── botón "🎲 Aleatorio" → modal randomizer               │
│                                                            │
│ [page-tabs · cross-page nav]                               │
│  ├── Cronológico (current, /picks)                         │
│  ├── Tabla grupos (/picks/group-stage)                     │
│  └── Bracket (/picks/bracket)                              │
│                                                            │
│ [sub-seg · TABS INTERNOS]                                  │
│  ├── Próximos · N                                          │
│  └── Jugados · N                                           │
│                                                            │
│ [hint-banner]  ← condicional si !hasComplete               │
│                                                            │
├───────────────────────────────────────────────────────────┤
│ TAB A · Próximos                                           │
├───────────────────────────────────────────────────────────┤
│  ├── [days-pager top]   ← si window > viewport             │
│  ├── [day kicker "📅 Hoy · 3 partidos"]                    │
│  │   ├── [match-card · Próximos variant] × N               │
│  │   ├── [ad-feed Coca-Cola] ← dayIdx === 0 HARDCODED      │
│  │   └── [ad-feed adidas]    ← dayIdx === 2 HARDCODED      │
│  ├── [day kicker · siguiente día]                          │
│  │   └── [match-card] × N                                  │
│  └── [days-pager bottom]                                   │
│                                                            │
├───────────────────────────────────────────────────────────┤
│ TAB B · Jugados                                            │
├───────────────────────────────────────────────────────────┤
│  └── [match-card · Jugados variant] × N (flat, fecha desc) │
│                                                            │
├───────────────────────────────────────────────────────────┤
│ PAGE-LEVEL · siempre visibles (después del tab)            │
├───────────────────────────────────────────────────────────┤
│ [sponsor-banner-row] × 3 (uno por slot, condicional)       │
│ [FAB canjear código] (mobile only)                         │
│ [randomizer modal] (oculto hasta openRandomizer)           │
└───────────────────────────────────────────────────────────┘
```

---

## 3. Componentes page-level — análisis

### 3.1 Page header

**Render actual:**
```
MUNDIAL 2026 · GOLGANA       [N pts] [N exactos] [N resultados] [#N global]
Mis picks
```

**Datos**:

| Dato | Origen | ¿Relevante en esta pantalla? |
|---|---|---|
| Kicker "MUNDIAL 2026 · GOLGANA" | constante | ✗ noise — brand ya está en sidebar |
| h1 "Mis picks" | constante | ✓ — marca orientación |
| Stat: pts | `totals.points` | ✗ duplica home + ranking card |
| Stat: exactos | `totals.exactCount` | ↻ útil si se contextualiza ("de Y partidos jugados") |
| Stat: resultados | `totals.resultCount` | ↻ útil si se contextualiza |
| Stat: global rank | `totals.globalRank` | ✗ duplica home |

**Veredicto:** **reducir drásticamente**. El user que llegó acá ya vio sus stats en home. Si quedaran, deberían ser stats *contextuales a la pantalla actual*: "{exactos}/{played} aciertos exactos · {pendientes} picks por hacer".

### 3.2 Picks actions — botón "🎲 Aleatorio"

**Render**: 1 botón ink-style.

**Análisis**:
- Útil para users que no quieren predecir 104 partidos manualmente.
- Anti-patrón menor: emoji 🎲 (cambiar a SVG dice).
- Label "Aleatorio" es vago. Mejor: "Auto-completar marcadores" o "Picks aleatorios".
- Posición: top de la página antes de las page-tabs — está OK en density baja, pero compite por atención con el primary action de hacer picks normales. Considerar reposicionarlo al final del tab Próximos o convertirlo en empty-state CTA cuando hay >20 partidos sin predecir.

### 3.3 Page tabs (cross-page nav)

**Render**: 3 anchors con `routerLinkActive`.
```
[Cronológico] · [Tabla grupos] · [Bracket]
```

**Análisis**:
- ✓ Mantienen orientación entre las 3 vistas de "mis picks".
- ✓ Buen pattern: usa routerLink, no botones — permite cmd+click, middle-click.
- ⚠ No hay indicador de progreso por vista. El user no sabe en cuál tiene picks pendientes.
- Mejora: badge sutil al lado del label ("Cronológico · 3 pend").

### 3.4 Sub-seg (los tabs internos REALES)

**Render**: 2 botones con `role="tab"` + `aria-selected`.
```
[ Próximos · 8 ]  [ Jugados · 12 ]
```

**Análisis**:
- ✓ Implementación a11y correcta (P1.2 ya wired).
- ✓ Counts dinámicos dan feedback útil.
- ⚠ Tab Próximos default — no se persiste la selección entre navegaciones. Si el user estaba viendo Jugados y va a `/groups` y vuelve, regresa a Próximos. Considerar persist en signal/localStorage.

### 3.5 Hint banner "Modo completo no activo"

**Render**: bloque amarillo con borde.
```
Modo completo no activo. Podés ver el calendario, pero los marcadores
que predigás acá no contarán hasta que estés en un grupo modo completo.
[Crear grupo →]
```

**Datos**:
- Origen: `userModes.hasComplete` (signal reactivo)
- Visibilidad: solo si `!hasComplete`

**Análisis**:
- ✓ Info crítica — sin esto, user en SIMPLE predice marcadores sin saber que no cuenta.
- ⚠ Visual heavy: 3 líneas + CTA, ~80px de altura. Domina la sección.
- ⚠ Link `/groups/new` lleva a la página de crear grupo (todavía existe en routes). Mejor: abrir el modal de crear grupo desde acá (`GroupActionsService.openCreate()`).
- 🟡 Texto demasiado largo. Comprimir a 1 línea: "ⓘ Estás en modo simple. Para que los marcadores cuenten para ranking, **creá un grupo modo completo →**".

### 3.6 Sponsor banner rows (post-feed)

**Render**: 3 hileras horizontales (una por slot), scroll horizontal.

**Datos**:
- Origen: API `listSponsors` filtrado por slot
- Visibilidad: condicional por slot (si hay banners en ese slot)

**Análisis**:
- ⚠ Posicionados después de todo el feed. En mobile el user debe scrollear past 50+ matches para llegar.
- ⚠ Compiten con los ads-hardcoded (Coca-Cola, adidas) — distinto modelo de datos pero visualmente similar = confusión.
- 🟡 Considerar reposicionar al rail desktop, o como sticky bottom-bar mobile que el user puede dismiss.

### 3.7 FAB "🎁 Canjear código" (mobile-only)

**Render**: button fixed bottom-left, amarillo.

**Análisis**:
- ✓ Buen entry point para el modal de canje (consolidado en Fase A).
- ✓ Solo visible <992px (desktop usa el rail).
- ⚠ Posición bottom-left compite con el FAB de trivia (también bottom-left según diseño v3). Verificar que no se superpongan.
- 🟡 Cambiar emoji 🎁 por SVG.

### 3.8 Modal randomizer

Modal separado (`RandomizerModalComponent`). Se analiza en su propia surface después. Trigger: botón Aleatorio.

---

## 4. TAB A · Próximos — análisis profundo

### 4.1 Propósito

Mostrar partidos futuros agrupados por día con scores editables inline. Es el **flujo más importante de la app** durante el torneo.

### 4.2 Componentes del tab

```
[empty-block]                    ← si visibleDays === 0
[days-pager top · solo iconos]   ← si hay más días fuera de la ventana
[day kicker]
  └── [match-card · upcoming] × N
[ad-feed Coca-Cola]              ← inyectado en dayIdx === 0
[day kicker]
  └── [match-card · upcoming] × N
[ad-feed adidas]                 ← inyectado en dayIdx === 2
[day kicker]
  └── [match-card · upcoming] × N
[days-pager bottom · botones con label]
```

### 4.3 Componentes desglosados

#### a) Empty state

**Render**:
```
No hay partidos próximos en este rango
Probá cargando los próximos días.   ← si allUpcomingDays.length > 0
Ya jugaste todos los partidos del   ← si allUpcomingDays.length === 0
torneo o el admin no cargó más fixtures.
```

**Análisis**:
- ✓ Mensaje contextual según situación.
- ⚠ Sin CTA. El primer mensaje sugiere "cargá próximos días" pero no hay botón para hacerlo desde el empty state (el days-pager queda invisible si no hay matches en la ventana).
- 🟠 Fix: incluir botón "Cargar siguientes días →" cuando aplique.

#### b) Days pager (top + bottom)

**Render top**: 2 botones icon-only (← →) alineados a la derecha.
**Render bottom**: 2 botones con label "← Anteriores" / "Siguientes →".

**Análisis**:
- ✓ Dos formatos para dos contextos (compacto arriba, completo abajo).
- ⚠ Redundancia si la lista es corta. Si la ventana cabe entera (ej. 1 día con 3 matches), mostrar solo 1 pager.
- ⚠ Ventana fija de `DAYS_PER_PAGE` (no visible cuánto es). Considerar: "Mostrando 3 días · 5 partidos" para dar contexto.
- 🟡 Botones icon-only `←` `→` sin label visible — solo tienen `aria-label`. En desktop con cursor el user tiene tooltip pero en mobile no hay affordance del label. Considerar label "Anteriores" / "Siguientes" siempre.

#### c) Day kicker

**Render**:
```
📅 Hoy · 3 partidos
📅 Mañana · 2 partidos
📅 Lunes 15 nov · 4 partidos
```

**Datos**:
- Label: "Hoy" / "Mañana" / `weekday + day + month` (locale es-EC)
- Count: `day.matches.length`

**Análisis**:
- ✓ "Hoy" y "Mañana" son orientación temporal valiosa.
- ⚠ El count "3 partidos" se infiere visualmente de las cards debajo — redundante para el usuario, ruido visual.
- 🟡 Emoji 📅 anti-pattern (cambiar a SVG calendar).
- 🟡 Si hay 1 partido por día durante 7 días seguidos, el feed se llena de day-kickers. Considerar agrupación más coarse: "Esta semana · 5 partidos" expandible.

#### d) Ad-feed (HARDCODED, anti-patrón)

**Render** (`picks-list.component.ts:202-222`):
```
[AD] 🥤 Coca-Cola refresca tu Mundial    ← en dayIdx === 0
       COCA-COLA · Patrocinador oficial
       [Ver promo]

[AD] 👟 adidas — Equípate para el Mundial ← en dayIdx === 2
       ADIDAS · Sponsor oficial
       [Ver colección]
```

**Análisis**:
- 🔴 **Hardcoded en el template**. Posición fija en dayIdx === 0 y === 2. No vienen de DB.
- 🔴 Visualmente mezclan con los sponsor-banners reales (sección de abajo) que sí vienen de backend.
- 🔴 Links `href="#" (click)="$event.preventDefault()"` — anti-pattern (anchor sin destino).
- 🔴 Emojis 🥤 👟 como íconos.
- 🔴 **Decisión de producto**: si son demo, ocultar tras feature flag `?demo=1`. Si son ads reales, deben venir del mismo modelo que sponsor-banners.

#### e) Match card · variante Próximos

Ver sección 6 (match card shared) — la diferencia con Jugados es:
- Score: **inputs editables** (Próximos) vs **display read-only** (Jugados)
- "Tu pick: X—Y" line: **oculto** en Próximos
- Pills:
  - Sin pick → pill gris "Sin pick"
  - Con pick + pending sync → pill amarilla "● Pendiente"
  - Con pick + synced → pill verde "✓ Guardado"
- Status: countdown text (e.g. "en 2h 34m") en el header — re-evalúa cada 30s
- Detail CTA "Ver detalles →" presente

### 4.4 Hallazgos UX específicos del tab Próximos

🔴 **Ads hardcoded interrumpen el feed**. Es el problema más grande.

🟠 **Empty state sin CTA** cuando hay próximos días fuera de la ventana — el user no sabe cómo cargarlos.

🟠 **Density del match-card**: cada card es ~180-220px alta. En mobile con 3 matches por día = 600-700px solo de cards. Días múltiples saturan el viewport rápidamente.

🟡 **Day-pager top icon-only** sin label visible en mobile.

🟡 **Day kicker con emoji** + count redundante.

🟡 **"Sin pick" pill pasiva**: gris, no incita a actuar. Debería ser highlight verde "Predecí →".

🟡 **Sin filtros**: si el user tiene 50+ matches restantes, no puede filtrar "solo pendientes" — debe scrollear todo.

---

## 5. TAB B · Jugados — análisis profundo

### 5.1 Propósito

Revisar matches pasados — ver cuánto puntuó cada pick. Es retrospectivo, no requiere edit.

### 5.2 Componentes del tab

```
[empty-block]               ← si playedMatches === 0
[match-card · played] × N   ← lista plana, sin agrupar por día
```

**No tiene days-pager.** No tiene day-kickers. No tiene ad-feed. Solo lista flat.

### 5.3 Componentes desglosados

#### a) Empty state

**Render**:
```
Aún no jugaste partidos
Tus picks jugados aparecerán acá con el resultado y los puntos.
```

**Análisis**:
- ✓ Mensaje claro pre-torneo.
- ⚠ Sin CTA — el user pre-torneo aterriza acá y no hay redirección útil ("Mientras tanto, hacé tus picks Próximos →").

#### b) Match card · variante Jugados

Ver sección 6 (match card shared) — diferencias con Próximos:
- Score: **display read-only** mostrando marcador real
- "Tu pick: X—Y" line: **visible** (compara predicción vs real)
- Pills:
  - Si `m.pick.exactScore` → pill verde "✓ Exacto · +N pts"
  - Si `m.pick.correctResult` → pill verde "✓ Resultado · +N pts"
  - Si tiene pick pero no acertó → pill gris "Sin pts"
  - Si no tiene pick → match-card con clase `--dim` + sin pill
- Status: "Final" en text-mute
- Detail CTA "Ver detalles →" presente (útil para ver breakdown)

### 5.4 Hallazgos UX específicos del tab Jugados

🔴 **Mismo template denso que Próximos**. El card está optimizado para input (~200px alto). En Jugados, sin inputs, sigue siendo ~180px. Para una vista retrospectiva debería ser compact-row:
```
Hoy 20:00 · Octavos    🇲🇽 MEX 2—1 ARG 🇦🇷    Tu: 2—1   ✓ Exacto +10pts   →
```
En 60-72px de alto. Permitiría ver 10+ matches en un viewport mobile.

🟠 **"Sin pts" pill ambigua**: ¿no se calculó? ¿no jugó? ¿falló? Renombrar a "Falló +0pts" o "0 pts".

🟠 **No hay agregaciones**: el user querría ver "Esta fase: 4/8 exactos · 60% accuracy" arriba de la lista. Hoy debe ir a `/ranking` o sumarlo mentalmente.

🟠 **Sin paginación**: si jugó 64 partidos (Mundial completo), lista flat de 64 cards = scroll infinito. Necesita agrupación por fase o paginación.

🟡 **Sin filtro por estado** ("solo aciertos exactos", "solo fallos").

🟡 **Sin sort options** (default fecha desc, pero podría querer "ordenar por puntos ganados desc").

---

## 6. Match card — sub-componente compartido

Es el componente más complejo de la página. Mismo `<ng-template #cardTpl>` se usa en ambos tabs con renderizado condicional. Vale análisis dedicado.

### 6.1 Estados que renderiza

El match card tiene al menos **5 estados visuales distintos** según condiciones:

| Estado | Condición | Score | "Tu pick" | Pill | CTA |
|---|---|---|---|---|---|
| **Próximo sin pick** | upcoming, no pick | inputs vacíos | oculto | "Sin pick" gris | Ver detalles |
| **Próximo con pick pending** | upcoming, pick + sync pending | inputs llenos | oculto | "● Pendiente" amarillo | Ver detalles |
| **Próximo con pick saved** | upcoming, pick + synced | inputs llenos | oculto | "✓ Guardado" verde | Ver detalles |
| **EN VIVO** | live (status !== FINAL && kickoff pasó) | display marcador parcial | visible si hay pick | LIVE pill rojo | Ver detalles |
| **Esperando resultado** | status FINAL, scores null | display "—" | visible | "Esperando resultado" amarillo | Ver detalles |
| **Final + Exacto** | played, pick.exactScore | display marcador final | visible | "✓ Exacto · +N pts" verde | Ver detalles |
| **Final + Resultado** | played, pick.correctResult | display | visible | "✓ Resultado · +N pts" verde | Ver detalles |
| **Final + Sin pts** | played, pick existe pero no acierto | display | visible | "Sin pts" gris | Ver detalles |
| **Final sin pick** | played, no pick | display, class `--dim` | oculto | sin pill | Ver detalles |

Plus la **sub-card trivia** que se renderiza condicionalmente debajo si hay trivia para el match.

### 6.2 Sub-componentes del match card

#### a) Header del card

```
[20:00 · Octavos]                    [STATUS PILL]
```

- Kickoff + phase label
- Status pill: LIVE / Esperando resultado / Final / countdown

**Hallazgos**:
- ⚠ Pills mezclan estilos: `.live` (clase), `class="text-mute"`, `class="pill"` con inline styles. Falta sistema unificado de status pills.
- 🟡 Phase label "Octavos" / "Cuartos" no indica multiplicador. Cuartos = x2, semis = x3 — info crítica que el user querría ver.

#### b) Match row

```
🇲🇽 MEX                    [score]                    ARG 🇦🇷
```

- `app-team-flag` × 2 (con priority chain crest > flag-icons CSS)
- Score: inputs editable (upcoming) o display (live/played)

**Análisis del team-flag**:
- ✓ Bien diseñado con fallback: si admin subió crest URL custom y falla, cae a flag-icons CSS.
- ✓ ARIA correcto (`aria-label="México bandera"`).
- 🟢 Polish: en mobile size=22 puede ser pequeño. Considerar size=28 para tap-friendlier.

**Análisis del score input**:
- ✓ `maxlength="1"` + `inputmode="numeric"` + `autocomplete="off"`.
- ⚠ Solo 1 dígito — partidos con marcadores 10+ (raro pero posible) no caben. Considerar `maxlength="2"`.
- 🟡 No hay step-up/down buttons. En mobile el numpad solo tiene 0-9 + delete — ok. En desktop con teclado, ⬆⬇ flechas no incrementan/decrementan. Considerar steppers visibles tap-friendly.

#### c) "Tu pick" line

```
Tu pick: 2—1
```

- Solo visible cuando played/live/awaiting Y hay pick
- Compara contra el marcador real del card

**Análisis**:
- ✓ Útil — el user ve su predicción al lado del resultado.
- 🟡 Tipografía igual al resto del card body — no se diferencia. Podría tener kicker "TU PICK" pequeño + score en font display.

#### d) Pills system

| Pill | Color | Contexto | Issue |
|---|---|---|---|
| LIVE | rojo | live | OK |
| Esperando resultado | amarillo (inline style) | status FINAL sin scores | inline style — debería ser clase |
| Final | text-mute | played | apenas visible — más texto que pill |
| countdown ("en 2h 34m") | text-mute | upcoming | Re-evalúa cada 30s ✓ |
| ✓ Exacto · +N | verde sólido | played + exacto | ✓ |
| ✓ Resultado · +N | verde sólido | played + correctResult | ✓ |
| Sin pts | gris | played + pick failed | ambigua, ver §5.4 |
| ● Pendiente | amarillo (inline style) | upcoming + sync pending | inline style |
| ✓ Guardado | verde | upcoming + synced | considerar fade-out después de 2s |
| Sin pick | gris | upcoming + no pick | pasiva, no incentiva |

**Hallazgo crítico**: los pills mezclan classes Y inline styles. Falta sistema de design tokens unificado:
- `.pill--live`
- `.pill--awaiting`
- `.pill--scored-exact`
- `.pill--scored-result`
- `.pill--scored-none`
- `.pill--saved`
- `.pill--pending-sync`
- `.pill--no-pick`

#### e) "Tu pick" + pills overlap

En cards EN VIVO o JUGADOS donde hay pick, la línea "Tu pick: 2—1" Y los pills "✓ Exacto +10 pts" muestran info parcialmente redundante. El score predicho está en "Tu pick" + el resultado del pick está en el pill. Bien diferenciado pero crea una densidad de 3 líneas (header + Tu pick + pill) en cards retrospectivos.

#### f) Detail CTA "Ver detalles →"

```
[a routerLink="/picks/match/X"]
  Ver detalles →
```

**Análisis**:
- ✓ Es link (no botón) — soporta cmd+click.
- ⚠ Aparece en TODOS los estados — incluso en upcoming sin pick. Pero en upcoming el editor inline ya cubre el 95% del caso de uso.
- 🟠 Recomendado (post Fase C): mostrar solo en estados Jugados y LIVE — donde el breakdown educativo del detail page aporta valor.
- 🟡 "Ver detalles" es genérico. Más específico: "Ver desglose de pts" (Jugados) o "Ver estadísticas en vivo" (LIVE).

#### g) Trivia sub-card (condicional)

```
[match-card]
  └── [match-trivia ⚡]
       ├── icon ⚡ + title "Trivia activa hasta el kickoff"
       ├── sub "+10 pts si aciertas las 2"
       └── chips: [Preg 1] [Preg 2]
```

**Datos**:
- Origen: `triviaInfo(m.id)` + `triviaQuestionsFor(m.id)`
- Visibilidad: condicional si hay trivia activa
- Re-evalúa con `triviaTickTimer` (cada N segundos)

**Análisis**:
- ✓ Concept: inline call-to-action dentro del feed — buena densidad.
- ⚠ Chips "Preg 1" / "Preg 2" son cripticos — el user no sabe qué hay detrás.
- ⚠ Cada chip abre la trivia modal directamente al question específico — `openTrivia(matchId, questionId, $event)`. Bueno, pero el chip label no indica esto.
- 🟠 Recomendado: reemplazar chips por **un solo CTA destacado** con icono ⚡ animado + label claro:
  ```
  ⚡ +10 pts disponibles · Trivia activa (2 preguntas)  [Responder →]
  ```
  Una sola call-to-action en lugar de N chips.

---

## 7. Cross-cutting · hallazgos UX (priorizados)

🔴 **Ads hardcoded** (`picks-list.component.ts:202-222`).

🔴 **Page header stats duplican home** — el user que llegó acá ya los vio.

🔴 **Match card mismo template para 2 estados muy distintos** (Próximos editor vs Jugados retrospectivo). Jugados debería ser compact-row.

🟠 **Pills system inconsistente** (mix de classes + inline styles). Falta sistema unificado.

🟠 **Trivia chips "Preg 1 / Preg 2" cripticos** — sub-CTA dentro del card desaprovecha la oportunidad.

🟠 **"Sin pick" pill gris pasiva** — debería ser incentivo visual.

🟠 **Sin filtros** (Solo pendientes / Por grupo activo) — users con 50+ matches no tienen escape.

🟠 **Sin agregaciones en Jugados** (% acierto por fase, total pts ganados en período).

🟠 **Sponsor banners al final del feed** saturan después de 50+ matches.

🟡 **Day-kicker emoji** + count redundante.

🟡 **Phase multiplier no visible** en el match card.

🟡 **"Ver detalles →" en todos los estados** desaprovecha — sirve más en Jugados.

🟡 **Sub-seg state no persiste** entre navegaciones.

🟡 **Page tabs sin badges de progreso** — el user no sabe en qué vista tiene picks pendientes.

🟡 **CTA "Aleatorio" vago** + emoji 🎲.

🟡 **Hint-banner "Modo completo no activo" largo** — comprimir a 1 línea.

🟡 **Score input maxlength="1"** — bloquea marcadores 10+.

🟢 **Team flag size=22 pequeño en mobile**.

🟢 **"Ver detalles" label genérico**.

🟢 **Trivia sub-card podría ser más destacado** (gradient lateral, badge animado).

---

## 8. Antipatrones detectados

| Regla | Violación |
|---|---|
| **Avoid duplicate data** (Web Interface Guidelines) | Page stats duplican home |
| **One primary action per screen** | Editor inline + Ver detalles + Trivia chips compiten en cada card |
| **no-emoji-icons** (ui-ux-pro-max) | 📅🎲🎁⚡🥤👟 |
| **Consistent pill/status styling** | Mix inline + classes |
| **Density adaptation** (ui-ux-pro-max) | Mismo template para 2 contextos |
| **Content-priority** (ui-ux-pro-max) | Ads inyectados interrumpen el feed |
| **Anchor with href="#"** (Web Guidelines) | `(click)="$event.preventDefault()"` en ad CTAs |
| **Anti-pattern `transition: all`** | (ya limpiado en P0, marcar como histórico) |
| **CTA labels específicos** (Web Guidelines) | "Aleatorio" / "Ver detalles" genéricos |

---

## 9. Anclas para el redesign

### Core (info que NUNCA debe faltar)

1. **Sub-seg Próximos/Jugados con counts** (orientación primaria)
2. **Match card · header con kickoff + status pill** (cuándo + en qué estado)
3. **Score input editable inline (Próximos)** o display (Jugados)
4. **Tu pick + pill de resultado** en Jugados
5. **Trivia activa indicator** cuando aplica
6. **Page tabs Cronológico/Tabla grupos/Bracket** (cross-vista nav)

### Contextual (mostrar según estado del torneo)

- **Pre-torneo**: solo Próximos tab activo, header foco en "preparate", randomizer destacado.
- **Durante torneo**: ambos tabs activos, status pills dinámicas, pending picks urgentes top.
- **Post-torneo**: solo Jugados, header celebra "X exactos en N partidos".

### Quitar

- Page stats 4-up (duplican home).
- Kicker "MUNDIAL 2026 · GOLGANA".
- **Ad-feed hardcoded** (Coca-Cola + adidas).
- Day kicker emoji 📅 + count redundante.
- Days-pager bottom si ventana cabe entera.
- Pill "Sin pts" ambigua (renombrar).
- "Ver detalles" en upcoming (mantener solo Jugados + LIVE).

### Agregar

- **Filtro "Solo pendientes"** (toggle en sub-seg).
- **Filtro por grupo activo** (si user tiene >1 grupo COMPLETE).
- **Phase multiplier badge** (pill "x2 PTS · CUARTOS").
- **Auto-save status compacto** (header de página, no por card).
- **Recent activity / próximo kickoff** sticky top de la página.
- **Jugados compact row** (60-72px alto, 1 línea).
- **Agregaciones en Jugados** ("Esta fase: 4/8 exactos · 60% accuracy").
- **Empty state Próximos con CTA** ("Cargar siguientes días →").
- **Empty state Jugados con CTA** ("Mientras tanto, hacé tus picks Próximos →").
- **Page tabs con badges de progreso** ("Cronológico · 3 pend").
- **Sub-seg state persist** entre navegaciones.

### Sistema de pills unificado (proposed)

| Token | Color | Contexto |
|---|---|---|
| `.pill--live` | rojo | match EN VIVO |
| `.pill--awaiting` | amarillo | status FINAL sin scores |
| `.pill--final` | gris-claro | match jugado |
| `.pill--countdown` | text-mute | match upcoming |
| `.pill--scored-exact` | verde fuerte | Exacto +N pts |
| `.pill--scored-result` | verde medio | Resultado +N pts |
| `.pill--scored-none` | gris | Falló +0 pts |
| `.pill--saved` | verde sutil | sync OK |
| `.pill--pending-sync` | amarillo | sync pending |
| `.pill--no-pick` | accent | Sin pick · "Predecí →" (active) |

---

## 10. Resumen ejecutivo para el redesign

**El feed de picks es el corazón funcional de la app.** El editor inline auto-save funciona bien — esa es la fortaleza. Los problemas son:

1. **Mezcla de datos del torneo + ads + stats personales + sponsor banners** sin jerarquía clara. Cada uno reclama atención.
2. **Mismo template para 2 estados muy distintos** (editor activo Próximos vs retrospectivo Jugados) lo hace ineficiente.
3. **Trivia y bonus phase** son oportunidades de engagement subutilizadas — están ahí pero no destacadas.

### 3 decisiones de diseño que cambian todo

1. **Limpiar el feed**: quitar ads hardcoded, mover sponsor banners al rail/footer, comprimir hint-banner SIMPLE a 1 línea. Cada match card debe respirar.

2. **2 templates de match card**:
   - **Próximos**: card alta (~180px) con input destacado + trivia integrada + status countdown + phase multiplier badge.
   - **Jugados**: compact row (~60-72px) con 1 línea: `Hoy 20:00 · Octavos · 🇲🇽 MEX 2—1 ARG 🇦🇷 · Tu: 2—1 · ✓ Exacto +10 ·  →`.
   - Reduce el scroll de Jugados en 60%.

3. **Foco en la acción del momento**:
   - Si hay trivia activa para un match LIVE → esa card domina el viewport (no es un sub-component pequeño).
   - Si hay pending picks con kickoff < 1h → banner urgente sticky top.
   - Si hay bonus phase (cuartos+) → pill x2 visible en cada card.
   - El feed actual trata a todos los matches iguales.

### Cambios secundarios que cierran el último mile

- Filtros "Solo pendientes" + "Por grupo activo" para users con 50+ matches.
- Sistema unificado de pills (10 tokens).
- Page tabs con badge de progreso por vista.
- Trivia: chips cripticos → un solo CTA claro "Responder trivia (+10 pts)".
- "Sin pick" pill pasiva → highlight "Predecí →" activo.
