# Empresas SP-2 — Departamentos + empleados — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) o superpowers:executing-plans. Steps usan `- [ ]`.

**Goal:** Que un jefe invitado (SP-1) **acepte su invitación y cree su departamento** (ligado a la empresa), y que un empleado **no pueda estar en dos departamentos de la misma empresa**.

**Architecture:** Backend Amplify Gen2 — nueva mutation/lambda `acceptDepartmentInvite` que valida la `DepartmentInvite` (por `code`, estado PENDING, email del caller == invitedEmail), crea el `Group` con `companyId` estampado (mismo TransactWrite que `createCompanyGroup`: Group + InviteCode + Membership + UserGroupTotal) y marca el invite `ACCEPTED` atómicamente; y un **constraint en `join-group`** que rechaza unirse a un grupo de empresa si el usuario ya es miembro de otro grupo con el mismo `companyId`. Frontend — una pantalla de "aceptar invitación de jefe" que toma el código + nombre/modo/categoría y llama la mutation.

**Tech Stack:** Amplify Gen2 (AppSync, DynamoDB, Lambda TS, jest), Angular 18 standalone (signals).

**Convenciones de test:** backend `cd polla-backend && npx jest --maxWorkers=2 <pattern>`; front `cd polla-app && npm test -- --no-watch --test-path-pattern=<pattern>`. Node PATH fix (PowerShell): `$env:Path = "$env:ProgramFiles\nodejs;" + $env:Path`.

---

## File Structure
- Modify `polla-backend/src/lib/errors.ts` — códigos `ALREADY_IN_COMPANY_DEPARTMENT`, `NOT_INVITED`.
- Modify `polla-backend/amplify/functions/join-group/handler.ts` — constraint 1-depto-por-empresa.
- Modify `polla-backend/tests/unit/join-group.test.ts` — test del constraint.
- Create `polla-backend/amplify/functions/accept-department-invite/{resource.ts,handler.ts}` + `tests/unit/accept-department-invite.test.ts`.
- Modify `polla-backend/amplify/data/resource.ts` — mutation `acceptDepartmentInvite`.
- Modify `polla-backend/amplify/backend.ts` — wiring.
- Modify `polla-app/src/app/core/api/api.service.ts` — `acceptDepartmentInvite`.
- Create `polla-app/src/app/features/empresa/aceptar-invitacion.component.ts` + ruta.

---

## TASK 1 — Constraint 1-depto-por-empresa en `join-group` (TDD)

**Files:** Modify `src/lib/errors.ts`, `amplify/functions/join-group/handler.ts`, `tests/unit/join-group.test.ts`

- [ ] **Step 1: Códigos de error.** En `src/lib/errors.ts`, en la sección "Empresas" del objeto `ErrorCode`, añade:

```typescript
  ALREADY_IN_COMPANY_DEPARTMENT: 'ALREADY_IN_COMPANY_DEPARTMENT',
  NOT_INVITED: 'NOT_INVITED',
```

- [ ] **Step 2: Test que falla** en `tests/unit/join-group.test.ts`. Lee el harness existente (MockDdb) y añade un caso: el usuario intenta unirse a un grupo con `companyId='acme'` y ya es miembro de OTRO grupo con `companyId='acme'` → rechaza `ALREADY_IN_COMPANY_DEPARTMENT`. El mock debe: InviteCode get→{groupId:'g2'}; Group get(g2)→{id:'g2',tournamentId:'t',name:'Dept B',adminUserId:'x',companyId:'acme'}; el QueryCommand `groupsByUser` (membership existente del target g2) → vacío (no es ya miembro de g2); luego el QueryCommand `groupsByUser` para el constraint → [{groupId:'g1'}]; Group get(g1)→{companyId:'acme'}. Assert: rechaza con code `ALREADY_IN_COMPANY_DEPARTMENT` y NO hace el PutCommand de Membership.

```typescript
it('rechaza unirse a un 2º departamento de la misma empresa', async () => {
  // mock: invite→g2(companyId acme); no es miembro de g2; pero ya es miembro de g1(companyId acme)
  await expect(handler({ arguments: { code: 'ABC123' }, identity: { sub: 'u1' } } as never))
    .rejects.toMatchObject({ code: 'ALREADY_IN_COMPANY_DEPARTMENT' });
});
```

(Adapta los nombres del harness real. Si el harness usa una clase MockDdb con respuestas secuenciales, añade las entradas necesarias para las 2 queries `groupsByUser` y los `GetCommand` de Group.)

- [ ] **Step 3: Confirmar fail.** `cd polla-backend && npx jest --maxWorkers=2 join-group`

- [ ] **Step 4: Implementar.** En `amplify/functions/join-group/handler.ts`:
(a) Extiende el tipo del `group` cargado (~línea 37-39) para incluir `companyId`:
```typescript
  const group = groupRes.Item as
    | { id: string; tournamentId: string; name: string; adminUserId: string; companyId?: string | null }
    | undefined;
```
(b) Después del chequeo `ALREADY_MEMBER` (~línea 52) y ANTES del cap de miembros (~línea 56), añade:
```typescript
  // Constraint: un empleado solo puede estar en UN departamento por empresa.
  if (group.companyId) {
    const mineQ = await ddb.send(new QueryCommand({
      TableName: MEMBERSHIP,
      IndexName: 'groupsByUser',
      KeyConditionExpression: 'userId = :u',
      ExpressionAttributeValues: { ':u': userId },
    }));
    for (const m of (mineQ.Items ?? []) as Array<{ groupId: string }>) {
      const gRes = await ddb.send(new GetCommand({ TableName: GROUP, Key: { id: m.groupId } }));
      const g = gRes.Item as { companyId?: string | null } | undefined;
      if (g && g.companyId === group.companyId) {
        throw new DomainError('ALREADY_IN_COMPANY_DEPARTMENT');
      }
    }
  }
```
(`GROUP`, `MEMBERSHIP`, `QueryCommand`, `GetCommand`, `DomainError` ya están importados/declarados en el handler.)

- [ ] **Step 5: Pass.** `cd polla-backend && npx jest --maxWorkers=2 join-group` (todos los casos verdes, incluidos los previos).

- [ ] **Step 6: Commit.**

```bash
git add src/lib/errors.ts amplify/functions/join-group/handler.ts tests/unit/join-group.test.ts
git commit -m "feat(join-group): constraint 1 empleado = 1 departamento por empresa"
```

---

## TASK 2 — Lambda `accept-department-invite` (TDD)

**Files:** Create `amplify/functions/accept-department-invite/{resource.ts,handler.ts}` + `tests/unit/accept-department-invite.test.ts`

- [ ] **Step 1: `resource.ts`:**

```typescript
import { defineFunction } from '@aws-amplify/backend';

export const acceptDepartmentInvite = defineFunction({
  name: 'accept-department-invite',
  entry: './handler.ts',
  runtime: 20,
  timeoutSeconds: 10,
  resourceGroupName: 'data',
});
```

- [ ] **Step 2: Test que falla** `tests/unit/accept-department-invite.test.ts` (mirror el harness de `add-company-admin.test.ts`). El MockDdb: `QueryCommand` inviteByCode → invite PENDING `{id:'i1',companyId:'c1',invitedEmail:'jefe@acme.test',status:'PENDING'}`; `GetCommand` USER(caller) → `{sub:'jefe',email:'jefe@acme.test'}`; `TransactWriteCommand` → {}. `setEnv`: GROUP_TABLE='G', MEMBERSHIP_TABLE='M', INVITE_TABLE='I', USER_GROUP_TOTAL_TABLE='UGT', DEPARTMENT_INVITE_TABLE='DI', DEPARTMENT_INVITE_CODE_INDEX='inviteByCode', USER_TABLE='U'. Casos:

```typescript
it('jefe acepta con su código: crea Group con companyId + marca invite ACCEPTED', async () => {
  const { handler, mock } = await loadHandlerFresh({
    invite: { id: 'i1', companyId: 'c1', invitedEmail: 'jefe@acme.test', status: 'PENDING' },
    user: { sub: 'jefe', email: 'jefe@acme.test' },
  });
  const res = await handler({
    arguments: { code: 'ABC123', name: 'Ventas', mode: 'COMPLETE' },
    identity: { sub: 'jefe' },
  });
  expect(typeof res.groupId).toBe('string');
  const tw = mock.calls.find((c) => c.name === 'TransactWriteCommand')!.input as {
    TransactItems: Array<Record<string, { TableName?: string; Item?: Record<string, unknown>; Key?: Record<string, unknown>; UpdateExpression?: string }>>;
  };
  const groupPut = tw.TransactItems.find((i) => i.Put?.TableName === 'G')!.Put!;
  expect(groupPut.Item!['companyId']).toBe('c1');
  expect(groupPut.Item!['adminUserId']).toBe('jefe');
  const inviteUpd = tw.TransactItems.find((i) => i.Update?.TableName === 'DI')!.Update!;
  expect(inviteUpd.UpdateExpression).toContain(':accepted');
});

it('código inexistente: DEPARTMENT_INVITE_NOT_FOUND', async () => {
  const { handler } = await loadHandlerFresh({ invite: undefined, user: { sub: 'x', email: 'x@y.z' } });
  await expect(handler({ arguments: { code: 'NOPE12', name: 'X', mode: 'SIMPLE' }, identity: { sub: 'x' } }))
    .rejects.toMatchObject({ code: 'DEPARTMENT_INVITE_NOT_FOUND' });
});

it('email del caller != invitedEmail: NOT_INVITED', async () => {
  const { handler } = await loadHandlerFresh({
    invite: { id: 'i1', companyId: 'c1', invitedEmail: 'jefe@acme.test', status: 'PENDING' },
    user: { sub: 'otro', email: 'otro@acme.test' },
  });
  await expect(handler({ arguments: { code: 'ABC123', name: 'X', mode: 'SIMPLE' }, identity: { sub: 'otro' } }))
    .rejects.toMatchObject({ code: 'NOT_INVITED' });
});

it('invite ya ACCEPTED: VALIDATION_ERROR', async () => {
  const { handler } = await loadHandlerFresh({
    invite: { id: 'i1', companyId: 'c1', invitedEmail: 'jefe@acme.test', status: 'ACCEPTED' },
    user: { sub: 'jefe', email: 'jefe@acme.test' },
  });
  await expect(handler({ arguments: { code: 'ABC123', name: 'X', mode: 'SIMPLE' }, identity: { sub: 'jefe' } }))
    .rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
});
```

- [ ] **Step 3: Confirmar fail.** `cd polla-backend && npx jest --maxWorkers=2 accept-department-invite`

- [ ] **Step 4: Implementar `handler.ts`** (espejo de `create-company-group` + validación de invite + update atómico):

```typescript
/**
 * accept-department-invite Lambda
 *
 * El jefe invitado (SP-1) acepta su invitación con el `code` y crea su
 * departamento ligado a la empresa. Valida: invite existe (por code) +
 * PENDING + email del caller == invitedEmail. Crea Group(companyId) +
 * InviteCode + Membership(admin) + UserGroupTotal y marca el invite ACCEPTED,
 * todo en un TransactWrite (condición status=PENDING evita doble-aceptación).
 */
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient, GetCommand, QueryCommand, TransactWriteCommand,
} from '@aws-sdk/lib-dynamodb';
import { ulid } from 'ulid';
import { generateJoinCode } from '../../../src/lib/codes';
import { DomainError } from '../../../src/lib/errors';

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const GROUP = process.env['GROUP_TABLE']!;
const MEMBERSHIP = process.env['MEMBERSHIP_TABLE']!;
const INVITE = process.env['INVITE_TABLE']!;
const TOTAL = process.env['USER_GROUP_TOTAL_TABLE']!;
const DEPT_INVITE = process.env['DEPARTMENT_INVITE_TABLE']!;
const DEPT_INVITE_CODE_INDEX = process.env['DEPARTMENT_INVITE_CODE_INDEX']!;
const USER = process.env['USER_TABLE']!;

type GameMode = 'SIMPLE' | 'COMPLETE';

interface AppSyncEvent {
  arguments: { code: string; name: string; mode: GameMode; category?: string | null };
  identity: { sub: string };
}

interface Response { groupId: string; joinCode: string }

export async function handler(event: AppSyncEvent): Promise<Response> {
  const caller = event.identity.sub;
  const { code, name, mode, category } = event.arguments;

  if (mode !== 'SIMPLE' && mode !== 'COMPLETE') throw new DomainError('INVALID_MODE');

  // 1. Invite por code.
  const inviteQ = await ddb.send(new QueryCommand({
    TableName: DEPT_INVITE,
    IndexName: DEPT_INVITE_CODE_INDEX,
    KeyConditionExpression: 'code = :c',
    ExpressionAttributeValues: { ':c': code },
  }));
  const invite = ((inviteQ.Items ?? [])[0]) as
    | { id: string; companyId: string; invitedEmail: string; status: string }
    | undefined;
  if (!invite) throw new DomainError('DEPARTMENT_INVITE_NOT_FOUND');
  if (invite.status !== 'PENDING') throw new DomainError('VALIDATION_ERROR');

  // 2. Email del caller debe coincidir con el invitado.
  const userRes = await ddb.send(new GetCommand({ TableName: USER, Key: { sub: caller } }));
  const user = userRes.Item as { email?: string } | undefined;
  if (!user?.email || user.email.toLowerCase() !== invite.invitedEmail.toLowerCase()) {
    throw new DomainError('NOT_INVITED');
  }

  // 3. Nombre del departamento.
  const trimmedName = (name ?? '').trim();
  if (trimmedName.length < 3 || trimmedName.length > 40) throw new DomainError('VALIDATION_ERROR');

  const groupId = ulid();
  const now = new Date().toISOString();

  for (let attempt = 0; attempt < 5; attempt++) {
    const joinCode = generateJoinCode();
    try {
      await ddb.send(new TransactWriteCommand({
        TransactItems: [
          { Put: {
            TableName: GROUP,
            Item: {
              __typename: 'Group', id: groupId, name: trimmedName,
              tournamentId: 'mundial-2026', mode, adminUserId: caller,
              joinCode, comodinesEnabled: mode === 'COMPLETE',
              companyId: invite.companyId,
              ...(category ? { category } : {}),
              createdAt: now, updatedAt: now,
            },
          }},
          { Put: {
            TableName: INVITE,
            Item: { __typename: 'InviteCode', code: joinCode, groupId, createdAt: now, updatedAt: now },
            ConditionExpression: 'attribute_not_exists(code)',
          }},
          { Put: {
            TableName: MEMBERSHIP,
            Item: {
              __typename: 'Membership', id: ulid(), groupId, userId: caller,
              isAdmin: true, joinedAt: now, createdAt: now, updatedAt: now,
            },
          }},
          { Put: {
            TableName: TOTAL,
            Item: {
              __typename: 'UserGroupTotal', groupId, userId: caller,
              points: 0, exactCount: 0, resultCount: 0, createdAt: now, updatedAt: now,
            },
          }},
          { Update: {
            TableName: DEPT_INVITE,
            Key: { id: invite.id },
            UpdateExpression: 'SET #s = :accepted, userId = :u, groupId = :g, updatedAt = :now',
            ConditionExpression: '#s = :pending',
            ExpressionAttributeNames: { '#s': 'status' },
            ExpressionAttributeValues: {
              ':accepted': 'ACCEPTED', ':pending': 'PENDING',
              ':u': caller, ':g': groupId, ':now': now,
            },
          }},
        ],
      }));
      return { groupId, joinCode };
    } catch (err) {
      const e = err as { name?: string };
      if (e.name === 'TransactionCanceledException') continue;
      throw err;
    }
  }
  throw new DomainError('CODE_GENERATION_FAILED');
}
```

- [ ] **Step 5: Pass.** `cd polla-backend && npx jest --maxWorkers=2 accept-department-invite`

- [ ] **Step 6: Commit.**

```bash
git add amplify/functions/accept-department-invite/ tests/unit/accept-department-invite.test.ts
git commit -m "feat(accept-department-invite): el jefe acepta y crea su departamento"
```

---

## TASK 3 — Mutation + wiring

**Files:** Modify `amplify/data/resource.ts`, `amplify/backend.ts`

- [ ] **Step 1: `resource.ts`** — import + mutation (cerca de `inviteDepartmentHead`):

```typescript
import { acceptDepartmentInvite } from '../functions/accept-department-invite/resource';
```
```typescript
  acceptDepartmentInvite: a
    .mutation()
    .arguments({
      code: a.string().required(),
      name: a.string().required(),
      mode: a.enum(['SIMPLE', 'COMPLETE']),
      category: a.string(),
    })
    .returns(a.customType({ groupId: a.string().required(), joinCode: a.string().required() }))
    .authorization((allow) => [allow.authenticated()])
    .handler(a.handler.function(acceptDepartmentInvite)),
```

- [ ] **Step 2: `backend.ts`** — import + `defineBackend` entry + wiring. Reusa los const de tablas existentes (`groupTable`, `membershipTable`, `inviteTable`, `ugtTable`, `userTable`, `departmentInviteTable`):

```typescript
import { acceptDepartmentInvite } from './functions/accept-department-invite/resource';
```
(en `defineBackend({...})` añade `acceptDepartmentInvite,`). Wiring:
```typescript
// accept-department-invite: query DepartmentInvite.inviteByCode; read User; writes Group+InviteCode+Membership+UGT, updates DepartmentInvite.
backend.acceptDepartmentInvite.addEnvironment('GROUP_TABLE', groupTable.tableName);
backend.acceptDepartmentInvite.addEnvironment('MEMBERSHIP_TABLE', membershipTable.tableName);
backend.acceptDepartmentInvite.addEnvironment('INVITE_TABLE', inviteTable.tableName);
backend.acceptDepartmentInvite.addEnvironment('USER_GROUP_TOTAL_TABLE', ugtTable.tableName);
backend.acceptDepartmentInvite.addEnvironment('DEPARTMENT_INVITE_TABLE', departmentInviteTable.tableName);
backend.acceptDepartmentInvite.addEnvironment('DEPARTMENT_INVITE_CODE_INDEX', 'inviteByCode');
backend.acceptDepartmentInvite.addEnvironment('USER_TABLE', userTable.tableName);
groupTable.grantWriteData(backend.acceptDepartmentInvite.resources.lambda);
membershipTable.grantWriteData(backend.acceptDepartmentInvite.resources.lambda);
inviteTable.grantWriteData(backend.acceptDepartmentInvite.resources.lambda);
ugtTable.grantWriteData(backend.acceptDepartmentInvite.resources.lambda);
departmentInviteTable.grantReadWriteData(backend.acceptDepartmentInvite.resources.lambda);
userTable.grantReadData(backend.acceptDepartmentInvite.resources.lambda);
grantIndexQuery(departmentInviteTable, backend.acceptDepartmentInvite.resources.lambda);
```
(Verifica los nombres reales de los const de tablas — `inviteTable` puede llamarse distinto; búscalos en backend.ts. `createCompanyGroup` ya wirea Group/Membership/Invite/UGT, copia esos const names.)

- [ ] **Step 3: Typecheck + suite.** `cd polla-backend && npx tsc --noEmit` (exit 0 en fuentes) y `npx jest --maxWorkers=2` (verde; reporta total). **Commit:**

```bash
git add amplify/data/resource.ts amplify/backend.ts
git commit -m "feat(schema): mutation acceptDepartmentInvite + wiring"
```

---

## TASK 4 — api.service `acceptDepartmentInvite`

**Files:** Modify `src/app/core/api/api.service.ts`

- [ ] **Step 1:** Después de `revokeDepartmentInvite(...)` añade (cast, no deployado en tipos):

```typescript
  /** El jefe acepta su invitación con el código y crea su departamento. */
  acceptDepartmentInvite(input: { code: string; name: string; mode: 'SIMPLE' | 'COMPLETE'; category?: string | null }) {
    return (apiClient as unknown as {
      mutations: { acceptDepartmentInvite: (i: typeof input) => Promise<{ data?: { groupId: string; joinCode: string } | null }> };
    }).mutations.acceptDepartmentInvite(input);
  }
```

- [ ] **Step 2: Typecheck.** `cd polla-app && npx tsc --noEmit -p tsconfig.app.json` → exit 0. **Commit:**

```bash
git add src/app/core/api/api.service.ts
git commit -m "feat(api): acceptDepartmentInvite"
```

---

## TASK 5 — Pantalla "Aceptar invitación de jefe" + ruta

**Files:** Create `src/app/features/empresa/aceptar-invitacion.component.ts`; Modify `src/app/features/empresa/empresa.routes.ts`

- [ ] **Step 1: Componente** `aceptar-invitacion.component.ts` (el jefe pega su código + define el departamento; al crear, navega al grupo nuevo):

```typescript
import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { ApiService } from '../../core/api/api.service';
import { ToastService } from '../../core/notifications/toast.service';
import { humanizeError } from '../../core/notifications/domain-errors';

@Component({
  standalone: true,
  selector: 'app-aceptar-invitacion',
  imports: [FormsModule],
  template: `
    <section class="page">
      <h1 class="page__title">Crear mi departamento</h1>
      <p class="kicker">Recibiste una invitación como jefe de departamento. Crea tu grupo.</p>
      <label>Código de invitación <input [(ngModel)]="code" placeholder="ABC123" /></label>
      <label>Nombre del departamento <input [(ngModel)]="name" placeholder="Ventas" /></label>
      <label>Modo
        <select [(ngModel)]="mode">
          <option value="COMPLETE">Completo (con comodines)</option>
          <option value="SIMPLE">Simple</option>
        </select>
      </label>
      <label>Categoría (opcional) <input [(ngModel)]="category" placeholder="futbol" /></label>
      <button type="button" [disabled]="saving()" (click)="accept()">
        {{ saving() ? 'Creando…' : 'Crear departamento' }}
      </button>
    </section>
  `,
})
export class AceptarInvitacionComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private api = inject(ApiService);
  private toast = inject(ToastService);

  code = '';
  name = '';
  mode: 'SIMPLE' | 'COMPLETE' = 'COMPLETE';
  category = '';
  saving = signal(false);

  ngOnInit() {
    // Prefill desde ?code= si vino en el enlace.
    const c = this.route.snapshot.queryParamMap.get('code');
    if (c) this.code = c;
  }

  async accept() {
    const code = this.code.trim();
    const name = this.name.trim();
    if (!code || name.length < 3) {
      this.toast.error('Pon el código y un nombre de al menos 3 caracteres');
      return;
    }
    this.saving.set(true);
    try {
      const res = await this.api.acceptDepartmentInvite({
        code, name, mode: this.mode, category: this.category.trim() || null,
      });
      const groupId = res.data?.groupId;
      this.toast.success('Departamento creado');
      if (groupId) void this.router.navigate(['/groups', groupId]);
    } catch (e) {
      this.toast.error(humanizeError(e));
    } finally {
      this.saving.set(false);
    }
  }
}
```

- [ ] **Step 2: Ruta.** En `src/app/features/empresa/empresa.routes.ts`, añade al inicio del array (antes de `''`), una ruta independiente del shell de empresa (el jefe aún no tiene empresa; solo necesita estar logueado — esta ruta vive bajo `/empresa/invitacion` y NO usa `companyAdminGuard`):

```typescript
  {
    path: 'invitacion',
    loadComponent: () => import('./aceptar-invitacion.component').then((m) => m.AceptarInvitacionComponent),
  },
```
(Nota: déjala SIN `companyAdminGuard` — el jefe invitado todavía no es company-admin. Ya está protegida por el `authGuard` del ShellComponent padre.)

- [ ] **Step 3: Typecheck + suite front.** `cd polla-app && npx tsc --noEmit -p tsconfig.app.json` (exit 0) y `npm test -- --no-watch` (verde). **Commit:**

```bash
git add src/app/features/empresa/aceptar-invitacion.component.ts src/app/features/empresa/empresa.routes.ts
git commit -m "feat(empresa): pantalla aceptar invitación de jefe + ruta /empresa/invitacion"
```

---

## Self-Review (cobertura del spec SP-2)

- **Jefe invitado crea su departamento (companyId estampado), reusa createCompanyGroup TransactWrite:** Task 2 (lambda), Task 3 (mutation), Task 5 (UI). ✓
- **Marca el invite ACCEPTED atómicamente (condición PENDING evita doble-uso):** Task 2 (Update en el TransactWrite). ✓
- **Constraint 1-empleado-1-departamento-por-empresa:** Task 1 (join-group). ✓
- **El jefe gestiona luego su grupo con la UI existente:** sin trabajo nuevo (reusa group-admin). ✓
- **Seguridad:** email del caller == invitedEmail (Task 2) evita que cualquiera con el código robe la invitación. ✓

**Consistencia de tipos:** `acceptDepartmentInvite` devuelve `{ groupId, joinCode }` (resource ↔ handler ↔ api.service ↔ UI). Env `DEPARTMENT_INVITE_CODE_INDEX='inviteByCode'` coincide con el GSI declarado en SP-1. Códigos de error nuevos (`ALREADY_IN_COMPANY_DEPARTMENT`, `NOT_INVITED`) en errors.ts.

**Deploy (humano):** tras implementar, `npx ampx sandbox --once --profile polla` + copiar `amplify_outputs.json`. El `acceptDepartmentInvite` aparece como cast en el front hasta el deploy.

---

## Execution Handoff
Plan guardado. Ejecución recomendada: **subagent-driven-development** (subagente backend Tasks 1-3, subagente front Tasks 4-5, revisión entre lotes).
