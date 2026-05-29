# Análisis UX: `/forgot-password` — ForgotPasswordComponent

> Surface #19 del walkthrough. Flujo de recuperación de contraseña.
> 2 steps: request code → reset password.
> Post Fase C: auto-login post-reset, con fallback a /login con email pre-llenado si race condition.

---

## 1. Identidad

- **Propósito**: permitir al user con email + acceso a inbox recuperar acceso cuando olvidó password.
- **Audiencia**: users existentes que olvidaron password.
- **Frecuencia**: muy baja por user (idealmente 0-1 veces).
- **Entry points**: link "¿Olvidaste?" desde `/login` (next to password label).

---

## 2. Estructura — state machine

```
                    ┌──────────────────────┐
   /forgot-password │  codeSent: false     │
   ────────────────►│                      │
                    │  step 1: request     │
                    │  - email input       │
                    │  - "Enviar código →" │
                    └──────────┬───────────┘
                               │ requestCode() OK
                               │ auth.forgotPassword(email)
                               │ startCooldown(60)
                               ▼
                    ┌──────────────────────┐
                    │  codeSent: true      │
                    │                      │
                    │  step 2: reset       │
                    │  - OTP 6 dígitos     │
                    │  - newPassword       │
                    │  - rules list        │
                    │  - resend (cooldown) │
                    └──────────┬───────────┘
                               │ confirmReset() OK
                               │ auth.confirmForgot(email, code, pwd)
                               │
                  ┌────────────┴────────────┐
                  │                         │
        auth.login() OK              auth.login() FAIL
                  │                         │
                  ▼                         ▼
              /home               /login?email=X
```

**2 steps con state simple (boolean `codeSent`)** vs register que usa enum.

---

## 3. Componentes desglosados

### 3.1 Brand panel

**Idéntico a `/login`** (logo height 32px, branding "GOLGANA · MUNDIAL 2026"):
- 🔴 Stats hardcoded
- 🟠 Branding GOLGANA vs Polla Mundialista en mobile-head
- 🟠 Términos · Privacidad text-only

**Diferencia con register**: logo height 32px (igual a login), no 40px (register). **Inconsistencia register vs forgot/login.**

### 3.2 Mobile head — SOLO en step 1

```
⚽
Polla Mundialista
Mundial 2026
```

**Análisis**:
- 🔴 **Logo emoji ⚽** — mismo anti-pattern.
- 🟠 **Solo se muestra en step 1** — el `@if (!codeSent())` que envuelve este bloque. En step 2 NO hay mobile-head. **Inconsistencia visual: step 1 tiene header de marca, step 2 está "desnudo"** en mobile.
- 🟠 Branding "Polla Mundialista" inconsistente con desktop "GOLGANA · MUNDIAL 2026".

### 3.3 Step 1 — request code

#### Head
```
‹ Volver a Entrar

RECUPERAR ACCESO
Olvidé mi contraseña
Ingresa tu email y te enviamos un código de 6 dígitos.
```

**Análisis**:
- ✓ Back link a `/login`.
- ✓ Kicker "RECUPERAR ACCESO" da contexto.
- ✓ Sub-text setea expectativa.
- 🟡 Kicker NO usa "PASO 1 DE 2" como register — perdió la oportunidad de mostrar progreso desde el inicio.
- 🟡 "Volver a Entrar" wording raro (mismo issue que register).

#### Campo Email

**Render**:
```
Email de tu cuenta
[tu@correo.com______________]
```

**Datos**:
- type=email, autocomplete=email
- inputmode=email, spellcheck=false, autocapitalize=off
- required

**Análisis**:
- ✓ Todos los attrs P3 done.
- ✓ Label "Email de tu cuenta" es más específico que "Email" (orientacional).
- 🟠 **Sin pre-fill desde queryParam** — si el user vino de `/login` después de fail, el login NO propaga el email a forgot-password (solo lo hace en sentido contrario). Asimetría UX.
- 🟡 Sin live validation (HTML5 native solo).
- 🟡 Sin info "Solo funciona si tu cuenta está confirmada".

#### Error block

- ✓ role="alert" (P1 done)
- ✓ Posición consistente

#### Submit

- "Enviando…" / "Enviar código →"
- ✓ Disabled hasta que email no esté vacío.
- 🟡 **Disabled solo por `!email`** — no valida que el email sea sintácticamente válido. User puede submitear "foo" y Cognito retornará error.
- 🟡 Inline style.

#### Bottom
```
¿La recordaste? Entrar
```

✓ Symmetric con register.
🟡 No propaga email back a login (asimetría con login → forgot: tampoco propaga).

### 3.4 Step 2 — reset password (codeSent: true)

#### Head
```
‹ Volver

PASO 2 DE 2
Nueva contraseña
Te enviamos un código de 6 dígitos a
foo@bar.com
```

**Análisis**:
- ✓ Email confirmación visual.
- ✓ Back button.
- ✓ Progress indicator "PASO 2 DE 2".
- 🟠 **"PASO 2 DE 2" inconsistente con step 1** que usa "RECUPERAR ACCESO" en lugar de "PASO 1 DE 2".
- 🟠 Back wording cambia: step 1 dice "Volver a Entrar", step 2 dice "Volver". Inconsistencia.

#### goBackToEmail

**Behavior**:
- codeSent → false
- otpDigits → empty
- newPassword → ''
- resetError → null

**Análisis**:
- ✓ **Limpia state completamente** al volver, evitando leak entre steps.
- ✓ Vs register donde `goBackToForm` NO limpia password (causa pérdida en register pero solo si user vuelve).
- 🟠 **Pero pierde el OTP que el user pudo haber tipeado parcialmente** — si tipeó 4 dígitos y vuelve solo para verificar el email, pierde el progreso del OTP. UX trade-off discutible.

#### OTP inputs (idéntico a register)

**Datos**:
- maxlength=1, inputmode=numeric, autocomplete=one-time-code
- aria-label per input
- onInput → next focus
- Backspace → prev focus
- Paste handler 6 dígitos

**Análisis**:
- ✓ Idéntico al de register — código duplicado pero comportamiento consistente.
- ✓ **Excelente UX** (autofocus, paste, backspace, iOS one-time-code).
- 🟠 **Misma falta de auto-submit** al 6º dígito.
- 🟠 **Misma falta de shake animation** en error.
- 🟠 **Código duplicado vs register** — los 3 handlers (onOtpInput/onOtpKey/onOtpPaste) son idénticos. Debería ser componente compartido `<app-otp-input>`.

#### Resend block

- ✓ Cooldown 60s con MM:SS.
- 🟠 Verde durante cooldown (mismo issue de color semantics).
- 🟠 Sin escalado.

#### Campo newPassword

**Render**:
```
Nueva contraseña
[••••••••__________________]
[password rules list component]
```

**Datos**:
- type=password (sin toggle eye en este surface)
- autocomplete=new-password
- minlength=8
- spellcheck=off, autocapitalize=off
- required

**Análisis**:
- ✓ Password rules list con feedback live.
- ✓ autocomplete=new-password correcto.
- 🟠 **SIN toggle eye** — register y login lo tienen, forgot-password NO. **Inconsistencia auth family**.
- 🟠 Sin "Confirma password" segundo campo — user puede tipear typo invisible y quedarse fuera de su cuenta otra vez. Sin double-entry, sin toggle eye → riesgo doble.

#### Error / Resend info

- ✓ role="alert" + role="status" para SR.
- 🟠 **resetError y resendInfo mostrados en mismo bloque** — si user reenvía después de error, ambos pueden mostrarse simultáneamente.

#### Submit

- "Actualizando…" / "Actualizar contraseña →"
- Disabled si: resetting || code.length !== 6 || !passwordIsValid()
- ✓ passwordIsValid usa `passwordPassesAllRules`.

#### Auto-login post-reset (Fase C)

**Behavior** (líneas 305-310):
```ts
try {
  await this.auth.login(this.email, this.newPassword);
  void this.router.navigate(['/home']);
} catch {
  void this.router.navigate(['/login'], { queryParams: { email: this.email } });
}
```

**Análisis**:
- ✓ **UX brillante**: user no tiene que re-loggearse después de reset.
- ✓ Fallback a `/login?email=X` si auto-login falla (race condition Cognito).
- ✓ Login.component.ts ya implementa el handler de `?email=` (visto en doc 17).
- 🟢 **Pattern correcto**: best-effort auto-login + graceful fallback.
- 🟡 Sin returnUrl propagation — si user vino de `/groups/join/:code → /login → /forgot-password`, después de reset va a `/home` o `/login` (sin returnUrl). **Deep-link se pierde aquí.**
- 🟡 Sin toast "Contraseña actualizada con éxito" antes del redirect — el redirect a /home es silencioso.

#### Tip

```
💡 Revisa tu spam si no lo encuentras. El código caduca en 15 minutos.
```

- 🟠 Emoji 💡 anti-pattern.
- 🟠 **El código caduca en 15 minutos vs register que dice 10 minutos** — inconsistencia documentada. Hay que verificar si Cognito realmente tiene 2 timeouts diferentes (forgot vs signUp) o si es inconsistencia en copy.

### 3.5 returnUrl handling

**Behavior**: ❌ **No implementado**.

- Step 1 no lee returnUrl
- Step 2 no propaga returnUrl al fallback /login
- Auto-login post-reset siempre redirige a /home

**Análisis**:
- 🟠 **Si user llegó de un deep-link** (ej. `/groups/join/:code` → /login → forgot-password), el returnUrl se pierde en forgot-password. **Asimétrico con login/register**.
- Para arreglarlo: leer returnUrl del queryParam en ngOnInit + propagarlo en el auto-login redirect.

---

## 4. Cross-cutting · hallazgos UX (priorizados)

🔴 **Stats hardcoded** (brand panel).

🔴 **returnUrl NO propagado** — deep-link se pierde si user pasa por forgot.

🟠 **Branding inconsistente** (Polla Mundialista vs GOLGANA).

🟠 **Mobile head solo en step 1** — step 2 sin header en mobile.

🟠 **Inconsistencia auth family**: forgot SIN toggle eye, register/login CON.

🟠 **Sin "Confirma password"** + sin toggle eye → riesgo doble de typo invisible.

🟠 **Código OTP duplicado** vs register (3 handlers idénticos).

🟠 **Kicker inconsistente**: step 1 "RECUPERAR ACCESO" vs step 2 "PASO 2 DE 2".

🟠 **Back wording inconsistente**: step 1 "Volver a Entrar" vs step 2 "Volver".

🟠 **Email NO pre-fill** desde queryParam (asimetría con login).

🟠 **Logo height inconsistente**: 32px aquí + login, 40px en register.

🟠 **Cooldown verde** confuso (mismo issue auth family).

🟠 **Disabled botón solo por `!email`** sin validar sintaxis.

🟠 **Sin auto-submit OTP** al 6º dígito.

🟠 **Sin shake animation** OTP error.

🟠 **Sin toast success** post-reset antes del redirect.

🟠 **Emoji 💡 tip + ⚽ mobile logo + ✓ pills + ✗ pills** anti-pattern.

🟠 **"15 minutos" vs register "10 minutos"** — inconsistencia documentada.

🟡 **Inline styles** (padding submit, logo height).

🟡 **No returnUrl propagation** al fallback /login.

🟡 **goBackToEmail pierde OTP parcial**.

🟡 **resetError + resendInfo simultáneos** posibles.

🟡 **Sin info "Solo funciona si cuenta confirmada"**.

🟡 **Sin live email validation**.

---

## 5. Antipatrones detectados

| Regla | Violación |
|---|---|
| **no-emoji-icons** | 💡 tip, ⚽ mobile logo |
| **Misleading data** | Stats hardcoded fake |
| **Pattern inconsistency** | Toggle eye en register/login, no en forgot |
| **Code duplication** | OTP handlers idénticos a register |
| **State leak** | Mobile head solo en step 1 |
| **Wording inconsistency** | "Volver a Entrar" vs "Volver" |
| **Progress indicator** | Step 1 sin "PASO 1 DE 2" |
| **Deep-link continuity** | returnUrl no propagado |
| **Color semantics** | Cooldown verde |
| **Validation gap** | Email sin sintáctico validation |
| **Confirmation gap** | Sin "Confirma password" |
| **Inline styles** | Logo, submit |

---

## 6. Anclas para el redesign

### Core

1. **2-step state simple** (boolean codeSent)
2. **OTP 6-dígitos** (idéntico mecanismo a register)
3. **Password rules list** componente
4. **Auto-login post-reset** con fallback (Fase C)
5. **Cooldown 60s** + resend

### Quitar

- Stats hardcoded
- Emojis (⚽, 💡, ✓, ✗)
- Inline styles → tokens

### Agregar

- **returnUrl propagation** end-to-end (lee del queryParam + propaga al /home y /login fallback)
- **Toggle eye** en newPassword (consistente con register/login)
- **"Confirma password"** segundo campo (mitigar typo invisible)
- **Toast success** "Contraseña actualizada" antes del redirect
- **Auto-submit OTP** al 6º dígito
- **Shake animation** OTP error
- **Cooldown escalado** + color neutro
- **Email pre-fill** desde queryParam (si vino de /login con email tipeado)
- **Live email validation** (regex simple)
- **Progress indicator** "PASO 1 DE 2" en step 1
- **Mobile head en step 2** también
- **Back wording consistente** ("Volver" en ambos)
- **OTP shared component** `<app-otp-input>` (eliminar duplicación con register)
- **Logo height unificado** (32px o 40px, decidir)
- **Verificar "15 min vs 10 min"** y unificar copy si es inconsistencia
- **Separar resetError de resendInfo** (no mostrar simultáneamente)
- **Info hint** "Cuenta debe estar confirmada"

---

## 7. Resumen ejecutivo

**Flujo simple y bien resuelto** post Fase C. El auto-login + fallback es UX excelente. Los gaps principales:

1. 🔴 **returnUrl propagation faltante** — esto es el más importante. Si user llegó de un deep-link (`/groups/join/:code` → login → forgot), después del reset va a /home y pierde el contexto. **Arreglar es 4 líneas**: leer returnUrl del queryParam en ngOnInit + propagarlo en el navigate post-login.

2. 🟠 **Inconsistencia auth family**: forgot SIN toggle eye, register/login CON. Sin "Confirma password" tampoco. **Doble riesgo de typo invisible** en el campo donde más importa que el user no se equivoque.

3. 🟠 **Mobile head solo en step 1** — step 2 está visualmente "desnudo" en mobile. Inconsistencia menor pero notable.

### 3 decisiones de diseño que cambian todo

1. **returnUrl handling completo** en auth family — login, register, forgot, todos deben leer y propagar `returnUrl` para mantener deep-link end-to-end. Forgot es el eslabón roto.

2. **OTP shared component**: register y forgot tienen los **mismos 3 handlers** (onOtpInput, onOtpKey, onOtpPaste) + el mismo template HTML. Extraer a `<app-otp-input>` con `(complete)="..."` para auto-submit. Reduce código y unifica UX.

3. **Confirmación de password en el step más crítico**: forgot-password es el ÚNICO surface donde el user está cambiando su password de forma "ciega" (sin verificación) — es el surface que MÁS necesita toggle eye + confirmar. La inversión es 1 campo + 1 botón → riesgo de lock-out reducido significativamente.

### Cambios secundarios

- Stats hardcoded (mismo que login/register)
- Auto-submit OTP al 6º
- Shake animation error
- Cooldown escalado + color neutro
- Email pre-fill desde queryParam
- Live email validation
- "PASO 1 DE 2" en step 1
- Mobile head en step 2
- Back wording consistente
- Logo height unificado
- Verificar "15 min vs 10 min" Cognito
- Separar errors de info messages
- Toast success post-reset
- Info "cuenta debe estar confirmada"
- Emojis → SVG

**Nota retrospectiva**: este surface tiene la **menor complejidad técnica** del trío auth pero hereda los mismos issues del brand panel + emoji icons + cooldown verde. El gap funcional más serio es `returnUrl propagation` — fácil de arreglar pero importante para no perder deep-links.
