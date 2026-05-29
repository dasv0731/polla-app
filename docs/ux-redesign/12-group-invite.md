# Análisis UX: `/groups/:id/invite` — GroupInviteEmailComponent

> Surface #12 del walkthrough. Form de invitación por email del grupo (admin-only).
> El **flujo más rico de groups family**: chips input + email preview live + send via Lambda.

---

## 1. Identidad

- **Propósito**: enviar invitaciones por email para que personas se unan al grupo. Hasta 20 emails por envío con mensaje opcional personalizado.
- **Audiencia**: solo admin del grupo. Non-admin: el link no se muestra (en `/groups/:id` el button "✉ Invitar por email" es admin-only).
- **Frecuencia**: media-baja. Onboarding de un grupo nuevo + ajustes ocasionales.
- **Entry points**: link "✉ Invitar por email" desde `group-invitar` aside en `/groups/:id`.

---

## 2. Estructura — mapa general

```
┌──────────────────────────────────────────────────────────┐
│ [page-header]                                            │
│  ├── small "← {group.name}" o "Volver al grupo"          │
│  └── h1 "Invitar por email"                              │
│                                                          │
│ [main narrow + grid gap]                                 │
│                                                          │
│ [3 estados]                                              │
│  ├── loading: "Cargando grupo…"                          │
│  ├── group-not-found: "Grupo no encontrado."             │
│  └── render (cuando g !== null):                         │
│                                                          │
│      ┌─ FORM CARD ────────────────────────────────────┐  │
│      │ h2 "¿A quiénes invitas?"                       │  │
│      │ lead "Pega los emails de tus amigos…"          │  │
│      │                                                │  │
│      │ field Emails (chips):                          │  │
│      │  ├── [chip user1@x.com ×]                      │  │
│      │  ├── [chip user2@x.com ×]                      │  │
│      │  └── input "agregar otro email…"               │  │
│      │     ├── enter / comma / space / blur → commit  │  │
│      │     ├── max 20                                 │  │
│      │     └── dedup + email validation               │  │
│      │ hint "Máx. 20 emails por invitación."          │  │
│      │                                                │  │
│      │ field Mensaje opcional (textarea, 200 max)     │  │
│      │ hint "Aparece debajo del CTA en el email."     │  │
│      │                                                │  │
│      │ btn Submit con label dinámico:                 │  │
│      │  ├── "Agrega al menos un email" (sin emails)   │  │
│      │  ├── "Grupo lleno" (memberCount >= 30)         │  │
│      │  ├── "Enviando…" (durante)                     │  │
│      │  └── "Enviar N invitaciones" (normal)          │  │
│      │                                                │  │
│      │ [groupIsFull hint] (si aplica)                 │  │
│      │ "Invitas al grupo X con código Y."             │  │
│      └────────────────────────────────────────────────┘  │
│                                                          │
│      ┌─ EMAIL PREVIEW ────────────────────────────────┐  │
│      │ kicker "Preview · así se verá el email"        │  │
│      │                                                │  │
│      │ [email-preview]                                │  │
│      │  ├── head: logo + "Polla Mundialista" +        │  │
│      │  │   "polla@golgana.net · Para: {first email}" │  │
│      │  └── body:                                     │  │
│      │      ├── "@user te invitó" (kicker verde)      │  │
│      │      ├── h2 "Te invitan a {group.name}"        │  │
│      │      ├── intro paragraph                       │  │
│      │      ├── [optional message] (si message.trim) │  │
│      │      ├── "Únete con un click:"                 │  │
│      │      ├── [CTA "Unirme al grupo"]               │  │
│      │      ├── "O ingresa este código en             │  │
│      │      │   app.polla.golgana.net:"               │  │
│      │      ├── code mini                             │  │
│      │      └── signature footer                      │  │
│      └────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────┘
```

**Sin tabs internos.** Form + preview en grid vertical.

---

## 3. Componentes desglosados

### 3.1 Page header

**Render**:
```
← Oficina Q1 2026
Invitar por email
```

**Análisis**:
- ✓ Consistente con `/groups/:id/prizes` (back link con group name fallback).
- 🟡 Mismo UX jitter durante loading (fallback "Volver al grupo" → "{group.name}").

### 3.2 Form card

#### a) Header + lead

**Render**:
```
¿A quiénes invitas?

Pega los emails de tus amigos. Pueden estar separados por coma, espacio o enter.
Te avisamos cuando alguien se una.
```

**Análisis**:
- ✓ Lead conversational y explica los separators aceptados.
- ✓ "Te avisamos cuando alguien se una" — promesa de notif post-join.
- 🟡 "Te avisamos" — actualmente solo via notif si está implementada (notif kinds están limitadas a comodines per bucket 4 review). Posible promesa incumplida.

#### b) Field: Emails chips

**Render**:
```
Emails
┌───────────────────────────────────────────────────┐
│ [user1@x.com ×] [user2@x.com ×]                   │
│ agregar otro email…                                │
└───────────────────────────────────────────────────┘
Máx. 20 emails por invitación.
```

**Datos**:
- `emails` signal (string[])
- `draft` signal (current input)
- Validation: regex `/^[^\s@]+@[^\s@]+\.[^\s@]+$/`
- Cap: 20 emails
- Triggers commit: Enter, comma, space, blur
- Dedup automático

**Análisis**:
- ✓ **Multi-trigger commit** (Enter / comma / space / blur) — UX flexible.
- ✓ Email validation client-side.
- ✓ Cap 20 con error toast.
- ✓ Dedup silencioso.
- ✓ Placeholder con ellipsis (P4.A done).
- 🟠 **× close button es `<span>` con click handler** — anti-pattern web-guidelines (debe ser `<button>`). A11y ya lo señaló en bucket 1 review pero no se corrigió.
- 🟠 **Paste batch limitado**: si user pega `"a@x.com, b@x.com, c@x.com"`, el comma trigger commit del primer email pero el resto queda en el draft (puede o no detectarse correctamente con `(keydown.,)` syntax en Angular). Sin verificar comportamiento real, no se sabe si se split correctamente.
- 🟠 **Sin suggested emails** desde contactos/histórico ("Invitaste a X antes — ¿de nuevo?").
- 🟠 **Sin batch import** de CSV/clipboard masivo.
- 🟡 Sin contador X/20 visible.
- 🟡 Hint "Máx. 20" pero el cap aparece SOLO como toast cuando se intenta agregar 21. Mejor también como counter live.
- 🟡 Email inválido → toast pero el draft se mantiene — user debe editarlo o borrarlo.

#### c) Field: Mensaje opcional

**Render**:
```
Mensaje opcional
[textarea 3 rows, "Hey, armé un grupo para la polla del Mundial…"]
Aparece debajo del CTA en el email. Máx 200 caracteres.
```

**Datos**:
- `message` (string, no signal)
- maxlength=200
- Real-time update en preview (reads `message.trim()`)

**Análisis**:
- ✓ Placeholder usable como template.
- ✓ Real-time preview ← ⭐ el feature más fuerte de la pantalla.
- 🟠 **Hint dice "debajo del CTA"** — pero en el preview el message aparece **antes** del CTA. Inconsistencia documentación vs render.
- 🟡 Sin character counter (X/200).
- 🟡 Default text del placeholder ("Hey, armé un grupo para la polla del Mundial…") es buena guía pero el user puede no entender que se trata de un placeholder, no del contenido real.

#### d) Submit button (dinámico)

**Render dinámico**:
- Sin emails: "Agrega al menos un email" (disabled)
- Grupo lleno: "Grupo lleno" (disabled)
- Durante: "Enviando…" (disabled)
- Normal: "Enviar N invitación" / "Enviar N invitaciones" (active)

**Análisis**:
- ✓ Label dinámico **excelente** — el user siempre sabe qué pasará al apretar.
- ✓ Disabled apropiadamente según contexto.
- ✓ "Grupo lleno" feedback claro con hint debajo ("El grupo ya tiene 30 miembros…").
- ✓ Plural correctamente formado.
- 🟡 `groupIsFull()` check usa `memberCount()` cacheado en init. **No se refresca**. Si admin invita mientras simultáneamente alguien más se une, el cap puede estar mal contado.

#### e) Footer text del form

**Render**:
```
Invitas al grupo "Oficina Q1 2026" con código ABCD23.
```

**Análisis**:
- ✓ Confirma contexto antes de enviar.
- 🟡 Texto pequeño — el code es útil tenerlo a mano pero compite con el código del preview.

### 3.3 Email preview (live)

**Render**:
```
Preview · así se verá el email

┌──────────────────────────────────────────────────┐
│ [GOLGANA logo]                                    │
│ Polla Mundialista                                 │
│ polla@golgana.net · Para: user1@x.com             │
├──────────────────────────────────────────────────┤
│                                                   │
│ @TUUSER TE INVITÓ                                 │
│                                                   │
│ Te invitan a "Oficina Q1 2026"                    │
│                                                   │
│ @tuuser armó un grupo en la Polla Mundial 2026   │
│ y quiere que estés. Es gratis y solo pide email   │
│ + password.                                       │
│                                                   │
│ "Hey, armé un grupo para la polla…"  ← optional   │
│   (border-left verde, italic)                     │
│                                                   │
│ Únete con un click:                               │
│ [Unirme al grupo] ← CTA button visual             │
│                                                   │
│ O ingresa este código en app.polla.golgana.net:   │
│ ABCD23                                            │
│                                                   │
│ Recibiste este correo porque @tuuser te invitó.   │
│ Si no lo conoces, ignora este email…              │
│ © 2026 Golgana · polla@golgana.net                │
└──────────────────────────────────────────────────┘
```

**Datos**:
- `emails()[0] ?? 'amigo@ejemplo.com'` — primer email o placeholder fallback
- `currentHandle() ?? 'tu'` — handle del user
- `g.name` — group name
- `message` — si truthy, se inserta blockquote
- `g.joinCode` — el code de invitación

**Análisis**:
- ✓ **Preview live es la feature estrella**. Reduce ansiedad del admin (¿qué van a recibir?).
- ✓ Layout email-like es reconocible.
- ✓ Optional message renderizado con blockquote style.
- ✓ Fallback graceful para emails vacío + handle null.
- 🟠 **CTA "Unirme al grupo"** no tiene href real (solo visual). Si user clickea, no hace nada — esperado pero podría tener `cursor: default` o tooltip "Preview".
- 🟠 **"polla@golgana.net" hardcoded** en preview. Si el email real cambia, requires manual update aquí.
- 🟠 **"© 2026 Golgana" hardcoded** year — outdated en 2027.
- 🟠 **Subject line del email no se muestra** — el preview omite la línea "Subject:" que el destinatario verá en su inbox. Crítico para tasa de apertura.
- 🟠 **"app.polla.golgana.net" hardcoded** como URL.
- 🟡 Preview no es exactamente WYSIWYG — el email real puede renderizar distinto en gmail/outlook/etc.
- 🟡 Sin opción para enviarte el preview a vos mismo ("Enviame este preview" button) — pattern común en email tools.

---

## 4. Cross-cutting · hallazgos UX (priorizados)

🔴 **× close button del chip es `<span>` no `<button>`** — anti-pattern web-guidelines (a11y + semantics).

🔴 **memberCount cacheado** sin refresh — `groupIsFull` puede estar mal si alguien más se une simultáneamente.

🟠 **Sin CanDeactivate guard** — user mid-typing chips puede perder work si navega away.

🟠 **Batch paste limitado** — `"a@x.com, b@x.com, c@x.com"` no se split en chips múltiples.

🟠 **Sin suggested emails** desde histórico de invitaciones previas.

🟠 **Subject line del email no en preview** — falta info crítica.

🟠 **Hardcoded** "polla@golgana.net", "app.polla.golgana.net", "© 2026 Golgana" — outdating risk.

🟠 **Hint del message dice "debajo del CTA"** pero render lo pone **antes**. Inconsistencia.

🟠 **Sin "Enviame el preview a mí"** option.

🟠 **Promesa "Te avisamos cuando alguien se una"** — notif kind para JOIN no implementado per bucket 4.

🟠 **Sin retry/resend tracking** ("Ya invitaste a X" según bucket 3 review).

🟠 **Sin feedback per-email post-send** (cuántos rebotaron, cuál falló).

🟡 **Sin char counter en message** (200 max).

🟡 **Sin counter X/20 emails**.

🟡 **CTA preview sin `cursor: default`** o tooltip "Preview".

🟡 **Email inválido mantiene draft** — user debe editarlo.

🟡 **Cap hint solo aparece como toast**, no como live counter.

🟡 **Default placeholder text del message** puede confundirse con contenido real.

🟡 **Footer text del form duplica info** del preview (code).

🟡 **UX jitter en page header fallback**.

🟢 **Preview no es WYSIWYG real** — gmail/outlook pueden renderizar distinto.

🟢 **No reorder chips** (probablemente no importa).

🟢 **No CC field** para incluir al admin en copia.

---

## 5. Antipatrones detectados

| Regla | Violación |
|---|---|
| **`<span (click)>` anti-pattern** | × close button del chip |
| **Stale data** | memberCount cacheado sin refresh |
| **Missing CanDeactivate** | Chips work in progress se pierde |
| **Hardcoded values** | polla@, app.polla, © 2026 |
| **Incomplete preview** | Subject line missing |
| **Documentation inconsistency** | Hint "debajo del CTA" vs render antes |
| **Promise breakage** | "Te avisamos" sin notif kind JOIN |
| **Missing affordance** | Suggested emails, batch import |
| **Char counters** | message + emails sin live counter |
| **CTA polish** | preview CTA sin `cursor: default` |

---

## 6. Anclas para el redesign

### Core

1. **Chips input** con multi-trigger commit
2. **Email validation + cap 20**
3. **Optional message**
4. **Submit button con label dinámico**
5. **Preview live**

### Quitar

- `<span>` close button → `<button>`
- Hardcoded email/URL/year → templated o config
- UX jitter page header

### Agregar

- **CanDeactivate guard** (consistencia)
- **memberCount refresh** antes de enviar (re-check vs cache)
- **Batch paste split** automático
- **Suggested emails** desde histórico
- **Subject line en preview**
- **"Enviame el preview a mí" button**
- **Character counters** (message + emails X/20)
- **Cap counter live** ("18/20")
- **Backend notif kind JOIN** para cumplir promesa "Te avisamos"
- **Retry/resend tracking** ("Ya invitaste a X")
- **Feedback per-email post-send** (sent / bounced / failed)
- **CC option** (admin en copia)
- **Email inválido auto-clear** o highlight para que user vea qué falta
- **CTA preview** con `cursor: default` + tooltip "Preview"
- **Hardcoded values** → templated/configurables

### Bug fix

- × button → `<button>` (a11y/semantics)
- Hint message "debajo del CTA" → corregir a "antes del CTA"
- memberCount refresh check al send
- Subject line en preview

---

## 7. Resumen ejecutivo

**Surface más rica del groups family con preview live ⭐**. Lo que funciona muy bien:

- Chips system con multi-trigger commit
- Submit button label dinámico
- Email preview live con message rendering
- Fallback gracioso para emails vacío
- Cap 20 con feedback claro
- `groupIsFull` check (D5 wired)

### 3 decisiones de diseño que cambian todo

1. **Bug fix de antipatrón a11y**: cambiar `<span (click)>` del × close button a `<button>`. Es mecánico — la lista de chips debe usar componentes con semánticas correctas.

2. **Completar el preview**:
   - Subject line del email (críticamente importante)
   - "Enviame el preview a mí" button (admin valida antes de spamear contactos)
   - Templated values (email, URL, year) — no hardcoded
   - CTA con `cursor: default` + tooltip

3. **Enriquecer el flujo con histórico**:
   - Suggested emails desde invitaciones previas
   - "Ya invitaste a X" tracking
   - Per-email status post-send (sent/bounced/failed)
   - Backend notif kind JOIN para cumplir la promesa

### Cambios secundarios

- CanDeactivate guard
- Batch paste split automático
- Character counters (message + emails live counter)
- memberCount refresh check al send
- Email inválido auto-clear o highlight
- CC option al admin
- Hint "antes del CTA" (corregir doc)
- UX jitter del page header

**Nota retrospectiva**: este surface es buen candidato para mantener como página dedicada (el preview live + chips + textarea no caben bien en modal). Pero el componente podría reutilizarse en `/groups/:id/edit` como sub-section ("Invitar más miembros") para reducir 1 ruta.
