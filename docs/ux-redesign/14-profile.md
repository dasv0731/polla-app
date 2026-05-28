# Análisis UX: `/profile` — ProfileComponent

> Surface #14 del walkthrough. Hub personal del user.
> Header + 2 columnas (Mi juego + Sponsors/Cuenta) + 2 modal triggers (edit-profile, preferences).
> Logout (post Fase B con confirmation).

---

## 1. Identidad

- **Propósito**: hub personal del user. Acceso a comodines, especiales, notificaciones, settings de cuenta, logout.
- **Audiencia**: cualquier user post-login.
- **Frecuencia**: media. No es daily-use; visitas episódicas para edit profile o settings.
- **Entry points**: sidebar avatar/handle (en `.lsb__usr`), nav dropdown, deep-link.

---

## 2. Estructura — mapa general

```
┌──────────────────────────────────────────────────────────┐
│ [profile-hero]                                           │
│  ├── top: avatar lg + name block                         │
│  │   ├── h1: [flag bandera] + name (+ @handle parens) o  │
│  │   │   solo @handle                                    │
│  │   ├── meta: email · "miembro desde X"                 │
│  │   ├── bio (si existe)                                 │
│  │   └── btn "Editar perfil" → edit-profile modal        │
│  └── stats 4-up:                                         │
│      ├── Pts                                             │
│      ├── Exactos                                         │
│      ├── Result.                                         │
│      └── Global (#N o —)                                 │
│                                                          │
│ [profile-grid · 2 cols desktop, 1 col mobile]            │
│                                                          │
│ COLUMNA 1 · Mi juego                                     │
│  ├── h2 "Mi juego"                                       │
│  └── profile-list:                                       │
│      ├── 🎁 Mis comodines                                │
│      │   sub: comodinesSub()                             │
│      │   badge: ! (pending) o N (available)             │
│      ├── ⭐ Picks especiales                              │
│      │   sub: "Campeón, subcampeón, revelación"          │
│      │   badge: X/3                                      │
│      └── 🔔 Notificaciones                                │
│          sub: "Al día" o "N sin leer"                    │
│          badge: N si unread > 0                          │
│                                                          │
│ COLUMNA 2 · Sponsors + Cuenta                            │
│  ├── h2 "Sponsors"                                       │
│  │   └── 🎁 Canjear código (link a /mis-comodines)       │
│  │       → "Canjear →"                                   │
│  └── h2 "Cuenta"                                         │
│      └── profile-list:                                   │
│          ├── 🔒 Cambiar contraseña                        │
│          │   → edit-profile modal (section='password')   │
│          ├── ⚙ Preferencias                              │
│          │   → preferences modal                         │
│          └── ↩ Cerrar sesión (danger)                    │
│              → logout con confirm (Fase B)               │
│                                                          │
│ [LOADING: "Cargando perfil…"] si u === null              │
│                                                          │
│ [MODALES TRIGGER]                                        │
│  ├── edit-profile-modal (con initialSection input)       │
│  └── preferences-modal                                   │
└──────────────────────────────────────────────────────────┘
```

**Sin tabs internos.** 2 columnas estática.

---

## 3. Componentes desglosados

### 3.1 Profile hero

#### a) Avatar + name block

**Render**:
```
[AV]   🇲🇽 Juan Pérez (@juanpe)
       juanpe@example.com · miembro desde jun 2025
       Coleccionista de aciertos por accidente
       [Editar perfil]
```

**Datos**:
- avatar component (large size)
- countryFlagUrl como img (admin uploaded via edit-profile)
- name + "(@handle)" en parens si name existe; else solo @handle
- email
- memberSince
- bio (optional)
- editProfile button

**Análisis**:
- ✓ **Identity rico**: avatar + flag + name + handle + bio.
- ✓ Name + handle pattern flexible.
- ⚠ **Email visible** — bucket 4 review marcó: "el user sabe su email — bajo valor". Útil solo para users que olvidaron.
- ⚠ **Memberberlap "miembro desde"** — bucket 4 review marcó: "bajo valor". Nostalgia data sin utilidad accionable.
- 🟠 **h1 con inline styles** (`display:flex;align-items:center;gap:8px;flex-wrap:wrap;color:var(--wf-ink);`) — design system gap.
- 🟠 **Flag is img URL** sin componente `app-team-flag` o flag-icons CSS — inconsistencia con el resto de la app.
- 🟠 **Bio con inline styles** (`max-width: 480px`, etc.) — design system gap.
- 🟡 Edit profile button al final del bloque — puede ser más prominente.

#### b) Stats 4-up

**Render**:
```
[12]    [4]      [5]       [#47]
Pts     Exactos  Result.   Global
```

**Análisis**:
- ✓ Stats coincide con /picks family + home (4 stats consistentes).
- ✓ Esta vez **es apropiado** mostrar 4 stats (es el profile del user — su "stat sheet"). Duplica con home pero contextual.
- 🟡 Sin time scope ("torneo actual" vs "all time").
- 🟡 Sin chart/trend visual.

### 3.2 Columna 1 — Mi juego

**Render**: 3 list-items con icon + body + badge.

#### a) Mis comodines item

**Render**:
```
🎁  Mis comodines              [! pending] o [N green available]
    {comodinesSub}
```

**Datos**:
- icon 🎁
- title "Mis comodines"
- sub: `comodinesSub()` — varía
- badge condicional:
  - `pill--solid` con `!` si pending > 0
  - `pill--green` con N si available > 0

**Análisis**:
- ✓ Sub-text dinámico contextual.
- ✓ Badge dual (pending urgente vs available count).
- 🟡 Emoji 🎁 (con aria-hidden tras P4.D).

#### b) Picks especiales item

**Render**:
```
⭐  Picks especiales              [N/3]
    Campeón, subcampeón, revelación
```

**Análisis**:
- ✓ Counter X/3 muy claro.
- ✓ Sub explica qué son.
- 🟡 Emoji ⭐ con aria-hidden.

#### c) Notificaciones item

**Render**:
```
🔔  Notificaciones              [N solid]
    Al día / N sin leer
```

**Análisis**:
- ✓ Estado actual visible en sub ("Al día" / "N sin leer").
- ✓ Badge solid si unread.
- 🟠 **"Notificaciones" en "Mi juego" categorización rara** — notificaciones son más "Cuenta" o "Settings". El usuario que busca settings podría no verlas acá.
- 🟡 Emoji 🔔 con aria-hidden.

### 3.3 Columna 2 — Sponsors

**Render**:
```
Sponsors
┌───────────────────────────────────────┐
│ 🎁 Canjear código                     │
│ ¿Tienes código de sponsor?            │
│                          [Canjear →]  │
└───────────────────────────────────────┘
```

**Datos**: link a `/mis-comodines` (la página).

**Análisis**:
- 🟠 **Una sola entry en "Sponsors" section** — over-emphasis. Podría ser un item más en otro grupo o inline a la columna.
- 🟠 **Link a `/mis-comodines`** mientras el RedeemModal ya existe global (post Fase A consolidation). El user que clickea acá va a la página completa (con su card-canjear form inline) en lugar de abrir el modal directamente. Inconsistencia con el FAB de `/picks` que abre el modal.
- 🟡 Emoji 🎁 con aria-hidden.
- 🟡 "Canjear →" como pill-button en lugar de chev (`›`) como los otros — inconsistencia visual.

### 3.4 Columna 2 — Cuenta

**Render**:
```
Cuenta
🔒  Cambiar contraseña      ›
⚙   Preferencias            ›
↩  Cerrar sesión (danger)
```

**Análisis**:
- ✓ Acciones secundarias clear.
- ✓ Pattern de chevron `›` para "lleva a otro lugar".
- ✓ Logout danger variant.
- ✓ Post Fase D1: "Ayuda" item eliminado (era dead-end "próximamente").
- ✓ "Cambiar contraseña" abre el edit-profile modal con `initialSection='password'` — smart consolidation.
- 🔴 **Emojis 🔒⚙↩ SIN `aria-hidden`** — P4.D dió aria-hidden a Mi juego (🎁⭐🔔) pero **olvidó Cuenta** (🔒⚙↩). Inconsistencia + a11y gap.
- 🟡 "Cerrar sesión" sin counterpart "Bloquear" o "Cerrar sesión en todos los dispositivos" para seguridad avanzada.
- 🟡 Sin "Eliminar cuenta" option — GDPR / compliance gap.
- 🟡 Sin link a Términos / Privacidad / Help / FAQ desde el profile (footer-only).

### 3.5 Modales trigger

**Render**: condicionales `@if (editProfileOpen())` y `@if (preferencesOpen())`.

- EditProfileModalComponent: con `[initialSection]` input para abrir directo a password change si el trigger fue "Cambiar contraseña".
- PreferencesModalComponent: settings de toggles + saves al localStorage.

**Análisis**:
- ✓ initialSection pattern es elegante.
- ✓ Conditional render (no monta el modal hasta abrirlo).
- (Análisis profundo en doc de modales globales).

### 3.6 Loading state

**Render**:
```
Cargando perfil… (plain text, padding 48px, center)
```

**Análisis**:
- 🟡 Sin skeleton — solo plain text.
- 🟡 Inline styles `style="padding:48px;text-align:center;color:var(--wf-ink-3);"`.

---

## 4. Imbalance estructural

**Columna 1** (Mi juego): 3 items
**Columna 2** (Sponsors + Cuenta): 1 + 3 = 4 items

En desktop con grid 2-col, esto causa imbalance visual:
```
COL 1 (3 items)         COL 2 (4 items)
─────────────────       ─────────────────
Mi juego                Sponsors
- Mis comodines         - Canjear código
- Picks especiales      
- Notificaciones        Cuenta
                        - Cambiar password
                        - Preferencias
                        - Cerrar sesión
```

**Análisis**:
- 🟠 Columna 2 más larga que columna 1. Visualmente desbalanceado.
- Re-categorización potencial: Notificaciones → Cuenta (settings de notifs caben más en Cuenta que Mi juego). Eso dejaría 2 items en Mi juego + 1 Sponsors + 4 Cuenta = aún imbalance pero diferente.
- O agregar items a Mi juego: "Histórico de picks", "Estadísticas", "Logros".

---

## 5. Cross-cutting · hallazgos UX (priorizados)

🔴 **Cuenta icons (🔒⚙↩) SIN `aria-hidden`** — P4.D inconsistente entre Mi juego y Cuenta.

🟠 **Email visible en hero** — bajo valor (bucket 4 review).

🟠 **"Miembro desde"** sin valor accionable.

🟠 **Imbalance estructural** columnas (3 vs 4 items).

🟠 **Sponsors section con 1 sola entry** — over-emphasis.

🟠 **Canjear código link va a página** mientras RedeemModal global existe — inconsistencia con FAB.

🟠 **Notificaciones en "Mi juego"** categorización rara.

🟠 **Cuenta sin opciones de seguridad avanzada** (cerrar sesión en todos los dispositivos, 2FA).

🟠 **Sin "Eliminar cuenta"** — GDPR compliance gap.

🟠 **h1 + bio + flag con inline styles** — design system gap.

🟠 **Loading sin skeleton**.

🟡 **Flag como img URL** sin componente compartido.

🟡 **Stats sin time scope** (torneo actual vs all time).

🟡 **Sin chart/trend** visual de evolución.

🟡 **Sin link a Términos/Privacidad/Help/FAQ** desde el profile (footer-only).

🟡 **Canjear como pill-button vs chev** — inconsistencia visual menor.

🟡 **Sin "Compartir mi perfil"** opción (perfil público sería social proof).

🟡 **Edit profile button al final del bloque** — podría ser más prominente.

🟡 **Sin "histórico de picks"** entry — el user no puede ver picks pasados consolidados.

🟡 **Sin "Mis logros / badges"** entry — gamification opportunity.

🟢 **Memberberlap categorización**: "miembro desde" es nostalgia data.

🟢 **Profile-list-item button vs anchor inconsistencia** (Mi juego usa `<a>`, Cuenta usa `<button>`).

---

## 6. Antipatrones detectados

| Regla | Violación |
|---|---|
| **A11y consistency** | aria-hidden inconsistente Mi juego vs Cuenta |
| **Low-value data** | email + miembro desde |
| **Visual balance** | Imbalance columnas |
| **Section over-emphasis** | Sponsors con 1 entry |
| **CTA path consistency** | Canjear va a página vs modal |
| **Categorization** | Notificaciones en Mi juego |
| **Security** | Sin "cerrar sesión todos dispositivos", sin 2FA |
| **Compliance** | Sin "Eliminar cuenta" |
| **Skeleton missing** | Loading plain text |
| **Inline styles** | h1, bio, loading |
| **Help discoverability** | Sin link a Términos / Privacidad / Help |
| **no-emoji-icons** | 🎁⭐🔔🔒⚙↩🃏 |

---

## 7. Anclas para el redesign

### Core

1. **Identity strip rico** (avatar + name + handle)
2. **Stats 4-up** (apropiado en perfil)
3. **Mi juego + Cuenta sections**
4. **Edit profile button**
5. **Modales trigger** (edit-profile, preferences)

### Quitar

- Email visible en hero (mover a edit-profile modal)
- "miembro desde" (low value)
- Sponsors section dedicada (consolidar)
- Inline styles → design tokens
- Emojis estructurales → SVG

### Agregar

- **aria-hidden en Cuenta icons** (consistency fix)
- **Histórico de picks** entry
- **Mis logros / badges** entry (gamification)
- **Cerrar sesión en todos los dispositivos**
- **2FA setup** opcional
- **Eliminar cuenta** (compliance)
- **Link a Términos / Privacidad / FAQ**
- **Compartir mi perfil** opcional
- **Stats con time scope** (torneo / mes / all time)
- **Trend chart** opcional
- **Skeleton loading**
- **Canjear → RedeemModal** (consistencia con FAB)
- **Notificaciones** mover a Cuenta o nueva sección "Comunicaciones"

### Bug fix

- aria-hidden en 🔒⚙↩

---

## 8. Resumen ejecutivo

**Surface bien estructurado pero con polish gap.** Lo que funciona:

- Identity rico con avatar + flag + bio
- Stats 4-up apropiados (es el "stat sheet" del user)
- Badges dinámicos en Mi juego (pending/available/unread counts)
- "Cambiar contraseña" opens edit-profile con initialSection (smart)
- Post Fase D1: "Ayuda" dead-end eliminado
- Post Fase B: logout con confirmation

Los problemas:

1. 🔴 **A11y inconsistente**: P4.D dió aria-hidden a Mi juego icons (🎁⭐🔔) pero olvidó Cuenta icons (🔒⚙↩). Bug fix mecánico.

2. 🟠 **Data low-value en hero**: email + memberSince ocupan espacio sin valor accionable. Bucket 4 review ya lo marcó.

3. 🟠 **Categorización + imbalance**: Notificaciones en Mi juego es raro (más Cuenta); Sponsors section con 1 entry over-emphasis; columnas desbalanceadas.

### 3 decisiones de diseño que cambian todo

1. **Hero compacto**: quitar email + memberSince. Mantener avatar + flag + name + bio + stats + edit button. Mover email/membership a edit-profile modal.

2. **Reorganizar columnas**:
   - **Mi juego** (gameplay): Mis comodines, Picks especiales, **Histórico de picks** (new), **Logros** (new)
   - **Comunicaciones**: Notificaciones, **Compartir perfil** (new)
   - **Cuenta**: Cambiar contraseña, Preferencias, **Seguridad** (new: 2FA + cerrar sesión todos), Cerrar sesión, **Eliminar cuenta** (new)
   - **Sponsors** consolidar como entry en Mi juego o quitar como section dedicada — Canjear botón abre el RedeemModal global

3. **Polish a11y + design system**:
   - aria-hidden en Cuenta icons (bug fix)
   - Inline styles → design tokens
   - SVG icons en lugar de emojis
   - Skeleton loading

### Cambios secundarios

- Stats con time scope (torneo / mes / all time)
- Trend chart opcional
- Compartir perfil opcional
- Link a Términos / Privacidad / FAQ
- Flag como `app-team-flag` o `<span class="fi">` consistente con resto
- "Editar perfil" button más prominente (en lugar de al final del bloque)
- Cuenta con security section (2FA, sessions list, etc.)
- Compliance: "Eliminar cuenta"
