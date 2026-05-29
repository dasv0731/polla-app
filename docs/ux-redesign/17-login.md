# Análisis UX: `/login` — LoginComponent

> Surface #17 del walkthrough. Pantalla de entrada principal de la app.
> Layout dual: brand panel + form (desktop) o solo form (mobile).
> Post Fase B/C: returnUrl handling + UserNotConfirmedException auto-redirect + email pre-fill desde query.

---

## 1. Identidad

- **Propósito**: autenticar al user. Returning users entran con email + password. Newer users tienen el link a register.
- **Audiencia**: cualquier visitante no autenticado.
- **Frecuencia**: una vez por sesión típica. Pero ojo: para deep-link sharing (`/groups/join/:code`) la frecuencia sube.
- **Entry points**: redirect del authGuard cuando user no autenticado, click "Iniciar sesión" desde footer público, deep-link directo.

---

## 2. Estructura — mapa general

```
┌──────────────────────────────────────────────────────────┐
│ [auth-shell · grid 2 cols desktop, 1 col mobile]         │
│                                                          │
│ DESKTOP ≥992                                             │
│ ┌─ LEFT (brand panel) ──┐  ┌─ RIGHT (form) ──────────┐  │
│ │ logo + brand title    │  │ desk-head:              │  │
│ │ h1 marketing          │  │  kicker "BIENVENIDO…"   │  │
│ │ sub explicativo       │  │  h1 "Entrar"            │  │
│ │ stats 3-up:           │  │  sub                    │  │
│ │  2.4k Jugadores       │  │                         │  │
│ │  180 Grupos activos   │  │ form:                   │  │
│ │  $15k En premios      │  │  Email                  │  │
│ │ footer © 2026…        │  │  Password (con eye)     │  │
│ └───────────────────────┘  │  Forgot? link           │  │
│                            │  Error (role=alert)     │  │
│                            │  [Entrar] btn primary    │  │
│                            │                         │  │
│                            │ bottom: "¿Primera vez? │  │
│                            │  Crear cuenta →"        │  │
│                            └─────────────────────────┘  │
│                                                          │
│ MOBILE <992                                              │
│  ┌──────────────────────┐                                │
│  │ mobile-head:         │                                │
│  │  ⚽ emoji logo        │                                │
│  │  h1 "Polla Mundialista" │                             │
│  │  kicker "Mundial 2026"│                               │
│  │                      │                                │
│  │ form (mismo)         │                                │
│  └──────────────────────┘                                │
└──────────────────────────────────────────────────────────┘
```

**Sin tabs internos.** Form linear simple.

---

## 3. Componentes desglosados

### 3.1 Brand panel (desktop only)

**Render**:
```
[logo] GOLGANA · MUNDIAL 2026

Predice cada partido.
Gana contra tus panas.

Crea grupos privados, asigna premios, gana comodines y demuestra
quién sabe más de fútbol.

[2.4k]      [180]              [$15k]
Jugadores   Grupos activos     En premios

© 2026 Polla Mundialista · Términos · Privacidad
```

**Análisis**:
- ✓ Tagline conversational ("tus panas") consistente con tone de la app.
- ✓ Sub-text explica valor en 1 frase.
- ✓ Stats 3-up dan social proof.
- 🔴 **Stats hardcoded** (2.4k / 180 / $15k) — bucket 1 review marcó esto. **No vienen del backend**, son números fake. Si la app sale a prod con esto, es misleading + outdated rápido.
- 🟠 **Branding inconsistente**: brand title dice "GOLGANA · MUNDIAL 2026" (desktop) pero la mobile-head dice "Polla Mundialista" (h1). Bucket 1 ya lo marcó como inconsistencia.
- 🟠 **Stats sin `Intl.NumberFormat`** — "2.4k" formato hardcoded. Si stats fueran reales, no escalaría a otras regiones.
- 🟠 **Footer text "© 2026 Polla Mundialista · Términos · Privacidad"** — Términos y Privacidad son **texto plano**, no links. Si el user quiere leer la política, no puede.
- 🟡 Inline style `style="height:32px;width:auto;"` en logo image — design system gap.

### 3.2 Mobile head

**Render**:
```
⚽
Polla Mundialista
Mundial 2026
```

**Análisis**:
- 🔴 **Logo ⚽ emoji** — anti-pattern + diverge del logo Golgana usado en desktop.
- 🟠 **h1 "Polla Mundialista"** vs brand title desktop "GOLGANA · MUNDIAL 2026" — inconsistencia.
- 🟡 Sin el logo image — mobile pierde el branding visual fuerte.

### 3.3 Form

#### a) Email field

**Render**:
```
Email
[tu@correo.com                                    ]
```

**Datos**:
- type=email
- autocomplete=email
- inputmode=email (P3 done)
- spellcheck=false (P3 done)
- autocapitalize=off (P3 done)
- required
- placeholder

**Análisis**:
- ✓ **A11y + mobile UX**: todos los attrs correctos post Fase P3.
- ✓ Label asociado por `for/id`.
- ✓ Pre-fill desde query `?email=` (Fase C: post forgot-password fallback).
- 🟡 Sin validation feedback inline (solo HTML5 native).

#### b) Password field con eye toggle

**Render**:
```
Contraseña                      ¿Olvidaste?
[••••••••                                  👁]
```

**Datos**:
- type=password (toggle a text)
- autocomplete=current-password
- spellcheck=false (P3 done)
- autocapitalize=off (P3 done)
- required
- Eye button con aria-label dinámico

**Análisis**:
- ✓ A11y + mobile attrs correctos.
- ✓ Eye toggle button con `aria-label` dinámico.
- ✓ "¿Olvidaste?" link al lado del label — affordance discoverable.
- 🟡 **Eye toggle usa emoji 👁/👁️‍🗨️** — anti-pattern. Y la diferencia visual entre los 2 emojis es sutil (eye vs eye-in-speech-bubble).
- 🟡 Sin password strength indicator (no aplica en login, sí en register).

#### c) Error message

**Render**:
```
{error()} (color rojo + role=alert)
```

**Análisis**:
- ✓ `role="alert"` para screen readers (P1 done).
- ✓ Visual distintivo (color + bg + border).
- 🟡 **Error genérico "Credenciales inválidas"** — sin context. Si el error es `UserNotConfirmedException`, **el user es auto-redirected** sin mensaje explícito de "tu cuenta no está confirmada, te llevamos al paso de verificación" — confuso si el user no entiende qué pasó.
- 🟡 Sin lockout indicator después de N fallos (security gap).

#### d) Submit button

**Render**:
```
[Entrando…] / [Entrar]
```

**Análisis**:
- ✓ Loading state ("Entrando…").
- ✓ Disabled during loading.
- 🟠 **Label "Entrar" genérico** — bucket 1 review marcó: "rule prefers specific labels ('Save API Key' not 'Continue')". "Iniciar sesión" sería más específico.
- 🟡 Inline style `padding:14px;font-size:14px;margin-top:4px;`.

#### e) Bottom links

**Render**:
```
¿Primera vez? Crear cuenta →
```

**Análisis**:
- ✓ Link claro a register.
- ✓ **Propaga `returnUrl` automáticamente** via `forwardQueryParams()` + `queryParamsHandling="merge"` (Fase B feature).
- 🟡 Solo 1 link ("Crear cuenta") — sin SSO options (Google / Apple / Facebook login).
- 🟡 Sin "Acceso como invitado" o "Ver demo" para users curiosos.

### 3.4 UserNotConfirmedException handling

**Behavior** (Fase C feature):
1. User intenta login
2. Cognito rechaza con `UserNotConfirmedException`
3. Login resend el código (fire-and-forget)
4. Redirect a `/register?email={email}&confirm=1&returnUrl={ret}`
5. Register lee los params en ngOnInit y aterriza directo en step 'confirm'

**Análisis**:
- ✓ **Flow brillante** — el user que se registró pero nunca confirmó OTP puede continuar desde donde quedó.
- 🟠 **Sin mensaje al user de qué pasó**: el flow es silencioso. User clicked "Entrar", de pronto aparece en register step OTP. Sin "ⓘ Te llevamos al paso de confirmar tu email".
- 🟡 Fire-and-forget de resend — si falla, user no se entera. Probablemente OK (Cognito retry on user manual resend), pero gap.

### 3.5 returnUrl handling

**Behavior** (Fase B feature):
1. `safeReturnUrl()` lee `?returnUrl=` y valida `startsWith('/')` y no `//`
2. Post-login: `navigateByUrl(safeReturnUrl())`
3. Default si no hay: `/home`
4. Propagación al link "Crear cuenta": `forwardQueryParams()` retorna `{returnUrl}` para mergear

**Análisis**:
- ✓ **Security correct**: bloquea open-redirect via paths externos.
- ✓ Default fallback a `/home`.
- ✓ Propagación al register link preserva el deep-link end-to-end.
- 🟡 Sin indicación visual de que hay un returnUrl ("Te llevaremos a {path} después de entrar").

---

## 4. Estado de Fase B/C en este surface

| Feature | Status |
|---|---|
| returnUrl handling | ✅ Fase B |
| safeReturnUrl validation | ✅ Fase B |
| Propagation a register | ✅ Fase B |
| UserNotConfirmedException redirect | ✅ Fase C |
| Email pre-fill desde query | ✅ Fase C |
| Auto-login post-forgot | ✅ Fase C (en forgot-password) |
| role="alert" en error | ✅ Fase P1 |
| Email inputmode + spellcheck | ✅ Fase P3 |
| Password autocomplete | ✅ Fase P3 |
| Eye toggle focus-visible | ✅ Fase P4 |
| Logo width/height | ✅ Fase P0 |

**Login es uno de los surfaces con más polish ya aplicado.**

---

## 5. Cross-cutting · hallazgos UX (priorizados)

🔴 **Stats hardcoded** (2.4k / 180 / $15k) — fake data, misleading si va a prod.

🔴 **Branding inconsistente** GOLGANA vs Polla Mundialista (bucket 1 ya marcado).

🟠 **Logo ⚽ emoji** en mobile-head — anti-pattern + diverge del logo Golgana.

🟠 **Términos · Privacidad text-only** sin links.

🟠 **Eye toggle emoji 👁/👁️‍🗨️** — anti-pattern.

🟠 **UserNotConfirmedException silencioso** — user no sabe por qué fue redirected.

🟠 **"Entrar" label genérico** — bucket 1 marcó.

🟠 **Sin returnUrl indicator** visual.

🟠 **Stats sin `Intl.NumberFormat`**.

🟠 **Sin SSO options** (Google / Apple / Facebook).

🟠 **Sin password lockout indicator** después de N fallos (security gap).

🟡 **Sin validation feedback inline** (solo HTML5 native).

🟡 **Mobile sin logo image** real.

🟡 **Inline styles** logo height + submit button.

🟡 **Sin "Acceso como invitado"** o demo.

🟢 **Sin captcha / anti-bot**.

🟢 **Fire-and-forget resend** silencioso si falla.

---

## 6. Antipatrones detectados

| Regla | Violación |
|---|---|
| **Misleading data** | Stats hardcoded fake |
| **Branding inconsistency** | GOLGANA vs Polla Mundialista |
| **no-emoji-icons** | ⚽ logo mobile, 👁 eye toggle |
| **CTA label specificity** | "Entrar" genérico |
| **Legal links** | Términos · Privacidad text-only |
| **Silent state change** | UserNotConfirmedException sin mensaje |
| **Hardcoded i18n** | Stats sin Intl |
| **Missing SSO** | Sin Google/Apple login |
| **Inline styles** | Logo + submit button |
| **Security** | Sin lockout indicator |

---

## 7. Anclas para el redesign

### Core

1. **Brand panel desktop** (mantener concepto pero con datos reales)
2. **Form simple email/password** (ya bien polished)
3. **Forgot password link** prominente
4. **Crear cuenta link** con returnUrl propagation
5. **returnUrl + UserNotConfirmedException** handlers (ya wired)

### Quitar

- Stats hardcoded (o conectar a backend real)
- Mobile logo emoji ⚽ → logo image real
- Términos · Privacidad text-only → links reales
- Eye toggle emoji → SVG icon

### Agregar

- **Unificar branding** decisión (Golgana vs Polla Mundialista)
- **Mensaje visual** cuando UserNotConfirmedException ("Te llevamos al paso de confirmar tu email")
- **Específico CTA**: "Iniciar sesión" en lugar de "Entrar"
- **Stats reales desde backend** o quitar la sección
- **`Intl.NumberFormat`** si se conserva stats
- **Links reales** para Términos / Privacidad
- **SSO options** (Google / Apple / Facebook) — modern auth UX
- **Returnurl indicator** ("Te llevaremos a {path} después")
- **Lockout indicator** después de N fallos
- **Logo image en mobile head** (no emoji)
- **Inline styles → design tokens**

---

## 8. Resumen ejecutivo

**Surface bien polished post Fase B/C** — los flows complejos (returnUrl, UserNotConfirmedException, email pre-fill) están implementados correctamente. Lo que falta:

1. 🔴 **Stats hardcoded misleading**: 2.4k / 180 / $15k no vienen de backend. Si esto sale a prod sin conectar, es false advertising.

2. 🔴 **Branding inconsistente**: GOLGANA (desktop) vs Polla Mundialista (mobile). Decisión de producto: ¿cuál es el nombre real?

3. 🟠 **UserNotConfirmedException silencioso**: el flow es brillante (Fase C) pero **el user no sabe por qué fue redirected**. Toast o banner que explique sería UX mejorada.

### 3 decisiones de diseño que cambian todo

1. **Stats reales o eliminarlos**: o se conectan al backend (endpoint público con counts agregados) o se quitan. La sección actual de stats es una promesa visual que no se cumple.

2. **Decidir branding**:
   - **Si "Golgana" es el brand principal**: mobile-head debe decir "Golgana" + logo image.
   - **Si "Polla Mundialista" es el producto**: desktop debe decir "Polla Mundialista" (no "GOLGANA · MUNDIAL 2026").
   - Consistente cross-platform.

3. **Mensajes contextuales para flows automáticos**:
   - UserNotConfirmedException → toast/banner "Tu cuenta no está confirmada, te llevamos al paso de verificación"
   - returnUrl detected → banner "Después de entrar te llevaremos a {path}"
   - Email pre-filled → hint "Email completado desde tu solicitud de reset"

### Cambios secundarios

- "Iniciar sesión" en lugar de "Entrar"
- Links reales Términos / Privacidad
- SVG eye icon en lugar de 👁 emoji
- SSO options (Google / Apple)
- Logo image en mobile head
- `Intl.NumberFormat` si se conservan stats
- Lockout indicator (security)
- Inline styles → design tokens
- Sin returnUrl en query but viene de form action → visual indicator
- Demo/guest access opcional

**Nota retrospectiva**: este surface es **uno de los más polished de la app** post Fase B/C. Bug-free, a11y wired, mobile-friendly, security correct. Los problemas son **decisiones de producto** (stats reales? branding?) más que technical debt. El UserNotConfirmedException silencioso es el único polish gap UX real.
