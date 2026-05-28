# Análisis UX: `/profile/special-picks` — SpecialPicksComponent

> Surface #15 del walkthrough. Pantalla de los 3 picks especiales del torneo.
> CHAMPION (20 pts), RUNNER_UP (12 pts), DARK_HORSE (8 pts) = 40 pts potenciales totales.
> Cierra al kickoff del primer partido del Mundial.

---

## 1. Identidad

- **Propósito**: el user elige 3 equipos para predicciones especiales (campeón / subcampeón / revelación). Estas predicciones se cierran al iniciar el torneo y otorgan puntos altos.
- **Audiencia**: cualquier user que pertenezca a al menos un grupo (SIMPLE o COMPLETE). Sin grupo: empty state.
- **Frecuencia**: muy baja. Setup pre-torneo + ajustes esporádicos hasta el lockout.
- **Entry points**: profile "Picks especiales" item, home "Picks especiales" chips (3 chips de los 3 tipos), deep-link.

---

## 2. Estructura — mapa general

```
┌──────────────────────────────────────────────────────────┐
│ [page-header]                                            │
│  ├── small "← Mi perfil · {totalPotential} pts pot."     │
│  ├── h1 "Picks especiales"                               │
│  ├── mode switch tabs (si availableModes > 1):           │
│  │   ├── Modo completo                                   │
│  │   └── Modo simple                                     │
│  │  OR                                                   │
│  │   mode hint (si solo 1 modo): "Predicción modo X."    │
│  └── lead "Eliges 3 selecciones antes del kickoff…"      │
│                                                          │
│ [main container-app]                                     │
│                                                          │
│ [empty state] si availableModes === 0                    │
│  └── "Necesitas un grupo primero"                        │
│                                                          │
│ [lock-banner] (siempre visible si tiene grupos)          │
│  ├── icon ⏰                                              │
│  ├── locked: "Bloqueados — el torneo ya empezó"          │
│  │   o                                                   │
│  └── countdown: "Cierra el {date}"                       │
│      + "Te quedan N días para definir tus picks…"        │
│                                                          │
│ [loading] o [special-picks grid]                         │
│                                                          │
│ [special-picks grid]                                     │
│  └── 3 articles (CHAMPION, RUNNER_UP, DARK_HORSE):       │
│      ├── header: label + points pill                     │
│      ├── current selected (avatar + name) o "Aún no…"    │
│      └── teams grid (32+ team buttons):                  │
│          └── button per team con .is-selected            │
│                                                          │
│ [save state footer]                                      │
│  ├── "Auto-guarda al cambiar la selección."              │
│  └── "Última edición: {time}"                            │
│                                                          │
│ [back CTA] "Volver a perfil"                             │
└──────────────────────────────────────────────────────────┘
```

**Tabs internos**: mode switch (Completo / Simple) — `role="tablist"` con `wf-seg` system.

---

## 3. Componentes desglosados

### 3.1 Page header

**Render**:
```
← Mi perfil · 40 puntos potenciales
Picks especiales

[Modo completo] [Modo simple]     ← si >1 modo

Eliges 3 selecciones antes del kickoff del primer partido del Mundial.
Una vez que arranque el torneo, no podrás editar.
```

**Análisis**:
- ✓ Back link claro a `/profile`.
- ✓ **"40 puntos potenciales" en kicker** comunica el incentivo upfront.
- ✓ Mode switch a11y wired correctly (tablist + aria-selected).
- ✓ Lead explica las reglas concisamente.
- ⚠ **Mode switch usa `.wf-seg`** mientras bracket usa `.seg` y group-stage-predict usa `.wf-seg` con role="tablist". 2 sistemas de segmented controls en componentes vecinos (doc 06 ya marcó esto).
- 🟠 **Mode switch sin warning** al cambiar — predicción del modo previo se mantiene en backend pero invisible visualmente (igual que bracket).

### 3.2 Empty state (sin grupos)

**Render**:
```
Necesitas un grupo primero
Crea o únete a un grupo para empezar tus picks especiales.
[Crear un grupo →]
```

**Análisis**:
- ✓ Mensaje claro.
- 🟠 **Sin opción "Unirme con código"** — mismo gap que bracket, group-stage-predict, ranking, groups-list.
- 🟡 Link `/groups/new` mientras app usa modal `openCreate()`.
- 🟡 Inline link verbal en el párrafo en lugar de button — affordance débil.

### 3.3 Lock banner

**Render** (pre-lock):
```
⏰  Cierra el 12 jun 2026
    Te quedan 23 días para definir tus picks.
    Después del primer partido los selectors se bloquean.
```

**Render** (post-lock):
```
⏰  Bloqueados — el torneo ya empezó
    Las picks especiales se cerraron al kickoff del primer partido.
```

**Datos**:
- `tournamentLockAt` signal
- `locked` computed (reactivo cada 5s vía `nowTick`)
- `daysUntilLock` computed

**Análisis**:
- ✓ **Lock banner siempre visible** comunica urgencia.
- ✓ Variants pre-lock / post-lock claras.
- ✓ Re-evalúa cada 5s — captura el momento del kickoff si user está en la pantalla.
- 🟠 Emoji ⏰ como icon (sin aria-hidden visible — verificar P4.D).
- 🟡 "Te quedan N días" — sin precision sub-día. Si quedan <24h, debería mostrar horas/minutos.
- 🟡 Sin countdown D/H/M/S como en pick-detail — pierde sentido de urgencia las últimas horas.

### 3.4 Special pick article (× 3)

**Render** (por pick):
```
┌──────────────────────────────────────────────────────┐
│ Campeón                                  20 pts      │
│ ─────────────────────────────────────────────────── │
│ [AV] México                                          │
│ ─────────────────────────────────────────────────── │
│ ┌──────────────────────────────────────────────────┐│
│ │ [🇲🇽 México] [🇦🇷 Argentina] [🇧🇷 Brasil] [🇪🇸 España]││
│ │ [🇩🇪 Alemania] [🇫🇷 Francia] [🇬🇧 Inglaterra] …  ││
│ │ ... 32+ buttons total per pick ...               ││
│ └──────────────────────────────────────────────────┘│
└──────────────────────────────────────────────────────┘
```

**Datos por article**:
- type label (Campeón / Subcampeón / Revelación)
- points pill (20 / 12 / 8)
- current selected (avatar + name) o empty state "Aún no elegiste"
- teams grid: 32+ team buttons con `app-team-flag`
- `.is-selected` para el actual
- `.special-pick--locked` si lock

**Análisis**:
- ✓ **Visual clarity**: cada pick es su propio article con header + current + grid.
- ✓ Current selected con flag prominente (size 32) + name.
- ✓ Empty state per pick ("Aún no elegiste").
- ✓ Team buttons con `app-team-flag` consistente.
- 🟠 **3 grids de 32+ teams = ~96+ buttons total** — mucha repetición visual. Si user quiere elegir un país obvio (México campeón, Argentina subcampeón, Croacia revelación), tap-tap-tap en 3 grids es OK pero scrolling es largo.
- 🟠 **No hay filter/search de teams** — para Mundial 2026 hay 48 equipos. Sin search, encontrar uno específico requiere scan visual completo.
- 🟠 **No hay "favorite" o "recent" shortcut** — un user que ya seleccionó MEX en CHAMPION debería poder marcar MEX rápido también en otros (aunque la validación lo bloquee, ver §3.5).
- 🟠 **No hay "deselect"** — user puede cambiar a otro equipo pero no volver a "Aún no elegiste". Si decide no llenar el pick, no puede.
- 🟡 **App-team-flag size=28** en grid (consistente con picks family) pero podría ser size=32 para tap-friendlier.
- 🟡 **Sin "Suggested by Polla"** o "Top picks del grupo" — sin social proof.

### 3.5 Validation cruzada CHAMPION/RUNNER_UP

**Código**:
```ts
if (type !== 'DARK_HORSE') {
  for (const k of ['CHAMPION', 'RUNNER_UP'] as const) {
    // ... probablemente clears conflicto
  }
}
```

**Análisis**:
- 🟠 **CHAMPION ≠ RUNNER_UP** validación enforced — pero **invisible al user**. Si selecciona MEX en CHAMPION y luego intenta MEX en RUNNER_UP, ¿qué pasa? Probablemente clears uno o muestra error. Sin verificar comportamiento real, no se sabe.
- 🟠 **DARK_HORSE puede coincidir con CHAMPION/RUNNER_UP** — bucket 4 review marcó esto. No hay hint visible que diga "la revelación sí puede coincidir". El user puede pensar que también está bloqueado.

### 3.6 Save state + back footer

**Render**:
```
Auto-guarda al cambiar la selección. Última edición: hace 2 min

[Volver a perfil]
```

**Datos**:
- `lastSavedAt` signal
- `saving` map per type signal
- Sync via `PicksSyncService` (con debounce 1500ms — bucket 4)

**Análisis**:
- ✓ Auto-save comunicado claramente.
- ✓ "Última edición" timestamp da confianza.
- 🟠 **`saving[type]` por pick existe en código** pero no se renderiza visualmente (no hay spinner per pick durante sync). El user no sabe cuál está syncing.
- 🟡 "Última edición: hace 2 min" — sin context de cuál pick fue editado.
- 🟡 Save indication solo en footer — fácil de no notar si user no scrollea hasta el final.
- 🟡 Sin "Mis selecciones actuales" summary en una sola línea (resume "Campeón: MEX · Sub: ARG · Revelación: HRV").

### 3.7 Loading

**Render**: "Cargando equipos…" plain text.

**Análisis**:
- 🟡 Sin skeleton para los 3 grids de 32 teams. Aparición pop-in.

---

## 4. Cross-cutting · hallazgos UX (priorizados)

🟠 **Mode switch sistema inconsistente** (`wf-seg` vs `seg` en bracket vs `seg` en otros).

🟠 **Mode switch sin warning** al cambiar (predicción del modo previo invisible).

🟠 **Empty state sin "Unirme con código"** + link a `/groups/new` vs modal.

🟠 **3 grids de 32+ teams = ~96 buttons** sin filter/search.

🟠 **CHAMPION≠RUNNER_UP validation invisible** al user.

🟠 **DARK_HORSE puede coincidir** pero sin hint visible.

🟠 **No hay "deselect"** option.

🟠 **`saving` per type signal no se renderiza** — sin spinner per pick durante sync.

🟠 **No filter/search** de teams.

🟠 **No "favorite" o "recent"** shortcut.

🟡 **Daysuntillock sin precision sub-día** (no horas/minutos cuando <24h).

🟡 **Sin countdown D/H/M/S** en lock banner (vs pick-detail).

🟡 **Lock banner emoji ⏰** anti-pattern.

🟡 **"Última edición"** sin context de cuál pick.

🟡 **Save indication solo footer** — fácil de no notar.

🟡 **Sin summary "Mis selecciones actuales"** una sola línea.

🟡 **App-team-flag size=28** podría ser size=32 tap-friendlier.

🟡 **Sin "Suggested by Polla"** o social proof.

🟡 **Loading sin skeleton**.

🟡 **Inline styles** múltiples (header text, save hint, etc.).

🟢 **Validation cruzada existe** (CHAMPION≠RUNNER_UP enforced en código).

🟢 **Lock re-evalúa cada 5s** — captura el momento real.

🟢 **40 pts potenciales** en kicker — incentivo upfront.

---

## 5. Antipatrones detectados

| Regla | Violación |
|---|---|
| **Mode switch system consistency** | wf-seg vs seg entre surfaces hermanas |
| **State change without warning** | Mode switch silencioso |
| **Empty state CTA** | Sin "Unirme con código" |
| **Validation visibility** | CHAMPION≠RUNNER_UP invisible |
| **Hint visibility** | DARK_HORSE coincide sin hint |
| **Missing CTA** | No deselect option |
| **Save state visibility** | saving signal no rendered |
| **Find affordance** | Sin filter/search en 96 buttons |
| **Countdown precision** | Sin sub-day cuando <24h |
| **no-emoji-icons** | ⏰ |
| **Skeleton missing** | Loading plain text |
| **Inline styles** | Múltiples |

---

## 6. Anclas para el redesign

### Core

1. **3 picks con grid de teams** (mantener visual rich)
2. **Lock banner urgente** (mantener pre/post variants)
3. **Auto-save con timestamp**
4. **Mode switch** cuando aplica

### Quitar

- Emoji ⏰ → SVG
- Inline styles → design tokens
- `/groups/new` link → modal

### Agregar

- **Filter/search de teams** ("Buscar equipo…" input)
- **Recently picked** shortcut (top de cada grid)
- **Hint visible "DARK_HORSE puede coincidir"** o validation feedback visible
- **"Deselect"** option (button "Quitar selección")
- **Spinner per pick durante sync** (usar `saving[type]` ya en code)
- **Countdown D/H/M/S** en lock banner cuando <24h
- **Summary "Mis selecciones actuales"** en una sola línea (sticky top o footer)
- **Mode switch warning** al cambiar
- **Skeleton loading**
- **"Unirme con código"** en empty state
- **Suggested picks** ("Top 5 más elegidos por la polla") opcional
- **App-team-flag size=32** tap-friendlier
- **Modal openCreate()** en lugar de `/groups/new`

### Bug fix

- Verify aria-hidden en ⏰
- Verify validation feedback visible

---

## 7. Resumen ejecutivo

**Surface bien diseñado para la importancia de los picks (40 pts).** Lo que funciona:

- 3 picks clearly separated con header + current + grid
- Lock banner re-evalúa cada 5s
- Auto-save con timestamp visible
- 40 pts potenciales upfront en kicker
- Mode switch a11y wired
- Empty state per pick ("Aún no elegiste")

Los problemas:

1. 🟠 **Find affordance**: 96 team buttons (3 grids × 32+ teams) sin filter/search. Para Mundial 2026 con 48 países, encontrar uno específico requiere scan visual completo.

2. 🟠 **Validation feedback invisible**: CHAMPION≠RUNNER_UP enforced en código pero el user no sabe (no hay warning visible). DARK_HORSE puede coincidir pero sin hint.

3. 🟠 **No deselect option**: user puede cambiar de equipo pero no volver a "Aún no elegiste".

### 3 decisiones de diseño que cambian todo

1. **Filter/search de teams**: input "Buscar equipo…" arriba de cada grid (o sticky top compartido). Reduce el scan visual de 32+ buttons a 5-10 visible.

2. **Validation visible**:
   - CHAMPION≠RUNNER_UP: cuando user intenta seleccionar el mismo equipo en RUNNER_UP que está en CHAMPION, mostrar feedback inline ("Ya elegiste este como campeón. Cambia el campeón primero.")
   - DARK_HORSE: hint visible "💡 La revelación puede coincidir con campeón/subcampeón"

3. **Spinner per pick + summary sticky**:
   - Usar `saving[type]` signal ya en código para mostrar spinner per pick durante sync
   - Summary "Mis selecciones: Campeón MEX · Sub ARG · Revelación —" sticky top o footer (always visible scroll)

### Cambios secundarios

- "Deselect" option (button "Quitar selección")
- Countdown D/H/M/S en lock banner cuando <24h
- Recently picked shortcut top de cada grid
- Suggested picks ("Top 5 más elegidos por la polla")
- Skeleton loading
- "Unirme con código" en empty state
- Modal openCreate() en lugar de `/groups/new`
- App-team-flag size=32 tap-friendlier
- SVG icon en lugar de ⏰
- Inline styles → design tokens
- Mode switch warning al cambiar
- "Última edición" con context del pick (qué cambió)

**Nota retrospectiva**: el surface es rich y funcional. Los 3 problemas críticos son **visibility issues** — el código tiene la lógica (validation, save state, lock) pero no la comunica visualmente. Polish layer puro, sin refactor de modelo.
