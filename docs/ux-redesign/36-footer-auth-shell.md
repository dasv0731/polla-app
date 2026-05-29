# Análisis UX: Footer + Auth Shell — FooterComponent + AuthShellComponent

> Surface #36 (último del walkthrough end-user). 2 wrappers wrap-up.
> **Footer**: 4 columnas (brand + Polla + Cuenta + Legal) mountado en shell.
> **Auth-shell**: wrapper para auth pages NO usado actualmente (login/register/forgot tienen su propio layout).

---

## 1. Identidades

### Footer
- **Propósito**: navegación secundaria + legal + brand + logout escape.
- **Audiencia**: users autenticados que llegan al fondo de la pantalla.
- **Frecuencia**: visible en TODAS las pantallas autenticadas (mountado en shell).

### Auth-shell
- **Propósito**: wrapper standalone para auth pages — header logo + back link + main content slot + footer minimal.
- **Audiencia**: ¿no usado? Los auth surfaces (login/register/forgot) implementan su propio brand-panel.
- **Frecuencia**: 0 actual (zombie potential).

---

## 2. FooterComponent — desglose

### 2.1 Estructura

```
┌──────────────────────────────────────────────────────────────┐
│ [Golgana logo]   Polla         Cuenta        Legal           │
│                                                              │
│ Polla Mundialista  Reglas      Editar perfil  Privacidad     │
│ — sub-módulo de    Ranking     Mis grupos     Términos       │
│ Golgana para la    global      Cerrar sesión  Golgana        │
│ FIFA World Cup     Mis picks                                 │
│ 2026. Gratis, sin  Tabla grupos                              │
│ gambling, sin      Bracket                                    │
│ trampas.                                                     │
├──────────────────────────────────────────────────────────────┤
│ © 2026 Golgana — Polla Mundialista                           │
└──────────────────────────────────────────────────────────────┘
```

**4 columnas grid**:
1. Brand (logo + text)
2. Polla (5 links internos/externos)
3. Cuenta (3 links + logout button)
4. Legal (3 external links)

### 2.2 Brand column

**Render**:
```
[Golgana logo]
Polla Mundialista — sub-módulo de Golgana para la FIFA World Cup 2026.
Gratis, sin gambling, sin trampas.
```

**Análisis**:
- ✓ Logo image real (no emoji).
- ✓ Text identifica sub-relación brand ("sub-módulo de Golgana").
- ✓ **Brand promise** explícita: "Gratis, sin gambling, sin trampas" — important para LATAM (trust).
- ✓ Link external a golgana.net inline.
- 🔴 **"Polla Mundialista" + "Golgana"** — **PRESENCIA DE AMBOS NAMES** en mismo párrafo. Confirma branding chaos pero al menos clarifica relación.
- 🟠 **Inline style `color: var(--color-primary-green)`** en `<a>` golgana.net — debería ser clase CSS.

### 2.3 Polla column

**Links**:
- "Reglas" → `https://polla.golgana.net/reglas` (external)
- "Ranking global" → `/ranking` (interno)
- "Mis picks" → `/picks`
- "Tabla de grupos" → `/picks/group-stage`
- "Bracket" → `/picks/bracket`

**Análisis**:
- ✓ Reglas como external link (subdomain polla.golgana.net).
- ✓ 4 links internos a features clave.
- 🟠 **External link "Reglas" SIN `rel="noopener"`** — anti-pattern security.
- 🟠 **"Ranking global" + "Mis picks" + "Bracket"** — same surfaces accesibles desde sidebar. **Duplicación de navegación**.
- 🟡 Sin "Comodines" (sub-feature también accesible).
- 🟡 Sin "Notificaciones".

### 2.4 Cuenta column

**Links**:
- "Editar perfil" → `/profile`
- "Mis grupos" → `/groups`
- "Cerrar sesión" → **`<button>` con onClick logout**

**Análisis**:
- ✓ **Logout como button**, no link (correcto semánticamente).
- ✓ ConfirmDialog para logout (P0 done).
- 🟠 **"Editar perfil" link a `/profile`** — pero edit-profile es MODAL desde /profile. Wording confunde: clickeas "Editar perfil" pero te lleva a vista profile no a modal edit.
- 🟠 **Logout duplicado**: footer + nav.component zombie dropdown desktop + (sidebar?). 3 lugares para logout.

### 2.5 Legal column

**Links**:
- "Privacidad" → `https://polla.golgana.net/privacidad` (external)
- "Términos" → `https://polla.golgana.net/terminos` (external)
- "Golgana" → `https://golgana.net` (external)

**Análisis**:
- ✓ **Links reales a privacidad/términos** (resuelve el `href="#"` issue de login/register/forgot/group-join footer)
- ✓ `rel="noopener"` correcto.
- 🟢 **Pattern Legal correcto** — primera vez en walkthrough que vemos links reales para legal.

### 2.6 Divider + Copy

**Render**:
```
─────────────────────────────────────
© 2026 Golgana — Polla Mundialista
```

**Análisis**:
- ✓ Year computed `new Date().getFullYear()` — dynamic.
- 🟠 **Hardcoded "2026"** vs computed `{{ year }}` — line 49 SÍ usa `{{ year }}`, mismo OK.

Actually re-leyendo: el template usa `{{ year }}`, año dinámico. ✓

### 2.7 logout()

**Behavior**:
1. ConfirmDialog "¿Querés cerrar sesión?"
2. auth.logout()
3. Navigate `/login`

**Análisis**:
- ✓ Double-confirm pattern correcto.
- 🔴 **DUPLICACIÓN con nav.component.ts logout**: mismo código, misma confirmDialog, mismo wording. **Idéntico**.
- 🟠 **Voseo "Querés / Vas a"** — 12+ instancia voseo documentada en walkthrough.
- 🟠 **Sin `danger: true`** en confirmDialog — destructive action de sesión debería ser red.

---

## 3. AuthShellComponent — desglose

### 3.1 Estructura

```
┌──────────────────────────────────────┐
│ HEADER                               │
│ [Logo Golgana]    ← Volver al inicio │
├──────────────────────────────────────┤
│                                      │
│        <ng-content />               │
│        (auth content slot)           │
│                                      │
├──────────────────────────────────────┤
│ © 2026 Golgana                       │
└──────────────────────────────────────┘
```

**Componentes**:
- Header con logo + back link
- Main slot con `<ng-content />`
- Footer minimal con copy

### 3.2 Análisis estructural

**Comparado con login/register/forgot que NO usan auth-shell**:
- Esos surfaces implementan su propio brand panel (200px) + form panel
- Este auth-shell es **single-column** centered

**Análisis**:
- 🔴 **AUTH-SHELL NO ESTÁ USADO**: los 3 surfaces auth (login/register/forgot) NO importan este wrapper. Implementan su propio `<div class="auth-shell">` con brand-panel inside.
- 🔴 **¿Zombie code?**: el componente existe pero ningún surface lo consume. ¿Quizás usado por surface no-documented?

### 3.3 Header

**Render**:
```
[Golgana logo]     ← Volver al inicio
```

**Análisis**:
- ✓ Logo image real.
- ✓ Back link a `/login`.
- 🔴 **`aria-label="Polla Mundial 2026"`** en logo link mientras alt="Golgana". **Mismo issue documentado en group-join doc 20**.
- 🟠 **"Volver al inicio"** — pero el link va a `/login` (no a `/home` o landing). Wording engaña.
- 🟠 **`← unicode arrow** anti-pattern.

### 3.4 Footer minimal

**Render**:
```
© 2026 Golgana
```

**Análisis**:
- ✓ `translate="no"` en "Golgana" (brand preservation).
- 🔴 **Year 2026 hardcoded** — vs footer principal que usa `{{ year }}`.
- 🟠 Sin links legales (Privacidad/Términos).

### 3.5 Comparación con auth surfaces actuales

**Login/Register/Forgot actuales**:
- Brand panel desktop 50% width
- Form panel 50% width
- Mobile: form panel only con mobile-head emoji ⚽

**Auth-shell**:
- Single column centered
- Logo header + back link + content slot + footer

**Análisis**:
- 🔴 **Auth-shell parece DISEÑO INICIAL** que fue **refactorizado** a la versión actual brand panel + form panel.
- 🔴 **Probable migration debt**: nadie limpió el componente original.

---

## 4. Cross-cutting · hallazgos UX (priorizados)

### Footer

🔴 **External "Reglas" SIN `rel="noopener"`** — security.

🔴 **Logout duplicado** entre footer + nav zombie + sidebar potential.

🟠 **"Editar perfil" link a `/profile`** confunde (no abre modal directo).

🟠 **Voseo logout** "Querés / Vas a" (12+ instancia).

🟠 **Sin `danger: true`** logout confirm.

🟠 **Inline style** golgana.net link.

🟠 **Duplicación nav surfaces** (Ranking, Picks, Bracket también en sidebar).

🟠 **Branding "Polla Mundialista" + "Golgana"** ambos en footer (al menos clarifica relación).

🟡 **Sin Comodines + Notificaciones** en columna Polla.

🟢 **Legal links reales** Privacidad/Términos (resuelve `href="#"` de auth surfaces).

🟢 **Brand promise** "Gratis, sin gambling, sin trampas".

🟢 **Logout `<button>`** semantic.

🟢 **Year dinámico** `{{ year }}`.

🟢 **`rel="noopener"` en legal**.

### Auth-shell

🔴 **NO USADO actualmente** — zombie code probable.

🔴 **Year hardcoded "2026"** (footer principal lo computa).

🔴 **`aria-label "Polla Mundial 2026"` vs `alt="Golgana"`** inconsistencia.

🟠 **"Volver al inicio" → `/login`** engaña.

🟠 **`← unicode arrow** anti-pattern.

🟠 **Footer minimal** sin links legales.

🟢 **`translate="no"`** en brand.

🟢 **`<ng-content />` slot pattern**.

🟢 **Pattern wrapper standalone** correcto en concepto.

---

## 5. Antipatrones detectados

### Footer

| Regla | Violación |
|---|---|
| **security `rel`** | External "Reglas" missing |
| **Code duplication** | Logout en footer + nav zombie |
| **Wording link** | "Editar perfil" → vista profile |
| **i18n consistency** | Voseo "Querés / Vas a" |
| **danger missing** | Logout sin red flag |
| **Inline style** | golgana.net color |

### Auth-shell

| Regla | Violación |
|---|---|
| **Dead component** | NO usado actualmente |
| **Year hardcoded** | "2026" vs dinámico |
| **A11y label mismatch** | aria-label vs alt |
| **Misleading link** | "Volver al inicio" → /login |
| **no-emoji-icons** | ← arrow |

---

## 6. Anclas para el redesign

### Footer Core

1. **4 columnas grid** (brand + Polla + Cuenta + Legal)
2. **Brand text explicit** sub-relación Golgana
3. **Logout button** con ConfirmDialog
4. **Legal links reales** (Privacidad/Términos/Golgana)
5. **Year dinámico**
6. **`rel="noopener"`** en legal

### Footer Quitar

- Logout duplicación (consolidar con sidebar/nav)
- Voseo logout wording
- Inline style golgana.net

### Footer Agregar

- **External "Reglas" con `rel="noopener noreferrer"`**
- **`danger: true`** en logout confirm
- **Comodines + Notificaciones** en columna Polla (opcional)
- **"Editar perfil" wording**: o cambiar link a abrir modal directo, o cambiar wording a "Mi perfil"
- **CSS class** para golgana.net link (no inline style)
- **Tone unificado** (decisión voseo/tú)

### Auth-shell

🔴 **Decidir destino**: usar o eliminar.

**Opción A — USAR**: refactorizar login/register/forgot para que importen `<app-auth-shell>`. Eliminaría duplicación brand-panel/form-panel en cada surface.

**Opción B — ELIMINAR**: confirmar que no se usa, eliminar archivo. Reduce dead code.

Si OPCIÓN A:
- Año dinámico `{{ year }}`
- aria-label consistente con alt
- "Volver al inicio" → "Volver" o "← Login"
- ← arrow → SVG icon
- Footer minimal con links legales reales

---

## 7. Resumen ejecutivo

### Footer

**Surface funcional + completo**: 4 columnas con nav secundaria, legal links REALES (único surface del walkthrough con links legales reales), brand text con promise "Gratis, sin gambling, sin trampas", logout con ConfirmDialog. Issues:

1. 🔴 **External "Reglas" sin `rel="noopener"`** — security gap menor.
2. 🔴 **Logout duplicado** con nav.component.ts (mismo código exacto). **Refactor obvious**: extraer a service `logout()` method.
3. 🟠 **"Editar perfil" link engaña** — va a vista profile, no abre modal edit.

### Auth-shell

**Componente DEAD probable**: existe pero los 3 auth surfaces (login/register/forgot) implementan su propio layout inline en lugar de importarlo.

1. 🔴 **No usado actualmente** — refactor candidate o eliminar.
2. 🔴 **Year hardcoded "2026"** vs footer principal dinámico.
3. 🔴 **`aria-label` mismatch** con `alt`.

### 3 decisiones de diseño que cambian todo

1. **Consolidar logout method**: AuthService.logoutWithConfirm() que centralice ConfirmDialog + logout + navigate. Footer + nav + sidebar consumen el mismo. Elimina ~10 líneas duplicadas.

2. **Decidir auth-shell**: usar para refactor de login/register/forgot O eliminar. Si refactor:
   - Login/register/forgot importan `<app-auth-shell>`
   - Brand panel desktop sigue siendo prop específico de cada surface
   - Footer + header + Volver link común
   - Reduce duplicación cross-surface auth significativamente

3. **"Editar perfil" wording**: o link directo al modal (con queryParam `?edit=1`) o cambiar wording a "Mi perfil" (más honesto sobre destino).

### Cambios secundarios

- `rel="noopener noreferrer"` external Reglas
- `danger: true` logout
- Voseo cleanup
- CSS class golgana.net link
- aria-label vs alt fix
- Year dinámico auth-shell
- "Volver al inicio" wording
- ← → SVG

**Nota retrospectiva**: el footer es el surface **MÁS COMPLETO** legalmente del walkthrough — único con links reales para Privacidad/Términos. Resuelve los `href="#"` documentados en login/register/forgot/group-join. **Inconsistencia auth vs autenticado** confirmada (footer público completo, auth surfaces text-only fake).

Auth-shell es **migration debt evidente** — el design v2 lo usaba, el v3 reorganizó pero nadie limpió.
