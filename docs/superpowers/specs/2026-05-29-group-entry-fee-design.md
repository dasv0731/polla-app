# Cuota de ingreso a grupos — Design Spec

> **Fecha:** 2026-05-29
> **Estado:** Aprobado por usuario, listo para writing-plans
> **Scope:** Single spec, no requiere descomposición — toca 1 modelo extra en backend + 4 surfaces en frontend.

---

## 1. Objetivo

Permitir que el admin de un grupo cobre una cuota de ingreso a sus miembros. La feature es **informativa** (no procesa pagos in-app): el admin escribe instrucciones de pago en texto libre, cada miembro impago ve un recordatorio flotante hasta que el admin lo marque como pagado en la tabla de integrantes.

**Decisiones de producto bloqueadas en el brainstorming:**

1. **Solo textarea de instrucciones.** Sin campo separado de monto/moneda — el admin embebe el monto en el texto.
2. **Solo informativo.** El user impago puede usar la app completa, hacer picks, ver ranking. La cuota no bloquea funcionalidad.
3. **Editable post-create.** Admin puede prender/apagar la cuota y cambiar las instrucciones desde Editar grupo. El estado "pagado" de cada miembro se preserva si la cuota se apaga y vuelve a prender.
4. **Recordatorio scope = grupo.** El floating solo aparece dentro de `/groups/:id` cuando el user activo tiene cuota pendiente en ese grupo. Cero ruido en otras pantallas.
5. **Admin auto-pagado** cuando se activa la cuota (al crear o al alternar OFF→ON en Editar).
6. **Estado de pago visible solo al admin.** Los miembros normales no ven una columna "pagado/pendiente" — solo el admin la ve en la tabla.

---

## 2. Modelo de datos

**`polla-backend/amplify/data/resource.ts` — Group (extender modelo existente)**

```ts
// Cuota de ingreso del grupo. Texto libre con instrucciones de pago
// (depósito, contacto, etc). El estado per-miembro vive en Membership.
entryFeeEnabled: a.boolean().default(false),
entryFeeInstructions: a.string(),    // hasta 500 chars (validado en handler + FE)
```

**`polla-backend/amplify/data/resource.ts` — Membership (extender modelo existente)**

```ts
// null = cuota pendiente / timestamp = marcado pagado por el admin.
entryFeePaidAt: a.datetime(),
```

**Autorización:**

- `entryFeeEnabled` y `entryFeeInstructions`: read = authenticated (igual que el resto de Group), write = `ownerDefinedIn('adminUserId')` (ya existente).
- `entryFeePaidAt`: read = authenticated (igual que el resto de Membership). Write SOLO vía mutation custom `markEntryFeePaid` (la autorización model-level de Membership ya restringe writes a Cognito `admins`).

**Decisión sobre visibilidad lateral del estado:** la auth de Membership permite que cualquier user logged-in lea `entryFeePaidAt` de cualquier miembro. La regla "solo el admin ve el estado" se enforce **client-side** filtrando la columna al renderizar. Para enforcement server-side fuerte, va a `SECURITY-AUDIT.md` como follow-up (mismo patrón documentado para `Group.joinCode`).

**Migración:** Ambos campos opcionales con defaults `false` / `null` → backward-compatible. Grupos existentes quedan con cuota apagada, sin necesidad de migración manual.

---

## 3. Mutations backend

### 3.1 `createGroup` — extender (`polla-backend/amplify/functions/create-group/`)

**Nuevos args opcionales:**

```ts
entryFeeEnabled: a.boolean(),
entryFeeInstructions: a.string(),
```

**Lógica del handler:**

- Si `entryFeeEnabled === true`:
  - Validar `entryFeeInstructions` no vacío trim → error `ENTRY_FEE_INSTRUCTIONS_REQUIRED`.
  - Validar `entryFeeInstructions.length ≤ 500` → error `ENTRY_FEE_INSTRUCTIONS_TOO_LONG`.
  - Persistir ambos campos en el row de Group.
  - En el mismo `TransactWrite` que crea la Membership del admin, setear `entryFeePaidAt: new Date().toISOString()` (admin auto-paid).
- Si `entryFeeEnabled === false` o args omitidos:
  - Group defaults (`false` / `null`). Membership del admin con `entryFeePaidAt: null`.

### 3.2 `markEntryFeePaid` — mutation custom NUEVA

**Path:** `polla-backend/amplify/functions/mark-entry-fee-paid/`

**Args:**

```ts
groupId: a.id().required(),
userId: a.id().required(),    // miembro target (puede ser uno mismo si es admin)
paid: a.boolean().required(),
```

**Returns:** `{ ok: boolean, message: string, paidAt: string | null }`

**Lógica:**

1. Leer Group por `groupId`. Si no existe → error.
2. Comparar `group.adminUserId` con caller sub. Si no coincide → error `ENTRY_FEE_NOT_GROUP_ADMIN`.
3. Leer Membership por `(groupId, userId)`. Si no existe → error.
4. Si `paid === true`: setear `entryFeePaidAt = new Date().toISOString()`.
5. Si `paid === false`: setear `entryFeePaidAt = null`.
6. Devolver `{ ok: true, message: '...', paidAt }`.

**Nota:** la mutation NO valida que `group.entryFeeEnabled === true`. Decisión: el admin puede marcar/desmarcar incluso si la cuota está apagada, porque al volver a encenderla el estado debe preservarse (sección 1, decisión 3).

### 3.3 Update de Group desde el cliente

Group ya permite update directo vía `allow.ownerDefinedIn('adminUserId').to(['update'])`. El admin puede mutar `entryFeeEnabled` y `entryFeeInstructions` desde el cliente sin mutation custom adicional. La pantalla de Editar grupo hace esto + llama `markEntryFeePaid` para su propio auto-paid (ver Sección 5.2).

---

## 4. UI — Modal de crear grupo

**Archivo:** `src/app/shared/layout/group-actions-modals.component.ts`

**Sección nueva**, debajo del bloque actual de modo/comodines:

```
─────────────────────────────────────
[ ] Cobrar cuota de ingreso al grupo
    Si la activas, cada miembro verá un recordatorio
    hasta que lo marques como pagado.

  ⤷ (cuando ON)
    Instrucciones de pago
    ┌──────────────────────────────────┐
    │ Ej: Depositar $20 USD a la cuenta│
    │ XXXXXX a nombre de Juan, y      │
    │ enviar el comprobante por       │
    │ WhatsApp a +593 XXX-XXXX.       │
    └──────────────────────────────────┘
    Hasta 500 caracteres        342/500
─────────────────────────────────────
```

**Component state (signals nuevos):**

```ts
entryFeeEnabled = signal(false);
entryFeeInstructions = '';   // ngModel, consistente con description
```

**Comportamiento:**

- Default toggle OFF.
- Activar toggle → textarea aparece (animación 200ms suave, respeta `prefers-reduced-motion`). Queda `required`.
- Desactivar → textarea se oculta pero el valor se preserva en memoria (UX: si el admin re-activa, no pierde lo escrito).
- Contador `n/500` cambia a color de alerta al pasar 450 chars (mismo patrón que description).

**Validación submit:**

- `entryFeeEnabled() === true && entryFeeInstructions.trim() === ''` → error inline en el campo: "Las instrucciones son obligatorias si activás la cuota." No llama API.
- `entryFeeInstructions.length > 500` → contador rojo, submit bloqueado.

**Args a `createGroup`:**

```ts
const args = {
  name, tournamentId, mode,
  description: description.trim() || undefined,
  ...(mode === 'COMPLETE' ? { comodinesEnabled: comodinesEnabled() } : {}),
  ...(entryFeeEnabled() ? {
    entryFeeEnabled: true,
    entryFeeInstructions: entryFeeInstructions.trim(),
  } : {}),
};
```

**Tono:** tú (consistente con `project_ux_redesign_decisions`). Sin emojis.

---

## 5. UI — Editar grupo

**Archivo:** `src/app/features/groups/group-edit.component.ts`

### 5.1 Bloque "Cuota de ingreso"

Insertar **debajo del bloque de Premios**, antes de los read-only de modo/comodines. Misma estructura visual que en el modal de crear.

**Carga inicial:**

- Si `group.entryFeeEnabled === true` → toggle ON, textarea visible y poblado con `group.entryFeeInstructions`.
- Si false/null → toggle OFF, textarea oculto.

### 5.2 Transiciones al guardar

| Estado anterior | Estado nuevo | Acción extra |
|---|---|---|
| OFF | OFF | nada |
| OFF | ON | `updateGroup` + `markEntryFeePaid({ groupId, userId: me, paid: true })` (admin auto-paid) |
| ON | OFF | `updateGroup` con `entryFeeEnabled=false`. Las `entryFeePaidAt` de las Memberships **se preservan** (no se borran). |
| ON | ON (instrucciones distintas) | `updateGroup`. No tocar Memberships. |

**Por qué `markEntryFeePaid` para el auto-paid post-activación**: la auth de Membership restringe writes a Cognito `admins` (el grupo `admins` global, no el adminUserId del grupo). El admin del grupo no puede update Membership directo desde el cliente. La mutation `markEntryFeePaid` ya valida que el caller es admin del grupo → es el path autorizado, incluso para uno mismo.

### 5.3 Dirty form tracking

Extender el `DirtyAware` ya existente con los 2 campos nuevos:

```ts
dirty(): boolean {
  return this.name !== this.original.name
      || this.description !== this.original.description
      || /* …existing checks… */
      || this.entryFeeEnabled() !== this.original.entryFeeEnabled
      || this.entryFeeInstructions !== this.original.entryFeeInstructions;
}
```

Salir sin guardar con cambios → `confirmDialog` ya wireado.

### 5.4 Validación

Mismas reglas que en el modal de crear (sección 4).

---

## 6. UI — Group detail

**Archivo:** `src/app/features/groups/group-detail.component.ts`

### 6.1 Tabla de integrantes — columna "Cuota" (solo admin)

Condición de render: `isAdmin() && group.entryFeeEnabled === true`.

```
| Miembro    | Pts | …existentes… | Cuota                |
|------------|-----|--------------|----------------------|
| Juan (tú)  | 24  | …            | ✓ Pagada             |
| María      | 18  | …            | [ ] Marcar pagada    |
| Pedro      | 12  | …            | ✓ Pagada · 28 may    |
```

**Checkbox behavior:**

- Click → `markEntryFeePaid({ groupId, userId, paid: !current })`.
- **Optimistic update**: signal local refleja el cambio inmediato. Si la mutation falla → rollback + toast de error con `humanizeError(err)`.
- Durante la mutation in-flight: checkbox `disabled` para prevenir double-click.
- Tooltip hover desktop: "Marcar como pagada" / "Quitar marca" via `[title]`.
- Hit-target mobile: 44×44px (regla universal).

**Fila del admin propio:**

- Render fijo `✓ Pagada` (no checkbox interactivo). Para "des-marcarse", el admin tiene que apagar la cuota desde Editar grupo. Decisión para evitar UX confuso ("el admin se desmarcó a sí mismo y el grupo ve raro").

**No-admin users:** la columna NO se renderiza en su DOM. Tabla idéntica a la actual.

### 6.2 Recordatorio flotante

Condición de render: `group.entryFeeEnabled && currentUserMembership.entryFeePaidAt === null`.

**Posicionamiento:**

- Desktop ≥1100px y tablet 768–1099px: `position: fixed; bottom: 24px; right: 24px; z-index: var(--z-overlay)` (= 100, sin solapar modales que están en `--z-modal`).
- Mobile <768px: `bottom: calc(var(--bp-bottom-nav) + 16px); right: 16px` para no tapar el bottom-nav.

**Apariencia (design tokens A1):**

```
┌─────────────────────────────────┐
│ ⚠ Tu cuota está pendiente       │
│   Tocá para ver las instrucciones│
└─────────────────────────────────┘
```

- Fondo `var(--wf-warn-soft)`, borde `1px solid var(--wf-warn)` (tokens ya existentes en `src/styles/tokens.css:128-129`).
- Padding `var(--space-3) var(--space-4)`, radio `var(--radius-md)`.
- Hit-target ≥44px.
- Ícono Lucide `alert-circle` vía `<app-icon name="alert-circle" [decorative]="true">`.
- `aria-label="Cuota de ingreso pendiente. Ver instrucciones."`
- `role="button"`, tabbable, Enter/Space activan.
- Animación entrada: fade-in 200ms. Respeta `prefers-reduced-motion`.

**Tap/click → abre `<app-modal>` (componente compartido A2):**

```
┌──────────────────────────────────┐
│ Instrucciones de pago        [X] │
├──────────────────────────────────┤
│ Depositar $20 USD a la cuenta    │
│ XXXXXX a nombre de Juan, y      │
│ enviar el comprobante por        │
│ WhatsApp a +593 XXX-XXXX.       │
│                                  │
│ Cuando el admin marque tu cuota  │
│ como pagada, este recordatorio   │
│ desaparece.                      │
├──────────────────────────────────┤
│              [ Entendido ]       │
└──────────────────────────────────┘
```

- Body con `white-space: pre-line` para respetar saltos de línea (mismo patrón que `group-hero__description`).
- Footer slot con CTA único "Entendido" (cierra modal).
- `aria-describedby` apunta al texto de instrucciones.
- Renderizar siempre con `{{ }}` (Angular escapa). **No usar `[innerHTML]`** — el textarea es texto libre del admin y puede contener HTML/script si se confía.

### 6.3 Live updates

- Refetch de la Membership del user cuando la ventana recupera foco: `@HostListener('window:focus')` → `loadMembership()`.
- Refetch después de cualquier mutation propia del user (ej. usar comodín).
- **Sin subscription GraphQL** — es overhead innecesario para una feature con cambios infrecuentes. Polling on-focus cubre el 99% de los casos.

---

## 7. Edge cases

| Caso | Comportamiento |
|---|---|
| User abre la pantalla mientras el admin acaba de apagar la cuota | Refetch on focus actualiza `entryFeeEnabled=false` → recordatorio y columna desaparecen. |
| Admin marca pagada → mutation falla | Optimistic update revierte. Toast con `humanizeError`. |
| Doble-click rápido en el checkbox | Checkbox `disabled` mientras la mutation está in-flight. |
| User en varios grupos con cuota | Cada `/groups/:id` fetch independiente. Recordatorio refleja el grupo visible. Sin estado global. |
| User es removido del grupo | Membership desaparece → recordatorio + columna gone. |
| Admin transfiere el grupo | Nuevo admin hereda capacidad de marcar pagados. Su propio `entryFeePaidAt` NO se auto-resetea por transfer. |
| Grupo se borra | `deleteGroup` ya borra Memberships en cascada. |
| Instrucciones con HTML/script | Renderizado con `{{ }}` + `white-space: pre-line`. Sin `[innerHTML]`. |
| Instrucciones con URLs | Texto plano. Auto-linkify queda como follow-up. |
| Mode SIMPLE vs COMPLETE | Cuota aplica a ambos. No relacionado con scoring. |
| Grupos pre-feature | Default `entryFeeEnabled=false` → 0 cambios visibles. |
| Joins nuevos con cuota activa | Lambda `joinGroup` crea Membership con default `entryFeePaidAt=null`. No requiere cambios en `joinGroup`. |
| Co-admin (futuro hipotético) | No aplica hoy (single admin por `Group.adminUserId`). |

**Domain errors a agregar en `src/app/core/notifications/domain-errors.ts`:**

| Código | Mensaje user-facing |
|---|---|
| `ENTRY_FEE_INSTRUCTIONS_REQUIRED` | "Las instrucciones son obligatorias si activás la cuota." |
| `ENTRY_FEE_INSTRUCTIONS_TOO_LONG` | "Las instrucciones no pueden superar los 500 caracteres." |
| `ENTRY_FEE_NOT_GROUP_ADMIN` | "Solo el admin del grupo puede marcar cuotas." |

---

## 8. Testing

### Backend — Vitest

`polla-backend/amplify/functions/create-group/__tests__/handler.spec.ts`:

- `createGroup({ entryFeeEnabled: true, entryFeeInstructions: "..." })` persiste 2 campos + Membership admin con `entryFeePaidAt` set.
- `createGroup` con `entryFeeEnabled=true` + instructions vacío → error `ENTRY_FEE_INSTRUCTIONS_REQUIRED`.
- `createGroup` con `entryFeeEnabled=true` + instructions >500 chars → error `ENTRY_FEE_INSTRUCTIONS_TOO_LONG`.
- `createGroup` con args omitidos o `entryFeeEnabled=false` → defaults · Membership con `entryFeePaidAt=null`.

`polla-backend/amplify/functions/mark-entry-fee-paid/__tests__/handler.spec.ts`:

- `paid=true` por el admin del grupo → Membership target con `entryFeePaidAt` set; `ok=true`.
- `paid=false` → Membership con `entryFeePaidAt=null`.
- Caller no es admin del grupo → error `ENTRY_FEE_NOT_GROUP_ADMIN`, Membership intacta.
- Grupo con `entryFeeEnabled=false` → mutation sigue funcionando (preserva estado para reactivaciones).

### Frontend — Jest + Angular Testing Library

`src/app/shared/layout/group-actions-modals.component.spec.ts`:

- Toggle ON revela textarea, queda `required`, contador funciona.
- Submit con toggle ON + instructions vacío → error inline, no llama API.
- Submit válido pasa `entryFeeEnabled` y `entryFeeInstructions` al `ApiService.createGroup`.

`src/app/features/groups/group-edit.component.spec.ts`:

- Carga refleja existing values del grupo.
- Transición OFF→ON dispara `updateGroup` + `markEntryFeePaid({ paid: true })` para admin self.
- Dirty form trigger `confirmDialog` al salir.

`src/app/features/groups/group-detail.component.spec.ts`:

- Columna Cuota oculta para no-admin.
- Columna visible para admin con `entryFeeEnabled=true`.
- Checkbox del admin propio es read-only (click no dispara mutation).
- Click checkbox de otro user → optimistic update + mutation; rollback si falla.
- Recordatorio aparece cuando `entryFeePaidAt === null`.
- Recordatorio oculto cuando timestamp set.
- Tap recordatorio abre `<app-modal>` con texto del grupo, `white-space: pre-line` preservado.
- Window focus dispara `loadMembership()`.

**Coverage:** no bajar el threshold del repo. Handlers nuevos y componentes modificados a 100%.

**Smoke manual** (no automable hoy):

1. Crear grupo con cuota → ver textarea en modal.
2. Joinear con otro user → ver recordatorio.
3. Click recordatorio → ver modal instrucciones.
4. Admin marca pagado → recordatorio gone en próximo refetch (focus o navegación).
5. Editar grupo: apagar/encender cuota → estado de pagos preservado.
6. Cambio de instrucciones se refleja en el modal del user al próximo focus.

---

## 9. Archivos afectados (resumen)

**Backend (`polla-backend/`):**

- `amplify/data/resource.ts` — extender Group (2 campos) + Membership (1 campo) + agregar mutation `markEntryFeePaid` al schema.
- `amplify/functions/create-group/handler.ts` — args + validación + auto-paid en TransactWrite.
- `amplify/functions/create-group/resource.ts` — sin cambios (resource ya está).
- `amplify/functions/mark-entry-fee-paid/handler.ts` — **NUEVO**.
- `amplify/functions/mark-entry-fee-paid/resource.ts` — **NUEVO**.
- `amplify/backend.ts` — registrar nueva function.
- Tests Vitest mencionados en sección 8.

**Frontend (`polla-app/`):**

- `src/app/core/api/api.service.ts` — método `markEntryFeePaid(args)` + extender `createGroup` types.
- `src/app/core/notifications/domain-errors.ts` — 3 códigos nuevos.
- `src/app/shared/layout/group-actions-modals.component.ts` — toggle + textarea + validación.
- `src/app/features/groups/group-edit.component.ts` — bloque nuevo + auto-paid + dirty extend.
- `src/app/features/groups/group-detail.component.ts` — columna Cuota + recordatorio + modal.
- `src/styles/tokens.css` — sin cambios. Reusamos `--wf-warn-soft` (línea 129) para fondo y `--wf-warn` (línea 128) para borde.
- Tests Jest mencionados en sección 8.

---

## 10. No-goals (fuera de scope, explícito)

- Pagos in-app (Stripe, MercadoPago, etc).
- Sumas/totales del pozo del grupo.
- Auto-linkify de URLs en las instrucciones.
- Multi-admin con permisos compartidos para marcar pagados.
- Notificaciones push o email cuando admin marca como pagado.
- Recordatorio global cross-grupo.
- Bloqueo de picks/ranking por cuota impaga.
- Historial / audit log de mark/unmark.
- Co-admins.
