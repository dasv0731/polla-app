# Análisis UX: Confirm Dialog — ConfirmDialogComponent + ConfirmDialogService

> Surface #34 del walkthrough. **Modal de confirmación global** que reemplaza a `window.confirm` para acciones destructivas/impacto.
> Service-based pattern: `await confirmDialog.ask(opts)` retorna Promise<boolean>.
> Montado **en `<app-root>`** (no en shell) — funciona en autenticado + auth-shell.
> Usado en: logout, eliminar grupo, abandonar grupo, transfer admin, eliminar imagen, etc.

---

## 1. Identidad

- **Propósito**: confirmar acciones destructivas o de impacto sin usar `window.confirm()` (que tiene UX horrible, no A11y, no brand).
- **Audiencia**: cualquier user en cualquier estado (auth o no-auth).
- **Frecuencia**: por surface, baja-media. Por sesión, depende de qué hace el user.
- **Entry points**: programáticos via `confirmDialog.ask(opts)`. Visible cuando `svc.pending() !== null`.

---

## 2. Estructura

### Componente (UI)

```
┌──────────────────────────────────────────────┐
│ Backdrop blur 2px + 55% black                │
│ Click → cancel                                │
│                                              │
│      ┌────────────────────────────────┐      │
│      │ Title (Bebas 22px)             │      │
│      │                                │      │
│      │ Message (14px gray)            │      │
│      │                                │      │
│      │                                │      │
│      │           [Cancelar] [Confirm/ │      │
│      │                       Danger]  │      │
│      └────────────────────────────────┘      │
└──────────────────────────────────────────────┘
```

### Service (lógica)

```ts
interface ConfirmOptions {
  title: string;
  message: string;
  confirmLabel?: string;  // default "Confirmar"
  cancelLabel?: string;   // default "Cancelar"
  danger?: boolean;       // estiliza primary en rojo
}

ask(opts): Promise<boolean>
confirm() → resolve(true) + clear
cancel() → resolve(false) + clear
```

**Promise-based API** — el llamante hace `await` y bifurca con `if (!ok) return`.

---

## 3. Componentes desglosados

### 3.1 Modal container

**A11y**:
- ✓ `role="dialog"`, `aria-modal="true"`
- ✓ `aria-labelledby="confirm-dialog-title"` + `aria-describedby="confirm-dialog-msg"`
- ✓ `cdkTrapFocus [cdkTrapFocusAutoCapture]="true"` (P0)
- ✓ Escape close → cancel
- ✓ Backdrop click → cancel

**CSS**:
- `position: fixed; inset: 0`
- `z-index: 1000`
- `display: grid; place-items: center`

**Análisis**:
- ✓ **A11y COMPLETO**: dialog + aria-labelledby + aria-describedby (no solo title, también describe el message para SR).
- ✓ Pattern correcto cdkTrapFocus.
- ✓ Grid centering moderno.
- ✓ z-index 1000 garantiza top.
- 🟢 **Mejor A11y de TODOS los modales analizados** — único con aria-describedby.

### 3.2 Backdrop

**CSS**:
```css
.confirm-backdrop {
  background: rgba(0,0,0,0.55);
  backdrop-filter: blur(2px);
}
```

**Análisis**:
- ✓ Backdrop semi-transparente + blur sutil.
- ✓ `cursor: pointer` afford click.
- ✓ `role="presentation"` correcto (decorativo).
- 🟠 **Backdrop opacity 0.55 + blur 2px** — más sutil que group-actions (0.75 + blur 6px). **4to sistema visual** modal (picks 0.75/6, edit-profile 0.55/no-blur, prefs 0.55/no-blur, confirm 0.55/blur 2px). **Fragmentación cross-modal confirmada**.
- 🟡 `cursor: pointer` en backdrop puede confundir users (parece interactive icon).

### 3.3 Card

**CSS**:
```css
.confirm-card {
  background: var(--color-primary-white);
  border-radius: 14px;
  padding: 24px;
  width: min(420px, calc(100vw - 32px));
  box-shadow: 0 20px 60px rgba(0,0,0,0.35);
  overscroll-behavior: contain;
}
```

**Análisis**:
- ✓ **`width: min(420px, calc(100vw - 32px))`** responsive — 420px desktop, full mobile con clearance.
- ✓ `overscroll-behavior: contain` evita scroll lock body.
- ✓ Box-shadow generoso.
- ✓ Border-radius 14px (consistente con prefs 12px, edit-profile 12px — un poco diff con picks-modal 16px).
- 🟡 **Sin animation entrada/salida** — aparece instant.

### 3.4 Title

**Render**:
```
Eliminar grupo
```

**CSS**:
- Bebas Neue 22px
- Letter-spacing 0.02em
- Line-height 1.2

**Análisis**:
- ✓ Display font para impacto.
- ✓ Sized para readability.
- 🟢 Pattern correcto.

### 3.5 Message

**Render**:
```
Esta acción no se puede deshacer. Todos los miembros perderán
acceso y los picks acumulados en este grupo.
```

**CSS**:
- 14px
- color muted
- line-height 1.5

**Análisis**:
- ✓ Readable.
- ✓ `aria-describedby` enlaza para SR.
- 🟠 **Mensaje single paragraph** — no soporta `<br>` o lists. Si el caller necesita estructurar (bullet de consecuencias), no puede.
- 🟠 **Sin support markdown** ni HTML.

### 3.6 Actions

**Render** (NO danger):
```
                  [Cancelar] [Confirmar]
```

**Render** (danger):
```
                  [Cancelar] [Eliminar grupo]
                              ^red
```

**CSS**:
- justify-content: flex-end (botones derecha)
- gap 8px

**Análisis**:
- ✓ **Cancelar default left, primary right** (UX standard).
- ✓ **danger flag** → botón primary en rojo (var(--color-lost)).
- ✓ Default labels: "Cancelar" / "Confirmar".
- ✓ Custom labels: ej. "Eliminar grupo", "Transferir admin".
- ✓ Focus-visible outline verde.
- 🔴 **AUTO-CAPTURE FOCUS en CONFIRM button** (default behavior de cdkTrapFocusAutoCapture). **Para acciones destructive este es ANTI-PATRÓN**:
  - User pulsa botón → ConfirmDialog abre → Enter accidentalmente → confirma destructive.
  - UX standard para destructive: focus inicial en **Cancel** (la opción segura).
- 🔴 **`cdkTrapFocusAutoCapture` no permite override** del initial focus target — el componente NO especifica un focus target inicial, así que va al primer focusable que es **Cancel** (correcto por orden DOM!) — pero solo por luck del orden de markup. Si alguien refactoriza el orden, rompe el patrón.

Wait — verificando el orden:
```html
<button (click)="svc.cancel()">{{ cancelLabel ?? 'Cancelar' }}</button>
<button class="--primary" (click)="svc.confirm()">{{ confirmLabel ?? 'Confirmar' }}</button>
```

Cancel está primero → autocapture focus en Cancel. ✓ **PATTERN CORRECTO POR ORDEN DOM**, pero fragil.

- 🟠 **Sin keyboard hint** "Enter to confirm, Esc to cancel" — comentado para users avanzados.
- 🟡 **Sin loading state** en confirm button — si el caller hace async work post-confirm, no hay feedback.

### 3.7 Service API

#### ask()

```ts
ask(opts): Promise<boolean> {
  const prev = this.pending();
  if (prev) prev.resolve(false);  // cancel previo si re-call
  return new Promise<boolean>((resolve) => {
    this.pending.set({ ...opts, resolve });
  });
}
```

**Análisis**:
- ✓ **Promise-based** API limpia.
- ✓ **Auto-cancel previo** si re-call (evita stuck pending).
- ✓ `providedIn: 'root'` singleton global.
- 🟠 **Sin queue**: si múltiples llamadas concurrentes, el previo se cancela. **Race condition**: caller A llama, espera Promise. Mientras espera, caller B llama → A recibe false (cancelled) sin tener clue de por qué.

#### confirm() / cancel()

```ts
confirm(): void {
  const p = this.pending();
  if (!p) return;
  this.pending.set(null);
  p.resolve(true);
}
```

**Análisis**:
- ✓ Defensive null check.
- ✓ Clear state antes de resolve (evita race).

### 3.8 Mount global

**Comentario código**: "Montado una sola vez en `<app-root>`, vive sobre todo y funciona tanto en shell autenticado como en auth-shell."

**Análisis**:
- ✓ **Mount único** evita N instances.
- ✓ Z-index garantiza top.
- ✓ Funciona pre/post-auth.
- 🟢 Pattern correcto.

### 3.9 Edge cases

- 🟠 **Sin scroll del body lock**: si message es muy largo, podrías scroll el dialog. Pero el body sigue scrollable. `overscroll-behavior: contain` ayuda pero no bloquea.
- 🟠 **Sin "double tap to confirm"**: para destructive REAL crítico (eliminar cuenta), pattern Stripe/GitHub es escribir "DELETE" en input.
- 🟠 **Sin checkbox "Entendido los riesgos"**: para destructive con consecuencias amplias.

### 3.10 Usage pattern observado

Visto en walkthrough:
- **transfer-admin** (doc 28): wording wordy + danger
- **logout** (doc 31 nav): wording voseo + sin danger
- **Eliminar grupo** (mencionado en código): danger probable

**Análisis del usage pattern**:
- 🟠 **Inconsistencia danger flag**: transfer-admin usa danger=true (rojo), logout NO. **Logout debería ser danger** (destructive de sesión).
- 🟠 **Wording wordy** en transfer-admin (3 líneas + "esta acción no se puede deshacer") + redundante con modal previo.
- 🟠 **Voseo** en logout: "Querés cerrar sesión? Vas a salir..."

---

## 4. Cross-cutting · hallazgos UX (priorizados)

🔴 **4to sistema visual modal** (.confirm-backdrop diff opacity/blur vs picks/edit-profile/prefs).

🔴 **Single paragraph message** — no soporta estructura.

🟠 **Sin animation entrada/salida**.

🟠 **Sin loading state** confirm button durante async caller.

🟠 **Sin queue** múltiples ask() concurrentes.

🟠 **Initial focus en Cancel solo por orden DOM** (frágil a refactor).

🟠 **Sin keyboard hint** "Enter to confirm, Esc to cancel".

🟠 **Sin body scroll lock** (solo overscroll-behavior).

🟠 **Sin "type to confirm"** ultra-destructive.

🟠 **Sin checkbox "Entendido"** alternativa.

🟠 **Usage pattern logout sin danger** (debería ser).

🟠 **Wording usage** voseo + wordy en callers.

🟡 **cursor:pointer backdrop** puede confundir.

🟢 **A11y MÁS COMPLETO** del walkthrough (aria-labelledby + aria-describedby).

🟢 **Promise-based API** limpia.

🟢 **Auto-cancel previo** evita stuck.

🟢 **Mount único global** correcto pattern.

🟢 **Width responsive** min(420, 100vw - 32).

🟢 **overscroll-behavior contain**.

🟢 **danger flag** customizable rojo.

🟢 **Default labels** + override.

🟢 **CDK focus trap + autoCapture**.

🟢 **z-index 1000** garantiza top.

🟢 **Box-shadow generoso** + border-radius.

🟢 **Focus-visible outline**.

🟢 **Defensive null checks**.

🟢 **Cancel en primer botón** orden DOM (focus correcto por luck).

---

## 5. Antipatrones detectados

| Regla | Violación |
|---|---|
| **Visual system fragmentation** | 4 sistemas paralelos modales |
| **No initial focus override** | Pattern fragil a refactor |
| **No async loading state** | Caller hace work sin feedback |
| **No queue concurrent asks** | Race condition silencioso |
| **No structured message** | Single paragraph plain text |
| **No animation transitions** | Aparece/desaparece instant |
| **No type-to-confirm** | Pattern Stripe missing |
| **No body scroll lock** | Body scrolleable detrás |

---

## 6. Anclas para el redesign

### Core

1. **Modal A11y completo** (aria-labelledby + aria-describedby + cdkTrapFocus + Escape)
2. **Service Promise-based**
3. **danger flag** customizable
4. **Default + custom labels**
5. **Backdrop click + Escape**
6. **z-index 1000**
7. **Width responsive**
8. **Mount global único**

### Quitar

- Sistema visual paralelo → unificar con picks-modal (backdrop blur 6 + opacity 0.75)

### Agregar

- 🔴 **Structured message support**: aceptar array de strings para bullets, o markdown limitado
- 🔴 **Initial focus opcional**: `initialFocus: 'cancel' | 'confirm'` (default 'cancel' destructive, 'confirm' constructive)
- 🔴 **Loading state confirm**: `onConfirm: () => Promise<void>` → service muestra "Procesando…" durante el await
- **Animation entrada/salida** (scale + fade)
- **Body scroll lock** durante open
- **Queue de asks** (opcional para chains de confirms)
- **Keyboard hint** "Enter to confirm, Esc to cancel"
- **Type-to-confirm option**: `requireType: 'DELETE'` para ultra-destructive
- **Checkbox "Entendí"** opcional para multi-consequence
- **Icon support**: `icon: 'warning' | 'info' | 'danger'` SVG en lugar de solo color

### Usage cleanup

- **Logout debe usar `danger: true`**
- **Wording voseo decisión**
- **Wording transfer-admin reducir**

### Considerar

- **Inline actions**: ConfirmDialog como popover anclado al botón trigger (vs modal central) para acciones contextuales
- **Auto-dismiss timer** para confirms positivas de bajo impacto
- **Undo toast** post-confirm para reversible destructive

---

## 7. Resumen ejecutivo

**Surface técnicamente sólido + A11y excelente**. Único modal con `aria-labelledby + aria-describedby` (vs todos los demás que solo tienen aria-labelledby). Lo que falla:

1. 🔴 **4to sistema visual paralelo** (confirm-backdrop diff de picks/edit/prefs). Confirmamos fragmentación 4-way.

2. 🔴 **Sin structured message**: si el caller necesita "Esta acción: 1) borra grupo, 2) pierde picks, 3) notifica members", debe meter todo en un paragraph plano.

3. 🟠 **Initial focus solo por orden DOM**: Cancel está primero accidentalmente. Si alguien refactoriza markup, focus inicial puede ir a Confirm = destructive trigger accidental.

4. 🟠 **Sin loading state confirm**: caller hace `await api.delete()` después de `if (!ok) return`. Mientras la API trabaja, modal ya cerrado pero el resto de la app no sabe que está pasando algo.

### 3 decisiones de diseño que cambian todo

1. **`onConfirm: () => Promise<void>` pattern**: en lugar de `ok` boolean, el caller pasa función async. Service muestra "Procesando…" + disable buttons durante await. Auto-close en success.
   ```ts
   await confirmDialog.confirmAction({
     title: 'Eliminar grupo',
     message: 'No se puede deshacer.',
     danger: true,
     onConfirm: async () => {
       await api.deleteGroup(g.id);
       this.toast.success('Grupo eliminado');
     },
   });
   ```

2. **Structured messages**: aceptar `message: string | string[]` para bullets. Más claro UX para multi-consequence.

3. **Visual system unification cross-modal**: definir 1 sistema (`.app-modal` con tokens: backdrop blur 6 + opacity 0.7, radius 16, padding tokens, animations). Reemplaza los 4 sistemas actuales.

### Cambios secundarios

- Initial focus explícito (`initialFocus: 'cancel'` default)
- Animation entrada/salida
- Body scroll lock
- Keyboard hint
- Type-to-confirm option
- Icon support
- Logout danger flag
- Wording voseo cleanup

### Considerar features

- Inline action confirm (popover)
- Auto-dismiss positive confirms
- Undo toast post-destructive

**Nota retrospectiva**: este surface es **el A11y benchmark del walkthrough completo** — único con aria-describedby. El polish técnico es bueno pero **falta el polish UX** (structured messages, loading states, animation). Es candidato a evolucionar a `confirmAction(onConfirm: async)` pattern para simplificar callers.
