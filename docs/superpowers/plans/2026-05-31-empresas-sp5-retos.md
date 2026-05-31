# Empresas SP-5 — Retos de empresa (trivia por empresa) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps usan `- [ ]`. **Es el sub-proyecto más grande de Empresas** — ejecutar con sesión fresca.

**Goal:** Que RRHH cree **retos** (preguntas tipo trivia) para su empresa; los empleados los responden y ganan **puntos extra que solo cuentan dentro de la empresa** (sin tocar el torneo global ni los grupos de amigos); el ranking corporativo (SP-3) suma ese bono.

**Architecture:** Sistema **aislado** del trivia por-partido existente. 3 modelos nuevos (`CompanyTrivia`, `CompanyTriviaAnswer`, `UserCompanyTriviaTotal`). El scoring es **server-side al responder** (`answerCompanyTrivia` lambda lee `correctOption`, no expuesto al cliente, y suma a `UserCompanyTriviaTotal`). El resolver `companyRanking` (SP-3) se extiende para sumar, por empleado, su `UserCompanyTriviaTotal.points` a sus puntos de torneo. RRHH crea retos vía `createCompanyTrivia` (auth company-admin); el empleado lista los abiertos vía `listOpenCompanyTrivia` (resolver que **omite** `correctOption`).

**Decisiones (confirmadas en brainstorming):** SP-5 = trivia/retos por empresa (no sponsors); gestionado por RRHH en su portal; solo aplica a esa empresa (puntos aislados, sumados al ranking de empresa). Respeta "puntos compartidos del torneo": el bono de retos es privado de la empresa, no entra a UTT/UGT.

**Tech Stack:** Amplify Gen2 (AppSync, DynamoDB, Lambda TS, jest), Angular 18 standalone (signals).

**Convenciones de test:** backend `cd polla-backend && npx jest --maxWorkers=2 <pattern>`; front `cd polla-app && npm test -- --no-watch --test-path-pattern=<pattern>`. Node PATH (PowerShell): `$env:Path = "$env:ProgramFiles\nodejs;" + $env:Path`.

---

## File Structure
- Modify `polla-backend/amplify/data/resource.ts` — 3 modelos + 3 mutations/queries (`createCompanyTrivia`, `answerCompanyTrivia`, `listOpenCompanyTrivia`).
- Create lambdas `amplify/functions/{create-company-trivia,answer-company-trivia,list-open-company-trivia}/{resource.ts,handler.ts}` + tests.
- Modify `amplify/functions/company-ranking/handler.ts` — sumar `UserCompanyTriviaTotal` al ranking.
- Modify `amplify/backend.ts` — wiring (3 lambdas + el nuevo grant de la tabla en company-ranking).
- Modify `polla-app/src/app/core/api/api.service.ts` — métodos.
- Create `polla-app/src/app/features/empresa/empresa-retos.component.ts` (RRHH) + ruta `/empresa/:id/retos` + link en shell.
- Modify `polla-app/src/app/features/empresa/mi-empresa.component.ts` — sección "Retos" (responder).

---

## TASK 1 — Modelos `CompanyTrivia`, `CompanyTriviaAnswer`, `UserCompanyTriviaTotal`

**Files:** Modify `amplify/data/resource.ts`

- [ ] **Step 1:** Cerca de los modelos de empresa, añadir:

```typescript
  CompanyTrivia: a
    .model({
      companyId: a.id().required(),
      prompt: a.string().required(),
      optionA: a.string().required(),
      optionB: a.string().required(),
      optionC: a.string().required(),
      optionD: a.string().required(),
      correctOption: a.string().required(),   // 'A'|'B'|'C'|'D'  (NO exponer al jugador → listar vía resolver)
      points: a.integer().required(),         // recompensa
      publishedAt: a.datetime().required(),
      createdBy: a.id().required(),
      createdAt: a.datetime().required(),
    })
    .secondaryIndexes((idx) => [idx('companyId').sortKeys(['publishedAt']).name('companyTriviaByCompany')])
    .disableOperations(['create', 'update', 'delete'])
    .authorization((allow) => [
      // Nota: 'read' authenticated expone correctOption (igual que el TriviaQuestion
      // global actual). El jugador usa listOpenCompanyTrivia (sin correctOption);
      // este read directo lo usa RRHH/admin. Aceptado para MVP (mismo trade-off que H-03).
      allow.authenticated().to(['read']),
      allow.group('admins'),
    ]),

  CompanyTriviaAnswer: a
    .model({
      userId: a.id().required(),
      questionId: a.id().required(),
      companyId: a.id().required(),
      selectedOption: a.string().required(),
      isCorrect: a.boolean().required(),
      pointsEarned: a.integer().required(),
      answeredAt: a.datetime().required(),
    })
    .secondaryIndexes((idx) => [
      idx('userId').sortKeys(['questionId']).name('companyTriviaAnswersByUser'),
      idx('questionId').name('companyTriviaAnswersByQuestion'),
    ])
    .disableOperations(['create', 'update', 'delete'])
    .authorization((allow) => [
      allow.ownerDefinedIn('userId').to(['read']),
      allow.group('admins'),
    ]),

  UserCompanyTriviaTotal: a
    .model({
      companyId: a.id().required(),
      userId: a.id().required(),
      points: a.integer().required(),
    })
    .identifier(['companyId', 'userId'])
    .secondaryIndexes((idx) => [idx('companyId').name('companyTriviaTotalsByCompany')])
    .disableOperations(['create', 'update', 'delete'])
    .authorization((allow) => [
      allow.authenticated().to(['read']),
      allow.group('admins'),
    ]),
```

- [ ] **Step 2:** `npx tsc --noEmit` (exit 0 fuentes). **Commit:** `feat(schema): modelos CompanyTrivia/CompanyTriviaAnswer/UserCompanyTriviaTotal`.

---

## TASK 2 — Lambda `create-company-trivia` (TDD)

**Files:** Create `amplify/functions/create-company-trivia/{resource.ts,handler.ts}` + test

Auth: super-admin o company-admin (`isCompanyAdmin`) de companyId; empresa ACTIVE para no-super. Valida: prompt no vacío, 4 opciones, `correctOption` ∈ {A,B,C,D}, `points` 1..100. Crea la fila `CompanyTrivia` (id ulid, createdBy=caller, publishedAt = arg o now).

- [ ] **Step 1: resource.ts** (mirror `invite-department-head/resource.ts`, name `create-company-trivia`).
- [ ] **Step 2: test** (mirror `add-company-admin.test.ts` harness; setEnv COMPANY_TABLE, COMPANY_MEMBER_TABLE, COMPANY_MEMBER_INDEX='companiesByUser', COMPANY_TRIVIA_TABLE): super-admin crea → PutCommand con companyId/prompt/correctOption/points/createdBy; company-admin crea → ok; no-admin → NOT_COMPANY_ADMIN; correctOption inválido → VALIDATION_ERROR. RED.
- [ ] **Step 3: handler.ts:**

```typescript
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import { ulid } from 'ulid';
import { DomainError } from '../../../src/lib/errors';
import { isCompanyAdmin } from '../../../src/lib/auth';

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const COMPANY = process.env['COMPANY_TABLE']!;
const COMPANY_MEMBER = process.env['COMPANY_MEMBER_TABLE']!;
const COMPANY_MEMBER_INDEX = process.env['COMPANY_MEMBER_INDEX']!;
const TRIVIA = process.env['COMPANY_TRIVIA_TABLE']!;

interface AppSyncEvent {
  arguments: { companyId: string; prompt: string; optionA: string; optionB: string; optionC: string; optionD: string; correctOption: string; points: number };
  identity: { sub: string; groups?: ReadonlyArray<string> };
}
interface Response { ok: boolean; id: string }

export async function handler(event: AppSyncEvent): Promise<Response> {
  const caller = event.identity.sub;
  const isSuperAdmin = (event.identity.groups ?? []).includes('admins');
  const a = event.arguments;

  const companyRes = await ddb.send(new GetCommand({ TableName: COMPANY, Key: { id: a.companyId } }));
  const company = companyRes.Item as { status: string } | undefined;
  if (!company) throw new DomainError('COMPANY_NOT_FOUND');
  if (!isSuperAdmin) {
    const admin = await isCompanyAdmin(ddb, COMPANY_MEMBER, COMPANY_MEMBER_INDEX, caller, a.companyId);
    if (!admin) throw new DomainError('NOT_COMPANY_ADMIN');
    if (company.status === 'DISABLED') throw new DomainError('COMPANY_DISABLED');
  }
  if (!a.prompt?.trim() || !['A', 'B', 'C', 'D'].includes(a.correctOption)) throw new DomainError('VALIDATION_ERROR');
  if (!a.optionA || !a.optionB || !a.optionC || !a.optionD) throw new DomainError('VALIDATION_ERROR');
  if (!Number.isInteger(a.points) || a.points < 1 || a.points > 100) throw new DomainError('VALIDATION_ERROR');

  const id = ulid();
  const now = new Date().toISOString();
  await ddb.send(new PutCommand({ TableName: TRIVIA, Item: {
    __typename: 'CompanyTrivia', id, companyId: a.companyId,
    prompt: a.prompt.trim(), optionA: a.optionA, optionB: a.optionB, optionC: a.optionC, optionD: a.optionD,
    correctOption: a.correctOption, points: a.points, publishedAt: now, createdBy: caller, createdAt: now, updatedAt: now,
  }}));
  return { ok: true, id };
}
```

- [ ] **Step 4:** GREEN + **Commit:** `feat(create-company-trivia): RRHH crea retos de empresa`.

---

## TASK 3 — Lambda `answer-company-trivia` (TDD, auto-score)

**Files:** Create `amplify/functions/answer-company-trivia/{resource.ts,handler.ts}` + test

El empleado responde. El handler: Get question; verifica que el caller sea miembro de un grupo de esa empresa (opcional MVP: confiar en companyId del question + que el front solo muestre los suyos — pero validar por seguridad: query `companyTriviaAnswersByUser` para evitar doble respuesta); compara `selectedOption` con `correctOption`; escribe `CompanyTriviaAnswer` (con ConditionExpression para impedir 2ª respuesta a la misma question) y, si correcto, `ADD points` a `UserCompanyTriviaTotal(companyId,userId)`.

- [ ] **Step 1: resource.ts** (name `answer-company-trivia`).
- [ ] **Step 2: test:** responde correcto → CompanyTriviaAnswer.isCorrect=true, pointsEarned=points, y UpdateCommand `ADD points` a UCTT; responde incorrecto → isCorrect=false, pointsEarned=0, sin Update a UCTT; doble respuesta → `ALREADY_ANSWERED` (nuevo código en errors.ts). RED.
- [ ] **Step 3: errors.ts** añadir `ALREADY_ANSWERED: 'ALREADY_ANSWERED'`. **handler.ts:**

```typescript
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, PutCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { ulid } from 'ulid';
import { DomainError } from '../../../src/lib/errors';

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const TRIVIA = process.env['COMPANY_TRIVIA_TABLE']!;
const ANSWER = process.env['COMPANY_TRIVIA_ANSWER_TABLE']!;
const TOTAL = process.env['USER_COMPANY_TRIVIA_TOTAL_TABLE']!;

interface AppSyncEvent { arguments: { questionId: string; selectedOption: string }; identity: { sub: string }; }
interface Response { isCorrect: boolean; pointsEarned: number }

export async function handler(event: AppSyncEvent): Promise<Response> {
  const userId = event.identity.sub;
  const { questionId, selectedOption } = event.arguments;

  const qRes = await ddb.send(new GetCommand({ TableName: TRIVIA, Key: { id: questionId } }));
  const q = qRes.Item as { id: string; companyId: string; correctOption: string; points: number } | undefined;
  if (!q) throw new DomainError('VALIDATION_ERROR');

  const isCorrect = selectedOption === q.correctOption;
  const pointsEarned = isCorrect ? q.points : 0;
  const now = new Date().toISOString();
  const answerId = ulid();

  // Una respuesta por (userId, questionId). El id es ulid pero la unicidad se
  // garantiza con un id determinista + ConditionExpression.
  const detId = `${userId}#${questionId}`;
  try {
    await ddb.send(new PutCommand({
      TableName: ANSWER,
      Item: {
        __typename: 'CompanyTriviaAnswer', id: detId, userId, questionId, companyId: q.companyId,
        selectedOption, isCorrect, pointsEarned, answeredAt: now, createdAt: now, updatedAt: now,
      },
      ConditionExpression: 'attribute_not_exists(id)',
    }));
  } catch (err) {
    if ((err as { name?: string }).name === 'ConditionalCheckFailedException') throw new DomainError('ALREADY_ANSWERED');
    throw err;
  }

  if (pointsEarned > 0) {
    await ddb.send(new UpdateCommand({
      TableName: TOTAL,
      Key: { companyId: q.companyId, userId },
      UpdateExpression: 'ADD points :p SET updatedAt = :u, __typename = if_not_exists(__typename, :t), createdAt = if_not_exists(createdAt, :u)',
      ExpressionAttributeValues: { ':p': pointsEarned, ':u': now, ':t': 'UserCompanyTriviaTotal' },
    }));
  }
  return { isCorrect, pointsEarned };
}
```
(Nota: el `id` determinista `userId#questionId` reemplaza al ulid para la unicidad — ajusta el `CompanyTriviaAnswer` test en consecuencia. Si se prefiere ulid + GSI-check, query `companyTriviaAnswersByUser` filtrando questionId antes del Put; el approach determinista es más simple y atómico.)

- [ ] **Step 4:** GREEN + **Commit:** `feat(answer-company-trivia): responder reto + auto-score aislado`.

---

## TASK 4 — Query `list-open-company-trivia` (resolver sin correctOption)

**Files:** Create `amplify/functions/list-open-company-trivia/{resource.ts,handler.ts}` + test

El empleado lista los retos publicados de su empresa, **sin** `correctOption`, marcando los ya respondidos. Query `companyTriviaByCompany(companyId)` + query `companyTriviaAnswersByUser(userId)` para saber cuáles respondió.

- [ ] **Step 1-3 (TDD):** handler devuelve `Array<{ id, prompt, optionA-D, points, answered: boolean }>` (omite correctOption). Auth: cualquier autenticado (el front solo lo llama para la empresa del empleado; los datos no son sensibles salvo correctOption, que se omite). Test: 2 questions, 1 respondida → marca `answered` correcto, sin `correctOption` en el payload.
- [ ] **Step 4:** GREEN + **Commit:** `feat(list-open-company-trivia): retos abiertos sin exponer la respuesta`.

---

## TASK 5 — Extender `company-ranking` con el bono de retos

**Files:** Modify `amplify/functions/company-ranking/handler.ts` + su test

- [ ] **Step 1:** Tras acumular `flat`/`employees` desde UGT, query `UserCompanyTriviaTotal` por `companyTriviaTotalsByCompany(companyId)` → mapa `userId → triviaPoints`. Sumar ese bono a cada empleado en `individual` (y al `points` de su departamento). Env nuevo `USER_COMPANY_TRIVIA_TOTAL_TABLE`. Test: empleado con 30 pts torneo + 5 de retos → aparece con 35; el departamento suma el bono.
- [ ] **Step 2:** GREEN + **Commit:** `feat(company-ranking): suma el bono de retos de empresa`.

---

## TASK 6 — Mutations/queries en schema + wiring

**Files:** Modify `amplify/data/resource.ts`, `amplify/backend.ts`

- [ ] **Step 1: resource.ts** — imports + defs:
```typescript
  createCompanyTrivia: a.mutation()
    .arguments({ companyId: a.id().required(), prompt: a.string().required(), optionA: a.string().required(), optionB: a.string().required(), optionC: a.string().required(), optionD: a.string().required(), correctOption: a.string().required(), points: a.integer().required() })
    .returns(a.customType({ ok: a.boolean().required(), id: a.string().required() }))
    .authorization((allow) => [allow.authenticated()])
    .handler(a.handler.function(createCompanyTrivia)),
  answerCompanyTrivia: a.mutation()
    .arguments({ questionId: a.id().required(), selectedOption: a.string().required() })
    .returns(a.customType({ isCorrect: a.boolean().required(), pointsEarned: a.integer().required() }))
    .authorization((allow) => [allow.authenticated()])
    .handler(a.handler.function(answerCompanyTrivia)),
  CompanyOpenTrivia: a.customType({ id: a.string().required(), prompt: a.string().required(), optionA: a.string().required(), optionB: a.string().required(), optionC: a.string().required(), optionD: a.string().required(), points: a.integer().required(), answered: a.boolean().required() }),
  listOpenCompanyTrivia: a.query()
    .arguments({ companyId: a.id().required() })
    .returns(a.ref('CompanyOpenTrivia').array())
    .authorization((allow) => [allow.authenticated()])
    .handler(a.handler.function(listOpenCompanyTrivia)),
```
- [ ] **Step 2: backend.ts** — añadir las 3 funciones a `defineBackend`, declarar consts `companyTriviaTable`/`companyTriviaAnswerTable`/`userCompanyTriviaTotalTable` desde `tables[...]`, y wirear: create (Company read+CM index, CompanyTrivia write), answer (CompanyTrivia read, CompanyTriviaAnswer write, UCTT readWrite), list (CompanyTrivia read + grantIndexQuery, CompanyTriviaAnswer read + grantIndexQuery), y a `company-ranking` añadir `USER_COMPANY_TRIVIA_TOTAL_TABLE` env + `userCompanyTriviaTotalTable.grantReadData` + `grantIndexQuery`.
- [ ] **Step 3:** `npx tsc --noEmit` (exit 0 fuentes) + `npx jest --maxWorkers=2` (verde). **Commit:** `feat(schema): mutations/queries de retos de empresa + wiring`.

---

## TASK 7 — Front RRHH: pantalla "Retos" (`/empresa/:id/retos`)

**Files:** Create `src/app/features/empresa/empresa-retos.component.ts`; Modify `empresa.routes.ts` (+ ruta `retos`) y `empresa-shell.component.ts` (+ link "Retos")

- [ ] **api.service:** `createCompanyTrivia(input)`, `listCompanyTrivia(companyId)` (= `models.CompanyTrivia.list` filter companyId). 
- [ ] **Componente:** form (prompt, 4 opciones, correctOption select, points) → `createCompanyTrivia`; lista los retos existentes (con su `correctOption`, visible para RRHH). Mirror `empresa-premios`/`empresa-jefes`. Lee `route.parent?.snapshot.paramMap.get('id')`.
- [ ] **Commit:** `feat(empresa): pantalla Retos (RRHH crea trivia de empresa)`.

---

## TASK 8 — Front empleado: sección "Retos" en "Mi empresa"

**Files:** Modify `src/app/features/empresa/mi-empresa.component.ts`

- [ ] **api.service:** `listOpenCompanyTrivia(companyId)`, `answerCompanyTrivia(input)`.
- [ ] En "Mi empresa", añadir una sección "🎯 Retos": lista los retos abiertos (sin respuesta); cada uno con sus 4 opciones; al elegir → `answerCompanyTrivia` → toast con resultado (correcto/+N pts) y recargar (el reto desaparece de abiertos + el ranking se actualiza al recargar). 
- [ ] **Commit:** `feat(empresa): responder retos en Mi empresa`.

---

## Self-Review (cobertura del diseño SP-5)

- **RRHH crea retos por empresa:** Tasks 2, 6, 7. ✓
- **Empleado responde, auto-score server-side, sin exponer `correctOption`:** Tasks 3, 4, 8. ✓
- **Puntos aislados (no tocan UTT/UGT) → solo cuentan en la empresa:** Task 3 (escribe a `UserCompanyTriviaTotal`). ✓
- **Ranking de empresa suma el bono:** Task 5. ✓
- **Una respuesta por reto (no farmear):** Task 3 (id determinista + ConditionExpression). ✓
- **Auth:** crear = company-admin; responder/listar = autenticado (front limita a la empresa del empleado). ✓

**Consistencia de tipos:** `answerCompanyTrivia`→`{isCorrect,pointsEarned}`; `createCompanyTrivia`→`{ok,id}`; `listOpenCompanyTrivia`→`CompanyOpenTrivia[]` (sin correctOption). GSIs: `companyTriviaByCompany`, `companyTriviaAnswersByUser`, `companyTriviaTotalsByCompany`.

**Riesgos:**
- `correctOption` es readable vía el modelo `CompanyTrivia` para cualquier autenticado (mismo trade-off que el TriviaQuestion global). Mitigación MVP: el jugador usa `listOpenCompanyTrivia` (sin correctOption); cerrar el leak requiere field-level auth (post-MVP, ver H-03).
- El bono de retos hace que el ranking de empresa ≠ ranking de torneo del empleado — **es lo deseado** (puntos extra privados de la empresa).

**Deploy (humano):** `npx ampx sandbox --once --profile polla` + copiar `amplify_outputs.json`.

---

## Execution Handoff
Sesión fresca recomendada (sub-proyecto grande: 3 modelos + 3 lambdas + extensión de ranking + 2 pantallas). Ejecutar con **subagent-driven-development**: backend Tasks 1-6, front Tasks 7-8, revisión entre lotes, luego deploy.
