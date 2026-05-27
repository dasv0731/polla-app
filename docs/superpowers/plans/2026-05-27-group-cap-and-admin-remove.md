# Group cap (30) + admin removes members — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Limitar grupos a 30 miembros (incluyendo admin) y permitir al admin del grupo eliminar a cualquier miembro vía una mutation server-side que también cubre el self-leave. Borra Membership + UserGroupTotal atómicamente.

**Architecture:** Constante `GROUP_MEMBER_CAP = 30` en `polla-backend/src/lib/group-limits.ts`. `join-group` y `preview-join-code` la consultan vía `Select: 'COUNT'` antes de aceptar a un nuevo miembro. Nueva mutation `removeMember(groupId, userId)` autenticada, backed por una lambda que valida `caller === adminUserId || caller === userId` (no permite admin self-remove), y borra `Membership` + `UserGroupTotal` en `TransactWrite`. Frontend muestra contador `N/30` en `group-detail`, botón "Eliminar" en cada fila (solo admin, no sobre sí mismo), y bloquea CTAs de invitar / preview-join cuando está lleno.

**Tech Stack:** AWS Amplify Gen 2 (TypeScript, AppSync, DynamoDB), Angular 18 standalone, signals, jest (ts-jest backend, @angular-builders/jest frontend).

**Spec:** `polla-app/docs/superpowers/specs/2026-05-27-group-cap-and-admin-remove-design.md`

**Branches:** `feature/group-cap-and-admin-remove` en ambos repos (polla-app y polla-backend).

---

## File map

### Backend (`polla-backend/`)

**Create:**
- `src/lib/group-limits.ts` — exporta `GROUP_MEMBER_CAP = 30`.
- `amplify/functions/remove-member/resource.ts` — defineFunction.
- `amplify/functions/remove-member/handler.ts` — lambda lógica.
- `tests/unit/remove-member.test.ts` — TDD del lambda.

**Modify:**
- `src/lib/errors.ts` — agrega `GROUP_FULL` al ErrorCode map.
- `amplify/functions/join-group/handler.ts` — count check antes del Put.
- `amplify/functions/preview-join-code/handler.ts` — retorna `ok: false` si el grupo está lleno.
- `amplify/data/resource.ts` — quita `delete` del owner auth de Membership; agrega `removeMember` mutation.
- `amplify/backend.ts` — importa + wires la nueva lambda.

### Frontend (`polla-app/`)

**Modify:**
- `src/app/core/api/api.service.ts` — wrapper `removeMember({ groupId, userId })`.
- `src/app/features/groups/group-detail.component.ts` — contador `N/30`, botón eliminar por fila, modal de confirmación.
- `src/app/features/groups/group-join.component.ts` — mostrar mensaje "Grupo lleno" cuando `preview.ok === false` con motivo de cap.
- `src/app/features/groups/group-invite-email.component.ts` — deshabilitar invitar si grupo lleno.

---

## Task 1: Backend foundations (constants, errors, schema, cap checks)

**Files:**
- Create: `polla-backend/src/lib/group-limits.ts`
- Modify: `polla-backend/src/lib/errors.ts`
- Modify: `polla-backend/amplify/data/resource.ts`
- Modify: `polla-backend/amplify/functions/join-group/handler.ts`
- Modify: `polla-backend/amplify/functions/preview-join-code/handler.ts`

- [ ] **Step 1: Crear constante compartida**

Crear `polla-backend/src/lib/group-limits.ts`:

```typescript
/** Máximo de miembros por grupo (incluyendo admin). Validado server-side en
 *  join-group + preview-join-code. Si se cambia, actualizar también el
 *  fallback del frontend en group-detail.component.ts (display N/CAP). */
export const GROUP_MEMBER_CAP = 30;
```

- [ ] **Step 2: Agregar código de error `GROUP_FULL`**

En `polla-backend/src/lib/errors.ts`, dentro del `ErrorCode` const, agregar la línea (alfabético / por feature):

```typescript
export const ErrorCode = {
  PICK_WINDOW_CLOSED: 'PICK_WINDOW_CLOSED',
  INVITE_CODE_INVALID: 'INVITE_CODE_INVALID',
  ALREADY_MEMBER: 'ALREADY_MEMBER',
  HANDLE_TAKEN: 'HANDLE_TAKEN',
  MATCH_VERSION_CONFLICT: 'MATCH_VERSION_CONFLICT',
  INVALID_SCORE_RANGE: 'INVALID_SCORE_RANGE',
  SPECIALS_LOCKED: 'SPECIALS_LOCKED',
  CODE_GENERATION_FAILED: 'CODE_GENERATION_FAILED',
  GROUP_NOT_FOUND: 'GROUP_NOT_FOUND',
  GROUP_FULL: 'GROUP_FULL',
  ADMIN_REQUIRED: 'ADMIN_REQUIRED',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  INVALID_MODE: 'INVALID_MODE',
  // ... el resto
```

Inserta `GROUP_FULL: 'GROUP_FULL',` justo después de `GROUP_NOT_FOUND`. El archivo solo declara el código (no mensajes user-facing); los mensajes se gestionan en el frontend si los necesita.

- [ ] **Step 3: Agregar cap check a `join-group` handler**

En `polla-backend/amplify/functions/join-group/handler.ts`:

3a. Importar la constante. Agregar al bloque de imports (líneas 1-6):

```typescript
import { GROUP_MEMBER_CAP } from '../../../src/lib/group-limits';
```

3b. Después del bloque "Check existing membership" (línea ~49, justo después del `if ((existing.Items ?? []).length > 0) throw new DomainError('ALREADY_MEMBER');`), agregar el cap check antes del backfill de UTT:

```typescript
  if ((existing.Items ?? []).length > 0) throw new DomainError('ALREADY_MEMBER');

  // Cap de miembros por grupo (incluye admin). Race-safe-ish: query→put no es
  // atómica, pero el margen de +1 en escenarios concurrentes es aceptado.
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

  // T20 backfill: copy user's UTT total into the new UGT row so they don't
  // join with a fake 0 mid-tournament
```

- [ ] **Step 4: Agregar cap check a `preview-join-code`**

En `polla-backend/amplify/functions/preview-join-code/handler.ts`:

4a. Importar `GROUP_MEMBER_CAP`:

```typescript
import { GROUP_MEMBER_CAP } from '../../../src/lib/group-limits';
```

4b. Después de calcular `memberRows.length` (línea ~96 aprox), antes del `return { ok: true, ... }`, agregar:

```typescript
  if (memberRows.length >= GROUP_MEMBER_CAP) {
    return {
      ok: false,
      message: `Grupo lleno (${memberRows.length}/${GROUP_MEMBER_CAP})`,
      groupId: group.id,
      groupName: group.name ?? null,
      ownerHandle: owner?.handle ?? null,
      memberCount: memberRows.length,
      alreadyMember: false,
    };
  }
```

Inspeccionar el handler completo antes de editar; los nombres exactos de variables (`group`, `owner`, `memberRows`) podrían diferir levemente. Usa los nombres que ya están ahí.

- [ ] **Step 5: Schema — quitar `delete` del owner auth de Membership y agregar `removeMember`**

En `polla-backend/amplify/data/resource.ts`:

5a. Encontrar el bloque `Membership: a.model({...})` (alrededor de la línea 335-350). Su `.authorization((allow) => [...])` actualmente incluye `allow.ownerDefinedIn('userId').to(['delete'])`. Reemplazar el bloque de auth:

```typescript
    .authorization((allow) => [
      allow.authenticated().to(['read']),
      // delete eliminado: self-leave ahora va por la mutation removeMember
      // (cleanup atómico de UserGroupTotal). Admins del cognito group siguen
      // teniendo control total.
      allow.group('admins'),
    ]),
```

5b. Agregar el import del nuevo lambda al tope del archivo (junto a los otros function imports, alrededor de las líneas 1-30):

```typescript
import { removeMember as removeMemberFn } from '../functions/remove-member/resource';
```

5c. Agregar la mutation. Encontrar la sección de mutations custom (después de `deleteGroup`, `previewJoinCode`, etc.). Agregar:

```typescript
  // Elimina un miembro del grupo: caller=admin (puede eliminar a cualquiera)
  // o caller=self-leave (sólo a sí mismo). Borra Membership + UserGroupTotal
  // en TransactWrite. Picks/Brackets/Specials del tournament NO se tocan
  // (viven a nivel torneo, no de grupo).
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

- [ ] **Step 6: Typecheck**

```bash
cd polla-backend && npx tsc --noEmit
```

Expected: 0 errores. (El handler `remove-member/handler.ts` aún no existe — Task 2 lo crea — pero el schema solo lo referencia via `a.handler.function(removeMemberFn)`, lo cual no requiere que el handler esté implementado todavía. Sí va a haber un error por el import del `resource.ts` faltante. Ver step 7.)

- [ ] **Step 7: Crear stub del resource.ts para que typecheck pase**

Crear archivo placeholder `polla-backend/amplify/functions/remove-member/resource.ts`:

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

Y un stub mínimo `polla-backend/amplify/functions/remove-member/handler.ts`:

```typescript
// Stub temporal — implementación real en Task 2.
export async function handler(): Promise<{ ok: boolean; message: string }> {
  return { ok: false, message: 'Not implemented yet' };
}
```

Re-correr typecheck:

```bash
cd polla-backend && npx tsc --noEmit
```

Expected: 0 errores.

- [ ] **Step 8: Commit**

```bash
cd 'C:\Users\Marke\Documents\Respaldo\polla mundialista\polla-backend' && git add src/lib/group-limits.ts src/lib/errors.ts amplify/data/resource.ts amplify/functions/join-group/handler.ts amplify/functions/preview-join-code/handler.ts amplify/functions/remove-member/resource.ts amplify/functions/remove-member/handler.ts
cd 'C:\Users\Marke\Documents\Respaldo\polla mundialista\polla-backend' && git commit -m "feat(groups): GROUP_MEMBER_CAP=30 + cap checks + removeMember mutation stub

- New shared constant GROUP_MEMBER_CAP exported from src/lib/group-limits.
- ErrorCode GROUP_FULL added.
- join-group rejects with GROUP_FULL when memberCount >= cap.
- preview-join-code returns ok:false with cap-full message.
- Membership owner auth: delete removed (self-leave now via removeMember).
- removeMember mutation declared in schema with stub handler — real handler
  in next commit.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: Backend remove-member lambda + tests TDD

**Files:**
- Modify: `polla-backend/amplify/functions/remove-member/handler.ts` (replace stub with real impl)
- Create: `polla-backend/tests/unit/remove-member.test.ts`

- [ ] **Step 1: Escribir tests primero**

Crear `polla-backend/tests/unit/remove-member.test.ts`:

```typescript
import { handler } from '../../amplify/functions/remove-member/handler';

/**
 * Mock DynamoDBDocumentClient que graba todas las llamadas send().
 * Devuelve canned responses para Get (Group, opcional Membership) + Query
 * (memberByGroup with userId filter) + TransactWrite (no-op).
 */
class MockDdb {
  public calls: Array<{ name: string; input: unknown }> = [];
  constructor(
    private group: { id: string; adminUserId: string } | undefined,
    private membership: { id: string } | undefined,
  ) {}

  send(cmd: { constructor: { name: string }; input: unknown }): Promise<{ Item?: unknown; Items?: unknown[] }> {
    const name = cmd.constructor.name;
    this.calls.push({ name, input: cmd.input });
    if (name === 'GetCommand') {
      return Promise.resolve({ Item: this.group });
    }
    if (name === 'QueryCommand') {
      return Promise.resolve({ Items: this.membership ? [this.membership] : [] });
    }
    if (name === 'TransactWriteCommand') {
      return Promise.resolve({});
    }
    return Promise.resolve({});
  }

  hasTransactWrite(): boolean {
    return this.calls.some((c) => c.name === 'TransactWriteCommand');
  }
}

function setEnv(): void {
  process.env['GROUP_TABLE'] = 'G';
  process.env['MEMBERSHIP_TABLE'] = 'M';
  process.env['USER_GROUP_TOTAL_TABLE'] = 'UGT';
}

// Stub `import` to swap the live DDB client with the mock. Done by editing the
// handler to use a getter or by exporting a setter. For simplicity in tests,
// we monkey-patch the DocumentClient at module-load level by re-requiring
// after stubbing. The handler uses the standard `DynamoDBDocumentClient.from(...)`
// pattern, so the mock has to be injected via jest.mock.
jest.mock('@aws-sdk/lib-dynamodb', () => {
  const actual = jest.requireActual('@aws-sdk/lib-dynamodb');
  return {
    ...actual,
    DynamoDBDocumentClient: {
      from: jest.fn(),
    },
  };
});

describe('remove-member handler', () => {
  let mockDdb: MockDdb;

  function dispatchHandler(args: { groupId: string; userId: string }, callerSub: string) {
    return handler({ arguments: args, identity: { sub: callerSub } });
  }

  function setupMock(group: { id: string; adminUserId: string } | undefined, mem: { id: string } | undefined) {
    setEnv();
    mockDdb = new MockDdb(group, mem);
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { DynamoDBDocumentClient } = require('@aws-sdk/lib-dynamodb');
    (DynamoDBDocumentClient.from as jest.Mock).mockReturnValue(mockDdb);
    jest.resetModules();
  }

  it('admin removes another member: ok + TransactWrite emitted', async () => {
    setupMock({ id: 'g1', adminUserId: 'admin-sub' }, { id: 'mem-1' });
    const { handler: freshHandler } = await import('../../amplify/functions/remove-member/handler');
    const res = await freshHandler({
      arguments: { groupId: 'g1', userId: 'other-sub' },
      identity: { sub: 'admin-sub' },
    });
    expect(res.ok).toBe(true);
    expect(res.message).toBe('Miembro eliminado del grupo');
    expect(mockDdb.hasTransactWrite()).toBe(true);
  });

  it('user self-leave: ok + TransactWrite emitted', async () => {
    setupMock({ id: 'g1', adminUserId: 'admin-sub' }, { id: 'mem-1' });
    const { handler: freshHandler } = await import('../../amplify/functions/remove-member/handler');
    const res = await freshHandler({
      arguments: { groupId: 'g1', userId: 'me-sub' },
      identity: { sub: 'me-sub' },
    });
    expect(res.ok).toBe(true);
    expect(res.message).toBe('Saliste del grupo');
    expect(mockDdb.hasTransactWrite()).toBe(true);
  });

  it('non-admin trying to remove someone else: forbidden, no delete', async () => {
    setupMock({ id: 'g1', adminUserId: 'admin-sub' }, undefined);
    const { handler: freshHandler } = await import('../../amplify/functions/remove-member/handler');
    const res = await freshHandler({
      arguments: { groupId: 'g1', userId: 'other-sub' },
      identity: { sub: 'random-sub' },
    });
    expect(res.ok).toBe(false);
    expect(res.message).toBe('Sin permisos');
    expect(mockDdb.hasTransactWrite()).toBe(false);
  });

  it('admin trying to remove themselves: blocked', async () => {
    setupMock({ id: 'g1', adminUserId: 'admin-sub' }, undefined);
    const { handler: freshHandler } = await import('../../amplify/functions/remove-member/handler');
    const res = await freshHandler({
      arguments: { groupId: 'g1', userId: 'admin-sub' },
      identity: { sub: 'admin-sub' },
    });
    expect(res.ok).toBe(false);
    expect(res.message).toContain('admin no puede salir');
    expect(mockDdb.hasTransactWrite()).toBe(false);
  });

  it('group does not exist: ok=false', async () => {
    setupMock(undefined, undefined);
    const { handler: freshHandler } = await import('../../amplify/functions/remove-member/handler');
    const res = await freshHandler({
      arguments: { groupId: 'gZ', userId: 'me-sub' },
      identity: { sub: 'me-sub' },
    });
    expect(res.ok).toBe(false);
    expect(res.message).toBe('Grupo no existe');
  });

  it('user is not a member of the group: ok=false', async () => {
    setupMock({ id: 'g1', adminUserId: 'admin-sub' }, undefined);
    const { handler: freshHandler } = await import('../../amplify/functions/remove-member/handler');
    const res = await freshHandler({
      arguments: { groupId: 'g1', userId: 'me-sub' },
      identity: { sub: 'me-sub' },
    });
    expect(res.ok).toBe(false);
    expect(res.message).toBe('El usuario no es miembro de este grupo');
    expect(mockDdb.hasTransactWrite()).toBe(false);
  });
});
```

Si el patrón `jest.mock('@aws-sdk/lib-dynamodb', ...)` resulta complicado de hacer funcionar (problemas con el módulo-cache), una alternativa más simple: refactorizar el handler para aceptar el `ddb` como argumento opcional. Pero **primero intenta con el mock**; sólo refactoriza si no funciona después de 1-2 intentos.

- [ ] **Step 2: Correr los tests para confirmar que FALLAN**

```bash
cd polla-backend && npx jest tests/unit/remove-member.test.ts --no-coverage
```

Expected: el handler stub devuelve `{ ok: false, message: 'Not implemented yet' }` → todos los tests del happy-path (admin removes, self-leave) fallan en `expect(res.ok).toBe(true)`. Los tests de error (forbidden, blocked, etc.) podrían pasar por coincidencia con el `ok: false` del stub, pero los mensajes específicos no van a coincidir.

- [ ] **Step 3: Implementar el handler real**

Reemplazar `polla-backend/amplify/functions/remove-member/handler.ts` con:

```typescript
/**
 * remove-member Lambda
 *
 * Mutation unificada para:
 *  - Admin del grupo elimina a otro miembro.
 *  - Self-leave: cualquier miembro (no-admin) se borra a sí mismo.
 *
 * Borra Membership + UserGroupTotal del par (groupId, userId) en una
 * TransactWrite (ambos o ninguno). Picks/BracketPicks/SpecialPicks viven
 * a nivel torneo y NO se tocan (otros grupos donde el user sea miembro
 * los siguen contando).
 *
 * El admin del grupo NO puede salirse a sí mismo (debe usar deleteGroup).
 */
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

interface Response {
  ok: boolean;
  message: string;
}

export async function handler(event: AppSyncEvent): Promise<Response> {
  const caller = event.identity.sub;
  const { groupId, userId } = event.arguments;

  const groupRes = await ddb.send(new GetCommand({
    TableName: GROUP,
    Key: { id: groupId },
  }));
  const group = groupRes.Item as { id: string; adminUserId: string } | undefined;
  if (!group) {
    return { ok: false, message: 'Grupo no existe' };
  }

  const isAdmin = group.adminUserId === caller;
  const isSelfLeave = caller === userId;

  if (!isAdmin && !isSelfLeave) {
    return { ok: false, message: 'Sin permisos' };
  }
  if (group.adminUserId === userId) {
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
  const mem = (memQ.Items ?? [])[0] as { id: string } | undefined;
  if (!mem) {
    return { ok: false, message: 'El usuario no es miembro de este grupo' };
  }

  await ddb.send(new TransactWriteCommand({
    TransactItems: [
      { Delete: { TableName: MEMBERSHIP, Key: { id: mem.id } } },
      { Delete: { TableName: UGT, Key: { groupId, userId } } },
    ],
  }));

  return {
    ok: true,
    message: isSelfLeave ? 'Saliste del grupo' : 'Miembro eliminado del grupo',
  };
}
```

- [ ] **Step 4: Correr los tests para confirmar que PASAN**

```bash
cd polla-backend && npx jest tests/unit/remove-member.test.ts --no-coverage
```

Expected: 6 tests PASS.

Si los tests fallan por problemas del mock (jest.mock no intercepta correctamente), considera estas alternativas en orden:
1. Asegurarse que el `jest.mock(...)` está en el top del archivo (antes de los imports del handler).
2. Refactorizar el handler para inyectar `ddb` como un parámetro opcional con default a la implementación real.

- [ ] **Step 5: Correr todos los tests del backend, confirmar no regresión**

```bash
cd polla-backend && npx jest --no-coverage
```

Expected: todos verdes.

- [ ] **Step 6: Commit**

```bash
cd 'C:\Users\Marke\Documents\Respaldo\polla mundialista\polla-backend' && git add amplify/functions/remove-member/handler.ts tests/unit/remove-member.test.ts
cd 'C:\Users\Marke\Documents\Respaldo\polla mundialista\polla-backend' && git commit -m "feat(groups): remove-member lambda real implementation with TDD

Caller must be the group's admin (can remove anyone) or the user themselves
(self-leave). Admin self-remove is blocked. Membership + UserGroupTotal are
deleted atomically via TransactWrite — no orphan UGT possible.

6 unit tests cover: admin removes other, self-leave, non-admin forbidden,
admin self-block, missing group, missing membership.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: Backend wiring (`backend.ts`)

**Files:**
- Modify: `polla-backend/amplify/backend.ts`

- [ ] **Step 1: Importar la lambda + agregar a defineBackend**

En `polla-backend/amplify/backend.ts`:

1a. Agregar al bloque de imports (entre los otros function imports, líneas 9-37):

```typescript
import { removeMember } from './functions/remove-member/resource';
```

1b. Agregar a la lista de `defineBackend({...})` (alrededor de la línea 39-69):

```typescript
const backend = defineBackend({
  // ...existing...
  checkHandleAvailable,
  createUserProfile,
  removeMember,
});
```

- [ ] **Step 2: Wire env vars + IAM grants**

Agregar el bloque de wiring después de los wires de `checkHandleAvailable` y `createUserProfile` (alrededor de la línea 519, donde quedó el ultimo wiring del fix de handle):

```typescript
// remove-member: lee Group; lee Membership.membersByGroup; borra Membership + UGT
// en TransactWrite. Caller=admin del grupo o self-leave.
backend.removeMember.addEnvironment('GROUP_TABLE', groupTable.tableName);
backend.removeMember.addEnvironment('MEMBERSHIP_TABLE', membershipTable.tableName);
backend.removeMember.addEnvironment('USER_GROUP_TOTAL_TABLE', ugtTable.tableName);
groupTable.grantReadData(backend.removeMember.resources.lambda);
membershipTable.grantReadWriteData(backend.removeMember.resources.lambda);
ugtTable.grantWriteData(backend.removeMember.resources.lambda);
grantIndexQuery(membershipTable, backend.removeMember.resources.lambda);
```

- [ ] **Step 3: Typecheck**

```bash
cd polla-backend && npx tsc --noEmit
```

Expected: 0 errores.

- [ ] **Step 4: Commit**

```bash
cd 'C:\Users\Marke\Documents\Respaldo\polla mundialista\polla-backend' && git add amplify/backend.ts
cd 'C:\Users\Marke\Documents\Respaldo\polla mundialista\polla-backend' && git commit -m "feat(groups): wire remove-member lambda in backend.ts

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: Frontend — api wrapper + group-detail (contador + botón eliminar + modal)

**Files:**
- Modify: `polla-app/src/app/core/api/api.service.ts`
- Modify: `polla-app/src/app/features/groups/group-detail.component.ts`

- [ ] **Step 1: Agregar wrapper en `api.service.ts`**

Localizar el bloque donde están los wrappers de mutations (cerca de `createGroup`, `deleteGroup`). Agregar después de `deleteGroup`:

```typescript
  removeMember(input: { groupId: string; userId: string }) {
    // Cast required until sandbox redeploys regenerate schema.d.ts.
    return (apiClient.mutations as unknown as {
      removeMember: (args: { groupId: string; userId: string }) => Promise<{
        data: { ok: boolean; message: string } | null;
      }>;
    }).removeMember(input);
  }
```

(Si la convención del archivo es distinta — wrappers más sencillos o con `try/catch` — adaptar al patrón existente.)

- [ ] **Step 2: Agregar contador `N / 30` en `group-detail.component.ts`**

Read `polla-app/src/app/features/groups/group-detail.component.ts` first to find the members section / ranking table header. Encima de la tabla de ranking (alrededor de la línea 200, antes del `<div class="rank-table-wrap">`), inyectar:

```html
<div class="group-member-count" style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;font-size:13px;color:var(--wf-ink-2);">
  <span>Miembros</span>
  <span class="text-bold" [class.text-warn]="rows().length >= 30">
    {{ rows().length }} / 30
  </span>
</div>
```

Si `rows()` no es el signal correcto para "todos los miembros" (puede haber otro como `members()` o `memberships()`), usar el correcto. Inspeccionar el código primero.

- [ ] **Step 3: Agregar columna "Acción" en la tabla de miembros, con botón Eliminar**

En el `<table class="rank-table">`, agregar una columna nueva al final del `<thead>`:

```html
<thead>
  <tr>
    <th>#</th>
    <th>Jugador</th>
    <th>Pts</th>
    <th class="rank-table__desk">Exactos</th>
    <th class="rank-table__desk">Result.</th>
    @if (isAdminOfGroup()) {
      <th style="width:60px;">Acción</th>
    }
  </tr>
</thead>
```

Y en el `<tbody>`, dentro de cada `<tr>` de la lista de miembros, agregar la celda condicional al final (justo antes del cierre `</tr>`):

```html
                  <tr [class.is-me]="r.userId === currentUserId">
                    <td class="rank-table__pos">{{ i + 1 }}</td>
                    <td class="text-bold">
                      <span style="display:inline-flex;align-items:center;gap:8px;">
                        <app-user-avatar
                          [sub]="r.userId"
                          [handle]="r.handle"
                          [avatarKey]="r.avatarKey"
                          size="sm" />
                        {{ '@' + r.handle }}@if (r.userId === currentUserId) { <span class="text-mute"> (tú)</span> }
                      </span>
                    </td>
                    <td class="rank-table__pts">{{ r.points }}</td>
                    <td class="rank-table__desk">{{ r.exactCount }}</td>
                    <td class="rank-table__desk">{{ r.resultCount }}</td>
                    @if (isAdminOfGroup()) {
                      <td style="text-align:center;">
                        @if (r.userId !== g.adminUserId) {
                          <button type="button" class="btn-wf btn-wf--sm btn-wf--danger"
                                  style="padding:4px 8px;font-size:11px;"
                                  [disabled]="removingUserId() === r.userId"
                                  (click)="confirmRemoveMember(r.userId, r.handle)"
                                  aria-label="Eliminar miembro">
                            {{ removingUserId() === r.userId ? '...' : '🗑' }}
                          </button>
                        }
                      </td>
                    }
                  </tr>
```

Empty-state también necesita ajustar colspan: `@if (isAdminOfGroup()) { colspan="6" } else { colspan="5" }`. Como Angular no soporta `colspan` dinámico fácilmente con condicionales, usar `[attr.colspan]="isAdminOfGroup() ? 6 : 5"` en el `<td>` del empty.

- [ ] **Step 4: Agregar el método `confirmRemoveMember` y el signal `removingUserId`**

En la clase `GroupDetailComponent`, agregar (junto a los otros signals):

```typescript
  removingUserId = signal<string | null>(null);

  async confirmRemoveMember(userId: string, handle: string): Promise<void> {
    const confirmed = window.confirm(
      `¿Eliminar a @${handle} del grupo? Su score acumulado en este grupo se borra. ` +
      `Sus picks del torneo no se ven afectados.`,
    );
    if (!confirmed) return;
    const groupId = this.group()?.id;
    if (!groupId) return;

    this.removingUserId.set(userId);
    try {
      const res = await this.api.removeMember({ groupId, userId });
      if (!res.data?.ok) {
        // Si el backend rechaza (admin self, race, etc.), mostrar el mensaje.
        // Toast service si existe en el component; sino window.alert.
        this.toast.error(res.data?.message ?? 'No se pudo eliminar al miembro');
        return;
      }
      // Refrescar la lista de miembros / rankings.
      await this.reloadGroup();   // si existe ese método; sino inline el reload.
    } catch (e) {
      this.toast.error((e as Error).message ?? 'Error al eliminar miembro');
    } finally {
      this.removingUserId.set(null);
    }
  }
```

Adaptar:
- `this.api` → nombre del ApiService inyectado.
- `this.toast` → nombre del ToastService inyectado. Si no hay toast service, usar `window.alert()`.
- `this.reloadGroup()` → método existente que recarga datos del grupo; si no existe, llamar a `ngOnInit()` o el load method que ya tenga el componente.

- [ ] **Step 5: Typecheck + build**

```bash
cd polla-app && npx tsc --noEmit -p tsconfig.app.json
```

Expected: 0 errors. Si hay error con `r.userId !== g.adminUserId` (porque `g` no está definido en ese scope), envolver el `@if (isAdminOfGroup())` en un `@if (group(); as g)` ya existente del componente. Inspeccionar la estructura del template.

```bash
cd polla-app && npx ng build --configuration=development 2>&1 | tail -15
```

Expected: clean.

- [ ] **Step 6: Jest**

```bash
cd polla-app && npx jest --no-coverage
```

Expected: 40/40 (no nuevos tests; cambios son UI puros).

- [ ] **Step 7: Commit**

```bash
cd 'C:\Users\Marke\Documents\Respaldo\polla mundialista\polla-app' && git add src/app/core/api/api.service.ts src/app/features/groups/group-detail.component.ts
cd 'C:\Users\Marke\Documents\Respaldo\polla mundialista\polla-app' && git commit -m "feat(groups): member count N/30 + admin can remove members in detail view

- api.service exposes removeMember mutation wrapper (with temporary type cast
  pending sandbox redeploy).
- group-detail shows 'Miembros N/30' above the ranking table.
- New 'Acción' column with delete button per row, visible only to the admin
  and not on their own row.
- Confirm dialog explains the consequence (score lost in group; tournament
  picks unaffected). Reloads members on success.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: Frontend — cap-full UX in group-join + group-invite-email

**Files:**
- Modify: `polla-app/src/app/features/groups/group-join.component.ts`
- Modify: `polla-app/src/app/features/groups/group-invite-email.component.ts`

- [ ] **Step 1: Mostrar "Grupo lleno" en `group-join.component.ts`**

Read `polla-app/src/app/features/groups/group-join.component.ts`. Encontrar dónde se llama `previewJoinCode` y se procesa la respuesta. Después del fetch, si `res.data?.ok === false`, mostrar el mensaje del backend en lugar del botón "Unirme".

El componente ya maneja `preview.ok === false` para otros casos (código inválido, código expirado). Solo hay que asegurarse de que el nuevo mensaje `'Grupo lleno (30/30)'` se renderice correctamente — debería funcionar automáticamente si el template usa el `message` del preview. Verificar.

Si el componente diferencia entre tipos de error (e.g., muestra distintos íconos según el caso), agregar un mapeo para el caso "grupo lleno" con un ícono apropiado (e.g., 🚫). Pero si el patrón es solo mostrar el `message`, no requiere cambio adicional.

- [ ] **Step 2: Deshabilitar "Invitar por email" si el grupo está lleno**

En `polla-app/src/app/features/groups/group-invite-email.component.ts`:

2a. Inspeccionar cómo el componente carga el grupo y sabe el count de miembros. Si ya tiene esa info, usarla; sino, llamar `api.listMembershipsByGroup(groupId)` o similar.

2b. Deshabilitar el botón "Enviar invitaciones" cuando el count >= 30:

```html
<button type="submit" class="btn-wf btn-wf--block btn-wf--primary"
        [disabled]="sending() || emails().length === 0 || groupIsFull()">
  {{ groupIsFull() ? 'Grupo lleno' : (sending() ? 'Enviando…' : 'Enviar →') }}
</button>

@if (groupIsFull()) {
  <p class="text-mute" style="font-size:12px;margin-top:8px;">
    El grupo ya tiene 30 miembros. No se pueden enviar más invitaciones hasta que
    el admin elimine a alguien.
  </p>
}
```

Y en la clase:

```typescript
groupIsFull = computed(() => (this.memberCount() ?? 0) >= 30);
```

donde `memberCount` es un signal que se llena al cargar el grupo. Si el componente no carga miembros hoy, agregar la carga.

- [ ] **Step 3: Typecheck + build**

```bash
cd polla-app && npx tsc --noEmit -p tsconfig.app.json
cd polla-app && npx ng build --configuration=development 2>&1 | tail -10
```

Expected: 0 errors / clean build.

- [ ] **Step 4: Commit**

```bash
cd 'C:\Users\Marke\Documents\Respaldo\polla mundialista\polla-app' && git add src/app/features/groups/group-join.component.ts src/app/features/groups/group-invite-email.component.ts
cd 'C:\Users\Marke\Documents\Respaldo\polla mundialista\polla-app' && git commit -m "feat(groups): block joining and inviting when group is full

- group-join shows the 'Grupo lleno (30/30)' message returned by
  preview-join-code instead of the join button.
- group-invite-email disables the submit button and shows an explanatory
  text when the group already has 30 members.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: Deploy sandbox + manual QA

**Files:** ninguno (verificación).

- [ ] **Step 1: Deploy sandbox**

```bash
cd polla-backend && npm run sandbox
```

Espera a "✔ Successfully synthesized" y al watch mode. `polla-app/amplify_outputs.json` se regenera automáticamente. Si las pantallas no se conectan después, verificar que el archivo se copió a `polla-app/src/amplify_outputs.json` (que es el que importa el bootstrap).

- [ ] **Step 2: Verificar que el dev server recompila sin errores**

El `ng serve` que ya está corriendo debe haber detectado los cambios y recompilado. Si no, restart:

```bash
cd polla-app && npm start
```

- [ ] **Step 3: QA escenario 1 — cap durante join**

1. Loguear como admin de un grupo.
2. Crear un grupo nuevo (modo COMPLETE para ver toggle de comodines también).
3. Hacer un script o manualmente joinear 29 cuentas adicionales para llegar a 30 (incluido admin).
4. Intentar joinear una cuenta más → debería ver "Grupo lleno (30/30)" en `/groups/join/<code>`.
5. Verificar el contador en `/groups/<id>`: muestra "Miembros 30 / 30".

Si no es práctico hacer 29 cuentas, modificar temporalmente `GROUP_MEMBER_CAP = 3` en `polla-backend/src/lib/group-limits.ts` para el QA, hacer el deploy, probar con un grupo de 3 miembros, y restaurar el cap a 30 al finalizar.

- [ ] **Step 4: QA escenario 2 — admin elimina miembro**

1. Como admin, ir al detail del grupo.
2. Ver la columna "Acción" con botones 🗑 en cada fila excepto la del propio admin.
3. Click en 🗑 de un miembro → confirm dialog.
4. Confirmar → spinner '...' brevemente → fila desaparece → contador baja a N−1 / 30.
5. Verificar en DDB (o vía AppSync console) que la Membership y la UGT del eliminado están borradas.

- [ ] **Step 5: QA escenario 3 — admin sobre sí mismo**

1. Como admin, mirar la tabla de miembros: la fila del admin NO tiene botón eliminar.
2. (No hay forma de disparar el lambda con admin=self desde el UI, pero por completitud) intentar invocar la mutation desde la AppSync console con `groupId` válido y `userId === adminUserId` → debe responder `ok: false, message: "El admin no puede salir..."`.

- [ ] **Step 6: QA escenario 4 — invite-email bloqueado**

1. Llenar un grupo a 30 (o usar el cap reducido del Step 3).
2. Como admin, ir a `/groups/<id>/invite`.
3. Verificar que el botón "Enviar invitaciones" está deshabilitado, con el texto explicativo "El grupo ya tiene 30 miembros…".

- [ ] **Step 7: QA escenario 5 — limpiar los casts temporales del Task 4 (fix de handle anterior)**

Una vez deployado el sandbox, `schema.d.ts` se regenera con las mutations `checkHandleAvailable`, `createUserProfile`, y ahora también `removeMember`. Limpiar los casts temporales:

1. En `polla-app/src/app/features/auth/register.component.ts`, reemplazar los `(apiClient.mutations as unknown as { ... })` por llamadas directas: `apiClient.mutations.checkHandleAvailable({ handle }, { authMode: 'apiKey' })` y `apiClient.mutations.createUserProfile({ handle })`.
2. En `polla-app/src/app/core/api/api.service.ts`, reemplazar el cast del `removeMember` por la llamada directa: `apiClient.mutations.removeMember(input)`.
3. Run typecheck + build + jest. Todos deberían seguir verdes (los tipos generados son compatibles con las firmas que el código espera).
4. Commit:

```bash
cd 'C:\Users\Marke\Documents\Respaldo\polla mundialista\polla-app' && git add src/app/features/auth/register.component.ts src/app/core/api/api.service.ts
cd 'C:\Users\Marke\Documents\Respaldo\polla mundialista\polla-app' && git commit -m "chore: drop temporary mutation type casts now that schema.d.ts is regenerated

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```
