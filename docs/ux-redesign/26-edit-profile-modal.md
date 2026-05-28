# Análisis UX: Edit Profile Modal — EditProfileModalComponent

> Surface #26 del walkthrough. Modal "Editar perfil" disparado desde `/profile`.
> 5 secciones: foto + handle (read-only) + país + bio + cambiar password.
> Initial section `password` permite deep-link al sub-form.

---

## 1. Identidad

- **Propósito**: editar campos de profile (avatar, country, bio) + cambiar password sin salir del shell.
- **Audiencia**: cualquier user autenticado.
- **Frecuencia**: baja — la mayoría edita una vez post-onboarding.
- **Entry points**: botón "Editar perfil" desde `/profile`. Posiblemente desde otros (preferences, settings).

---

## 2. Estructura — 5 secciones lineales

```
   ┌────────────────────────────────────────┐
   │  Editar perfil                    [✕]  │
   ├────────────────────────────────────────┤
   │  FOTO DE PERFIL                        │
   │  [avatar lg] [Cambiar/Subir foto]      │
   │              JPG/PNG, hasta 5 MB.      │
   ├────────────────────────────────────────┤
   │  NOMBRE DE USUARIO                     │
   │  @handle                                │
   │  El nombre de usuario no se puede      │
   │  cambiar.                              │
   ├────────────────────────────────────────┤
   │  PAÍS                                  │
   │  [select: — Sin país —]                │
   │  Aparece como bandera al lado de tu    │
   │  nombre en el ranking.                 │
   ├────────────────────────────────────────┤
   │  BIO                                   │
   │  [textarea]                            │
   │  N / 200                                │
   ├────────────────────────────────────────┤
   │  (Si profileDirty)                     │
   │  [error?]                              │
   │  [Guardar país y bio]                  │
   ├────────────────────────────────────────┤
   │  CAMBIAR CONTRASEÑA                    │
   │  ── Estado collapsed ──                 │
   │  [Cambiar contraseña]                   │
   │  ── Estado expanded ──                  │
   │  [Contraseña actual]                    │
   │  [Nueva contraseña]                     │
   │  [Repetir nueva contraseña]             │
   │  [error?]                               │
   │  [Cancelar] [Cambiar contraseña]        │
   ├────────────────────────────────────────┤
   │                          [Cerrar]      │
   └────────────────────────────────────────┘
```

**5 secciones discretas + footer**. Cada sección tiene su propia save logic (avatar autosave, profile manual save, password manual save).

---

## 3. Componentes desglosados

### 3.1 Modal shell

**Render**:
```css
.edit-profile-overlay {
  background: rgba(0, 0, 0, 0.55);
}
.edit-profile-modal {
  max-width: 480px;
  max-height: 90vh;
  overflow-y: auto;
}
```

**A11y**:
- ✓ `role="dialog"`, `aria-modal="true"`, `aria-labelledby="ep-title"`
- ✓ `cdkTrapFocus + autoCapture` (P0 done)
- ✓ Escape close
- ✓ Backdrop click close via `__close-area`

**Análisis**:
- ✓ A11y core completo.
- 🟠 **Backdrop solid 55% opacity** vs otros modales que usan `0.75 + blur`. **Inconsistencia visual cross-modal**.
- 🟠 **No usa la clase `.picks-modal`** sino `.edit-profile-overlay/modal` — **otro sistema visual paralelo**. Crea inconsistencia con group-actions/randomizer/redeem/trivia modales.
- 🟠 **Max-height 90vh + overflow-y** — buen comportamiento mobile.
- 🟠 **Sin animation entrada/salida**.
- 🟡 Inline `style="display: none"` en file input — funcional pero no token.

### 3.2 Header

**Render**:
```
Editar perfil                                  [✕]
```

**Análisis**:
- ✓ Title simple.
- 🟠 **`✕` close button** unicode anti-pattern (consistente con resto).
- 🟠 **Sin sub-text** (vs group-actions / redeem que tienen meta line).
- 🟡 Title uppercase via CSS — diferente de otros modales que NO uppercasean el h2.

### 3.3 Sección Foto de perfil

**Render**:
```
FOTO DE PERFIL

[avatar lg]  [Cambiar / Subir foto]
             JPG/PNG, hasta 5 MB.
```

**Behavior**:
- File input nativo hidden, label clickeable
- onFileSelected:
  1. Validate ≤ 5 MB
  2. uploadData a S3 `users/{sub}/avatar-{Date.now()}.{ext}`
  3. updateUser con avatarKey
  4. refreshAvatarKey en AuthService
  5. Toast success
- pendingAvatarKey signal para preview optimista

**Análisis**:
- ✓ **Auto-save al seleccionar** — UX inmediato sin botón intermedio.
- ✓ Loading state "Subiendo…" en el label.
- ✓ Cambio dinámico label "Cambiar foto" / "Subir foto" según si ya tenía.
- ✓ Toast feedback + error handling.
- ✓ File reset post-upload (`input.value = ''`).
- 🔴 **Sin drag & drop** — UX mobile/desktop standard.
- 🔴 **Sin crop / rotate / resize** — user sube foto cualquier proporción, S3 la guarda raw. Avatar puede verse desproporcionado.
- 🔴 **Sin opción "Eliminar foto"** — si user quiere volver al default, no puede.
- 🔴 **Sin progress bar** durante upload (solo label "Subiendo…").
- 🟠 **5 MB hardcoded** en frontend — debería venir del backend.
- 🟠 **Validation cliente solo size**: NO type, NO dimensions. Si user sube `.svg` (que tiene type `image/svg+xml`), pasa el accept pero puede tener XSS.
- 🟠 **`accept="image/*"`** muy permisivo — debería ser `image/jpeg,image/png,image/webp`.
- 🟠 **Sin invalidación de avatares anteriores en S3** — cada upload deja archivo huérfano (`avatar-{timestamp}.png` × N). **Storage cost gap**.
- 🟠 **`console.error` en prod** (líneas 360, 370).
- 🟡 Sin "Camera capture" option (mobile UX).

### 3.4 Sección Nombre de usuario (read-only)

**Render**:
```
NOMBRE DE USUARIO

@handle
El nombre de usuario no se puede cambiar.
```

**Análisis**:
- ✓ Read-only explícito con mensaje.
- ✓ Strong display del handle.
- 🟠 **"no se puede cambiar"** sin explicar por qué — molesto. UX standard sería contextualizar ("Esta es tu identidad pública en el ranking. Si necesitas cambiarlo, contacta soporte").
- 🟠 **Sin link contacto soporte** si user necesita cambiar (edge case real: usurpación, error de signup, etc.).
- 🟠 **Sin "copy @handle"** botón.

### 3.5 Sección País

**Render**:
```
PAÍS

[— Sin país —    ▾]
🇦🇷 Argentina
🇧🇷 Brasil
🇨🇱 Chile
...

Aparece como bandera al lado de tu nombre en el ranking.
```

**Behavior**:
- `<select>` con COUNTRY_OPTIONS de constants
- `flagFromCountryCode(code)` retorna emoji bandera
- ngModelChange → markDirty()

**Análisis**:
- ✓ Hint explica el valor (visible en ranking).
- ✓ Default option "— Sin país —" permite null.
- 🔴 **Banderas como emoji unicode** 🇦🇷 — depende del browser. En Windows muchas banderas no se renderizan (default fallback es "AR" texto). **Inconsistencia cross-platform grave**.
- 🟠 **`<select>` nativo** — mobile renderiza picker nativo (good) pero desktop no tiene search. Si lista es larga (200+ countries), scroll painful.
- 🟠 **Sin búsqueda** en el dropdown.
- 🟠 **Sin geolocation default** — podrías pre-seleccionar por IP.
- 🟡 Sin "más populares" agrupados arriba.

### 3.6 Sección Bio

**Render**:
```
BIO

[textarea]
Una frase corta sobre vos (max 200)
12 / 200
```

**Behavior**:
- maxlength=200 nativo
- rows=3
- Character counter live "{{ bio.length }} / 200"

**Análisis**:
- ✓ **Character counter live** — UX standard correcto.
- ✓ Placeholder con guía.
- 🟠 **"sobre vos" voseo** — sexta+ instancia documentada.
- 🟠 **Sin markdown** soporte ni preview.
- 🟠 **Sin word filter** — user puede meter palabrotas, links spam, etc.
- 🟠 **Sin link preview** si user mete URL.
- 🟡 Sin emoji picker.

### 3.7 Save bar (profileDirty)

**Render** (visible solo si dirty):
```
[error?]
[Guardar país y bio]
```

**Behavior**:
- Aparece cuando country o bio cambia
- saveProfile() → updateUser → refreshProfileFields → toast → profileDirty=false
- Validation: bio.length ≤ 200 (redundante con maxlength)

**Análisis**:
- ✓ **Save bar contextual** — solo cuando hay cambios pendientes.
- ✓ Error block local.
- ✓ Loading "Guardando…".
- 🟠 **Wording "Guardar país y bio"** — específico pero raro. "Guardar cambios" más conciso.
- 🟠 **`profileDirty` no incluye avatar** — avatar se autoguarda al subir. **Inconsistencia mental modal**: algunos campos auto-save, otros manual-save.
- 🟠 **Sin Discard button** — si user empezó a editar y arrepiente, debe cerrar el modal (pero los datos siguen "marcados" como dirty internamente).
- 🟠 **Sin CanDeactivate guard** — si user cierra modal con cambios sin guardar, **pierde silenciosamente**. Solo el group-edit tiene guard.

### 3.8 Sección Cambiar contraseña — collapsed

**Render**:
```
CAMBIAR CONTRASEÑA

[Cambiar contraseña]
```

**Análisis**:
- ✓ Disclosure progresivo — no muestra form hasta que user clickea.
- 🟠 **CTA dice "Cambiar contraseña"** — mismo wording que el botón submit del expanded. Confuso.

### 3.9 Sección Cambiar contraseña — expanded

**Render**:
```
CAMBIAR CONTRASEÑA

CONTRASEÑA ACTUAL
[••••••••]

NUEVA CONTRASEÑA
[••••••••]

REPETIR NUEVA CONTRASEÑA
[••••••••]

[error? role=alert]

[Cancelar] [Cambiar contraseña]
```

**Datos**:
- autocomplete=current-password / new-password / new-password
- spellcheck=false, autocapitalize=off
- minlength=8

**Análisis**:
- ✓ **3 fields con autocomplete correcto** (P3 done).
- ✓ **role="alert"** en pwdError (P1 done).
- ✓ Confirmation field — patrón crítico para password change.
- ✓ canSubmitPwd validation: old≥1, new≥8, new===confirm.
- ✓ Error handler distingue:
  - "incorrect" → contraseña actual incorrecta
  - "did not conform" → nueva no cumple política
  - else → mensaje raw
- 🔴 **Sin toggle eye** en ningún password field — inconsistente con register/login que SÍ tienen.
- 🟠 **Sin PasswordRulesListComponent** — vs register/forgot que SÍ usan el componente compartido. **Sin feedback live de qué falta**.
- 🟠 **"8+ caracteres, mayúscula, minúscula y número"** hardcoded en error msg — si la política cambia, este texto miente.
- 🟠 **"Repetir nueva contraseña"** — sin live validation de mismatch (solo errors post-submit).
- 🟠 **Sin live validation pwdNew === pwdConfirm** — botón disabled pero sin hint visual.

### 3.10 Footer

**Render**:
```
                                            [Cerrar]
```

**Análisis**:
- 🟠 **Solo botón Cerrar** — sin "Guardar todo" o similar. Cada sección guarda independiente.
- 🟠 **"Cerrar"** descarta sin warning si hay cambios sin guardar.

---

## 4. Cross-cutting · hallazgos UX (priorizados)

🔴 **Sin drag & drop / crop / resize / eliminar / progress** en avatar upload.

🔴 **Banderas como emoji unicode** — render inconsistente cross-platform.

🔴 **Sin toggle eye** en password fields.

🔴 **Sin PasswordRulesListComponent** (inconsistente con register/forgot).

🔴 **Sin CanDeactivate guard** — cambios sin guardar se pierden silencioso al cerrar.

🟠 **Backdrop diferente** vs picks-modal pattern.

🟠 **Sistema visual paralelo** `.edit-profile-modal` vs `.picks-modal`.

🟠 **`✕` close** unicode.

🟠 **Sin sub-text** en header.

🟠 **Sin drag & drop avatar**.

🟠 **5 MB hardcoded** frontend.

🟠 **`accept="image/*"`** muy permisivo (riesgo SVG XSS).

🟠 **S3 huérfanos** (storage cost gap).

🟠 **`console.error` en prod**.

🟠 **"no se puede cambiar"** sin explicar / sin link soporte.

🟠 **Sin "copy @handle"** botón.

🟠 **`<select>` nativo sin búsqueda** countries.

🟠 **Sin geolocation default** país.

🟠 **"sobre vos" voseo**.

🟠 **Sin markdown / word filter** bio.

🟠 **Wording "Guardar país y bio"** específico.

🟠 **Avatar auto-save vs profile/password manual-save** — inconsistencia mental modal.

🟠 **Sin Discard button**.

🟠 **CTA "Cambiar contraseña" duplicado** (collapsed + expanded submit).

🟠 **Sin live mismatch validation** pwdNew vs pwdConfirm.

🟠 **Política password hardcoded** en error msg.

🟡 **Inline styles** file input.

🟡 **Sin animation modal**.

🟡 **Sin camera capture** mobile.

🟡 **Sin "más populares"** countries.

🟢 **Auto-save avatar** rápido.

🟢 **Validation cliente size** (al menos algo).

🟢 **Character counter live** bio.

🟢 **Save bar contextual** dirty-aware.

🟢 **Disclosure progresivo** password form.

🟢 **role="alert"** en pwd error.

🟢 **autocomplete correct** password fields.

🟢 **Confirmation field** password.

🟢 **Cognito error mapping** (incorrect / conform / raw).

---

## 5. Antipatrones detectados

| Regla | Violación |
|---|---|
| **no-emoji-icons** | ✕ close, banderas country |
| **Cross-browser emoji rendering** | 🇦🇷🇧🇷 inconsistente Windows |
| **Visual system fragmentation** | .picks-modal vs .edit-profile-modal |
| **Image upload UX** | Sin drag/drop/crop/progress/delete |
| **Storage cost leak** | Avatares huérfanos S3 |
| **XSS risk** | accept image/* permite SVG |
| **State loss** | Sin CanDeactivate guard |
| **Inconsistencia patrón password** | Sin eye toggle + sin rules list (vs register/forgot/login) |
| **Hardcoded política** | "8+ caracteres, mayúscula..." en error |
| **Auto vs manual save mix** | Avatar auto, profile manual = mental load |
| **i18n consistency** | "sobre vos" voseo |
| **No backend-driven limits** | 5 MB hardcoded |
| **Read-only sin recourse** | "no se puede cambiar" sin soporte link |
| **console.error en prod** | Telemetry gap |
| **Native select sin search** | UX desktop pobre |

---

## 6. Anclas para el redesign

### Core

1. **5 secciones discretas**: foto / handle read-only / país / bio / password
2. **Avatar auto-save** post-upload
3. **Profile manual-save** con dirty signal
4. **Password manual-save** con disclosure progresivo
5. **A11y core** (focus trap + Escape + backdrop)
6. **Validation cliente** size + form
7. **Cognito error mapping**
8. **initialSection deep-link** a 'password'

### Quitar

- ✕ unicode → SVG
- Banderas emoji → SVG flags (CountryFlag component existing?)
- "sobre vos" voseo
- Política password hardcoded en error
- Sistema visual paralelo → unificar con picks-modal
- `console.error` → telemetry
- Inline styles → tokens

### Agregar

- 🔴 **Drag & drop avatar zone**
- 🔴 **Crop / resize** post-upload (react-easy-crop o similar)
- 🔴 **Progress bar** durante upload
- 🔴 **Eliminar foto** botón
- 🔴 **Toggle eye** los 3 password fields
- 🔴 **PasswordRulesListComponent** reutilizado
- 🔴 **CanDeactivate** o "¿Descartar cambios sin guardar?" prompt al cerrar
- **accept** restrictivo a JPG/PNG/WebP
- **5 MB desde backend** config
- **S3 cleanup** policy avatares previos (delete old en updateUser)
- **Validación dimensions** mínimas/máximas
- **Camera capture** opción mobile
- **Searchable country picker** (combobox o nuevo component)
- **Geolocation default** sugerencia
- **"Copy @handle"** botón en read-only
- **Link soporte** "Si necesitas cambiar tu handle"
- **Live mismatch validation** pwdNew vs pwdConfirm con hint inline
- **Discard button** en save bar
- **"Guardar cambios"** wording genérico
- **Sub-text en header** ("Tu perfil público")
- **Animation entrada/salida** modal
- **Word filter / link detection** bio

### Considerar

- **Unificar visual con picks-modal** (backdrop blur + radius + padding consistentes)
- **Single save button al footer** opcional vs save por sección
- **Multi-step / wizard** si crece a más secciones

---

## 7. Resumen ejecutivo

**Modal funcional con buena estructura base** — 5 secciones discretas, dirty signal, disclosure progresivo password, autocomplete correctos. Lo que falla:

1. 🔴 **Avatar upload UX pobre**: sin drag&drop, sin crop, sin resize, sin progress bar, sin opción eliminar. Es **el feature más visible del modal** y el menos pulido. UX standard moderno require todo lo anterior.

2. 🔴 **Banderas emoji**: 🇦🇷🇧🇷🇨🇱 dependen del browser. En Windows típicamente NO renderizan (fallback "AR", "BR", "CL" texto). Si el sistema de país muestra bandera en el ranking, **toda la app sufre el mismo problema**.

3. 🔴 **Password change inconsistente con auth family**: register/forgot/login tienen toggle eye + PasswordRulesListComponent. Este modal NO. Crea fricción y UX inconsistente para el campo MÁS importante.

4. 🔴 **Sin CanDeactivate guard**: si user edita country/bio + clickea Cerrar sin guardar, **pierde cambios silencioso**. Solo group-edit tiene guard. Gap UX serio.

### 3 decisiones de diseño que cambian todo

1. **Avatar upload refactor completo**: drag&drop + crop + resize + progress + eliminar. **El feature más visible del modal y el más subdesarrollado**. Posible librería: `react-easy-crop` adaptado a Angular o custom canvas-based.

2. **Sistema de flags unificado**: reemplazar 🇦🇷 emojis por `flag-icons` CSS (ya está instalado según memoria del proyecto). Mismo issue en ranking, profile, group-detail — fix global, no solo este modal.

3. **Password change consolidation**: reutilizar PasswordRulesListComponent + agregar toggle eye + live mismatch. **Auth family debe ser consistente**: register, forgot, change → mismo UX para password input.

### Cambios secundarios

- ✕ → SVG icon
- Unificar sistema visual con picks-modal (backdrop + radius + padding)
- CanDeactivate / dirty prompt
- 5 MB desde backend + accept restrictivo + S3 cleanup
- `<select>` countries → searchable combobox + geolocation default
- "copy @handle" + link soporte
- "sobre vos" → "sobre ti"
- "Guardar país y bio" → "Guardar cambios"
- Discard button save bar
- Política password desde backend
- Live validation password
- Animation entrada/salida modal
- console.error → telemetry

**Nota retrospectiva**: este es **el surface más comprehensive de gestión de cuenta** (5 secciones diferentes con diferentes save patterns). Su complejidad orgánica creó inconsistencias: avatar auto-save vs profile manual-save vs password disclosure. **Refactor candidato**: separar en 3 modales independientes (Avatar, Profile, Password) o usar pestañas internas. La complejidad actual no se justifica en un modal de 480px.
