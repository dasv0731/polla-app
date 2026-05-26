# Toggle de comodines a nivel grupo — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** El admin elige al crear un grupo COMPLETE si los comodines aplican en él; cuando aplican, el ranking del grupo (`UserGroupTotal`) sigue como hoy; cuando no, los efectos de comodines se excluyen de ese ranking sin afectar el global (`UserTournamentTotal`).

**Architecture:** Un boolean nuevo `comodinesEnabled` en `Group` (default `true`). El helper `applyScoreDelta` (único punto que toca `UserGroupTotal`) extiende su input con `comodinPoints` y resta esa porción del delta cuando el grupo tiene el flag en `false`. Las 4 lambdas de scoring (`score-match`, `score-bracket`, `score-group-stage`, `adjudicate-special`) calculan `comodinPoints = finalPoints − basePoints` y lo pasan. Frontend muestra toggle en form crear (solo COMPLETE), pill read-only en detail/edit, banner explicativo en ranking del grupo cuando el flag está OFF.

**Tech Stack:** AWS Amplify Gen 2 (TypeScript, DynamoDB, AppSync), Angular 18 standalone, signals, jest (`@angular-builders/jest` en FE, `ts-jest` en BE).

**Spec:** `polla-app/docs/superpowers/specs/2026-05-26-comodines-group-toggle-design.md`

**Branch:** `feature/comodines-group-toggle` (ya creada desde main).

---

## File map

### Backend (`polla-backend/`)

**Modify:**
- `amplify/data/resource.ts` — agrega campo `comodinesEnabled` al model `Group` y arg opcional a la mutation `createGroup`.
- `amplify/functions/create-group/handler.ts` — aplica regla SIMPLE→false / COMPLETE→args??true.
- `src/lib/scoring-totals.ts` — extiende `ScoreDeltas` con `comodinPoints`; branch defensivo en el loop de memberships.
- `amplify/functions/score-match/handler.ts` — pasa `comodinPoints` derivado del delta de comodines.
- `amplify/functions/score-bracket/handler.ts` — idem.
- `amplify/functions/score-group-stage/handler.ts` — idem.
- `amplify/functions/adjudicate-special/handler.ts` — idem si hay efecto REASSIGN_CHAMP_RUNNER aplicado en el run.

**Create:**
- `tests/unit/scoring-totals.test.ts` — tests del helper (5 casos del spec).

### Frontend (`polla-app/`)

**Modify:**
- `src/app/core/api/api.service.ts` — agrega `comodinesEnabled?: boolean` al wrapper de `createGroup`.
- `src/app/features/groups/group-create.component.ts` — toggle visible solo si `mode === 'COMPLETE'`.
- `src/app/features/groups/group-detail.component.ts` — pill informativa en cabecera + banner en ranking del grupo cuando OFF.
- `src/app/features/groups/group-edit.component.ts` — pill read-only con texto explicativo.

---

## Task 1: Schema + create-group handler

**Files:**
- Modify: `polla-backend/amplify/data/resource.ts`
- Modify: `polla-backend/amplify/functions/create-group/handler.ts`

- [ ] **Step 1: Add `comodinesEnabled` field to `Group` model**

In `polla-backend/amplify/data/resource.ts`, find the `Group: a.model({...})` block (around line 291). Add the field after the existing `prize3rd` field, before the closing `})`:

```typescript
      prize3rd: a.string(),
      // NUEVO: toggle de comodines a nivel grupo. Si false, UserGroupTotal de
      // este grupo ignora la porción de puntos que vino de comodines activados.
      // Irrevocable post-creación. Solo aplica a mode=COMPLETE; grupos SIMPLE
      // lo guardan como false por convención (sistema de comodines no aplica
      // a SIMPLE de raíz).
      comodinesEnabled: a.boolean().required().default(true),
    })
```

- [ ] **Step 2: Add `comodinesEnabled` to `createGroup` mutation arguments**

In the same file, find the `createGroup` mutation definition. Add the optional argument:

```typescript
  createGroup: a
    .mutation()
    .arguments({
      name: a.string().required(),
      tournamentId: a.id().required(),
      mode: a.ref('GameMode').required(),
      description: a.string(),
      imageKey: a.string(),
      comodinesEnabled: a.boolean(),   // NUEVO opcional. Handler aplica reglas.
    })
```

- [ ] **Step 3: Update the create-group handler to consume the new arg**

In `polla-backend/amplify/functions/create-group/handler.ts`:

In the `AppSyncEvent` interface, add the field:

```typescript
interface AppSyncEvent {
  arguments: {
    name: string;
    tournamentId: string;
    mode: GameMode;
    description?: string | null;
    imageKey?: string | null;
    comodinesEnabled?: boolean | null;
  };
  identity: { sub: string };
}
```

In the handler body, after the existing destructure line (`const { name, tournamentId, mode, description, imageKey } = event.arguments;`), add the destructure of the new arg and compute the effective value:

```typescript
  const { name, tournamentId, mode, description, imageKey, comodinesEnabled } = event.arguments;
  if (mode !== 'SIMPLE' && mode !== 'COMPLETE') {
    throw new DomainError('INVALID_MODE');
  }
  // Reglas del flag:
  //  - mode=SIMPLE   → siempre false (sistema de comodines no aplica)
  //  - mode=COMPLETE → respeta el input del cliente; default true si no vino.
  const effectiveComodinesEnabled = mode === 'SIMPLE' ? false : (comodinesEnabled ?? true);
```

Then in the `Put` of the Group item (currently around lines 46-55), add the field to the Item:

```typescript
            { Put: {
              TableName: GROUP,
              Item: {
                __typename: 'Group',
                id: groupId,
                name, tournamentId, mode, adminUserId: userId, joinCode: code,
                comodinesEnabled: effectiveComodinesEnabled,
                ...(description ? { description } : {}),
                ...(imageKey ? { imageKey } : {}),
                createdAt: now, updatedAt: now,
              },
            }},
```

- [ ] **Step 4: Typecheck the backend**

```bash
cd polla-backend && npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 5: Commit**

```bash
cd 'C:\Users\Marke\Documents\Respaldo\polla mundialista\polla-app' && git add ../polla-backend/amplify/data/resource.ts ../polla-backend/amplify/functions/create-group/handler.ts
git commit -m "feat(groups): add comodinesEnabled flag to Group schema and create-group handler

- New required boolean (default true) on Group model.
- createGroup mutation accepts optional comodinesEnabled.
- Handler forces false on mode=SIMPLE; defaults true on COMPLETE.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

Note on working dir: this repo has 3 sibling subprojects (`polla-app`, `polla-backend`, `polla-public`), each with its own git repo. The shell working dir of the Bash tool is the workspace root. Use relative paths `../polla-backend/...` when adding from polla-app, OR `cd` into each repo for its own commit. Adjust the snippet to whichever repo's index you're staging into. For Task 1 specifically, the changes are in `polla-backend`, so run the commit there:

```bash
cd 'C:\Users\Marke\Documents\Respaldo\polla mundialista\polla-backend' && git add amplify/data/resource.ts amplify/functions/create-group/handler.ts
cd 'C:\Users\Marke\Documents\Respaldo\polla mundialista\polla-backend' && git commit -m "feat(groups): add comodinesEnabled flag to Group schema and create-group handler

- New required boolean (default true) on Group model.
- createGroup mutation accepts optional comodinesEnabled.
- Handler forces false on mode=SIMPLE; defaults true on COMPLETE.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: `applyScoreDelta` extension + tests (TDD)

**Files:**
- Create: `polla-backend/tests/unit/scoring-totals.test.ts`
- Modify: `polla-backend/src/lib/scoring-totals.ts`

- [ ] **Step 1: Write failing tests first**

Create `polla-backend/tests/unit/scoring-totals.test.ts`:

```typescript
import { applyScoreDelta } from '../../src/lib/scoring-totals';

/**
 * Mock DynamoDBDocumentClient that records every send() call.
 * Returns canned responses for QueryCommand (memberships) and
 * GetCommand (group). UpdateCommands are just recorded.
 */
class MockDdb {
  public calls: Array<{ name: string; input: unknown }> = [];
  constructor(
    private memberships: ReadonlyArray<{ groupId: string }>,
    private groups: ReadonlyMap<string, { id: string; mode: string; comodinesEnabled?: boolean }>,
  ) {}

  send(cmd: { constructor: { name: string }; input: { Key?: Record<string, string>; TableName?: string } }): Promise<{ Items?: unknown[]; Item?: unknown }> {
    const name = cmd.constructor.name;
    this.calls.push({ name, input: cmd.input });
    if (name === 'QueryCommand') {
      return Promise.resolve({ Items: this.memberships });
    }
    if (name === 'GetCommand') {
      const id = cmd.input.Key?.['id'];
      return Promise.resolve({ Item: id ? this.groups.get(id) : undefined });
    }
    return Promise.resolve({});
  }

  updatesFor(table: string): Array<{ TableName?: string; Key?: Record<string, string>; ExpressionAttributeValues?: Record<string, number> }> {
    return this.calls
      .filter((c) => c.name === 'UpdateCommand' && (c.input as { TableName?: string }).TableName === table)
      .map((c) => c.input as { TableName?: string; Key?: Record<string, string>; ExpressionAttributeValues?: Record<string, number> });
  }
}

const TABLES = {
  membershipTable: 'M',
  groupTable: 'G',
  userGroupTotalTable: 'UGT',
  userTournamentTotalTable: 'UTT',
};

describe('applyScoreDelta — comodinesEnabled toggle', () => {
  it('group with comodinesEnabled=true: full delta applied to UGT and UTT', async () => {
    const ddb = new MockDdb(
      [{ groupId: 'g1' }],
      new Map([['g1', { id: 'g1', mode: 'COMPLETE', comodinesEnabled: true }]]),
    );
    await applyScoreDelta({
      ddb: ddb as never, ...TABLES,
      userId: 'u1', tournamentId: 't1', pickMode: 'COMPLETE',
      deltas: { points: 8, comodinPoints: 3 },
    });
    expect(ddb.updatesFor('UGT')[0]!.ExpressionAttributeValues![':points']).toBe(8);
    expect(ddb.updatesFor('UTT')[0]!.ExpressionAttributeValues![':points']).toBe(8);
  });

  it('group with comodinesEnabled=false: comodinPoints stripped from UGT, UTT unchanged', async () => {
    const ddb = new MockDdb(
      [{ groupId: 'g1' }],
      new Map([['g1', { id: 'g1', mode: 'COMPLETE', comodinesEnabled: false }]]),
    );
    await applyScoreDelta({
      ddb: ddb as never, ...TABLES,
      userId: 'u1', tournamentId: 't1', pickMode: 'COMPLETE',
      deltas: { points: 8, comodinPoints: 3 },
    });
    expect(ddb.updatesFor('UGT')[0]!.ExpressionAttributeValues![':points']).toBe(5);
    expect(ddb.updatesFor('UTT')[0]!.ExpressionAttributeValues![':points']).toBe(8);
  });

  it('group with comodinesEnabled=undefined (legacy): full delta applied (compat)', async () => {
    const ddb = new MockDdb(
      [{ groupId: 'g1' }],
      new Map([['g1', { id: 'g1', mode: 'COMPLETE' }]]),   // no comodinesEnabled
    );
    await applyScoreDelta({
      ddb: ddb as never, ...TABLES,
      userId: 'u1', tournamentId: 't1', pickMode: 'COMPLETE',
      deltas: { points: 8, comodinPoints: 3 },
    });
    expect(ddb.updatesFor('UGT')[0]!.ExpressionAttributeValues![':points']).toBe(8);
    expect(ddb.updatesFor('UTT')[0]!.ExpressionAttributeValues![':points']).toBe(8);
  });

  it('comodinPoints=0 + flag OFF: full delta (no comodín to strip)', async () => {
    const ddb = new MockDdb(
      [{ groupId: 'g1' }],
      new Map([['g1', { id: 'g1', mode: 'COMPLETE', comodinesEnabled: false }]]),
    );
    await applyScoreDelta({
      ddb: ddb as never, ...TABLES,
      userId: 'u1', tournamentId: 't1', pickMode: 'COMPLETE',
      deltas: { points: 8, comodinPoints: 0 },
    });
    expect(ddb.updatesFor('UGT')[0]!.ExpressionAttributeValues![':points']).toBe(8);
    expect(ddb.updatesFor('UTT')[0]!.ExpressionAttributeValues![':points']).toBe(8);
  });

  it('comodinPoints===points + flag OFF: no UGT update emitted (delta becomes 0)', async () => {
    const ddb = new MockDdb(
      [{ groupId: 'g1' }],
      new Map([['g1', { id: 'g1', mode: 'COMPLETE', comodinesEnabled: false }]]),
    );
    await applyScoreDelta({
      ddb: ddb as never, ...TABLES,
      userId: 'u1', tournamentId: 't1', pickMode: 'COMPLETE',
      deltas: { points: 5, comodinPoints: 5 },
    });
    // UGT delta is points - comodinPoints = 0 → no Update emitted
    expect(ddb.updatesFor('UGT').length).toBe(0);
    expect(ddb.updatesFor('UTT')[0]!.ExpressionAttributeValues![':points']).toBe(5);
  });

  it('omitting comodinPoints (callers pre-feature) behaves like 0', async () => {
    const ddb = new MockDdb(
      [{ groupId: 'g1' }],
      new Map([['g1', { id: 'g1', mode: 'COMPLETE', comodinesEnabled: false }]]),
    );
    await applyScoreDelta({
      ddb: ddb as never, ...TABLES,
      userId: 'u1', tournamentId: 't1', pickMode: 'COMPLETE',
      deltas: { points: 8 },   // no comodinPoints → undefined → 0
    });
    expect(ddb.updatesFor('UGT')[0]!.ExpressionAttributeValues![':points']).toBe(8);
    expect(ddb.updatesFor('UTT')[0]!.ExpressionAttributeValues![':points']).toBe(8);
  });
});
```

- [ ] **Step 2: Run tests to confirm they FAIL**

```bash
cd polla-backend && npx jest tests/unit/scoring-totals.test.ts --no-coverage
```

Expected: tests run but fail (the new behavior doesn't exist yet; the first test will fail because the helper currently ignores `comodinPoints`).

Note: some tests may incidentally pass before the change (e.g. compat-legacy case is the current behavior). That's fine — the discriminating tests (flag=false stripping, all-comodín no-op) WILL fail until Step 3.

- [ ] **Step 3: Extend `ScoreDeltas` and the `applyScoreDelta` loop**

In `polla-backend/src/lib/scoring-totals.ts`:

Add the new field to the interface:

```typescript
export interface ScoreDeltas {
  points: number;
  exactCount?: number;
  resultCount?: number;
  pointsPreMundial?: number;
  pointsBracket?: number;
  groupStandingsExactCount?: number;
  /**
   * Porción del delta `points` que vino de un comodín activado en este run.
   * Forma parte de `points` (no se suma extra). El helper la usa para restar
   * el efecto cuando un grupo tiene comodinesEnabled=false.
   * Default 0 — callers pre-feature no necesitan tocar nada.
   */
  comodinPoints?: number;
}
```

`comodinPoints` is NOT in the `FIELD_KEYS` array used by `buildExpression()` — it's metadata for the helper itself, not a column on UserGroupTotal/UserTournamentTotal.

Now modify the membership loop. The current code (lines ~104-118) reads:

```typescript
  for (const m of memberships) {
    const groupRes = await p.ddb.send(new GetCommand({
      TableName: p.groupTable,
      Key: { id: m.groupId },
    }));
    const group = groupRes.Item as { id: string; mode?: string } | undefined;
    if (!group || group.mode !== p.pickMode) continue;

    await p.ddb.send(new UpdateCommand({
      TableName: p.userGroupTotalTable,
      Key: { groupId: m.groupId, userId: p.userId },
      UpdateExpression: built.expr,
      ExpressionAttributeValues: built.values,
    }));
  }
```

Replace with:

```typescript
  for (const m of memberships) {
    const groupRes = await p.ddb.send(new GetCommand({
      TableName: p.groupTable,
      Key: { id: m.groupId },
    }));
    const group = groupRes.Item as { id: string; mode?: string; comodinesEnabled?: boolean } | undefined;
    if (!group || group.mode !== p.pickMode) continue;

    // Si comodinesEnabled === false, restamos la porción del delta que vino
    // de un comodín. Defensivo: undefined/null/true cuentan como ON (compat
    // con grupos pre-feature y con el default true del schema).
    const stripsComodin =
      group.comodinesEnabled === false && (p.deltas.comodinPoints ?? 0) !== 0;
    const groupDeltas: ScoreDeltas = stripsComodin
      ? { ...p.deltas, points: p.deltas.points - (p.deltas.comodinPoints ?? 0) }
      : p.deltas;
    const groupBuilt = buildExpression(groupDeltas);
    if (!groupBuilt.hasAny) continue;

    await p.ddb.send(new UpdateCommand({
      TableName: p.userGroupTotalTable,
      Key: { groupId: m.groupId, userId: p.userId },
      UpdateExpression: groupBuilt.expr,
      ExpressionAttributeValues: groupBuilt.values,
    }));
  }
```

The UTT update path (above this loop, around line 87) is unchanged — it always applies `built.expr` with the full delta.

- [ ] **Step 4: Run tests, confirm they PASS**

```bash
cd polla-backend && npx jest tests/unit/scoring-totals.test.ts --no-coverage
```

Expected: 6 tests PASS.

- [ ] **Step 5: Run all backend tests to confirm no regression**

```bash
cd polla-backend && npx jest --no-coverage
```

Expected: all existing test files (`codes.test.ts`, `derive-standings.test.ts`, `scoring.test.ts`, `scoring-bracket.test.ts`, `scoring-comodines.test.ts`, `scoring-standings.test.ts`) still green.

- [ ] **Step 6: Commit**

```bash
cd 'C:\Users\Marke\Documents\Respaldo\polla mundialista\polla-backend' && git add src/lib/scoring-totals.ts tests/unit/scoring-totals.test.ts
cd 'C:\Users\Marke\Documents\Respaldo\polla mundialista\polla-backend' && git commit -m "feat(scoring): applyScoreDelta strips comodinPoints when group has flag OFF

ScoreDeltas gains optional comodinPoints. Callers pass the portion of the
delta that came from a comodin activation. For each group membership, if
comodinesEnabled === false, that portion is subtracted from the points
field before applying the UpdateExpression. UserTournamentTotal is
unaffected (always applies the full delta).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: Pass `comodinPoints` from the 4 scoring lambdas

**Files:**
- Modify: `polla-backend/amplify/functions/score-match/handler.ts`
- Modify: `polla-backend/amplify/functions/score-bracket/handler.ts`
- Modify: `polla-backend/amplify/functions/score-group-stage/handler.ts`
- Modify: `polla-backend/amplify/functions/adjudicate-special/handler.ts`

Each lambda already tracks `basePoints` (without comodín effects) and `finalPoints` (with). The new line: compute `comodinPoints = finalPoints - basePoints` and pass it inside the `deltas` object to `applyScoreDelta`.

In every lambda there's an existing pattern where a `delta` variable is computed as `finalPoints - previousPoints` (the idempotent delta vs whatever was stored before). For `comodinPoints` we want the **portion of that delta** that came from comodín effects in THIS run. Concretely:

```typescript
const comodinPoints = finalPoints - basePoints;
```

This is the value to pass. It's the "if you stripped all comodín effects in this run, you'd subtract this much from points."

- [ ] **Step 1: Update `score-match/handler.ts`**

Locate the `applyScoreDelta` call (around line 269). The lambda body already has `basePoints` (around line 124) and `finalPoints` (around line 125 and modified in the comodín blocks). Just before the `applyScoreDelta` call, add the local variable, and pass it in `deltas`:

Before:
```typescript
    await applyScoreDelta({
      ddb,
      membershipTable: MEMBERSHIP,
      groupTable: GROUP,
      userGroupTotalTable: UGT,
      userTournamentTotalTable: UTT,
      userId: pick.userId,
      tournamentId: match.tournamentId,
      pickMode: pick.mode,
      deltas: {
        points: delta,
        exactCount: exactDelta,
        resultCount: resultDelta,
        ...(isKnockout ? { pointsBracket: delta } : {}),
      },
    });
```

After:
```typescript
    // Porción del delta points que vino de comodines aplicados en este run.
    // Si el grupo tiene comodinesEnabled=false, el helper lo resta del UGT.
    const comodinPoints = finalPoints - basePoints;
    await applyScoreDelta({
      ddb,
      membershipTable: MEMBERSHIP,
      groupTable: GROUP,
      userGroupTotalTable: UGT,
      userTournamentTotalTable: UTT,
      userId: pick.userId,
      tournamentId: match.tournamentId,
      pickMode: pick.mode,
      deltas: {
        points: delta,
        exactCount: exactDelta,
        resultCount: resultDelta,
        comodinPoints,
        ...(isKnockout ? { pointsBracket: delta } : {}),
      },
    });
```

Note: `comodinPoints` represents the comodín contribution to **finalPoints in this run**. If `finalPoints` already differs from the stored `prev` only by a comodín effect, `delta === comodinPoints` and the UGT update is a no-op when flag is OFF — correct. If the user had a new base pick result AND a comodín activated, both contribute; only the comodín portion is stripped — also correct.

- [ ] **Step 2: Update `score-bracket/handler.ts`**

Locate the `applyScoreDelta` call (around line 324). The handler has the analogous `basePoints` / `finalPoints` pair per pick. The same pattern applies. Inspect the variable names — they may differ slightly (e.g. `prevPoints` / `result.points`). Read lines 280-340 of this file before editing to confirm the correct local names. The same comodín-portion derivation works: `comodinPoints = finalPoints - basePoints` (or whatever the local names are).

Concretely, look for the block that computes the delta:
- Find where `result.points` (output of `scoreBracket(...)`) is computed.
- Find where comodín effects (bracket-safe, bracket-reset, anti-penalty) modify `finalPoints` from that base.
- Compute `comodinPoints = finalPoints - basePoints` right before the `applyScoreDelta` call.

Then add the field to the `deltas` object:

```typescript
      deltas: {
        points: delta,
        pointsBracket: delta,
        comodinPoints,
      },
```

If the lambda accumulates per-pick deltas and a single `applyScoreDelta` call processes all of them (look at the loop structure), `comodinPoints` should be **per pick** matching its `delta`. Each `applyScoreDelta` call corresponds to one user × one bracket pick; compute the portion locally inside that loop.

- [ ] **Step 3: Update `score-group-stage/handler.ts`**

This file has **two** `applyScoreDelta` calls (around lines 257 and 309). Read context around each to understand which corresponds to scoring with comodín effects (GROUP_SAFE_PICK, GROUP_RESET):

- The first call applies the per-group-pick delta. If `result.points` includes GROUP_SAFE_PICK (+3) or GROUP_RESET (×0.5), those are the comodín contributions. Compute `comodinPoints = finalPoints - basePoints` (where `basePoints` is `scoreGroupStanding` output before the comodín math) and pass it.
- The second call (lines 309+) — check whether it involves comodín effects. If it's purely a tiebreaker or aggregate that doesn't go through comodín scoring, pass `comodinPoints: 0` or omit the field.

Add the field where it applies, omit where it doesn't.

- [ ] **Step 4: Update `adjudicate-special/handler.ts`**

This lambda handles special picks (CHAMPION / RUNNER_UP / DARK_HORSE). The only comodín that affects this scoring is REASSIGN_CHAMP_RUNNER (#5), which switches the user's champion/runner-up pick at adjudication time.

Read the lambda body around line 139 (the `applyScoreDelta` call) and check whether any reassign comodín effect is applied that would change the `basePoints` → `finalPoints` flow. If yes, compute and pass `comodinPoints` analogously. If the reassign happens before scoring and the resulting picks are just "the user's picks" (no extra mid-run delta), then there's no comodín portion to strip and the field can be omitted (defaults to 0).

When in doubt: omit the field. Default 0 leaves UGT updates unchanged for groups with flag OFF — same as today.

- [ ] **Step 5: Typecheck**

```bash
cd polla-backend && npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 6: Run all backend tests**

```bash
cd polla-backend && npx jest --no-coverage
```

Expected: all green. The changes are additive (extra field in `deltas`), pre-existing tests don't reference `comodinPoints`.

- [ ] **Step 7: Commit**

```bash
cd 'C:\Users\Marke\Documents\Respaldo\polla mundialista\polla-backend' && git add amplify/functions/score-match/handler.ts amplify/functions/score-bracket/handler.ts amplify/functions/score-group-stage/handler.ts amplify/functions/adjudicate-special/handler.ts
cd 'C:\Users\Marke\Documents\Respaldo\polla mundialista\polla-backend' && git commit -m "feat(scoring): scoring lambdas pass comodinPoints to applyScoreDelta

score-match, score-bracket, score-group-stage and adjudicate-special now
compute comodinPoints = finalPoints - basePoints in each user-pick loop
iteration and pass it to applyScoreDelta. Groups with comodinesEnabled=false
will see UGT updated without the comodin portion.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: Frontend — create form + detail pill + edit read-only + ranking banner

**Files:**
- Modify: `polla-app/src/app/core/api/api.service.ts`
- Modify: `polla-app/src/app/features/groups/group-create.component.ts`
- Modify: `polla-app/src/app/features/groups/group-detail.component.ts`
- Modify: `polla-app/src/app/features/groups/group-edit.component.ts`

The Amplify type generation (`schema.d.ts`) updates automatically when the sandbox is redeployed (Task 5). Until then, the FE can pass the extra arg via a relaxed type. Use a `comodinesEnabled?: boolean` field cast where needed.

- [ ] **Step 1: Add `comodinesEnabled` to api.service.ts createGroup wrapper**

In `polla-app/src/app/core/api/api.service.ts`, find the `createGroup(...)` method. Its current signature passes name/tournamentId/mode/description/imageKey. Add `comodinesEnabled` to the input type and forward it:

```typescript
  createGroup(input: {
    name: string;
    tournamentId: string;
    mode: 'SIMPLE' | 'COMPLETE';
    description?: string;
    imageKey?: string;
    comodinesEnabled?: boolean;   // NUEVO
  }) {
    return apiClient.mutations.createGroup({
      name: input.name,
      tournamentId: input.tournamentId,
      mode: input.mode,
      ...(input.description ? { description: input.description } : {}),
      ...(input.imageKey ? { imageKey: input.imageKey } : {}),
      ...(input.comodinesEnabled !== undefined ? { comodinesEnabled: input.comodinesEnabled } : {}),
    });
  }
```

Read the file before editing — the exact shape of the existing wrapper may use a different style. Match what's there.

- [ ] **Step 2: Update group-create.component.ts**

In `polla-app/src/app/features/groups/group-create.component.ts`:

1. Add `comodinesEnabled: true` to the form state object (whatever signal/property holds the form data).
2. In the template, after the existing mode selection block, add a conditional toggle block. Locate the mode-selection block in the template (search for `'COMPLETE'` or `mode === 'COMPLETE'`) and add the checkbox below it:

```html
@if (form.mode === 'COMPLETE') {
  <div class="form-row">
    <label class="checkbox-row" style="display:flex;align-items:flex-start;gap:10px;cursor:pointer;">
      <input type="checkbox" [(ngModel)]="form.comodinesEnabled" name="comodinesEnabled"
             style="margin-top:3px;">
      <div>
        <div class="checkbox-row__title" style="font-weight:600;">Comodines</div>
        <div class="checkbox-row__sub text-mute" style="font-size:12px;line-height:1.4;">
          Activá los 9 tipos de comodines (multiplicadores, seguros, resets, etc).
          <b>No se puede cambiar después</b> de crear el grupo.
        </div>
      </div>
    </label>
  </div>
}
```

The exact form binding (`form.mode`, `[(ngModel)]`, etc.) must match the existing pattern in the component — read the file first to confirm whether it uses reactive forms, signals, or ngModel.

3. In the submit handler, pass `comodinesEnabled` to `api.createGroup` only when mode is COMPLETE:

```typescript
const payload: { name: string; tournamentId: string; mode: 'SIMPLE' | 'COMPLETE'; description?: string; imageKey?: string; comodinesEnabled?: boolean } = {
  name: this.form.name,
  tournamentId: this.form.tournamentId,
  mode: this.form.mode,
};
if (this.form.description) payload.description = this.form.description;
if (this.form.imageKey)    payload.imageKey    = this.form.imageKey;
if (this.form.mode === 'COMPLETE') payload.comodinesEnabled = this.form.comodinesEnabled ?? true;
await this.api.createGroup(payload);
```

Match the existing pattern of the submit handler — variable names may differ.

- [ ] **Step 3: Update group-detail.component.ts (pill)**

In the template, find the group header (where the group name and mode badge live). Add the pill next to the mode badge:

```html
@if (group()?.mode === 'COMPLETE') {
  @if (group()!.comodinesEnabled) {
    <span class="pill pill--accent">🃏 Comodines activos</span>
  } @else {
    <span class="pill pill--mute">🃏 Sin comodines</span>
  }
}
```

The exact location depends on the existing template — place it near the existing mode pill / badge.

Also: in the same component, if there's a ranking table block (a list of members with points), add the banner above it when the flag is OFF:

```html
@if (group()!.mode === 'COMPLETE' && !group()!.comodinesEnabled) {
  <div class="info-banner info-banner--mute"
       style="margin:10px 0;padding:10px 12px;background:rgba(160,160,160,0.10);border:1px solid rgba(160,160,160,0.30);border-radius:8px;font-size:13px;color:var(--wf-ink-2);">
    ℹ Los puntos de este grupo se computan sin efectos de comodines.
    Tu posición global (ranking del torneo) sigue incluyéndolos.
  </div>
}
```

- [ ] **Step 4: Update group-edit.component.ts (read-only display)**

In the edit form template, after the existing mode display (or near other read-only fields), add:

```html
@if (group()?.mode === 'COMPLETE') {
  <div class="form-row form-row--readonly">
    <label>Comodines</label>
    <div>
      <span class="pill"
            [class.pill--accent]="group()!.comodinesEnabled"
            [class.pill--mute]="!group()!.comodinesEnabled">
        {{ group()!.comodinesEnabled ? '🃏 Activados' : '🃏 Desactivados' }}
      </span>
      <p class="text-mute" style="font-size:11px;margin-top:6px;">
        Esta configuración se eligió al crear el grupo y no se puede modificar.
      </p>
    </div>
  </div>
}
```

No mutation logic — the field is pure display.

- [ ] **Step 5: Typecheck**

```bash
cd polla-app && npx tsc --noEmit -p tsconfig.app.json
```

Expected: 0 errors. The frontend won't have the `comodinesEnabled` field in `Group` type until the backend sandbox is redeployed and `amplify_outputs.json` regenerates the schema, BUT casting via `(group() as any).comodinesEnabled` or extending the local interface inline is a temporary workaround. If you hit type errors:
- Add `comodinesEnabled?: boolean | null` to whatever local `Group` interface the components use.
- Or cast at the access site.

Prefer extending the local interface so the template stays clean. The cast is acceptable as fallback.

- [ ] **Step 6: Build (catches template-strict issues)**

```bash
cd polla-app && npx ng build --configuration=development 2>&1 | tail -20
```

Expected: clean build.

- [ ] **Step 7: Commit**

```bash
cd 'C:\Users\Marke\Documents\Respaldo\polla mundialista\polla-app' && git add src/app/core/api/api.service.ts src/app/features/groups/group-create.component.ts src/app/features/groups/group-detail.component.ts src/app/features/groups/group-edit.component.ts
cd 'C:\Users\Marke\Documents\Respaldo\polla mundialista\polla-app' && git commit -m "feat(groups): UI for comodinesEnabled toggle

- api.service createGroup wrapper passes optional comodinesEnabled.
- group-create form shows toggle only when mode=COMPLETE.
- group-detail shows pill (Comodines activos / Sin comodines).
- group-edit shows the flag as read-only with explanatory text.
- Ranking section gets a banner explaining UGT vs UTT divergence when off.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: Deploy sandbox + manual QA

**Files:** none (verification only)

- [ ] **Step 1: Deploy backend changes to sandbox**

```bash
cd polla-backend && npm run sandbox
```

Wait for "✔ Successfully synthesized" and the watch mode to start. The new field `comodinesEnabled` is added to the `Group` table and the `createGroup` mutation gets the new arg.

When the sandbox finishes, the `polla-app/amplify_outputs.json` regenerates (Amplify Gen 2 writes it as part of `sandbox`). If the sandbox doesn't write to that exact path, manually copy whatever sandbox-output JSON to `polla-app/amplify_outputs.json` and re-copy to `polla-app/src/amplify_outputs.json` (the gitignored runtime copy that `amplify-bootstrap.ts` imports).

- [ ] **Step 2: Restart the FE dev server if needed**

If `ng serve` is still running from earlier work, the `amplify_outputs.json` change triggers an automatic reload. If not, restart it:

```bash
cd polla-app && npm start
```

- [ ] **Step 3: QA scenario 1 — create a group with comodines ON**

1. Log into the app with a test admin user.
2. Navigate to `/groups/new`.
3. Select mode = COMPLETE → confirm the comodines toggle appears.
4. Leave it checked (default true). Submit.
5. Navigate to `/groups/<new-id>` → confirm the pill "🃏 Comodines activos" shows.
6. Navigate to `/groups/<new-id>/edit` → confirm the read-only "Activados" pill + explanatory text.

- [ ] **Step 4: QA scenario 2 — create a group with comodines OFF**

1. Repeat the create flow with mode = COMPLETE, but uncheck the toggle. Submit.
2. Detail page shows "🃏 Sin comodines" (mute styling).
3. Edit page shows "Desactivados" read-only.
4. The ranking section of detail shows the banner "ℹ Los puntos de este grupo se computan sin efectos de comodines..."

- [ ] **Step 5: QA scenario 3 — SIMPLE mode hides the toggle**

1. Create flow with mode = SIMPLE → toggle should be hidden entirely.
2. Submit, navigate to detail → no pill of comodines at all.
3. Edit page → no comodines read-only field either (gated by `mode === 'COMPLETE'`).

- [ ] **Step 6: QA scenario 4 — scoring divergence (optional, with sandbox)**

This is the meaningful end-to-end check. Requires sandbox + a way to trigger scoring:

1. Have a test user be member of two COMPLETE groups in the same tournament — group A with comodines ON, group B with comodines OFF.
2. Give that user a comodín (via the sponsor flow, or directly via DDB write in sandbox).
3. Assign the comodín to a match/phase and trigger scoring (admin marks a relevant match as FINAL via `/admin/results`).
4. Check the DDB (or the FE `/groups/<id>` ranking + `/ranking` global):
   - `UserTournamentTotal.points`: full delta applied (includes comodín effect).
   - `UserGroupTotal` for group A: full delta (matches UTT).
   - `UserGroupTotal` for group B: delta minus `comodinPoints`.
5. Confirm the difference equals `appliedComodin.extra` for that scoring run.

If the scenario isn't easy to set up, document it in the QA notes and skip — the unit tests in Task 2 cover the helper's behavior exhaustively.

- [ ] **Step 7: Final commit (if any QA adjustments)**

If during QA you find a copy issue, mis-aligned pill, or wrong condition guard, fix the corresponding component file and commit with a clear `fix(groups): ...` message.

---

## Optional follow-up: frontend jest specs

The spec lists `group-create.component.spec.ts` (toggle visibility, payload shape) and `group-detail.component.spec.ts` (pill rendering) as nice-to-haves. These are not blocking and can be skipped if the manual QA in Task 5 covers the same behaviors. If you do add them:

- For `group-create`: mock `ApiService.createGroup`, render the component with `mode='SIMPLE'` and assert the toggle DOM is absent; switch to `mode='COMPLETE'`, assert the toggle is present and that submitting passes `comodinesEnabled` in the mocked call.
- For `group-detail`: provide a mock group input with `comodinesEnabled: true` and assert the "🃏 Comodines activos" pill is in the DOM; switch to `false`, assert the "Sin comodines" pill and the ranking banner are present.

The existing test patterns in the repo (look at any other component `.spec.ts` for the bootstrapping style) are the source of truth for the harness.
