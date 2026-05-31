# Datos dinámicos — Sub-4: snapshots de standings → J1 + Mov — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development o executing-plans. Steps usan `- [ ]`.

**Goal:** Reemplazar los placeholders `jornadaPts(r)` (J1) y `movement(r)` (Mov) del leaderboard del detalle de grupo por datos reales, derivados de **snapshots de standings por jornada**.

**Architecture:** Nuevo modelo `GroupStandingSnapshot` (group-readable) con la foto de posiciones+puntos de cada miembro al cerrar una jornada (Phase order 1–8). Una mutation `snapshotStandings(tournamentId, phaseOrder)` (admin) escribe un snapshot por grupo leyendo `UserGroupTotal`. El front lee los últimos 2 snapshots del grupo y computa, por miembro: **J1** = puntos(snapshot más reciente) − puntos(snapshot anterior); **Mov** = posición(anterior) − posición(reciente). `Pick`/`UserGroupTotal` cross-miembro: UGT ya es group-readable, así que el cómputo de posiciones se hace en el Lambda (server-side) y los snapshots se leen directo en el front.

**Tech Stack:** Amplify Gen2 (AppSync, DynamoDB, Lambda TS), Angular signals, jest.

**Deploy:** requiere `npx ampx sandbox --profile polla` (humano) + regenerar/copiar `amplify_outputs.json`. Y para ver J1/Mov reales hay que **correr `snapshotStandings` tras cada jornada** (mutation admin). Auto-trigger desde el scoring queda como follow-up (ver Notas).

---

## File Structure
- Modify `polla-backend/amplify/data/resource.ts` — modelo `GroupStandingSnapshot` + mutation `snapshotStandings`.
- Create `polla-backend/amplify/functions/snapshot-standings/{resource.ts,handler.ts}`.
- Create `polla-backend/tests/unit/snapshot-standings.test.ts`.
- Modify `polla-backend/amplify/backend.ts` — wiring (GROUP/UGT tables, grants).
- Modify `polla-app/src/app/core/api/api.service.ts` — `snapshotStandings(...)` + `listGroupStandingSnapshots(groupId)`.
- Modify `polla-app/src/app/features/groups/group-detail.component.ts` — leer snapshots, computar J1/Mov reales.

---

### Task 1: Modelo `GroupStandingSnapshot`

**Files:** Modify `polla-backend/amplify/data/resource.ts`

- [ ] **Step 1:** Añadir el modelo (cerca de `UserGroupTotal`):

```typescript
  GroupStandingSnapshot: a
    .model({
      groupId: a.id().required(),
      phaseOrder: a.integer().required(),    // jornada (Phase order 1–8)
      tournamentId: a.id().required(),
      takenAt: a.datetime().required(),
      // [{ userId, position, points }] serializado
      rows: a.json().required(),
    })
    .identifier(['groupId', 'phaseOrder'])
    .secondaryIndexes((idx) => [
      idx('groupId').sortKeys(['phaseOrder']).name('snapshotsByGroup'),
    ])
    .authorization((allow) => [
      allow.authenticated().to(['read']),
      allow.group('admins'),
    ]),
```

- [ ] **Step 2: Commit** (backend): `git add amplify/data/resource.ts` → `feat(schema): modelo GroupStandingSnapshot`.

---

### Task 2: Lambda `snapshot-standings` (TDD)

**Files:** Create `amplify/functions/snapshot-standings/{resource.ts,handler.ts}` + `tests/unit/snapshot-standings.test.ts`

- [ ] **Step 1: `resource.ts`** (mirror `pending-matches/resource.ts`):

```typescript
import { defineFunction } from '@aws-amplify/backend';
export const snapshotStandings = defineFunction({ name: 'snapshot-standings', timeoutSeconds: 60 });
```

- [ ] **Step 2: Test que falla** `tests/unit/snapshot-standings.test.ts` (copiar el patrón de mock de `@aws-sdk/lib-dynamodb` de un sibling). Caso:
  - Mock: Group scan (tournamentId t) → groups [g1]; UGT query (leaderboardByGroup g1) → [{userId:u1,points:30},{userId:u2,points:20}]; PutCommand del snapshot.
  - Assert: se hace un Put a SNAPSHOT_TABLE con Item `{ groupId:'g1', phaseOrder:1, tournamentId:'t', rows: JSON con [{userId:'u1',position:1,points:30},{userId:'u2',position:2,points:20}] }` y el handler devuelve `{ updated: 1 }`.

```typescript
it('escribe un snapshot por grupo con posiciones por puntos', async () => {
  // mockResolvedValueOnce sequence: Group scan -> [g1]; UGT query g1 -> u1=30,u2=20; Put -> {}
  const res = await handler({ arguments: { tournamentId: 't', phaseOrder: 1 }, identity: { sub: 'admin' } } as never);
  expect(res).toEqual({ updated: 1 });
  // inspeccionar el PutCommand enviado: Item.rows parseado === [{userId:'u1',position:1,points:30},{userId:'u2',position:2,points:20}]
});
```

- [ ] **Step 3: Confirmar fail.** `cd polla-backend && npx jest --maxWorkers=2 snapshot-standings`

- [ ] **Step 4: Implementar `handler.ts`:**

```typescript
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, ScanCommand, QueryCommand, PutCommand } from '@aws-sdk/lib-dynamodb';

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const GROUP = process.env['GROUP_TABLE']!;
const UGT = process.env['USER_GROUP_TOTAL_TABLE']!;
const SNAPSHOT = process.env['SNAPSHOT_TABLE']!;

interface AppSyncEvent { arguments: { tournamentId: string; phaseOrder: number }; identity: { sub: string }; }

async function scanAll<T>(table: string, expr: string, values: Record<string, unknown>): Promise<T[]> {
  const out: T[] = []; let key: Record<string, unknown> | undefined;
  do {
    const r = await ddb.send(new ScanCommand({ TableName: table, FilterExpression: expr, ExpressionAttributeValues: values, ExclusiveStartKey: key }));
    out.push(...((r.Items ?? []) as T[])); key = r.LastEvaluatedKey;
  } while (key);
  return out;
}

export async function handler(event: AppSyncEvent): Promise<{ updated: number }> {
  const { tournamentId, phaseOrder } = event.arguments;
  const groups = await scanAll<{ id: string }>(GROUP, 'tournamentId = :t', { ':t': tournamentId });
  const now = new Date().toISOString();
  let updated = 0;

  for (const g of groups) {
    const totalsRes = await ddb.send(new QueryCommand({
      TableName: UGT, IndexName: 'leaderboardByGroup',
      KeyConditionExpression: 'groupId = :g',
      ExpressionAttributeValues: { ':g': g.id },
    }));
    const totals = ((totalsRes.Items ?? []) as Array<{ userId: string; points: number }>)
      .slice()
      .sort((a, b) => (b.points ?? 0) - (a.points ?? 0));
    const rows = totals.map((t, i) => ({ userId: t.userId, position: i + 1, points: t.points ?? 0 }));

    await ddb.send(new PutCommand({
      TableName: SNAPSHOT,
      Item: {
        __typename: 'GroupStandingSnapshot',
        groupId: g.id, phaseOrder, tournamentId,
        takenAt: now, rows: JSON.stringify(rows),
        createdAt: now, updatedAt: now,
      },
    }));
    updated++;
  }
  return { updated };
}
```

- [ ] **Step 5: Pass.** `npx jest --maxWorkers=2 snapshot-standings`
- [ ] **Step 6: Commit:** `git add amplify/functions/snapshot-standings/ tests/unit/snapshot-standings.test.ts` → `feat(snapshot-standings): lambda de snapshot de standings`.

---

### Task 3: Mutation en schema + wiring

**Files:** Modify `amplify/data/resource.ts` + `amplify/backend.ts`

- [ ] **Step 1: `resource.ts`** — import + mutation (mirror un mutation existente con `.returns(a.customType({ updated: a.integer().required() }))`, ej. `scoreMatch`):

```typescript
import { snapshotStandings } from '../functions/snapshot-standings/resource';
```
```typescript
  snapshotStandings: a
    .mutation()
    .arguments({ tournamentId: a.id().required(), phaseOrder: a.integer().required() })
    .returns(a.customType({ updated: a.integer().required() }))
    .authorization((allow) => [allow.group('admins')])
    .handler(a.handler.function(snapshotStandings)),
```

- [ ] **Step 2: `backend.ts`** — añadir a `defineBackend({...})` + wiring. El snapshot table: `const snapshotTable = tables['GroupStandingSnapshot']!;`. Reusar `groupTable`/`ugtTable` ya declarados:

```typescript
backend.snapshotStandings.addEnvironment('GROUP_TABLE', groupTable.tableName);
backend.snapshotStandings.addEnvironment('USER_GROUP_TOTAL_TABLE', ugtTable.tableName);
backend.snapshotStandings.addEnvironment('SNAPSHOT_TABLE', snapshotTable.tableName);
groupTable.grantReadData(backend.snapshotStandings.resources.lambda);
ugtTable.grantReadData(backend.snapshotStandings.resources.lambda);
snapshotTable.grantReadWriteData(backend.snapshotStandings.resources.lambda);
grantIndexQuery(ugtTable, backend.snapshotStandings.resources.lambda); // si el repo usa este helper para GSIs
```
(Si el nombre del const de UGT es otro —ver cómo lo llama create-group, `ugtTable`—, úsalo. Si el repo no tiene helper `grantIndexQuery`, omitir esa línea: `grantReadData` suele cubrir GSIs en este repo salvo Query explícito; replicar lo que hace otra lambda que hace `QueryCommand` sobre un GSI.)

- [ ] **Step 3: Typecheck backend** (`npx tsc --noEmit` o jest verde) + **Commit:** `git add amplify/data/resource.ts amplify/backend.ts` → `feat(schema): mutation snapshotStandings + wiring`.

---

### Task 4: api.service

**Files:** Modify `polla-app/src/app/core/api/api.service.ts`

- [ ] **Step 1:** añadir:

```typescript
  /** Admin: escribe snapshots de standings de una jornada (Phase order). */
  snapshotStandings(tournamentId: string, phaseOrder: number) {
    return apiClient.mutations.snapshotStandings({ tournamentId, phaseOrder });
  }
  /** Snapshots de standings de un grupo (orden por phaseOrder asc). */
  listGroupStandingSnapshots(groupId: string) {
    return apiClient.models.GroupStandingSnapshot.list({
      filter: { groupId: { eq: groupId } },
    });
  }
```
(Si los tipos generados aún no conocen el modelo/mutation porque no está deployado, castear como en `groupChampionDistribution`.)

- [ ] **Step 2: Verify** `npx tsc --noEmit -p tsconfig.app.json` clean. **Commit:** `feat(api): snapshotStandings + listGroupStandingSnapshots`.

---

### Task 5: group-detail computa J1/Mov reales (TDD)

**Files:** Modify `group-detail.component.ts` + `group-detail.component.spec.ts`

- [ ] **Step 1: Test que falla.** Mockear `listGroupStandingSnapshots` en el `buildWith` (devolver 2 snapshots: phaseOrder 1 con u1=10/pos1, u2=5/pos2; phaseOrder 2 con u1=18/pos2, u2=22/pos1). Con `rows()` actuales u1=20,u2=25:
  - `jornadaPts(rowU1)` → J1 = puntos en la última jornada snapshotteada = snapshot(2).points − snapshot(1).points = 18−10 = `'+8'`.
  - `movement(rowU2)` → pos(snapshot1)=2 → pos(snapshot2)=1 → subió 1 → `{ l:'▲1', c:'mv--up' }`.
  - Sin snapshots → J1 `'—'`, Mov `{ l:'=', c:'mv--eq' }`.

```typescript
it('J1/Mov desde snapshots reales', async () => {
  // buildWith con snapshots: [{phaseOrder:1, rows: JSON [{userId:'u1',position:1,points:10},{userId:'u2',position:2,points:5}]},
  //                            {phaseOrder:2, rows: JSON [{userId:'u1',position:2,points:18},{userId:'u2',position:1,points:22}]}]
  // ... init ...
  expect(c.jornadaPts({ userId:'u1' } as never)).toBe('+8');
  expect(c.movement({ userId:'u2' } as never)).toEqual({ l:'▲1', c:'mv--up' });
});
```
(Extiende el `buildWith` del describe Sub-1 para aceptar `snapshots` y mockear `listGroupStandingSnapshots: jest.fn().mockResolvedValue({ data: snapshots })`. Añade ese mock a los demás `buildWith`/entry-fee mocks como `mockResolvedValue({ data: [] })` para que no rompan.)

- [ ] **Step 2: Confirmar fail.**

- [ ] **Step 3: Implementar.** En `load()`, traer snapshots: `this.api.listGroupStandingSnapshots(this.id)` (añadir al Promise.all o aparte), parsear `rows` (JSON) y guardar en un signal `snapshots = signal<Array<{ phaseOrder: number; rows: Array<{ userId: string; position: number; points: number }> }>>([])` ordenado por phaseOrder asc. Reemplazar los helpers placeholder:

```typescript
  snapshots = signal<Array<{ phaseOrder: number; rows: Array<{ userId: string; position: number; points: number }> }>>([]);

  private lastTwoSnapshots() {
    const s = [...this.snapshots()].sort((a, b) => a.phaseOrder - b.phaseOrder);
    return { prev: s.length >= 2 ? s[s.length - 2] : null, last: s.length >= 1 ? s[s.length - 1] : null };
  }

  /** J1 = puntos ganados en la última jornada snapshotteada. */
  jornadaPts(r: RankRow): string {
    const { prev, last } = this.lastTwoSnapshots();
    if (!last) return '—';
    const lp = last.rows.find((x) => x.userId === r.userId)?.points ?? 0;
    const pp = prev?.rows.find((x) => x.userId === r.userId)?.points ?? 0;
    const j1 = lp - pp;
    return (j1 >= 0 ? '+' : '') + j1;
  }

  /** Mov = cambio de posición entre los dos últimos snapshots. */
  movement(r: RankRow): { l: string; c: string } {
    const { prev, last } = this.lastTwoSnapshots();
    if (!prev || !last) return { l: '=', c: 'mv--eq' };
    const pPrev = prev.rows.find((x) => x.userId === r.userId)?.position;
    const pLast = last.rows.find((x) => x.userId === r.userId)?.position;
    if (pPrev == null || pLast == null) return { l: '=', c: 'mv--eq' };
    const delta = pPrev - pLast; // >0 = subió
    if (delta > 0) return { l: '▲' + delta, c: 'mv--up' };
    if (delta < 0) return { l: '▼' + (-delta), c: 'mv--dn' };
    return { l: '=', c: 'mv--eq' };
  }
```
Parseo de snapshots en load (el campo `rows` viene como string JSON):
```typescript
      this.snapshots.set(((snapsRes.data ?? []) as Array<{ phaseOrder: number; rows: string }>)
        .map((s) => ({ phaseOrder: s.phaseOrder, rows: (() => { try { return JSON.parse(s.rows); } catch { return []; } })() })));
```
Quitar los comentarios `FALTA:` de J1/Mov y la nota al pie (ahora son reales). Actualizar el doc-header del componente.

- [ ] **Step 4: Pass.** `npm test -- --no-watch --test-path-pattern=group-detail`
- [ ] **Step 5: Commit:** `feat(group-detail): J1/Mov reales desde snapshots (Sub-4)`.

---

### Task 6 (humano): Deploy + primer snapshot

- [ ] `cd polla-backend && npx ampx sandbox --profile polla` → copiar `amplify_outputs.json` a `polla-app/` y `polla-app/src/`.
- [ ] Tras cerrar una jornada (sus matches FINAL), correr la mutation `snapshotStandings(tournamentId:'mundial-2026', phaseOrder:N)` (desde el admin o un script). Repetir cada jornada. Con ≥2 snapshots, J1/Mov aparecen reales en `/groups/:id`.

## Notas
- **Auto-trigger (follow-up, no en este plan):** idealmente `score-match` detecta cuando la última match de una phase queda FINAL y llama a la lógica de `snapshotStandings` para esa phaseOrder. Eso evita el paso manual. Se puede agregar después sin cambiar el modelo ni el front.
- Posiciones del snapshot = orden por puntos desc (consistente con el leaderboard actual del front). Si más adelante se usa el tiebreaker completo (`compareRankable`), portar esa lógica al Lambda.
- Tras Sub-4, el único demo restante es **Sub-5** (feed de actividad).
