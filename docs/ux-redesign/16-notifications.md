# Análisis UX: `/notificaciones` — NotificationsListComponent

> Surface #16 del walkthrough. Inbox de notificaciones del user.
> Post Fase B6: click navega + marca como leída en paralelo (no bloquea).
> **5 kinds actuales** (todos comodín-related). Diseño preparado para crecer (MATCH_LIVE, RANK_CHANGED).

---

## 1. Identidad

- **Propósito**: ver eventos personales (sistema). Hoy: solo comodín-related (obtained / assigned / activated / expired / reminder).
- **Audiencia**: cualquier user post-login con actividad.
- **Frecuencia**: media-baja. Pico cuando se obtienen comodines, post-sweep o cuando hay recordatorio.
- **Entry points**: sidebar bell icon (`.lsb__bell`), profile "Notificaciones" item, badge counts en home + profile + sidebar, deep-link.

---

## 2. Estructura — mapa general

```
┌──────────────────────────────────────────────────────────┐
│ [page-header]                                            │
│  ├── kicker "Sistema · comodines y eventos"              │
│  ├── h1 "Notificaciones"                                 │
│  └── btn "Marcar todas como leídas" (si unread > 0)      │
│                                                          │
│ [container-app]                                          │
│  ├── loading: "Cargando…"                                │
│  ├── empty state: "Sin notificaciones"                   │
│  └── [notif-list]                                        │
│      └── [notif-card] × N (sort desc por createdAt)      │
│          ├── .is-unread variant (border-left verde)      │
│          ├── badge (5 variants color):                   │
│          │   ├── Nuevo (verde 0.18)                      │
│          │   ├── Asignado (azul 0.18)                    │
│          │   ├── Activado (amarillo 0.20)                │
│          │   ├── Caducado (rojo 0.10)                    │
│          │   └── Recordatorio (gris 0.20)                │
│          ├── title (bold)                                │
│          ├── date (formatDate es-EC)                     │
│          └── body                                        │
│                                                          │
│  Click handler:                                          │
│  ├── Mark as read (optimistic update + fire-forget API)  │
│  └── Navigate to /mis-comodines#card-{comodinId}         │
│      (o /mis-comodines fallback si comodinId null)       │
└──────────────────────────────────────────────────────────┘
```

**Sin tabs internos.** Lista flat sort por createdAt desc.

---

## 3. Componentes desglosados

### 3.1 Page header

**Render**:
```
Sistema · comodines y eventos
Notificaciones                    [Marcar todas como leídas]
```

**Análisis**:
- ✓ h1 claro.
- ⚠ Kicker "Sistema · comodines y eventos" es **descriptivo del scope actual** — pero **outdated cuando se agreguen MATCH_LIVE / RANK_CHANGED kinds**. Necesitará revisarse.
- ✓ "Marcar todas como leídas" solo aparece si hay unread.
- ✓ "Marcando…" feedback durante operación.
- 🟡 Sin contador "N sin leer · M total" — el user no sabe cuántas hay.

### 3.2 Empty state

**Render**:
```
Sin notificaciones
Cuando obtengas, asignes o uses un comodín, los avisos aparecerán acá.
```

**Análisis**:
- ⚠ **Outdated**: el copy menciona solo comodines. Cuando se agreguen kinds nuevos (MATCH_LIVE / RANK_CHANGED), seguirá diciendo "obtengas comodín" en empty state — confuso.
- 🟡 Sin imagen/illustration.
- 🟡 Sin CTA (vs "Hacé picks para que pase algo →").

### 3.3 Notif card

**Render**:
```
┌──────────────────────────────────────────────────────┐
│ [Nuevo]  Comodín obtenido por trivia · 12 jun 18:30  │
│                                                      │
│ Acertaste 20 trivias seguidas. Ganaste un comodín    │
│ tipo MULTIPLIER_X2. Configuralo antes del 15 jun.    │
└──────────────────────────────────────────────────────┘
```

**Datos por card**:
- kind → badge (label + color via KIND_BADGE map)
- title (bold)
- createdAt → formatDate
- body (descripción)
- readAt → `.is-unread` if null

**Análisis**:
- ✓ Card design claro con badge + title + body.
- ✓ `.is-unread` con border-left verde + bg `wf-green-soft` — distinción visual fuerte.
- ✓ Hover effect (border-color verde).
- 🔴 **`<li (click)>` semánticamente no interactive** — anti-pattern web-guidelines (bucket 4 review ya lo marcó). Debería ser `<a routerLink>` o `<button>` con `role="link"`.
- 🟠 **Badge colors inline `[style.background]`** desde KIND_BADGE map con valores rgba hardcoded — no design tokens. Hard to theme (dark mode, contrast adjustments).
- 🟠 **Badge solo color** — no incluye icon o symbol semántico. Color-only differentiation (Web Guidelines: "color-not-only" — color shouldn't be the only differentiator).
- 🟠 **5 kinds todos comodín-related** — no hay variedad. Cuando notif kind = REMINDER_24H, ¿el reminder es de qué? ¿de un comodín que va a expirar? ¿del kickoff de un partido? Sin context en el badge.
- 🟡 **Title + body** sin formato rich (no markdown, no team flag, no avatar de quien hizo algo).
- 🟡 **Sin "actions"** per notif (snooze, delete, share) — solo click navigates.
- 🟡 Date format "12 jun 18:30" — sin diferenciación "Hoy 18:30" / "Ayer 18:30" / "12 jun" para fechas viejas.
- 🟡 Body sin truncate (asumido) — notif muy larga ocupa espacio.

### 3.4 Click handler (post Fase B6)

**Behavior**:
1. Marca como leída (optimistic update local + fire-and-forget API)
2. Navega a `resolveTarget(n)`:
   - Comodín kinds → `/mis-comodines#card-{comodinId}` o `/mis-comodines`
   - default → null (no nav, solo mark read)

**Análisis**:
- ✓ **Optimistic update**: el badge desaparece inmediatamente sin esperar API.
- ✓ Fire-and-forget de markRead — no bloquea navegación.
- ✓ Resolver por kind (post B6).
- 🟠 **Fragment `#card-{comodinId}`** depende de que /mis-comodines tenga `id="card-{id}"` en cada card. **El código de comodines-list confirma**: `[id]="c.status === 'PENDING_TYPE_CHOICE' ? 'card-pending-' + c.id : null"`. Hay un mismatch — el id es `card-pending-{id}`, no `card-{id}`. **El fragment del notif resolver no matchea**. Bug latente.
- 🟠 Si user clickea una notif EXPIRED de un comodín que ya no tiene card visible (expired filter), el fragment falla silenciosamente.
- 🟡 Sin feedback visual si nav falla.

### 3.5 markAllRead

**Behavior**:
- Filtra `unread`
- Promise.all de markNotificationRead
- Actualiza local state con nowIso

**Análisis**:
- ✓ Bulk operation OK.
- 🟡 Sin confirmación si hay muchas (>10) — pero markAllRead generalmente no es destructiva.

---

## 4. Limitaciones de la implementación actual

### 4.1 Solo 5 kinds (todos comodín-related)

Comment en código (línea 160-163):
> "Cuando agreguemos MATCH_LIVE / RANK_CHANGED, este resolver crece."

Bucket 4 review marcó: "Notif kinds limitadas a comodines. Falta: nuevo partido en vivo, gol, ranking subió/bajó, comentario en grupo, nuevo miembro."

**Otras promesas de notif incumplidas por la app**:
- `/groups/:id/invite` dice "Te avisamos cuando alguien se una" → necesita kind JOIN
- Doc 09 (group-detail) "Recent activity" features requieren kinds GROUP_PICK, MEMBER_JOIN, etc.
- Doc 04 (group-stage) eventually post-result notifications

### 4.2 Sin filter / sort

- Sin filter por kind (Solo comodines / Solo reminders / etc.)
- Sin sort options (default desc por fecha, único)
- Sin paginación visible (hardcoded limit 100 en `listMyNotifications(userId, 100)`)

### 4.3 Sin "delete" / archive

- Solo mark read — no hay forma de eliminar notif del inbox.
- Una notif old EXPIRED queda en la lista indefinidamente.

### 4.4 Sin grouping

- Sin "Hoy" / "Ayer" / "Esta semana" / "Más viejas" sections.
- Sin "Ya leídas" colapsable (separar leídas de no leídas).

### 4.5 Sin push notifications

- Esta surface es solo el inbox.
- No hay implementación de service worker / web push para notificaciones cuando la app está cerrada.

---

## 5. Cross-cutting · hallazgos UX (priorizados)

🔴 **`<li (click)>` anti-pattern** — semánticamente no interactivo.

🔴 **Fragment mismatch**: notif resolver usa `#card-{id}` pero comodines-list usa `id="card-pending-{id}"`. Bug latente.

🟠 **Empty state outdated** — copy solo menciona comodines.

🟠 **Kicker outdated** "Sistema · comodines y eventos" cuando solo comodines.

🟠 **Badge color-only differentiation** (Web Guidelines violation).

🟠 **5 kinds limitados** — gaps de notif kinds para promesas incumplidas (JOIN, MATCH_LIVE, RANK_CHANGED).

🟠 **Sin filter por kind**.

🟠 **Sin sort options**.

🟠 **Sin grouping por fecha**.

🟠 **Sin paginación visible** — limit 100 hardcoded.

🟠 **Sin "delete" / archive**.

🟠 **Sin push notifications** (service worker).

🟠 **Sin contador unread visible** ("N sin leer · M total").

🟠 **Badge inline styles `[style.background]`** sin design tokens.

🟡 **Date format sin diferenciar "Hoy"** / "Ayer" / etc.

🟡 **Sin actions per notif** (snooze, share, delete).

🟡 **Empty state sin CTA**.

🟡 **Body sin truncate** asumido.

🟡 **Title + body texto plano** — sin rich format (markdown, avatar, flag).

🟢 **Sin feedback si nav falla**.

---

## 6. Antipatrones detectados

| Regla | Violación |
|---|---|
| **`<li (click)>` anti-pattern** | Cada notif card |
| **Latent bug** | Fragment mismatch |
| **Stale copy** | Empty state + kicker comodines-only |
| **Color-not-only** | Badge sin icon/symbol |
| **Missing features** | Filter, sort, delete, push |
| **Inline styles** | badge background |
| **Hardcoded limit** | 100 sin paginación visible |
| **Promise breakage** | JOIN/MATCH_LIVE/RANK_CHANGED missing |
| **No grouping** | Fechas sin sections |
| **No archive** | Notif old quedan indefinidamente |

---

## 7. Anclas para el redesign

### Core

1. **Lista flat por fecha desc**
2. **Mark as read on click** (optimistic)
3. **Deeplink navigation** post B6
4. **Mark all as read** bulk action
5. **Badge per kind**

### Quitar

- `<li (click)>` → `<a routerLink>` o `<button>`
- Badge color-only → icon + color
- Inline styles → design tokens

### Agregar

- **Filter por kind** (toggle pills: Todos / Comodines / Reminders / etc.)
- **Sort options** (newest first, unread first)
- **Grouping por fecha** (Hoy / Ayer / Esta semana / Más viejas)
- **Delete / archive** swipe action o button per notif
- **Actions per notif** (snooze, share)
- **Paginación** o infinite scroll (>100 notifs)
- **Contador unread visible** ("N sin leer · M total")
- **Push notifications** (service worker)
- **Date format diferenciado** ("Hoy 18:30", "Ayer", "12 jun")
- **Rich format en body** (markdown, team flag, avatar de actor)
- **Empty state con CTA** ("Hacé tus picks →" o similar)
- **Empty state copy general** (no solo comodines)
- **Kicker general** o quitar
- **Backend kinds nuevos**:
  - JOIN (member joined group)
  - MATCH_LIVE (a match the user has pick in is starting)
  - RANK_CHANGED (rank shift in any of user's groups)
  - GROUP_ACTIVITY (consolidated "X new picks in Group Y")

### Bug fix

- Fragment ID mismatch (`#card-{id}` vs `card-pending-{id}`)
- `<li (click)>` → `<a>` o `<button>`

---

## 8. Resumen ejecutivo

**Surface más simple del walkthrough pero con gaps importantes**:

1. 🔴 **Anti-pattern + bug latente combinados**:
   - `<li (click)>` no es interactivo semánticamente (anti-pattern Web Guidelines).
   - Fragment `#card-{comodinId}` no matchea el id real de las comodines cards (`card-pending-{id}`) → deep link silently fails.

2. 🟠 **Modelo de kinds limitado a comodines**. Promesas en otras surfaces (`Te avisamos cuando alguien se una` en invite) no se cumplen porque faltan kinds. Notif limitada para una app que necesita engagement.

3. 🟠 **Missing features básicos**: filter, sort, grouping, delete, push. La pantalla actual es funcional pero "inbox simple" para una app que aspira a engagement social.

### 3 decisiones de diseño que cambian todo

1. **Bug fix + a11y**:
   - `<li (click)>` → `<a routerLink>` (semantically correct + cmd+click support + middle-click)
   - Fragment ID match: cambiar el id en comodines-list a `card-{id}` independiente del status, o el resolver del notif a usar `card-pending-{id}` cuando aplique

2. **Notif kinds expansion**:
   - Backend: agregar kinds JOIN, MATCH_LIVE, RANK_CHANGED, GROUP_ACTIVITY
   - Frontend: resolver para cada kind con deeplink al recurso (group, match, ranking)
   - Empty state copy generalizado
   - Cumple promesas existentes en otras surfaces

3. **Polish moderno**:
   - Filter pills (Todos / Comodines / Reminders / etc.)
   - Grouping por fecha (Hoy / Ayer / Esta semana / Más viejas)
   - Date format relativo ("Hoy 18:30", "Ayer", "12 jun")
   - Delete/archive per notif
   - Push notifications (service worker) — opcional avanzado

### Cambios secundarios

- Contador unread visible ("N sin leer · M total")
- Sort options (newest / unread first)
- Paginación / infinite scroll
- Actions per notif (snooze, share)
- Rich format en body (markdown, team flag, avatar)
- Empty state con CTA contextual
- Badge con icon + color (no color-only)
- Inline styles → design tokens
- Kicker general
- Rich content (cuando se reciben notifs con match data, mostrar el match-card mini inline)

**Nota retrospectiva**: este surface es **buen punto de inversión**. La infraestructura existe (kinds + resolver pattern + optimistic updates). Lo que falta es backend expansion + UX polish. Es una surface pequeña con alto leverage para engagement.
