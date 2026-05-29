# Análisis UX: Picks Pending Banner — PicksPendingBannerComponent

> Surface #35 del walkthrough. **Banner contextual** para urgencia de picks pendientes.
> Visible si: count > 0 picks de matches cerrando en 12h Y user no dismissed hoy.
> localStorage flag `picks-banner-dismissed-on` (por día YYYY-MM-DD).
> Aparece en `/home` probable (no en /picks porque ya ahí están los picks).

---

## 1. Identidad

- **Propósito**: re-engagement urgent — alertar al user que tiene picks pendientes con deadline cercano (12h).
- **Audiencia**: users autenticados con matches próximos sin pick.
- **Frecuencia**: aparece 1× por día (después se dismiss + cooldown 24h).
- **Entry points**: render condicional en (probable) `/home` o shell.

---

## 2. Estructura — banner compacto

```
┌────────────────────────────────────────────────────────────┐
│ [3]  Picks pendientes                                   [×]│
│      Tienes 3 partidos sin pick que cierran en las         │
│      próximas 12h.                  [Hacer mis picks →]    │
└────────────────────────────────────────────────────────────┘
```

**5 elementos**: count badge + title + lead + CTA + close.

---

## 3. Componentes desglosados

### 3.1 Container

**Render**:
```html
<aside class="pending-banner" role="status">
```

**A11y**:
- ✓ `<aside>` semantic landmark.
- ✓ `role="status"` — SR notification non-intrusive.

**Análisis**:
- ✓ A11y mínimo correcto.
- 🟠 **Sin `aria-live="polite"`** — `role="status"` implica `aria-live="polite"` por default, así que OK.
- 🟠 **Sin `aria-label`** descriptivo del banner.
- 🟡 **Sin styles inline en este componente** — todos en hojas globales? El template solo tiene classes referenced.

### 3.2 Count badge

**Render**:
```
[3]
```

**Análisis**:
- ✓ Number prominent.
- 🟠 **Sin styles visibles** — depende de hojas globales `.pending-banner__icon`. Sin contexto del visual sin ver el CSS final.
- 🟠 **"icon" en class name pero es número** — semánticamente raro. Class `__count` o `__badge` sería más claro.
- 🟡 Sin animation cuando count cambia.

### 3.3 Title + lead

**Render**:
```
Picks pendientes
Tienes 3 partidos sin pick que cierran en las próximas 12h.
```

**Análisis**:
- ✓ **Plural handling correcto**: "1 partido sin pick que cierra" vs "3 partidos sin pick que cierran" (verbo también pluraliza).
- ✓ Wording urgente ("12h", "cierran").
- ✓ "Tienes" usa tú (no voseo) — **¡consistencia inusual!** Las únicas instancias previas de tú en el walkthrough.
- 🟠 **"Tienes" vs voseo restante app**: paradójicamente, este surface es **el primero del walkthrough con "tú"** mientras el resto usa voseo "Tenés / Querés / Vas a". **Inconsistencia confirmada nivel cross-app**.
- 🟠 **"12h" hardcoded** — el componente recibe count pero no comunica qué cierra primero. "Cierra en 2h el más urgente" sería más actionable.
- 🟡 Sin link a match más urgente directo.

### 3.4 CTA

**Render**:
```
[Hacer mis picks]
```

**Análisis**:
- ✓ Verb específico ("Hacer mis picks").
- ✓ Link a `/picks` (general, no a match específico).
- ✓ btn--primary + btn--sm styling.
- 🟠 **`/picks` general** vs link directo al match más urgente — pérdida de fricción avoidance.
- 🟡 Sin loading state CTA (es link, no async).

### 3.5 Close button

**Render**:
```
×
```

**Análisis**:
- ✓ `aria-label="cerrar"` (lowercase wording raro pero OK).
- ✓ Single character × Unicode multiplication sign.
- 🟠 **`×` unicode** anti-pattern (igual que ✕ en otros modales).
- 🟠 **aria-label "cerrar" lowercase** — el resto de la app usa "Cerrar" (capital).

### 3.6 Dismiss behavior

**localStorage flag**:
- Key: `picks-banner-dismissed-on`
- Value: today's date YYYY-MM-DD
- Check al ngOnInit: si match today's date → already dismissed today

**Análisis**:
- ✓ **Per-day dismiss** — vuelve a aparecer al día siguiente.
- ✓ Pattern correcto (vs once-forever que sería over-dismiss).
- ✓ Persistente cross-session.
- 🟠 **`new Date().toISOString().slice(0, 10)`** — UTC date, no local. Si user es en TZ +12, el "día" cambia a UTC midnight, no local midnight. **Edge case timezone**.
- 🟠 **Sin sync cross-tab** — si user dismisses en tab A, tab B sigue mostrando.
- 🟠 **Sin sync cross-device** — mobile dismisses → desktop sigue mostrando.

### 3.7 Loading + error handling

**Behavior**:
- `await this.api.pendingMatches(TOURNAMENT_ID, 12)`
- `count.set(res.data.length)`
- Try/catch silent — "banner just stays hidden"

**Análisis**:
- ✓ Silent fail correcto (banner es enhancement, no crítico).
- 🟠 **Sin loading state**: si la API tarda 2s, el banner aparece después del paint inicial. **Layout shift** al aparecer.
- 🟠 **Sin retry**: si call falla por red transitoria, banner nunca aparece esa sesión.
- 🟠 **`pendingMatches(TOURNAMENT_ID, 12)`** — el `12` es probable horas. Magic number sin contexto.

### 3.8 Visibility computed (no signal)

**Code**:
```ts
visible = () => this.count() > 0 && !this.dismissedToday();
```

**Análisis**:
- 🟠 **`visible` es arrow function, NO computed signal**. Cada render → call. Para 2 signals reads, performance es trivial pero **pattern inconsistente** con resto de codebase.
- 🟠 Debería ser `computed(() => this.count() > 0 && !this.dismissedToday())`.

### 3.9 Authentication gate

**Code**:
```ts
if (!this.auth.user()) return;
```

**Análisis**:
- ✓ Defensive: no llama API si no auth.
- 🟠 **Pero el componente se mountea**: si no hay user, componente está vivo pero `count = 0` y `visible = false`. **No DOM render gracias al @if pero el componente existe**.
- 🟡 Mejor: provider-level gate o `*ngIf` en parent que NO monte el componente.

### 3.10 Mount location

**No visible en este file dónde se monta**. Comentario implícito: probablemente en `/home`.

**Hipótesis basadas en otros walkthroughs**:
- /home top → banner urgente
- Shell global? Probablemente no porque dismiss per-day implica que se ve UNA vez por día y no en cada pantalla.

**Si está en shell**: aparece en todas las pantallas durante el día (potential nag).
**Si está solo en /home**: el user que no va a /home no recibe el reminder.

---

## 4. Cross-cutting · hallazgos UX (priorizados)

🔴 **`× unicode close** anti-pattern.

🔴 **`/picks` general CTA** vs link directo al más urgente.

🟠 **"Tienes" tú vs voseo cross-app** — **primera instancia de tú** en walkthrough! Inconsistencia.

🟠 **UTC date para dismiss** (timezone edge case).

🟠 **Sin sync cross-tab/device** dismiss.

🟠 **Sin loading state** layout shift.

🟠 **"12h" hardcoded** sin comunicar urgencia real.

🟠 **`visible` no es computed** (pattern inconsistente).

🟠 **Magic number `12`** sin contexto.

🟠 **Componente mountea sin user** (gate parcial).

🟠 **Sin retry network**.

🟠 **Class `__icon` para count** semánticamente raro.

🟠 **aria-label "cerrar" lowercase** inconsistente.

🟡 **Sin animation count change**.

🟡 **Sin loading state CTA**.

🟢 **Plural handling correcto** (verbo también).

🟢 **A11y `role="status"`** implicit aria-live.

🟢 **localStorage per-day dismiss** pattern correcto.

🟢 **Try/catch silent** correcto enhancement.

🟢 **Auth gate defensive**.

🟢 **Wording urgente** "12h", "cierran".

🟢 **Verb específico CTA** "Hacer mis picks".

---

## 5. Antipatrones detectados

| Regla | Violación |
|---|---|
| **no-emoji-icons** | × close button |
| **Tone consistency** | Tú vs voseo cross-app |
| **Magic number** | `12` sin contexto |
| **Timezone awareness** | UTC date dismiss |
| **No cross-tab sync** | localStorage standalone |
| **CTA specificity** | /picks general vs match |
| **No loading state** | Layout shift posible |
| **Visibility pattern** | Arrow function vs computed |
| **Component mount waste** | Sin user aún se mountea |
| **Semantic naming** | __icon para number |

---

## 6. Anclas para el redesign

### Core

1. **Banner compacto** con count + title + lead + CTA + close
2. **localStorage per-day dismiss**
3. **Plural handling** correcto
4. **Auth gate defensive**
5. **role="status"** implicit aria-live
6. **Try/catch silent** enhancement
7. **Wording urgente**

### Quitar

- × unicode → SVG close icon
- "12h" hardcoded → backend-driven
- Magic number 12 → constante exportada
- Arrow function visible → computed signal

### Agregar

- 🔴 **CTA contextual al match más urgente**: si solo 1 partido pendiente, link directo `/picks/match/:id`. Si 3+, link a `/picks` con scroll-to anchor.
- 🔴 **Loading skeleton** para evitar layout shift (placeholder de altura ~60px durante fetch)
- **Tone decisión global**: tú o voseo, no ambos
- **Timezone-aware dismiss**: usar local date no UTC (`new Date().toLocaleDateString` con TZ)
- **Cross-tab sync**: BroadcastChannel API
- **Retry network** una vez en 5s
- **`computed(() => ...)`** signal estándar
- **Animation count change** (number flip)
- **Animation entrada/salida** banner (slide-down + fade)
- **aria-label `'Cerrar'`** capitalizado
- **Class names semantic** (`__count` no `__icon`)
- **Urgencia más cercana** explícita: "Tu pick más urgente cierra en 47 minutos"

### Considerar

- **Multiple banner pattern**: no solo picks pendientes — también podrían existir banners para grupos pendientes, premios, etc. Componente reutilizable
- **Push notification analog**: si user da permiso, también push notif a 1h del cierre
- **Sound on appear**: respect prefs sounds
- **Auto-dismiss N hours**: si user no interactúa, auto-hide después de X horas

---

## 7. Resumen ejecutivo

**Banner contextual minimalista** — auth gate, plural handling, localStorage per-day, A11y básico, wording urgente. Lo que falla:

1. 🔴 **CTA general `/picks` vs específico**: user con 1 partido pendiente clickea Hacer picks → llega a lista de 96 partidos. Click adicional para encontrar el urgente. **Fricción evitable**.

2. 🔴 **Inconsistencia tono**: "Tienes" usa tú, mientras resto de app usa voseo "Tenés / Querés". **Primera instancia tú documentada** del walkthrough.

3. 🟠 **UTC date dismiss + sin cross-tab sync** — edge cases timezone + multi-tab.

4. 🟠 **Sin loading state** → layout shift visible cuando API responde.

### 3 decisiones de diseño que cambian todo

1. **CTA contextual**: si count=1, link directo al match. Si count=N, link a /picks con anchor scroll al primero pendiente. Reduce fricción dramáticamente.

2. **Tone consistency**: este surface es la **prueba** de que la app tiene 2 sistemas de tone mixed. Decidir TÚ o VOSEO globally y aplicar a TODO. Empezar por este (o el sidebar) tiene cascade.

3. **Loading skeleton placeholder**: prevenir layout shift con placeholder ~60px altura durante fetch. Sin esto, banner aparece de la nada y desplaza contenido.

### Cambios secundarios

- × → SVG icon
- 12h hardcoded → backend
- computed signal vs arrow function
- Timezone-aware dismiss
- Cross-tab sync BroadcastChannel
- Retry network
- Animation entrada/salida + count change
- aria-label capital
- Class names semantic
- Magic number constante

### Considerar features

- Multiple banner pattern reutilizable
- Push notification analog
- Sound on appear (respect prefs)
- Auto-dismiss N hours

**Nota retrospectiva**: surface **compacto** (~60 líneas) con A11y básico OK. Sus mayores issues son **UX decisions** (CTA específico vs general, tone) más que technical debt. Es el surface con la única instancia documentada de "tú" — confirma la **fragmentación de tone cross-app**.
