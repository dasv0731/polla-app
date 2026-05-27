# Cap de 30 miembros por grupo + admin elimina miembros

**Fecha:** 2026-05-27
**Alcance:** `polla-backend` (schema, nueva mutation `removeMember`, check de cap en `join-group` y `previewJoinCode`) + `polla-app` (api wrapper, contador en detail, botón eliminar en lista de miembros).

## Problema

Hoy un grupo puede crecer indefinidamente. Tampoco existe forma de que un admin expulse a alguien (los join codes son de un solo uso por user, pero alguien que joineó queda permanentemente). El user pide:

1. Limitar grupos a **30 personas máximo** (incluyendo admin).
2. Permitir al admin del grupo **eliminar a cualquier miembro**.

Como side note: el self-leave existente (a nivel auth-rule sobre `Membership`) ya permite que un user borre su Membership, pero deja `UserGroupTotal` huérfano. Aprovechamos para unificar el path.

## Solución (resumen)

Una única mutation `removeMember(groupId, userId)` que cubre ambos casos:
- **Admin elimina a otro**: caller es el admin del grupo, `userId !== caller`.
- **Self-leave**: caller === userId, y NO es el admin del grupo.

En ambos casos: borra `Membership` + `UserGroupTotal` del par `(groupId, userId)` en una `TransactWrite`. El score histórico se pierde (intencional — si re-entra, arranca limpio o desde su UTT como cualquier join).

El cap de 30 vive como constante backend (`GROUP_MEMBER_CAP = 30`):
- `join-group` lo verifica antes del Put (race-safe vía Query COUNT).
- `previewJoinCode` lo verifica para mostrar "Grupo lleno" en la pantalla de preview antes de joinear.
- FE muestra el contador `N/30` en el detail del grupo y deshabilita CTAs de invitar cuando está lleno.

El admin queda bloqueado de auto-eliminarse (el botón está oculto sobre su propia fila + la lambda devuelve error si lo intenta).

## No-objetivos

- **No** se elimina el grupo entero si el admin intenta salirse (el spec dice "no permitir", el grupo persiste hasta que admin lo borre explícitamente con `deleteGroup`).
- **No** se transfiere admin automáticamente.
- **No** se borran picks/brackets/specials/comodines del expulsado — esos viven a nivel torneo, otros grupos donde el user sea miembro siguen contándolos.
- **No** se mantiene un memberCount cacheado en el `Group` model — se computa on-the-fly cuando hace falta (consistente con `previewJoinCode` actual). Posible follow-up: si el N/30 visual lo necesita en muchos lugares, denormalizar.
- **No** se notifica al expulsado por email — silencio. Posible follow-up.

## Diseño técnico

### Schema (`polla-backend/amplify/data/resource.ts`)

**1. Membership auth — quitar `delete` del owner:**

```typescript
.authorization((allow) => [
  allow.authenticated().to(['read']),
  // Se quita: allow.ownerDefinedIn('userId').to(['delete'])
  // Self-leave ahora va por la mutation removeMember (cleanup atómico de UGT).
  allow.group('admins'),
]),
```

**2. Nueva mutation `removeMember`:**

```typescript
removeMember: a
  .mutation()
  .arguments({
    groupId: a.id().required(),
    userId: a.id().required(),
  })
  .returns(a.customType({
    ok: a.boolean().required(),
    message: a.string().required(),
  }))
  .authorization((allow) => [allow.authenticated()])
  .handler(a.handler.function(removeMemberFn)),
```

### Constante compartida

Crear `polla-backend/src/lib/group-limits.ts`:

```typescript
/** Máximo de miembros por grupo (incluyendo admin). Validado server-side en
 *  join-group + preview-join-code. Si se cambia, actualizar también el
 *  fallback del frontend en group-detail.component.ts (display N/CAP). */
export const GROUP_MEMBER_CAP = 30;
```

Importada en los lambdas de `join-group`, `preview-join-code`, `remove-member` (este último solo para mensajes/sanity, no lo aplica).

### `join-group/handler.ts` — check de cap

Antes del `PutCommand` de Membership (~línea 62), agregar:

```typescript
import { GROUP_MEMBER_CAP } from '../../../src/lib/group-limits';

// ...
const memberCountQ = await ddb.send(new QueryCommand({
  TableName: MEMBERSHIP,
  IndexName: 'membersByGroup',
  KeyConditionExpression: 'groupId = :g',
  ExpressionAttributeValues: { ':g': invite.groupId },
  Select: 'COUNT',
}));
if ((memberCountQ.Count ?? 0) >= GROUP_MEMBER_CAP) {
  throw new DomainError('GROUP_FULL');
}
```

`DomainError('GROUP_FULL')` se agrega a `polla-backend/src/lib/errors.ts` (si no existe ya — el archivo tiene un map de códigos a mensajes user-facing). Mensaje: `'El grupo está lleno (30/30).'`.

**Race condition**: query → put no es atómica. Dos joins concurrentes podrían ambos pasar la verificación. Aceptado como trade-off — el cap de 30 con un margen de +1 en condiciones extremas no es un problema crítico. Para garantía estricta se necesitaría un counter row o ConditionExpression sobre un row sentinela.

### `preview-join-code/handler.ts` — informar grupo lleno

Después de calcular `memberRows.length`, agregar:

```typescript
if (memberRows.length >= GROUP_MEMBER_CAP) {
  return {
    ok: false,
    message: 'Grupo lleno (30/30)',
    groupId: group.id,
    groupName: group.name ?? null,
    ownerHandle: owner?.handle ?? null,
    memberCount: memberRows.length,
    alreadyMember: false,
  };
}
```

Se devuelve `ok: false` con la info parcial para que el FE pueda mostrar el grupo + el motivo del rechazo sin re-fetch.

### Nueva lambda `remove-member/`

**`resource.ts`:**

```typescript
import { defineFunction } from '@aws-amplify/backend';

export const removeMember = defineFunction({
  name: 'remove-member',
  entry: './handler.ts',
  runtime: 20,
  timeoutSeconds: 10,
  resourceGroupName: 'data',
});
```

**`handler.ts`** (forma):

```typescript
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient, GetCommand, QueryCommand, TransactWriteCommand,
} from '@aws-sdk/lib-dynamodb';

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const GROUP = process.env['GROUP_TABLE']!;
const MEMBERSHIP = process.env['MEMBERSHIP_TABLE']!;
const UGT = process.env['USER_GROUP_TOTAL_TABLE']!;

interface AppSyncEvent {
  arguments: { groupId: string; userId: string };
  identity: { sub: string };
}

interface Response { ok: boolean; message: string }

export async function handler(event: AppSyncEvent): Promise<Response> {
  const caller = event.identity.sub;
  const { groupId, userId } = event.arguments;

  const group = await ddb.send(new GetCommand({ TableName: GROUP, Key: { id: groupId }}));
  if (!group.Item) return { ok: false, message: 'Grupo no existe' };

  const adminUserId = (group.Item as { adminUserId: string }).adminUserId;
  const isAdmin = adminUserId === caller;
  const isSelfLeave = caller === userId;

  if (!isAdmin && !isSelfLeave) {
    return { ok: false, message: 'Sin permisos' };
  }
  if (adminUserId === userId) {
    return {
      ok: false,
      message: 'El admin no puede salir del grupo. Elimina el grupo entero o transfiere admin.',
    };
  }

  const memQ = await ddb.send(new QueryCommand({
    TableName: MEMBERSHIP,
    IndexName: 'membersByGroup',
    KeyConditionExpression: 'groupId = :g',
    FilterExpression: 'userId = :u',
    ExpressionAttributeValues: { ':g': groupId, ':u': userId },
    Limit: 1,
  }));
  const mem = memQ.Items?.[0] as { id: string } | undefined;
  if (!mem) return { ok: false, message: 'El usuario no es miembro de este grupo' };

  // Atomic: delete Membership + UGT together. Si la transacción falla,
  // nada se borra (el helper aborta entero). No queda UGT huérfano.
  await ddb.send(new TransactWriteCommand({
    TransactItems: [
      { Delete: { TableName: MEMBERSHIP, Key: { id: mem.id }}},
      { Delete: { TableName: UGT, Key: { groupId, userId }}},
    ],
  }));

  return {
    ok: true,
    message: isSelfLeave ? 'Saliste del grupo' : 'Miembro eliminado del grupo',
  };
}
```

### `backend.ts` wiring

```typescript
import { removeMember } from './functions/remove-member/resource';

const backend = defineBackend({
  // ...existing...
  removeMember,
});

backend.removeMember.addEnvironment('GROUP_TABLE', groupTable.tableName);
backend.removeMember.addEnvironment('MEMBERSHIP_TABLE', membershipTable.tableName);
backend.removeMember.addEnvironment('USER_GROUP_TOTAL_TABLE', ugtTable.tableName);
groupTable.grantReadData(backend.removeMember.resources.lambda);
membershipTable.grantReadWriteData(backend.removeMember.resources.lambda);
ugtTable.grantWriteData(backend.removeMember.resources.lambda);
grantIndexQuery(membershipTable, backend.removeMember.resources.lambda);
```

### Frontend

**1. `polla-app/src/app/core/api/api.service.ts`** — wrapper:

```typescript
removeMember(input: { groupId: string; userId: string }) {
  return apiClient.mutations.removeMember(input);
}
```

**2. `polla-app/src/app/features/groups/group-detail.component.ts`:**

- En el header del grupo, agregar contador: `Miembros ({{ members().length }} / 30)`.
- Por cada fila de miembro: condicional `@if (isAdminViewer() && row.userId !== group()!.adminUserId)`, mostrar botón "🗑 Eliminar".
- Click → modal de confirmación con texto: `"¿Eliminar a @{handle} del grupo? Su score acumulado en este grupo se borra. Sus picks del torneo no se ven afectados."`.
- Click confirm → `api.removeMember({ groupId, userId })` → si `ok`, refrescar la lista de miembros.

**3. `group-detail` cuando viewer no es admin** (fuera del scope inmediato pero coherente): botón "Salir del grupo" en el footer del detail. Llama a `api.removeMember({ groupId, userId: currentUser })`. Stretch — confirmar antes de implementar.

**4. UI de invitar (botones "Compartir código" / "Invitar por email")**:

Si `members().length >= 30`, deshabilitar y mostrar pill "Grupo lleno (30/30)". Aplica a `group-detail` y `group-invite-email.component.ts`.

**5. Pantalla de preview de join (`group-join.component.ts`):**

Cuando `previewJoinCode` devuelve `ok: false, message: 'Grupo lleno (30/30)'`, mostrar ese mensaje en lugar del botón "Unirme".

### Errores y mensajes

`polla-backend/src/lib/errors.ts` agrega:

```typescript
GROUP_FULL: 'El grupo está lleno (30/30). Pedile al admin que elimine a alguien o crea otro grupo.',
```

(Si la convención del archivo es distinta, adaptar al patrón existente.)

## Testing

**Backend — unit:**

- `polla-backend/tests/unit/remove-member.test.ts` (mock DDB):
  - Admin elimina a otro → ok, ambos Delete emitidos.
  - User self-leave → ok.
  - User intenta eliminar a otro → "Sin permisos".
  - Admin intenta eliminar admin (self-remove) → "El admin no puede salir".
  - Caller no es member ni admin → "Sin permisos".
  - User no existe en el grupo → "El usuario no es miembro".
  - Grupo no existe → "Grupo no existe".

- `polla-backend/tests/unit/join-group.test.ts` (si existe; sino, agregar caso al patrón existente):
  - 29 miembros, join 30 → ok.
  - 30 miembros, join 31 → `GROUP_FULL`.

**Backend — integration:** smoke con sandbox: crear grupo, invitar 29, hacer 29 joins, intentar el 30 → fail.

**Frontend — manual QA:**

- Crear grupo, invitar varios users, verificar contador `N/30`.
- Como admin, eliminar a un miembro → contador baja, fila desaparece, UGT del eliminado borrada.
- Como admin, verificar que el botón "Eliminar" NO aparece sobre la propia fila.
- Como miembro común, verificar que el botón "Eliminar" no aparece sobre ninguna fila.
- Crear grupo, joinear hasta 30, intentar el 31 → "Grupo lleno".
- En `/groups/join/<code>`, si el grupo ya tiene 30, ver el mensaje de bloqueo y no el botón "Unirme".

## Migración

- **Grupos existentes con >30 miembros**: no aplicable hoy (todos los grupos son nuevos). Si en el futuro un grupo legacy supera el cap, los joins siguen siendo rechazados pero los miembros existentes no se expulsan automáticamente. Documentar.
- **Membership rows existentes**: el cambio en owner auth (quitar `delete`) NO afecta rows ya escritos. Solo restringe operaciones futuras.

## Riesgos

- **Race en el cap**: dos joins simultáneos en el grupo 29 podrían ambos pasar el COUNT y crear el 31. Aceptado.
- **TransactWrite parcial**: si la transacción falla a mitad, DDB rollback automático. No queda UGT huérfano.
- **Admin pierde acceso a un grupo lleno**: si el admin se elimina (no permitido) o se borra Cognito (escenario fuera de scope), el grupo queda sin admin. Documentado fuera de scope.

## Plan de implementación (alto nivel)

1. Backend: constante + DomainError + schema (mutation + auth tighten) + `remove-member` lambda + wiring en backend.ts.
2. Backend: ediciones a `join-group` y `preview-join-code` para el cap.
3. Backend: tests unitarios.
4. Frontend: api.service wrapper + group-detail (contador + botón + modal) + group-join (mensaje de lleno) + group-invite-email (deshabilitar si lleno).
5. Deploy sandbox + QA manual.
