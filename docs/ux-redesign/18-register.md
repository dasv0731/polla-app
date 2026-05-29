# Análisis UX: `/register` — RegisterComponent

> Surface #18 del walkthrough. Flujo más complejo de toda la app: 3 steps + state machine + deep-link entry + handle live-check + OTP autofocus + cooldown + recovery branch.
> Post Fase B/C: returnUrl propagation hasta onboarding + UserNotConfirmedException deep-link aterriza en step 'confirm'.
> Post Fase A: campo "Nombre" eliminado.

---

## 1. Identidad

- **Propósito**: crear cuenta nueva. Cubre 3 escenarios: usuario nuevo desde cero (step `form` → `confirm`), usuario sin confirmar venido de login (deep-link directo a `confirm`), usuario con perfil parcialmente creado tras OTP exitoso pero conflict de handle (step `handle-conflict`).
- **Audiencia**: visitantes sin cuenta + users con account no confirmada.
- **Frecuencia**: una vez por user en su lifetime.
- **Entry points**: link "Crear cuenta" desde `/login`, redirect automático desde login cuando Cognito reporta UserNotConfirmedException (`?email=X&confirm=1`), deep-link compartido externamente.

---

## 2. Estructura — state machine

```
                  ┌─────────────────┐
   /register ────►│   step: form    │
                  │                 │
                  │  - handle       │
                  │  - email        │
                  │  - password     │
                  │  - terms ✓      │
                  └────────┬────────┘
                           │ submitForm() OK
                           │ Cognito.signUp
                           ▼
   /register             ┌─────────────────┐
   ?email=X &────────────│  step: confirm  │
   ?confirm=1            │                 │
   (from login)          │  - 6-digit OTP  │
                         │  - resend (60s) │
                         └────────┬────────┘
                                  │ submitConfirm() OK
                                  │ Cognito.confirmSignUp + signIn
                                  │ createUserProfile() OK
                                  ▼
                              /onboarding (+ returnUrl)

                                  │ createUserProfile() FAIL
                                  │ (handle race condition)
                                  ▼
                         ┌─────────────────────────┐
                         │ step: handle-conflict   │
                         │                         │
                         │  Sesión Cognito activa  │
                         │  + sin User row         │
                         │  - solo input handle    │
                         │  - retry o restart      │
                         └────────┬────────────────┘
                                  │ retryHandle() OK
                                  ▼
                              /onboarding (+ returnUrl)

                                  │ restartRegistration()
                                  │ auth.logout()
                                  ▼
                              step: form (reset)
```

**3 entry points** + **3 exit points** (onboarding, login, restart loop).

---

## 3. Componentes desglosados

### 3.1 Brand panel (desktop only)

**Mismo bloque que `/login`** — mismas observaciones:
- 🔴 Stats hardcoded 2.4k / 180 / $15k
- 🟠 Branding "Polla Mundialista" en footer
- 🟠 Términos · Privacidad text-only
- 🟡 Logo image con inline style

**Diferencia con login**: el logo en register usa `style="height:40px"` (más grande). Login usa `height:32px`. Inconsistente.

### 3.2 Step 1 — form (CASO BASE)

#### Head
```
‹ Volver a Entrar

PASO 1 DE 2
Crear cuenta
Verificamos tu email en el siguiente paso.
```

**Análisis**:
- ✓ **Progress indicator** "PASO 1 DE 2" — esto el `/login` no tiene (porque es 1 step).
- ✓ Back link prominente a `/login`.
- ✓ Sub-text setea expectativa del próximo step.
- 🟡 "Volver a Entrar" — wording raro. "Volver al login" o "Volver" más claro.

#### Campo Usuario (handle)

**Render**:
```
Usuario
[tu_usuario________________]  ✓ disponible / ✗ en uso / verificando…
Sin @ — solo letras, números y guión bajo. Así te verán tus panas en el ranking.
```

**Datos**:
- type=text, autocomplete=username
- spellcheck=off, autocapitalize=off, autocorrect=off
- pattern `[a-zA-Z0-9_]{3,20}`
- live check con debounce 400ms vía `checkHandleAvailable` mutation
- 3 estados: idle, checking, available, taken

**Análisis**:
- ✓ **Live availability check** UX brillante. User sabe ANTES de submit si su handle funciona.
- ✓ Debounce 400ms — no spammea el backend.
- ✓ Pill visual ✓/✗/verificando con colores semánticos (success/danger/neutral).
- ✓ Helper text explica el "@" issue y motiva ("así te verán tus panas").
- ✓ Backend valida server-side via mutation `checkHandleAvailable` (no expone User table).
- ✓ A11y attrs completos (spellcheck/autocapitalize/autocorrect).
- 🟠 **Pills ✓/✗ usan emoji unicode** — en line 82-86 NO usan `aria-hidden`. En line 189-193 (handle-conflict) SÍ usan `<span aria-hidden="true">✓ </span>`. **Inconsistencia intra-component**.
- 🟠 Sin sugerencias cuando handle is "taken" (ej. "Prueba: tu_usuario2, tu_usuario_pana"). Esto Cómo lo hace GitHub/Twitter para reducir fricción.
- 🟠 Pattern strict `{3,20}` pero el helper NO menciona length. User que escribe "ab" no sabe por qué no pasa.
- 🟡 Sin underscore mention en placeholder ("tu_usuario" — sutil).

#### Campo Email

**Render**:
```
Email
[tu@correo.com______________]
```

**Análisis**:
- ✓ Todos los attrs P3 done (inputmode=email, spellcheck=false, autocapitalize=off, autocomplete=email).
- ✓ Pre-fill desde `?email=` query (deep-link from login).
- 🟡 Sin live validation visual (solo HTML5 native).
- 🟡 Sin disclaimer "Te enviaremos un código de verificación" — el head ya lo dice pero el field no.

#### Campo Password

**Render**:
```
Contraseña
[••••••••__________________] 👁
[password rules list component]
```

**Datos**:
- autocomplete=new-password (correcto vs login's current-password)
- spellcheck=off, autocapitalize=off
- minlength=8
- toggle eye
- `<app-password-rules-list>` muestra reglas con check states

**Análisis**:
- ✓ Password rules list **componente separado** con feedback live de cada regla (uppercase/lowercase/digit/length/special). Excelente UX.
- ✓ `passwordPassesAllRules()` valida en `canSubmit()`.
- ✓ Botón disabled hasta que todas las reglas pasen.
- ✓ autocomplete=new-password correcto.
- 🟠 **Eye toggle emoji 👁/👁️‍🗨️** — anti-pattern (mismo que login).
- 🟡 Sin strength indicator (medidor visual además de las reglas).
- 🟡 Reglas siempre visibles desde el inicio — antes de tipear puede sentirse intimidante. Material Design recomienda revelar reglas en focus.

#### Checkbox Terms

**Render**:
```
☐ Acepto los Términos y la Privacidad
```

**Análisis**:
- ✓ Required attribute.
- ✓ Links inline (vs login que es text-only en footer).
- 🟠 **Links `href="#"`** — placeholder, no apunta a nada real. Si user click, scroll to top.
- 🟠 Sin distinción visual entre "Acepto" y los links (mismo color/peso).
- 🟡 Sin link a Cookies Policy si aplica.
- 🟡 Single checkbox para 2 documentos (Términos + Privacidad) — UX bundling debatible. GDPR estricto requiere consentimientos separados.

#### Error block

```
{error()} (role=alert)
```

✓ Posición consistente (antes del botón).
✓ role="alert" para SR.
🟡 Error agrupado al final — si user tiene 3 errores diferentes (handle taken + email invalid + password weak), solo ve 1 (el último que threw).

#### Submit button

**Label dinámico**:
- "Creando…" (loading)
- "Continuar →" (idle)

**Análisis**:
- ✓ "Continuar →" más conversational que login's "Entrar".
- ✓ Disabled cuando `!canSubmit()` o `loading()`.
- ✓ canSubmit() verifica handle existe, email existe, password passes all rules, terms aceptado, handle NOT taken NOT checking.
- 🟡 Inline style.

#### Bottom

```
¿Ya tienes cuenta? Entrar
```

✓ Symmetric con login's "¿Primera vez? Crear cuenta →".
🟡 No propaga returnUrl back a login (asimétrico vs login → register que sí lo hace).

### 3.3 Step 2 — confirm (OTP)

#### Head
```
‹ Volver a tus datos

PASO 2 DE 2
Verifica tu email
Te enviamos un código de 6 dígitos a
foo@bar.com
```

**Análisis**:
- ✓ **Email confirmado visualmente** ("a foo@bar.com") — user verifica que el email es el correcto.
- ✓ Back button para corregir email.
- ✓ Progress indicator "PASO 2 DE 2".
- 🟠 **goBackToForm vuelve al step `form` pero el password se pierde** del DOM (Angular limpia). Si user vuelve solo a corregir email, password se reset = mala UX.
- 🟠 Back button via `<button type="button">` con clase `auth-back`. **Visual styling igual al `<a>` link** del step 1 ("‹ Volver a Entrar") — funcional pero rompe semántica.

#### OTP inputs (6 dígitos)

**Render**:
```
[1] [2] [3] [4] [5] [6]
```

**Datos**:
- maxlength=1 por input
- inputmode=numeric
- autocomplete=one-time-code (iOS auto-fill desde SMS/email)
- aria-label="Dígito N"
- onInput → next focus
- onKeyDown Backspace → prev focus si vacío
- onPaste → distribuye 6 chars across inputs

**Análisis**:
- ✓ **Autofocus next** UX standard de OTP.
- ✓ **Backspace prev** mantiene flow.
- ✓ **Paste handler** brillante: pegas "123456" y rellena todo + focus al último.
- ✓ inputmode=numeric activa keyboard numérico en mobile.
- ✓ `autocomplete="one-time-code"` permite iOS auto-fill desde SMS.
- ✓ aria-labels individuales.
- ✓ Filtro `/\D/g` previene letras.
- 🟡 Sin auto-submit cuando se completan los 6 dígitos. User debe hacer click adicional.
- 🟡 Sin shake/error animation cuando el código es inválido (solo aparece el error text).

#### Resend block

**Render**:
```
¿No te llegó? Reenviar       (idle)
¿No te llegó? Reenviar (00:42) (cooldown)
```

**Análisis**:
- ✓ Cooldown 60s post-submit/resend evita spam.
- ✓ Display formato MM:SS.
- ✓ resendInfo() success message con role="status".
- 🟠 **Color verde durante cooldown** — visualmente parece "ya enviado, OK" pero realmente significa "deshabilitado". Confuso.
- 🟠 Cooldown solo arranca a 60s — no escala (60s primer reenvío, 120s segundo, etc.) como hacen apps que combaten abuse.
- 🟡 Sin opción "Cambiar email" sin perder progreso.

#### Tip

```
💡 Revisa tu spam si no lo encuentras. El código caduca en 10 minutos.
```

- ✓ Información proactiva.
- 🟠 **Emoji 💡** — anti-pattern. Debería ser SVG icon.

#### Submit

- "Verificando…" / "Verificar →"
- Disabled si `code().length !== 6`
- Si OTP OK → auto-signIn + createUserProfile → navigate /onboarding

### 3.4 Step 3 — handle-conflict (RECOVERY BRANCH)

**Cuándo se activa**: OTP confirmado + sign-in OK + `createUserProfile()` retorna `ok:false` (race condition: alguien tomó el handle entre el check live y el commit final). El user está autenticado en Cognito pero sin User row → otras pantallas romperían.

#### Head
```
CASI LISTO
Elige otro usuario
Tu cuenta está creada pero @foo ya está en uso por otra persona.
Pickeá uno distinto y terminamos.
```

**Análisis**:
- ✓ **Recovery UX inteligente** — en lugar de fatal error, da un step focalizado.
- ✓ Tone tranquilizante ("Tu cuenta está creada").
- ✓ Explica QUÉ pasó.
- ✓ Solo 1 campo (handle) + retry button → fricción mínima.
- 🟠 "Pickeá" (voseo argentino) — la app usa principalmente "tú" en otros lugares ("tus panas"). Inconsistencia regional.
- 🟡 Sin sugerir alternativas (foo_2, foo_pana, foo23).

#### Form

- Mismo input handle con live check.
- Botón "Confirmar usuario" disabled hasta available.
- "Empezar de nuevo" → logout + reset al step form.

**Análisis**:
- ✓ Escape route "Empezar de nuevo" + logout previene lock-in.
- ✓ retryHandle solo retry createUserProfile (no re-signUp en Cognito).
- ✓ Sesión Cognito permanece activa durante el retry.
- 🟠 **No queryParams handling** — retryHandle navega a /onboarding con returnUrl, pero si user llegó a este step vía deep-link, el queryParamMap tiene el returnUrl. ✓ Esto está correcto en el código (líneas 549).

### 3.5 Deep-link entry (`?email=X&confirm=1`)

**Behavior** (Fase C):
1. login.component detecta UserNotConfirmedException
2. Hace fire-and-forget resend
3. Redirect a `/register?email=X&confirm=1&returnUrl=Y`
4. RegisterComponent ngOnInit lee qp.get('email') y qp.get('confirm')
5. Si confirm===1 y email exists → step.set('confirm') + startCooldown(60)

**Análisis**:
- ✓ **Brillante** — user no necesita re-tipear email.
- ✓ Cooldown se setea a 60 para reflejar que login YA reenvió código.
- 🟠 **Sin password en este flow** — user pegado en step 'confirm' sin password. `submitConfirm` necesita `this.password` para auto-signIn (línea 486). **Si password está vacío, signIn falla, OTP confirma pero user queda sin sesión activa.** ⚠️ **BUG LATENTE**: el deep-link directo a 'confirm' rompe el auto-login post-OTP.
- 🟠 Sin handle pre-fill — user no recuerda qué handle quería. Si confirma OTP, createUserProfile recibe handle del Cognito (línea 493: `u.handle`). Pero ese handle vino del signUp original. Si nunca completó el form (improbable en este flow), no hay handle.

### 3.6 returnUrl propagation

**Behavior** (Fase B):
1. login → register: link "Crear cuenta" con `queryParamsHandling="merge"` propaga returnUrl
2. register → confirm step: returnUrl queda en queryParamMap
3. submitConfirm post-success: lee returnUrl + navigate `/onboarding` con returnUrl en queryParams
4. /onboarding (próximo surface) recoge returnUrl y termina el deep-link

**Análisis**:
- ✓ Propagación end-to-end correcta.
- ✓ Mismo handling en submitConfirm (línea 503) y retryHandle (línea 549).
- 🟡 Sin indicator visual ("Te llevaremos a {path} después").

---

## 4. Cross-cutting · hallazgos UX (priorizados)

🔴 **Stats hardcoded** (mismo brand panel).

🔴 **Bug latente deep-link → 'confirm'**: si user llega via `?confirm=1` sin password, signIn post-OTP falla.

🟠 **Branding "Polla Mundialista"** vs Golgana logo (mismo issue).

🟠 **Links Términos/Privacidad `href="#"`** — placeholders rotos.

🟠 **Eye toggle 👁/👁️‍🗨️ + 💡 tip + ✓/✗ pills** — emojis como icons (anti-pattern).

🟠 **goBackToForm() pierde password** del state.

🟠 **Inconsistencia aria-hidden en pills** (step 1 sin, step 3 con).

🟠 **Resend cooldown verde confuso** (parece "enviado" en lugar de "esperando").

🟠 **"Pickeá" voseo** inconsistente con "tú" del resto.

🟠 **Cooldown no escala** (60s siempre).

🟠 **Sin sugerencias** cuando handle is taken.

🟠 **Helper handle sin mention length** ({3,20}).

🟠 **OTP sin auto-submit** al completar 6 dígitos.

🟠 **OTP sin shake/error animation**.

🟠 **Password rules siempre visibles** (intimidante antes de typear).

🟡 **Inline styles** logo, submit button, padding.

🟡 **Sin password strength indicator** visual.

🟡 **Sin queryParams handling back-link** "¿Ya tienes cuenta? Entrar".

🟡 **GDPR**: 1 checkbox para 2 documentos.

🟡 **Errors agrupados** (solo último error visible).

🟡 **Sin SSO options**.

🟡 **Logo size inconsistente** (40px aquí vs 32px login).

🟡 **"Volver a Entrar" wording** raro.

---

## 5. Antipatrones detectados

| Regla | Violación |
|---|---|
| **no-emoji-icons** | 👁 eye toggle, 💡 tip, ✓/✗ pills |
| **Misleading data** | Stats hardcoded fake |
| **Broken links** | href="#" Términos/Privacidad |
| **State preservation** | goBackToForm pierde password |
| **State machine consistency** | aria-hidden en pills inconsistente |
| **Color semantics** | Verde durante cooldown ≠ success |
| **i18n consistency** | "Pickeá" voseo mezclado con "tú" |
| **Errors visibility** | Solo último error visible |
| **CTA secondary text** | Cooldown text wording |
| **Form ergonomics** | OTP sin auto-submit |
| **GDPR strict** | 1 checkbox bundles 2 docs |
| **Inline styles** | Logo, submit, padding |

---

## 6. Anclas para el redesign

### Core

1. **3-step state machine** (form / confirm / handle-conflict)
2. **Handle live check** con debounce (manteniéndolo, es excelente)
3. **OTP 6-dígitos** con autofocus + paste + backspace
4. **Password rules list** componente
5. **Recovery branch** handle-conflict
6. **Deep-link entry** ?email=X&confirm=1
7. **returnUrl propagation** end-to-end
8. **Cooldown resend** 60s

### Quitar

- Emoji icons (👁, 💡, ✓, ✗) → SVG
- Stats hardcoded
- href="#" placeholders → links reales
- "Pickeá" → "Elige" (consistencia)
- Inline styles → tokens

### Agregar

- **Bug fix**: deep-link confirm sin password → o pedir password en step 'confirm' antes de submit, o salvar password en sessionStorage entre redirects (con cleanup post-login)
- **Handle suggestions** cuando taken
- **Auto-submit OTP** al 6º dígito
- **Shake animation** en OTP error
- **Cooldown escalado** (60s → 120s → 300s)
- **Password rules en focus** (no siempre visible)
- **Password strength indicator** visual
- **Email pre-fill UI hint** ("Email completado desde tu sesión anterior")
- **returnUrl indicator** ("Te llevaremos a X")
- **Error summary** si múltiples errores
- **SSO options**
- **Logo size token** unificado con login
- **Aria-hidden consistente** en pills
- **Cooldown color** neutro (no verde)
- **Mention length en helper** handle ({3,20})
- **GDPR**: separar Términos y Privacidad si jurisdicción lo requiere

---

## 7. Resumen ejecutivo

**Surface más complejo de la app post Fase A/B/C/P**. La mayoría del polish UX ya está aplicado (handle live check, OTP autofocus + paste, deep-link entry, returnUrl propagation, recovery branch handle-conflict). Lo que queda es:

1. 🔴 **Bug latente deep-link**: el flow `?email=X&confirm=1` desde login funciona PERO si user no tiene password en memory (porque login solo tenía email + Cognito refresh), submitConfirm falla en `auth.login(this.email, this.password)`. **Necesita test E2E para verificar el flow real.** Si confirmás esto es bug, el fix es:
   - **Opción A**: agregar campo password al step 'confirm' cuando viene de deep-link.
   - **Opción B**: el handler de UserNotConfirmedException en login NO debería redirect — debería solo show modal "Tu cuenta no está confirmada. ¿Reenviar código?" y luego mantener login con password en el form.

2. 🔴 **Stats hardcoded** (mismo problema que login).

3. 🟠 **Recovery UX handle-conflict** es brillante pero "Pickeá" rompe el tone consistente con el resto. Cambiar a "Elige".

4. 🟠 **Password loss** en goBackToForm — si user vuelve solo a corregir email, debe re-typear password. Pequeño pero molesto.

5. 🟠 **OTP auto-submit faltante** — UX standard de OTP modernos es submitear automáticamente al 6º dígito. La app ya hace todo lo demás (focus, paste, backspace), debería rematar.

### 3 decisiones de diseño que cambian todo

1. **Resolver el bug del deep-link confirm** — esto es bloqueante. El flow UserNotConfirmedException → register?confirm=1 tiene una vulnerabilidad lógica si el user nunca llenó password en el sessionStorage post-login.

2. **Decidir sobre stats reales** (mismo punto que login).

3. **Tone consistency**: "tú" en todos lados, o introducir voseo deliberadamente. Cambiar "Pickeá" → "Elige" o agregar voseo a "tus panas" (sería "tus parnas/tus banda") para coherencia regional.

### Cambios secundarios

- SVG icons (👁, 💡, ✓, ✗)
- Auto-submit OTP al 6º dígito
- Shake animation OTP error
- Cooldown escalado + color neutro
- Handle suggestions cuando taken
- Password rules en focus
- Strength indicator
- Email pre-fill hint
- returnUrl indicator
- Error summary
- SSO options
- Logo size unificado con login
- Aria-hidden consistente pills
- Mention length en helper handle
- Helper sin spelling "panas" si target audience es internacional
- GDPR-separated consents si jurisdicción aplica
- Preserve password state en goBackToForm

**Nota retrospectiva**: este surface tiene la **mayor complejidad técnica** pero también la **mayor inversión de UX polish** de la app. Solo el bug latente del deep-link es crítico. Lo demás son refinements progresivos.
