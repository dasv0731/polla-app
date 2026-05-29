# Análisis UX: Transfer Admin Modal — inline en GroupDetailComponent

> Surface #28 del walkthrough. Modal "Transferir admin" **inline en group-detail.component.ts** (no es modal global standalone).
> Disparado desde sección "Acciones de admin" en `/groups/:id`.
> Implementa **double-confirmation pattern**: modal de selección + ConfirmDialog destructive secundario.
> State machine: null → 'open' → 'submitting' → null.

---

## 1. Identidad

- **Propósito**: permitir al admin actual transferir el rol de admin a otro miembro del grupo.
- **Audiencia**: admin de grupo con al menos 1 miembro adicional (botón disabled si rows.length ≤ 1).
- **Frecuencia**: muy baja — uso puntual (cambio de organizador, vacación, etc.).
- **Entry points**: solo desde "Acciones de admin" en `/groups/:id` (cuando `isAdminOfGroup()`).

---

## 2. Estructura — state machine + double confirm

```
   /groups/:id (admin section)
        │
        │ click "👑 Transferir admin"
        │ disabled si rows.length <= 1
        ▼
   ┌──────────────────────────────────────┐
   │ Modal abierto · transferring='open'  │
   │                                      │
   │ Header:                              │
   │  Transferir admin                    │
   │  El nuevo admin podrá editar...      │
   │  Vos pasás a ser miembro normal.     │
   │                                      │
   │ Body:                                │
   │  Radio list:                         │
   │   ○ @user1                            │
   │   ○ @user2                            │
   │   ○ @user3                            │
   │                                      │
   │  (Empty state si nonAdminMembers=0)  │
   │  "No hay otros miembros..."          │
   │                                      │
   │ Footer:                              │
   │  [Cancelar] [Transferir]             │
   └──────────┬───────────────────────────┘
              │ click "Transferir"
              ▼
   ┌──────────────────────────────────────┐
   │ ConfirmDialog destructive            │
   │                                      │
   │ "Transferir admin"                   │
   │ "Vas a transferir el rol... @X.      │
   │  Vas a perder privilegios. Esta      │
   │  acción no se puede deshacer."       │
   │                                      │
   │ [Cancelar] [Transferir admin]        │
   └──────────┬───────────────────────────┘
              │ confirm
              │ transferring='submitting'
              ▼
   api.transferGroupAdmin({ groupId, newAdminUserId })
              │
              ├─► OK
              │    toast.success("@X es el nuevo admin de Y")
              │    transferring=null
              │    load() refresh
              │
              └─► FAIL
                   toast.error(humanizeError)
                   transferring='open' (back to modal)
```

**Pattern doble confirm**: modal con radio + ConfirmDialog destructive. Pattern UX-correcto para acciones irreversibles.

---

## 3. Componentes desglosados

### 3.1 CTA "Transferir admin"

**Render** (en sección admin):
```
👑 Transferir admin    (disabled si rows ≤ 1)
```

**Análisis**:
- ✓ **Disabled cuando rows ≤ 1**: previene admin único intentando transferir a nadie.
- ✓ Block button.
- ✓ `aria-hidden="true"` en 👑.
- 🟠 **Emoji 👑** anti-pattern (consistente con resto).
- 🟠 **Sin tooltip "Necesitás al menos 1 miembro adicional"** cuando disabled. User no entiende por qué no puede clickear.
- 🟠 **Wording "Transferir admin"** — claro pero podría ser "Cambiar admin" (más conversational).

### 3.2 Modal shell

**Render**:
```css
.picks-modal is-open
max-width: 480px;
```

**A11y**:
- ✓ `role="dialog"`, `aria-modal="true"`, `aria-labelledby="transfer-admin-title"`
- ✓ `cdkTrapFocus + autoCapture` (P0)
- ✓ Escape close (con guard si submitting)
- ✓ Backdrop click close

**Análisis**:
- ✓ **Usa `.picks-modal`** — mismo sistema que group-actions, randomizer, redeem, trivia. **Consistente con la mayoría** (vs edit-profile y prefs que son paralelos).
- ✓ Guard: `closeTransferAdmin` no cierra si submitting (anti-cancel-in-flight).
- ✓ Inline en parent template (no es modal global) — patrón válido para scope local.
- 🟠 **`✕` close button** unicode con `<span aria-hidden="true">` — mejor que sin aria-hidden pero todavía emoji.

### 3.3 Header

**Render**:
```
Transferir admin                              [✕]
El nuevo admin podrá editar, invitar y eliminar
el grupo. Vos pasás a ser miembro normal.
```

**Análisis**:
- ✓ **Meta line explica consecuencias** ("editar, invitar, eliminar" + "Vos pasás a ser miembro normal").
- ✓ Setup expectativas antes de la decisión.
- ✓ Title + meta jerarquía.
- 🟠 **"Vos pasás"** voseo — octava+ instancia documentada.
- 🟠 **Meta line muy denso**: 3 acciones del nuevo admin + 1 consecuencia para vos. Puede ser bullet list mejor que texto corrido.

### 3.4 Body — radio list

**Render** (con miembros):
```
○ @user1
○ @user2
○ @user3
```

**Render** (empty state):
```
No hay otros miembros en el grupo. Invitá a alguien primero
o eliminá el grupo.
```

**Behavior**:
- `nonAdminMembers` computed filtra rows.filter(r => r.userId !== g.adminUserId)
- Radio input + `[(ngModel)]` newAdminId signal
- `.is-selected` highlight

**Análisis**:
- ✓ Radio buttons + native ngModel.
- ✓ `translate="no"` en @handle (brand preservation).
- ✓ Visual selected state.
- ✓ Empty state inline con próximas acciones.
- 🔴 **Solo muestra @handle** — sin avatar, sin score, sin "Tiempo en el grupo", sin "Última actividad". El admin tiene que decidir basado en SOLO el handle. **Decisión low-information**.
- 🔴 **Sin búsqueda** — si grupo tiene 30 miembros, el radio list es muy largo.
- 🟠 **"Invitá a alguien primero o eliminá el grupo"** — voseo + el wording sugiere "eliminar" como opción al mismo nivel que invitar, lo cual es WAY más destructive.
- 🟠 **Empty state no debería poder llegar a este modal** (botón disabled si rows ≤ 1). **Defensa redundante pero ok**.
- 🟠 **Sin sort específico** — orden de rows depende de cómo viene del backend (alfabético? score? aleatorio?). Inconsistente.
- 🟠 **Sin distinción admin vs miembros nuevos** vs miembros antiguos.
- 🟡 Sin opción "Pickear aleatorio" para indecisos.

### 3.5 Footer

**Render**:
```
                                     [Cancelar] [Transferir]
```

**Análisis**:
- ✓ Cancelar + primary "Transferir".
- ✓ Disabled si `!newAdminId() || submitting`.
- ✓ Loading state "Transfiriendo…".
- ✓ Cancel disabled durante submitting.
- 🟠 **Meta footer izquierda vacía** (`<span class="meta"></span>`) — mismo issue que group-actions Unirme. Espacio desperdiciado.
- 🟠 **"Transferir" wording** — verb genérico, sin claridad de a quién. Mejor "Hacer admin a @X" cuando hay selección.

### 3.6 ConfirmDialog destructive (segundo step)

**Behavior** (línea 681-690):
```ts
const ok = await this.confirmDialog.ask({
  title: 'Transferir admin',
  message: `Vas a transferir el rol de admin de "${g.name}" a @${target.handle}. ` +
           'Vas a perder los privilegios de admin: no podrás editar el grupo, ' +
           'invitar miembros ni eliminarlo. Esta acción no se puede deshacer.',
  confirmLabel: 'Transferir admin',
  cancelLabel: 'Cancelar',
  danger: true,
});
```

**Análisis**:
- ✓ **Double-confirmation pattern** — UX correcto para acciones irreversibles.
- ✓ Wording incluye nombre de grupo + handle del nuevo admin (específico).
- ✓ Lista consecuencias explícitas.
- ✓ "Esta acción no se puede deshacer" warning.
- ✓ `danger: true` indica el ConfirmDialog usa color rojo.
- ✓ confirmLabel coincide con la acción ("Transferir admin").
- 🟠 **Wording redundante**: el modal ya explicó las consecuencias en el meta line. El ConfirmDialog las repite con MÁS detalle. **Doble explicación**.
- 🟠 **Sin lista visual** consecuencias en el ConfirmDialog (texto corrido).
- 🟠 **"Vas a"** voseo (vs "Vas a perder" también voseo) — consistente al menos dentro del dialog.
- 🟢 ConfirmDialogService es shared (P0 done) — focus trap + Escape + a11y.

### 3.7 Submit handler

**Behavior**:
1. Get newAdminId + group
2. ConfirmDialog → si cancel, return
3. transferring='submitting'
4. api.transferGroupAdmin({ groupId, newAdminUserId })
5. OK → toast + reset + load
6. FAIL → toast error + transferring='open' (back to modal)

**Análisis**:
- ✓ **Fallback al modal en error** — user puede reintentar sin reabrir.
- ✓ Toast success específico ("@X es el nuevo admin de Y").
- ✓ `await this.load()` refresca state post-success.
- ✓ humanizeError para mensajes user-friendly.
- 🟠 **Sin loading state visible en el ConfirmDialog** — si el user confirma y la API tarda, no hay feedback hasta success/error.
- 🟢 Backend mutation `transferGroupAdmin` existe (post Fase B).

---

## 4. Cross-cutting · hallazgos UX (priorizados)

🔴 **Radio list low-information**: solo @handle, sin avatar / score / tenure.

🔴 **Sin búsqueda** en lista de miembros (problema con 30+).

🟠 **Wording redundante**: modal meta line + ConfirmDialog explican lo mismo.

🟠 **`👑` + `✕`** emoji unicode.

🟠 **Voseo**: "Vos pasás" + "Vas a" + "Invitá" + "eliminá" — octava+ instancia.

🟠 **Tooltip disabled** CTA faltante.

🟠 **Meta line denso** (3 acciones + 1 consecuencia en 1 línea).

🟠 **Sin sort específico** member list.

🟠 **Empty state suggests "eliminar grupo"** como par con "invitar".

🟠 **Meta footer vacía** (mismo issue group-actions Unirme).

🟠 **Wording "Transferir"** sin claridad de target.

🟠 **Sin loading visible ConfirmDialog** post-confirm.

🟠 **Sin opción "Random"** para indecisos.

🟠 **Sin animation modal** entrada/salida.

🟠 **Sin distinción miembros tiempo en grupo / score**.

🟡 **Lista sin pagination** si 30+ miembros.

🟡 **Sin "previo admin"** historial si hubo transfer previo.

🟢 **Disabled CTA cuando rows ≤ 1**.

🟢 **A11y core completo** (focus trap, aria, Escape, backdrop).

🟢 **Usa `.picks-modal`** (consistente con group-actions, etc.).

🟢 **Guard close-during-submit**.

🟢 **Double-confirmation pattern**.

🟢 **ConfirmDialog destructive** wording explícito.

🟢 **Fallback al modal en error**.

🟢 **Toast success específico**.

🟢 **`translate="no"`** en @handle.

🟢 **load() refresh post-success**.

🟢 **`<span aria-hidden="true">`** en emojis CTA.

🟢 **State machine clara** (null / 'open' / 'submitting').

🟢 **humanizeError** para errors.

---

## 5. Antipatrones detectados

| Regla | Violación |
|---|---|
| **no-emoji-icons** | 👑 CTA, ✕ close |
| **Low-information decisions** | Lista solo @handle |
| **No search** | Lista 30+ unwieldy |
| **Redundant wording** | Modal + ConfirmDialog |
| **i18n consistency** | Voseo "Vos pasás" / "Vas a" |
| **Meta footer empty** | Espacio desperdiciado |
| **CTA target ambiguity** | "Transferir" sin "@X" |
| **No tooltip disabled** | User no entiende disabled |
| **No animation modal** | Aparece instant |

---

## 6. Anclas para el redesign

### Core

1. **Inline modal en group-detail** (scope local)
2. **State machine** (null / 'open' / 'submitting')
3. **Radio list members**
4. **ConfirmDialog destructive** second step
5. **Disabled CTA** rows ≤ 1
6. **A11y core completo**
7. **Toast success + load refresh**
8. **Fallback al modal en error**
9. **`.picks-modal`** consistency

### Quitar

- 👑 + ✕ unicode → SVG icons
- Wording redundante (modal + ConfirmDialog idéntico)
- Voseo (decisión tone global)
- Meta footer empty span hack
- Empty state mention "eliminar" como opción

### Agregar

- 🔴 **Avatar + handle + score + "Hace X meses"** en cada row
- 🔴 **Search bar** si rows ≥ 6 miembros
- **Tooltip disabled** "Necesitás al menos 1 miembro adicional para transferir"
- **Bullet list** en meta line ("El nuevo admin podrá: ...; Vos pasarás a ser miembro normal")
- **CTA wording dinámico**: "Hacer admin a @X" cuando hay selección
- **Loading visual ConfirmDialog** post-confirm
- **Sort por score desc** por defecto + opción "Más reciente"
- **"Pickear aleatorio"** opción para indecisos
- **Animation entrada/salida** modal
- **Pagination** si 30+ miembros
- **Historial transfers** (analytics / audit log) — futuro
- **Confirmation typing** ("Escribe TRANSFERIR para confirmar") para extra safety — pattern Stripe/GitHub
- **Wording simplificado ConfirmDialog**: ya que modal explica, ConfirmDialog puede ser más conciso ("¿Hacer admin a @X? Esto no se deshace.")
- **Highlight propio user** en lista para evitar confusión

---

## 7. Resumen ejecutivo

**Surface técnicamente robusto** — state machine clara, double-confirmation pattern, A11y completo, fallback en error, toast + refresh post-success. Lo que falla:

1. 🔴 **Radio list low-information**: el admin tiene que elegir solo basado en @handle. No ve avatar, score, tenure, último activity. **Decisión importante con poca data**.

2. 🔴 **Sin búsqueda**: para grupos de 30 miembros (MAX_MEMBERS = 30), el radio list scrollea muchísimo. Encontrar al member correcto = friction.

3. 🟠 **Wording redundante** entre modal y ConfirmDialog: explican lo mismo. ConfirmDialog debería ser más conciso ("¿Hacer admin a @X? Esto no se deshace.") porque el modal ya explicó consecuencias.

### 3 decisiones de diseño que cambian todo

1. **Member row enriquecido**: avatar + @handle + score + "Hace X meses en el grupo" + última actividad. Convierte decisión low-information en high-information.

2. **Search + sort + filter** member list: para grupos de 10+ members el flujo current es unwieldy. Search filter + sort por (score, alphabetical, joined-date) reduces friction dramáticamente.

3. **Wording cascade**: modal explica detalles, ConfirmDialog es conciso. Hoy ambos explican lo mismo = redundancia.

### Cambios secundarios

- SVG icons (👑 + ✕)
- Tooltip disabled CTA
- Bullet list meta
- CTA dynamic "Hacer admin a @X"
- Sort por score / joined-date
- Loading visual ConfirmDialog
- Animation modal
- Pagination si 30+
- Highlight propio user
- Typed confirmation (futuro)
- Voseo tone decision global
- Empty state wording (sin "eliminar" pair)
- Meta footer simétrica

### Considerar features

- Historial transfers (audit log)
- Multi-admin (co-admins) — feature creep, considerar después
- Auto-transfer si admin inactive 30+ days
- Confirmation typing extra (TRANSFERIR)

**Nota retrospectiva**: este es **el surface más "governance" de la app** — la decisión más sensible que un user puede tomar dentro de un grupo. El polish técnico es bueno (double-confirm + state machine + a11y) pero el polish UX (low-info row + sin search) deja muchísimo en la mesa. Para grupos serios con apuestas reales, este flow afecta trust + perception de control.
