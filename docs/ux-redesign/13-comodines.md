# Análisis UX: `/mis-comodines` — ComodinesListComponent

> Surface #13 del walkthrough. Hub de comodines del user.
> **Una de las surfaces más complejas de la app**: sistema de estados (PENDING_TYPE_CHOICE → UNASSIGNED → ASSIGNED → ACTIVATED + EXPIRED), 9 tipos de comodines, 3 modales internos, redeem code inline, catálogo siempre visible, sección educativa.

---

## 1. Identidad

- **Propósito**: gestión del inventario de comodines del user. Ver lo que tiene, configurar pendientes, aplicar disponibles, canjear nuevos códigos.
- **Audiencia**: solo users en grupos COMPLETE con comodines habilitados.
- **Frecuencia**: media. Pico cuando se obtienen comodines (post-sweep) y antes de matches importantes (para asignar).
- **Entry points**: sidebar (no link directo), home "Detalles →" en sección comodines, profile "Mis comodines" link, notif deeplinks (post Fase B6), FAB Canjear (mobile) en `/picks` → abre el modal de redeem (no esta página).

---

## 2. Estructura — mapa general

```
┌──────────────────────────────────────────────────────────┐
│ [back-link] "‹ Volver a Mis picks"                       │
│                                                          │
│ [com-header]                                             │
│  ├── kicker "MULTIPLICADORES Y BENEFICIOS"               │
│  ├── h1 "Mis comodines"                                  │
│  ├── sub "Úsalos antes del partido…"                     │
│  └── stats 4-up:                                         │
│      ├── Total                                           │
│      ├── Disponibles (verde)                             │
│      ├── Pendientes (warn)                               │
│      └── Pts ganados (mute)                              │
│                                                          │
│ [pending banner] (condicional si pendingCount > 0)       │
│  └── "⚠ Tienes N comodines pendientes de configurar"     │
│      "Elige el tipo antes de la fecha de expiración."    │
│      [Configurar ahora →] → scrollToFirstPending()       │
│                                                          │
│ [com-filters]                                            │
│  ├── seg pills: Todos · Disponibles · Usados · Expirados │
│  └── btn "🎁 Canjear código" → scrollToCanjear()         │
│                                                          │
│ [loading | filled]                                       │
│                                                          │
│ [com-grid] (cuando filled)                               │
│  ├── [com-card] × N (por cada comodín)                   │
│  │   ├── badge de estado                                 │
│  │   ├── title (typeInfo name o "Comodín sin configurar")│
│  │   ├── mech (typeInfo impact o instrucción)            │
│  │   ├── row Fuente                                      │
│  │   ├── row Asignado a / Expiró / Ventana (variant)     │
│  │   └── CTA contextual O footer info según estado:      │
│  │       ├── PENDING_TYPE_CHOICE: status + "Configurar →"│
│  │       ├── UNASSIGNED + canAssign: "Aplicar a partido →"│
│  │       ├── UNASSIGNED + canUse: "Usar →"               │
│  │       ├── ACTIVATED: footer "+N pts · fecha"          │
│  │       └── EXPIRED: footer "No fue activado a tiempo"  │
│  └── [empty filter] si filteredComodines.length === 0    │
│      y filter !== 'all'                                  │
│                                                          │
│ [card-canjear] form siempre visible al final del grid    │
│  ├── icon 🎁                                             │
│  ├── tit "¿Tienes un código?"                            │
│  ├── sub                                                 │
│  ├── input PEPSI100 (toUpperCase live)                   │
│  ├── btn Canjear                                         │
│  └── error / success messages                            │
│                                                          │
│ [empty-block] si no hay comodines y filter === 'all'     │
│                                                          │
│ [com-catalog] SIEMPRE VISIBLE                            │
│  ├── h2 "Tipos disponibles"                              │
│  ├── sub "Los 9 tipos que existen…"                      │
│  └── grid × 9 cards (con ✓ tienes si owned)             │
│                                                          │
│ [com-howto] SIEMPRE VISIBLE                              │
│  └── h2 "¿Cómo funcionan los comodines?"                 │
│      ├── step 1 "Consíguelos"                            │
│      ├── step 2 "Aplícalos"                              │
│      └── step 3 "Gana más"                               │
│                                                          │
│ [3 MODALES INTERNOS]                                     │
│  ├── Claim modal (elegir tipo) — 9 opciones radio        │
│  ├── Assign modal (aplicar a partido) — switch por tipo  │
│  └── Use modal (ejecutar) — switch por tipo              │
└──────────────────────────────────────────────────────────┘
```

**Tabs internos**: filter pills (Todos / Disponibles / Usados / Expirados) — son **role="group"** con `aria-pressed`, no `role="tablist"` (P1.2 wired así).

---

## 3. Componentes page-level

### 3.1 Back link

**Render**: `‹ Volver a Mis picks` — ¿por qué a /picks y no a algún otro origen?

**Análisis**:
- 🟡 **Back hardcoded a `/picks`**. Si user llegó desde profile o desde notif (notif deeplink post Fase B6), el back manda a un sitio inesperado.
- 🟡 Back navigation hardcoded en lugar de `history.back()`.

### 3.2 Header

**Render**:
```
MULTIPLICADORES Y BENEFICIOS
Mis comodines
Úsalos antes del partido para multiplicar puntos o desbloquear beneficios.
Máximo 5 acumulados, 1 por tipo (excluyendo caducados).

[Total: 3] [Disponibles: 2] [Pendientes: 1] [Pts ganados: +12]
```

**Análisis**:
- ✓ **Stats 4-up** es info rica y motivadora.
- ✓ Sub-text explica reglas (max 5, 1 por tipo).
- ⚠ "MULTIPLICADORES Y BENEFICIOS" kicker es redundante con el h1 (ambos hablan de comodines).
- ⚠ 4 stats: Total + Disponibles + Pendientes + Pts ganados — overlap parcial (Total = Disponibles + Usados + Expirados + Pendientes). Tres son derivables.
- 🟡 "Pts ganados +12" no contextualiza — ¿de qué? ¿del torneo? ¿este mes? Sin time scope.
- 🟡 4 stats en mobile probablemente wrap a 2 lineas.

### 3.3 Pending banner

**Render** (solo si pendingCount > 0):
```
⚠ Tienes N comodines pendientes de configurar
Elige el tipo antes de la fecha de expiración.

[Configurar ahora →]
```

**Análisis**:
- ✓ Banner urgente bien diferenciado.
- ✓ CTA scrollToFirstPending() — scroll inteligente al primer card pending.
- 🟠 **Información duplicada**: el banner dice "configurar pendiente" + el card pending tiene status interno "⚠ Elige el tipo antes que caduque" + CTA "Configurar comodín →". **3 lugares** del mismo mensaje.
- 🟡 Pluralization manual ("1 comodín" / "N comodines") — código repetido.

### 3.4 Filtros + canjear

**Render**:
```
[Todos · 3] [Disponibles · 2] [Usados · 1] [Expirados · 0]    [🎁 Canjear código]
```

**Datos**:
- 4 filter pills con counters
- Filter signal con 4 estados

**Análisis**:
- ✓ Counters por filter ayudan a anticipar contenido.
- 🟠 **El último filter "Expirados" NO tiene `[attr.aria-pressed]`** — solo `[class.is-active]`. Inconsistente con los otros 3.
- 🟠 **"Canjear código" button scrollToCanjear()** — scroll al form al final de la lista. Pero ese form **está siempre visible al final del grid** (como una card más). Es accesible vía scroll natural también. La duplicación de affordances confunde.
- 🟡 "Canjear código" con emoji 🎁 (anti-pattern).

### 3.5 Card de comodín (com-card)

**Render** (varía por estado):
```
PENDING_TYPE_CHOICE:
┌─────────────────────────────────┐
│ [PENDIENTE badge]               │
│                                 │
│ Comodín sin configurar          │
│ Elige uno de los 9 tipos…       │
│                                 │
│ Fuente · Sponsor PEPSI          │
│ Ventana · …                     │
│                                 │
│ ⚠ Elige el tipo antes que caduque│
│ [Configurar comodín →]          │
└─────────────────────────────────┘

UNASSIGNED:
┌─────────────────────────────────┐
│ [DISPONIBLE badge]              │
│                                 │
│ Multiplicador x2                │
│ Duplica los puntos del partido…  │
│                                 │
│ Fuente · Sponsor PEPSI          │
│ Ventana · Antes del kickoff…    │
│                                 │
│ [Aplicar a un partido →]        │
└─────────────────────────────────┘

ACTIVATED:
┌─────────────────────────────────┐
│ [USADO badge]                   │
│                                 │
│ Multiplicador x2                │
│ Duplica los puntos del partido…  │
│                                 │
│ Fuente · Sponsor PEPSI          │
│ Asignado a · MEX vs ARG          │
│                                 │
│ +20 pts ganados · 14 jun        │
└─────────────────────────────────┘

EXPIRED:
┌─────────────────────────────────┐
│ [CADUCADO badge]                │
│                                 │
│ Multiplicador x2                │
│ Duplica los puntos del partido…  │
│                                 │
│ Fuente · Sponsor PEPSI          │
│ Expiró · 15 jun                  │
│                                 │
│ No fue activado a tiempo         │
└─────────────────────────────────┘
```

**Análisis**:
- ✓ **Variants visuales claros** según estado (badge + class).
- ✓ Card en estado PENDING tiene id para scroll.
- ✓ Info estructurada: badge → title → mech → rows → CTA/footer.
- 🟠 **Card pending muestra "Comodín sin configurar"** + impact "Elige uno de los 9 tipos…" — info útil pero el title "sin configurar" se siente como error.
- 🟠 **Pending card status text duplica banner** ("⚠ Elige el tipo antes que caduque" vs banner "Tienes N pendientes").
- 🟠 **Ventana label es texto largo** dentro de la fila (`max-width:60%`). En cards estrechos puede truncarse mal.
- 🟡 **Inline styles** en `style="border-top:none;padding-top:0;"`, `style="font-size:11px;color:var(--wf-ink-3)…"` — design system gap.
- 🟡 ACTIVATED footer "+N pts ganados · fecha" es info útil pero textual (sin visual highlight).
- 🟡 EXPIRED footer "No fue activado a tiempo" — texto pasivo, no orienta a aprender ("Próxima vez asignalo antes de…").

### 3.6 Card canjear código

**Render**: siempre visible al final del grid, mismo grid item.

**Análisis**:
- ✓ Acción siempre accesible.
- ⚠ **Duplica el `RedeemModal`** consolidado en Fase A. Bucket 4 review marcó esto: "3 surfaces para canjear código (input inline + sponsor-redeem page + modal wrapper)". Fase A consolidó pero quedó la inline form en este page + el modal RedeemModal.
- ⚠ Si user llega a este page con intención de canjear, ¿usa el form inline acá o abre el modal? Ambos canjean igual.
- 🟡 `(input)="codeInput = codeInput.toUpperCase()"` — el assignment dentro del input handler puede causar cursor jumping en algunos browsers.
- 🟡 Sin paste hint o auto-format dashes (PEPSI-100).
- 🟡 Sin "history of recent codes" — si user canjea uno por sponsor y otro días después, no recuerda cuáles ya canjeó.

### 3.7 Empty states (2 distintos)

**A. Filter empty** (filter !== 'all', filteredComodines === 0):
```
No hay comodines en este filtro.
```

**B. No comodines at all** (filter === 'all', filteredComodines === 0):
```
Aún no tienes comodines
Canjea un código arriba o gana uno acumulando 20 trivias correctas,
llenando tus picks 7 días antes del torneo, o prediciendo ≥80% de
marcadores antes del kickoff.
```

**Análisis**:
- ⚠ **Empty B usa `.empty-block`** (consistente con otras surfaces) pero **Empty A usa `.loading-msg`** — inconsistencia.
- ⚠ Empty B menciona "Canjea un código arriba" pero el card-canjear está ABAJO en el grid. Misleading.
- 🟡 Empty B sin CTA — solo texto explicativo.

### 3.8 Catálogo de 9 tipos (siempre visible)

**Render**:
```
Tipos disponibles
Los 9 tipos de comodines que existen y qué hace cada uno. Los que ya tenés
se marcan con un check.

[9 cards en grid]
```

Cada card del catálogo:
- title
- impact text
- window "⏱ {window}"
- ✓ tienes badge si owned

**Análisis**:
- 🔴 **Siempre visible** independiente del estado del user. Bucket 4 review lo marcó: "Útil la primera vez, ruido después. Wrap en `<details>` colapsable o mover a onboarding."
- 🔴 **Duplica info que ya está en cards del user** (los typeInfo nombre+impact+window ya aparecen en las own cards) y en el claim modal (los 9 tipos para elegir).
- 🟠 **9 tipos demasiados** — bucket 4 review identificó:
  - SAFE_PICK ×2 (GROUP_SAFE_PICK + BRACKET_SAFE_PICK) — casi idénticos
  - RESET ×2 (GROUP_RESET + BRACKET_RESET) — variantes del mismo concepto
  - ANTI_PENALTY como meta-comodín confuso
  - Posible reducción a 6 tipos
- 🟡 Emoji ⏱ en window line (con aria-hidden tras P4).

### 3.9 Cómo funcionan (siempre visible)

**Render**: 3 steps "Consíguelos / Aplícalos / Gana más".

**Análisis**:
- 🔴 **Siempre visible**. Bucket 4 review: "Útil la primera vez, ruido después. Wrap en details colapsable o mover a onboarding."
- 🟡 3 steps en gran tamaño al final del page — espacio desperdiciado para users frequent.

---

## 4. Modales internos (3)

Ya analizados parcialmente en el análisis general. Cada modal tiene:

### 4.1 Claim modal (elegir tipo de comodín)

**Trigger**: card pending → "Configurar comodín →"

**Render**: lista de los 9 tipos como radio buttons + impact text + ventana.
- Los tipos owned están disabled (no puedes claimear 2 del mismo tipo).
- Bucket 4 review: "Modal de claim necesario por la elección vinculante de 9 opciones".

### 4.2 Assign modal (aplicar comodín a partido/contexto)

**Trigger**: card disponible (UNASSIGNED + canAssign) → "Aplicar a un partido →"

**Render**: `@switch (comodin.type)` con 5 form layouts diferentes según tipo:
- MULTIPLIER_X2 → seleccionar partido
- PHASE_BOOST → seleccionar fase
- GROUP_SAFE_PICK → seleccionar pos. de grupo
- BRACKET_SAFE_PICK → seleccionar equipo+fase
- REASSIGN_CHAMP_RUNNER → seleccionar equipo nuevo

**Análisis**:
- ⚠ "La asignación es vinculante" warning destacado — buen pattern para irreversible action.
- 🟠 5 layouts distintos en el mismo modal — la **complejidad cognitiva** es alta. El user que abre el modal no sabe qué form esperar.

### 4.3 Use modal (ejecutar comodín no-asignable)

**Trigger**: card disponible (UNASSIGNED + canUse) → "Usar →"

**Render**: switch para los tipos que se ejecutan (no se asignan):
- LATE_EDIT → editar un pick existente
- BRACKET_RESET → resetear bracket
- GROUP_RESET → resetear orden de grupo
- ANTI_PENALTY → modificar un BRACKET_SAFE_PICK existente

**Análisis**:
- ⚠ **Concepto "Use vs Assign" no es claro** para el user. Algunos comodines se "aplican a un partido" y otros "se usan" para hacer algo. Distinción técnica que no se comunica.
- 🟠 BRACKET_RESET puede tener form complejo (8 selects en bucket 4 review mention). Bucket 4: "considerar mover BRACKET_RESET a página dedicada".

---

## 5. Cross-cutting · hallazgos UX (priorizados)

🔴 **Catálogo de 9 tipos siempre visible** — duplica info de own cards + claim modal.

🔴 **Cómo funcionan siempre visible** — útil 1 vez, ruido siempre después.

🔴 **3 surfaces para canjear código** (form inline + RedeemModal global). Bucket 4 ya lo marcó.

🔴 **Información duplicada del pending state** — banner + card status + card CTA (3 lugares).

🔴 **9 tipos de comodines** — pares idénticos (SAFE_PICK ×2, RESET ×2) + ANTI_PENALTY meta-comodín. Bucket 4 sugirió simplificar a 6.

🟠 **Stats header redundantes** — 4 stats donde 3 son derivables (Total = suma de los otros).

🟠 **"Comodín sin configurar"** title se siente como error.

🟠 **Filter "Expirados" sin `aria-pressed`** — inconsistencia.

🟠 **Empty filter usa `.loading-msg`** vs `.empty-block` del otro empty.

🟠 **Empty B menciona "código arriba"** pero el form está abajo en grid.

🟠 **Assign modal con 5 layouts** según tipo — alta carga cognitiva.

🟠 **"Use vs Assign"** distinción técnica no comunicada.

🟠 **BRACKET_RESET use modal complejo** (8 selects) — candidato a page dedicada.

🟠 **Card-canjear inline form vs RedeemModal** — duplicación de surfaces.

🟠 **Inline styles** en card rows (`border-top:none;padding-top:0;`, `font-size:11px;color:var(--wf-ink-3);max-width:60%;`) — design system gap.

🟠 **Back link hardcoded a /picks** — no contextual.

🟡 **Kicker "MULTIPLICADORES Y BENEFICIOS"** redundante con h1.

🟡 **"Pts ganados"** sin time scope.

🟡 **Pluralization manual** repetido.

🟡 **Ventana label long** en card row puede truncarse.

🟡 **ACTIVATED footer** sin visual highlight.

🟡 **EXPIRED footer pasivo** sin orientación.

🟡 **toUpperCase en input handler** puede causar cursor issues.

🟡 **Code-redeem sin auto-format dashes**.

🟡 **Sin history of recent codes**.

🟡 **Emoji 🎁⏱⚠** (con aria-hidden tras P4 pero visualmente siguen).

🟢 **Modal Assign warning vinculante** — buen pattern.

🟢 **Card variants visuales** por status — claros.

🟢 **Stats sub-text** explica reglas (max 5, 1 por tipo).

---

## 6. Antipatrones detectados

| Regla | Violación |
|---|---|
| **Persistent education** | Catálogo + Cómo funcionan siempre visibles |
| **Avoid duplicate data** | 9 tipos en 3 lugares + pending msg en 3 lugares |
| **Empty state consistency** | `.loading-msg` vs `.empty-block` |
| **A11y filter consistency** | Filter Expirados sin aria-pressed |
| **Cognitive load** | 5 modal layouts dentro de Assign |
| **CTA path consistency** | Inline form vs modal vs page para canjear |
| **Stats redundancy** | Total derivable de los otros 3 |
| **Visual hierarchy** | ACTIVATED footer sin highlight |
| **Empty state guidance** | EXPIRED footer pasivo |
| **Back navigation hardcoded** | Always to /picks |
| **Inline styles** | Multiple card rows |
| **Domain model complexity** | 9 tipos con pares idénticos + meta-comodín |

---

## 7. Anclas para el redesign

### Core

1. **Header con stats** (reducir a 2-3)
2. **Pending banner urgente** (mantener)
3. **Filter pills + counters**
4. **Cards de comodín con variants visuales** por estado
5. **3 modales según acción** (claim / assign / use)
6. **Canjear código** (1 lugar)

### Contextual

- **Pre-torneo**: foco en "configurar pendientes" + canjear
- **Durante**: foco en "aplicar disponibles" + ver activos
- **Post-torneo**: foco en histórico + total pts ganados

### Quitar

- **Catálogo siempre visible** → wrap en `<details>` o mover a onboarding/help
- **Cómo funcionan siempre visible** → wrap en `<details>` o tour
- **Card-canjear inline** → solo RedeemModal global (consistencia con FAB)
- **Kicker redundante**
- **Stats Total** (derivable)
- **Filter "Expirados" sin aria-pressed** (consistency fix)
- **Inline styles** → design tokens

### Agregar

- **`details` colapsable** para catálogo + cómo funcionan
- **Time scope en "Pts ganados"** ("Pts ganados · Total" / "este mes")
- **Default `history.back()` o context-aware back**
- **Stats badge inline** en activados ("+20 pts" como pill destacado)
- **EXPIRED card** con CTA "Aprender" o "Próxima vez avisame antes de…"
- **Card-canjear como entry point** (botón) que abre RedeemModal — no form inline
- **Pluralization helper** centralizado
- **`aria-pressed` en filter Expirados**
- **Empty states consistentes** (`.empty-block` en ambos)
- **Empty B "Canjea arriba"** → "Canjea con el botón ↑" o reposicionar form
- **Use vs Assign explicación** corta
- **BRACKET_RESET** como page dedicada
- **Code-redeem auto-format dashes**
- **History of recent codes** (toast/list)

### Modelo de dominio (gran refactor, posterior)

- Reducir 9 tipos → 6 (per bucket 4):
  - SAFE_PICK con sub-scope (Grupos / Llaves)
  - RESET con sub-scope (Grupos / Llaves)
  - Eliminar ANTI_PENALTY o convertir en upgrade pasivo del BRACKET_SAFE_PICK

### Bug fix

- Filter Expirados aria-pressed
- Empty state class consistency
- Empty B copy "código arriba" vs "código abajo"

---

## 8. Resumen ejecutivo

**Surface funcionalmente completa pero saturada visualmente.** Lo que funciona:

- Sistema de estados claro con variants visuales por status
- Pending banner urgente
- Filter pills con counters
- Modal flow para configurar pendientes
- Card design rico

Los problemas son **estructurales** (qué se muestra siempre vs colapsable) y **de modelo de dominio** (9 tipos demasiados).

### 3 decisiones de diseño que cambian todo

1. **Colapsar catálogo + cómo funcionan**: usar `<details>` por default cerrados con label "Aprender más sobre comodines". User experto los esconde, user nuevo los expande. Recupera ~60% del scroll mobile.

2. **Eliminar card-canjear inline**: usar solo el RedeemModal global (consistencia con FAB de /picks). Botón "Canjear código" en filter row abre el modal — no scroll a un form en grid.

3. **Reducir 9 tipos → 6**: implementar la recomendación de bucket 4. Unificar SAFE_PICK + RESET con sub-scope. Eliminar ANTI_PENALTY o convertirlo en upgrade pasivo. Reduce la complejidad cognitiva del claim modal + assign modal switch.

### Cambios secundarios

- Stats header reducir a 3 (quitar Total)
- Filter Expirados aria-pressed (consistency)
- Empty states consistentes (.empty-block)
- Empty B copy fix
- Back link context-aware
- Pluralization helper centralizado
- EXPIRED card con CTA "aprender"
- ACTIVATED stats badge inline destacado
- Time scope en "Pts ganados"
- BRACKET_RESET como page dedicada
- Code-redeem auto-format
- History of recent codes
- Inline styles → design tokens
- SVG icons en lugar de emojis
- Pending banner + card status: consolidar a 1 mensaje (banner persiste + card sin status text duplicate)

**Nota retrospectiva**: este surface es uno de los más complejos de la app. El redesign **debe atacar el problema de modelo de dominio (9 tipos)** primero — sin eso, cualquier polish visual va a quedar saturado. Bucket 4 ya identificó esto. Decisión de producto: simplificar a 6 tipos o aceptar el actual y rediseñar para minimizar la complejidad visible.
