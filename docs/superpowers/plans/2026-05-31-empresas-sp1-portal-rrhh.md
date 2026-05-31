# Empresas SP-1 — Portal de RRHH + roles + invitar jefes — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dar al company-admin (RRHH) su propia área `/empresa` (hoy la UI de empresas es solo super-admin), permitirle editar los premios de la empresa (global + inter-departamento) e **invitar jefes de departamento** (crear/listar/revocar invitaciones).

**Architecture:** Backend Amplify Gen2 — extiende el modelo `Company` con campos de premios, agrega el modelo `DepartmentInvite` y dos lambdas (`inviteDepartmentHead`, `revokeDepartmentInvite`) que reusan el patrón de auth `isCompanyAdmin`. Frontend Angular 18 standalone (signals) — un guard `companyAdminGuard`, rutas `/empresa`, un shell de portal y 4 pantallas (Resumen, Departamentos, Jefes, Premios). La **aceptación** de invitaciones (el jefe crea su departamento) es SP-2, fuera de este plan.

**Tech Stack:** Amplify Gen2 (AppSync, DynamoDB, Lambda TS, jest), Angular 18 (standalone, signals, `@if`/`@for`, jest via `@angular-builders/jest`).

**Convenciones de test:**
- Backend: `cd polla-backend && npx jest --maxWorkers=2 <pattern>`. Si `node`/`npx` no están en PATH (Windows): PowerShell `$env:Path = "$env:ProgramFiles\nodejs;" + $env:Path`.
- Front: `cd polla-app && npm test -- --no-watch --test-path-pattern=<pattern>` (NUNCA `npx jest`).
- En templates Angular, `@` literal se escapa como `&#64;` (no aplica aquí salvo que escribas un email literal en template).

---

## File Structure

**Backend (`polla-backend`):**
- Modify `amplify/data/resource.ts` — campos de premios en `Company`, modelo `DepartmentInvite` + enum, mutations `inviteDepartmentHead`/`revokeDepartmentInvite`, args de premios en `updateCompany`.
- Modify `amplify/functions/update-company/handler.ts` — persistir los 6 campos de premios.
- Create `amplify/functions/invite-department-head/{resource.ts,handler.ts}` + `tests/unit/invite-department-head.test.ts`.
- Create `amplify/functions/revoke-department-invite/{resource.ts,handler.ts}` + `tests/unit/revoke-department-invite.test.ts`.
- Modify `src/lib/errors.ts` — código `DEPARTMENT_INVITE_NOT_FOUND`.
- Modify `amplify/backend.ts` — wiring de las 2 lambdas.

**Frontend (`polla-app`):**
- Modify `src/app/core/api/api.service.ts` — `inviteDepartmentHead`, `revokeDepartmentInvite`, `listDepartmentInvites`, `listMyCompanyAdminships`, extender `updateCompany` con premios.
- Create `src/app/core/auth/company-admin.guard.ts` + `src/app/core/auth/company-admin.guard.spec.ts`.
- Create `src/app/features/empresa/empresa.routes.ts`.
- Create `src/app/features/empresa/empresa-home.component.ts` (lista mis empresas).
- Create `src/app/features/empresa/empresa-shell.component.ts` (portal de una empresa).
- Create `src/app/features/empresa/empresa-resumen.component.ts`.
- Create `src/app/features/empresa/empresa-departamentos.component.ts`.
- Create `src/app/features/empresa/empresa-jefes.component.ts`.
- Create `src/app/features/empresa/empresa-premios.component.ts`.
- Modify `src/app/app.routes.ts` — montar `/empresa`.

---

## TASK 1 — `Company`: campos de premios + `updateCompany` los persiste

**Files:**
- Modify `amplify/data/resource.ts` (modelo `Company` ~líneas 192-209; mutation `updateCompany` ~líneas 992-1006)
- Modify `amplify/functions/update-company/handler.ts`
- Test: `tests/unit/update-company.test.ts` (si no existe, créalo con el mismo harness de `add-company-admin.test.ts`)

- [ ] **Step 1: Añadir campos de premios al modelo `Company`.** En `amplify/data/resource.ts`, dentro del `.model({...})` de `Company`, justo antes de `createdAt: a.datetime().required(),`, añade:

```typescript
      // Premios del ranking GLOBAL de la empresa (Sub-3 los muestra).
      prize1st: a.string(),
      prize2nd: a.string(),
      prize3rd: a.string(),
      // Premios de la competencia INTER-DEPARTAMENTO.
      deptPrize1st: a.string(),
      deptPrize2nd: a.string(),
      deptPrize3rd: a.string(),
```

- [ ] **Step 2: Extender los argumentos de la mutation `updateCompany`.** En el bloque `.arguments({...})` de `updateCompany`, después de `brandAccent: a.string(),`, añade:

```typescript
      prize1st: a.string(),
      prize2nd: a.string(),
      prize3rd: a.string(),
      deptPrize1st: a.string(),
      deptPrize2nd: a.string(),
      deptPrize3rd: a.string(),
```

- [ ] **Step 3: Test que falla** en `tests/unit/update-company.test.ts`. Si el archivo NO existe, créalo copiando el harness (`MockDdb`, `jest.mock`, `setEnv`, `loadHandlerFresh`) de `tests/unit/add-company-admin.test.ts` adaptado a update-company (el MockDdb debe responder `GetCommand` de `COMPANY_TABLE` con un company ACTIVE y registrar el `UpdateCommand`). Añade este caso:

```typescript
it('persiste los 6 campos de premios en el UpdateExpression', async () => {
  const { handler, mock } = await loadHandlerFresh({ company: { id: 'c1', status: 'ACTIVE' } });
  const res = await handler({
    arguments: { id: 'c1', prize1st: '$500', deptPrize1st: 'Día libre' },
    identity: { sub: 'super', groups: ['admins'] },
  });
  expect(res.ok).toBe(true);
  const upd = mock.calls.find((c) => c.name === 'UpdateCommand')!.input as {
    UpdateExpression: string; ExpressionAttributeValues: Record<string, unknown>;
  };
  expect(upd.UpdateExpression).toContain('#prize1st = :p1');
  expect(upd.UpdateExpression).toContain('#deptPrize1st = :dp1');
  expect(upd.ExpressionAttributeValues[':p1']).toBe('$500');
  expect(upd.ExpressionAttributeValues[':dp1']).toBe('Día libre');
});
```

- [ ] **Step 4: Verificar que falla.** `cd polla-backend && npx jest --maxWorkers=2 update-company`
Expected: FAIL (el handler aún no escribe esos campos).

- [ ] **Step 5: Implementar en `amplify/functions/update-company/handler.ts`.** (a) En `interface Args`, después de `brandAccent?: string | null;`, añade:

```typescript
  prize1st?: string | null;
  prize2nd?: string | null;
  prize3rd?: string | null;
  deptPrize1st?: string | null;
  deptPrize2nd?: string | null;
  deptPrize3rd?: string | null;
```

(b) En el destructuring `const { ... } = event.arguments;`, añade los 6 nombres. (c) Después de la última línea `if (brandAccent !== undefined) add('brandAccent', brandAccent, ':ba');`, añade:

```typescript
  if (prize1st !== undefined) add('prize1st', prize1st, ':p1');
  if (prize2nd !== undefined) add('prize2nd', prize2nd, ':p2');
  if (prize3rd !== undefined) add('prize3rd', prize3rd, ':p3');
  if (deptPrize1st !== undefined) add('deptPrize1st', deptPrize1st, ':dp1');
  if (deptPrize2nd !== undefined) add('deptPrize2nd', deptPrize2nd, ':dp2');
  if (deptPrize3rd !== undefined) add('deptPrize3rd', deptPrize3rd, ':dp3');
```

- [ ] **Step 6: Verificar que pasa.** `cd polla-backend && npx jest --maxWorkers=2 update-company`
Expected: PASS.

- [ ] **Step 7: Commit.**

```bash
git add amplify/data/resource.ts amplify/functions/update-company/handler.ts tests/unit/update-company.test.ts
git commit -m "feat(company): premios de empresa + inter-departamento en updateCompany"
```

---

## TASK 2 — Modelo `DepartmentInvite` + enum

**Files:** Modify `amplify/data/resource.ts`

- [ ] **Step 1: Añadir el enum** cerca de `CompanyStatus`/`CompanyMemberRole` (~línea 190):

```typescript
  DepartmentInviteStatus: a.enum(['PENDING', 'ACCEPTED', 'REVOKED']),
```

- [ ] **Step 2: Añadir el modelo** cerca de `CompanyMember` (~línea 227):

```typescript
  DepartmentInvite: a
    .model({
      companyId: a.id().required(),
      invitedEmail: a.email().required(),
      code: a.string().required(),
      status: a.ref('DepartmentInviteStatus').required(),
      // Se setean al aceptar (SP-2):
      userId: a.id(),
      groupId: a.id(),
      createdBy: a.id().required(),
      createdAt: a.datetime().required(),
    })
    .secondaryIndexes((idx) => [
      idx('companyId').name('invitesByCompany'),
      idx('code').name('inviteByCode'),
    ])
    .disableOperations(['create', 'update', 'delete'])
    .authorization((allow) => [
      allow.authenticated().to(['read']),
      allow.group('admins'),
    ]),
```

- [ ] **Step 3: Typecheck.** `cd polla-backend && npx tsc --noEmit`
Expected: exit 0 (sin errores nuevos).

- [ ] **Step 4: Commit.**

```bash
git add amplify/data/resource.ts
git commit -m "feat(schema): modelo DepartmentInvite + enum DepartmentInviteStatus"
```

---

## TASK 3 — Lambda `invite-department-head` (TDD)

**Files:**
- Create `amplify/functions/invite-department-head/resource.ts`
- Create `amplify/functions/invite-department-head/handler.ts`
- Create `tests/unit/invite-department-head.test.ts`

- [ ] **Step 1: `resource.ts`** (mirror `update-company/resource.ts`):

```typescript
import { defineFunction } from '@aws-amplify/backend';

export const inviteDepartmentHead = defineFunction({
  name: 'invite-department-head',
  entry: './handler.ts',
  runtime: 20,
  timeoutSeconds: 10,
  resourceGroupName: 'data',
});
```

- [ ] **Step 2: Test que falla** `tests/unit/invite-department-head.test.ts`. Copia el harness de `tests/unit/add-company-admin.test.ts` (MockDdb por `cmd.constructor.name`, `jest.mock('@aws-sdk/lib-dynamodb')`, `setEnv`, `loadHandlerFresh`). El MockDdb debe: responder `GetCommand` de `COMPANY_TABLE` con el company; responder `QueryCommand` (companiesByUser) con las membresías del caller; registrar el `PutCommand` del invite. `setEnv` setea `COMPANY_TABLE='C'`, `COMPANY_MEMBER_TABLE='CM'`, `COMPANY_MEMBER_INDEX='companiesByUser'`, `DEPARTMENT_INVITE_TABLE='DI'`. Casos:

```typescript
it('super-admin invita jefe: crea DepartmentInvite PENDING y devuelve code', async () => {
  const { handler, mock } = await loadHandlerFresh({
    company: { id: 'c1', status: 'ACTIVE' }, members: [],
  });
  const res = await handler({
    arguments: { companyId: 'c1', email: 'jefe@acme.test' },
    identity: { sub: 'super', groups: ['admins'] },
  });
  expect(res.ok).toBe(true);
  expect(typeof res.code).toBe('string');
  expect(res.code.length).toBe(6);
  const put = mock.calls.find((c) => c.name === 'PutCommand')!.input as { Item: Record<string, unknown> };
  expect(put.Item['companyId']).toBe('c1');
  expect(put.Item['invitedEmail']).toBe('jefe@acme.test');
  expect(put.Item['status']).toBe('PENDING');
  expect(put.Item['createdBy']).toBe('super');
});

it('company-admin de c1 invita: ok', async () => {
  const { handler } = await loadHandlerFresh({
    company: { id: 'c1', status: 'ACTIVE' },
    members: [{ companyId: 'c1', userId: 'caller', role: 'ADMIN' }],
  });
  const res = await handler({
    arguments: { companyId: 'c1', email: 'jefe@acme.test' },
    identity: { sub: 'caller', groups: [] },
  });
  expect(res.ok).toBe(true);
});

it('no company-admin: NOT_COMPANY_ADMIN, sin Put', async () => {
  const { handler, mock } = await loadHandlerFresh({
    company: { id: 'c1', status: 'ACTIVE' }, members: [],
  });
  await expect(handler({
    arguments: { companyId: 'c1', email: 'jefe@acme.test' },
    identity: { sub: 'rando', groups: [] },
  })).rejects.toMatchObject({ code: 'NOT_COMPANY_ADMIN' });
  expect(mock.calls.find((c) => c.name === 'PutCommand')).toBeUndefined();
});

it('email inválido: VALIDATION_ERROR', async () => {
  const { handler } = await loadHandlerFresh({
    company: { id: 'c1', status: 'ACTIVE' }, members: [],
  });
  await expect(handler({
    arguments: { companyId: 'c1', email: 'no-es-email' },
    identity: { sub: 'super', groups: ['admins'] },
  })).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
});

it('empresa DISABLED + caller no super: COMPANY_DISABLED', async () => {
  const { handler } = await loadHandlerFresh({
    company: { id: 'c1', status: 'DISABLED' },
    members: [{ companyId: 'c1', userId: 'caller', role: 'ADMIN' }],
  });
  await expect(handler({
    arguments: { companyId: 'c1', email: 'jefe@acme.test' },
    identity: { sub: 'caller', groups: [] },
  })).rejects.toMatchObject({ code: 'COMPANY_DISABLED' });
});
```

- [ ] **Step 3: Verificar que falla.** `cd polla-backend && npx jest --maxWorkers=2 invite-department-head`
Expected: FAIL (módulo no existe).

- [ ] **Step 4: Implementar `handler.ts`:**

```typescript
/**
 * invite-department-head Lambda
 *
 * Crea una DepartmentInvite (PENDING) para que un jefe cree luego su
 * departamento ligado a la empresa (la aceptación es SP-2). Auth: super-admin
 * o company-admin de companyId; empresa debe estar ACTIVE para no-super-admin.
 * El email de notificación es follow-up: por ahora RRHH comparte el code/link.
 */
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient, GetCommand, PutCommand,
} from '@aws-sdk/lib-dynamodb';
import { ulid } from 'ulid';
import { generateJoinCode } from '../../../src/lib/codes';
import { DomainError } from '../../../src/lib/errors';
import { isCompanyAdmin } from '../../../src/lib/auth';

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const COMPANY = process.env['COMPANY_TABLE']!;
const COMPANY_MEMBER = process.env['COMPANY_MEMBER_TABLE']!;
const COMPANY_MEMBER_INDEX = process.env['COMPANY_MEMBER_INDEX']!;
const INVITE = process.env['DEPARTMENT_INVITE_TABLE']!;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface AppSyncEvent {
  arguments: { companyId: string; email: string };
  identity: { sub: string; groups?: ReadonlyArray<string> };
}

interface Response { ok: boolean; inviteId: string; code: string }

export async function handler(event: AppSyncEvent): Promise<Response> {
  const caller = event.identity.sub;
  const isSuperAdmin = (event.identity.groups ?? []).includes('admins');
  const { companyId, email } = event.arguments;

  const companyRes = await ddb.send(new GetCommand({ TableName: COMPANY, Key: { id: companyId } }));
  const company = companyRes.Item as { status: string } | undefined;
  if (!company) throw new DomainError('COMPANY_NOT_FOUND');

  if (!isSuperAdmin) {
    const admin = await isCompanyAdmin(ddb, COMPANY_MEMBER, COMPANY_MEMBER_INDEX, caller, companyId);
    if (!admin) throw new DomainError('NOT_COMPANY_ADMIN');
    if (company.status === 'DISABLED') throw new DomainError('COMPANY_DISABLED');
  }

  const trimmed = (email ?? '').trim();
  if (!EMAIL_RE.test(trimmed)) throw new DomainError('VALIDATION_ERROR');

  const inviteId = ulid();
  const code = generateJoinCode();
  const now = new Date().toISOString();

  await ddb.send(new PutCommand({
    TableName: INVITE,
    Item: {
      __typename: 'DepartmentInvite',
      id: inviteId,
      companyId,
      invitedEmail: trimmed,
      code,
      status: 'PENDING',
      createdBy: caller,
      createdAt: now,
      updatedAt: now,
    },
  }));

  return { ok: true, inviteId, code };
}
```

- [ ] **Step 5: Verificar que pasa.** `cd polla-backend && npx jest --maxWorkers=2 invite-department-head`
Expected: PASS (5/5).

- [ ] **Step 6: Commit.**

```bash
git add amplify/functions/invite-department-head/ tests/unit/invite-department-head.test.ts
git commit -m "feat(invite-department-head): lambda para invitar jefes de departamento"
```

---

## TASK 4 — Lambda `revoke-department-invite` (TDD)

**Files:**
- Modify `src/lib/errors.ts`
- Create `amplify/functions/revoke-department-invite/resource.ts`
- Create `amplify/functions/revoke-department-invite/handler.ts`
- Create `tests/unit/revoke-department-invite.test.ts`

- [ ] **Step 1: Añadir código de error** en `src/lib/errors.ts`, dentro del objeto `ErrorCode`, en la sección "Empresas":

```typescript
  DEPARTMENT_INVITE_NOT_FOUND: 'DEPARTMENT_INVITE_NOT_FOUND',
```

- [ ] **Step 2: `resource.ts`:**

```typescript
import { defineFunction } from '@aws-amplify/backend';

export const revokeDepartmentInvite = defineFunction({
  name: 'revoke-department-invite',
  entry: './handler.ts',
  runtime: 20,
  timeoutSeconds: 10,
  resourceGroupName: 'data',
});
```

- [ ] **Step 3: Test que falla** `tests/unit/revoke-department-invite.test.ts` (mismo harness). El MockDdb responde `GetCommand` de `DEPARTMENT_INVITE_TABLE` con el invite, `QueryCommand` (companiesByUser) con las membresías del caller, y registra el `UpdateCommand`. `setEnv`: `COMPANY_MEMBER_TABLE='CM'`, `COMPANY_MEMBER_INDEX='companiesByUser'`, `DEPARTMENT_INVITE_TABLE='DI'`. Casos:

```typescript
it('company-admin revoca invite PENDING → status REVOKED', async () => {
  const { handler, mock } = await loadHandlerFresh({
    invite: { id: 'i1', companyId: 'c1', status: 'PENDING' },
    members: [{ companyId: 'c1', userId: 'caller', role: 'ADMIN' }],
  });
  const res = await handler({
    arguments: { inviteId: 'i1' },
    identity: { sub: 'caller', groups: [] },
  });
  expect(res.ok).toBe(true);
  const upd = mock.calls.find((c) => c.name === 'UpdateCommand')!.input as {
    ExpressionAttributeValues: Record<string, unknown>;
  };
  expect(upd.ExpressionAttributeValues[':s']).toBe('REVOKED');
});

it('invite inexistente: DEPARTMENT_INVITE_NOT_FOUND', async () => {
  const { handler } = await loadHandlerFresh({ invite: undefined, members: [] });
  await expect(handler({
    arguments: { inviteId: 'ghost' },
    identity: { sub: 'super', groups: ['admins'] },
  })).rejects.toMatchObject({ code: 'DEPARTMENT_INVITE_NOT_FOUND' });
});

it('caller no admin de la empresa del invite: NOT_COMPANY_ADMIN', async () => {
  const { handler, mock } = await loadHandlerFresh({
    invite: { id: 'i1', companyId: 'c1', status: 'PENDING' },
    members: [{ companyId: 'other', userId: 'caller', role: 'ADMIN' }],
  });
  await expect(handler({
    arguments: { inviteId: 'i1' },
    identity: { sub: 'caller', groups: [] },
  })).rejects.toMatchObject({ code: 'NOT_COMPANY_ADMIN' });
  expect(mock.calls.find((c) => c.name === 'UpdateCommand')).toBeUndefined();
});

it('invite ya ACCEPTED: VALIDATION_ERROR (solo PENDING se revoca)', async () => {
  const { handler } = await loadHandlerFresh({
    invite: { id: 'i1', companyId: 'c1', status: 'ACCEPTED' },
    members: [],
  });
  await expect(handler({
    arguments: { inviteId: 'i1' },
    identity: { sub: 'super', groups: ['admins'] },
  })).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
});
```

- [ ] **Step 4: Verificar que falla.** `cd polla-backend && npx jest --maxWorkers=2 revoke-department-invite`
Expected: FAIL.

- [ ] **Step 5: Implementar `handler.ts`:**

```typescript
/**
 * revoke-department-invite Lambda
 *
 * Marca una DepartmentInvite PENDING como REVOKED. Auth: super-admin o
 * company-admin de la empresa del invite. Solo invites PENDING se revocan.
 */
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient, GetCommand, UpdateCommand,
} from '@aws-sdk/lib-dynamodb';
import { DomainError } from '../../../src/lib/errors';
import { isCompanyAdmin } from '../../../src/lib/auth';

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const COMPANY_MEMBER = process.env['COMPANY_MEMBER_TABLE']!;
const COMPANY_MEMBER_INDEX = process.env['COMPANY_MEMBER_INDEX']!;
const INVITE = process.env['DEPARTMENT_INVITE_TABLE']!;

interface AppSyncEvent {
  arguments: { inviteId: string };
  identity: { sub: string; groups?: ReadonlyArray<string> };
}

interface Response { ok: boolean }

export async function handler(event: AppSyncEvent): Promise<Response> {
  const caller = event.identity.sub;
  const isSuperAdmin = (event.identity.groups ?? []).includes('admins');
  const { inviteId } = event.arguments;

  const res = await ddb.send(new GetCommand({ TableName: INVITE, Key: { id: inviteId } }));
  const invite = res.Item as { id: string; companyId: string; status: string } | undefined;
  if (!invite) throw new DomainError('DEPARTMENT_INVITE_NOT_FOUND');

  if (!isSuperAdmin) {
    const admin = await isCompanyAdmin(ddb, COMPANY_MEMBER, COMPANY_MEMBER_INDEX, caller, invite.companyId);
    if (!admin) throw new DomainError('NOT_COMPANY_ADMIN');
  }

  if (invite.status !== 'PENDING') throw new DomainError('VALIDATION_ERROR');

  await ddb.send(new UpdateCommand({
    TableName: INVITE,
    Key: { id: inviteId },
    UpdateExpression: 'SET #s = :s, updatedAt = :u',
    ExpressionAttributeNames: { '#s': 'status' },
    ExpressionAttributeValues: { ':s': 'REVOKED', ':u': new Date().toISOString() },
  }));

  return { ok: true };
}
```

- [ ] **Step 6: Verificar que pasa.** `cd polla-backend && npx jest --maxWorkers=2 revoke-department-invite`
Expected: PASS (4/4).

- [ ] **Step 7: Commit.**

```bash
git add src/lib/errors.ts amplify/functions/revoke-department-invite/ tests/unit/revoke-department-invite.test.ts
git commit -m "feat(revoke-department-invite): lambda para revocar invitaciones de jefe"
```

---

## TASK 5 — Mutations en schema + wiring en backend.ts

**Files:** Modify `amplify/data/resource.ts`, `amplify/backend.ts`

- [ ] **Step 1: Imports en `resource.ts`** (junto a los otros imports de funciones de empresa, ~línea 39):

```typescript
import { inviteDepartmentHead } from '../functions/invite-department-head/resource';
import { revokeDepartmentInvite } from '../functions/revoke-department-invite/resource';
```

- [ ] **Step 2: Mutations en `resource.ts`** (cerca de `addCompanyAdmin`, ~línea 1026):

```typescript
  inviteDepartmentHead: a
    .mutation()
    .arguments({ companyId: a.id().required(), email: a.email().required() })
    .returns(a.customType({
      ok: a.boolean().required(),
      inviteId: a.string().required(),
      code: a.string().required(),
    }))
    .authorization((allow) => [allow.authenticated()])
    .handler(a.handler.function(inviteDepartmentHead)),

  revokeDepartmentInvite: a
    .mutation()
    .arguments({ inviteId: a.id().required() })
    .returns(a.customType({ ok: a.boolean().required() }))
    .authorization((allow) => [allow.authenticated()])
    .handler(a.handler.function(revokeDepartmentInvite)),
```

- [ ] **Step 3: Wiring en `backend.ts`.** (a) Imports de los resources (junto a los demás imports de funciones, arriba):

```typescript
import { inviteDepartmentHead } from './functions/invite-department-head/resource';
import { revokeDepartmentInvite } from './functions/revoke-department-invite/resource';
```

(b) Añádelos al objeto `defineBackend({...})` (después de `updateCompanyGroup,`):

```typescript
  inviteDepartmentHead,
  revokeDepartmentInvite,
```

(c) Después del bloque de const de tablas (donde están `companyTable`/`companyMemberTable`, ~línea 610), añade:

```typescript
const departmentInviteTable = tables['DepartmentInvite']!;
```

(d) Después del wiring de `addCompanyAdmin` (~línea 640), añade:

```typescript
// invite-department-head: reads Company + CompanyMember.companiesByUser; writes DepartmentInvite.
backend.inviteDepartmentHead.addEnvironment('COMPANY_TABLE', companyTable.tableName);
backend.inviteDepartmentHead.addEnvironment('COMPANY_MEMBER_TABLE', companyMemberTable.tableName);
backend.inviteDepartmentHead.addEnvironment('COMPANY_MEMBER_INDEX', 'companiesByUser');
backend.inviteDepartmentHead.addEnvironment('DEPARTMENT_INVITE_TABLE', departmentInviteTable.tableName);
companyTable.grantReadData(backend.inviteDepartmentHead.resources.lambda);
companyMemberTable.grantReadData(backend.inviteDepartmentHead.resources.lambda);
departmentInviteTable.grantWriteData(backend.inviteDepartmentHead.resources.lambda);
grantIndexQuery(companyMemberTable, backend.inviteDepartmentHead.resources.lambda);

// revoke-department-invite: reads DepartmentInvite + CompanyMember.companiesByUser; updates DepartmentInvite.
backend.revokeDepartmentInvite.addEnvironment('COMPANY_MEMBER_TABLE', companyMemberTable.tableName);
backend.revokeDepartmentInvite.addEnvironment('COMPANY_MEMBER_INDEX', 'companiesByUser');
backend.revokeDepartmentInvite.addEnvironment('DEPARTMENT_INVITE_TABLE', departmentInviteTable.tableName);
companyMemberTable.grantReadData(backend.revokeDepartmentInvite.resources.lambda);
departmentInviteTable.grantReadWriteData(backend.revokeDepartmentInvite.resources.lambda);
grantIndexQuery(companyMemberTable, backend.revokeDepartmentInvite.resources.lambda);
```

- [ ] **Step 4: Typecheck + suite completa.** `cd polla-backend && npx tsc --noEmit` (exit 0 en fuentes) y `npx jest --maxWorkers=2` (todo verde; reporta el total `Tests:`).

- [ ] **Step 5: Commit.**

```bash
git add amplify/data/resource.ts amplify/backend.ts
git commit -m "feat(schema): mutations inviteDepartmentHead/revokeDepartmentInvite + wiring"
```

---

## TASK 6 — api.service: métodos de empresa para el portal

**Files:** Modify `src/app/core/api/api.service.ts`

- [ ] **Step 1: Extender `updateCompany`** para aceptar premios. Reemplaza el método `updateCompany(input: {...}) { return apiClient.mutations.updateCompany(input); }` por (cast porque los tipos generados aún no conocen los premios sin deploy):

```typescript
  updateCompany(input: {
    id: string;
    name?: string;
    contactEmail?: string | null;
    description?: string | null;
    logoKey?: string | null;
    brandPrimary?: string | null;
    brandPrimaryDark?: string | null;
    brandAccent?: string | null;
    prize1st?: string | null;
    prize2nd?: string | null;
    prize3rd?: string | null;
    deptPrize1st?: string | null;
    deptPrize2nd?: string | null;
    deptPrize3rd?: string | null;
  }) {
    return (apiClient as unknown as {
      mutations: { updateCompany: (i: typeof input) => Promise<{ data?: { ok: boolean; message: string } | null }> };
    }).mutations.updateCompany(input);
  }
```

- [ ] **Step 2: Añadir los métodos nuevos** después de `searchUsers(...)` (fin de la sección Empresas):

```typescript
  /** Invita a un jefe de departamento por email. Devuelve inviteId + code. */
  inviteDepartmentHead(input: { companyId: string; email: string }) {
    return (apiClient as unknown as {
      mutations: { inviteDepartmentHead: (i: { companyId: string; email: string }) => Promise<{ data?: { ok: boolean; inviteId: string; code: string } | null }> };
    }).mutations.inviteDepartmentHead(input);
  }

  /** Revoca una invitación de jefe (PENDING → REVOKED). */
  revokeDepartmentInvite(inviteId: string) {
    return (apiClient as unknown as {
      mutations: { revokeDepartmentInvite: (i: { inviteId: string }) => Promise<{ data?: { ok: boolean } | null }> };
    }).mutations.revokeDepartmentInvite({ inviteId });
  }

  /** Invitaciones de jefe de una empresa. */
  listDepartmentInvites(companyId: string) {
    return (apiClient as unknown as {
      models: { DepartmentInvite: { list: (i: { filter: { companyId: { eq: string } } }) => Promise<{ data?: Array<{ id: string; companyId: string; invitedEmail: string; code: string; status: string; createdAt: string }> | null }> } };
    }).models.DepartmentInvite.list({ filter: { companyId: { eq: companyId } } });
  }

  /** Empresas donde `userId` es company-admin (role ADMIN). */
  listMyCompanyAdminships(userId: string) {
    return apiClient.models.CompanyMember.list({
      filter: { and: [{ userId: { eq: userId } }, { role: { eq: 'ADMIN' } }] },
    });
  }
```

- [ ] **Step 3: Typecheck.** `cd polla-app && npx tsc --noEmit -p tsconfig.app.json`
Expected: exit 0.

- [ ] **Step 4: Commit.**

```bash
git add src/app/core/api/api.service.ts
git commit -m "feat(api): métodos del portal de empresa (invite/revoke/list + premios)"
```

---

## TASK 7 — `companyAdminGuard` (TDD) + rutas `/empresa` + shell + Resumen

**Files:**
- Create `src/app/core/auth/company-admin.guard.ts` + `src/app/core/auth/company-admin.guard.spec.ts`
- Create `src/app/features/empresa/empresa.routes.ts`
- Create `src/app/features/empresa/empresa-home.component.ts`
- Create `src/app/features/empresa/empresa-shell.component.ts`
- Create `src/app/features/empresa/empresa-resumen.component.ts`
- Modify `src/app/app.routes.ts`

- [ ] **Step 1: Test que falla** `src/app/core/auth/company-admin.guard.spec.ts`:

```typescript
import { TestBed } from '@angular/core/testing';
import { Router, UrlTree } from '@angular/router';
import { runInInjectionContext } from '@angular/core';
import { companyAdminGuard } from './company-admin.guard';
import { AuthService } from './auth.service';
import { ApiService } from '../api/api.service';

function build(user: { sub: string; isAdmin: boolean } | null, adminships: unknown[]) {
  const auth = { user: () => user, loadUser: async () => user } as unknown as AuthService;
  const api = { listMyCompanyAdminships: jest.fn().mockResolvedValue({ data: adminships }) } as unknown as ApiService;
  TestBed.configureTestingModule({
    providers: [{ provide: AuthService, useValue: auth }, { provide: ApiService, useValue: api }],
  });
  return TestBed.inject(Router);
}

describe('companyAdminGuard', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('permite si el usuario es company-admin de ≥1 empresa', async () => {
    const router = build({ sub: 'u1', isAdmin: false }, [{ companyId: 'c1' }]);
    const r = await runInInjectionContext(TestBed, () => companyAdminGuard({} as never, {} as never));
    expect(r).toBe(true);
    void router;
  });

  it('permite si es super-admin aunque no tenga adminships', async () => {
    build({ sub: 'u1', isAdmin: true }, []);
    const r = await runInInjectionContext(TestBed, () => companyAdminGuard({} as never, {} as never));
    expect(r).toBe(true);
  });

  it('redirige a /home si no es admin de ninguna empresa', async () => {
    build({ sub: 'u1', isAdmin: false }, []);
    const r = await runInInjectionContext(TestBed, () => companyAdminGuard({} as never, {} as never));
    expect(r instanceof UrlTree).toBe(true);
  });
});
```

- [ ] **Step 2: Verificar que falla.** `cd polla-app && npm test -- --no-watch --test-path-pattern=company-admin.guard`
Expected: FAIL (módulo no existe).

- [ ] **Step 3: Implementar `company-admin.guard.ts`:**

```typescript
import { inject } from '@angular/core';
import { Router, type CanActivateFn } from '@angular/router';
import { AuthService } from './auth.service';
import { ApiService } from '../api/api.service';

/** Acceso a /empresa: super-admin o company-admin de ≥1 empresa. */
export const companyAdminGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const api = inject(ApiService);
  const router = inject(Router);
  const u = auth.user() ?? (await auth.loadUser());
  if (!u) return router.createUrlTree(['/login']);
  if (u.isAdmin) return true;
  try {
    const res = await api.listMyCompanyAdminships(u.sub);
    if ((res.data ?? []).length > 0) return true;
  } catch { /* sin acceso */ }
  return router.createUrlTree(['/home']);
};
```

- [ ] **Step 4: Verificar que pasa.** `cd polla-app && npm test -- --no-watch --test-path-pattern=company-admin.guard`
Expected: PASS (3/3).

- [ ] **Step 5: Crear `empresa-resumen.component.ts`** (pantalla por defecto del shell — datos read-only de la empresa):

```typescript
import { Component, Input, OnInit, inject, signal } from '@angular/core';
import { ApiService } from '../../core/api/api.service';

interface CompanyView { id: string; name: string; status: string; contactEmail: string | null; description: string | null }

@Component({
  standalone: true,
  selector: 'app-empresa-resumen',
  template: `
    @if (company(); as c) {
      <h2 class="page__title">{{ c.name }}</h2>
      <p class="kicker">Estado: {{ c.status }}</p>
      @if (c.contactEmail) { <p>Contacto: {{ c.contactEmail }}</p> }
      @if (c.description) { <p>{{ c.description }}</p> }
    } @else {
      <p>Cargando…</p>
    }
  `,
})
export class EmpresaResumenComponent implements OnInit {
  @Input() companyId = '';
  private api = inject(ApiService);
  company = signal<CompanyView | null>(null);

  async ngOnInit() {
    const res = await this.api.getCompany(this.companyId);
    const d = res.data as CompanyView | null;
    if (d) this.company.set(d);
  }
}
```

- [ ] **Step 6: Crear `empresa-shell.component.ts`** (portal de UNA empresa: sub-nav + outlet; pasa el `:id` a los hijos vía un servicio simple de ruta). Usa `ActivatedRoute` para el `:id`:

```typescript
import { Component, inject } from '@angular/core';
import { ActivatedRoute, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { map } from 'rxjs';

@Component({
  standalone: true,
  selector: 'app-empresa-shell',
  imports: [RouterLink, RouterLinkActive, RouterOutlet],
  template: `
    <div class="admin-shell">
      <nav class="admin-subnav" aria-label="Portal de empresa">
        <div class="admin-subnav__group">
          <span class="admin-subnav__kicker">Mi empresa</span>
          <a [routerLink]="['/empresa', id()]" routerLinkActive="is-active" [routerLinkActiveOptions]="{ exact: true }" class="admin-subnav__item">Resumen</a>
          <a [routerLink]="['/empresa', id(), 'departamentos']" routerLinkActive="is-active" class="admin-subnav__item">Departamentos</a>
          <a [routerLink]="['/empresa', id(), 'jefes']" routerLinkActive="is-active" class="admin-subnav__item">Jefes</a>
          <a [routerLink]="['/empresa', id(), 'premios']" routerLinkActive="is-active" class="admin-subnav__item">Premios</a>
        </div>
      </nav>
      <router-outlet />
    </div>
  `,
})
export class EmpresaShellComponent {
  private route = inject(ActivatedRoute);
  id = toSignal(this.route.paramMap.pipe(map((p) => p.get('id') ?? '')), { initialValue: '' });
}
```

- [ ] **Step 7: Crear `empresa-home.component.ts`** (lista mis empresas; si hay 1, navega directo):

```typescript
import { Component, OnInit, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { ApiService } from '../../core/api/api.service';
import { AuthService } from '../../core/auth/auth.service';

interface Row { companyId: string; name: string }

@Component({
  standalone: true,
  selector: 'app-empresa-home',
  imports: [RouterLink],
  template: `
    <section class="page">
      <h1 class="page__title">Mis empresas</h1>
      @if (loading()) { <p>Cargando…</p> }
      @else if (rows().length === 0) { <p>No administras ninguna empresa.</p> }
      @else {
        <ul>
          @for (r of rows(); track r.companyId) {
            <li><a [routerLink]="['/empresa', r.companyId]">{{ r.name }}</a></li>
          }
        </ul>
      }
    </section>
  `,
})
export class EmpresaHomeComponent implements OnInit {
  private api = inject(ApiService);
  private auth = inject(AuthService);
  private router = inject(Router);
  rows = signal<Row[]>([]);
  loading = signal(true);

  async ngOnInit() {
    const u = this.auth.user();
    if (!u) { this.loading.set(false); return; }
    const ms = (await this.api.listMyCompanyAdminships(u.sub)).data ?? [];
    const rows: Row[] = [];
    for (const m of ms) {
      const cid = (m as { companyId: string }).companyId;
      const c = (await this.api.getCompany(cid)).data as { name?: string } | null;
      rows.push({ companyId: cid, name: c?.name ?? cid });
    }
    this.rows.set(rows);
    this.loading.set(false);
    if (rows.length === 1) void this.router.navigate(['/empresa', rows[0].companyId]);
  }
}
```

- [ ] **Step 8: Crear `empresa.routes.ts`:**

```typescript
import type { Routes } from '@angular/router';
import { companyAdminGuard } from '../../core/auth/company-admin.guard';
import { EmpresaShellComponent } from './empresa-shell.component';

export const empresaRoutes: Routes = [
  {
    path: '',
    canActivate: [companyAdminGuard],
    loadComponent: () => import('./empresa-home.component').then((m) => m.EmpresaHomeComponent),
  },
  {
    path: ':id',
    component: EmpresaShellComponent,
    canActivate: [companyAdminGuard],
    children: [
      { path: '', loadComponent: () => import('./empresa-resumen.component').then((m) => m.EmpresaResumenComponent) },
      { path: 'departamentos', loadComponent: () => import('./empresa-departamentos.component').then((m) => m.EmpresaDepartamentosComponent) },
      { path: 'jefes', loadComponent: () => import('./empresa-jefes.component').then((m) => m.EmpresaJefesComponent) },
      { path: 'premios', loadComponent: () => import('./empresa-premios.component').then((m) => m.EmpresaPremiosComponent) },
    ],
  },
];
```

> Nota: `empresa-resumen`/`shell` reciben el `companyId` desde el `:id` de la ruta. Para que `EmpresaResumenComponent.@Input() companyId` se llene desde el path param, las rutas hijas se cargan bajo el shell que tiene el `:id`; en Angular standalone con `loadComponent`, lee el `:id` del padre vía `ActivatedRoute.parent`. **Ajuste:** en `empresa-resumen.component.ts` reemplaza el `@Input()` por lectura del parent param:
> ```typescript
>   private route = inject(ActivatedRoute);
>   // en ngOnInit:
>   const id = this.route.parent?.snapshot.paramMap.get('id') ?? '';
> ```
> (Importa `ActivatedRoute` desde `@angular/router`. Aplica el mismo patrón en Departamentos/Jefes/Premios.)

- [ ] **Step 9: Montar `/empresa` en `src/app/app.routes.ts`.** Dentro del `children` del `ShellComponent` (junto a la ruta `admin`), añade:

```typescript
      {
        path: 'empresa',
        loadChildren: () => import('./features/empresa/empresa.routes').then((m) => m.empresaRoutes),
      },
```

(Crea los componentes `empresa-departamentos`, `empresa-jefes`, `empresa-premios` en las Tasks 8-10; para que compile AHORA, créalos como stubs mínimos en esas tasks. Si ejecutas las tasks en orden, crea stubs temporales vacíos para que el `loadComponent` resuelva — o implementa Tasks 8-10 antes de correr el build de esta task.)

- [ ] **Step 10: Verificar typecheck (tras crear stubs de 8-10) + commit.**

```bash
cd polla-app && npx tsc --noEmit -p tsconfig.app.json
git add src/app/core/auth/company-admin.guard.ts src/app/core/auth/company-admin.guard.spec.ts src/app/features/empresa/ src/app/app.routes.ts
git commit -m "feat(empresa): guard + rutas /empresa + shell + home + resumen"
```

---

## TASK 8 — Pantalla Departamentos (lista los grupos de la empresa)

**Files:** Create `src/app/features/empresa/empresa-departamentos.component.ts`

- [ ] **Step 1: Implementar** (read-only; reusa `listCompanyGroups`):

```typescript
import { Component, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { ApiService } from '../../core/api/api.service';

interface DeptRow { id: string; name: string; mode: string | null; category: string | null }

@Component({
  standalone: true,
  selector: 'app-empresa-departamentos',
  template: `
    <h2 class="page__title">Departamentos</h2>
    @if (loading()) { <p>Cargando…</p> }
    @else if (rows().length === 0) { <p>Aún no hay departamentos. Invita jefes para que los creen.</p> }
    @else {
      <table>
        <tr><th>Nombre</th><th>Modo</th><th>Categoría</th></tr>
        @for (d of rows(); track d.id) {
          <tr><td>{{ d.name }}</td><td>{{ d.mode }}</td><td>{{ d.category ?? '—' }}</td></tr>
        }
      </table>
    }
  `,
})
export class EmpresaDepartamentosComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private api = inject(ApiService);
  rows = signal<DeptRow[]>([]);
  loading = signal(true);

  async ngOnInit() {
    const id = this.route.parent?.snapshot.paramMap.get('id') ?? '';
    const res = await this.api.listCompanyGroups(id);
    this.rows.set(((res.data ?? []) as DeptRow[]).map((g) => ({ id: g.id, name: g.name, mode: g.mode, category: g.category })));
    this.loading.set(false);
  }
}
```

- [ ] **Step 2: Typecheck + commit.**

```bash
cd polla-app && npx tsc --noEmit -p tsconfig.app.json
git add src/app/features/empresa/empresa-departamentos.component.ts
git commit -m "feat(empresa): pantalla Departamentos (lista de subgrupos)"
```

---

## TASK 9 — Pantalla Jefes (invitar / listar / revocar)

**Files:** Create `src/app/features/empresa/empresa-jefes.component.ts`

- [ ] **Step 1: Implementar:**

```typescript
import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { ApiService } from '../../core/api/api.service';
import { ToastService } from '../../core/notifications/toast.service';
import { humanizeError } from '../../core/notifications/domain-errors';

interface InviteRow { id: string; invitedEmail: string; code: string; status: string }

@Component({
  standalone: true,
  selector: 'app-empresa-jefes',
  imports: [FormsModule],
  template: `
    <h2 class="page__title">Jefes de departamento</h2>

    <div class="invite-box">
      <input type="email" [(ngModel)]="email" placeholder="email@empresa.com" />
      <button type="button" [disabled]="sending()" (click)="invite()">
        {{ sending() ? 'Invitando…' : 'Invitar jefe' }}
      </button>
    </div>

    @if (loading()) { <p>Cargando…</p> }
    @else if (rows().length === 0) { <p>No hay invitaciones todavía.</p> }
    @else {
      <table>
        <tr><th>Email</th><th>Código</th><th>Estado</th><th></th></tr>
        @for (r of rows(); track r.id) {
          <tr>
            <td>{{ r.invitedEmail }}</td>
            <td><code>{{ r.code }}</code></td>
            <td>{{ r.status }}</td>
            <td>
              @if (r.status === 'PENDING') {
                <button type="button" (click)="revoke(r.id)">Revocar</button>
              }
            </td>
          </tr>
        }
      </table>
    }
  `,
})
export class EmpresaJefesComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private api = inject(ApiService);
  private toast = inject(ToastService);

  companyId = '';
  email = '';
  rows = signal<InviteRow[]>([]);
  loading = signal(true);
  sending = signal(false);

  async ngOnInit() {
    this.companyId = this.route.parent?.snapshot.paramMap.get('id') ?? '';
    await this.reload();
  }

  private async reload() {
    this.loading.set(true);
    const res = await this.api.listDepartmentInvites(this.companyId);
    this.rows.set((res.data ?? []) as InviteRow[]);
    this.loading.set(false);
  }

  async invite() {
    const email = this.email.trim();
    if (!email) return;
    this.sending.set(true);
    try {
      const res = await this.api.inviteDepartmentHead({ companyId: this.companyId, email });
      const code = res.data?.code;
      this.toast.success(code ? `Invitación creada · código ${code}` : 'Invitación creada');
      this.email = '';
      await this.reload();
    } catch (e) {
      this.toast.error(humanizeError(e));
    } finally {
      this.sending.set(false);
    }
  }

  async revoke(inviteId: string) {
    try {
      await this.api.revokeDepartmentInvite(inviteId);
      this.toast.success('Invitación revocada');
      await this.reload();
    } catch (e) {
      this.toast.error(humanizeError(e));
    }
  }
}
```

- [ ] **Step 2: Verificar que `humanizeError` y `ToastService` existen en esas rutas** (las usa `company-detail.component.ts` con los mismos imports: `../../../core/notifications/domain-errors` y `../../../core/notifications/toast.service`; desde `features/empresa/` la profundidad es `../../core/notifications/...`). Ajusta el path si el typecheck se queja.

- [ ] **Step 3: Typecheck + commit.**

```bash
cd polla-app && npx tsc --noEmit -p tsconfig.app.json
git add src/app/features/empresa/empresa-jefes.component.ts
git commit -m "feat(empresa): pantalla Jefes (invitar/listar/revocar)"
```

---

## TASK 10 — Pantalla Premios (empresa + inter-departamento)

**Files:** Create `src/app/features/empresa/empresa-premios.component.ts`

- [ ] **Step 1: Implementar** (carga premios actuales con `getCompany`, guarda con `updateCompany`):

```typescript
import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { ApiService } from '../../core/api/api.service';
import { ToastService } from '../../core/notifications/toast.service';
import { humanizeError } from '../../core/notifications/domain-errors';

@Component({
  standalone: true,
  selector: 'app-empresa-premios',
  imports: [FormsModule],
  template: `
    <h2 class="page__title">Premios</h2>

    <fieldset>
      <legend>🏆 Ranking global de la empresa</legend>
      <label>1º <input [(ngModel)]="prize1st" /></label>
      <label>2º <input [(ngModel)]="prize2nd" /></label>
      <label>3º <input [(ngModel)]="prize3rd" /></label>
    </fieldset>

    <fieldset>
      <legend>🏟️ Competencia entre departamentos</legend>
      <label>1º <input [(ngModel)]="deptPrize1st" /></label>
      <label>2º <input [(ngModel)]="deptPrize2nd" /></label>
      <label>3º <input [(ngModel)]="deptPrize3rd" /></label>
    </fieldset>

    <button type="button" [disabled]="saving()" (click)="save()">
      {{ saving() ? 'Guardando…' : 'Guardar premios' }}
    </button>
  `,
})
export class EmpresaPremiosComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private api = inject(ApiService);
  private toast = inject(ToastService);

  companyId = '';
  prize1st = ''; prize2nd = ''; prize3rd = '';
  deptPrize1st = ''; deptPrize2nd = ''; deptPrize3rd = '';
  saving = signal(false);

  async ngOnInit() {
    this.companyId = this.route.parent?.snapshot.paramMap.get('id') ?? '';
    const c = (await this.api.getCompany(this.companyId)).data as Record<string, string | null> | null;
    if (c) {
      this.prize1st = c['prize1st'] ?? ''; this.prize2nd = c['prize2nd'] ?? ''; this.prize3rd = c['prize3rd'] ?? '';
      this.deptPrize1st = c['deptPrize1st'] ?? ''; this.deptPrize2nd = c['deptPrize2nd'] ?? ''; this.deptPrize3rd = c['deptPrize3rd'] ?? '';
    }
  }

  async save() {
    this.saving.set(true);
    try {
      await this.api.updateCompany({
        id: this.companyId,
        prize1st: this.prize1st || null, prize2nd: this.prize2nd || null, prize3rd: this.prize3rd || null,
        deptPrize1st: this.deptPrize1st || null, deptPrize2nd: this.deptPrize2nd || null, deptPrize3rd: this.deptPrize3rd || null,
      });
      this.toast.success('Premios guardados');
    } catch (e) {
      this.toast.error(humanizeError(e));
    } finally {
      this.saving.set(false);
    }
  }
}
```

- [ ] **Step 2: Typecheck + suite front completa.** `cd polla-app && npx tsc --noEmit -p tsconfig.app.json` (exit 0) y `npm test -- --no-watch` (todo verde; reporta el total `Tests:`).

- [ ] **Step 3: Commit.**

```bash
git add src/app/features/empresa/empresa-premios.component.ts
git commit -m "feat(empresa): pantalla Premios (empresa + inter-departamento)"
```

---

## Self-Review (cobertura del spec SP-1)

- **Portal RRHH `/empresa` + guard:** Tasks 6, 7 (guard TDD, rutas, shell, home, resumen). ✓
- **Editar premios de empresa + inter-departamento:** Task 1 (campos + handler), Task 10 (UI). ✓
- **Invitar jefes (crear/listar/revocar):** Tasks 2-5 (modelo, lambdas, mutations, wiring), Task 6 (api), Task 9 (UI). ✓
- **Departamentos (listar):** Task 8. ✓
- **Empresa DISABLED bloquea config para no-super-admin:** heredado del patrón (handlers chequean status). ✓
- **Fuera de SP-1 (no incluido, es SP-2):** aceptación de invitación (el jefe crea su departamento), constraint 1-depto-por-empresa, ranking. Correcto.

**Consistencia de tipos:** `inviteDepartmentHead` devuelve `{ ok, inviteId, code }` (resource.ts ↔ handler ↔ api.service ↔ UI). `revokeDepartmentInvite` devuelve `{ ok }`. Env vars (`DEPARTMENT_INVITE_TABLE`, `COMPANY_MEMBER_INDEX='companiesByUser'`) consistentes entre handlers, tests y wiring. `DepartmentInviteStatus` = PENDING/ACCEPTED/REVOKED usado en modelo, lambdas y UI.

**Deploy (humano, tras implementar):** `cd polla-backend && npx ampx sandbox --once --profile polla` → copiar `amplify_outputs.json` a `polla-app/` y `polla-app/src/`. Sin deploy, las llamadas nuevas del front usan cast (no rompen typecheck) pero fallan en runtime.

---

## Execution Handoff

Plan guardado en `docs/superpowers/plans/2026-05-31-empresas-sp1-portal-rrhh.md`. Dos opciones de ejecución:

1. **Subagent-Driven (recomendado)** — despacho un subagente fresco por tarea, con revisión entre tareas.
2. **Inline** — ejecuto las tareas en esta sesión con checkpoints.

¿Cuál prefieres?
