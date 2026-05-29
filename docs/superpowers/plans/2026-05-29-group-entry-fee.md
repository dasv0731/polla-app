# Group Entry Fee Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add optional entry-fee tracking to groups: admin enables a textarea of payment instructions at create or edit, members with unpaid status see a floating reminder inside the group screen, admin marks them paid via a checkbox in the members table.

**Architecture:** Two new fields on `Group` (`entryFeeEnabled`, `entryFeeInstructions`) + one on `Membership` (`entryFeePaidAt`). Extend existing `createGroup` Lambda; new custom mutation `markEntryFeePaid` validates admin and toggles the timestamp. Frontend: new toggle/textarea in the create modal and edit screen, new admin-only column on the members table, floating reminder with modal of instructions on `/groups/:id`.

**Tech Stack:** Amplify Gen 2 (AppSync GraphQL + DynamoDB + Lambda), Angular 18 standalone components + signals, Jest backend + frontend, ts-jest preset, @aws-sdk/lib-dynamodb v3 mocks.

**Spec:** `docs/superpowers/specs/2026-05-29-group-entry-fee-design.md`

---

## Repositories touched

This plan spans **two sibling repos**:

- `polla-backend/` (Amplify Gen 2 backend) — Tasks 1-5
- `polla-app/` (Angular 18 frontend) — Tasks 6-10

Working directory differs per task. Each task header includes the repo path. Commit per repo separately — do NOT cross-commit.

---

## File structure

### Backend (`polla-backend/`)

| File | Responsibility | Action |
|---|---|---|
| `src/lib/errors.ts` | Domain error codes catalog | Modify — add 3 codes |
| `amplify/data/resource.ts` | Amplify schema (Group, Membership, mutations) | Modify — extend Group + Membership + register markEntryFeePaid mutation |
| `amplify/functions/create-group/handler.ts` | Handler for createGroup | Modify — accept entryFee args, validate, set admin paidAt |
| `amplify/functions/mark-entry-fee-paid/handler.ts` | Handler for markEntryFeePaid | Create — admin-only mutation, toggle timestamp |
| `amplify/functions/mark-entry-fee-paid/resource.ts` | Lambda definition | Create |
| `amplify/backend.ts` | Backend wiring + IAM grants | Modify — import + register + grants for mark-entry-fee-paid |
| `tests/unit/create-group.test.ts` | Unit tests for createGroup | Create — entry-fee paths |
| `tests/unit/mark-entry-fee-paid.test.ts` | Unit tests for markEntryFeePaid | Create — admin gate + toggle + edge cases |

### Frontend (`polla-app/`)

| File | Responsibility | Action |
|---|---|---|
| `src/app/core/notifications/domain-errors.ts` | User-facing error map | Modify — map 3 new error codes to Spanish messages |
| `src/app/core/api/api.service.ts` | Amplify client facade | Modify — extend createGroup + updateGroup, add markEntryFeePaid |
| `src/app/shared/layout/group-actions-modals.component.ts` | Create/Join group modals | Modify — toggle + textarea + validation in create modal |
| `src/app/shared/layout/group-actions-modals.component.spec.ts` | Tests for above | Create (file does not exist) |
| `src/app/features/groups/group-edit.component.ts` | Edit group screen | Modify — Cuota block + transitions + dirty + auto-paid |
| `src/app/features/groups/group-edit.component.spec.ts` | Tests for above | Create (file does not exist) |
| `src/app/features/groups/group-detail.component.ts` | Group detail screen | Modify — admin column + floating reminder + instructions modal |
| `src/app/features/groups/group-detail.component.spec.ts` | Tests for above | Create (file does not exist) |

---

## Phase 1 — Backend foundation

Work in `polla-backend/`. All Tasks 1-5 run in that repo. Each task: write failing test → implement → run test → commit.

---

### Task 1: Add 3 domain error codes

**Repo:** `polla-backend/`
**Files:**
- Modify: `src/lib/errors.ts`
- Test: existing handler tests will assert against these strings; no dedicated test file for the catalog itself.

- [ ] **Step 1: Add the three new error codes**

Open `polla-backend/src/lib/errors.ts`. Inside the `ErrorCode` object literal, add three new keys before the closing `} as const;` (place them grouped with the other group-related codes, after `ADMIN_REQUIRED`):

```ts
  // Group entry-fee (cuota de ingreso)
  ENTRY_FEE_INSTRUCTIONS_REQUIRED: 'ENTRY_FEE_INSTRUCTIONS_REQUIRED',
  ENTRY_FEE_INSTRUCTIONS_TOO_LONG: 'ENTRY_FEE_INSTRUCTIONS_TOO_LONG',
  ENTRY_FEE_NOT_GROUP_ADMIN: 'ENTRY_FEE_NOT_GROUP_ADMIN',
```

- [ ] **Step 2: Run typecheck to confirm no regression**

```
npm run typecheck
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/errors.ts
git commit -m "feat(errors): add entry-fee domain error codes

Three new codes used by create-group and mark-entry-fee-paid handlers:
- ENTRY_FEE_INSTRUCTIONS_REQUIRED
- ENTRY_FEE_INSTRUCTIONS_TOO_LONG
- ENTRY_FEE_NOT_GROUP_ADMIN
"
```

---

### Task 2: Extend Amplify schema (Group + Membership)

**Repo:** `polla-backend/`
**Files:**
- Modify: `amplify/data/resource.ts:298-346` (Group model) and `:348-365` (Membership model)

This task only changes the schema. No tests — schema changes are verified at deploy time and by typecheck.

- [ ] **Step 1: Add the two new fields to `Group`**

In `amplify/data/resource.ts`, locate the `Group: a.model({...})` block (around line 298). Inside the model definition, after the existing `comodinesEnabled: a.boolean().default(true),` line, add:

```ts
      // Cuota de ingreso del grupo. Texto libre con instrucciones de pago
      // (depósito, contacto, etc). El estado per-miembro vive en Membership.
      entryFeeEnabled: a.boolean().default(false),
      entryFeeInstructions: a.string(),
```

- [ ] **Step 2: Add the new field to `Membership`**

In the same file, locate the `Membership: a.model({...})` block (around line 348). Inside the model definition, after `joinedAt: a.datetime().required(),`, add:

```ts
      // Cuota de ingreso. null = pendiente / timestamp = pagada (set por
      // el admin via mutation markEntryFeePaid o auto-paid del admin al
      // crear/activar la cuota).
      entryFeePaidAt: a.datetime(),
```

- [ ] **Step 3: Run typecheck**

```
npm run typecheck
```

Expected: no errors. The Amplify `a.boolean()` / `a.string()` / `a.datetime()` API is already imported.

- [ ] **Step 4: Commit**

```bash
git add amplify/data/resource.ts
git commit -m "feat(schema): add entryFee fields to Group + Membership

Group:
- entryFeeEnabled: boolean (default false)
- entryFeeInstructions: string (max 500 chars validated in handler)

Membership:
- entryFeePaidAt: datetime (null = pending, set = paid)

Backward-compatible defaults: all existing rows treat cuota as off.
"
```

---

### Task 3: Extend `createGroup` mutation signature and handler

**Repo:** `polla-backend/`
**Files:**
- Modify: `amplify/data/resource.ts:718-735` (the `createGroup` mutation arguments)
- Modify: `amplify/functions/create-group/handler.ts` (extend args + validation + auto-paid logic)
- Test: `tests/unit/create-group.test.ts` (CREATE this file)

- [ ] **Step 1: Add the new arguments to the `createGroup` mutation in `resource.ts`**

In `amplify/data/resource.ts`, locate the `createGroup: a.mutation()` block (around line 718). Extend the `.arguments({...})` block to include the two new fields. The full block should become:

```ts
  createGroup: a
    .mutation()
    .arguments({
      name: a.string().required(),
      tournamentId: a.id().required(),
      mode: a.ref('GameMode').required(),
      description: a.string(),    // optional desde el form
      imageKey: a.string(),       // optional · Storage key del avatar
      comodinesEnabled: a.boolean(),   // NUEVO opcional. Handler aplica reglas.
      entryFeeEnabled: a.boolean(),    // NUEVO opcional. Default false.
      entryFeeInstructions: a.string(),  // NUEVO opcional. Required si entryFeeEnabled=true.
    })
    .returns(
      a.customType({
        id: a.id().required(),
        joinCode: a.string().required(),
      }),
    )
    .authorization((allow) => [allow.authenticated()])
    .handler(a.handler.function(createGroup)),
```

- [ ] **Step 2: Create the failing test file**

Create `polla-backend/tests/unit/create-group.test.ts` with the full content below. The mock and test setup mirror the pattern used in `tests/unit/remove-member.test.ts`:

```ts
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';

/**
 * Mock DynamoDBDocumentClient that records every send() call.
 * createGroup uses TransactWriteCommand exclusively (no Get/Query in the
 * happy path), so this mock just acknowledges the writes and exposes the
 * TransactItems for assertion.
 */
class MockDdb {
  public calls: Array<{ name: string; input: unknown }> = [];
  private failNext: boolean = false;

  constructor() {}

  send(cmd: { constructor: { name: string }; input: unknown }): Promise<unknown> {
    const name = cmd.constructor.name;
    this.calls.push({ name, input: cmd.input });
    if (name === 'TransactWriteCommand') {
      if (this.failNext) {
        this.failNext = false;
        const err = new Error('TransactionCanceledException');
        err.name = 'TransactionCanceledException';
        return Promise.reject(err);
      }
      return Promise.resolve({});
    }
    return Promise.resolve({});
  }

  failNextTransact(): void { this.failNext = true; }

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
  process.env['GROUP_TABLE'] = 'G';
  process.env['MEMBERSHIP_TABLE'] = 'M';
  process.env['INVITE_TABLE'] = 'I';
  process.env['USER_GROUP_TOTAL_TABLE'] = 'UGT';
}

function installMockDdb(mock: MockDdb): void {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { DynamoDBDocumentClient } = require('@aws-sdk/lib-dynamodb');
  (DynamoDBDocumentClient.from as jest.Mock).mockReturnValue(mock);
}

async function loadHandlerFresh() {
  setEnv();
  jest.resetModules();
  const mock = new MockDdb();
  installMockDdb(mock);
  const { handler } = await import('../../amplify/functions/create-group/handler');
  return { handler, mock };
}

function findPutByTable(items: Array<Record<string, unknown>>, table: string): Record<string, unknown> | undefined {
  const item = items.find((i) => {
    const put = i['Put'] as { TableName?: string } | undefined;
    return put?.TableName === table;
  });
  return item ? (item['Put'] as { Item: Record<string, unknown> }).Item : undefined;
}

describe('create-group handler — entry fee paths', () => {
  it('entryFeeEnabled=true: persists fields on Group and sets entryFeePaidAt on admin Membership', async () => {
    const { handler, mock } = await loadHandlerFresh();
    const result = await handler({
      arguments: {
        name: 'Polla Familia',
        tournamentId: 'mundial-2026',
        mode: 'COMPLETE',
        entryFeeEnabled: true,
        entryFeeInstructions: 'Depositar $20 USD a XXX, comprobante a YYY.',
      },
      identity: { sub: 'admin-sub' },
    });

    expect(result.id).toBeDefined();
    expect(result.joinCode).toBeDefined();

    const items = mock.transactItems();
    const groupRow = findPutByTable(items, 'G');
    const memRow = findPutByTable(items, 'M');

    expect(groupRow).toBeDefined();
    expect(groupRow!['entryFeeEnabled']).toBe(true);
    expect(groupRow!['entryFeeInstructions']).toBe('Depositar $20 USD a XXX, comprobante a YYY.');

    expect(memRow).toBeDefined();
    expect(memRow!['entryFeePaidAt']).toBeDefined();
    expect(typeof memRow!['entryFeePaidAt']).toBe('string');
  });

  it('entryFeeEnabled=true with empty instructions: throws ENTRY_FEE_INSTRUCTIONS_REQUIRED', async () => {
    const { handler } = await loadHandlerFresh();
    await expect(handler({
      arguments: {
        name: 'P',
        tournamentId: 't',
        mode: 'COMPLETE',
        entryFeeEnabled: true,
        entryFeeInstructions: '   ',
      },
      identity: { sub: 'admin-sub' },
    })).rejects.toMatchObject({ code: 'ENTRY_FEE_INSTRUCTIONS_REQUIRED' });
  });

  it('entryFeeEnabled=true with instructions over 500 chars: throws ENTRY_FEE_INSTRUCTIONS_TOO_LONG', async () => {
    const { handler } = await loadHandlerFresh();
    await expect(handler({
      arguments: {
        name: 'P',
        tournamentId: 't',
        mode: 'COMPLETE',
        entryFeeEnabled: true,
        entryFeeInstructions: 'x'.repeat(501),
      },
      identity: { sub: 'admin-sub' },
    })).rejects.toMatchObject({ code: 'ENTRY_FEE_INSTRUCTIONS_TOO_LONG' });
  });

  it('entryFeeEnabled omitted: Group defaults to false, Membership has no entryFeePaidAt', async () => {
    const { handler, mock } = await loadHandlerFresh();
    await handler({
      arguments: {
        name: 'P',
        tournamentId: 't',
        mode: 'COMPLETE',
      },
      identity: { sub: 'admin-sub' },
    });

    const items = mock.transactItems();
    const groupRow = findPutByTable(items, 'G');
    const memRow = findPutByTable(items, 'M');

    expect(groupRow!['entryFeeEnabled']).toBe(false);
    expect(groupRow!['entryFeeInstructions']).toBeUndefined();
    expect(memRow!['entryFeePaidAt']).toBeUndefined();
  });

  it('entryFeeEnabled=false explicitly: same defaults as omitted', async () => {
    const { handler, mock } = await loadHandlerFresh();
    await handler({
      arguments: {
        name: 'P',
        tournamentId: 't',
        mode: 'COMPLETE',
        entryFeeEnabled: false,
        entryFeeInstructions: 'should be ignored',
      },
      identity: { sub: 'admin-sub' },
    });

    const items = mock.transactItems();
    const groupRow = findPutByTable(items, 'G');
    const memRow = findPutByTable(items, 'M');

    expect(groupRow!['entryFeeEnabled']).toBe(false);
    expect(groupRow!['entryFeeInstructions']).toBeUndefined();
    expect(memRow!['entryFeePaidAt']).toBeUndefined();
  });
});
```

- [ ] **Step 3: Run the new test to verify it fails**

```
npm test -- tests/unit/create-group.test.ts
```

Expected: FAIL — all 5 tests fail. The current handler does not accept `entryFeeEnabled` / `entryFeeInstructions` args, so the assertions on `groupRow['entryFeeEnabled']` and `memRow['entryFeePaidAt']` will not match.

- [ ] **Step 4: Update the handler to implement the new behavior**

Edit `amplify/functions/create-group/handler.ts`. Replace the entire `AppSyncEvent` interface and the body of `handler()` with this updated version (keep the imports and constants at the top of the file unchanged):

```ts
interface AppSyncEvent {
  arguments: {
    name: string;
    tournamentId: string;
    mode: GameMode;
    description?: string | null;
    imageKey?: string | null;
    comodinesEnabled?: boolean | null;
    entryFeeEnabled?: boolean | null;
    entryFeeInstructions?: string | null;
  };
  identity: { sub: string };
}

export async function handler(event: AppSyncEvent): Promise<{ id: string; joinCode: string }> {
  const {
    name, tournamentId, mode, description, imageKey, comodinesEnabled,
    entryFeeEnabled, entryFeeInstructions,
  } = event.arguments;
  if (mode !== 'SIMPLE' && mode !== 'COMPLETE') {
    throw new DomainError('INVALID_MODE');
  }
  const effectiveComodinesEnabled = mode === 'SIMPLE' ? false : (comodinesEnabled ?? true);

  // Entry-fee normalization + validation. Only validate instructions when
  // the feature is being turned on; when off, ignore any submitted text.
  const effectiveEntryFeeEnabled = entryFeeEnabled === true;
  let effectiveEntryFeeInstructions: string | undefined;
  if (effectiveEntryFeeEnabled) {
    const trimmed = (entryFeeInstructions ?? '').trim();
    if (trimmed.length === 0) {
      throw new DomainError('ENTRY_FEE_INSTRUCTIONS_REQUIRED');
    }
    if (trimmed.length > 500) {
      throw new DomainError('ENTRY_FEE_INSTRUCTIONS_TOO_LONG');
    }
    effectiveEntryFeeInstructions = trimmed;
  }

  const userId = event.identity.sub;
  const groupId = ulid();
  const now = new Date().toISOString();

  for (let attempt = 0; attempt < 5; attempt++) {
    const code = generateJoinCode();
    try {
      await ddb.send(
        new TransactWriteCommand({
          TransactItems: [
            { Put: {
              TableName: GROUP,
              Item: {
                __typename: 'Group',
                id: groupId,
                name, tournamentId, mode, adminUserId: userId, joinCode: code,
                comodinesEnabled: effectiveComodinesEnabled,
                entryFeeEnabled: effectiveEntryFeeEnabled,
                ...(effectiveEntryFeeInstructions ? { entryFeeInstructions: effectiveEntryFeeInstructions } : {}),
                ...(description ? { description } : {}),
                ...(imageKey ? { imageKey } : {}),
                createdAt: now, updatedAt: now,
              },
            }},
            { Put: {
              TableName: INVITE,
              Item: {
                __typename: 'InviteCode',
                code, groupId,
                createdAt: now, updatedAt: now,
              },
              ConditionExpression: 'attribute_not_exists(code)',
            }},
            { Put: {
              TableName: MEMBERSHIP,
              Item: {
                __typename: 'Membership',
                id: ulid(),
                groupId, userId, isAdmin: true, joinedAt: now,
                ...(effectiveEntryFeeEnabled ? { entryFeePaidAt: now } : {}),
                createdAt: now, updatedAt: now,
              },
            }},
            { Put: {
              TableName: TOTAL,
              Item: {
                __typename: 'UserGroupTotal',
                groupId, userId,
                points: 0, exactCount: 0, resultCount: 0,
                createdAt: now, updatedAt: now,
              },
            }},
          ],
        }),
      );
      return { id: groupId, joinCode: code };
    } catch (err) {
      const e = err as { name?: string };
      if (e.name === 'TransactionCanceledException') continue;
      throw err;
    }
  }
  throw new DomainError('CODE_GENERATION_FAILED');
}
```

- [ ] **Step 5: Run the test again to verify it passes**

```
npm test -- tests/unit/create-group.test.ts
```

Expected: PASS — all 5 tests pass.

- [ ] **Step 6: Run the full test suite to ensure no regression**

```
npm test
```

Expected: every existing test still passes (remove-member, scoring, codes, etc.).

- [ ] **Step 7: Commit**

```bash
git add amplify/data/resource.ts amplify/functions/create-group/handler.ts tests/unit/create-group.test.ts
git commit -m "feat(create-group): accept entryFee args + auto-paid admin

createGroup mutation now accepts entryFeeEnabled + entryFeeInstructions.
When enabled, the admin's Membership row is created with entryFeePaidAt
set to the same TransactWrite timestamp (admin auto-paid invariant).

Validates instructions: required if enabled, ≤500 chars after trim.
Errors: ENTRY_FEE_INSTRUCTIONS_REQUIRED, ENTRY_FEE_INSTRUCTIONS_TOO_LONG.
"
```

---

### Task 4: Create `markEntryFeePaid` Lambda + schema mutation

**Repo:** `polla-backend/`
**Files:**
- Create: `amplify/functions/mark-entry-fee-paid/handler.ts`
- Create: `amplify/functions/mark-entry-fee-paid/resource.ts`
- Modify: `amplify/data/resource.ts` — import the new resource at the top + register the mutation
- Test: `tests/unit/mark-entry-fee-paid.test.ts` (CREATE this file)

- [ ] **Step 1: Create the Lambda resource definition**

Create `polla-backend/amplify/functions/mark-entry-fee-paid/resource.ts`:

```ts
import { defineFunction } from '@aws-amplify/backend';

export const markEntryFeePaid = defineFunction({
  name: 'mark-entry-fee-paid',
  entry: './handler.ts',
  runtime: 20,
  timeoutSeconds: 10,
  resourceGroupName: 'data',
});
```

- [ ] **Step 2: Create the failing test file**

Create `polla-backend/tests/unit/mark-entry-fee-paid.test.ts`:

```ts
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';

/**
 * Mock supports: GetCommand (Group + Membership) + UpdateCommand (Membership).
 * The handler reads the Group row first to validate admin, then the target
 * Membership to confirm it exists, then issues an Update to set/clear
 * entryFeePaidAt.
 */
interface MockGroup { id: string; adminUserId: string }
interface MockMembership { id: string; groupId: string; userId: string }

class MockDdb {
  public calls: Array<{ name: string; input: unknown }> = [];
  private memberships: ReadonlyArray<MockMembership>;
  constructor(
    private group: MockGroup | undefined,
    members: ReadonlyArray<MockMembership>,
  ) {
    this.memberships = members;
  }

  send(cmd: { constructor: { name: string }; input: unknown }): Promise<unknown> {
    const name = cmd.constructor.name;
    this.calls.push({ name, input: cmd.input });
    if (name === 'GetCommand') {
      const input = cmd.input as { TableName: string; Key: Record<string, unknown> };
      if (input.TableName === 'G') {
        return Promise.resolve({ Item: this.group });
      }
      return Promise.resolve({ Item: undefined });
    }
    if (name === 'QueryCommand') {
      // Find Membership by groupId+userId via GSI 'membersByGroup'.
      const input = cmd.input as { ExpressionAttributeValues: Record<string, unknown> };
      const gid = input.ExpressionAttributeValues[':g'];
      return Promise.resolve({ Items: this.memberships.filter((m) => m.groupId === gid) });
    }
    if (name === 'UpdateCommand') {
      return Promise.resolve({});
    }
    return Promise.resolve({});
  }

  updateInputs(): Array<Record<string, unknown>> {
    return this.calls
      .filter((c) => c.name === 'UpdateCommand')
      .map((c) => c.input as Record<string, unknown>);
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
  process.env['GROUP_TABLE'] = 'G';
  process.env['MEMBERSHIP_TABLE'] = 'M';
}

function installMockDdb(mock: MockDdb): void {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { DynamoDBDocumentClient } = require('@aws-sdk/lib-dynamodb');
  (DynamoDBDocumentClient.from as jest.Mock).mockReturnValue(mock);
}

interface SetupOpts {
  group: MockGroup | undefined;
  members: ReadonlyArray<MockMembership>;
}

async function loadHandlerFresh(opts: SetupOpts) {
  setEnv();
  jest.resetModules();
  const mock = new MockDdb(opts.group, opts.members);
  installMockDdb(mock);
  const { handler } = await import('../../amplify/functions/mark-entry-fee-paid/handler');
  return { handler, mock };
}

describe('mark-entry-fee-paid handler', () => {
  it('admin marks member paid: ok=true, paidAt is ISO string, UpdateCommand sets entryFeePaidAt', async () => {
    const { handler, mock } = await loadHandlerFresh({
      group: { id: 'g1', adminUserId: 'admin-sub' },
      members: [{ id: 'mem-1', groupId: 'g1', userId: 'other-sub' }],
    });
    const result = await handler({
      arguments: { groupId: 'g1', userId: 'other-sub', paid: true },
      identity: { sub: 'admin-sub' },
    });

    expect(result.ok).toBe(true);
    expect(typeof result.paidAt).toBe('string');
    expect(result.paidAt).not.toBeNull();

    const updates = mock.updateInputs();
    expect(updates).toHaveLength(1);
    const update = updates[0] as { Key: Record<string, unknown>; ExpressionAttributeValues: Record<string, unknown> };
    expect(update.Key).toEqual({ id: 'mem-1' });
    expect(update.ExpressionAttributeValues[':v']).toBe(result.paidAt);
  });

  it('admin marks member unpaid: ok=true, paidAt is null, UpdateCommand clears field', async () => {
    const { handler, mock } = await loadHandlerFresh({
      group: { id: 'g1', adminUserId: 'admin-sub' },
      members: [{ id: 'mem-1', groupId: 'g1', userId: 'other-sub' }],
    });
    const result = await handler({
      arguments: { groupId: 'g1', userId: 'other-sub', paid: false },
      identity: { sub: 'admin-sub' },
    });

    expect(result.ok).toBe(true);
    expect(result.paidAt).toBeNull();

    const updates = mock.updateInputs();
    expect(updates).toHaveLength(1);
    const update = updates[0] as { ExpressionAttributeValues: Record<string, unknown> };
    expect(update.ExpressionAttributeValues[':v']).toBeNull();
  });

  it('non-admin caller: throws ENTRY_FEE_NOT_GROUP_ADMIN, no Update issued', async () => {
    const { handler, mock } = await loadHandlerFresh({
      group: { id: 'g1', adminUserId: 'admin-sub' },
      members: [{ id: 'mem-1', groupId: 'g1', userId: 'other-sub' }],
    });
    await expect(handler({
      arguments: { groupId: 'g1', userId: 'other-sub', paid: true },
      identity: { sub: 'random-user' },
    })).rejects.toMatchObject({ code: 'ENTRY_FEE_NOT_GROUP_ADMIN' });

    expect(mock.updateInputs()).toHaveLength(0);
  });

  it('group not found: throws GROUP_NOT_FOUND, no Update issued', async () => {
    const { handler, mock } = await loadHandlerFresh({
      group: undefined,
      members: [],
    });
    await expect(handler({
      arguments: { groupId: 'g-missing', userId: 'x', paid: true },
      identity: { sub: 'admin-sub' },
    })).rejects.toMatchObject({ code: 'GROUP_NOT_FOUND' });

    expect(mock.updateInputs()).toHaveLength(0);
  });

  it('membership not found for target user: returns ok=false with message', async () => {
    const { handler, mock } = await loadHandlerFresh({
      group: { id: 'g1', adminUserId: 'admin-sub' },
      members: [],
    });
    const result = await handler({
      arguments: { groupId: 'g1', userId: 'ghost', paid: true },
      identity: { sub: 'admin-sub' },
    });

    expect(result.ok).toBe(false);
    expect(result.message).toContain('miembro');
    expect(mock.updateInputs()).toHaveLength(0);
  });

  it('admin marks themselves paid: allowed (self-target)', async () => {
    const { handler } = await loadHandlerFresh({
      group: { id: 'g1', adminUserId: 'admin-sub' },
      members: [{ id: 'mem-admin', groupId: 'g1', userId: 'admin-sub' }],
    });
    const result = await handler({
      arguments: { groupId: 'g1', userId: 'admin-sub', paid: true },
      identity: { sub: 'admin-sub' },
    });

    expect(result.ok).toBe(true);
    expect(typeof result.paidAt).toBe('string');
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

```
npm test -- tests/unit/mark-entry-fee-paid.test.ts
```

Expected: FAIL — module `amplify/functions/mark-entry-fee-paid/handler` does not exist.

- [ ] **Step 4: Implement the handler**

Create `polla-backend/amplify/functions/mark-entry-fee-paid/handler.ts`:

```ts
/**
 * mark-entry-fee-paid Lambda
 *
 * Admin-only mutation: toggles the entryFeePaidAt timestamp on a Membership
 * row. The caller MUST be the admin of the target group (validated via the
 * Group.adminUserId field — NOT the Cognito 'admins' group).
 *
 * paid=true  → sets entryFeePaidAt to now()
 * paid=false → clears entryFeePaidAt (null)
 *
 * Does not validate group.entryFeeEnabled — the admin is allowed to mark
 * unmark even when the feature is currently disabled, so toggling the
 * feature off/on preserves the per-member paid state.
 */
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient, GetCommand, QueryCommand, UpdateCommand,
} from '@aws-sdk/lib-dynamodb';
import { DomainError } from '../../../src/lib/errors';

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const GROUP = process.env['GROUP_TABLE']!;
const MEMBERSHIP = process.env['MEMBERSHIP_TABLE']!;

interface AppSyncEvent {
  arguments: { groupId: string; userId: string; paid: boolean };
  identity: { sub: string };
}

interface Response {
  ok: boolean;
  message: string;
  paidAt: string | null;
}

export async function handler(event: AppSyncEvent): Promise<Response> {
  const caller = event.identity.sub;
  const { groupId, userId, paid } = event.arguments;

  const groupRes = await ddb.send(new GetCommand({
    TableName: GROUP,
    Key: { id: groupId },
  }));
  const group = groupRes.Item as { id: string; adminUserId: string } | undefined;
  if (!group) {
    throw new DomainError('GROUP_NOT_FOUND');
  }

  if (group.adminUserId !== caller) {
    throw new DomainError('ENTRY_FEE_NOT_GROUP_ADMIN');
  }

  // Locate the Membership row via the membersByGroup GSI then filter in
  // memory by userId. Identical pattern to remove-member.handler.ts.
  const memQ = await ddb.send(new QueryCommand({
    TableName: MEMBERSHIP,
    IndexName: 'membersByGroup',
    KeyConditionExpression: 'groupId = :g',
    ExpressionAttributeValues: { ':g': groupId },
  }));
  const members = (memQ.Items ?? []) as Array<{ id: string; userId: string }>;
  const mem = members.find((m) => m.userId === userId);
  if (!mem) {
    return { ok: false, message: 'El usuario no es miembro de este grupo', paidAt: null };
  }

  const paidAt = paid ? new Date().toISOString() : null;
  await ddb.send(new UpdateCommand({
    TableName: MEMBERSHIP,
    Key: { id: mem.id },
    UpdateExpression: 'SET entryFeePaidAt = :v, updatedAt = :u',
    ExpressionAttributeValues: {
      ':v': paidAt,
      ':u': new Date().toISOString(),
    },
  }));

  return {
    ok: true,
    message: paid ? 'Cuota marcada como pagada' : 'Marca de pago retirada',
    paidAt,
  };
}
```

- [ ] **Step 5: Register the mutation in the schema**

Edit `polla-backend/amplify/data/resource.ts`:

1. At the top of the file, after the other function imports, add:

```ts
import { markEntryFeePaid } from '../functions/mark-entry-fee-paid/resource';
```

2. Inside the `a.schema({...})` block, immediately after the `removeMember:` mutation definition (around line 855), add:

```ts
  markEntryFeePaid: a
    .mutation()
    .arguments({
      groupId: a.id().required(),
      userId: a.id().required(),
      paid: a.boolean().required(),
    })
    .returns(a.customType({
      ok: a.boolean().required(),
      message: a.string().required(),
      paidAt: a.datetime(),
    }))
    .authorization((allow) => [allow.authenticated()])
    .handler(a.handler.function(markEntryFeePaid)),
```

- [ ] **Step 6: Run the test to verify it passes**

```
npm test -- tests/unit/mark-entry-fee-paid.test.ts
```

Expected: PASS — all 6 tests pass.

- [ ] **Step 7: Run the full suite to verify no regression**

```
npm test
```

Expected: all tests pass.

- [ ] **Step 8: Commit**

```bash
git add amplify/functions/mark-entry-fee-paid/ amplify/data/resource.ts tests/unit/mark-entry-fee-paid.test.ts
git commit -m "feat(mark-entry-fee-paid): new admin-only mutation

Toggles entryFeePaidAt on a Membership row. Validates caller is the
adminUserId of the target group (NOT Cognito admins group). Both paid=true
and paid=false flows supported (un-mark preserves history for off/on
toggles of group.entryFeeEnabled).
"
```

---

### Task 5: Wire `mark-entry-fee-paid` Lambda in `backend.ts`

**Repo:** `polla-backend/`
**Files:**
- Modify: `amplify/backend.ts`

This task adds the Lambda to `defineBackend`, sets environment variables, grants table access, and grants index Query permission.

- [ ] **Step 1: Add import at the top of `backend.ts`**

After the existing import block (after `import { removeMember } from './functions/remove-member/resource';`), add:

```ts
import { markEntryFeePaid } from './functions/mark-entry-fee-paid/resource';
```

- [ ] **Step 2: Add to `defineBackend` map**

Inside the `defineBackend({...})` block, add `markEntryFeePaid,` after `removeMember,`:

```ts
const backend = defineBackend({
  // ...all existing entries...
  removeMember,
  markEntryFeePaid,
});
```

- [ ] **Step 3: Add wiring after the `remove-member` wiring block**

After the existing block that wires `remove-member` (after the line `grantIndexQuery(membershipTable, backend.removeMember.resources.lambda);` around line 531), add:

```ts
// mark-entry-fee-paid: reads Group; reads Membership.membersByGroup;
// updates Membership row. Caller must be the group's adminUserId.
backend.markEntryFeePaid.addEnvironment('GROUP_TABLE', groupTable.tableName);
backend.markEntryFeePaid.addEnvironment('MEMBERSHIP_TABLE', membershipTable.tableName);
groupTable.grantReadData(backend.markEntryFeePaid.resources.lambda);
membershipTable.grantReadWriteData(backend.markEntryFeePaid.resources.lambda);
grantIndexQuery(membershipTable, backend.markEntryFeePaid.resources.lambda);
```

- [ ] **Step 4: Typecheck**

```
npm run typecheck
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add amplify/backend.ts
git commit -m "feat(backend): wire mark-entry-fee-paid Lambda

Environment vars + read on Group + readWrite on Membership + grantIndexQuery
for Membership.membersByGroup GSI (same pattern as remove-member).
"
```

- [ ] **Step 6: (Optional manual smoke if you have AWS sandbox)** Run `npx ampx sandbox --profile polla` and exercise the flow via the GraphQL playground. NOT required for plan completion — deferred to integration smoke at end of feature.

---

## Phase 2 — Frontend API layer

Work in `polla-app/`. From here on, all tasks are in the Angular app.

---

### Task 6: Extend `ApiService` + domain errors map

**Repo:** `polla-app/`
**Files:**
- Modify: `src/app/core/notifications/domain-errors.ts`
- Modify: `src/app/core/api/api.service.ts` — extend `createGroup` signature, extend `updateGroup` types, add `markEntryFeePaid` method

This task is a thin glue layer. No new tests — methods are 1:1 wrappers around `apiClient.mutations.X` and are exercised by the component tests that come next.

- [ ] **Step 1: Add 3 domain-error mappings**

Open `src/app/core/notifications/domain-errors.ts`. Locate the map that converts error codes to Spanish user messages (it is typically a `Record<string, string>` or a `switch` statement). Add three entries:

```ts
ENTRY_FEE_INSTRUCTIONS_REQUIRED: 'Las instrucciones son obligatorias si activás la cuota.',
ENTRY_FEE_INSTRUCTIONS_TOO_LONG: 'Las instrucciones no pueden superar los 500 caracteres.',
ENTRY_FEE_NOT_GROUP_ADMIN: 'Solo el admin del grupo puede marcar cuotas.',
```

If the file uses a `switch`, add the three `case` entries before the `default:` clause:

```ts
case 'ENTRY_FEE_INSTRUCTIONS_REQUIRED':
  return 'Las instrucciones son obligatorias si activás la cuota.';
case 'ENTRY_FEE_INSTRUCTIONS_TOO_LONG':
  return 'Las instrucciones no pueden superar los 500 caracteres.';
case 'ENTRY_FEE_NOT_GROUP_ADMIN':
  return 'Solo el admin del grupo puede marcar cuotas.';
```

Open the file first to determine the shape; the test for the existing pattern is easy — grep for `INVALID_MODE` or `ALREADY_MEMBER` to see the style.

- [ ] **Step 2: Extend `createGroup` input type in `api.service.ts`**

Edit `src/app/core/api/api.service.ts` around line 335-380. Replace the two `createGroup` signatures and the implementation with the following expanded versions. Keep the rest of the file untouched.

```ts
  // Two signatures: nuevo input-object (preferido, soporta comodinesEnabled + entryFee*)
  // y legacy posicional (para callers viejos que aún no migran). Ambos
  // delegan en el mismo path.
  createGroup(input: {
    name: string;
    tournamentId: string;
    mode: 'SIMPLE' | 'COMPLETE';
    description?: string;
    imageKey?: string;
    comodinesEnabled?: boolean;
    entryFeeEnabled?: boolean;
    entryFeeInstructions?: string;
  }): ReturnType<typeof apiClient.mutations.createGroup>;
  createGroup(
    name: string,
    tournamentId: string,
    mode: 'SIMPLE' | 'COMPLETE',
    description?: string,
    imageKey?: string,
  ): ReturnType<typeof apiClient.mutations.createGroup>;
  createGroup(
    a: string | {
      name: string;
      tournamentId: string;
      mode: 'SIMPLE' | 'COMPLETE';
      description?: string;
      imageKey?: string;
      comodinesEnabled?: boolean;
      entryFeeEnabled?: boolean;
      entryFeeInstructions?: string;
    },
    tournamentId?: string,
    mode?: 'SIMPLE' | 'COMPLETE',
    description?: string,
    imageKey?: string,
  ) {
    const input = typeof a === 'string'
      ? { name: a, tournamentId: tournamentId!, mode: mode!, description, imageKey }
      : a;
    // Cast as never until amplify regenerates types after the schema deploy.
    return apiClient.mutations.createGroup({
      name: input.name,
      tournamentId: input.tournamentId,
      mode: input.mode,
      description: input.description ?? null,
      imageKey: input.imageKey ?? null,
      ...('comodinesEnabled' in input && input.comodinesEnabled !== undefined
        ? { comodinesEnabled: input.comodinesEnabled }
        : {}),
      ...('entryFeeEnabled' in input && input.entryFeeEnabled !== undefined
        ? { entryFeeEnabled: input.entryFeeEnabled }
        : {}),
      ...('entryFeeInstructions' in input && input.entryFeeInstructions !== undefined
        ? { entryFeeInstructions: input.entryFeeInstructions }
        : {}),
    } as never);
  }
```

- [ ] **Step 3: Extend `updateGroup` to support entryFee fields**

In the same file, locate the existing `updateGroup` method (around line 381). Replace it with:

```ts
  updateGroup(input: {
    id: string;
    name?: string;
    description?: string | null;
    imageKey?: string | null;
    entryFeeEnabled?: boolean;
    entryFeeInstructions?: string | null;
  }) {
    return apiClient.models.Group.update(input as never);
  }
```

- [ ] **Step 4: Add `markEntryFeePaid` method**

In `api.service.ts`, find a logical neighbour — right below the existing `joinGroup(code: string)` method or right below the existing `deleteGroup` method. Add:

```ts
  /** Admin-only: mark a member's entry fee paid (paid=true) or revert it
   *  (paid=false). Validated server-side against Group.adminUserId. */
  markEntryFeePaid(input: { groupId: string; userId: string; paid: boolean }) {
    return apiClient.mutations.markEntryFeePaid(input as never);
  }
```

- [ ] **Step 5: Typecheck**

```
npm run build -- --configuration=production
```

(Or `ng build` / `npm run typecheck` if a dedicated typecheck script exists. The point is to confirm `apiClient.mutations.markEntryFeePaid` type does not exist yet from the un-deployed schema; the `as never` cast suppresses the type error. If a true typecheck script exists, prefer it.)

Expected: success. The `as never` casts intentionally bypass strict typing until the schema is regenerated post-deploy.

- [ ] **Step 6: Commit**

```bash
git add src/app/core/notifications/domain-errors.ts src/app/core/api/api.service.ts
git commit -m "feat(api): add entryFee surface to ApiService

createGroup accepts optional entryFeeEnabled + entryFeeInstructions.
updateGroup accepts optional entryFeeEnabled + entryFeeInstructions.
New markEntryFeePaid method calls the custom AppSync mutation.
domain-errors maps the 3 new server codes to Spanish messages.
"
```

---

## Phase 3 — Frontend UI: Create modal

---

### Task 7: Add entry-fee toggle + textarea to the Create Group modal

**Repo:** `polla-app/`
**Files:**
- Modify: `src/app/shared/layout/group-actions-modals.component.ts`
- Test: `src/app/shared/layout/group-actions-modals.component.spec.ts` (CREATE)

- [ ] **Step 1: Create the failing test file**

Create `polla-app/src/app/shared/layout/group-actions-modals.component.spec.ts`:

```ts
import { ComponentRef } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { GroupActionsModalsComponent } from './group-actions-modals.component';
import { GroupActionsService } from './group-actions.service';
import { ApiService } from '../../core/api/api.service';
import { AuthService } from '../../core/auth/auth.service';
import { ToastService } from '../../core/notifications/toast.service';
import { UserModesService } from '../../core/user/user-modes.service';

describe('GroupActionsModalsComponent — create with entry fee', () => {
  let component: GroupActionsModalsComponent;
  let apiMock: { createGroup: jest.Mock; joinGroup: jest.Mock };
  let toastMock: { success: jest.Mock; error: jest.Mock };

  beforeEach(() => {
    apiMock = {
      createGroup: jest.fn().mockResolvedValue({ data: { id: 'g1', joinCode: 'ABC123' } }),
      joinGroup: jest.fn().mockResolvedValue({ data: { id: 'g1' } }),
    };
    toastMock = { success: jest.fn(), error: jest.fn() };
    TestBed.configureTestingModule({
      imports: [GroupActionsModalsComponent],
      providers: [
        provideRouter([]),
        { provide: GroupActionsService, useValue: { closeAll: jest.fn(), createOpen: () => true, joinOpen: () => false } },
        { provide: ApiService, useValue: apiMock },
        { provide: AuthService, useValue: { meSub: () => 'admin-sub' } },
        { provide: ToastService, useValue: toastMock },
        { provide: UserModesService, useValue: { refresh: jest.fn().mockResolvedValue(undefined) } },
      ],
    });
    const ref: ComponentRef<GroupActionsModalsComponent> = TestBed.createComponent(GroupActionsModalsComponent).componentRef;
    component = ref.instance;
  });

  it('entry-fee toggle defaults to off', () => {
    expect(component.entryFeeEnabled()).toBe(false);
  });

  it('submit with toggle off does not include entryFee args in payload', async () => {
    component.name = 'Polla';
    component.mode.set('COMPLETE');
    component.entryFeeEnabled.set(false);
    await component.submitCreate();
    expect(apiMock.createGroup).toHaveBeenCalledTimes(1);
    const payload = apiMock.createGroup.mock.calls[0][0] as Record<string, unknown>;
    expect(payload['entryFeeEnabled']).toBeUndefined();
    expect(payload['entryFeeInstructions']).toBeUndefined();
  });

  it('submit with toggle on + empty instructions: sets inline error, does not call API', async () => {
    component.name = 'Polla';
    component.mode.set('COMPLETE');
    component.entryFeeEnabled.set(true);
    component.entryFeeInstructions = '   ';
    await component.submitCreate();
    expect(apiMock.createGroup).not.toHaveBeenCalled();
    expect(component.entryFeeError()).toBe('Las instrucciones son obligatorias si activás la cuota.');
  });

  it('submit with toggle on + valid instructions: payload includes both fields, trimmed', async () => {
    component.name = 'Polla';
    component.mode.set('COMPLETE');
    component.entryFeeEnabled.set(true);
    component.entryFeeInstructions = '  Depositar a XXX  ';
    await component.submitCreate();
    expect(apiMock.createGroup).toHaveBeenCalledTimes(1);
    const payload = apiMock.createGroup.mock.calls[0][0] as Record<string, unknown>;
    expect(payload['entryFeeEnabled']).toBe(true);
    expect(payload['entryFeeInstructions']).toBe('Depositar a XXX');
  });

  it('reset clears entry-fee state after successful create', async () => {
    component.name = 'Polla';
    component.mode.set('COMPLETE');
    component.entryFeeEnabled.set(true);
    component.entryFeeInstructions = 'Depositar a XXX';
    await component.submitCreate();
    expect(component.entryFeeEnabled()).toBe(false);
    expect(component.entryFeeInstructions).toBe('');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```
npm test -- --testPathPattern='group-actions-modals.component.spec' --watch=false
```

Expected: FAIL — `component.entryFeeEnabled`, `component.entryFeeInstructions`, `component.entryFeeError` do not exist.

- [ ] **Step 3: Add state to the component**

Edit `polla-app/src/app/shared/layout/group-actions-modals.component.ts`. Inside the `GroupActionsModalsComponent` class, after the existing `comodinesEnabled = signal(true);` line (around line 253), add:

```ts
  entryFeeEnabled = signal(false);
  entryFeeInstructions = '';
  entryFeeError = signal<string | null>(null);
```

- [ ] **Step 4: Wire the validation into `submitCreate`**

In the same file, locate `submitCreate()` (around line 286). Replace its body with the updated version:

```ts
  async submitCreate() {
    const name = this.name.trim();
    if (!name || this.loading()) return;
    this.error.set(null);
    this.entryFeeError.set(null);

    // Entry-fee validation (client-side mirror of the handler rules so the
    // user sees the inline error before we hit the network).
    let feeInstructionsTrimmed: string | undefined;
    if (this.entryFeeEnabled()) {
      feeInstructionsTrimmed = this.entryFeeInstructions.trim();
      if (feeInstructionsTrimmed.length === 0) {
        this.entryFeeError.set('Las instrucciones son obligatorias si activás la cuota.');
        return;
      }
      if (feeInstructionsTrimmed.length > 500) {
        this.entryFeeError.set('Las instrucciones no pueden superar los 500 caracteres.');
        return;
      }
    }

    this.loading.set(true);
    try {
      const mode = this.mode();
      const res = await this.api.createGroup({
        name,
        tournamentId: TOURNAMENT_ID,
        mode,
        description: this.description.trim() || undefined,
        ...(mode === 'COMPLETE' ? { comodinesEnabled: this.comodinesEnabled() } : {}),
        ...(this.entryFeeEnabled() ? {
          entryFeeEnabled: true,
          entryFeeInstructions: feeInstructionsTrimmed,
        } : {}),
      });
      const data = (res as { data?: { id?: string } | null })?.data;
      if (!data?.id) {
        this.error.set('No se pudo crear el grupo. Intenta de nuevo.');
        return;
      }
      this.toast.success(`Grupo "${name}" creado`);
      this.svc.closeAll();
      this.resetCreate();
      await this.refreshUserModes();
      void this.router.navigate(['/groups', data.id]);
    } catch (e) {
      this.error.set(humanizeError(e));
    } finally {
      this.loading.set(false);
    }
  }
```

- [ ] **Step 5: Extend `resetCreate` to clear the new fields**

Locate `resetCreate()` (around line 271). Replace with:

```ts
  private resetCreate() {
    this.name = '';
    this.description = '';
    this.mode.set('COMPLETE');
    this.comodinesEnabled.set(true);
    this.entryFeeEnabled.set(false);
    this.entryFeeInstructions = '';
    this.entryFeeError.set(null);
    this.error.set(null);
  }
```

- [ ] **Step 6: Add the toggle + textarea to the template**

Locate the existing comodines `<label class="check-row">` block in the template (it wraps a checkbox that binds to `comodinesEnabled`). Right AFTER its closing `</label>`, BEFORE the next `<div class="modal-error">` if any, insert the entry-fee block:

```html
        <label class="check-row" [style.margin-top.px]="12">
          <input type="checkbox"
                 [checked]="entryFeeEnabled()"
                 (change)="entryFeeEnabled.set($any($event.target).checked)">
          <span>
            <strong>Cobrar cuota de ingreso al grupo</strong><br>
            <small style="color: var(--color-text-muted);">
              Si la activás, cada miembro verá un recordatorio hasta que lo marques como pagado.
            </small>
          </span>
        </label>

        @if (entryFeeEnabled()) {
          <div class="form-card__field" style="margin-top: 12px;">
            <label class="form-card__label" for="grp-entry-fee">Instrucciones de pago</label>
            <textarea id="grp-entry-fee" name="entryFeeInstructions"
                      class="auth-input"
                      rows="4"
                      maxlength="500"
                      [(ngModel)]="entryFeeInstructions"
                      placeholder="Ej: Depositar $20 USD a la cuenta XXXXXX y enviar el comprobante por WhatsApp a +593 XXX-XXXX."></textarea>
            <div class="form-card__hint-row">
              <small style="color: var(--color-text-muted);">Hasta 500 caracteres. Los saltos de línea se respetan.</small>
              <small [style.color]="entryFeeInstructions.length >= 450 ? 'var(--wf-warn)' : 'var(--color-text-muted)'">
                {{ entryFeeInstructions.length }}/500
              </small>
            </div>
            @if (entryFeeError(); as err) {
              <p class="modal-error" role="alert" style="margin-top: 8px;">{{ err }}</p>
            }
          </div>
        }
```

(If the existing template uses different class names for hints or labels, follow whichever pattern is already used for the `description` field in the same component — adapt the class names to match.)

- [ ] **Step 7: Re-run the tests**

```
npm test -- --testPathPattern='group-actions-modals.component.spec' --watch=false
```

Expected: PASS — all 5 tests pass.

- [ ] **Step 8: Commit**

```bash
git add src/app/shared/layout/group-actions-modals.component.ts src/app/shared/layout/group-actions-modals.component.spec.ts
git commit -m "feat(create-group-modal): entry-fee toggle and textarea

New toggle in the create modal reveals a 500-char textarea for payment
instructions. Submit validates locally (required + length) and forwards
both fields to api.createGroup. Reset clears the state.
"
```

---

## Phase 4 — Frontend UI: Edit Group

---

### Task 8: Add Cuota block to Edit Group screen + auto-paid on toggle-on

**Repo:** `polla-app/`
**Files:**
- Modify: `src/app/features/groups/group-edit.component.ts`
- Test: `src/app/features/groups/group-edit.component.spec.ts` (CREATE)

- [ ] **Step 1: Create the failing test file**

Create `polla-app/src/app/features/groups/group-edit.component.spec.ts`:

```ts
import { TestBed, ComponentFixture } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { GroupEditComponent } from './group-edit.component';
import { ApiService } from '../../core/api/api.service';
import { AuthService } from '../../core/auth/auth.service';
import { ToastService } from '../../core/notifications/toast.service';

describe('GroupEditComponent — entry fee', () => {
  let fixture: ComponentFixture<GroupEditComponent>;
  let component: GroupEditComponent;
  let apiMock: { updateGroup: jest.Mock; markEntryFeePaid: jest.Mock; getGroup: jest.Mock };

  beforeEach(() => {
    apiMock = {
      updateGroup: jest.fn().mockResolvedValue({ data: {} }),
      markEntryFeePaid: jest.fn().mockResolvedValue({ data: { ok: true, message: 'ok', paidAt: '2026-05-29T00:00:00Z' } }),
      getGroup: jest.fn().mockResolvedValue({ data: {
        id: 'g1', name: 'Polla', description: null, imageKey: null,
        adminUserId: 'admin-sub', mode: 'COMPLETE', comodinesEnabled: true,
        entryFeeEnabled: false, entryFeeInstructions: null,
      } }),
    };
    TestBed.configureTestingModule({
      imports: [GroupEditComponent],
      providers: [
        provideRouter([]),
        { provide: ApiService, useValue: apiMock },
        { provide: AuthService, useValue: { meSub: () => 'admin-sub' } },
        { provide: ToastService, useValue: { success: jest.fn(), error: jest.fn() } },
      ],
    });
    fixture = TestBed.createComponent(GroupEditComponent);
    component = fixture.componentInstance;
    component.id = 'g1';
  });

  it('loads existing group with entry fee off: toggle stays off', async () => {
    await component.ngOnInit();
    expect(component.entryFeeEnabled()).toBe(false);
    expect(component.entryFeeInstructions).toBe('');
  });

  it('loads existing group with entry fee on: toggle on, textarea populated', async () => {
    apiMock.getGroup.mockResolvedValueOnce({ data: {
      id: 'g1', name: 'Polla', description: null, imageKey: null,
      adminUserId: 'admin-sub', mode: 'COMPLETE', comodinesEnabled: true,
      entryFeeEnabled: true, entryFeeInstructions: 'Depositar a XXX',
    } });
    await component.ngOnInit();
    expect(component.entryFeeEnabled()).toBe(true);
    expect(component.entryFeeInstructions).toBe('Depositar a XXX');
  });

  it('transition OFF → ON: calls updateGroup then markEntryFeePaid for self', async () => {
    await component.ngOnInit();
    component.entryFeeEnabled.set(true);
    component.entryFeeInstructions = 'Depositar a XXX';
    await component.save();

    expect(apiMock.updateGroup).toHaveBeenCalledTimes(1);
    const updatePayload = apiMock.updateGroup.mock.calls[0][0] as Record<string, unknown>;
    expect(updatePayload['entryFeeEnabled']).toBe(true);
    expect(updatePayload['entryFeeInstructions']).toBe('Depositar a XXX');

    expect(apiMock.markEntryFeePaid).toHaveBeenCalledTimes(1);
    expect(apiMock.markEntryFeePaid).toHaveBeenCalledWith({
      groupId: 'g1', userId: 'admin-sub', paid: true,
    });
  });

  it('transition ON → OFF: only updateGroup, no markEntryFeePaid', async () => {
    apiMock.getGroup.mockResolvedValueOnce({ data: {
      id: 'g1', name: 'Polla', description: null, imageKey: null,
      adminUserId: 'admin-sub', mode: 'COMPLETE', comodinesEnabled: true,
      entryFeeEnabled: true, entryFeeInstructions: 'Depositar a XXX',
    } });
    await component.ngOnInit();
    component.entryFeeEnabled.set(false);
    await component.save();

    expect(apiMock.updateGroup).toHaveBeenCalledTimes(1);
    const updatePayload = apiMock.updateGroup.mock.calls[0][0] as Record<string, unknown>;
    expect(updatePayload['entryFeeEnabled']).toBe(false);
    expect(apiMock.markEntryFeePaid).not.toHaveBeenCalled();
  });

  it('transition ON → ON (instructions changed): only updateGroup', async () => {
    apiMock.getGroup.mockResolvedValueOnce({ data: {
      id: 'g1', name: 'Polla', description: null, imageKey: null,
      adminUserId: 'admin-sub', mode: 'COMPLETE', comodinesEnabled: true,
      entryFeeEnabled: true, entryFeeInstructions: 'Old text',
    } });
    await component.ngOnInit();
    component.entryFeeInstructions = 'New text';
    await component.save();

    expect(apiMock.updateGroup).toHaveBeenCalledTimes(1);
    const updatePayload = apiMock.updateGroup.mock.calls[0][0] as Record<string, unknown>;
    expect(updatePayload['entryFeeInstructions']).toBe('New text');
    expect(apiMock.markEntryFeePaid).not.toHaveBeenCalled();
  });

  it('save with toggle on but empty instructions: inline error, no API call', async () => {
    await component.ngOnInit();
    component.entryFeeEnabled.set(true);
    component.entryFeeInstructions = '   ';
    await component.save();

    expect(apiMock.updateGroup).not.toHaveBeenCalled();
    expect(component.entryFeeError()).toBe('Las instrucciones son obligatorias si activás la cuota.');
  });

  it('dirty: returns true when entryFeeEnabled changes', async () => {
    await component.ngOnInit();
    expect(component.dirty()).toBe(false);
    component.entryFeeEnabled.set(true);
    expect(component.dirty()).toBe(true);
  });

  it('dirty: returns true when entryFeeInstructions changes', async () => {
    apiMock.getGroup.mockResolvedValueOnce({ data: {
      id: 'g1', name: 'Polla', description: null, imageKey: null,
      adminUserId: 'admin-sub', mode: 'COMPLETE', comodinesEnabled: true,
      entryFeeEnabled: true, entryFeeInstructions: 'Old',
    } });
    await component.ngOnInit();
    component.entryFeeInstructions = 'New';
    expect(component.dirty()).toBe(true);
  });
});
```

- [ ] **Step 2: Run the test to confirm failures**

```
npm test -- --testPathPattern='group-edit.component.spec' --watch=false
```

Expected: FAIL — `component.entryFeeEnabled`, `component.entryFeeInstructions`, `component.entryFeeError`, and the updated `dirty()`/`save()` behavior do not exist yet.

- [ ] **Step 3: Update the `GroupEdit` interface and component state**

Edit `polla-app/src/app/features/groups/group-edit.component.ts`. Find the `interface GroupEdit` block (around line 12) and extend it:

```ts
interface GroupEdit {
  id: string;
  name: string;
  description: string | null;
  imageKey: string | null;
  adminUserId: string;
  comodinesEnabled: boolean | null;
  entryFeeEnabled: boolean | null;
  entryFeeInstructions: string | null;
}
```

In the class body, after the existing component state for `name`, `description`, etc., add:

```ts
  entryFeeEnabled = signal(false);
  entryFeeInstructions = '';
  entryFeeError = signal<string | null>(null);

  /** Snapshot of entry-fee state at load time, used for dirty() and the
   *  OFF→ON transition detection in save(). */
  private originalEntryFeeEnabled = false;
  private originalEntryFeeInstructions = '';
```

- [ ] **Step 4: Populate on load**

Find the existing `ngOnInit` (where it sets `this.name = group.name`, etc.). After the line that sets the existing fields, add:

```ts
    const initialFeeEnabled = group.entryFeeEnabled === true;
    const initialFeeInstructions = group.entryFeeInstructions ?? '';
    this.entryFeeEnabled.set(initialFeeEnabled);
    this.entryFeeInstructions = initialFeeInstructions;
    this.originalEntryFeeEnabled = initialFeeEnabled;
    this.originalEntryFeeInstructions = initialFeeInstructions;
```

- [ ] **Step 5: Extend `dirty()`**

Locate the existing `dirty()` method (or the getter used by `DirtyAware`). Replace the body so it also considers entry-fee fields. The exact shape depends on how dirty is implemented; the additions are:

```ts
  dirty(): boolean {
    return this.name !== this.original.name
        || this.description !== (this.original.description ?? '')
        // ...keep any existing checks (image, comodines)...
        || this.entryFeeEnabled() !== this.originalEntryFeeEnabled
        || this.entryFeeInstructions !== this.originalEntryFeeInstructions;
  }
```

If the original file uses a different naming convention for the snapshot (e.g. `this.snapshot.name`), keep that pattern and mirror it for the new fields.

- [ ] **Step 6: Update `save()` to apply transitions**

Locate the existing `save()` method. Refactor so it:
1. Validates entry-fee instructions when toggle is on.
2. Calls `updateGroup` with the entry-fee fields.
3. Detects OFF→ON transition and calls `markEntryFeePaid` for self.

Replace `save()` with:

```ts
  async save() {
    if (this.loading()) return;
    this.error.set(null);
    this.entryFeeError.set(null);

    // Entry-fee validation, mirroring the handler rules.
    let feeInstructionsForPayload: string | null = null;
    if (this.entryFeeEnabled()) {
      const trimmed = this.entryFeeInstructions.trim();
      if (trimmed.length === 0) {
        this.entryFeeError.set('Las instrucciones son obligatorias si activás la cuota.');
        return;
      }
      if (trimmed.length > 500) {
        this.entryFeeError.set('Las instrucciones no pueden superar los 500 caracteres.');
        return;
      }
      feeInstructionsForPayload = trimmed;
    }

    this.loading.set(true);
    try {
      await this.api.updateGroup({
        id: this.id,
        name: this.name.trim(),
        description: this.description.trim() || null,
        imageKey: this.imageKey() || null,
        entryFeeEnabled: this.entryFeeEnabled(),
        entryFeeInstructions: feeInstructionsForPayload,
      });

      // Detect OFF → ON transition and auto-paid the admin via the
      // server-side mutation. The auth model does not allow the admin to
      // write Membership.entryFeePaidAt directly; markEntryFeePaid validates
      // adminUserId server-side.
      const wasOff = this.originalEntryFeeEnabled === false;
      const isOn = this.entryFeeEnabled() === true;
      if (wasOff && isOn) {
        const me = this.auth.meSub();
        if (me) {
          await this.api.markEntryFeePaid({ groupId: this.id, userId: me, paid: true });
        }
      }

      this.toast.success('Cambios guardados');
      // Refresh snapshot so dirty() returns false after save.
      this.originalEntryFeeEnabled = this.entryFeeEnabled();
      this.originalEntryFeeInstructions = this.entryFeeInstructions;
      // ...keep the existing post-save logic (navigation, etc.)...
    } catch (e) {
      this.error.set(humanizeError(e));
    } finally {
      this.loading.set(false);
    }
  }
```

(Preserve any post-save behavior already in the file, e.g. navigation back to `/groups/:id`. Just splice the entry-fee logic into the existing flow if it already exists.)

- [ ] **Step 7: Add the template block**

Locate the existing template inside `@Component({...})`. After the Prizes block (or wherever Premios ends), add a new `<section>`:

```html
          <div class="form-card__field" style="margin-top: 20px; padding-top: 20px; border-top: 1px solid var(--color-line);">
            <h2 class="form-card__title" style="margin-bottom: 8px;">Cuota de ingreso</h2>
            <label class="check-row">
              <input type="checkbox"
                     [checked]="entryFeeEnabled()"
                     (change)="entryFeeEnabled.set($any($event.target).checked)">
              <span>
                <strong>Cobrar cuota de ingreso al grupo</strong><br>
                <small style="color: var(--color-text-muted);">
                  Si la activás, los miembros sin pagar verán un recordatorio en la pantalla del grupo.
                </small>
              </span>
            </label>

            @if (entryFeeEnabled()) {
              <div class="form-card__field" style="margin-top: 12px;">
                <label class="form-card__label" for="edit-entry-fee">Instrucciones de pago</label>
                <textarea id="edit-entry-fee" name="entryFeeInstructions"
                          class="form-card__input"
                          rows="4"
                          maxlength="500"
                          [(ngModel)]="entryFeeInstructions"
                          placeholder="Ej: Depositar $20 USD a la cuenta XXXXXX y enviar el comprobante por WhatsApp a +593 XXX-XXXX."></textarea>
                <div class="form-card__hint-row">
                  <span class="form-card__hint">Hasta 500 caracteres. Los saltos de línea se respetan.</span>
                  <span class="form-card__counter"
                        [class.is-near-limit]="entryFeeInstructions.length >= 450">
                    {{ entryFeeInstructions.length }}/500
                  </span>
                </div>
                @if (entryFeeError(); as err) {
                  <p class="modal-error" role="alert" style="margin-top: 8px;">{{ err }}</p>
                }
              </div>
            }
          </div>
```

(Match the class names used by the surrounding form fields in the actual file. The shape above mirrors the existing `description` field.)

- [ ] **Step 8: Run tests**

```
npm test -- --testPathPattern='group-edit.component.spec' --watch=false
```

Expected: PASS — all 8 tests pass.

- [ ] **Step 9: Commit**

```bash
git add src/app/features/groups/group-edit.component.ts src/app/features/groups/group-edit.component.spec.ts
git commit -m "feat(group-edit): entry-fee block + transitions + dirty

Edit Group screen now exposes the entryFee toggle + textarea. Save():
- OFF → ON: updateGroup + markEntryFeePaid({ paid: true }) for the admin.
- ON → OFF: updateGroup only (preserves per-member paid state for re-on).
- ON → ON (instructions changed): updateGroup only.

dirty() includes the two new fields so the unsaved-changes confirm dialog
fires correctly.
"
```

---

## Phase 5 — Frontend UI: Group Detail

This phase is split into two tasks because the changes are large (members table column + floating reminder + modal).

---

### Task 9: Add admin-only Cuota column to the members table

**Repo:** `polla-app/`
**Files:**
- Modify: `src/app/features/groups/group-detail.component.ts`
- Test: `src/app/features/groups/group-detail.component.spec.ts` (CREATE)

- [ ] **Step 1: Create the failing test file**

Create `polla-app/src/app/features/groups/group-detail.component.spec.ts`:

```ts
import { TestBed, ComponentFixture } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { provideRouter } from '@angular/router';
import { GroupDetailComponent } from './group-detail.component';
import { ApiService } from '../../core/api/api.service';
import { AuthService } from '../../core/auth/auth.service';
import { ToastService } from '../../core/notifications/toast.service';

function loadGroupAdminWithFee() {
  return { data: {
    id: 'g1', name: 'Polla', adminUserId: 'admin-sub', mode: 'COMPLETE',
    description: null, imageKey: null, comodinesEnabled: true,
    entryFeeEnabled: true, entryFeeInstructions: 'Depositar a XXX',
  } };
}

function loadGroupMemberWithFee() {
  return loadGroupAdminWithFee();  // group payload identical
}

describe('GroupDetailComponent — entry fee column (admin)', () => {
  let fixture: ComponentFixture<GroupDetailComponent>;
  let component: GroupDetailComponent;
  let apiMock: {
    getGroup: jest.Mock;
    listMemberships: jest.Mock;
    leaderboard: jest.Mock;
    markEntryFeePaid: jest.Mock;
  };

  function build(callerSub: string) {
    apiMock = {
      getGroup: jest.fn().mockResolvedValue(loadGroupAdminWithFee()),
      listMemberships: jest.fn().mockResolvedValue({ data: [
        { id: 'm-admin', userId: 'admin-sub', isAdmin: true, joinedAt: '2026-01-01', entryFeePaidAt: '2026-01-01T00:00:00Z' },
        { id: 'm-other', userId: 'other-sub', isAdmin: false, joinedAt: '2026-01-02', entryFeePaidAt: null },
      ] }),
      leaderboard: jest.fn().mockResolvedValue({ data: [] }),
      markEntryFeePaid: jest.fn().mockResolvedValue({ data: { ok: true, message: 'ok', paidAt: '2026-05-29T00:00:00Z' } }),
    };
    TestBed.configureTestingModule({
      imports: [GroupDetailComponent],
      providers: [
        provideRouter([]),
        { provide: ApiService, useValue: apiMock },
        { provide: AuthService, useValue: { meSub: () => callerSub } },
        { provide: ToastService, useValue: { success: jest.fn(), error: jest.fn() } },
      ],
    });
    fixture = TestBed.createComponent(GroupDetailComponent);
    component = fixture.componentInstance;
    component.id = 'g1';
  }

  it('admin viewer: Cuota column header is rendered', async () => {
    build('admin-sub');
    await component.ngOnInit();
    fixture.detectChanges();
    const header = fixture.nativeElement.querySelector('th.cuota-col');
    expect(header).not.toBeNull();
  });

  it('non-admin viewer: Cuota column header is NOT rendered', async () => {
    build('other-sub');
    await component.ngOnInit();
    fixture.detectChanges();
    const header = fixture.nativeElement.querySelector('th.cuota-col');
    expect(header).toBeNull();
  });

  it('group with entryFeeEnabled=false: column not rendered even for admin', async () => {
    build('admin-sub');
    apiMock.getGroup.mockResolvedValueOnce({ data: {
      ...loadGroupAdminWithFee().data,
      entryFeeEnabled: false,
    } });
    await component.ngOnInit();
    fixture.detectChanges();
    const header = fixture.nativeElement.querySelector('th.cuota-col');
    expect(header).toBeNull();
  });

  it('admin clicks checkbox for unpaid member: markEntryFeePaid called with paid=true', async () => {
    build('admin-sub');
    await component.ngOnInit();
    fixture.detectChanges();

    await component.toggleEntryFeePaid('other-sub', false);

    expect(apiMock.markEntryFeePaid).toHaveBeenCalledWith({
      groupId: 'g1', userId: 'other-sub', paid: true,
    });
  });

  it('admin clicks checkbox for paid member: markEntryFeePaid called with paid=false', async () => {
    build('admin-sub');
    await component.ngOnInit();
    fixture.detectChanges();

    await component.toggleEntryFeePaid('other-sub', true);

    expect(apiMock.markEntryFeePaid).toHaveBeenCalledWith({
      groupId: 'g1', userId: 'other-sub', paid: false,
    });
  });

  it('admin own row: toggleEntryFeePaid is a no-op (does not call API)', async () => {
    build('admin-sub');
    await component.ngOnInit();
    fixture.detectChanges();

    await component.toggleEntryFeePaid('admin-sub', true);

    expect(apiMock.markEntryFeePaid).not.toHaveBeenCalled();
  });

  it('mutation fails: optimistic update reverts, toast.error called', async () => {
    build('admin-sub');
    apiMock.markEntryFeePaid.mockRejectedValueOnce(new Error('network'));
    await component.ngOnInit();
    fixture.detectChanges();

    const memberBefore = component.members().find((m) => m.userId === 'other-sub');
    const paidBefore = memberBefore?.entryFeePaidAt;

    await component.toggleEntryFeePaid('other-sub', false);

    const memberAfter = component.members().find((m) => m.userId === 'other-sub');
    expect(memberAfter?.entryFeePaidAt).toBe(paidBefore);
  });
});
```

- [ ] **Step 2: Run the test to confirm failures**

```
npm test -- --testPathPattern='group-detail.component.spec' --watch=false
```

Expected: FAIL — the component does not yet have `toggleEntryFeePaid`, `members()` signal does not include `entryFeePaidAt`, etc.

- [ ] **Step 3: Extend the member type loaded from the API**

Edit `polla-app/src/app/features/groups/group-detail.component.ts`. Find the existing local type that represents a row of the members table (likely a `interface MemberRow {...}` or inline type). Add `entryFeePaidAt: string | null` to it:

```ts
interface MemberRow {
  id: string;            // Membership row id
  userId: string;
  isAdmin: boolean;
  joinedAt: string;
  entryFeePaidAt: string | null;
  // ...existing fields (handle, avatar, points, etc.)...
}
```

- [ ] **Step 4: Update the data loading code**

Where the component currently loads memberships and maps them into the members table, propagate the new field. Look for the function that calls `apiClient.models.Membership.list({...})` or the equivalent helper on `ApiService`. After mapping, ensure each member row carries the timestamp:

```ts
const memberRows: MemberRow[] = (membershipsRes.data ?? []).map((m: { id: string; userId: string; isAdmin: boolean; joinedAt: string; entryFeePaidAt: string | null }) => ({
  id: m.id,
  userId: m.userId,
  isAdmin: m.isAdmin,
  joinedAt: m.joinedAt,
  entryFeePaidAt: m.entryFeePaidAt ?? null,
  // ...spread the other existing fields exactly as before...
}));
this.members.set(memberRows);
```

- [ ] **Step 5: Add the `toggleEntryFeePaid` method**

In the component class, add:

```ts
  /** Admin toggles a member's entry-fee paid state. Optimistic update with
   *  rollback on failure. No-op on the admin's own row (use Editar grupo to
   *  turn off the feature entirely). */
  async toggleEntryFeePaid(userId: string, currentlyPaid: boolean): Promise<void> {
    if (userId === this.auth.meSub()) return;
    if (!this.isAdmin()) return;

    const newPaidAt = currentlyPaid ? null : new Date().toISOString();
    const prev = this.members();
    const next = prev.map((m) => m.userId === userId ? { ...m, entryFeePaidAt: newPaidAt } : m);
    this.members.set(next);

    try {
      await this.api.markEntryFeePaid({ groupId: this.id, userId, paid: !currentlyPaid });
    } catch (e) {
      this.members.set(prev);  // rollback
      this.toast.error(humanizeError(e));
    }
  }
```

If `humanizeError` is not already imported in this file, add the existing import (look at how `group-edit.component.ts` imports it from `../../core/notifications/domain-errors`).

- [ ] **Step 6: Render the column in the template (admin only)**

Find the existing members table inside the template. Locate the `<thead>` row and append a column header guarded by `@if (isAdmin() && group()?.entryFeeEnabled)`:

```html
              @if (isAdmin() && group()?.entryFeeEnabled) {
                <th class="cuota-col" scope="col">Cuota</th>
              }
```

Then locate the row template inside `<tbody>` (the `@for (m of members(); ...)`) and append a `<td>`:

```html
              @if (isAdmin() && group()?.entryFeeEnabled) {
                <td class="cuota-col">
                  @if (m.userId === auth.meSub()) {
                    <span class="cuota-tag cuota-tag--paid" aria-label="Cuota pagada">
                      <app-icon name="check" [decorative]="true" [size]="14"></app-icon>
                      Pagada
                    </span>
                  } @else {
                    <button type="button"
                            class="cuota-checkbox"
                            [class.is-paid]="m.entryFeePaidAt !== null"
                            [attr.aria-pressed]="m.entryFeePaidAt !== null"
                            [attr.aria-label]="m.entryFeePaidAt !== null ? 'Quitar marca de pago' : 'Marcar como pagada'"
                            [title]="m.entryFeePaidAt !== null ? 'Quitar marca' : 'Marcar como pagada'"
                            (click)="toggleEntryFeePaid(m.userId, m.entryFeePaidAt !== null)">
                      @if (m.entryFeePaidAt !== null) {
                        <app-icon name="check" [decorative]="true" [size]="14"></app-icon>
                        Pagada
                      } @else {
                        Marcar pagada
                      }
                    </button>
                  }
                </td>
              }
```

If `<app-icon>` is not yet imported by this component, add it to the standalone `imports: [...]` array and import the component:

```ts
import { IconComponent } from '../../shared/ui/icon/icon.component';
// ...inside @Component({ imports: [...], ... })
imports: [..., IconComponent],
```

(The icon name `check` should already be registered in `app.config.ts` `provideLucideIcons(...)`. Grep for `provideLucideIcons` to confirm; if not, add `{ ...LucideCheck.icon, name: 'check' }` to the list.)

- [ ] **Step 7: Add styles to the component (or its scss)**

In the component's `styles: [...]` array (or `styleUrls`), add:

```css
    .cuota-col { white-space: nowrap; min-width: 132px; }
    .cuota-tag {
      display: inline-flex; align-items: center; gap: 6px;
      padding: 4px 10px; border-radius: 999px; font-size: 13px;
      background: rgba(2, 204, 116, 0.12); color: var(--color-primary-green);
    }
    .cuota-tag--paid { font-weight: 500; }
    .cuota-checkbox {
      display: inline-flex; align-items: center; gap: 6px;
      min-height: 44px; padding: 6px 12px;
      border: 1px solid var(--color-line); border-radius: 999px;
      background: transparent; color: var(--color-text-muted);
      font-size: 13px; cursor: pointer;
      transition: background .15s, border-color .15s, color .15s;
    }
    .cuota-checkbox:hover { border-color: var(--color-primary-green); color: var(--color-text); }
    .cuota-checkbox.is-paid {
      background: rgba(2, 204, 116, 0.12);
      color: var(--color-primary-green);
      border-color: rgba(2, 204, 116, 0.4);
    }
    .cuota-checkbox:focus-visible {
      outline: 2px solid var(--color-primary-green);
      outline-offset: 2px;
    }
```

- [ ] **Step 8: Run the tests**

```
npm test -- --testPathPattern='group-detail.component.spec' --watch=false
```

Expected: PASS — all 7 tests pass.

- [ ] **Step 9: Commit**

```bash
git add src/app/features/groups/group-detail.component.ts src/app/features/groups/group-detail.component.spec.ts
git commit -m "feat(group-detail): admin Cuota column with optimistic toggle

Members table gains a Cuota column visible only when isAdmin() &&
group.entryFeeEnabled. Admin can mark/unmark via a 44px-min-height
button; updates are optimistic with rollback + toast on failure.
Admin's own row renders a fixed 'Pagada' tag (no toggle).
"
```

---

### Task 10: Floating reminder + instructions modal + refetch on focus

**Repo:** `polla-app/`
**Files:**
- Modify: `src/app/features/groups/group-detail.component.ts`
- Modify: `src/app/features/groups/group-detail.component.spec.ts` (extend the existing spec file from Task 9 with the reminder tests)

- [ ] **Step 1: Add the failing tests for the reminder + modal**

Append to `src/app/features/groups/group-detail.component.spec.ts` (after the existing `describe` block from Task 9):

```ts
describe('GroupDetailComponent — floating reminder', () => {
  let fixture: ComponentFixture<GroupDetailComponent>;
  let component: GroupDetailComponent;
  let apiMock: {
    getGroup: jest.Mock;
    listMemberships: jest.Mock;
    leaderboard: jest.Mock;
    markEntryFeePaid: jest.Mock;
  };

  function build(callerSub: string, callerPaid: boolean, feeEnabled: boolean) {
    apiMock = {
      getGroup: jest.fn().mockResolvedValue({ data: {
        id: 'g1', name: 'Polla', adminUserId: 'admin-sub', mode: 'COMPLETE',
        description: null, imageKey: null, comodinesEnabled: true,
        entryFeeEnabled: feeEnabled,
        entryFeeInstructions: feeEnabled ? 'Depositar $20\nA cuenta XXX' : null,
      } }),
      listMemberships: jest.fn().mockResolvedValue({ data: [
        { id: 'm-admin', userId: 'admin-sub', isAdmin: true, joinedAt: '2026-01-01', entryFeePaidAt: feeEnabled ? '2026-01-01T00:00:00Z' : null },
        { id: 'm-other', userId: 'other-sub', isAdmin: false, joinedAt: '2026-01-02', entryFeePaidAt: callerPaid ? '2026-01-03T00:00:00Z' : null },
      ] }),
      leaderboard: jest.fn().mockResolvedValue({ data: [] }),
      markEntryFeePaid: jest.fn(),
    };
    TestBed.configureTestingModule({
      imports: [GroupDetailComponent],
      providers: [
        provideRouter([]),
        { provide: ApiService, useValue: apiMock },
        { provide: AuthService, useValue: { meSub: () => callerSub } },
        { provide: ToastService, useValue: { success: jest.fn(), error: jest.fn() } },
      ],
    });
    fixture = TestBed.createComponent(GroupDetailComponent);
    component = fixture.componentInstance;
    component.id = 'g1';
  }

  it('member is unpaid + fee enabled: showEntryFeeReminder() === true', async () => {
    build('other-sub', false, true);
    await component.ngOnInit();
    expect(component.showEntryFeeReminder()).toBe(true);
  });

  it('member is paid: showEntryFeeReminder() === false', async () => {
    build('other-sub', true, true);
    await component.ngOnInit();
    expect(component.showEntryFeeReminder()).toBe(false);
  });

  it('fee disabled at group level: showEntryFeeReminder() === false', async () => {
    build('other-sub', false, false);
    await component.ngOnInit();
    expect(component.showEntryFeeReminder()).toBe(false);
  });

  it('admin (own row paid): showEntryFeeReminder() === false', async () => {
    build('admin-sub', true, true);
    await component.ngOnInit();
    expect(component.showEntryFeeReminder()).toBe(false);
  });

  it('reminder renders in DOM when showEntryFeeReminder() is true', async () => {
    build('other-sub', false, true);
    await component.ngOnInit();
    fixture.detectChanges();
    const reminder = fixture.nativeElement.querySelector('[data-testid="entry-fee-reminder"]');
    expect(reminder).not.toBeNull();
    expect(reminder.getAttribute('aria-label')).toContain('Cuota');
  });

  it('clicking reminder opens instructions modal', async () => {
    build('other-sub', false, true);
    await component.ngOnInit();
    fixture.detectChanges();
    component.openEntryFeeModal();
    fixture.detectChanges();
    const modal = fixture.nativeElement.querySelector('[data-testid="entry-fee-modal"]');
    expect(modal).not.toBeNull();
    expect(modal.textContent).toContain('Depositar $20');
    expect(modal.textContent).toContain('A cuenta XXX');
  });

  it('modal body uses white-space: pre-line so line breaks are preserved', async () => {
    build('other-sub', false, true);
    await component.ngOnInit();
    fixture.detectChanges();
    component.openEntryFeeModal();
    fixture.detectChanges();
    const body = fixture.nativeElement.querySelector('[data-testid="entry-fee-modal-body"]') as HTMLElement;
    const styles = window.getComputedStyle(body);
    expect(styles.whiteSpace).toBe('pre-line');
  });

  it('window focus triggers a refetch of membership data', async () => {
    build('other-sub', false, true);
    await component.ngOnInit();
    apiMock.listMemberships.mockClear();
    window.dispatchEvent(new Event('focus'));
    await Promise.resolve();
    expect(apiMock.listMemberships).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run the test to confirm failures**

```
npm test -- --testPathPattern='group-detail.component.spec' --watch=false
```

Expected: FAIL — `showEntryFeeReminder`, `openEntryFeeModal`, focus listener, etc. do not exist yet.

- [ ] **Step 3: Add the modal state and `showEntryFeeReminder` computed**

In `group-detail.component.ts`, inside the class, add:

```ts
  /** Local UI state: instructions modal open/closed. */
  entryFeeModalOpen = signal(false);

  /** True when the floating reminder should be visible for the active user. */
  showEntryFeeReminder = computed<boolean>(() => {
    const g = this.group();
    if (!g || !g.entryFeeEnabled) return false;
    const meSub = this.auth.meSub();
    if (!meSub) return false;
    const mine = this.members().find((m) => m.userId === meSub);
    if (!mine) return false;
    return mine.entryFeePaidAt === null;
  });

  openEntryFeeModal(): void { this.entryFeeModalOpen.set(true); }
  closeEntryFeeModal(): void { this.entryFeeModalOpen.set(false); }
```

(If `computed` is not already imported from `@angular/core`, add it to the import line.)

- [ ] **Step 4: Add focus listener**

Inside the component class, add a `@HostListener('window:focus')` method that triggers a refetch of the memberships. Find the existing private helper that loads memberships (e.g. `private async loadMembers()` or inline inside `ngOnInit`); if it is inline, refactor a slice into a method `refreshMemberships()` so it can be called from the focus handler:

```ts
  @HostListener('window:focus')
  onWindowFocus(): void {
    void this.refreshMemberships();
  }

  /** Refetch just the membership rows for this group. Called on window focus
   *  to pick up admin-side updates (paid/unpaid) without a full reload. */
  private async refreshMemberships(): Promise<void> {
    try {
      const res = await this.api.listMemberships(this.id);
      // map and set this.members exactly the same way as ngOnInit does.
      const rows: MemberRow[] = (res.data ?? []).map((m: { id: string; userId: string; isAdmin: boolean; joinedAt: string; entryFeePaidAt: string | null }) => ({
        id: m.id,
        userId: m.userId,
        isAdmin: m.isAdmin,
        joinedAt: m.joinedAt,
        entryFeePaidAt: m.entryFeePaidAt ?? null,
        // ...spread other existing fields exactly as ngOnInit does...
      }));
      this.members.set(rows);
    } catch {
      // Silent — focus is not a user-initiated action; do not pop a toast.
    }
  }
```

If `HostListener` is not already imported, add it to `@angular/core` imports. If the file already has a `loadMembers` (or similar) method, reuse it and just call it from `onWindowFocus` instead of duplicating the mapping.

Also: `ApiService` needs a `listMemberships(groupId)` method if it does not have one. Look for existing membership fetches in the file. If they hit `apiClient.models.Membership.list` directly, either keep that call in the new `refreshMemberships()` or add a thin wrapper in `ApiService`. Either is fine.

- [ ] **Step 5: Render the floating reminder + modal in the template**

Append to the component's template (outside any `<main>` block — these live at the root of the component template):

```html
@if (showEntryFeeReminder()) {
  <button type="button"
          class="entry-fee-reminder"
          data-testid="entry-fee-reminder"
          aria-label="Cuota de ingreso pendiente. Ver instrucciones."
          (click)="openEntryFeeModal()">
    <app-icon name="alert-circle" [decorative]="true" [size]="20"></app-icon>
    <span class="entry-fee-reminder__text">
      <strong>Tu cuota está pendiente</strong>
      <small>Tocá para ver las instrucciones</small>
    </span>
  </button>
}

@if (entryFeeModalOpen()) {
  <app-modal title="Instrucciones de pago"
             [open]="true"
             data-testid="entry-fee-modal"
             (closeRequest)="closeEntryFeeModal()">
    <div data-testid="entry-fee-modal-body"
         class="entry-fee-modal-body">{{ group()?.entryFeeInstructions }}</div>
    <p class="entry-fee-modal-note">
      Cuando el admin marque tu cuota como pagada, este recordatorio desaparece.
    </p>
    <ng-container modal-footer>
      <button type="button" class="btn-primary" (click)="closeEntryFeeModal()">Entendido</button>
    </ng-container>
  </app-modal>
}
```

(If the local `<app-modal>` uses different slot syntax than `ng-container modal-footer`, use whichever convention the existing modal component expects. Grep for `<app-modal` in the codebase to see other call sites and copy that style.)

If `<app-modal>` is not yet imported by this component, add to the standalone imports:

```ts
import { ModalComponent } from '../../shared/ui/modal/modal.component';
// ...inside @Component({ imports: [...] })
imports: [..., ModalComponent, IconComponent],
```

- [ ] **Step 6: Add CSS for the reminder + modal body**

In the component's `styles: [...]`, add:

```css
    .entry-fee-reminder {
      position: fixed;
      bottom: 24px; right: 24px;
      display: inline-flex; align-items: center; gap: 12px;
      padding: 14px 20px;
      min-height: 56px;
      border-radius: var(--radius-md, 12px);
      background: var(--wf-warn-soft);
      border: 1px solid var(--wf-warn);
      color: var(--color-text, #111);
      cursor: pointer;
      z-index: var(--z-overlay, 100);
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.12);
      animation: fade-in-up 200ms ease-out;
    }
    .entry-fee-reminder:focus-visible {
      outline: 2px solid var(--wf-warn);
      outline-offset: 2px;
    }
    .entry-fee-reminder__text {
      display: flex; flex-direction: column; align-items: flex-start;
      line-height: 1.2;
    }
    .entry-fee-reminder__text small { color: var(--color-text-muted); font-size: 12px; }

    @media (max-width: 767px) {
      .entry-fee-reminder {
        bottom: calc(var(--bp-bottom-nav, 64px) + 16px);
        right: 16px;
        left: 16px;
        justify-content: center;
      }
    }

    @keyframes fade-in-up {
      from { opacity: 0; transform: translateY(8px); }
      to { opacity: 1; transform: translateY(0); }
    }

    @media (prefers-reduced-motion: reduce) {
      .entry-fee-reminder { animation: none; }
    }

    .entry-fee-modal-body {
      white-space: pre-line;
      font-size: 15px; line-height: 1.5;
      color: var(--color-text);
    }
    .entry-fee-modal-note {
      margin-top: 16px;
      font-size: 13px; color: var(--color-text-muted);
    }
```

- [ ] **Step 7: Register the `alert-circle` icon if missing**

Open `src/app/app.config.ts`. Inside the `provideLucideIcons(...)` array, confirm there is an entry for `alert-circle`. If not, add it:

```ts
import { AlertCircle as LucideAlertCircle } from '@lucide/angular';
// ...inside provideLucideIcons(...)
{ ...LucideAlertCircle.icon, name: 'alert-circle' },
```

Same for `check` if it is not already there.

- [ ] **Step 8: Run the tests**

```
npm test -- --testPathPattern='group-detail.component.spec' --watch=false
```

Expected: PASS — both `describe` blocks pass (the column tests from Task 9 + the reminder tests from Task 10).

- [ ] **Step 9: Run the full Jest suite**

```
npm test -- --watch=false
```

Expected: every existing test still passes.

- [ ] **Step 10: Commit**

```bash
git add src/app/features/groups/group-detail.component.ts src/app/features/groups/group-detail.component.spec.ts src/app/app.config.ts
git commit -m "feat(group-detail): floating reminder + instructions modal

Floating button (bottom-right desktop, bottom-center mobile clear of the
nav) appears when the active user has entryFeePaidAt=null on a group
with entryFeeEnabled=true. Click opens an <app-modal> showing the admin's
instructions text with white-space: pre-line so line breaks are preserved.

Window focus triggers a refetch of memberships so the reminder dis-
appears as soon as the admin marks the user paid (no GraphQL sub-
scription needed for this low-churn signal).

Respects prefers-reduced-motion. z-index sits at --z-overlay (100),
below modals at --z-modal (1000) so it never covers other dialogs.
"
```

---

## Phase 6 — Final integration

---

### Task 11: Final wiring + smoke

**Repo:** both (`polla-backend/` first, then `polla-app/`)

- [ ] **Step 1: Deploy backend to sandbox (manual)**

In `polla-backend/`:

```
npx ampx sandbox --profile polla
```

Wait for "Sandbox deployment completed". This regenerates `amplify_outputs.json` with the new schema. The sandbox profile must already exist in your AWS config.

- [ ] **Step 2: Copy regenerated `amplify_outputs.json` into the frontend root and `src/`**

In `polla-app/`:

```
cp ../polla-backend/amplify_outputs.json amplify_outputs.json
cp amplify_outputs.json src/amplify_outputs.json
```

(Confirms with memory `running_locally.md`: `src/amplify_outputs.json` is gitignored and must be copied before `ng serve`.)

- [ ] **Step 3: Remove any `as never` casts that are no longer needed**

In `src/app/core/api/api.service.ts`, the `createGroup` and `markEntryFeePaid` methods still cast to `as never` for the schema fields that pre-dated the regeneration. With the new types available, these casts can be removed. Try removing them and rebuild — if typecheck passes without them, ship that. If it complains, keep the casts but add a comment noting why.

- [ ] **Step 4: Run the dev server + perform the smoke flow**

```
npm run start  # or: ng serve
```

Then manually exercise:

1. Sign in as user A (admin).
2. Create a group with cuota enabled and instructions "Depositar a XXX\nComprobante a YYY".
3. Open `/groups/<new-id>` — confirm NO reminder is visible (admin is auto-paid).
4. Confirm the members table has a "Cuota" column with a green "Pagada" tag on the admin row.
5. Sign in as user B, join via the code.
6. Open `/groups/<new-id>` as user B — confirm the floating reminder shows.
7. Click the reminder — confirm the modal renders the instructions including the line break.
8. Switch back to user A. In the members table, click "Marcar pagada" on user B's row. Confirm the row updates to "Pagada".
9. Switch to user B's tab and bring it to focus — confirm the reminder disappears.
10. Open `/groups/<id>/edit` as admin. Disable the toggle. Save. Re-open the group as user B — confirm the reminder is gone, and the members table no longer shows the column.
11. Re-enable the toggle. Save. Confirm user B's reminder reappears, and that admin remains marked paid (admin auto-paid on re-enable).
12. Edit only the instructions text without toggling. Save. Confirm user B's modal reflects the new text after a tab focus.

If any step fails, capture the console output and a screenshot before moving on.

- [ ] **Step 5: Commit the regenerated outputs (only if the workflow already commits this file)**

The current repo gitignores `src/amplify_outputs.json`, but `amplify_outputs.json` at the root is committed. Check `git status` and stage only what is meant to be committed:

```
git status
git diff -- amplify_outputs.json
git add amplify_outputs.json
git commit -m "chore(amplify): regenerate outputs after entry-fee schema deploy"
```

Skip if `amplify_outputs.json` is not committed in this repo (verify via `git log -1 amplify_outputs.json`).

- [ ] **Step 6: Push both repos**

```
git push origin <branch>
```

(Run in both `polla-backend/` and `polla-app/`.)

---

## Notes for the implementer

- The Amplify schema deploy (Task 11 step 1) MUST happen before the frontend tests against the live API will work. Unit tests with mocked `ApiService` (everything in Tasks 7-10) do NOT need a deploy.
- If `npx ampx sandbox` fails with peer-dep errors, run `npm install` once (the repo has `.npmrc` with `legacy-peer-deps=true`).
- Tone: tú (no voseo). All user-facing strings in this plan already use tú. If a string sneaks in with vos/usted, fix it before commit.
- No emojis in user-facing strings. The plan's CSS contains zero emoji; if any slip into the JS/HTML, remove them.
- The plan deliberately does NOT include changes to `joinGroup`. New joiners arrive with default `entryFeePaidAt=null`, which is correct.
- The "soft" auth model for `entryFeePaidAt` (visible to all authenticated, but filtered client-side) is documented in the spec and follows the same precedent as `Group.joinCode`. If you want to harden this, add to `SECURITY-AUDIT.md` as a follow-up — out of scope for this plan.
