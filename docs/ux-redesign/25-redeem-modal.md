# Análisis UX: Redeem Modal — RedeemModalComponent + SponsorRedeemComponent

> Surface #25 del walkthrough. Modal global de canje de códigos sponsor.
> Composite: RedeemModalComponent (shell) + SponsorRedeemComponent (form + history).
> Backend lógica: 3 flavors de éxito (comodín nuevo / alreadyOwned / legacy points).
> Disparado desde sidebar + comodines empty state + post-trivia sponsored.

---

## 1. Identidad

- **Propósito**: permitir al user canjear un código de sponsor para ganar comodín o puntos extra.
- **Audiencia**: users con código sponsor (físico, QR, link, post-trivia, ad).
- **Frecuencia**: media. Power feature del modelo de monetización.
- **Entry points**: probable múltiples (sidebar, comodines empty state, trivia post-sponsor).

---

## 2. Estructura

```
RedeemModalComponent (shell)
   ├─ Modal container (picks-modal A11y)
   ├─ Header: "Canjear código" + meta
   └─ Body: <app-sponsor-redeem />
       │
       └─ SponsorRedeemComponent
           ├─ Section gradient amarillo (sponsor card)
           ├─ Head: kicker "Sponsors" + h2 + lead
           ├─ Form: input + button
           ├─ Banner result (ok/err)
           ├─ History h3
           └─ History list (last redemptions)
```

**Composite pattern**: modal shell + inner component reutilizable. **`SponsorRedeemComponent` también se usa standalone** (línea de import en otros surfaces, probable comodines empty state).

---

## 3. Componentes desglosados

### 3.1 Modal shell (RedeemModalComponent)

**Render**:
```
Canjear código                                  [✕]
Código de sponsor: comodín o puntos extra
[─────────────────────────────────────────────────]
                  <app-sponsor-redeem />
```

**A11y**:
- ✓ `role="dialog"`, `aria-modal="true"`, `aria-labelledby="redeem-modal-title"`
- ✓ `cdkTrapFocus + autoCapture` (P0)
- ✓ Escape close
- ✓ Backdrop click close

**Análisis**:
- ✓ A11y completo.
- 🟠 **`✕` close button** anti-pattern (consistente con otros modales).
- 🟠 **Header title "Canjear código"** + body con SponsorRedeemComponent que tiene **OTRO heading h2 "Canjear código"** → **título duplicado**.
- 🟠 **Meta line "Código de sponsor: comodín o puntos extra"** — útil pero redundante con el lead text del inner component.

### 3.2 Sponsor card visual (gradient amarillo)

**Render** (CSS):
```css
background: linear-gradient(135deg, #fff8d6, #fff3a0);
border: 1px solid rgba(212, 165, 0, 0.4);
border-radius: 12px;
padding: var(--space-lg);
```

**Análisis**:
- ✓ **Distinción visual fuerte** — sponsor section parece "premium" / "ad".
- ✓ Cohere con la convención de PUBLICIDAD del trivia-popup.
- 🟠 **Color hardcoded** (`#fff8d6`, `#fff3a0`, `#7a5d00`, `#3a2c00`) en lugar de tokens. **Si el design system cambia, esto NO sigue**.
- 🟠 **Sponsor-styling siempre amarillo** — no varía por sponsor. ¿Y si el sponsor tiene brand verde/rojo? Conflict.

### 3.3 Header (inner h2)

**Render**:
```
SPONSORS

Canjear código

Tienes un código de un sponsor? Ingrésalo para sumar
puntos extra. Cada código se puede canjear una sola vez
por usuario.
```

**Análisis**:
- ✓ Kicker "Sponsors" da contexto.
- ✓ Lead text explica reglas.
- 🟠 **"Tienes un código...?"** — `<p>` con interrogación al final sin signo de pregunta inicial (`¿`). Convención español roto.
- 🔴 **Doble título "Canjear código"**: shell header + inner h2 = redundante.
- 🟠 **Lead solo menciona "puntos extra"** pero el código puede ser un comodín. **Wording lead engaña** sobre los rewards posibles.
- 🟠 **"Cada código se puede canjear una sola vez por usuario"** — info útil pero podría ser inline next to button como hint.

### 3.4 Form

**Render**:
```
[PEPSI100________________]  [Canjear]
```

**Datos**:
- type=text
- maxlength=40
- placeholder="Ej. PEPSI100"
- autocomplete=off
- text-transform: uppercase (CSS)
- letter-spacing: 0.04em
- font-weight: 600
- disabled durante busy

**Análisis**:
- ✓ Grid 1fr auto = input + button alineados horizontal.
- ✓ Uppercase auto vía CSS (visual).
- ✓ Placeholder con ejemplo.
- ✓ Button disabled si `busy() || !code.trim()`.
- ✓ Loading state "Canjeando…".
- 🔴 **CSS uppercase ≠ value uppercase**: el CSS `text-transform: uppercase` SOLO afecta la visualización. El value real del input se queda como tipeado. **La transformación a uppercase la hace `redeem()` line 337** (`.toUpperCase()`). OK pero si el user ve "PEPSI100" y el backend recibe "pepsi100" (en algún edge case sin el toUpperCase), confusión.
- 🟠 **Sin live validation** del formato esperado (longitud, alfanum, etc.).
- 🟠 **Sin paste-detection** para limpieza (espacios, dashes).
- 🟠 **Sin focus auto** al abrir modal.
- 🟠 **Sin scan QR** option — patron de redemption mobile estándar.
- 🟠 **Sin character counter** "8/40".

### 3.5 Banner result

**Render** (ok):
```
[✓]  ¡Ganaste un comodín tipo "Multiplicador x2"!
     Está en tu cartera, listo para asignar.
```

**Render** (err):
```
[!]  Este código ya expiró.
```

**Análisis**:
- ✓ Visual fuerte: círculo color + icon + texto.
- ✓ 2 estados: ok (verde) + err (rojo).
- ✓ Wording amigable.
- ✓ Persiste post-canje (no auto-dismiss).
- 🟠 **`✓` / `!` unicode** en círculo — anti-pattern.
- 🟠 **`!` para err es genérico** — UX standard sería `✕` o `⚠`.
- 🟠 **Sin role="alert"** para SR.
- 🟠 **Sin auto-dismiss** ni botón "Cerrar este mensaje".
- 🟠 **Banner persiste si user limpia el input y canjea otro** — se sobrescribe pero sin transition.

### 3.6 History — h3

**Render**:
```
TUS CANJES ANTERIORES
```

**Análisis**:
- ✓ Section divider claro.
- 🟡 Empty state inline ("Aún no has canjeado ningún código") — sin ilustración.

### 3.7 History — list

**Render** (3 variantes):

#### Comodín
```
PEPSI100
🃏 Multiplicador x2
Duplica los puntos en 1 partido (grupos / R32 / R16).
Pepsi · 4 jun, 14:32
```

#### Points
```
COCA50
+50 pts
Coca-Cola · 4 jun, 14:30
```

#### Empty
```
Aún no has canjeado ningún código.
```

**Análisis**:
- ✓ **`translate="no"`** en codeText y sponsorName (brand preservation).
- ✓ Diferentes visual treatments por tipo.
- ✓ Impact text explica el comodín ("Duplica los puntos...").
- ✓ Date formatted Intl.
- ✓ Date Guayaquil TZ explícita.
- ✓ Sort descendente por redeemedAt.
- ✓ Cache local (sponsorCache, codeCache) evita N+1.
- 🟠 **🃏 emoji** en comodín entry — anti-pattern.
- 🟠 **Empty state plain text** sin ilustración / CTA.
- 🔴 **N+1 sub-issue**: por cada redemption, 2 Promise.all (sponsor + code). Si el user tiene 50 canjes, son 100 calls. El cache local ayuda DENTRO del response, pero **cada cada open del modal vuelve a cargar** (`loadHistory` se llama en ngOnInit del componente, y el componente se monta cuando se abre modal). **No persiste cache cross-open**.
- 🟠 **`loadHistory()` se llama de nuevo post-canje** (línea 378). Eso re-trigger los N+1 calls otra vez. **Performance gap en surface high-touch**.
- 🟠 **Inline styles** masivos en `<small>` tags — design system violation.

### 3.8 Error handling

**3-layer error resolution**:
1. `res.errors[0].message` → buscar key conocida en `ERROR_LABELS`
2. Si match → wording user-friendly
3. Si no match → fallback a `humanizeError`

**ERROR_LABELS conocidos**:
- SPONSOR_CODE_NOT_FOUND
- SPONSOR_CODE_NOT_ACTIVE
- SPONSOR_CODE_EXPIRED
- SPONSOR_CODE_LIMIT_REACHED
- SPONSOR_CODE_ALREADY_USED
- COMODINES_REQUIRES_COMPLETE_MODE
- COMODIN_CAP_REACHED
- COMODIN_SPONSOR_LIMIT_REACHED

**Análisis**:
- ✓ **Comprehensive error mapping** — 8 casos cubiertos con wording user-friendly.
- ✓ Fallback a humanizeError.
- ✓ "COMODINES_REQUIRES_COMPLETE_MODE" wording propone solución ("Únete a un grupo en modo completo").
- 🟠 **`console.error` en prod** (líneas 346, 384).
- 🟡 **Sin link "Ver mi cartera de comodines"** cuando hits CAP_REACHED.
- 🟡 **Sin link "Crear grupo Modo Completo"** cuando hits MODE error.

### 3.9 redeem() — 3 success flavors

**Behavior**:
1. **Comodín nuevo otorgado**: `comodinType + !alreadyOwned`
   - msg: `¡Ganaste un comodín tipo "X"! Está en tu cartera, listo para asignar.`
   - toast: `Comodín X acreditado`
2. **alreadyOwned**: code consumido sin comodín extra
   - msg: backend message (no override)
   - toast: `Código canjeado (sin comodín extra)`
3. **Legacy points**: comodinType=null, points>0
   - msg: `+{points} puntos sumados`
   - toast: `+{points} puntos`

**Análisis**:
- ✓ **3 flavors well-mapped** con messaging específico.
- ✓ Toast + banner doble feedback.
- ✓ Reset code input post-success.
- ✓ loadHistory refresh para mostrar el nuevo.
- 🟠 **Caso alreadyOwned ambiguo** — user canjeó OK pero no recibió nada nuevo. Toast "(sin comodín extra)" + banner backend message = confuso.
- 🟠 **Sin animation hero** (confetti, sparkle) para canje exitoso de comodín nuevo.
- 🟠 **Sin link "Ver mis comodines"** post-canje exitoso.

---

## 4. Cross-cutting · hallazgos UX (priorizados)

🔴 **Doble título "Canjear código"** (shell + inner h2).

🔴 **N+1 calls** en loadHistory + re-load post-canje.

🔴 **Lead wording engañoso** ("puntos extra" sin mencionar comodín).

🟠 **`✕` + `🃏` + `✓` + `!` unicode** anti-patterns.

🟠 **Sponsor card siempre amarilla** — no varía por brand.

🟠 **Colores hardcoded** en CSS (no tokens).

🟠 **"Tienes...?" sin `¿`** español roto.

🟠 **Sin focus auto** al abrir.

🟠 **Sin scan QR option**.

🟠 **Sin live validation format**.

🟠 **Sin character counter** input.

🟠 **Sin role="alert"** en banner.

🟠 **Sin auto-dismiss / botón Cerrar** banner.

🟠 **`console.error` en prod**.

🟠 **Caso alreadyOwned confuso**.

🟠 **Sin link "Ver cartera"** post-CAP error o post-success.

🟠 **Sin animation hero** post-comodín-acreditado.

🟠 **Empty state history sin ilustración / CTA**.

🟠 **Inline styles** masivos en `<small>` tags.

🟠 **CSS uppercase ≠ value uppercase** confusión potencial.

🟡 **Sin paste-detection cleanup**.

🟡 **Sin link "Crear grupo Completo"** cuando MODE error.

🟢 **A11y core** completo.

🟢 **Error mapping comprehensive** (8 casos).

🟢 **`translate="no"`** en brand text.

🟢 **TZ explícita** en formatDate.

🟢 **Cache local** dentro de response.

🟢 **3 flavors handling** bien estructurado.

🟢 **Disabled state** correcto.

🟢 **Loading state** "Canjeando…".

🟢 **Backdrop click close**.

🟢 **Sort desc por redeemedAt**.

---

## 5. Antipatrones detectados

| Regla | Violación |
|---|---|
| **no-emoji-icons** | ✕ 🃏 ✓ ! |
| **Heading duplication** | "Canjear código" × 2 |
| **N+1 queries** | sponsor + code lookup per redemption |
| **Cache no persiste cross-open** | loadHistory re-fetch siempre |
| **Color hardcoded** | #fff8d6 #fff3a0 #7a5d00 #3a2c00 |
| **CSS-only transform** | uppercase visual ≠ value |
| **No paste sanitization** | Espacios / dashes posibles |
| **Inline styles** | `<small style="...">` masivo |
| **Spanish punctuation** | "Tienes...?" sin ¿ |
| **console.error en prod** | Telemetry gap |
| **Sin scan QR** | Mobile UX standard |
| **Sin focus auto modal** | UX standard violado |
| **Sin role="alert"** | Banner sin SR notification |

---

## 6. Anclas para el redesign

### Core

1. **Composite shell + inner** SponsorRedeemComponent reutilizable
2. **Sponsor visual treatment** (gradient amarillo)
3. **3 flavors success** (comodín nuevo / alreadyOwned / points legacy)
4. **Error mapping comprehensive** 8 casos
5. **History list** con tipo + impact + sponsor + date
6. **Backdrop modal** + A11y

### Quitar

- Emojis ✕ 🃏 ✓ ! → SVG icons
- Doble título "Canjear código"
- Colores hardcoded → tokens
- Inline styles `<small>`
- `console.error` → telemetry

### Agregar

- 🔴 **Cache persistente cross-open** del history (signal en service global vs reload on modal open)
- 🔴 **Sponsor name + comodínType resolution batched** en server (un endpoint que retorne RedemptionRow completo, no requiere N+1 cliente)
- **role="alert"** en banner result
- **Focus auto** primer input al open
- **QR scan option** (camera API)
- **Live validation** format (regex permite alfanum + dash)
- **Character counter** "8/40"
- **Auto-dismiss** banner 5s + botón "X"
- **Animation hero** confetti / sparkle para comodín nuevo
- **Link "Ver mi cartera"** post-success comodín
- **Link "Mis comodines"** cuando CAP_REACHED error
- **Link "Crear grupo Completo"** cuando MODE error
- **Paste sanitization** (strip spaces/dashes)
- **Spanish puntuation** "¿Tienes...?" correcto
- **Lead wording**: mencionar comodines explícitamente
- **Empty state history**: ilustración + CTA "Cómo conseguir códigos"
- **Sponsor brand color**: variar gradient por sponsor (backend retorna brand color)
- **CSS uppercase coupled con value**: `[(ngModel)]="code | uppercase"` o input handler que actualiza valor

### Considerar

- **Códigos via QR en post-trivia** (link directo a /redeem?code=X)
- **Códigos por geolocation** (sponsors en stadiums)
- **Stack comodines reward** (códigos "premium" otorgan múltiples)
- **Affiliate tracking** (sharing codes con referrer)

---

## 7. Resumen ejecutivo

**Surface técnicamente robusto** — 3 flavors well-mapped, error mapping comprehensive, A11y completo, cache local, sort desc. Lo que falla:

1. 🔴 **N+1 calls + re-fetch on every open**: si user abre el modal frecuentemente o tiene 30+ canjes, performance hit notable. **Fix**: cache en service global + invalidación post-canje.

2. 🔴 **Doble título**: shell + inner ambos dicen "Canjear código". UX redundante.

3. 🔴 **Lead wording engañoso** — menciona "puntos extra" pero los códigos modernos otorgan comodines (más valor). User puede ignorar el modal pensando que es solo points.

4. 🟠 **Sponsor card visual no varía por brand** — gradient amarillo + colors hardcoded. Si Coca-Cola es rojo, conflict.

### 3 decisiones de diseño que cambian todo

1. **Backend retorna RedemptionRow completo**: en lugar de N+1 (raw + sponsor lookup + code lookup), un endpoint `myRedemptions()` que retorne todo en 1 call. Performance fix radical.

2. **Lead wording reescribir**: mencionar comodines + puntos como rewards. "Tienes un código? Canjéalo por puntos extra o por un comodín."

3. **Sponsor brand colors dinámicos**: backend retorna `brandColor` (hex) por sponsor. CSS variable que define gradient. Custom brand per redemption row.

### Cambios secundarios

- SVG icon system reemplazando ✕ 🃏 ✓ !
- Focus auto + QR scan + live validation + char counter
- role="alert" banner + auto-dismiss
- Animation hero comodín nuevo (confetti)
- Links contextuales post-error (cartera / grupo completo)
- Empty state history con ilustración
- Paste sanitization
- Spanish puntuation "¿..."
- Eliminar doble título
- Inline styles → tokens
- console.error → telemetry
- Tokens en lugar de colores hardcoded
- Caso alreadyOwned: messaging más claro

### Considerar features

- Códigos QR + camera
- Geolocation sponsor codes
- Affiliate sharing
- Stack comodines reward

**Nota retrospectiva**: este surface es **el corazón del modelo de monetización** (sponsors → comodines → engagement → retention). El N+1 + re-fetch on open son los gaps más críticos para escalar — si el game funciona y los users canjean 10-50 códigos en el torneo, este modal podrá ser slow.
