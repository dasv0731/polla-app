# Empresas — Master Design (5 sub-proyectos)

> **Fecha:** 2026-05-30
> **Estado:** Sub-proyecto 1 (Companies Foundation) aprobado y listo para writing-plans. Sub-proyectos 2-5 pendientes de brainstorming individual después de implementar 1.
> **Scope global:** sistema multi-tenant para empresas, con grupos, branding white-label, invitaciones masivas, actividades de comodines, y panel admin propio.

---

## Visión general

"Empresas" es un sistema multi-tenant sobre la app de polla actual:

- Una empresa (`Company`) es un tenant que **agrupa N grupos** bajo una marca propia.
- La empresa tiene **company-admins** (uno o más, co-equals) que gestionan TODO sobre los grupos de la empresa, incluyendo branding (logo + colores), invitaciones masivas, actividades, premios.
- Los **partidos y resultados** SOLO los edita el super-admin (Cognito group `admins` global). Los company-admins ven los partidos como cualquier user pero no los pueden modificar.
- Los usuarios pueden estar en **grupos de empresa y grupos individuales simultáneamente** sin restricción.
- El "admin de grupo" actual (`Group.adminUserId`) sigue existiendo; los company-admins son una capa superior con acceso implícito a todos los grupos de su empresa.

### Descomposición en sub-proyectos

El sistema se construye en 5 fases secuenciales. Cada una tiene su propio spec → plan → implementación. Solo el **Sub-proyecto 1** se diseña en detalle en este documento.

| # | Sub-proyecto | Resumen | Depende de |
|---|---|---|---|
| **1** | **Companies foundation** (este spec) | Entidades Company + CompanyMember + Group.companyId. Auth helper. Mutations CRUD para super-admin. UI super-admin (`/admin/companies`). | — |
| 2 | White-label theming | Logo + colores per Company aplicados en runtime cuando el user navega un grupo de esa empresa. CSS variable overrides scoped. | 1 |
| 3 | Bulk invitations + approval | Upload masivo de emails desde el panel company-admin. Approval workflow: joiners pendientes hasta que un company-admin acepta. | 1 |
| 4 | Activities system | Reemplazo/extensión de sponsor codes: la empresa define actividades (CSV/UI) que dan comodines o puntos al user al completarlas. Nuevo `ComodinSource: 'COMPANY_ACTIVITY'`. | 1 |
| 5 | Company admin panel UI | Surface separada de `/admin` (super-admin). Tabs: configuración company / grupo / trivias / comodines (activities) / métricas / premios / miembros. Consolida y expone todo 1-4 para los company-admins. | 1, 2, 3, 4 |

Después de Sub-proyecto 1 (este doc), se brainstormea **uno a la vez en orden** cada sub-proyecto restante para spec → plan → impl. Hasta entonces los sub-proyectos 2-5 quedan a nivel de outline.

---

## Sub-proyecto 1 — Companies Foundation · Design completo

### Decisiones de producto bloqueadas en el brainstorming

1. **1 Company = N grupos** (flat, sin jerarquía de departamentos). Group gana un campo opcional `category` (string libre) para agrupación visual en el admin panel, sin permission scoping a nivel categoría.
2. **Solo super-admin crea Companies** desde el panel `/admin` existente. Asigna el primer company-admin por user ID. Self-service signup (Stripe) queda fuera de scope.
3. **N company-admins co-equals** por Company. El primer admin puede invitar a más desde el panel company (que se construye en Sub-5). Per Sub-1, super-admin agrega/remueve admins.
4. **Group.adminUserId queda igual** — siempre apunta a un user que es el admin per-grupo. Los company-admins tienen acceso implícito a todos los grupos de su empresa, sin necesidad de estar listados como `Group.adminUserId`.
5. **CompanyMember table con role enum** (`ADMIN | MEMBER`). En Sub-1 solo se usa el rol ADMIN; el MEMBER queda definido en el schema para Sub-3 (bulk invites + employee directory).
6. **Cleanup al remover company-admin**: el row CompanyMember se borra (no se degrada a MEMBER) hasta que Sub-3 introduzca MEMBER role real.

---

### 1. Modelo de datos

Cambios en `polla-backend/amplify/data/resource.ts`.

#### 1.1 Nueva entidad `Company`

```ts
CompanyStatus: a.enum(['ACTIVE', 'DISABLED']),

Company: a.model({
  name: a.string().required(),               // "Coca-Cola Ecuador" — 3-80 chars
  status: a.ref('CompanyStatus').required().default('ACTIVE'),
  contactEmail: a.email(),                   // opcional, contacto comercial
  description: a.string(),                   // opcional, texto libre

  // Branding (Sub-proyecto 2 los consume; en Sub-1 solo los persistimos)
  logoKey: a.string(),                       // S3 storage key del logo custom
  brandPrimary: a.string(),                  // "#RRGGBB" hex
  brandPrimaryDark: a.string(),              // "#RRGGBB" para gradient pair
  brandAccent: a.string(),                   // "#RRGGBB" opcional

  createdAt: a.datetime().required(),
})
.authorization((allow) => [
  allow.authenticated().to(['read']),        // any logged-in user lee (Sub-2 necesita esto para resolver branding del grupo donde es miembro)
  allow.group('admins'),                     // super-admin write
])
```

#### 1.2 Nueva entidad `CompanyMember`

```ts
CompanyMemberRole: a.enum(['ADMIN', 'MEMBER']),

CompanyMember: a.model({
  companyId: a.id().required(),
  userId: a.id().required(),
  role: a.ref('CompanyMemberRole').required(),
  invitedAt: a.datetime().required(),
  joinedAt: a.datetime(),                    // null = invited (Sub-3) | set = aceptó o fue agregado directo (Sub-1 siempre lo setea)
})
.secondaryIndexes((idx) => [
  idx('companyId').name('membersByCompany'),
  idx('userId').name('companiesByUser'),
])
.authorization((allow) => [
  allow.authenticated().to(['read']),        // queries por user/company son comunes
  allow.group('admins'),                     // super-admin write
  // Mutations custom (add/remove-company-admin) manejan la escritura cuando es company-admin no-super
])
```

#### 1.3 Modificar `Group`

Extender el modelo existente con 2 campos nuevos opcionales:

```ts
Group: a.model({
  // ...todos los campos existentes preservados (name, tournamentId, adminUserId,
  //    joinCode, mode, description, imageKey, prize1st/2nd/3rd, comodinesEnabled,
  //    entryFeeEnabled, entryFeeInstructions, etc.)...

  companyId: a.id(),                         // nullable: null = grupo individual (como hoy)
  category: a.string(),                      // libre, solo aplica si companyId set
})
.secondaryIndexes((idx) => [
  // ...indexes existentes preservados...
  idx('companyId').name('groupsByCompany'),  // NUEVO
])
```

**Backward compatibility**: todos los Groups existentes quedan con `companyId = null` → siguen comportándose como grupos individuales. Cero migración manual necesaria.

---

### 2. Permisos y autorización

#### 2.1 Modelo mental — 3 niveles de admin

```
Super-admin (Cognito group 'admins')
  ↓ puede TODO, incluido crear Companies y editar partidos/resultados
Company-admin (CompanyMember.role = 'ADMIN' para una company X)
  ↓ puede TODO sobre los grupos con companyId = X
  ↓ NO toca otras companies, partidos, ni resultados
Group-admin (Group.adminUserId === userId)
  ↓ gestiona ese grupo específico (igual que hoy)
```

#### 2.2 Matriz de permisos para Sub-1

| Acción | Quién puede |
|---|---|
| Crear Company | Solo super-admin |
| Editar Company (nombre, branding, status, contactEmail, descripción) | Super-admin O cualquier company-admin de esa company |
| `setCompanyStatus` (Disable / Reactivate) | Solo super-admin |
| Listar Companies | Cualquier authenticated user (Sub-2 necesita esto) |
| Agregar company-admin | Super-admin O cualquier company-admin de la company target |
| Remover company-admin | Super-admin O cualquier company-admin de la company target. Safeguard: no se puede remover al último admin. |
| Crear Group bajo Company X | Super-admin O company-admin de X |
| Editar Group bajo Company X | Super-admin O company-admin de X O `Group.adminUserId` |
| Asignar/cambiar `Group.adminUserId` de un grupo de empresa | Super-admin O company-admin de X |
| Crear Group individual (`companyId = null`) | Cualquier authenticated user (como hoy) |
| Editar Group individual | `Group.adminUserId` (como hoy) |

#### 2.3 Auth helper compartido

Crear `polla-backend/src/lib/auth.ts`:

```ts
import { DynamoDBDocumentClient, QueryCommand, GetCommand } from '@aws-sdk/lib-dynamodb';

/** True if userId tiene CompanyMember row con role=ADMIN para companyId. */
export async function isCompanyAdmin(
  ddb: DynamoDBDocumentClient,
  tableName: string,                         // CompanyMember table
  indexName: string,                         // 'companiesByUser'
  userId: string,
  companyId: string,
): Promise<boolean> {
  const res = await ddb.send(new QueryCommand({
    TableName: tableName,
    IndexName: indexName,
    KeyConditionExpression: 'userId = :u',
    ExpressionAttributeValues: { ':u': userId },
  }));
  return (res.Items ?? []).some(
    (m) => (m as { companyId: string; role: string }).companyId === companyId
        && (m as { companyId: string; role: string }).role === 'ADMIN'
  );
}

/** True if userId es super-admin (Cognito group 'admins') O company-admin del
 *  group's company O group-admin (Group.adminUserId).
 *  El caller pasa los Cognito groups del token. */
export async function isGroupAdminOrAbove(
  ddb: DynamoDBDocumentClient,
  groupTable: string,
  companyMemberTable: string,
  companyMemberIndex: string,
  userId: string,
  groupId: string,
  cognitoGroups: ReadonlyArray<string>,
): Promise<boolean> {
  if (cognitoGroups.includes('admins')) return true;
  const groupRes = await ddb.send(new GetCommand({
    TableName: groupTable,
    Key: { id: groupId },
  }));
  const group = groupRes.Item as { adminUserId: string; companyId?: string | null } | undefined;
  if (!group) return false;
  if (group.adminUserId === userId) return true;
  if (group.companyId) {
    return await isCompanyAdmin(ddb, companyMemberTable, companyMemberIndex, userId, group.companyId);
  }
  return false;
}
```

#### 2.4 Estrategia de enforcement

**Patrón único**: mutations custom server-side (Lambda) validan permisos. **NO** confiamos en authorization model-level para escrituras sensibles. Los handlers usan el auth helper de §2.3.

---

### 3. Mutations backend

#### 3.1 Nuevas mutations

##### `createCompany` (super-admin only)

```ts
// Schema
createCompany: a.mutation()
  .arguments({
    name: a.string().required(),
    contactEmail: a.email(),
    description: a.string(),
    firstAdminUserId: a.id().required(),
  })
  .returns(a.customType({
    id: a.id().required(),
    message: a.string().required(),
  }))
  .authorization((allow) => [allow.group('admins')])
  .handler(a.handler.function(createCompany)),
```

**Handler logic** (`amplify/functions/create-company/handler.ts`):
1. Valida caller en Cognito group `admins`.
2. Valida name 3-80 chars trimmed. Si falla → `VALIDATION_ERROR`.
3. Valida contactEmail formato (regex). Si falla → `VALIDATION_ERROR`.
4. `GetUser` (sub = firstAdminUserId). Si no existe → `VALIDATION_ERROR`.
5. `TransactWrite`:
   - Put Company (id = ulid, status = ACTIVE, createdAt = now, name + opcionales seteados).
   - Put CompanyMember (companyId, userId = firstAdminUserId, role = ADMIN, invitedAt = now, joinedAt = now).
6. Returns `{ id, message: "Empresa creada" }`.

##### `updateCompany` (super-admin O company-admin)

```ts
updateCompany: a.mutation()
  .arguments({
    id: a.id().required(),
    name: a.string(),
    contactEmail: a.email(),
    description: a.string(),
    logoKey: a.string(),
    brandPrimary: a.string(),
    brandPrimaryDark: a.string(),
    brandAccent: a.string(),
  })
  .returns(a.customType({ ok: a.boolean().required(), message: a.string().required() }))
  .authorization((allow) => [allow.authenticated()])
  .handler(a.handler.function(updateCompany)),
```

**Handler logic**:
1. `GetCompany`. Si no existe → `COMPANY_NOT_FOUND`.
2. Check permission: super-admin O `isCompanyAdmin(caller, id)`. Si falla → `NOT_COMPANY_ADMIN`.
3. Si Company.status === 'DISABLED' y caller NO es super-admin → `COMPANY_DISABLED`.
4. Validate `name` 3-80 si vino. `brandPrimary/Dark/Accent` con regex `#[0-9a-fA-F]{6}` si vinieron.
5. Sparse `Update` con `SET` expressions solo para campos que llegaron.
6. Returns `{ ok: true, message: "Cambios guardados" }`.

##### `setCompanyStatus` (super-admin only)

```ts
setCompanyStatus: a.mutation()
  .arguments({
    id: a.id().required(),
    status: a.ref('CompanyStatus').required(),
  })
  .returns(a.customType({ ok: a.boolean().required() }))
  .authorization((allow) => [allow.group('admins')])
  .handler(a.handler.function(setCompanyStatus)),
```

**Handler logic**:
1. Valida caller en Cognito group `admins`.
2. `GetCompany`. Si no existe → `COMPANY_NOT_FOUND`.
3. `Update` status + updatedAt.

##### `addCompanyAdmin` (super-admin O company-admin)

```ts
addCompanyAdmin: a.mutation()
  .arguments({
    companyId: a.id().required(),
    userId: a.id().required(),
  })
  .returns(a.customType({ ok: a.boolean().required(), message: a.string().required() }))
  .authorization((allow) => [allow.authenticated()])
  .handler(a.handler.function(addCompanyAdmin)),
```

**Handler logic**:
1. `GetCompany`. Si no existe → `COMPANY_NOT_FOUND`.
2. Si status === 'DISABLED' y caller NO super-admin → `COMPANY_DISABLED`.
3. Check permission: super-admin O `isCompanyAdmin(caller, companyId)`.
4. `GetUser` (sub = userId). Si no existe → `VALIDATION_ERROR`.
5. `Query` companiesByUser con userId. Si ya existe row con companyId y role=ADMIN → idempotente, return `{ ok: true, message: "Ya era admin" }`.
6. `Put` CompanyMember (companyId, userId, role=ADMIN, invitedAt=now, joinedAt=now).
7. Returns `{ ok: true, message: "Admin agregado" }`.

##### `removeCompanyAdmin` (super-admin O company-admin)

```ts
removeCompanyAdmin: a.mutation()
  .arguments({
    companyId: a.id().required(),
    userId: a.id().required(),
  })
  .returns(a.customType({ ok: a.boolean().required(), message: a.string().required() }))
  .authorization((allow) => [allow.authenticated()])
  .handler(a.handler.function(removeCompanyAdmin)),
```

**Handler logic**:
1. `GetCompany`. Si no existe → `COMPANY_NOT_FOUND`.
2. Check permission: super-admin O `isCompanyAdmin(caller, companyId)`.
3. `Query` membersByCompany para contar admins (role=ADMIN). Si count <= 1 y target es uno de esos → `LAST_COMPANY_ADMIN`.
4. Find target CompanyMember row (companyId, userId, role=ADMIN). Si no existe → idempotente, `{ ok: true, message: "No era admin" }`.
5. `Delete` el row.
6. Returns `{ ok: true, message: "Admin removido" }`.

**Nota**: en Sub-1 borramos el row. En Sub-3 esto se actualiza a "downgrade a MEMBER si existe membership en otra parte por bulk invite".

##### `createCompanyGroup` (super-admin O company-admin)

```ts
createCompanyGroup: a.mutation()
  .arguments({
    companyId: a.id().required(),
    name: a.string().required(),
    tournamentId: a.id().required(),
    mode: a.ref('GameMode').required(),
    category: a.string(),
    description: a.string(),
    imageKey: a.string(),
    comodinesEnabled: a.boolean(),
    entryFeeEnabled: a.boolean(),
    entryFeeInstructions: a.string(),
    adminUserId: a.id(),                     // opcional; default al caller
  })
  .returns(a.customType({
    id: a.id().required(),
    joinCode: a.string().required(),
  }))
  .authorization((allow) => [allow.authenticated()])
  .handler(a.handler.function(createCompanyGroup)),
```

**Handler logic**:
1. `GetCompany`. Si no existe → `COMPANY_NOT_FOUND`.
2. Si status === 'DISABLED' → `COMPANY_DISABLED` (incluso para super-admin acá, porque crear grupo nuevo bajo company disabled no tiene sentido).
3. Check permission: super-admin O `isCompanyAdmin(caller, companyId)`.
4. Resolver `effectiveAdminUserId = adminUserId ?? caller`.
5. Si `adminUserId` viene: `GetUser` para validar existe. Si no → `VALIDATION_ERROR`.
6. Reutiliza la lógica de `createGroup` actual (validations de mode/name/description, joinCode generation con retry, entryFee validation, TransactWrite de Group + InviteCode + Membership + UGT).
7. Diferencias respecto al `createGroup` existente:
   - Group.companyId set.
   - Group.category set si vino.
   - Group.adminUserId = effectiveAdminUserId.
   - Membership.userId = effectiveAdminUserId, no necesariamente el caller.

#### 3.2 Extensión de mutations existentes

Las siguientes mutations existentes ahora deben aceptar también company-admin además del group-admin actual. Esto requiere convertir el authorization model-level a custom mutation (si no lo es ya) y usar `isGroupAdminOrAbove`:

##### `updateGroup`

`amplify/data/resource.ts`: el modelo Group hoy tiene `allow.ownerDefinedIn('adminUserId').to(['update'])`. Esta autorización model-level NO sabe de company-admins.

**Cambio**: agregamos una mutation custom `updateCompanyGroup` que cubre el caso company. Para grupos individuales seguimos usando el path actual (model-level + frontend llama directo `models.Group.update`).

```ts
// Nueva mutation custom para grupos de empresa
updateCompanyGroup: a.mutation()
  .arguments({
    id: a.id().required(),
    name: a.string(),
    description: a.string(),
    imageKey: a.string(),
    category: a.string(),
    entryFeeEnabled: a.boolean(),
    entryFeeInstructions: a.string(),
    prize1st: a.string(),
    prize2nd: a.string(),
    prize3rd: a.string(),
    adminUserId: a.id(),                     // reasignar group-admin (opcional)
  })
  .returns(a.customType({ ok: a.boolean().required(), message: a.string().required() }))
  .authorization((allow) => [allow.authenticated()])
  .handler(a.handler.function(updateCompanyGroup)),
```

**Handler logic**:
1. `GetGroup`. Si no existe → `GROUP_NOT_FOUND`.
2. Si `group.companyId === null` → `VALIDATION_ERROR` "Esta mutation es solo para grupos de empresa, usá `updateGroup` para grupos individuales".
3. Check permission: super-admin O `isCompanyAdmin(caller, group.companyId)` O `caller === group.adminUserId`. Si falla → `NOT_COMPANY_ADMIN` o equivalente.
4. Si company status === 'DISABLED' y caller NO super-admin → `COMPANY_DISABLED`.
5. Sparse update sobre los campos que llegaron.
6. Returns `{ ok: true, message: "Grupo actualizado" }`.

**Nota**: frontend decide qué mutation llamar según si `group.companyId` está set. El `group-edit.component.ts` (que ya existe) se extiende para usar la mutation correcta.

##### `deleteGroup`

Misma extensión: si `group.companyId !== null`, usar el helper `isGroupAdminOrAbove`. Hoy es una mutation custom ya, solo cambia la check de permission.

##### `removeMember`

Misma extensión: si el grupo es de empresa, super-admin O company-admin O group-admin puede remover.

---

### 4. Super-admin UI

Nuevas rutas en `polla-app`:

| Ruta | Componente | Propósito |
|---|---|---|
| `/admin/companies` | `CompaniesListComponent` | Lista de todas las companies con search + filter por status + botón crear |
| `/admin/companies/:id` | `CompanyDetailComponent` | Tabs: General · Admins · Grupos · Branding |
| (modal) | `CreateCompanyModalComponent` | Form de crear company |
| (componente reusable) | `AdminPickerComponent` | Autocomplete de user search (handle/email) |

#### 4.1 `CompaniesListComponent`

**Path**: `src/app/features/admin/companies/companies-list.component.ts`

**Layout**:
- Header con `<app-icon name="building">` "Empresas" + count badge ("12 activas · 3 desactivadas") + botón `+ Crear empresa`.
- Search input con filter live.
- Lista de companies (signal computed con filter aplicado). Cada row: name, status pill (`.pill--green` si ACTIVE, `.pill--grey` si DISABLED), counts (grupos · admins · miembros total), createdAt formato relativo, botones [Editar] [Detalles].
- Empty state si no hay companies: `<app-empty-block>` con CTA "Crear primera empresa".

**Data**:
- Carga inicial: `api.listCompanies()` (que devuelve todas + counts via lambda o N queries pequeñas; en Sub-1 acepto N queries, optimizar en Sub-5).
- Refresh on focus + después de modal close.

#### 4.2 `CompanyDetailComponent`

**Path**: `src/app/features/admin/companies/company-detail.component.ts`

**Layout**: tabs horizontales (4):

1. **General** (default):
   - Form editable: name, contactEmail, description.
   - Status toggle: badge ACTIVE/DISABLED + botón "Desactivar / Reactivar" → confirm dialog → `setCompanyStatus`.
   - Submit → `updateCompany` con dirty fields.
   - Dirty form guard (mismo patrón que `group-edit`).

2. **Admins**:
   - Lista de CompanyMember rows con role=ADMIN.
   - Cada row: avatar + handle + nombre + email + invitedAt + botón [Remover] (disabled si es el último, tooltip explica).
   - Botón `+ Agregar admin` → modal con `<app-admin-picker>` → click resultado → `addCompanyAdmin`.
   - Confirm dialog antes de remover.

3. **Grupos**:
   - Lista read-only de Groups con `companyId = id`.
   - Cada row: nombre, tournament label, mode, `Group.adminUserId` (handle), category badge si existe, count miembros, link a `/admin/groups/:groupId` (panel super-admin existente para gestión individual).
   - Filter por category (chips horizontales con `.chips/.chip`).
   - **Botón `+ Crear grupo`** (simple, solo super-admin en Sub-1; el panel fancy con drag & drop, defaults inteligentes, etc. vive en Sub-5 para los company-admins): abre `<app-modal>` con form básico (name, tournament select, mode SIMPLE/COMPLETE, category, adminUserId via `<app-admin-picker>`). Submit → `createCompanyGroup` mutation. Sirve para smoke-test end-to-end de Sub-1 sin esperar a Sub-5.

4. **Branding**:
   - Read-only preview: logo (img si logoKey, placeholder si no), swatches de colores (brandPrimary, brandPrimaryDark, brandAccent).
   - Nota inline: "La edición de branding vive en el panel company-admin (Sub-2)."

#### 4.3 `CreateCompanyModalComponent`

**Path**: `src/app/features/admin/companies/create-company-modal.component.ts`

**Layout**: `<app-modal>` con form:
- Nombre (required, 3-80 chars, contador)
- Contact email (opcional)
- Descripción (opcional, textarea max 500 chars)
- **Primer admin**: `<app-admin-picker>` (required)
- Botón "Crear" disabled hasta que name + firstAdmin estén OK.
- Submit → `createCompany` → cierra modal → redirige a `/admin/companies/:id`.

#### 4.4 `AdminPickerComponent`

**Path**: `src/app/features/admin/companies/admin-picker.component.ts`

**Behavior**:
- Input text con debounce 300ms.
- Al typear: llama `api.searchUsers(query)` (que ya existe o se agrega: por handle prefix O email substring, returns top 10).
- Lista de resultados con avatar + handle + email.
- Click resultado → emit `userSelected` con el user object.
- Clear button para reset.

**Reusable**: lo usa `CreateCompanyModalComponent` y el botón "+ Agregar admin" del tab Admins.

#### 4.5 Integración con sidebar admin existente

Agregar item nuevo al sidebar `/admin`:

```
Admin
├─ Partidos
├─ Resultados
├─ Equipos
├─ Sponsors
├─ Trivias
├─ Usuarios
└─ Empresas        ← NUEVO
```

#### 4.6 Componentes reusados (no nuevos)

- `<app-modal>` para todos los modals
- `<app-icon>` para todos los iconos (Lucide)
- `<app-empty-block>` para estados vacíos
- `<app-skeleton>` para loading states
- `<app-confirm-dialog>` para confirmaciones destructivas
- `<app-user-avatar>` para avatars en admin picker y lista de admins

---

### 5. Edge cases y comportamiento esperado

| Caso | Comportamiento |
|---|---|
| Super-admin crea Company con name duplicado | Permitido. Names no son únicos a nivel DB. Validación frontend es opcional UX-side. |
| `firstAdminUserId` del create no existe | Handler valida con `GetUser` antes del TransactWrite. Error `VALIDATION_ERROR` "Usuario no encontrado". |
| Add admin: user ya es admin de esa company | Idempotente: `{ ok: true, message: "Ya era admin" }`. No crea duplicado. |
| Add admin: user es admin de OTRA company | Permitido. Multi-tenant member. |
| Remove admin: target es el último admin | Error `LAST_COMPANY_ADMIN`. UI previene mostrando el botón disabled con tooltip. |
| Remove admin: caller se remueve a sí mismo | Permitido si no es el último. UI muestra confirm: "Vas a perder acceso al panel de esta empresa." |
| Super-admin remueve admin que tiene grupos como `Group.adminUserId` | Permitido. Esos grupos quedan con un admin que ya no es company-admin (sigue siendo group-admin de ese grupo individualmente). UI muestra warning con la lista de grupos afectados. |
| Company DISABLED + company-admin intenta editar | Mutations rechazan con `COMPANY_DISABLED`. UI bloquea las acciones. |
| Crear company-group bajo Company DISABLED | Error `COMPANY_DISABLED` incluso para super-admin. |
| `Group.companyId` apunta a Company que no existe | Inconsistencia. Frontend lo trata como grupo individual. Server-side log warning. |
| User intenta editar Company que no admina | Error `NOT_COMPANY_ADMIN`. UI no muestra botón Editar para este user. |
| Bulk delete de Company | NO en Sub-1. Solo `setStatus` a DISABLED. |
| Sin grupos creados aún | Company puede existir sin grupos. Tab "Grupos" muestra empty state "Esta empresa todavía no tiene grupos." |

### 5.1 Domain errors nuevos

`polla-backend/src/lib/errors.ts`:

```ts
COMPANY_NOT_FOUND: 'COMPANY_NOT_FOUND',
COMPANY_DISABLED: 'COMPANY_DISABLED',
NOT_COMPANY_ADMIN: 'NOT_COMPANY_ADMIN',
LAST_COMPANY_ADMIN: 'LAST_COMPANY_ADMIN',
```

`polla-app/src/app/core/notifications/domain-errors.ts`:

```ts
COMPANY_NOT_FOUND: 'Esta empresa no existe.',
COMPANY_DISABLED: 'La empresa está desactivada. Reactivala antes de hacer cambios.',
NOT_COMPANY_ADMIN: 'No tenés permisos para gestionar esta empresa.',
LAST_COMPANY_ADMIN: 'No podés remover al último admin. Agregá otro admin antes.',
```

---

### 6. Testing

#### 6.1 Backend (Jest, patrón `polla-backend/tests/unit/`)

**Un test file por handler nuevo + un test file para auth helper + tests de extensión de mutations existentes.**

##### `create-company.test.ts`
- Super-admin crea company válida → row Company + CompanyMember (role=ADMIN, joinedAt set) en TransactWrite.
- Caller no super-admin → error `ADMIN_REQUIRED`.
- `firstAdminUserId` no existe en User table → `VALIDATION_ERROR`.
- Name vacío trimmed → `VALIDATION_ERROR`.
- Name > 80 chars → `VALIDATION_ERROR`.
- `contactEmail` con formato inválido → `VALIDATION_ERROR`.

##### `update-company.test.ts`
- Super-admin actualiza name → row updateado.
- Company-admin de esa company actualiza brandPrimary → ok.
- Company-admin de OTRA company → `NOT_COMPANY_ADMIN`.
- User sin role → `NOT_COMPANY_ADMIN`.
- `brandPrimary` no-hex → `VALIDATION_ERROR`.
- Sparse update: solo manda `name`, otros campos quedan iguales.
- Company DISABLED + caller no super-admin → `COMPANY_DISABLED`.

##### `set-company-status.test.ts`
- Super-admin → DISABLED → ok.
- Caller no super-admin → `ADMIN_REQUIRED`.
- Reactivar DISABLED → ACTIVE → ok.

##### `add-company-admin.test.ts`
- Super-admin agrega → CompanyMember row creado con role=ADMIN, joinedAt set.
- Company-admin agrega → ok.
- Company-admin de otra company → `NOT_COMPANY_ADMIN`.
- Target ya es admin → idempotente, `ok=true` "Ya era admin", no duplica row.
- Target user no existe → `VALIDATION_ERROR`.
- Company DISABLED + caller no super-admin → `COMPANY_DISABLED`.

##### `remove-company-admin.test.ts`
- Super-admin remueve admin (no último) → row borrado.
- Company-admin remueve a otro company-admin → ok.
- Company-admin se remueve a sí mismo (con otro admin existente) → ok.
- Intenta remover al último → `LAST_COMPANY_ADMIN`.
- Target no es admin → idempotente, `ok=true` "No era admin".

##### `create-company-group.test.ts`
- Company-admin crea grupo sin `adminUserId` → Group.adminUserId = caller, Membership creada para caller.
- Con `adminUserId` set → Group.adminUserId = ese user, Membership para ese user (no caller).
- `adminUserId` apuntando a user inexistente → `VALIDATION_ERROR`.
- Company DISABLED → `COMPANY_DISABLED` (incluso para super-admin).
- Caller no company-admin → `NOT_COMPANY_ADMIN`.
- Validaciones existentes de createGroup (mode válido, entryFee si enabled, joinCode collision retry).

##### `update-company-group.test.ts`
- Company-admin actualiza grupo de su company → ok.
- Group-admin (no company-admin) de un grupo de empresa actualiza → ok.
- Super-admin → ok.
- User random → `NOT_COMPANY_ADMIN`.
- Grupo individual (companyId=null) → `VALIDATION_ERROR` "Use updateGroup".

##### `auth.test.ts` (helper)
- `isCompanyAdmin` con row ADMIN → true.
- `isCompanyAdmin` con row MEMBER → false.
- `isCompanyAdmin` sin row → false.
- `isGroupAdminOrAbove` super-admin → true (sin DB).
- `isGroupAdminOrAbove` group.adminUserId === userId → true.
- `isGroupAdminOrAbove` companyId set + isCompanyAdmin true → true.
- `isGroupAdminOrAbove` random → false.

#### 6.2 Frontend (Jest + Angular Testing Library)

##### `companies-list.component.spec.ts`
- Empty list → empty state visible con "Crear primera empresa".
- 3 companies → 3 rows con status pills + counts correctos.
- Click "+ Crear empresa" → modal abre (verify TestBed emit).
- Search filter → solo matching companies en el DOM.

##### `company-detail.component.spec.ts`
- 4 tabs navegables (verify click cambia el contenido).
- Tab General: edit name + click "Guardar" → llama `api.updateCompany` con sparse args.
- Tab Admins: lista renderiza con remove button disabled si es el último.
- Tab Admins: click "Remover" → confirm dialog → call `api.removeCompanyAdmin`.
- Tab Grupos: lista read-only con links a `/admin/groups/:id`.
- Tab Branding: muestra swatches o placeholder.

##### `create-company-modal.component.spec.ts`
- Submit con name vacío → error inline, no llama API.
- Submit con name + firstAdmin válidos → llama `api.createCompany` con args.
- Submit exitoso → emit close + redirect.

##### `admin-picker.component.spec.ts`
- Type "@juan" con debounce 300ms → llama `api.searchUsers` una sola vez.
- Click resultado → emit `userSelected` event.
- Clear button → reset input + emit `userSelected(null)`.

#### 6.3 Coverage target

100% en los nuevos handlers + componentes nuevos. No bajar el threshold global del repo.

#### 6.4 Smoke manual (no automable hoy)

1. Login como super-admin, ir a `/admin/companies` → ve "Crear primera empresa".
2. Crear "Coca-Cola Test" con first admin = otro user de prueba (handle existente).
3. Logout, login como ese user → no debería ver `/admin/companies` (no es super-admin). Verificar que `/admin` no es accesible.
4. Como super-admin: agregar otro company-admin via tab Admins.
5. Como super-admin: crear grupo bajo Coca-Cola Test usando el botón `+ Crear grupo` del tab Grupos (modal simple agregado en Sub-1 para smoke-test).
6. Como company-admin del paso 3: ir a `/groups/:id/edit` del grupo nuevo → debería ver el form editable (permisos extendidos vía `updateCompanyGroup`).
7. Super-admin: disable la company → company-admin no puede más editar; super-admin sí.
8. Verificar safeguard "último admin": eliminar todos los admins menos uno, intentar remover el último → error `LAST_COMPANY_ADMIN`.

---

### 7. Archivos afectados (resumen)

#### Backend (`polla-backend/`)

| Path | Acción |
|---|---|
| `src/lib/errors.ts` | Modify: +4 domain errors (COMPANY_*) |
| `src/lib/auth.ts` | **CREATE** — helper `isCompanyAdmin`, `isGroupAdminOrAbove` |
| `amplify/data/resource.ts` | Modify: +Company model, +CompanyMember model, +Group.companyId + Group.category, +mutations schema (6 nuevas + 1 extensión `updateCompanyGroup`) |
| `amplify/functions/create-company/{handler,resource}.ts` | **CREATE** |
| `amplify/functions/update-company/{handler,resource}.ts` | **CREATE** |
| `amplify/functions/set-company-status/{handler,resource}.ts` | **CREATE** |
| `amplify/functions/add-company-admin/{handler,resource}.ts` | **CREATE** |
| `amplify/functions/remove-company-admin/{handler,resource}.ts` | **CREATE** |
| `amplify/functions/create-company-group/{handler,resource}.ts` | **CREATE** |
| `amplify/functions/update-company-group/{handler,resource}.ts` | **CREATE** |
| `amplify/backend.ts` | Modify: register 7 new lambdas + grants |
| `tests/unit/create-company.test.ts` | **CREATE** |
| `tests/unit/update-company.test.ts` | **CREATE** |
| `tests/unit/set-company-status.test.ts` | **CREATE** |
| `tests/unit/add-company-admin.test.ts` | **CREATE** |
| `tests/unit/remove-company-admin.test.ts` | **CREATE** |
| `tests/unit/create-company-group.test.ts` | **CREATE** |
| `tests/unit/update-company-group.test.ts` | **CREATE** |
| `tests/unit/auth.test.ts` | **CREATE** |

#### Frontend (`polla-app/`)

| Path | Acción |
|---|---|
| `src/app/core/notifications/domain-errors.ts` | Modify: +4 mappings |
| `src/app/core/api/api.service.ts` | Modify: +`createCompany`, `updateCompany`, `setCompanyStatus`, `addCompanyAdmin`, `removeCompanyAdmin`, `createCompanyGroup`, `updateCompanyGroup`, `listCompanies`, `getCompany`, `listCompanyMembers`, `listCompanyGroups`, `searchUsers` |
| `src/app/features/admin/companies/companies-list.component.{ts,spec.ts}` | **CREATE** |
| `src/app/features/admin/companies/company-detail.component.{ts,spec.ts}` | **CREATE** |
| `src/app/features/admin/companies/create-company-modal.component.{ts,spec.ts}` | **CREATE** |
| `src/app/features/admin/companies/admin-picker.component.{ts,spec.ts}` | **CREATE** |
| `src/app/features/admin/companies/create-group-modal.component.{ts,spec.ts}` | **CREATE** — modal simple para super-admin (Sub-5 trae el panel completo para company-admins) |
| `src/app/features/groups/group-edit.component.ts` | Modify: si `group.companyId` set, llamar `updateCompanyGroup` en vez de `updateGroup` |
| `src/app/app.routes.ts` | Modify: +rutas `/admin/companies` y `/admin/companies/:id` |
| `src/app/features/admin/admin-shell.component.ts` (o equivalente sidebar) | Modify: +item "Empresas" |

---

### 8. No-goals (fuera de scope de Sub-1, explícito)

- White-label theming en runtime (logo + colores aplicados al user). Los campos están en el modelo, pero no se aplican. → **Sub-2**
- UI para editar branding (color pickers, upload logo). → **Sub-2**
- Bulk invitation de emails. → **Sub-3**
- Approval workflow para joiners. → **Sub-3**
- Activities system (reemplazo de sponsors). → **Sub-4**
- Panel company-admin propio (no `/admin`). → **Sub-5**
- Self-service company signup con billing.
- Multi-tenant DB-level isolation (todas las companies comparten las mismas tablas, separación por companyId).
- Soft delete de Companies (solo disable).
- Audit log granular de quién hizo qué cuándo.
- Métricas / analytics de empresa (cross-grupo aggregations).
- Department-level admins (decisión arquitectónica: B + category, no jerarquía).

---

## Próximos pasos después de Sub-1

Una vez que **Sub-1 esté implementado y mergeado**, el siguiente brainstorming es para **Sub-2 (White-label theming)**. Se brainstormea con el mismo proceso (questions → approaches → sections → spec → plan → impl).

Los Sub-3 y Sub-4 pueden hacerse en paralelo después de Sub-2 (no dependen entre sí). Sub-5 es el último porque depende de todos.
