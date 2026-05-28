# Análisis UX: `/groups` — GroupsListComponent

> Surface #8 del walkthrough. Hub de grupos del user (admin + miembro).
> Surface simple en estructura pero alta frecuencia + decisiones de producto pendientes.

---

## 1. Identidad

- **Propósito**: ver la lista de grupos privados a los que el user pertenece. Atajo a cada uno (`/groups/:id`) + acciones para crear/unirse.
- **Audiencia**: cualquier user post-login. Especialmente relevante para users multi-grupo (oficina + familia + amigos).
- **Frecuencia**: media-alta. Es el hub social de la app.
- **Entry points**: sidebar "Grupos", home "Mis grupos · Ver todos →", post-create redirect (toast + navigate), post-join redirect, deep-link.

---

## 2. Estructura — mapa general

Esta es una de las **surfaces más simples estructuralmente** — sin tabs, sin secciones múltiples, sin estados condicionales más allá del empty.

```
┌──────────────────────────────────────────────────────────┐
│ [page__header]                                            │
│  ├── kicker "{countLabel} · MUNDIAL 2026"                 │
│  │   (ej: "3 GRUPOS · MUNDIAL 2026")                      │
│  └── h1 "Mis grupos"                                      │
│                                                           │
│ [groups-list-actions]  · MOBILE ONLY                      │
│  ├── btn "+ Crear grupo"  → modal openCreate()            │
│  └── btn "→ Unirme con código" → modal openJoin()         │
│  ↑ En desktop ocultos (≥992px). El sidebar global         │
│     tiene los mismos botones bajo "Mis grupos".           │
│                                                           │
│ [Estado del cuerpo · 3 mutuamente excluyentes]            │
│  ├── loading: "Cargando…" (plain text)                    │
│  ├── empty: "Aún no estás en ningún grupo"                │
│  │   + "Usa los botones de arriba…"                       │
│  └── filled: [groups-list]                                │
│        └── [group-card] × N                               │
│            ├── icon (image custom o initial admin/member) │
│            ├── body                                       │
│            │   ├── name-row: name + mode pill             │
│            │   └── meta: members + role + created date    │
│            └── pos: #N rank + "de M"                      │
└──────────────────────────────────────────────────────────┘
```

**No tiene tabs internos.** Sort default: alfabético por nombre (sin toggle visible).

---

## 3. Componentes page-level

### 3.1 Page header

**Render**:
```
3 GRUPOS · MUNDIAL 2026
Mis grupos
```

**Datos**:
- Kicker: `countLabel()` (computa el total de grupos del user) + brand "MUNDIAL 2026"
- h1 constante

**Análisis**:
- ✓ **Diferente del header de /picks** (no incluye 4 stats — ya no duplica home). Más limpio.
- ✓ Count en kicker es feedback rápido del cuántos.
- 🟡 Kicker "GRUPOS" repetido en h1 "Mis grupos" — leve redundancia textual.
- 🟡 Sin contextual info ("3 grupos · 1 admin · 2 miembro") — sería útil.

### 3.2 Actions row (mobile)

**Render**:
```
[ + Crear grupo ]
[ → Unirme con código ]
```

**Análisis**:
- ✓ Acciones primarias claras.
- ✓ Botones llaman `GroupActionsService.openCreate()` / `openJoin()` — modales globales consolidados.
- 🔴 **Hidden en desktop ≥992px** porque "el sidebar tiene los mismos botones". **Problema cascading**:
  - El sidebar en design v3 (`.lsb`) **no muestra estos botones** (solo lleva a `/groups`)
  - El nav (`.app-topnav`) sí los tiene pero está `display: none` en design v3
  - **Resultado en desktop**: no hay CTAs visibles en esta página
- 🔴 **Empty state agrava**: dice "Usa los botones de arriba" pero en desktop los botones NO están arriba (están ocultos). User nuevo confundido.
- 🟡 Emojis `+` y `→` como icon prefijos (anti-pattern, aunque ya envueltos en aria-hidden en P4.D).
- 🟡 Mobile-only buttons sin keyboard alternative en desktop (excepto via sidebar — que en design v3 no las muestra).

### 3.3 Loading state

**Render**: `"Cargando…"` en texto plano centrado.

**Análisis**:
- 🟠 **Sin skeleton**. Loading time es alto (N+1 calls — ver §5).
- 🟡 Texto centrado sin animation feedback.

### 3.4 Empty state

**Render**:
```
H3 "Aún no estás en ningún grupo"
"Usa los botones de arriba para crear un grupo o unirte con un código."
```

**Análisis**:
- 🔴 **"Usa los botones de arriba"** — pero en desktop NO hay botones visibles (ver §3.2). First-time user en desktop ve empty state sin call-to-action.
- 🟠 **Sin CTAs propios del empty state** — debería tener los botones inline ("Crear grupo" + "Unirme con código") regardless del breakpoint.
- ⚠ Inline styles para el container (`<div style="padding:32px;text-align:center;background:var(--wf-paper)..."`) en lugar de usar la clase `.empty-block` del resto de la app — inconsistencia.
- 🟡 Sin imagen/illustration — empty states de la app son todos texto plano.

---

## 4. Group card · análisis detallado

### 4.1 Render

```
┌────────────────────────────────────────────────────────────┐
│ [IMG] Oficina Q1 2026     [Completo]                  #3   │
│       12 miembros · Eres admin · creado el 14 jun 2025  de 12│
└────────────────────────────────────────────────────────────┘
```

### 4.2 Sub-componentes

#### a) Icon

**Render**: 
- Si `imageUrls()[g.id]` existe → `<img>` con la signed URL
- Sino → `<span class="group-card__icon">` con `icon(g)` (probablemente initials del nombre)
- Variant `--admin` (verde) si user es admin del grupo

**Datos**: imageKey resuelto async post-load → signed URL (async).

**Análisis**:
- ✓ Custom group image cuando admin la subió — personalización.
- ✓ Variant verde para admin — distinción rápida.
- ⚠ Sin skeleton mientras `imageUrls` resuelve — el card aparece con initials primero, luego "pop" a imagen. Layout shift suave.
- 🟡 `icon(g)` para non-image — probablemente initials. Sin verificar lógica.

#### b) Body · name-row

**Render**:
```
Oficina Q1 2026         [Completo]
```

**Datos**:
- name (string)
- mode pill: "Completo" verde / "Simple" warn

**Análisis**:
- ✓ Mode pill **claramente diferenciado** — el user sabe qué grupos cuentan para ranking.
- ✓ flex-wrap para nombres largos.
- 🟠 **Sin truncate para nombres muy largos** — el pill puede empujarse a segunda línea (gracias a flex-wrap) pero rompe alignment con el rank pill.
- 🟡 Tipografía Bebas para nombre + pill chico al lado — diferencia de tamaños buena.

#### c) Body · meta

**Render**:
```
12 miembros · Eres admin · creado el 14 jun 2025
```

**Datos**:
- `g.members` count + pluralization
- `g.isAdmin` → "Eres admin"
- `g.adminHandle` → "creado por @xxx" (si no soy admin)
- `g.createdAt` → formatDate

**Análisis**:
- ✓ Información útil compacta.
- ⚠ **3 datos separados por `·`** — fácil de scanear pero todos al mismo nivel jerárquico.
- 🟡 "Eres admin" en strong — buen highlight semántico.
- 🟡 "creado el 14 jun 2025" — fecha de creación rara vez es útil para el user (más para admin). Podría ser "Activo hace 2h" (last activity) para signal social.
- 🔴 **Falta**: total puntos en este grupo ("38 pts en este grupo"), recent activity ("3 picks nuevos hoy"), prize snapshot ("USD 200 + trofeo"), comodines on/off para grupos COMPLETE.

#### d) Position pill

**Render**:
```
#3
de 12
```

**Datos**:
- `g.myRank ?? '?'` — la posición del user en este grupo (null si no se cargó)
- `g.members` — total para context

**Análisis**:
- ✓ **El dato motivador**. Rank pill es lo que el user busca.
- ✓ Tipografía Bebas grande para el #N.
- ⚠ `#?` cuando myRank es null (loading state intermedio) — confuso. Mejor `—` o skeleton.
- 🟡 "de 12" en text-mute — buen contexto pero el ratio podría ser visual (progress bar?).

---

## 5. Issues de performance

### 5.1 N+1 calls problema

Documentado en bucket 3 review:

> "N+1 en ngOnInit: por cada grupo dispara `getGroup + groupMembers + groupLeaderboard + getUser(admin)`. Para alguien con 8 grupos son 32 calls antes de pintar."

**Análisis**:
- 🔴 **Perf real**: usuario con 8 grupos espera 32 calls + paralelo. Si red lenta, 5-15s sin feedback más allá de "Cargando…".
- 🟠 Loading state plain text sin progreso ni skeleton — la espera se siente larga.
- Decisión: endpoint backend agregado (`myGroupsWithStats`) o batchear.

### 5.2 imageUrls async post-load

Después del render initial sin imagen, el card actualiza a image cuando signed URL resuelve. Suave en general pero:
- 🟡 Sin placeholder skeleton — pop-in visible.

---

## 6. Comparación con home "Mis grupos"

El home tiene una mini-versión de esta lista en la sección "Mis grupos":

```
HOME                        /groups (esta surface)
─────────────────────       ─────────────────────────
.gr cards                   .group-card list
- avatar + nombre           - icon + nombre + mode pill
- members + prize           - members + role + date
- rank pill                 - rank pill #N
```

**Análisis**:
- ⚠ **2 implementaciones** de "lista de grupos" — home y /groups. Cada una con datos ligeramente distintos:
  - Home: members + **prize** + rank
  - /groups: members + **role** + **date created** + mode pill + rank
- Home tiene prize info (útil), /groups no.
- /groups tiene mode pill (crítico), home no.
- 🟠 Decisión: unificar — ambas mostrar `prize + mode + role + members + rank`.

---

## 7. Cross-cutting · hallazgos UX (priorizados)

🔴 **Empty state en desktop sin CTAs visibles** (botones mobile-only + sidebar v3 no los tiene). First-time user perdido.

🔴 **N+1 calls** (32 calls para 8 grupos) sin progress / skeleton.

🟠 **Loading sin skeleton** — solo plain text "Cargando…".

🟠 **Empty state inline styles** sin usar `.empty-block` consistente.

🟠 **Sin sort options** (alfabético default). User con 4+ grupos querría ordenar por último activo, por rank, por members.

🟠 **Falta info útil en card**: total pts en este grupo, recent activity, prize snapshot, comodines on/off.

🟠 **Inconsistencia con home "Mis grupos"** — ambas listan grupos con datos distintos.

🟠 **#? cuando myRank null** durante loading — confuso.

🟡 **Kicker "X GRUPOS · MUNDIAL 2026"** + h1 "Mis grupos" — leve redundancia.

🟡 **"creado el 14 jun 2025"** — fecha de creación rara vez útil; "Activo hace 2h" sería más relevante.

🟡 **Sin truncate en name + mode pill** — wrap a 2 líneas en grupos con nombres largos rompe alignment.

🟡 **Sin imagen/illustration** en empty state — feel utilitario.

🟡 **Emojis `+ →`** en CTA labels (anti-pattern, ya con aria-hidden).

🟡 **Sin filtro por mode** (Solo Simple / Solo Completo) cuando user tiene ambos.

🟡 **Sin search** — útil para users con 10+ grupos.

🟢 **Hover effect en card** — buena affordance.

🟢 **flex-wrap en name-row** — anticipa nombres largos pero rompe rank alignment.

🟢 **Variant `--admin` verde** — útil distinción.

---

## 8. Antipatrones detectados

| Regla | Violación |
|---|---|
| **Empty state CTA** (Forms & Feedback) | Empty dice "Usa los botones de arriba" pero en desktop no hay |
| **Loading skeleton** (Performance) | Plain text "Cargando…" mientras 32 calls |
| **Consistent empty states** | Inline styles vs `.empty-block` |
| **Mobile-desktop parity** | Actions mobile-only sin equivalente visible en design v3 |
| **CTA in empty state** (Forms & Feedback) | Empty state sin botones |
| **Avoid placeholder data** | "#?" cuando myRank null |
| **N+1 query antipattern** | 32 calls sin batch |

---

## 9. Anclas para el redesign

### Core

1. **Lista de grupos con rank pill** (el dato motivador)
2. **Mode pill** (Completo/Simple) — crítico para entender qué cuenta
3. **CTAs Crear + Unirme** visibles **en todos los breakpoints**
4. **Empty state con CTAs inline** (no "usa los botones de arriba")

### Contextual

- **Empty**: imagen/illustration + 2 CTAs (Crear + Unirme)
- **Cargado**: lista con datos enriquecidos
- **Search/filter** cuando N > 5 grupos

### Quitar

- "creado el {date}" como meta principal (mover a detalle)
- Empty state inline styles (usar `.empty-block`)
- Loading plain text (usar skeleton)
- "#?" placeholder (usar `—` o skeleton)

### Agregar

- **Skeleton cards** durante loading
- **CTAs en empty state inline** (no dependencia de "botones arriba")
- **CTAs visibles en desktop** (no solo mobile)
- **Total pts en este grupo** (próximo al rank)
- **Recent activity** ("3 picks nuevos hoy")
- **Prize snapshot** (consistente con home)
- **Comodines on/off badge** para grupos COMPLETE
- **Sort options** (último activo, rank, members)
- **Search input** cuando N > 5
- **Filter por mode** cuando user tiene ambos
- **last-activity time** en lugar de "creado el"
- **Endpoint backend agregado** `myGroupsWithStats` para 1 call

### Bug fix

- **CTAs visibles en desktop** (el sidebar v3 no los tiene — la promesa del comentario código es incorrecta)
- **Skeleton card** para evitar el "#?" placeholder

---

## 10. Resumen ejecutivo

**Surface simple pero con un bug de UX crítico en desktop**: el empty state dice "usa los botones de arriba" pero en design v3 esos botones NO existen en desktop (estaban en `.app-topnav` que ahora está `display: none`). First-time user en desktop ve "Aún no estás en ningún grupo" sin ningún call-to-action visible.

### 3 decisiones de diseño que cambian todo

1. **CTAs siempre visibles, sin dependencia de breakpoint o sidebar**. Empty state debe tener los 2 botones inline. La lista filled puede mantener su layout simple pero los CTAs no deben desaparecer.

2. **Card enriquecido con datos motivadores**:
   - Rank pill (ya OK)
   - **Total pts en este grupo** (nuevo)
   - **Recent activity** ("3 picks hoy", "tu amigo subió #4") — engagement
   - **Prize snapshot** (consistente con home)
   - **Comodines badge** si COMPLETE
   - Quitar fecha de creación de la card (mover a detalle)

3. **Skeleton loading + endpoint batch**:
   - Backend: endpoint `myGroupsWithStats` que devuelve los grupos con stats agregados en 1 call.
   - Frontend: skeleton cards mientras carga (no "Cargando…" plain).
   - Resultado: percibido performance >2× mejor.

### Cambios secundarios

- Search input cuando N > 5 grupos.
- Sort options (último activo, rank, members).
- Filter por mode cuando user tiene ambos.
- Empty state con illustration + 2 CTAs.
- Unificar home "Mis grupos" con esta surface (mismo card design).
- "#?" → skeleton placeholder.
- "Creado el" → "Activo hace X".
- SVG icons en lugar de emojis `+ →`.
