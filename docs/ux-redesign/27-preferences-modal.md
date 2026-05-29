# Análisis UX: Preferences Modal — PreferencesModalComponent

> Surface #27 del walkthrough. Modal "Preferencias" — settings de cliente.
> 4 toggles: sonidos, auto-open trivia, reduce motion, hora local.
> Backed by localStorage (PreferencesService) — sin schema/mutations.
> Disparado desde `/profile` (probable) o sidebar settings.

---

## 1. Identidad

- **Propósito**: ajustes de cliente que no requieren server persistence (UX preferences).
- **Audiencia**: cualquier user.
- **Frecuencia**: muy baja — usar una vez para ajustar gustos, raro volver.
- **Entry points**: probable botón "Preferencias" en `/profile` o sidebar.

---

## 2. Estructura

```
   ┌──────────────────────────────────────┐
   │ Preferencias                    [✕]  │
   ├──────────────────────────────────────┤
   │ 🔔 Sonidos                       [☑] │
   │    Sonido corto al recibir...        │
   ├──────────────────────────────────────┤
   │ ⚡ Trivias automáticas            [☑] │
   │    Abre el modal de trivia auto...   │
   ├──────────────────────────────────────┤
   │ ♿ Reducir animaciones            [☐] │
   │    Desactiva animaciones del tour... │
   ├──────────────────────────────────────┤
   │ 🕐 Hora local del browser        [☑] │
   │    Muestra los kickoffs en tu zona...│
   ├──────────────────────────────────────┤
   │ [Restablecer]              [Listo]   │
   └──────────────────────────────────────┘
```

**4 toggles + footer**. UI lineal simple.

---

## 3. Componentes desglosados

### 3.1 Modal shell

**Render**:
```css
.prefs-overlay {
  background: rgba(0, 0, 0, 0.55);
}
.prefs-modal {
  max-width: 480px;
  max-height: 90vh;
}
```

**A11y**:
- ✓ `role="dialog"`, `aria-modal="true"`, `aria-labelledby="prefs-title"`
- ✓ `cdkTrapFocus + autoCapture` (P0)
- ✓ Escape close
- ✓ Backdrop click close

**Análisis**:
- ✓ A11y core completo.
- 🟠 **`.prefs-overlay` + `.prefs-modal`** — **TERCER sistema visual paralelo** (vs `.picks-modal` + `.edit-profile-modal`). Confirmamos pattern de fragmentación cross-modal.
- 🟠 **Mismo backdrop solid 0.55** que edit-profile (sin blur), diferente de picks-modal (blur).
- 🟠 **`✕` close button** unicode.
- 🟠 **Sin animation** entrada/salida.

### 3.2 Header

**Render**:
```
Preferencias                                  [✕]
```

- ✓ Simple, claro.
- 🟠 **Sin sub-text** explicativo (ej. "Estos cambios se guardan en este dispositivo").
- 🟡 No menciona que es localStorage (cross-device gap).

### 3.3 Toggle rows (estructura común)

**Render**:
```
🔔 Sonidos                                    [☑]
Sonido corto al recibir una notificación o
acertar una trivia.
```

**Estructura**:
- `<label class="prefs-row">` que envuelve todo (click anywhere → toggle)
- `.prefs-row__title` con icon emoji + text bold
- `.prefs-row__sub` con descripción
- `<input type="checkbox" class="prefs-toggle">` 18×18

**Análisis**:
- ✓ **Click anywhere en la row** activa el toggle (UX standard mobile).
- ✓ Descripción de qué hace cada toggle (transparencia).
- ✓ Border-bottom entre rows.
- ✓ Hover state visible.
- 🔴 **Emoji unicode como icons en TODOS los toggles**: 🔔 + ⚡ + ♿ + 🕐 — render inconsistente cross-platform + anti-pattern.
- 🔴 **`<input type="checkbox"> nativo 18×18`** — usando checkbox nativo en lugar de un **toggle switch** visual moderno. Para preferences, UX standard es Switch (on/off) no Checkbox (true/false). Conceptualmente diferentes:
  - Checkbox: marca selección dentro de un set
  - Switch: enciende/apaga una función
- 🟠 **Sin `aria-checked` explícito** — el `<input type="checkbox">` nativo lo maneja, pero si el día de mañana cambia a custom switch, el A11y se rompe.
- 🟠 **Sin role="switch"** — patrón A11y correcto para toggles preferences.
- 🟡 **Sin animation** en check/uncheck.

### 3.4 Toggle 1 — Sonidos 🔔

**Wording**:
- Title: "🔔 Sonidos"
- Sub: "Sonido corto al recibir una notificación o acertar una trivia."

**Análisis**:
- ✓ Sub explica QUÉ contextos suenan.
- 🟠 **Sin demo button** para escuchar el sonido antes de activar.
- 🟡 Sin opción "Solo notificaciones" / "Solo trivia" granular.

### 3.5 Toggle 2 — Trivias automáticas ⚡

**Wording**:
- Title: "⚡ Trivias automáticas"
- Sub: "Abre el modal de trivia automáticamente cuando un partido entra EN VIVO."

**Análisis**:
- ✓ Explica el trigger ("EN VIVO" uppercase para emphasis).
- 🟠 **Auto-open trivia + watching match en tab paralelo = interrupción**. Default ON puede frustrar power users.
- 🟡 Sin opción "Solo trivia patrocinada".

### 3.6 Toggle 3 — Reducir animaciones ♿

**Wording**:
- Title: "♿ Reducir animaciones"
- Sub: "Desactiva animaciones del tour de bienvenida y transiciones del UI."

**Análisis**:
- ✓ ♿ symbol indica accesibilidad.
- ✓ Sub explica scope ("tour + transiciones UI").
- 🟠 **Sin auto-respeto a `prefers-reduced-motion`** OS-level — si user tiene macOS / Windows con reduce motion ON, debería leerse y aplicar default ON.
- 🟠 **Scope ambiguo**: ¿afecta sponsor anims? ¿confetti acierto trivia? ¿skeleton loading? Sub no aclara.

### 3.7 Toggle 4 — Hora local 🕐

**Wording**:
- Title: "🕐 Hora local del browser"
- Sub: "Muestra los kickoffs en tu zona horaria. Si lo apagás, se usa la hora del estadio."

**Análisis**:
- ✓ **Trade-off explicado** (local vs estadio).
- ✓ User puede preferir hora estadio para evitar confusión.
- 🟠 **"apagás" voseo argentino** — séptima+ instancia documentada.
- 🟡 Sin indicador de TZ actual del browser ("Estás en America/Guayaquil").
- 🟡 Sin opción "Mostrar ambas" (hora local + estadio).

### 3.8 Footer

**Render**:
```
[Restablecer]                              [Listo]
```

**Análisis**:
- ✓ **"Restablecer"** retorna a defaults.
- ✓ **"Listo"** primary cierra.
- ✓ `justify-content: space-between` posiciona los 2 botones en extremos.
- 🟠 **"Listo" wording** — wording amigable, no estándar. "Cerrar" o "Aceptar" más típico.
- 🟠 **Sin confirmation en "Restablecer"** — si user clickea, **pierde sus prefs sin warning**. Toggles se autoguardan, no hay "deshacer".
- 🟠 **Restablecer no muestra qué cambió** — sin highlight de los toggles que volvieron a default.
- 🟠 **Sin "Cancelar"** — preferences auto-save, no hay revert.

### 3.9 Auto-save behavior

**Behavior**:
- Cada toggle change → `prefs.set(key, checked)` → localStorage immediate
- No "Guardar" button — auto-save modelo.
- `resetToDefaults()` → `prefs.reset()` localStorage.

**Análisis**:
- ✓ **Auto-save standard** para preferences.
- ✓ Sin posibilidad de "perder cambios" (siempre se guardan).
- 🟠 **Sin toast feedback** post-toggle — user no sabe si quedó guardado.
- 🟠 **Sin cross-tab sync** — si user tiene 2 tabs y cambia preference en una, la otra no recibe el cambio hasta refresh.

### 3.10 PreferencesService localStorage

**Hipótesis** (no leído el service):
- Probable schema `{ sounds, autoOpenTrivia, reduceMotion, localKickoffTime }`
- Probable computed signal expone state actual
- Probable `set(key, value)` write + signal update

**Análisis**:
- ✓ Sin necesidad de mutations / network — UX inmediato.
- 🟠 **No persiste cross-device** — si user logueado en mobile + desktop, ajusta en uno y el otro no se sincroniza. **Eventualmente comentario en código sugiere mover a server-side**.

---

## 4. Cross-cutting · hallazgos UX (priorizados)

🔴 **Emoji unicode en TODOS los toggles** 🔔 ⚡ ♿ 🕐.

🔴 **Checkbox nativo en lugar de switch** — pattern incorrecto.

🔴 **Sin `role="switch"`** A11y.

🔴 **Sistema visual paralelo** `.prefs-modal` (3rd parallel).

🟠 **"Restablecer" sin confirmation** + sin highlight de cambios.

🟠 **Sin toast feedback** post-toggle.

🟠 **Sin demo sound** button (sounds toggle).

🟠 **"apagás" voseo** (séptima+ instancia).

🟠 **Sin auto-respeto** `prefers-reduced-motion` OS.

🟠 **Scope reduce motion ambiguo**.

🟠 **Sin TZ indicator browser** actual.

🟠 **Sin cross-tab sync**.

🟠 **`✕` close** unicode.

🟠 **Backdrop solid sin blur** (vs picks-modal).

🟠 **Sin sub-text header** ("este dispositivo").

🟠 **Auto-open trivia default ON** puede frustrar.

🟠 **Sin animation** modal entrada/salida.

🟡 **Sin opciones granulares** (sounds notif vs trivia).

🟡 **Sin opción "Solo sponsor"** trivia.

🟡 **Sin "Mostrar ambas"** TZ.

🟡 **Sin opción "Cancelar"** revert.

🟡 **Sin persist cross-device** (intencional pero limita).

🟢 **A11y core** completo (focus trap, aria, Escape).

🟢 **Click anywhere row** activa toggle.

🟢 **Auto-save immediate**.

🟢 **Wording sub** descriptivo de cada toggle.

🟢 **Trade-off TZ** explicado.

🟢 **♿ symbol** indica accesibilidad (al menos intencional).

🟢 **"Restablecer" button** disponible.

🟢 **Hover state** visible en rows.

🟢 **Border-bottom** delineation.

---

## 5. Antipatrones detectados

| Regla | Violación |
|---|---|
| **no-emoji-icons** | 🔔 ⚡ ♿ 🕐 ✕ |
| **Checkbox vs switch** | UX pattern incorrecto |
| **A11y role="switch"** | Faltante en preferences |
| **Visual system fragmentation** | 3rd parallel modal system |
| **Destructive sin confirm** | Restablecer sin warning |
| **OS-level no respeto** | prefers-reduced-motion no auto |
| **i18n consistency** | "apagás" voseo |
| **No demo / preview** | Sounds sin sample |
| **No cross-tab sync** | localStorage sin BroadcastChannel |
| **Backdrop inconsistency** | Sin blur vs picks-modal |
| **No animation** | Modal aparece/desaparece instant |

---

## 6. Anclas para el redesign

### Core

1. **4 toggles** en localStorage
2. **A11y core** modal (focus trap + Escape + backdrop)
3. **Click anywhere row** activa toggle
4. **Auto-save immediate**
5. **Reset to defaults** option
6. **Sub-text descriptivo** por toggle
7. **Trade-off explicado** TZ

### Quitar

- Emojis 🔔 ⚡ ♿ 🕐 ✕ → SVG icons
- Checkbox nativo → custom switch component
- "apagás" → "apagas" (decisión voseo vs tú)
- Sistema visual paralelo → unificar con picks-modal

### Agregar

- 🔴 **role="switch"** + `aria-checked` proper A11y pattern
- 🔴 **Switch component visual** (toggle slider)
- **Auto-detect `prefers-reduced-motion`** OS y aplicar default
- **Toast feedback** post-toggle ("Sonidos activados")
- **Confirmation Restablecer** ("¿Restablecer todos los ajustes?")
- **Highlight cambios post-restablecer** (animation breve)
- **Demo sound button** ▶ para sounds toggle
- **TZ indicator** ("Detectada: America/Guayaquil")
- **Sub-text header**: "Estos cambios se guardan en este dispositivo"
- **Cross-tab sync** via BroadcastChannel API
- **Granular sounds**: notif vs trivia separados
- **Auto-open trivia**: opciones (siempre / solo sponsor / nunca)
- **Animation modal** entrada/salida
- **Backdrop blur** consistente con picks-modal

### Considerar features

- **Cross-device sync**: server-side prefs (User model con prefs JSON)
- **Dark mode** toggle
- **Idioma** selector (es-EC, es-AR, es-ES, en)
- **Format date** preference (DD/MM vs MM/DD)
- **Notificaciones email** opt-in (cuando se agregue email backend)

---

## 7. Resumen ejecutivo

**Surface más simple del walkthrough** — 4 toggles, A11y core, auto-save, sub-text descriptivo. Lo que falla:

1. 🔴 **Checkbox nativo en lugar de switch**: para "Preferences UI" el pattern correcto es switch (on/off) no checkbox (selección). UX standard violado.

2. 🔴 **Emoji icons en TODOS los toggles**: 🔔 ⚡ ♿ 🕐 — patrón anti-emoji repetido en surface más visible para discovery de configuración.

3. 🔴 **`role="switch"` + `aria-checked` A11y faltante** — para preferences toggles este es el A11y standard.

4. 🔴 **Sistema visual paralelo** `.prefs-modal` — confirma fragmentación cross-modal (3 sistemas: picks, edit-profile, prefs).

### 3 decisiones de diseño que cambian todo

1. **Switch component reutilizable**: crear `<app-switch>` con `role="switch" aria-checked` + slider visual + animation slide. Reutilizar en todo settings/preferences futuro. Si Switch se introduce, **DOM checkbox queda solo para forms tradicionales**.

2. **Auto-detect OS preferences**: leer `window.matchMedia('(prefers-reduced-motion: reduce)')` al primer load. Si user tiene OS-level setting ON, default ON. Same para dark mode si se agrega.

3. **Modal system consolidation**: 3 sistemas paralelos (`.picks-modal`, `.edit-profile-modal`, `.prefs-modal`) → 1 (`.app-modal`). Patron unificado: backdrop blur dark + border-radius 16 + padding 28 + max-width variable + max-height 90vh. Reduce CSS duplicado dramáticamente.

### Cambios secundarios

- SVG icons (🔔 ⚡ ♿ 🕐 ✕)
- Confirmation Restablecer
- Toast feedback post-toggle
- Demo sound button
- TZ indicator
- Sub-text header dispositivo
- Cross-tab BroadcastChannel
- Animation entrada/salida
- "apagás" → tone decision
- Granular sounds (notif vs trivia)
- Auto-open trivia opciones (3 opciones)

### Considerar features

- Server-side cross-device sync
- Dark mode toggle
- Idioma selector
- Format date preference
- Email opt-in

**Nota retrospectiva**: este surface es el **template para futuras preferences settings**. Resolver bien los patrones aquí (switch component + role=switch + OS-level detection + visual system unificado) **paga dividendos exponenciales** porque cualquier setting nuevo (dark mode, idioma, email) reutilizará el mismo patrón. **Inversión alta ROI en infrastructure visual + A11y**.
