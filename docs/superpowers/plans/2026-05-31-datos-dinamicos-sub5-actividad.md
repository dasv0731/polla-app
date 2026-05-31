# Datos dinámicos — Sub-5: feed de actividad del grupo — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development o executing-plans. Steps usan `- [ ]`.

**Goal:** Reemplazar el `demoActivity` (card "Actividad reciente" del rail de grupo) por un feed REAL alimentado por 4 emisores server-side: **JOINED** (unirse), **COMODIN** (asignar comodín), **EXACT_SCORE** (marcador exacto al puntuar) y **LEADER_CHANGE** (cambio de líder al cerrar jornada).

**Architecture:** Nuevo modelo `GroupActivity` (group-readable, write solo server-side) con índice `activitiesByGroup` (sortKey `createdAt` desc). Un helper compartido en `src/lib/group-activity.ts` expone `emitGroupActivity(...)` (un Put) y `resolveUserGroupIds(...)` (query `groupsByUser` + GetItem Group + filtro por `tournamentId`) para los eventos que no tienen `groupId` directo (COMODIN, EXACT_SCORE hacen *fan-out* a todos los grupos del usuario en ese torneo). JOINED y LEADER_CHANGE ya tienen `groupId` en contexto. El front lee los ~4 más recientes vía `listGroupActivity(groupId)` solo en `/groups/:id`.

**Tech Stack:** Amplify Gen2 (AppSync, DynamoDB, Lambda TS), Angular signals, jest.

**Deploy:** requiere `npx ampx sandbox --profile polla` (humano) + copiar `amplify_outputs.json` a `polla-app/` y `polla-app/src/`. Los eventos aparecen a medida que ocurren join/comodín/scoring/snapshot tras el deploy.

---

## File Structure
- Modify `polla-backend/amplify/data/resource.ts` — enum `GroupActivityKind` + modelo `GroupActivity`.
- Create `polla-backend/src/lib/group-activity.ts` — `emitGroupActivity` + `resolveUserGroupIds`.
- Create `polla-backend/tests/unit/group-activity-lib.test.ts`.
- Modify `polla-backend/amplify/functions/join-group/handler.ts` — emite JOINED.
- Modify `polla-backend/amplify/functions/assign-comodin/handler.ts` — emite COMODIN (fan-out).
- Modify `polla-backend/amplify/functions/score-match/handler.ts` — emite EXACT_SCORE (fan-out, solo en transición a exacto).
- Modify `polla-backend/amplify/functions/snapshot-standings/handler.ts` — emite LEADER_CHANGE (compara con snapshot previo).
- Modify `polla-backend/amplify/backend.ts` — env `GROUP_ACTIVITY_TABLE` + grants a los 4 lambdas (+ `grantIndexQuery(membershipTable, ...)` y `groupTable.grantReadData(...)` donde falten).
- Modify `polla-app/src/app/core/api/api.service.ts` — `listGroupActivity(groupId)`.
- Modify `polla-app/src/app/shared/layout/right-rail.component.ts` — reemplaza `demoActivity` por signal real.

---

### Task 1: Enum + modelo `GroupActivity`

**Files:** Modify `polla-backend/amplify/data/resource.ts`

- [ ] **Step 1:** Cerca de los otros `a.enum(...)` (ej. `ComodinType`), añadir el enum nombrado:

```typescript
  GroupActivityKind: a.enum(['JOINED', 'COMODIN', 'EXACT_SCORE', 'LEADER_CHANGE']),
```

- [ ] **Step 2:** Cerca de `UserGroupTotal` / `GroupStandingSnapshot`, añadir el modelo:

```typescript
  GroupActivity: a
    .model({
      groupId: a.id().required(),
      kind: a.ref('GroupActivityKind').required(),
      userId: a.id().required(),
      tournamentId: a.id().required(),
      // metadata para render: { handle?, points?, comodin?, ... } serializado
      payload: a.json(),
      createdAt: a.datetime().required(),
    })
    .secondaryIndexes((idx) => [
      idx('groupId').sortKeys(['createdAt']).name('activitiesByGroup'),
    ])
    .authorization((allow) => [
      allow.authenticated().to(['read']),
      allow.group('admins'),
    ]),
```
(Si `a.ref('GroupActivityKind').required()` da error de tipos, usar sin `.required()` —igual que `Comodin.type`—. Mantener el resto.)

- [ ] **Step 3: Typecheck** (`cd polla-backend && npx tsc --noEmit`) y **Commit:** `git add amplify/data/resource.ts` → `feat(schema): modelo GroupActivity + enum GroupActivityKind`.

---

### Task 2: Helper compartido `src/lib/group-activity.ts` (TDD)

**Files:** Create `polla-backend/src/lib/group-activity.ts` + `tests/unit/group-activity-lib.test.ts`

Patrón de ubicación: mismo `src/lib/` que `scoring-totals.ts` (importado por los handlers vía rutas relativas). `ulid` se importa igual que en `join-group/handler.ts` (revisar su import exacto: `import { ulid } from 'ulid';`).

- [ ] **Step 1: Test que falla** `tests/unit/group-activity-lib.test.ts`. Dos casos:
  1. `emitGroupActivity` hace un `PutCommand` a la tabla con `Item` que incluye `groupId, kind, userId, tournamentId, payload` (JSON-stringified) y un `createdAt` ISO + `id`.
  2. `resolveUserGroupIds` query `groupsByUser` (devuelve memberships `[{groupId:'g1'},{groupId:'g2'}]`), hace GetItem de cada Group (`g1` tournament `t`, `g2` tournament `OTRO`) y devuelve solo `['g1']` (filtra por tournamentId).

```typescript
it('emitGroupActivity escribe una fila con payload serializado', async () => {
  const ddb = { send: jest.fn().mockResolvedValue({}) };
  await emitGroupActivity(ddb as never, 'ACT', {
    groupId: 'g1', kind: 'JOINED', userId: 'u1', tournamentId: 't',
    payload: { handle: 'andrea' }, now: '2026-06-01T00:00:00.000Z',
  });
  const cmd = ddb.send.mock.calls[0][0];
  expect(cmd.constructor.name).toBe('PutCommand');
  expect(cmd.input.TableName).toBe('ACT');
  expect(cmd.input.Item).toMatchObject({
    groupId: 'g1', kind: 'JOINED', userId: 'u1', tournamentId: 't',
    createdAt: '2026-06-01T00:00:00.000Z',
  });
  expect(JSON.parse(cmd.input.Item.payload)).toEqual({ handle: 'andrea' });
  expect(typeof cmd.input.Item.id).toBe('string');
});

it('resolveUserGroupIds filtra por torneo', async () => {
  const ddb = { send: jest.fn()
    .mockResolvedValueOnce({ Items: [{ groupId: 'g1' }, { groupId: 'g2' }] }) // groupsByUser
    .mockResolvedValueOnce({ Item: { id: 'g1', tournamentId: 't' } })          // Get g1
    .mockResolvedValueOnce({ Item: { id: 'g2', tournamentId: 'OTRO' } }) };     // Get g2
  const ids = await resolveUserGroupIds(ddb as never, {
    membershipTable: 'M', groupTable: 'G', userId: 'u1', tournamentId: 't',
  });
  expect(ids).toEqual(['g1']);
});
```

- [ ] **Step 2: Confirmar fail.** `cd polla-backend && npx jest --maxWorkers=2 group-activity-lib`

- [ ] **Step 3: Implementar `src/lib/group-activity.ts`:**

```typescript
import { QueryCommand, GetCommand, PutCommand, type DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { ulid } from 'ulid';

export type GroupActivityKind = 'JOINED' | 'COMODIN' | 'EXACT_SCORE' | 'LEADER_CHANGE';

export interface EmitGroupActivityInput {
  groupId: string;
  kind: GroupActivityKind;
  userId: string;
  tournamentId: string;
  payload?: Record<string, unknown>;
  now: string;
}

/** Escribe una fila de GroupActivity (write server-side only). */
export async function emitGroupActivity(
  ddb: DynamoDBDocumentClient,
  table: string,
  a: EmitGroupActivityInput,
): Promise<void> {
  await ddb.send(new PutCommand({
    TableName: table,
    Item: {
      __typename: 'GroupActivity',
      id: ulid(),
      groupId: a.groupId,
      kind: a.kind,
      userId: a.userId,
      tournamentId: a.tournamentId,
      payload: JSON.stringify(a.payload ?? {}),
      createdAt: a.now,
      updatedAt: a.now,
    },
  }));
}

export interface ResolveGroupsInput {
  membershipTable: string;
  groupTable: string;
  userId: string;
  tournamentId: string;
}

/** Grupos del usuario que pertenecen al torneo dado (para fan-out de eventos
 *  sin groupId directo: COMODIN, EXACT_SCORE). */
export async function resolveUserGroupIds(
  ddb: DynamoDBDocumentClient,
  p: ResolveGroupsInput,
): Promise<string[]> {
  const memQ = await ddb.send(new QueryCommand({
    TableName: p.membershipTable,
    IndexName: 'groupsByUser',
    KeyConditionExpression: 'userId = :u',
    ExpressionAttributeValues: { ':u': p.userId },
  }));
  const memberships = (memQ.Items ?? []) as Array<{ groupId: string }>;
  const ids: string[] = [];
  for (const m of memberships) {
    const g = await ddb.send(new GetCommand({ TableName: p.groupTable, Key: { id: m.groupId } }));
    const group = g.Item as { id: string; tournamentId?: string } | undefined;
    if (group && group.tournamentId === p.tournamentId) ids.push(group.id);
  }
  return ids;
}
```

- [ ] **Step 4: Pass.** `npx jest --maxWorkers=2 group-activity-lib`
- [ ] **Step 5: Commit:** `git add src/lib/group-activity.ts tests/unit/group-activity-lib.test.ts` → `feat(group-activity): helper emitGroupActivity + resolveUserGroupIds`.

---

### Task 3: Emisor JOINED en `join-group` (TDD)

**Files:** Modify `amplify/functions/join-group/handler.ts` + su test (`tests/unit/join-group.test.ts` si existe; si no, añadir aserción mínima sobre el Put de actividad reusando el mock del test existente).

Contexto: tras crear el Membership (≈línea 76-85), `userId` (= `event.identity.sub`), `invite.groupId`, `group.tournamentId` y `now` están en scope. El handler ya carga el grupo (≈línea 34-36) y el joiner (`joiner.handle`, ≈línea 104). Necesitamos el env `GROUP_ACTIVITY_TABLE`.

- [ ] **Step 1:** Añadir al tope del handler (junto a los otros `process.env`): `const GROUP_ACTIVITY = process.env['GROUP_ACTIVITY_TABLE']!;` e `import { emitGroupActivity } from '../../../src/lib/group-activity';`.

- [ ] **Step 2: Test.** En el test de join-group, tras un join exitoso, assert que se hizo un `PutCommand` a `GROUP_ACTIVITY` con `Item.kind === 'JOINED'`, `Item.groupId === invite.groupId`, `Item.userId === sub`. (Si el test usa `MockDdb.calls`, filtrar por `TableName`.) Setear `process.env['GROUP_ACTIVITY_TABLE']` en el `setEnv` del test.

- [ ] **Step 3:** Implementar: justo después del Put del Membership (antes del `return`), añadir:

```typescript
    await emitGroupActivity(ddb, GROUP_ACTIVITY, {
      groupId: invite.groupId,
      kind: 'JOINED',
      userId,
      tournamentId: group.tournamentId,
      payload: { handle: joiner?.handle ?? userId.slice(0, 6) },
      now,
    });
```
(Usar el handle si ya está cargado; si no, cargarlo no es necesario — `userId.slice` como fallback. NO romper el flujo si el emit falla: envolver en `try { ... } catch { /* feed best-effort */ }` para no abortar el join.)

- [ ] **Step 4: Pass** (`npx jest --maxWorkers=2 join-group`) + **Commit:** `feat(join-group): emite actividad JOINED`.

---

### Task 4: Emisor COMODIN en `assign-comodin` (TDD, fan-out)

**Files:** Modify `amplify/functions/assign-comodin/handler.ts` + su test.

Contexto: tras el `UpdateCommand` que pone el comodín en `ASSIGNED` (≈línea 99-115), en scope: `userId` (`event.identity.sub`), `c.type` (ComodinType), `c.tournamentId`, `nowIso`. NO hay `groupId` → fan-out con `resolveUserGroupIds`. Envs nuevos: `GROUP_ACTIVITY_TABLE`, `MEMBERSHIP_TABLE`, `GROUP_TABLE` (si no están ya).

- [ ] **Step 1:** Imports + envs: `import { emitGroupActivity, resolveUserGroupIds } from '../../../src/lib/group-activity';` y los `process.env` faltantes (`GROUP_ACTIVITY`, `MEMBERSHIP`, `GROUP`).

- [ ] **Step 2: Test.** Mock: groupsByUser → `[{groupId:'g1'}]`; Get g1 → `{id:'g1',tournamentId:<c.tournamentId>}`; assert un `PutCommand` a `GROUP_ACTIVITY` con `kind:'COMODIN'`, `groupId:'g1'`, `userId`, `payload` con `comodin: c.type`. Setear los 3 envs en setEnv.

- [ ] **Step 3:** Tras el update exitoso del comodín (antes del `return`):

```typescript
    try {
      const groupIds = await resolveUserGroupIds(ddb, {
        membershipTable: MEMBERSHIP, groupTable: GROUP,
        userId, tournamentId: c.tournamentId,
      });
      for (const groupId of groupIds) {
        await emitGroupActivity(ddb, GROUP_ACTIVITY, {
          groupId, kind: 'COMODIN', userId, tournamentId: c.tournamentId,
          payload: { comodin: c.type }, now: nowIso,
        });
      }
    } catch { /* feed best-effort */ }
```
(Reutilizar el nombre real del const ddb del handler. Si el handler ya tiene `MEMBERSHIP`/`GROUP` envs, no duplicar.)

- [ ] **Step 4: Pass** (`npx jest --maxWorkers=2 assign-comodin`) + **Commit:** `feat(assign-comodin): emite actividad COMODIN`.

---

### Task 5: Emisor EXACT_SCORE en `score-match` (TDD, fan-out en transición)

**Files:** Modify `amplify/functions/score-match/handler.ts` + su test.

Contexto: en el loop de picks, hay una transición a exacto detectable: `result.exactScore && !oldExactFlag` (≈línea 168-172). En scope: `pick.userId`, `match.tournamentId`, `match.id`. `MEMBERSHIP` ya está como env (línea 16). Falta `GROUP_ACTIVITY` y `GROUP` (el GROUP env: score-match ya hace GetItem de Group dentro de `applyScoreDelta`, pero ese usa su propio param; verificar si el handler tiene `GROUP_TABLE` env — si no, añadirlo).

- [ ] **Step 1:** Imports + envs: `import { emitGroupActivity, resolveUserGroupIds } from '../../../src/lib/group-activity';`, `const GROUP_ACTIVITY = process.env['GROUP_ACTIVITY_TABLE']!;` y `const GROUP = process.env['GROUP_TABLE']!;` (si no existe ya un const para Group).

- [ ] **Step 2: Test.** En el test de score-match, configurar un pick que pasa a exacto (oldExactFlag false → result.exactScore true), mock groupsByUser para ese userId → `[{groupId:'g1'}]`, Get g1 → tournament del match; assert un `PutCommand` a `GROUP_ACTIVITY` con `kind:'EXACT_SCORE'`, `groupId:'g1'`, `userId:pick.userId`, `payload` con `matchId` y `points` (finalPoints). (El test de score-match es grande; añadir el caso o extender uno existente. Setear `GROUP_ACTIVITY_TABLE`/`GROUP_TABLE` en su setEnv.)

- [ ] **Step 3:** Dentro del loop, en el bloque donde `result.exactScore && !oldExactFlag` (crear el `if` si no existe explícito), tras actualizar el Pick:

```typescript
    if (result.exactScore && !oldExactFlag) {
      try {
        const groupIds = await resolveUserGroupIds(ddb, {
          membershipTable: MEMBERSHIP, groupTable: GROUP,
          userId: pick.userId, tournamentId: match.tournamentId,
        });
        for (const groupId of groupIds) {
          await emitGroupActivity(ddb, GROUP_ACTIVITY, {
            groupId, kind: 'EXACT_SCORE', userId: pick.userId,
            tournamentId: match.tournamentId,
            payload: { matchId: match.id, points: finalPoints }, now: nowIso,
          });
        }
      } catch { /* feed best-effort */ }
    }
```
(Usar el nombre real de la variable de puntos —`finalPoints`— y del timestamp del handler; si no hay `nowIso`, usar `new Date().toISOString()`. Reusar el `ddb` del handler.)

- [ ] **Step 4: Pass** (`npx jest --maxWorkers=2 score-match`) + **Commit:** `feat(score-match): emite actividad EXACT_SCORE en transición a exacto`.

---

### Task 6: Emisor LEADER_CHANGE en `snapshot-standings` (TDD)

**Files:** Modify `amplify/functions/snapshot-standings/handler.ts` + `tests/unit/snapshot-standings.test.ts`.

Contexto: el handler itera grupos, ordena `rows` por puntos (rows[0] = líder) y hace Put del snapshot. Añadir, antes del Put: query del snapshot inmediatamente anterior (`phaseOrder < current`, ScanIndexForward false, Limit 1) y, si el líder cambió, emitir.

- [ ] **Step 1:** Imports + env: `import { emitGroupActivity } from '../../../src/lib/group-activity';`, `const GROUP_ACTIVITY = process.env['GROUP_ACTIVITY_TABLE']!;`, `const MEMBERSHIP`... (no necesario aquí). Importar `GetCommand` no; usar `QueryCommand` ya importado.

- [ ] **Step 2: Test.** Extender `snapshot-standings.test.ts`: caso con snapshot previo cuyo líder (rows[0].userId) difiere del nuevo. Mock orden: Group scan → [g1]; UGT query g1 → nuevo orden (líder = u2); **query snapshotsByGroup previo** → `{ rows: JSON [{userId:'u1',position:1,...}] }`; Put snapshot; **Put actividad**. Assert que hubo un `PutCommand` a `GROUP_ACTIVITY` con `kind:'LEADER_CHANGE'`, `groupId:'g1'`, `userId:'u2'` (nuevo líder), `payload` con `previousLeader:'u1'`. (Y un caso donde el líder NO cambia → NO se emite actividad. Ajustar el test existente de "escribe un snapshot por grupo": ahora hay una query extra de snapshot previo entre la UGT-query y el Put — devolver `{ Items: [] }` para que no rompa, y verificar que sin previo NO se emite LEADER_CHANGE.)

- [ ] **Step 3:** Implementar dentro del `for (const g of groups)`, después de construir `rows` y antes del Put del snapshot:

```typescript
    const newLeader = rows[0]?.userId;
    let previousLeader: string | undefined;
    const prevRes = await ddb.send(new QueryCommand({
      TableName: SNAPSHOT, IndexName: 'snapshotsByGroup',
      KeyConditionExpression: 'groupId = :g AND phaseOrder < :p',
      ExpressionAttributeValues: { ':g': g.id, ':p': phaseOrder },
      ScanIndexForward: false, Limit: 1,
    }));
    const prevSnap = (prevRes.Items ?? [])[0] as { rows?: string } | undefined;
    if (prevSnap?.rows) {
      try { previousLeader = (JSON.parse(prevSnap.rows) as Array<{ userId: string }>)[0]?.userId; }
      catch { previousLeader = undefined; }
    }
```
y después del Put del snapshot:
```typescript
    if (newLeader && previousLeader && previousLeader !== newLeader) {
      try {
        await emitGroupActivity(ddb, GROUP_ACTIVITY, {
          groupId: g.id, kind: 'LEADER_CHANGE', userId: newLeader,
          tournamentId, payload: { previousLeader }, now,
        });
      } catch { /* feed best-effort */ }
    }
```
(El env `SNAPSHOT` ya existe en el handler. La query del snapshot previo usa el GSI `snapshotsByGroup` que ya existe.)

- [ ] **Step 4: Pass** (`npx jest --maxWorkers=2 snapshot-standings`) + **Commit:** `feat(snapshot-standings): emite actividad LEADER_CHANGE`.

---

### Task 7: Wiring en `backend.ts`

**Files:** Modify `amplify/backend.ts`

- [ ] **Step 1:** Tras el bloque de consts de tablas, añadir `const groupActivityTable = tables['GroupActivity']!;`.

- [ ] **Step 2:** Para cada uno de los 4 lambdas (`joinGroup`, `assignComodin`, `scoreMatch`, `snapshotStandings`), añadir el env + grant de write. Para `assignComodin` y `scoreMatch` además asegurar env+grant de `MEMBERSHIP_TABLE`/`GROUP_TABLE` y `grantIndexQuery(membershipTable, <lambda>)` (query `groupsByUser`) + `groupTable.grantReadData(<lambda>)` si no estaban:

```typescript
// JOINED
backend.joinGroup.addEnvironment('GROUP_ACTIVITY_TABLE', groupActivityTable.tableName);
groupActivityTable.grantWriteData(backend.joinGroup.resources.lambda);

// COMODIN (fan-out: necesita membership+group)
backend.assignComodin.addEnvironment('GROUP_ACTIVITY_TABLE', groupActivityTable.tableName);
backend.assignComodin.addEnvironment('MEMBERSHIP_TABLE', membershipTable.tableName);
backend.assignComodin.addEnvironment('GROUP_TABLE', groupTable.tableName);
groupActivityTable.grantWriteData(backend.assignComodin.resources.lambda);
membershipTable.grantReadData(backend.assignComodin.resources.lambda);
groupTable.grantReadData(backend.assignComodin.resources.lambda);
grantIndexQuery(membershipTable, backend.assignComodin.resources.lambda);

// EXACT_SCORE (fan-out)
backend.scoreMatch.addEnvironment('GROUP_ACTIVITY_TABLE', groupActivityTable.tableName);
backend.scoreMatch.addEnvironment('GROUP_TABLE', groupTable.tableName);
groupActivityTable.grantWriteData(backend.scoreMatch.resources.lambda);
groupTable.grantReadData(backend.scoreMatch.resources.lambda);
grantIndexQuery(membershipTable, backend.scoreMatch.resources.lambda);

// LEADER_CHANGE
backend.snapshotStandings.addEnvironment('GROUP_ACTIVITY_TABLE', groupActivityTable.tableName);
groupActivityTable.grantWriteData(backend.snapshotStandings.resources.lambda);
grantIndexQuery(snapshotTable, backend.snapshotStandings.resources.lambda); // query snapshot previo
```
(Antes de añadir, REVISAR qué envs/grants ya tienen esos lambdas para no duplicar líneas —`scoreMatch` ya tiene `MEMBERSHIP_TABLE` + su grant; `snapshotStandings` ya tiene `SNAPSHOT_TABLE` rw pero quizá no el index-query del GSI: añadir `grantIndexQuery(snapshotTable, ...)`. Usar los nombres reales de consts: `membershipTable`, `groupTable`, `snapshotTable`.)

- [ ] **Step 3: Typecheck** (`npx tsc --noEmit`) + suite completa verde (`npx jest --maxWorkers=2`). **Commit:** `git add amplify/backend.ts` → `feat(backend): wiring GroupActivity (envs + grants 4 emisores)`.

---

### Task 8: Front — api.service + right-rail (reemplaza demoActivity)

**Files:** Modify `polla-app/src/app/core/api/api.service.ts` + `polla-app/src/app/shared/layout/right-rail.component.ts`

- [ ] **Step 1: api.service** — añadir (cast como `groupChampionDistribution`, el modelo no está deployado):

```typescript
  /** Actividad reciente de un grupo (orden desc por createdAt, top N). */
  listGroupActivity(groupId: string, limit = 4) {
    return (apiClient as unknown as {
      models: { GroupActivity: { list: (i: {
        filter: { groupId: { eq: string } }; limit?: number;
      }) => Promise<{ data?: Array<{ groupId: string; kind: string; userId: string; payload: string | null; createdAt: string }> | null }> } };
    }).models.GroupActivity.list({ filter: { groupId: { eq: groupId } }, limit: 50 });
  }
```
(Traer hasta 50 y ordenar/recortar en el front; el filtro no garantiza orden por el GSI desde `.list`. `limit` param del método se usa al recortar en el rail.)

- [ ] **Step 2: right-rail** — reemplazar el `demoActivity` por datos reales:
  - Añadir signal `activity = signal<Array<{ icon: IconName; text: string; time: string }>>([]);`.
  - Crear `loadActivity(groupId: string)` que llama `this.api.listGroupActivity(groupId)`, mapea cada fila con `mapActivity(kind, payload, createdAt)` → `{ icon, text, time }`, ordena por `createdAt` desc, recorta a 4, set en el signal. Limpiar (`activity.set([])`) al salir de `/groups/:id`.
  - Llamar `loadActivity(id)` desde donde ya se llama `loadChampDist(groupId)` (en `applyRoute`/`onGroupDetail`), y limpiar junto a `champDist` cuando `!onGroupDetail`.
  - Mapeo `mapActivity`:
    ```typescript
    private mapActivity(kind: string, payload: Record<string, unknown>): { icon: IconName; text: string } {
      const handle = (payload['handle'] as string) ?? '';
      const who = handle ? '@' + handle : 'Alguien';
      switch (kind) {
        case 'JOINED': return { icon: 'users', text: `${who} se unió al grupo` };
        case 'COMODIN': return { icon: 'zap', text: `${who} usó un comodín` };
        case 'EXACT_SCORE': return { icon: 'check', text: `${who} acertó un marcador exacto` };
        case 'LEADER_CHANGE': return { icon: 'trophy', text: `${who} tomó el 1° lugar del grupo` };
        default: return { icon: 'info', text: 'Actividad del grupo' };
      }
    }
    ```
    (El `who` para EXACT_SCORE/COMODIN/LEADER_CHANGE necesita el handle del `userId`; el `payload` de JOINED ya trae `handle`, pero los demás no. Resolver: en el map, si no hay `payload.handle`, usar `this.api.getUser(userId)` para el handle —cachear— o, más simple, incluir el handle en el payload de cada emisor. Dado que los emisores COMODIN/EXACT_SCORE/LEADER_CHANGE NO cargan el handle, hacer la resolución en el front: `loadActivity` mapea con `await Promise.all(rows.map(...))` resolviendo handle por `getUser(userId)` cuando falte. Mantener simple: resolver handle por `getUser` para todas las filas y pasar a `mapActivity(kind, {handle})`.)
  - El "time" relativo: reutilizar el helper de tiempo relativo que ya use el rail para noticias/picks si existe (buscar `hace`/`relativeTime`/`timeAgo` en el componente); si no hay, añadir un `relTime(iso)` simple (min/h/día).
  - En el template (≈línea 107-121): cambiar `@for (a of demoActivity; ...)` por `@for (a of activity(); track a.text)`, y **quitar** el badge `<span class="rr-demo">Ejemplo</span>`. Envolver la card en `@if (activity().length) { ... }` para no mostrar card vacía. Borrar la propiedad `demoActivity` y su comentario.

- [ ] **Step 3: Verify** — `npx tsc --noEmit -p tsconfig.app.json` clean; `npm test -- --no-watch` verde (si hay spec de right-rail, ajustar mocks: añadir `listGroupActivity: jest.fn().mockResolvedValue({ data: [] })` y `getUser` ya mockeado). **Commit:** `feat(right-rail): feed de actividad real (reemplaza demoActivity)`.

---

### Task 9 (humano): Deploy

- [ ] `cd polla-backend && npx ampx sandbox --profile polla` → copiar `amplify_outputs.json` a `polla-app/` y `polla-app/src/`.
- [ ] Verificar: unirse a un grupo → aparece JOINED; usar comodín → COMODIN; correr `scoreMatch` con un pick exacto → EXACT_SCORE; correr `snapshotStandings` dos jornadas con cambio de líder → LEADER_CHANGE.

## Notas
- Todos los emits son **best-effort** (`try/catch`): nunca abortan el flujo principal (join/score/comodín/snapshot).
- Tras Sub-5 **no queda ningún dato hardcodeado** de demo en el detalle de grupo / rail (`demoChampDist` ya se fue en Sub-3, `demoActivity` se va aquí). Actualizar la memoria `polla-hardcoded-placeholders.md`.
- El front resuelve `handle` por `userId` vía `getUser` (cacheado). Alternativa futura: que cada emisor guarde el handle en `payload` para evitar el N+1 en el rail.
