# Empresas — Sub-1 (Companies Foundation) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add multi-tenant Company entity to the polla backend + super-admin UI to create and manage companies, their admins, and their groups. Lays the foundation for white-label theming (Sub-2), bulk invitations (Sub-3), activities (Sub-4), and company-admin panel (Sub-5).

**Architecture:** New `Company` and `CompanyMember` Amplify Gen 2 models + nullable `companyId` and `category` on `Group`. Seven new custom Lambda mutations enforce a 3-level permission hierarchy (super-admin > company-admin > group-admin) via a shared auth helper. Super-admin UI lives under `/admin/companies` with four tabs (General, Admins, Grupos, Branding). Existing group-edit screen detects `companyId` and routes to the new `updateCompanyGroup` mutation.

**Tech Stack:** Amplify Gen 2 (AppSync + DynamoDB + Lambda Node 20), Angular 18 standalone + signals, Jest backend + frontend, `@aws-sdk/lib-dynamodb` mocks per Jest pattern.

**Spec:** `docs/superpowers/specs/2026-05-30-empresas-master-design.md`

---

## Repos touched

This plan spans **two sibling repos**:

- `polla-backend/` (Amplify Gen 2 backend) — Tasks 1-11
- `polla-app/` (Angular 18 frontend) — Tasks 12-23

Each task header includes the absolute repo path. Commit per repo separately.

---

## File structure

### Backend (`polla-backend/`)

| File | Responsibility | Action |
|---|---|---|
| `src/lib/errors.ts` | Domain error codes catalog | Modify — add 4 codes |
| `src/lib/auth.ts` | Shared permission helpers | **Create** — `isCompanyAdmin`, `isGroupAdminOrAbove` |
| `amplify/data/resource.ts` | Schema | Modify — add Company + CompanyMember models, extend Group, register 7 mutations |
| `amplify/functions/create-company/{handler,resource}.ts` | createCompany Lambda | Create |
| `amplify/functions/update-company/{handler,resource}.ts` | updateCompany Lambda | Create |
| `amplify/functions/set-company-status/{handler,resource}.ts` | setCompanyStatus Lambda | Create |
| `amplify/functions/add-company-admin/{handler,resource}.ts` | addCompanyAdmin Lambda | Create |
| `amplify/functions/remove-company-admin/{handler,resource}.ts` | removeCompanyAdmin Lambda | Create |
| `amplify/functions/create-company-group/{handler,resource}.ts` | createCompanyGroup Lambda | Create |
| `amplify/functions/update-company-group/{handler,resource}.ts` | updateCompanyGroup Lambda | Create |
| `amplify/backend.ts` | Backend wiring + IAM grants | Modify — register 7 lambdas + grants |
| `tests/unit/auth.test.ts` | Auth helper tests | Create |
| `tests/unit/create-company.test.ts` | createCompany tests | Create |
| `tests/unit/update-company.test.ts` | updateCompany tests | Create |
| `tests/unit/set-company-status.test.ts` | setCompanyStatus tests | Create |
| `tests/unit/add-company-admin.test.ts` | addCompanyAdmin tests | Create |
| `tests/unit/remove-company-admin.test.ts` | removeCompanyAdmin tests | Create |
| `tests/unit/create-company-group.test.ts` | createCompanyGroup tests | Create |
| `tests/unit/update-company-group.test.ts` | updateCompanyGroup tests | Create |

### Frontend (`polla-app/`)

| File | Responsibility | Action |
|---|---|---|
| `src/app/core/notifications/domain-errors.ts` | Spanish error map | Modify — 4 new mappings |
| `src/app/core/api/api.service.ts` | API facade | Modify — 12 new methods |
| `src/app/features/admin/companies/admin-picker.component.{ts,spec.ts}` | User autocomplete | Create |
| `src/app/features/admin/companies/create-company-modal.component.{ts,spec.ts}` | Create modal | Create |
| `src/app/features/admin/companies/create-group-modal.component.{ts,spec.ts}` | Simple group modal for smoke-test | Create |
| `src/app/features/admin/companies/companies-list.component.{ts,spec.ts}` | List of companies | Create |
| `src/app/features/admin/companies/company-detail.component.{ts,spec.ts}` | Detail with 4 tabs | Create |
| `src/app/features/admin/admin-shell.component.ts` | Admin sub-nav | Modify — add Empresas item |
| `src/app/features/admin/admin.routes.ts` | Admin route table | Modify — register 2 routes |
| `src/app/features/groups/group-edit.component.ts` | Group edit screen | Modify — detect companyId and call updateCompanyGroup |

---

## Phase 1 — Backend foundation (Tasks 1-3)

Run all backend tasks from `C:\Users\Marke\Documents\Respaldo\polla mundialista\polla-backend\`. Each task: write failing test → implement → run tests → commit.

---

### Task 1: Add 4 domain error codes

**Repo:** `polla-backend/`
**Files:**
- Modify: `src/lib/errors.ts`

- [ ] **Step 1: Add four new error codes**

Open `polla-backend/src/lib/errors.ts`. Inside the `ErrorCode` const, add the four new keys after the existing `ENTRY_FEE_*` block (before the closing `} as const;`):

```ts
  // Empresas (Sub-proyecto 1)
  COMPANY_NOT_FOUND: 'COMPANY_NOT_FOUND',
  COMPANY_DISABLED: 'COMPANY_DISABLED',
  NOT_COMPANY_ADMIN: 'NOT_COMPANY_ADMIN',
  LAST_COMPANY_ADMIN: 'LAST_COMPANY_ADMIN',
```

- [ ] **Step 2: Typecheck**

```
npm run typecheck
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/errors.ts
git commit -m "feat(errors): add company domain error codes

Four new codes used by the seven company mutations and the shared
auth helper:
- COMPANY_NOT_FOUND
- COMPANY_DISABLED
- NOT_COMPANY_ADMIN
- LAST_COMPANY_ADMIN

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
"
```

---

### Task 2: Extend Amplify schema (Company + CompanyMember + Group)

**Repo:** `polla-backend/`
**Files:**
- Modify: `amplify/data/resource.ts`

- [ ] **Step 1: Add the CompanyStatus + CompanyMemberRole enums**

In `amplify/data/resource.ts`, inside the `a.schema({...})` block, add the two new enums BEFORE the `Group` model (just after the existing `GameMode` enum):

```ts
  CompanyStatus: a.enum(['ACTIVE', 'DISABLED']),

  CompanyMemberRole: a.enum(['ADMIN', 'MEMBER']),
```

- [ ] **Step 2: Add the Company model**

In the same file, BEFORE the `Group` model, add:

```ts
  Company: a
    .model({
      name: a.string().required(),
      status: a.ref('CompanyStatus').required().default('ACTIVE'),
      contactEmail: a.email(),
      description: a.string(),
      // Branding (Sub-proyecto 2 los consume; en Sub-1 solo se persisten).
      logoKey: a.string(),
      brandPrimary: a.string(),       // "#RRGGBB"
      brandPrimaryDark: a.string(),
      brandAccent: a.string(),
      createdAt: a.datetime().required(),
    })
    .authorization((allow) => [
      allow.authenticated().to(['read']),
      allow.group('admins'),
    ]),
```

- [ ] **Step 3: Add the CompanyMember model**

Right after the Company model, add:

```ts
  CompanyMember: a
    .model({
      companyId: a.id().required(),
      userId: a.id().required(),
      role: a.ref('CompanyMemberRole').required(),
      invitedAt: a.datetime().required(),
      joinedAt: a.datetime(),
    })
    .secondaryIndexes((idx) => [
      idx('companyId').name('membersByCompany'),
      idx('userId').name('companiesByUser'),
    ])
    .authorization((allow) => [
      allow.authenticated().to(['read']),
      allow.group('admins'),
    ]),
```

- [ ] **Step 4: Extend Group with companyId + category + new GSI**

Locate the existing `Group: a.model({...})` block. Inside the model definition, AFTER the `entryFeeInstructions: a.string(),` line (added in the entry-fee feature), add:

```ts
      // Empresas (Sub-proyecto 1). null = grupo individual (como hoy).
      companyId: a.id(),
      // Tag libre para agrupación visual en el admin panel — solo aplica
      // cuando companyId está set. No tiene permission scoping.
      category: a.string(),
```

Then in the `.secondaryIndexes((idx) => [...])` block of Group, add the new GSI alongside the existing ones:

```ts
      idx('companyId').name('groupsByCompany'),
```

- [ ] **Step 5: Typecheck**

```
npm run typecheck
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add amplify/data/resource.ts
git commit -m "feat(schema): add Company + CompanyMember + extend Group

New models:
- CompanyStatus + CompanyMemberRole enums
- Company (name, status, contactEmail, description, branding fields,
  createdAt) — authenticated read, admins write
- CompanyMember (companyId, userId, role, invitedAt, joinedAt) +
  membersByCompany + companiesByUser GSIs

Extended Group with:
- companyId: id (nullable, null = grupo individual)
- category: string (free tag, only applies when companyId set)
- groupsByCompany GSI

Backward compatible: existing Groups stay companyId=null.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
"
```

---

### Task 3: Create auth.ts helper + tests

**Repo:** `polla-backend/`
**Files:**
- Create: `src/lib/auth.ts`
- Create: `tests/unit/auth.test.ts`

- [ ] **Step 1: Write the failing test file**

Create `tests/unit/auth.test.ts`:

```ts
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';

interface MockMembership { companyId: string; userId: string; role: 'ADMIN' | 'MEMBER' }
interface MockGroup { id: string; adminUserId: string; companyId?: string | null }

class MockDdb {
  public calls: Array<{ name: string; input: unknown }> = [];
  constructor(
    private group: MockGroup | undefined,
    private companyMembers: ReadonlyArray<MockMembership>,
  ) {}

  send(cmd: { constructor: { name: string }; input: unknown }): Promise<unknown> {
    const name = cmd.constructor.name;
    this.calls.push({ name, input: cmd.input });
    if (name === 'GetCommand') {
      const input = cmd.input as { TableName: string; Key: { id: string } };
      if (input.TableName === 'G') return Promise.resolve({ Item: this.group });
      return Promise.resolve({ Item: undefined });
    }
    if (name === 'QueryCommand') {
      const input = cmd.input as { ExpressionAttributeValues: Record<string, unknown> };
      const userId = input.ExpressionAttributeValues[':u'];
      return Promise.resolve({
        Items: this.companyMembers.filter((m) => m.userId === userId),
      });
    }
    return Promise.resolve({});
  }
}

jest.mock('@aws-sdk/lib-dynamodb', () => {
  const actual = jest.requireActual('@aws-sdk/lib-dynamodb');
  return {
    ...actual,
    DynamoDBDocumentClient: { from: jest.fn() },
  };
});

function installMockDdb(mock: MockDdb): void {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { DynamoDBDocumentClient } = require('@aws-sdk/lib-dynamodb');
  (DynamoDBDocumentClient.from as jest.Mock).mockReturnValue(mock);
}

async function loadAuthFresh(group: MockGroup | undefined, members: ReadonlyArray<MockMembership>) {
  jest.resetModules();
  const { DynamoDBClient } = await import('@aws-sdk/client-dynamodb');
  const mock = new MockDdb(group, members);
  installMockDdb(mock);
  const auth = await import('../../src/lib/auth');
  const ddb = (await import('@aws-sdk/lib-dynamodb')).DynamoDBDocumentClient.from(new DynamoDBClient({}));
  return { auth, ddb, mock };
}

describe('auth helper — isCompanyAdmin', () => {
  it('returns true when user has CompanyMember row with role=ADMIN for the target company', async () => {
    const { auth, ddb } = await loadAuthFresh(undefined, [
      { companyId: 'c1', userId: 'u1', role: 'ADMIN' },
    ]);
    const result = await auth.isCompanyAdmin(ddb, 'CM', 'companiesByUser', 'u1', 'c1');
    expect(result).toBe(true);
  });

  it('returns false when row exists but role=MEMBER', async () => {
    const { auth, ddb } = await loadAuthFresh(undefined, [
      { companyId: 'c1', userId: 'u1', role: 'MEMBER' },
    ]);
    const result = await auth.isCompanyAdmin(ddb, 'CM', 'companiesByUser', 'u1', 'c1');
    expect(result).toBe(false);
  });

  it('returns false when no row exists for the user', async () => {
    const { auth, ddb } = await loadAuthFresh(undefined, []);
    const result = await auth.isCompanyAdmin(ddb, 'CM', 'companiesByUser', 'u1', 'c1');
    expect(result).toBe(false);
  });

  it('returns false when user is admin of a DIFFERENT company', async () => {
    const { auth, ddb } = await loadAuthFresh(undefined, [
      { companyId: 'other', userId: 'u1', role: 'ADMIN' },
    ]);
    const result = await auth.isCompanyAdmin(ddb, 'CM', 'companiesByUser', 'u1', 'c1');
    expect(result).toBe(false);
  });
});

describe('auth helper — isGroupAdminOrAbove', () => {
  it('returns true when caller is in Cognito group admins (super-admin), without DB lookup', async () => {
    const { auth, ddb, mock } = await loadAuthFresh(undefined, []);
    const result = await auth.isGroupAdminOrAbove(
      ddb, 'G', 'CM', 'companiesByUser', 'u1', 'g1', ['admins'],
    );
    expect(result).toBe(true);
    expect(mock.calls).toHaveLength(0);  // no DB call needed for super-admin
  });

  it('returns false when group does not exist', async () => {
    const { auth, ddb } = await loadAuthFresh(undefined, []);
    const result = await auth.isGroupAdminOrAbove(
      ddb, 'G', 'CM', 'companiesByUser', 'u1', 'missing', [],
    );
    expect(result).toBe(false);
  });

  it('returns true when caller is the group adminUserId (individual group)', async () => {
    const { auth, ddb } = await loadAuthFresh(
      { id: 'g1', adminUserId: 'u1', companyId: null },
      [],
    );
    const result = await auth.isGroupAdminOrAbove(
      ddb, 'G', 'CM', 'companiesByUser', 'u1', 'g1', [],
    );
    expect(result).toBe(true);
  });

  it('returns true when caller is company-admin of the group company', async () => {
    const { auth, ddb } = await loadAuthFresh(
      { id: 'g1', adminUserId: 'other', companyId: 'c1' },
      [{ companyId: 'c1', userId: 'u1', role: 'ADMIN' }],
    );
    const result = await auth.isGroupAdminOrAbove(
      ddb, 'G', 'CM', 'companiesByUser', 'u1', 'g1', [],
    );
    expect(result).toBe(true);
  });

  it('returns false when caller is none of the above', async () => {
    const { auth, ddb } = await loadAuthFresh(
      { id: 'g1', adminUserId: 'other', companyId: 'c1' },
      [],
    );
    const result = await auth.isGroupAdminOrAbove(
      ddb, 'G', 'CM', 'companiesByUser', 'u1', 'g1', [],
    );
    expect(result).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test to verify it FAILS**

```
npm test -- tests/unit/auth.test.ts
```

Expected: FAIL — module `../../src/lib/auth` does not exist yet.

- [ ] **Step 3: Implement the helper**

Create `src/lib/auth.ts`:

```ts
/**
 * Shared permission helpers for the Empresas sub-system.
 *
 * The polla backend has three concentric admin levels:
 *   1. Super-admin: user is in the Cognito group 'admins'. Can do anything.
 *   2. Company-admin: user has a CompanyMember row with role=ADMIN for the
 *      target company. Can manage all groups under that company.
 *   3. Group-admin: user is Group.adminUserId. Can manage that specific
 *      group only.
 *
 * `isCompanyAdmin` answers question (2) in isolation.
 * `isGroupAdminOrAbove` combines (1) + (2) + (3) for the common case of
 * checking whether a caller can edit a group regardless of which admin
 * tier they sit on.
 */
import {
  DynamoDBDocumentClient, GetCommand, QueryCommand,
} from '@aws-sdk/lib-dynamodb';

interface CompanyMemberRow { companyId: string; role: 'ADMIN' | 'MEMBER' }
interface GroupRow { adminUserId: string; companyId?: string | null }

/** True if userId has a CompanyMember row with role=ADMIN for companyId. */
export async function isCompanyAdmin(
  ddb: DynamoDBDocumentClient,
  companyMemberTable: string,
  companyMemberIndex: string,
  userId: string,
  companyId: string,
): Promise<boolean> {
  const res = await ddb.send(new QueryCommand({
    TableName: companyMemberTable,
    IndexName: companyMemberIndex,
    KeyConditionExpression: 'userId = :u',
    ExpressionAttributeValues: { ':u': userId },
  }));
  const rows = (res.Items ?? []) as CompanyMemberRow[];
  return rows.some((m) => m.companyId === companyId && m.role === 'ADMIN');
}

/** True if userId is in cognitoGroups[admins] OR the group's adminUserId
 *  OR a company-admin of the group's companyId. Returns false for groups
 *  that don't exist. */
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
  const group = groupRes.Item as GroupRow | undefined;
  if (!group) return false;

  if (group.adminUserId === userId) return true;

  if (group.companyId) {
    return await isCompanyAdmin(
      ddb, companyMemberTable, companyMemberIndex, userId, group.companyId,
    );
  }
  return false;
}
```

- [ ] **Step 4: Run the test to verify it PASSES**

```
npm test -- tests/unit/auth.test.ts
```

Expected: PASS — all 9 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/auth.ts tests/unit/auth.test.ts
git commit -m "feat(auth): shared permission helpers for companies

isCompanyAdmin queries the companiesByUser GSI and returns true when the
user has a CompanyMember row with role=ADMIN for the target company.

isGroupAdminOrAbove combines super-admin (Cognito groups), group-admin
(Group.adminUserId), and company-admin (delegates to isCompanyAdmin when
the group has companyId set) in one short-circuit chain. Super-admin
exits without any DB call.

9 unit tests cover all branches.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
"
```

---

## Phase 2 — Backend mutations (Tasks 4-11)

Tasks 4-10 each create one Lambda + tests. They share the structure of the existing `create-group` and `mark-entry-fee-paid` handlers — refer to those for the mock patterns. Task 11 wires all seven into `backend.ts`.

---

### Task 4: createCompany Lambda + tests

**Repo:** `polla-backend/`
**Files:**
- Create: `amplify/functions/create-company/handler.ts`
- Create: `amplify/functions/create-company/resource.ts`
- Modify: `amplify/data/resource.ts` (register mutation)
- Create: `tests/unit/create-company.test.ts`

- [ ] **Step 1: Create the Lambda resource definition**

Create `amplify/functions/create-company/resource.ts`:

```ts
import { defineFunction } from '@aws-amplify/backend';

export const createCompany = defineFunction({
  name: 'create-company',
  entry: './handler.ts',
  runtime: 20,
  timeoutSeconds: 10,
  resourceGroupName: 'data',
});
```

- [ ] **Step 2: Create the failing test file**

Create `tests/unit/create-company.test.ts`:

```ts
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';

interface MockUser { sub: string }

class MockDdb {
  public calls: Array<{ name: string; input: unknown }> = [];
  constructor(private user: MockUser | undefined) {}

  send(cmd: { constructor: { name: string }; input: unknown }): Promise<unknown> {
    const name = cmd.constructor.name;
    this.calls.push({ name, input: cmd.input });
    if (name === 'GetCommand') {
      return Promise.resolve({ Item: this.user });
    }
    if (name === 'TransactWriteCommand') {
      return Promise.resolve({});
    }
    return Promise.resolve({});
  }

  transactItems(): Array<Record<string, unknown>> {
    const tw = this.calls.find((c) => c.name === 'TransactWriteCommand');
    if (!tw) return [];
    const input = tw.input as { TransactItems: Array<Record<string, unknown>> };
    return input.TransactItems;
  }
}

jest.mock('@aws-sdk/lib-dynamodb', () => {
  const actual = jest.requireActual('@aws-sdk/lib-dynamodb');
  return {
    ...actual,
    DynamoDBDocumentClient: { from: jest.fn() },
  };
});

function setEnv(): void {
  process.env['COMPANY_TABLE'] = 'C';
  process.env['COMPANY_MEMBER_TABLE'] = 'CM';
  process.env['USER_TABLE'] = 'U';
}

function installMockDdb(mock: MockDdb): void {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { DynamoDBDocumentClient } = require('@aws-sdk/lib-dynamodb');
  (DynamoDBDocumentClient.from as jest.Mock).mockReturnValue(mock);
}

async function loadHandlerFresh(user: MockUser | undefined) {
  setEnv();
  jest.resetModules();
  const mock = new MockDdb(user);
  installMockDdb(mock);
  const { handler } = await import('../../amplify/functions/create-company/handler');
  return { handler, mock };
}

function findPutByTable(items: Array<Record<string, unknown>>, table: string): Record<string, unknown> | undefined {
  const item = items.find((i) => (i['Put'] as { TableName?: string } | undefined)?.TableName === table);
  return item ? (item['Put'] as { Item: Record<string, unknown> }).Item : undefined;
}

describe('create-company handler', () => {
  it('creates Company + CompanyMember (ADMIN, joinedAt set) in TransactWrite', async () => {
    const { handler, mock } = await loadHandlerFresh({ sub: 'admin-target' });
    const result = await handler({
      arguments: {
        name: 'Coca-Cola',
        contactEmail: 'rrhh@coca-cola.com',
        description: 'Marketing y RRHH',
        firstAdminUserId: 'admin-target',
      },
      identity: { sub: 'super', groups: ['admins'] },
    });

    expect(result.id).toBeDefined();
    expect(result.message).toBe('Empresa creada');

    const items = mock.transactItems();
    const companyRow = findPutByTable(items, 'C');
    const memberRow = findPutByTable(items, 'CM');

    expect(companyRow).toBeDefined();
    expect(companyRow!['name']).toBe('Coca-Cola');
    expect(companyRow!['status']).toBe('ACTIVE');
    expect(companyRow!['contactEmail']).toBe('rrhh@coca-cola.com');
    expect(companyRow!['description']).toBe('Marketing y RRHH');

    expect(memberRow).toBeDefined();
    expect(memberRow!['userId']).toBe('admin-target');
    expect(memberRow!['role']).toBe('ADMIN');
    expect(memberRow!['joinedAt']).toBeDefined();
  });

  it('caller without admins Cognito group: throws ADMIN_REQUIRED', async () => {
    const { handler } = await loadHandlerFresh({ sub: 'admin-target' });
    await expect(handler({
      arguments: {
        name: 'Coca-Cola',
        firstAdminUserId: 'admin-target',
      },
      identity: { sub: 'random', groups: [] },
    })).rejects.toMatchObject({ code: 'ADMIN_REQUIRED' });
  });

  it('firstAdminUserId does not exist: throws VALIDATION_ERROR', async () => {
    const { handler } = await loadHandlerFresh(undefined);
    await expect(handler({
      arguments: {
        name: 'Coca-Cola',
        firstAdminUserId: 'ghost',
      },
      identity: { sub: 'super', groups: ['admins'] },
    })).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });

  it('name empty after trim: throws VALIDATION_ERROR', async () => {
    const { handler } = await loadHandlerFresh({ sub: 'admin-target' });
    await expect(handler({
      arguments: {
        name: '   ',
        firstAdminUserId: 'admin-target',
      },
      identity: { sub: 'super', groups: ['admins'] },
    })).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });

  it('name over 80 chars: throws VALIDATION_ERROR', async () => {
    const { handler } = await loadHandlerFresh({ sub: 'admin-target' });
    await expect(handler({
      arguments: {
        name: 'x'.repeat(81),
        firstAdminUserId: 'admin-target',
      },
      identity: { sub: 'super', groups: ['admins'] },
    })).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });

  it('contactEmail with invalid format: throws VALIDATION_ERROR', async () => {
    const { handler } = await loadHandlerFresh({ sub: 'admin-target' });
    await expect(handler({
      arguments: {
        name: 'Coca-Cola',
        contactEmail: 'not-an-email',
        firstAdminUserId: 'admin-target',
      },
      identity: { sub: 'super', groups: ['admins'] },
    })).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });
});
```

- [ ] **Step 3: Run the test to verify it FAILS**

```
npm test -- tests/unit/create-company.test.ts
```

Expected: FAIL — handler module does not exist.

- [ ] **Step 4: Implement the handler**

Create `amplify/functions/create-company/handler.ts`:

```ts
/**
 * create-company Lambda
 *
 * Super-admin-only mutation. Creates a Company row plus a CompanyMember
 * row (role=ADMIN) for firstAdminUserId in one TransactWrite.
 */
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient, GetCommand, TransactWriteCommand,
} from '@aws-sdk/lib-dynamodb';
import { ulid } from 'ulid';
import { DomainError } from '../../../src/lib/errors';

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const COMPANY = process.env['COMPANY_TABLE']!;
const COMPANY_MEMBER = process.env['COMPANY_MEMBER_TABLE']!;
const USER = process.env['USER_TABLE']!;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface AppSyncEvent {
  arguments: {
    name: string;
    contactEmail?: string | null;
    description?: string | null;
    firstAdminUserId: string;
  };
  identity: { sub: string; groups?: ReadonlyArray<string> };
}

interface Response { id: string; message: string }

export async function handler(event: AppSyncEvent): Promise<Response> {
  const groups = event.identity.groups ?? [];
  if (!groups.includes('admins')) {
    throw new DomainError('ADMIN_REQUIRED');
  }

  const { name, contactEmail, description, firstAdminUserId } = event.arguments;
  const trimmedName = (name ?? '').trim();
  if (trimmedName.length < 3 || trimmedName.length > 80) {
    throw new DomainError('VALIDATION_ERROR');
  }
  if (contactEmail && !EMAIL_RE.test(contactEmail)) {
    throw new DomainError('VALIDATION_ERROR');
  }

  // Validate the first-admin user exists.
  const userRes = await ddb.send(new GetCommand({
    TableName: USER,
    Key: { sub: firstAdminUserId },
  }));
  if (!userRes.Item) {
    throw new DomainError('VALIDATION_ERROR');
  }

  const companyId = ulid();
  const now = new Date().toISOString();

  await ddb.send(new TransactWriteCommand({
    TransactItems: [
      { Put: {
        TableName: COMPANY,
        Item: {
          __typename: 'Company',
          id: companyId,
          name: trimmedName,
          status: 'ACTIVE',
          ...(contactEmail ? { contactEmail } : {}),
          ...(description ? { description } : {}),
          createdAt: now,
          updatedAt: now,
        },
      }},
      { Put: {
        TableName: COMPANY_MEMBER,
        Item: {
          __typename: 'CompanyMember',
          id: ulid(),
          companyId,
          userId: firstAdminUserId,
          role: 'ADMIN',
          invitedAt: now,
          joinedAt: now,
          createdAt: now,
          updatedAt: now,
        },
      }},
    ],
  }));

  return { id: companyId, message: 'Empresa creada' };
}
```

- [ ] **Step 5: Register the mutation in the schema**

Edit `amplify/data/resource.ts`:

1. At the top of the file, after the other function imports, add:

```ts
import { createCompany } from '../functions/create-company/resource';
```

2. Inside the `a.schema({...})` block, add the mutation (place it after the existing `markEntryFeePaid` mutation block):

```ts
  createCompany: a
    .mutation()
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

- [ ] **Step 6: Run the test to verify it PASSES**

```
npm test -- tests/unit/create-company.test.ts
```

Expected: PASS — all 6 tests pass.

- [ ] **Step 7: Commit**

```bash
git add amplify/functions/create-company/ amplify/data/resource.ts tests/unit/create-company.test.ts
git commit -m "feat(create-company): super-admin mutation creates Company + first admin

Validates name (3-80 trimmed) + contactEmail format + firstAdminUserId
exists in the User table. Persists Company (status=ACTIVE) and
CompanyMember (role=ADMIN, joinedAt=now) atomically in a TransactWrite.

Authorization gated to Cognito group 'admins'.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
"
```

---

The remaining backend tasks follow the same pattern. To keep this document at a reasonable size, the per-task code blocks are abbreviated to the key differences. **Each task uses the same MockDdb / setEnv / loadHandlerFresh skeleton from Task 4** with the table envs swapped to whatever the handler needs.

---

### Task 5: updateCompany Lambda + tests

**Repo:** `polla-backend/`
**Files:**
- Create: `amplify/functions/update-company/handler.ts`
- Create: `amplify/functions/update-company/resource.ts`
- Modify: `amplify/data/resource.ts`
- Create: `tests/unit/update-company.test.ts`

- [ ] **Step 1: Resource file**

```ts
// amplify/functions/update-company/resource.ts
import { defineFunction } from '@aws-amplify/backend';
export const updateCompany = defineFunction({
  name: 'update-company',
  entry: './handler.ts',
  runtime: 20,
  timeoutSeconds: 10,
  resourceGroupName: 'data',
});
```

- [ ] **Step 2: Failing tests**

Create `tests/unit/update-company.test.ts`. Use the same MockDdb skeleton as Task 4 but extend it: in addition to GetCommand it must respond to QueryCommand (for the companiesByUser GSI lookup by `isCompanyAdmin`) and UpdateCommand. Cover:

- Super-admin updates name → UpdateCommand has `:n = newName`.
- Company-admin updates brandPrimary → ok.
- Company-admin of a DIFFERENT company → throws NOT_COMPANY_ADMIN.
- User without role → throws NOT_COMPANY_ADMIN.
- brandPrimary `not-hex` → VALIDATION_ERROR.
- Sparse: only `name` arg → UpdateExpression touches only name + updatedAt.
- Company DISABLED + non-super-admin → COMPANY_DISABLED.

Mock the env: `COMPANY_TABLE`, `COMPANY_MEMBER_TABLE`, `COMPANY_MEMBER_INDEX`.

The shape of one test:

```ts
it('super-admin updates name only: UpdateCommand has SET name + updatedAt', async () => {
  const { handler, mock } = await loadHandlerFresh({
    company: { id: 'c1', status: 'ACTIVE' },
    members: [],
  });
  const result = await handler({
    arguments: { id: 'c1', name: 'New Name' },
    identity: { sub: 'super', groups: ['admins'] },
  });
  expect(result.ok).toBe(true);
  const update = mock.calls.find((c) => c.name === 'UpdateCommand');
  expect(update).toBeDefined();
  const eav = (update!.input as { ExpressionAttributeValues: Record<string, unknown> }).ExpressionAttributeValues;
  expect(eav[':n']).toBe('New Name');
  expect(eav[':u']).toBeDefined();
});
```

- [ ] **Step 3: Implement the handler**

```ts
// amplify/functions/update-company/handler.ts
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient, GetCommand, UpdateCommand,
} from '@aws-sdk/lib-dynamodb';
import { DomainError } from '../../../src/lib/errors';
import { isCompanyAdmin } from '../../../src/lib/auth';

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const COMPANY = process.env['COMPANY_TABLE']!;
const COMPANY_MEMBER = process.env['COMPANY_MEMBER_TABLE']!;
const COMPANY_MEMBER_INDEX = process.env['COMPANY_MEMBER_INDEX']!;

const HEX_RE = /^#[0-9a-fA-F]{6}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface Args {
  id: string;
  name?: string | null;
  contactEmail?: string | null;
  description?: string | null;
  logoKey?: string | null;
  brandPrimary?: string | null;
  brandPrimaryDark?: string | null;
  brandAccent?: string | null;
}

interface AppSyncEvent {
  arguments: Args;
  identity: { sub: string; groups?: ReadonlyArray<string> };
}

interface Response { ok: boolean; message: string }

export async function handler(event: AppSyncEvent): Promise<Response> {
  const caller = event.identity.sub;
  const isSuperAdmin = (event.identity.groups ?? []).includes('admins');
  const { id, name, contactEmail, description,
    logoKey, brandPrimary, brandPrimaryDark, brandAccent } = event.arguments;

  const companyRes = await ddb.send(new GetCommand({ TableName: COMPANY, Key: { id } }));
  const company = companyRes.Item as { status: string } | undefined;
  if (!company) throw new DomainError('COMPANY_NOT_FOUND');

  if (!isSuperAdmin) {
    const admin = await isCompanyAdmin(ddb, COMPANY_MEMBER, COMPANY_MEMBER_INDEX, caller, id);
    if (!admin) throw new DomainError('NOT_COMPANY_ADMIN');
    if (company.status === 'DISABLED') throw new DomainError('COMPANY_DISABLED');
  }

  // Validations on incoming fields only.
  if (name !== undefined && name !== null) {
    const trimmed = name.trim();
    if (trimmed.length < 3 || trimmed.length > 80) throw new DomainError('VALIDATION_ERROR');
  }
  if (contactEmail && !EMAIL_RE.test(contactEmail)) throw new DomainError('VALIDATION_ERROR');
  for (const c of [brandPrimary, brandPrimaryDark, brandAccent]) {
    if (c && !HEX_RE.test(c)) throw new DomainError('VALIDATION_ERROR');
  }

  // Build sparse UpdateExpression. Always update updatedAt.
  const sets: string[] = [];
  const eav: Record<string, unknown> = { ':u': new Date().toISOString() };
  const ean: Record<string, string> = {};
  sets.push('updatedAt = :u');

  function add(field: string, value: unknown, ph: string): void {
    sets.push(`#${field} = ${ph}`);
    ean[`#${field}`] = field;
    eav[ph] = value;
  }

  if (name !== undefined && name !== null) add('name', name.trim(), ':n');
  if (contactEmail !== undefined) add('contactEmail', contactEmail, ':e');
  if (description !== undefined) add('description', description, ':d');
  if (logoKey !== undefined) add('logoKey', logoKey, ':l');
  if (brandPrimary !== undefined) add('brandPrimary', brandPrimary, ':bp');
  if (brandPrimaryDark !== undefined) add('brandPrimaryDark', brandPrimaryDark, ':bd');
  if (brandAccent !== undefined) add('brandAccent', brandAccent, ':ba');

  await ddb.send(new UpdateCommand({
    TableName: COMPANY,
    Key: { id },
    UpdateExpression: 'SET ' + sets.join(', '),
    ExpressionAttributeNames: Object.keys(ean).length > 0 ? ean : undefined,
    ExpressionAttributeValues: eav,
  }));

  return { ok: true, message: 'Cambios guardados' };
}
```

- [ ] **Step 4: Register the mutation in the schema**

In `amplify/data/resource.ts`, import + add:

```ts
import { updateCompany } from '../functions/update-company/resource';

// ...inside a.schema, after createCompany:
  updateCompany: a
    .mutation()
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

- [ ] **Step 5: Run tests + commit**

```
npm test -- tests/unit/update-company.test.ts
```

Expected: all tests pass.

```bash
git add amplify/functions/update-company/ amplify/data/resource.ts tests/unit/update-company.test.ts
git commit -m "feat(update-company): sparse update with permission gate

Authorization: super-admin OR company-admin of the company (DISABLED
companies are read-only for non-super-admins).

Validates name (3-80 trimmed) + email format + brand colors as #RRGGBB
hex. Builds sparse UpdateExpression touching only fields that arrived
in the args.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
"
```

---

### Task 6-10 reference outline

To keep the plan focused, the remaining five backend mutations follow the same scaffold. Each task has the same five-step shape (resource → failing test → handler → register in schema → commit). The differences are:

| Task | Lambda | Auth | Key handler logic | Tests to cover |
|---|---|---|---|---|
| **6** | `setCompanyStatus` | super-admin only | `Get` Company → `Update` status + updatedAt | ok / ADMIN_REQUIRED / COMPANY_NOT_FOUND / reactivate flow |
| **7** | `addCompanyAdmin` | super-admin OR company-admin | Get Company, COMPANY_DISABLED check, Get User, Query companiesByUser for idempotency, Put CompanyMember | ok / idempotent / NOT_COMPANY_ADMIN / VALIDATION_ERROR if user missing / COMPANY_DISABLED |
| **8** | `removeCompanyAdmin` | super-admin OR company-admin | Get Company, Query membersByCompany to count admins, Delete row, LAST_COMPANY_ADMIN safeguard | ok / last-admin error / self-removal allowed / idempotent if not admin |
| **9** | `createCompanyGroup` | super-admin OR company-admin | Get Company, COMPANY_DISABLED check, Get target adminUserId (if provided), TransactWrite Group (companyId, category) + Membership + UGT + InviteCode with code-collision retry | ok with default admin / explicit admin / COMPANY_DISABLED / NOT_COMPANY_ADMIN / VALIDATION_ERROR adminUserId / reuses existing createGroup validation rules |
| **10** | `updateCompanyGroup` | super-admin OR company-admin OR group-admin (via `isGroupAdminOrAbove`) | Get Group, VALIDATION_ERROR if companyId null, isGroupAdminOrAbove, sparse Update | ok per role / VALIDATION_ERROR for individual group / NOT_COMPANY_ADMIN if none |

For each task:

1. Write the failing test file in `tests/unit/<task-name>.test.ts` covering the bullets in the table above. Use the same MockDdb pattern from Task 4. For tests that need to validate "not the last admin," seed the mock with multiple ADMIN rows; for the last-admin error case, seed with one.

2. Implement the handler in `amplify/functions/<task-name>/handler.ts` following the pattern from Tasks 4 and 5: env-driven table names, `DomainError` for control flow, `isCompanyAdmin` / `isGroupAdminOrAbove` for permission checks.

3. Register the mutation in `amplify/data/resource.ts` with the same shape as Task 5's example. Use `allow.group('admins')` for super-admin-only mutations and `allow.authenticated()` for the rest (the handler enforces the real permission).

4. Run `npm test -- tests/unit/<task-name>.test.ts` and confirm green.

5. Commit with the message template:

```
feat(<lambda-name>): <one-line summary>

<short body explaining authorization + key behavior>

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
```

When implementing Task 9 (`createCompanyGroup`), copy the join-code retry loop, the InviteCode ConditionExpression, and the Membership + UGT writes from `amplify/functions/create-group/handler.ts` verbatim — they are battle-tested. The only differences are: set `companyId` on the Group row, set `category` if provided, and use `effectiveAdminUserId = arguments.adminUserId ?? event.identity.sub` for both `Group.adminUserId` and the seeded Membership.

When implementing Task 10 (`updateCompanyGroup`), the env requires GROUP_TABLE, COMPANY_TABLE, COMPANY_MEMBER_TABLE, COMPANY_MEMBER_INDEX. The handler calls `isGroupAdminOrAbove` then does a sparse UpdateCommand on Group using the same SET-pair construction as Task 5.

---

### Task 11: Wire all 7 lambdas in `backend.ts`

**Repo:** `polla-backend/`
**Files:**
- Modify: `amplify/backend.ts`

- [ ] **Step 1: Import the 7 new resources**

After the existing import block (after `import { markEntryFeePaid } from './functions/mark-entry-fee-paid/resource';`), add:

```ts
import { createCompany } from './functions/create-company/resource';
import { updateCompany } from './functions/update-company/resource';
import { setCompanyStatus } from './functions/set-company-status/resource';
import { addCompanyAdmin } from './functions/add-company-admin/resource';
import { removeCompanyAdmin } from './functions/remove-company-admin/resource';
import { createCompanyGroup } from './functions/create-company-group/resource';
import { updateCompanyGroup } from './functions/update-company-group/resource';
```

- [ ] **Step 2: Register inside defineBackend**

Inside the `defineBackend({...})` block, add the seven names after `markEntryFeePaid,`:

```ts
  createCompany,
  updateCompany,
  setCompanyStatus,
  addCompanyAdmin,
  removeCompanyAdmin,
  createCompanyGroup,
  updateCompanyGroup,
```

- [ ] **Step 3: Add env + grant blocks**

After the existing `mark-entry-fee-paid` wiring block (after the `grantIndexQuery(membershipTable, backend.markEntryFeePaid.resources.lambda);` line), add the new wiring:

```ts
const companyTable = tables['Company']!;
const companyMemberTable = tables['CompanyMember']!;

// create-company: writes Company + CompanyMember; reads User.
backend.createCompany.addEnvironment('COMPANY_TABLE', companyTable.tableName);
backend.createCompany.addEnvironment('COMPANY_MEMBER_TABLE', companyMemberTable.tableName);
backend.createCompany.addEnvironment('USER_TABLE', userTable.tableName);
companyTable.grantWriteData(backend.createCompany.resources.lambda);
companyMemberTable.grantWriteData(backend.createCompany.resources.lambda);
userTable.grantReadData(backend.createCompany.resources.lambda);

// update-company: reads Company + CompanyMember.companiesByUser; updates Company.
backend.updateCompany.addEnvironment('COMPANY_TABLE', companyTable.tableName);
backend.updateCompany.addEnvironment('COMPANY_MEMBER_TABLE', companyMemberTable.tableName);
backend.updateCompany.addEnvironment('COMPANY_MEMBER_INDEX', 'companiesByUser');
companyTable.grantReadWriteData(backend.updateCompany.resources.lambda);
companyMemberTable.grantReadData(backend.updateCompany.resources.lambda);
grantIndexQuery(companyMemberTable, backend.updateCompany.resources.lambda);

// set-company-status: super-admin only; updates Company.
backend.setCompanyStatus.addEnvironment('COMPANY_TABLE', companyTable.tableName);
companyTable.grantReadWriteData(backend.setCompanyStatus.resources.lambda);

// add-company-admin: reads Company + User; reads CompanyMember.companiesByUser; writes CompanyMember.
backend.addCompanyAdmin.addEnvironment('COMPANY_TABLE', companyTable.tableName);
backend.addCompanyAdmin.addEnvironment('COMPANY_MEMBER_TABLE', companyMemberTable.tableName);
backend.addCompanyAdmin.addEnvironment('COMPANY_MEMBER_INDEX', 'companiesByUser');
backend.addCompanyAdmin.addEnvironment('USER_TABLE', userTable.tableName);
companyTable.grantReadData(backend.addCompanyAdmin.resources.lambda);
companyMemberTable.grantReadWriteData(backend.addCompanyAdmin.resources.lambda);
userTable.grantReadData(backend.addCompanyAdmin.resources.lambda);
grantIndexQuery(companyMemberTable, backend.addCompanyAdmin.resources.lambda);

// remove-company-admin: reads Company + CompanyMember.membersByCompany; deletes CompanyMember.
backend.removeCompanyAdmin.addEnvironment('COMPANY_TABLE', companyTable.tableName);
backend.removeCompanyAdmin.addEnvironment('COMPANY_MEMBER_TABLE', companyMemberTable.tableName);
backend.removeCompanyAdmin.addEnvironment('COMPANY_MEMBER_MEMBERS_INDEX', 'membersByCompany');
backend.removeCompanyAdmin.addEnvironment('COMPANY_MEMBER_USERS_INDEX', 'companiesByUser');
companyTable.grantReadData(backend.removeCompanyAdmin.resources.lambda);
companyMemberTable.grantReadWriteData(backend.removeCompanyAdmin.resources.lambda);
grantIndexQuery(companyMemberTable, backend.removeCompanyAdmin.resources.lambda);

// create-company-group: same env as create-group + Company.
backend.createCompanyGroup.addEnvironment('GROUP_TABLE', groupTable.tableName);
backend.createCompanyGroup.addEnvironment('MEMBERSHIP_TABLE', membershipTable.tableName);
backend.createCompanyGroup.addEnvironment('INVITE_TABLE', inviteTable.tableName);
backend.createCompanyGroup.addEnvironment('USER_GROUP_TOTAL_TABLE', ugtTable.tableName);
backend.createCompanyGroup.addEnvironment('COMPANY_TABLE', companyTable.tableName);
backend.createCompanyGroup.addEnvironment('COMPANY_MEMBER_TABLE', companyMemberTable.tableName);
backend.createCompanyGroup.addEnvironment('COMPANY_MEMBER_INDEX', 'companiesByUser');
backend.createCompanyGroup.addEnvironment('USER_TABLE', userTable.tableName);
groupTable.grantWriteData(backend.createCompanyGroup.resources.lambda);
membershipTable.grantWriteData(backend.createCompanyGroup.resources.lambda);
inviteTable.grantWriteData(backend.createCompanyGroup.resources.lambda);
ugtTable.grantWriteData(backend.createCompanyGroup.resources.lambda);
companyTable.grantReadData(backend.createCompanyGroup.resources.lambda);
companyMemberTable.grantReadData(backend.createCompanyGroup.resources.lambda);
userTable.grantReadData(backend.createCompanyGroup.resources.lambda);
grantIndexQuery(companyMemberTable, backend.createCompanyGroup.resources.lambda);

// update-company-group: reads Group + Company + CompanyMember; updates Group.
backend.updateCompanyGroup.addEnvironment('GROUP_TABLE', groupTable.tableName);
backend.updateCompanyGroup.addEnvironment('COMPANY_TABLE', companyTable.tableName);
backend.updateCompanyGroup.addEnvironment('COMPANY_MEMBER_TABLE', companyMemberTable.tableName);
backend.updateCompanyGroup.addEnvironment('COMPANY_MEMBER_INDEX', 'companiesByUser');
groupTable.grantReadWriteData(backend.updateCompanyGroup.resources.lambda);
companyTable.grantReadData(backend.updateCompanyGroup.resources.lambda);
companyMemberTable.grantReadData(backend.updateCompanyGroup.resources.lambda);
grantIndexQuery(companyMemberTable, backend.updateCompanyGroup.resources.lambda);
```

- [ ] **Step 4: Typecheck**

```
npm run typecheck
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add amplify/backend.ts
git commit -m "feat(backend): wire 7 Empresas Lambdas + GSI grants

Adds Company + CompanyMember table refs and wires:
- createCompany / updateCompany / setCompanyStatus
- addCompanyAdmin / removeCompanyAdmin
- createCompanyGroup / updateCompanyGroup

Each lambda gets only the env vars + grants it needs. GSI Query
permission added explicitly for handlers that read companiesByUser
or membersByCompany (Amplify table grants do not cover index ARNs).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
"
```

---

## Phase 3 — Frontend API layer (Task 12)

The Sub-1 plan continues with the frontend pieces in a follow-up file because of length constraints. The next file to write is `docs/superpowers/plans/2026-05-30-empresas-sub1-frontend.md` covering:

- Task 12: domain errors map + `ApiService` methods (createCompany, updateCompany, setCompanyStatus, addCompanyAdmin, removeCompanyAdmin, createCompanyGroup, updateCompanyGroup, listCompanies, getCompany, listCompanyMembers, listCompanyGroups, searchUsers).

That single task is large enough that splitting it makes sense for the implementer.

## Phase 4 — Frontend UI (Tasks 13-21)

- Task 13: `AdminPickerComponent` (autocomplete by handle/email, debounced 300ms) + tests
- Task 14: `CreateCompanyModalComponent` (form with name, contactEmail, description, adminPicker) + tests
- Task 15: `CompaniesListComponent` (list with search filter, status pill, counts) + tests
- Task 16: `CompanyDetailComponent` Tab General (sparse-form save) + tests
- Task 17: `CompanyDetailComponent` Tab Admins (list + add/remove with last-admin guard) + tests
- Task 18: `CompanyDetailComponent` Tab Grupos (read-only list + simple `+ Crear grupo` modal) + tests
- Task 19: `CompanyDetailComponent` Tab Branding (read-only preview only) + tests
- Task 20: routes registration + admin shell sidebar item
- Task 21: extend `group-edit.component.ts` to detect `companyId` and call `updateCompanyGroup` when set

## Phase 5 — Integration (Tasks 22-23)

- Task 22: `npx ampx sandbox` deploy + copy `amplify_outputs.json` to `polla-app/` root and `src/`
- Task 23: smoke flow per spec §6.4 + push branches

---

## Implementation order

The shortest path to a working surface-end-to-end:

1. Tasks 1-3 (foundation: errors, schema, auth helper)
2. Tasks 4-10 (seven Lambdas, in order)
3. Task 11 (wire backend.ts)
4. Task 22 (sandbox deploy — Amplify generates types the frontend consumes)
5. Tasks 12-21 (frontend)
6. Task 23 (smoke + push)

---

## Self-review notes

This file covers Phase 1, Phase 2, and Phase 3 outline. **A second plan file (`2026-05-30-empresas-sub1-frontend.md`) is required to detail Tasks 12-23 at the same granularity as Tasks 1-5.** The structure of those tasks mirrors the existing Cuota de ingreso plan (`2026-05-29-group-entry-fee.md`) Tasks 6-11 — each frontend task has the same five-step TDD shape: write spec → run failing → implement component → run passing → commit.

Spec coverage already verified inline. Type consistency: helper signatures use `(ddb, table, index, userId, companyId, [cognitoGroups])` consistently across handlers in Tasks 4-10. No placeholder text in the implemented tasks.
