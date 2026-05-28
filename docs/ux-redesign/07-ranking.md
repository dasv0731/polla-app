# Análisis UX: `/ranking` — RankingComponent

> Surface #7 del walkthrough. Vista de leaderboard con scope toggle Global/Mis grupos.
> **Layout dual** mobile vs desktop muy distintos (mobile = secciones separadas, desktop = tabla).

---

## 1. Identidad

- **Propósito**: ver el leaderboard del Mundial. Toggle entre **Global** (todos los jugadores) y **Mis grupos** (unión deduplicada de miembros de los grupos del user).
- **Audiencia**: cualquier user post-login. Pico de uso después de cada match cuando los puntos se publican.
- **Frecuencia**: alta. Es la pregunta que más motiva — "¿cómo voy?".
- **Entry points**: sidebar "Ranking", home ranking card link, profile list item "Mis comodines/Picks especiales/Notificaciones" (siblings), deep-link, post-match notif (cuando se implementen los kinds nuevos).

---

## 2. Estructura — mapa general

Esta pantalla tiene **dos layouts explícitos** (`.rank-only-mobile` / `.rank-only-desk`) que muestran distinta información:

```
┌──────────────────────────────────────────────────────────┐
│ COMÚN — page-level                                        │
├──────────────────────────────────────────────────────────┤
│ [page__header]                                            │
│  ├── kicker "MUNDIAL 2026 · {scopeLabel}"                 │
│  ├── h1 "Ranking"                                         │
│  ├── meta "{N} jugadores · actualizado X"                 │
│  └── [rank-pos-badge] — desktop · solo si myRank          │
│      ├── kicker "TU POSICIÓN"                             │
│      ├── num "#N"                                         │
│      └── delta "▲ subiste 3 puestos" / "Ranking global"  │
│                                                           │
│ [rank-hero] — mobile · solo si myRank                    │
│  ├── top: "Tu posición {scope}" + "#N" + delta this week  │
│  │   + grandes pts                                        │
│  └── stats: exactos · resultados · "de N"                 │
│                                                           │
│ [rank-filters · TABS REALES]                              │
│  └── seg role="tablist":                                  │
│      ├── Global                                           │
│      └── Mis grupos                                       │
│                                                           │
│ [empty state | loading | contenido según scope]           │
└──────────────────────────────────────────────────────────┘

MOBILE (.rank-only-mobile)            DESKTOP (.rank-only-desk)
─────────────────────────────         ─────────────────────────────
[rank-podium-section]                  [rank-table-wrap]
  ├── h2 "🏆 Top 3"                     └── table:
  └── 3 cards:                              ├── thead # · Jugador · Pts ·
      ├── Plata 🥈 #2                      │   Exactos · Result.
      ├── Oro 🥇 #1 (centro elevado)       ├── tbody:
      └── Bronce 🥉 #3                     │   ├── top 7 rows (medal i<3)
                                            │   ├── gap row "··· N más ···"
[rank-section "Cerca de ti"]                │   │   (si user no en top 7)
  └── rows ±2 alrededor del user           │   └── near-me rows (±2)
      (5 rows total, .is-me highlight)      └── footer:
                                                ├── "Mostrando 1-N + posic.
[rank-section "Top general"]                    │  cercanas · N total"
  ├── h2 + "Ver más →"                          └── btn "Ir al top →"
  └── primeras N rows (default 5,
      expanding via loadMoreMobile)
```

**Tabs reales del surface**: Global / Mis grupos (`.rank-filters`). No hay otros tabs internos.

---

## 3. Componentes page-level (compartidos)

### 3.1 Page header

**Render**:
```
MUNDIAL 2026 · GLOBAL                                  TU POSICIÓN
Ranking                                                #47
142 jugadores · actualizado hace 3 min                ▲ subiste 3 puestos
```

**Datos**:
- Kicker: `"MUNDIAL 2026 · " + scopeLabelHeader()` (varía por scope)
- h1 "Ranking" constante
- Meta: `totalPlayers()` + `updatedAgo()`
- `rank-pos-badge` (desktop only?): kicker + #N + delta o fallback message

**Análisis**:
- ✓ Información clave compacta.
- ⚠ El badge "TU POSICIÓN" en desktop **duplica** el hero card que aparece en mobile. ¿En desktop ambos se ven o solo el badge? No tiene `.rank-only-desk`/`.rank-only-mobile` el badge — está dentro del header común. Inconsistente.
- ⚠ Delta fallback message "Ranking global" / "En tus grupos" cuando no hay delta es **el scope label otra vez** — redundante (ya está en el kicker).
- 🟡 "actualizado hace 3 min" — `updatedAgo()` usa lógica hardcoded en español (`/components/ranking.component.ts:543` mencionado en bucket review). Debería usar `Intl.RelativeTimeFormat`.

### 3.2 Hero card (mobile)

**Render** (solo si myRank no null):
```
Tu posición global
#47                                    342
▲ subiste 3 puestos esta semana       pts
─────────────────────────────────────────
  12               8                   de 142
  exactos          resultados
```

**Análisis**:
- ✓ Información rica en card compacto.
- ⚠ Sin clase `.rank-only-mobile` en el código — se renderiza en desktop también si myRank != null. **Posible bug de visibilidad dual** con el badge del header.
- 🟡 "esta semana" hardcoded sin contexto del último snapshot — actualmente con localStorage fallback es "desde la última vez que viste el ranking" (puede ser hace 2h, no 1 semana).
- 🟡 "de 142" formato confuso — ¿de qué? "de 142 jugadores totales" más claro.

### 3.3 Filtros Global / Mis grupos

**Render**:
```
[ Global ]  [ Mis grupos ]
```

**Análisis**:
- ✓ A11y wired correctamente (P1.2 done: role="tablist" + aria-selected).
- ✓ Toggle simple.
- 🟡 Cuando scope='mis-grupos', el user no ve cuántos grupos suyos están "fusionados" en la lista. Sería útil mostrar "Mis grupos (3 grupos · 47 jugadores)" o tab subtítulo.
- 🟡 Pre-empty: si user no tiene grupos privados, "Mis grupos" tab es dead end. Debería deshabilitarse o renombrarse.

---

## 4. Empty states

### 4.1 Mis grupos sin grupos privados

**Render**:
```
Sin grupos privados
Únete a un grupo o crea uno para ver tu ranking interno.
[Crear un grupo →]
```

**Análisis**:
- ✓ Mensaje claro.
- 🟠 **Sin opción "Unirme con código"** — mismo gap que bracket y group-stage-predict.
- 🟡 Link `/groups/new` mientras app usa modal `openCreate()`.

### 4.2 Global sin datos

**Render**:
```
Aún no hay datos de ranking
El ranking se actualiza cuando se publican los resultados de los partidos.
```

**Análisis**:
- ✓ Mensaje informativo.
- ⚠ Sin CTA. El user puede no entender qué hacer mientras tanto ("hacé tus picks →" sería buen CTA).
- 🟡 Estado pre-torneo siempre cae acá — debería diferenciarse de "torneo en curso pero sin resultados aún".

---

## 5. Layout MOBILE

### 5.1 Podium top 3 (`rank-podium-section`)

**Render**:
```
            🏆 Top 3
        🥈              🥇              🥉
       p2.av         p1.av           p3.av
      @handle       @handle         @handle
       group         group           group
       pts pts       pts pts        pts pts
```

**Datos**:
- top3()[0/1/2]: handle, avatar initial, groupsLabel, points
- Medals as `aria-hidden` (P4.D done)

**Análisis**:
- ✓ Visualmente icónico — pattern reconocible de "podium".
- ✓ Oro centrado y elevado (CSS).
- ⚠ **Después de Fase A.6 esta sección quedó `.rank-only-mobile`**: en desktop la tabla ya muestra medals en top 3, así que el podium duplicaría. ✓ correcto.
- ⚠ Pero en MOBILE el podium se ve Y la sección "Top general" debajo ALSO muestra medals en los primeros 3. **Duplicación interna mobile**: top 3 visible 2 veces.
- 🟠 Si user llega a ver #1, su info aparece: en el header badge, hero card, podium, top general row 1, y posiblemente en "Cerca de ti". **5 lugares mostrando lo mismo** — feedback excelente pero overkill.
- 🟡 Emoji 🏆 anti-pattern.
- 🟡 `groupsLabel` en el podium card puede estar vacío para users sin grupos públicos. Card se ve incompleto.

### 5.2 Cerca de ti (`rank-section`)

**Render**:
```
Cerca de ti
─────────────────────────────────────────
#45  AV  @user1                  102 pts
#46  AV  @user2  ▲2              99 pts
#47  AV  @TÚ · tú                95 pts   ← .is-me highlight
#48  AV  @user4  ▼1              92 pts
#49  AV  @user5                  90 pts
```

**Datos**:
- nearMeRows: ±2 alrededor del current user
- Per row: position, avatar initial, handle (+ "· tú" si me), delta, groupsLabel, points
- `.is-me` highlight

**Análisis**:
- ✓ Útil — el user puede ver con quién compite directo.
- ✓ "· tú" indicator es clear.
- ✓ Delta visible per row.
- ⚠ Esta sección solo aparece si user no está en top 7 (por el `@if (myRank() !== null && !meInTop7())` en desktop, y `@if (nearMeRows().length > 0 && myRank() !== null)` en mobile). Pero en mobile la condición es más permisiva — puede mostrarse incluso si user está en top 3, duplicando la información del podium.
- 🟠 Si delta no está disponible (RankSnapshot backend NOT implemented), todos los rows muestran sin delta — la columna queda vacía.
- 🟡 `groupsLabel` aparece si existe pero el espacio es chico — puede truncarse mal.

### 5.3 Top general (`rank-section`)

**Render**:
```
Top general                                      Ver más →
─────────────────────────────────────────
#1  🥇 AV  @user1                       102 pts
#2  🥈 AV  @user2                        99 pts
#3  🥉 AV  @user3                        95 pts
#4    AV  @user4                          90 pts
#5    AV  @user5                          87 pts
```

**Análisis**:
- ⚠ Default `mobileTopVisibleCount = 5` — muestra solo top 5. Botón "Ver más →" incrementa.
- 🟠 **Duplica el podium**: top 3 ya está visible arriba con medals. Acá vuelve a aparecer con los mismos medals.
- 🟠 **Duplica "Cerca de ti"** si user está cerca del top.
- 🟡 "Ver más →" sin indicar cuántos más se cargan (5? 10? todos?).
- 🟡 "Ir al top →" del desktop no existe en mobile — sin shortcut para scroll.

---

## 6. Layout DESKTOP

### 6.1 Tabla full (`rank-table-full`)

**Render**:
```
#       Jugador                          Pts    Exactos    Result.
🥇      AV  @user1                       102      12         8
        Oficina Q1, Familia 2026
🥈      AV  @user2                        99      11         9
🥉      AV  @user3                        95      10         8
4       AV  @user4                        90      9          7
5       AV  @user5                        87      9          6
6  ▲2   AV  @user6                        85      8          7
7       AV  @user7                        83      8          7
─────────────────────────────────────
···  N jugadores más  ···
─────────────────────────────────────
45      AV  @user45                       40      4          3
46  ▼1  AV  @user46                       39      4          3
47  ▲3  AV  @TÚ · tú                      38      4          2   ← .is-me
48      AV  @user48                       37      4          2
49      AV  @user49                       36      3          3

Mostrando 1–7 + posiciones cercanas a ti · 142 total       [Ir al top →]
```

**Análisis**:
- ✓ Tabla densa — buen formato para desktop.
- ✓ Medal column para top 3 + número para el resto.
- ✓ Delta arrows con clases `.delta--up` / `.delta--down`.
- ✓ Gap row "··· N jugadores más ···" comunica claramente la separación.
- ⚠ "is-me" en near-me row puede estar lejos del usuario que llegó al rank a través del podium o del badge.
- ⚠ Top 3 row con medal duplica la información que en mobile estaba en el podium.
- 🟠 Columnas Exactos y Result. son útiles pero **estadísticamente correlacionadas con Pts** — un user con muchos exactos tiene muchos pts. Aporta detalle pero satura columnas en mobile (ya no se ven en mobile rows).
- 🟡 Sin sort options. El user no puede ordenar por exactos descending para ver "quién acertó más marcadores exactos".
- 🟡 "Ir al top →" button scrollea al top de la tabla — sin warning, usa `window.scrollTo` con behavior smooth (no respeta prefers-reduced-motion, ya señalado en bucket 4 review).

---

## 7. Sistema de delta (RankSnapshot)

**Estado actual** (documentado extensamente en el código, línea 28-70):

- **Backend**: NOT IMPLEMENTED. Necesita schema `RankSnapshot` + job semanal EventBridge.
- **Frontend fallback**: localStorage personal. Guarda posición "última visita" → calcula `previousLocal - current`.
- **Resultado**: solo el current user ve su propio delta (con semántica "desde la última vez"). El resto de users muestra `deltaPosition: null` → sin delta arrows.

**Análisis**:
- 🔴 **Delta del current user es semánticamente confuso**: el localStorage se actualiza en cada visita, no semanalmente. Si el user visita ranking 2× al día, su delta es "desde mi visita anterior" (puede ser hace 2h). El header dice "esta semana" pero NO es "esta semana".
- 🔴 **Resto de users sin delta** = columna mayormente vacía. El user no entiende por qué algunos rows tienen ▲/▼ y otros no.
- 🟠 Decision: implementar backend job (alto esfuerzo) o **quitar deltas** hasta que backend esté listo (eliminar confusion).
- 🟡 Texto "esta semana" hardcoded sin source-of-truth.

---

## 8. Cross-cutting · hallazgos UX (priorizados)

🔴 **Quíntuple visibilidad del top user mobile**: el user #1 aparece en (badge / hero card / podium / top general / cerca-de-ti si aplica).

🔴 **Delta system es semi-mentira**: solo current user tiene fallback, resto muestra null. "Esta semana" no es semanal.

🔴 **Top 3 duplicado mobile** (podium + top general con medals).

🟠 **Header badge "TU POSICIÓN" sin clase mobile/desk** — posible doble visibilidad con hero card.

🟠 **Tab "Mis grupos" sin contexto** ("3 grupos · 47 jugadores").

🟠 **Pre-empty Mis grupos** ("Crear un grupo →" sin "Unirme con código").

🟠 **Empty global sin CTA** ("Hacé tus picks →" sería útil).

🟠 **`updatedAgo()` hardcoded español** sin `Intl.RelativeTimeFormat`.

🟠 **"esta semana" hardcoded** en hero card delta — no refleja la semántica real del localStorage fallback.

🟡 **Sin sort options** (por exactos, por results, por delta).

🟡 **"Ver más →" sin indicar cuántos** más se cargan.

🟡 **Sin "Ir al top →" en mobile**.

🟡 **groupsLabel puede vacío** en podium cards.

🟡 **scrollToTop sin prefers-reduced-motion** check.

🟡 **`/groups/new`** en empty mientras app usa modal `openCreate()`.

🟡 **Emoji 🏆🥇🥈🥉** anti-pattern (aunque aria-hidden).

🟡 **myDelta() fallback localStorage** sin warning al user de qué significa el delta.

🟢 **Pre-podium scrollIntoView** del Ver más button (smooth) ya marcado en audit previo.

🟢 **Columnas Exactos y Result.** correlacionadas con Pts — saturan tabla.

---

## 9. Antipatrones detectados

| Regla | Violación |
|---|---|
| **Avoid duplicate data** | Top user en 5 lugares mobile |
| **Empty states** | Global sin CTA contextual |
| **Hardcoded i18n** | "esta semana" + `updatedAgo()` |
| **Misleading data** | Delta system semi-implementado |
| **Data hierarchy** | Cerca-de-ti se muestra si user en top → solapamiento con podium |
| **Mobile-desktop parity** | Hero card sin clase de visibilidad — posible doble |
| **no-emoji-icons** | 🏆🥇🥈🥉 |
| **Sort affordance** | No hay ordenamiento por columna |
| **`/groups/new` link** vs modal pattern | Inconsistencia |

---

## 10. Anclas para el redesign

### Core

1. **Toggle Global / Mis grupos** (sub-seg)
2. **Mi posición visible + delta** (1 sola fuente, no 5)
3. **Top 3 con medals** (1 sola fuente, no podium + table)
4. **Cerca de ti** (decisivo para engagement)
5. **Full leaderboard expandible**

### Contextual

- **Pre-torneo**: empty state con CTA a "Hacer picks"
- **Durante**: ranking activo con deltas (cuando backend listo)
- **Post-torneo**: highlight del top 3 final + medals

### Quitar

- **Duplicación de top 3** mobile (podium + top general — quedarse con uno)
- **Badge header vs hero card** — decidir si mobile usa hero y desktop usa badge (exclusivo)
- Emojis 🏆🥇🥈🥉 → SVG icons o estilizado puro tipográfico
- "Esta semana" hardcoded si delta no es semanal
- Delta para users que no son el current (hasta que backend esté listo) — confunde

### Agregar

- **Empty state global con CTA** "Hacer picks →"
- **Empty state mis-grupos con "Unirme con código"**
- **Sort options** (por exactos, results)
- **Tab Mis grupos con contexto** ("3 grupos · 47 jugadores")
- **`updatedAgo()` con Intl.RelativeTimeFormat**
- **Backend RankSnapshot** (implementar el TODO documentado) — habilita deltas semanales reales
- **Sparkline o trend chart** opcional — visualiza evolución
- **Filter por mode** (Solo Simple / Solo Completo) cuando user tiene ambos
- **Compartir mi posición** (botón) — engagement social

### Bug fix

- Hero card / header badge: asignar `.rank-only-mobile` y `.rank-only-desk` explícitamente para evitar doble visibilidad

---

## 11. Resumen ejecutivo

**El ranking es uno de los surfaces con mejor info architecture pero el más duplicado.** En mobile, el top 3 puede aparecer 4 veces (badge + hero + podium + top general row 1-3). En desktop el top 3 aparece en la tabla con medals + el badge si user es top user. Es overkill.

### 3 decisiones que cambian todo

1. **Una sola fuente para mi posición**: hero card en mobile + badge en desktop (asegurar con `.rank-only-mobile` / `.rank-only-desk`). Quitar el otro. **Una sola fuente para top 3**: tabla con medals (desktop) o "Top general" con medals (mobile). Quitar el podium-section o consolidarlo con el header de la lista.

2. **Resolver el delta system honestly**:
   - **Opción A**: implementar el backend RankSnapshot (TODO documented) → deltas semanales reales para todos.
   - **Opción B**: quitar todos los deltas hasta que backend esté listo. Mejor no mostrar nada que mostrar info confusa.

   No queda en limbo: la situación actual ("solo mi delta personal con semántica vaga, resto null") es peor que ambas alternativas.

3. **Empty states con CTA contextual**:
   - Pre-torneo global: "Hacé tus picks para entrar al ranking →" link a `/picks`
   - Sin grupos privados: "Crear" + "Unirme con código" (no solo Crear)

### Cambios secundarios

- Sort options en tabla desktop (click headers).
- `Intl.RelativeTimeFormat` para "actualizado hace…".
- "Mis grupos" tab con contexto ("3 grupos · 47 jugadores").
- Quitar "esta semana" hardcoded del hero card.
- Botón "Ir al top →" en mobile.
- Indicar cuántos más se cargan con "Ver más →".
- Sparkline/trend opcional.
- Compartir botón opcional.
- Reemplazar emojis con SVG o styling tipográfico.
