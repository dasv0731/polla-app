# Datos dinámicos — Sub-3: distribución de campeón del grupo — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans. Steps use `- [ ]` checkboxes.

**Goal:** Reemplazar la card demo "¿A quién le va el grupo?" del rail (`demoChampDist`) por datos reales: una custom query `groupChampionDistribution(groupId)` resuelta por una Lambda que agrega los picks de campeón (`SpecialPick` type=CHAMPION) de los miembros del grupo, devolviendo **solo agregados** por equipo (sin exponer picks individuales — `SpecialPick` es owner-auth).

**Architecture:** Custom AppSync query (`.query()` + `.handler(a.handler.function(...))`) mirroring the existing `pendingMatches` query. La Lambda usa acceso directo a DynamoDB (grants en `backend.ts`) para leer Membership + Group + SpecialPick + Team, saltando owner-auth, y retorna `[{ teamId, teamName, flagCode, count, pct }]`. El front (`right-rail`) la consume solo en `/groups/:id`.

**Tech Stack:** AWS Amplify Gen2 (AppSync, DynamoDB, Lambda Node/TS), Angular signals, jest (`npx jest --maxWorkers=2` backend; `npm test` front).

**Deploy:** Esta feature requiere `npx ampx sandbox --profile polla` (credenciales AWS del humano) + regenerar `amplify_outputs.json` y copiarlo a `src/`. El código + unit tests se hacen sin deploy; el deploy es el paso final del humano.

---

## File Structure
- Create `polla-backend/amplify/functions/group-champion-distribution/resource.ts` — `defineFunction` (mirror `pending-matches/resource.ts`).
- Create `polla-backend/amplify/functions/group-champion-distribution/handler.ts` — agregación.
- Create `polla-backend/tests/unit/group-champion-distribution.test.ts` — unit del handler.
- Modify `polla-backend/amplify/data/resource.ts` — import + custom query `groupChampionDistribution`.
- Modify `polla-backend/amplify/backend.ts` — registrar fn + env (MEMBERSHIP/GROUP/SPECIAL_PICK/TEAM tables) + grantReadData.
- Modify `polla-app/src/app/core/api/api.service.ts` — método `groupChampionDistribution(groupId)`.
- Modify `polla-app/src/app/shared/layout/right-rail.component.ts` — reemplazar `demoChampDist` por la query real.

---

### Task 1: Lambda handler `group-champion-distribution` (TDD)

**Files:**
- Create: `polla-backend/amplify/functions/group-champion-distribution/handler.ts`
- Create: `polla-backend/amplify/functions/group-champion-distribution/resource.ts`
- Test: `polla-backend/tests/unit/group-champion-distribution.test.ts`

- [ ] **Step 1: `resource.ts`** (mirror `pending-matches/resource.ts` exactly, just the name):

```typescript
import { defineFunction } from '@aws-amplify/backend';

export const groupChampionDistribution = defineFunction({
  name: 'group-champion-distribution',
});
```

- [ ] **Step 2: Write the failing test** `tests/unit/group-champion-distribution.test.ts`.

Mirror the mocking pattern used by other handler tests in `tests/unit/` (mock `@aws-sdk/lib-dynamodb` so `ddb.send` returns canned table reads in order). The handler reads, in order: Group (get mode), Membership (members of group), SpecialPick (CHAMPION picks for tournament), Team (slug→name/flag). Test:

```typescript
it('agrega picks de campeón del grupo por equipo (solo agregados)', async () => {
  // Mock ddb.send to return, per call:
  //  1) Group: { mode: 'COMPLETE', tournamentId: 'mundial-2026' }
  //  2) Membership (group g1): users u1,u2,u3
  //  3) SpecialPick CHAMPION mode COMPLETE: u1→argentina, u2→argentina, u3→brasil
  //  4) Team list: argentina{name:'Argentina',flagCode:'AR'}, brasil{name:'Brasil',flagCode:'BR'}
  const res = await handler({ arguments: { groupId: 'g1' }, identity: { sub: 'u1' } } as never);
  expect(res).toEqual([
    { teamId: 'argentina', teamName: 'Argentina', flagCode: 'AR', count: 2, pct: 67 },
    { teamId: 'brasil', teamName: 'Brasil', flagCode: 'BR', count: 1, pct: 33 },
  ]);
});

it('grupo sin picks → []', async () => {
  // Group ok, members exist, but no CHAMPION SpecialPick rows
  const res = await handler({ arguments: { groupId: 'g1' }, identity: { sub: 'u1' } } as never);
  expect(res).toEqual([]);
});
```

(Adapt the mock sequencing to the repo's existing test helper — read a sibling `tests/unit/*.test.ts` first to copy the `jest.mock('@aws-sdk/lib-dynamodb')` setup and the per-call `mockResolvedValueOnce` style.)

- [ ] **Step 3: Confirm it fails** (`cd polla-backend && npx jest --maxWorkers=2 group-champion-distribution`).

- [ ] **Step 4: Implement `handler.ts`:**

```typescript
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, QueryCommand, ScanCommand } from '@aws-sdk/lib-dynamodb';

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const GROUP = process.env['GROUP_TABLE']!;
const MEMBERSHIP = process.env['MEMBERSHIP_TABLE']!;
const SPECIAL_PICK = process.env['SPECIAL_PICK_TABLE']!;
const TEAM = process.env['TEAM_TABLE']!;

interface AppSyncEvent { arguments: { groupId: string }; identity: { sub: string }; }
interface ChampRow { teamId: string; teamName: string; flagCode: string; count: number; pct: number; }

async function scanAll<T>(table: string, filter?: { expr: string; values: Record<string, unknown> }): Promise<T[]> {
  const out: T[] = []; let key: Record<string, unknown> | undefined;
  do {
    const r = await ddb.send(new ScanCommand({
      TableName: table, ExclusiveStartKey: key,
      ...(filter ? { FilterExpression: filter.expr, ExpressionAttributeValues: filter.values } : {}),
    }));
    out.push(...((r.Items ?? []) as T[])); key = r.LastEvaluatedKey;
  } while (key);
  return out;
}

export async function handler(event: AppSyncEvent): Promise<ChampRow[]> {
  const { groupId } = event.arguments;

  const grp = await ddb.send(new GetCommand({ TableName: GROUP, Key: { id: groupId } }));
  const group = grp.Item as { mode?: string; tournamentId?: string } | undefined;
  if (!group?.tournamentId) return [];
  const mode = group.mode === 'SIMPLE' ? 'SIMPLE' : 'COMPLETE';
  const tournamentId = group.tournamentId;

  // Miembros del grupo (scan con filtro por groupId; los grupos son chicos).
  const members = await scanAll<{ userId: string }>(MEMBERSHIP, { expr: 'groupId = :g', values: { ':g': groupId } });
  const memberSet = new Set(members.map((m) => m.userId));
  if (memberSet.size === 0) return [];

  // Picks de campeón del torneo (index specialsByTournament: tournamentId + type),
  // filtrados por modo del grupo y por miembros.
  const picksRes = await ddb.send(new QueryCommand({
    TableName: SPECIAL_PICK,
    IndexName: 'specialsByTournament',
    KeyConditionExpression: 'tournamentId = :t AND #type = :ty',
    ExpressionAttributeNames: { '#type': 'type' },
    ExpressionAttributeValues: { ':t': tournamentId, ':ty': 'CHAMPION' },
  }));
  const picks = ((picksRes.Items ?? []) as Array<{ userId: string; teamId: string; mode: string }>)
    .filter((p) => p.mode === mode && memberSet.has(p.userId));
  const totalPicks = picks.length;
  if (totalPicks === 0) return [];

  const counts = new Map<string, number>();
  for (const p of picks) counts.set(p.teamId, (counts.get(p.teamId) ?? 0) + 1);

  const teams = await scanAll<{ slug: string; name: string; flagCode: string }>(TEAM,
    { expr: 'tournamentId = :t', values: { ':t': tournamentId } });
  const teamMap = new Map(teams.map((t) => [t.slug, t]));

  return [...counts.entries()]
    .map(([teamId, count]): ChampRow => {
      const t = teamMap.get(teamId);
      return { teamId, teamName: t?.name ?? teamId, flagCode: t?.flagCode ?? '', count, pct: Math.round((count / totalPicks) * 100) };
    })
    .sort((a, b) => b.count - a.count);
}
```

(If the Membership table actually has a `byGroup`/`membershipsByGroup` GSI, prefer a `QueryCommand` over the scan — check `resource.ts` Membership `.secondaryIndexes`. The scan is a correct fallback for small groups.)

- [ ] **Step 5: Confirm tests pass.** `cd polla-backend && npx jest --maxWorkers=2 group-champion-distribution`

- [ ] **Step 6: Commit** (backend repo, branch `spec/grupo-datos-dinamicos`): `git add amplify/functions/group-champion-distribution/ tests/unit/group-champion-distribution.test.ts` → `feat(group-champion-distribution): lambda de distribución de campeón`.

---

### Task 2: Schema query + backend wiring

**Files:**
- Modify: `polla-backend/amplify/data/resource.ts`
- Modify: `polla-backend/amplify/backend.ts`

- [ ] **Step 1: `resource.ts` — import + custom query** (mirror the `pendingMatches` query block):

Near the other function imports (top of file) add:
```typescript
import { groupChampionDistribution } from '../functions/group-champion-distribution/resource';
```
Near the `pendingMatches` query in the schema add:
```typescript
  groupChampionDistribution: a
    .query()
    .arguments({ groupId: a.id().required() })
    .returns(a.customType({
      teamId: a.string().required(),
      teamName: a.string().required(),
      flagCode: a.string().required(),
      count: a.integer().required(),
      pct: a.integer().required(),
    }).array())
    .authorization((allow) => [allow.authenticated()])
    .handler(a.handler.function(groupChampionDistribution)),
```

- [ ] **Step 2: `backend.ts` — register fn + env + grants.** READ the file's existing block where tables are pulled (`const tables = ...; const membershipTable = tables['Membership']!; const specialPickTable = tables['SpecialPick']!;` etc.) and where functions are imported into `defineBackend({...})`. Add `groupChampionDistribution` to the `defineBackend({...})` object (import its `resource` like the others). Then add a wiring block mirroring `joinGroup`'s:

```typescript
const teamTable = tables['Team']!;
backend.groupChampionDistribution.addEnvironment('GROUP_TABLE', groupTable.tableName);
backend.groupChampionDistribution.addEnvironment('MEMBERSHIP_TABLE', membershipTable.tableName);
backend.groupChampionDistribution.addEnvironment('SPECIAL_PICK_TABLE', specialPickTable.tableName);
backend.groupChampionDistribution.addEnvironment('TEAM_TABLE', teamTable.tableName);
groupTable.grantReadData(backend.groupChampionDistribution.resources.lambda);
membershipTable.grantReadData(backend.groupChampionDistribution.resources.lambda);
specialPickTable.grantReadData(backend.groupChampionDistribution.resources.lambda);
teamTable.grantReadData(backend.groupChampionDistribution.resources.lambda);
```
(Reuse the existing `groupTable`/`membershipTable`/`specialPickTable` consts if already declared above; only declare `teamTable` if not present. If `grantIndexQuery` is needed for the `specialsByTournament` GSI, mirror how other lambdas grant index queries — `grantReadData` usually covers GSIs.)

- [ ] **Step 3: Typecheck** the backend builds: `cd polla-backend && npx tsc --noEmit` (or the repo's build script). Expected: clean.

- [ ] **Step 4: Commit:** `git add amplify/data/resource.ts amplify/backend.ts` → `feat(schema): query groupChampionDistribution + wiring`.

---

### Task 3: Frontend — api.service + right-rail

**Files:**
- Modify: `polla-app/src/app/core/api/api.service.ts`
- Modify: `polla-app/src/app/shared/layout/right-rail.component.ts`

- [ ] **Step 1: api.service** — add the query method (the generated client exposes custom queries under `apiClient.queries`):

```typescript
  groupChampionDistribution(groupId: string) {
    return apiClient.queries.groupChampionDistribution({ groupId });
  }
```
(If `apiClient.queries` isn't typed yet because the schema isn't deployed/regenerated, cast like other methods do, e.g. `(apiClient as { queries: { groupChampionDistribution: (i: { groupId: string }) => Promise<{ data?: Array<{ teamId: string; teamName: string; flagCode: string; count: number; pct: number }> | null }> } }).queries.groupChampionDistribution({ groupId })`.)

- [ ] **Step 2: right-rail** — replace the demo with the real query. The rail already has `onGroupDetail` and reads the route. Add a signal `champDist = signal<Array<{ flag: string; name: string; count: number; pct: number }>>([])` and load it when on a group-detail route, extracting the `groupId` from the URL. In `applyRoute(url)` (or where `onGroupDetail` is set), when it's a group-detail URL, parse the id (`url.split('?')[0].split('/')[2]`) and call `void this.loadChampDist(id)`:

```typescript
  champDist = signal<Array<{ flag: string; name: string; count: number; pct: number }>>([]);

  private async loadChampDist(groupId: string) {
    try {
      const res = await this.api.groupChampionDistribution(groupId);
      this.champDist.set(((res.data ?? []) as Array<{ teamName: string; flagCode: string; count: number; pct: number }>)
        .map((r) => ({ flag: (r.flagCode || '').toLowerCase(), name: r.teamName, count: r.count, pct: r.pct })));
    } catch (e) { console.warn('[right-rail] champ dist failed', e); this.champDist.set([]); }
  }
```

Replace the template `@for (c of demoChampDist; ...)` with `@for (c of champDist(); track c.flag)`, and the "Ejemplo" badge with: show the card only when `champDist().length > 0` (hide it if empty), and remove the `rr-demo` "Ejemplo" badge. Delete the `demoChampDist` readonly array from the class.

- [ ] **Step 3: Verify** `cd polla-app && npx tsc --noEmit -p tsconfig.app.json` clean + `npm test -- --no-watch` green.

- [ ] **Step 4: Commit:** `git add` the two files → `feat(rail): distribución de campeón real (Sub-3)`.

---

### Task 4 (humano): Deploy

- [ ] `cd polla-backend && npx ampx sandbox --profile polla` (deploya el nuevo Lambda + query). Esperar a que termine.
- [ ] Copiar `polla-backend/amplify_outputs.json` → `polla-app/amplify_outputs.json` → `polla-app/src/amplify_outputs.json` (este último gitignored).
- [ ] Reiniciar `npm start` del front si está corriendo. Verificar en `/groups/:id` que la card "¿A quién le va el grupo?" muestra equipos reales (o se oculta si nadie eligió campeón).

## Notas
- Privacidad: la query solo devuelve conteos/% por equipo; nunca el pick individual de un usuario.
- Si `demoActivity` (Sub-5) sigue ahí, no se toca acá.
- Tras esto, el badge "Ejemplo" del rail solo queda en la card de Actividad (Sub-5).
