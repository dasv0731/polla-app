# Empresas SP-3 — Ranking 3 niveles + "Mi empresa" — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development o executing-plans. Steps usan `- [ ]`.

**Goal:** Calcular y mostrar el **ranking corporativo** de una empresa en 3 niveles — 🏆 individual de toda la empresa, 🏟️ por departamento (suma) — vía un resolver **on-read**, y exponerlo al empleado en una vista **"Mi empresa"** con branding contextual.

**Architecture:** Backend — un resolver `companyRanking(companyId)` (Lambda, on-read) que reúne los departamentos (`Group` por `groupsByCompany`), sus totales (`UserGroupTotal` por `leaderboardByGroup`) y arma los rankings; reusa el scoring existente (cero escrituras). Como 1 empleado = 1 departamento por empresa, su UGT en su departamento ES su puntaje. Auth: super-admin, company-admin, o empleado de la empresa. Frontend — `api.companyRanking` + una página "Mi empresa" que detecta la empresa del empleado (su grupo con `companyId`), pinta los rankings y aplica los colores de la empresa como variables CSS.

**Tech Stack:** Amplify Gen2 (AppSync, DynamoDB, Lambda TS, jest), Angular 18 standalone (signals).

**Convenciones de test:** backend `cd polla-backend && npx jest --maxWorkers=2 <pattern>`; front `cd polla-app && npm test -- --no-watch --test-path-pattern=<pattern>`. Node PATH (PowerShell): `$env:Path = "$env:ProgramFiles\nodejs;" + $env:Path`.

---

## File Structure
- Create `polla-backend/amplify/functions/company-ranking/{resource.ts,handler.ts}` + `tests/unit/company-ranking.test.ts`.
- Modify `polla-backend/amplify/data/resource.ts` — custom types + query `companyRanking`.
- Modify `polla-backend/amplify/backend.ts` — wiring.
- Modify `polla-app/src/app/core/api/api.service.ts` — `companyRanking` + `findMyCompanyId`.
- Create `polla-app/src/app/features/empresa/mi-empresa.component.ts` + ruta `/mi-empresa`.
- Modify `polla-app/src/app/app.routes.ts` — montar `/mi-empresa`.

---

## TASK 1 — Lambda `company-ranking` (TDD)

**Files:** Create `amplify/functions/company-ranking/{resource.ts,handler.ts}` + `tests/unit/company-ranking.test.ts`

Patrón de referencia: `amplify/functions/group-champion-distribution/handler.ts` (resolver on-read que lee GSIs). GSIs disponibles: `Group.groupsByCompany` (companyId), `UserGroupTotal.leaderboardByGroup` (groupId). `User` se lee por `sub`. `isCompanyAdmin(ddb, COMPANY_MEMBER, COMPANY_MEMBER_INDEX, userId, companyId)` ya existe.

- [ ] **Step 1: `resource.ts`:**

```typescript
import { defineFunction } from '@aws-amplify/backend';

export const companyRanking = defineFunction({
  name: 'company-ranking',
  entry: './handler.ts',
  runtime: 20,
  timeoutSeconds: 20,
  resourceGroupName: 'data',
});
```

- [ ] **Step 2: Test que falla** `tests/unit/company-ranking.test.ts` (mirror harness de `group-champion-distribution.test.ts` — mock secuencial de `ddb.send`). `setEnv`: GROUP_TABLE='G', USER_GROUP_TOTAL_TABLE='UGT', USER_TABLE='U', COMPANY_MEMBER_TABLE='CM', COMPANY_MEMBER_INDEX='companiesByUser'. Caso principal:
  - groupsByCompany(c1) → `[{id:'g1',name:'Ventas'},{id:'g2',name:'IT'}]`
  - UGT leaderboardByGroup(g1) → `[{userId:'u1',points:30}]`
  - UGT leaderboardByGroup(g2) → `[{userId:'u2',points:50}]`
  - User get(u1)→`{sub:'u1',handle:'ana'}`, get(u2)→`{sub:'u2',handle:'beto'}`
  - caller = super-admin (`groups:['admins']`)
  - Assert: `individual` = `[{userId:'u2',handle:'beto',points:50,department:'IT'},{userId:'u1',handle:'ana',points:30,department:'Ventas'}]`; `departments` = `[{groupId:'g2',name:'IT',points:50,members:1},{groupId:'g1',name:'Ventas',points:30,members:1}]`.

```typescript
it('arma los rankings individual + por departamento (orden desc)', async () => {
  const res = await handler({ arguments: { companyId: 'c1' }, identity: { sub: 'super', groups: ['admins'] } } as never);
  expect(res.individual.map((r) => r.userId)).toEqual(['u2', 'u1']);
  expect(res.individual[0]).toMatchObject({ handle: 'beto', points: 50, department: 'IT' });
  expect(res.departments.map((d) => d.name)).toEqual(['IT', 'Ventas']);
  expect(res.departments[0]).toMatchObject({ points: 50, members: 1 });
});

it('caller que no es admin ni empleado: NOT_COMPANY_ADMIN', async () => {
  // groupsByCompany→[g1]; UGT g1→[{userId:'u1',points:10}]; companiesByUser(rando)→[]
  await expect(handler({ arguments: { companyId: 'c1' }, identity: { sub: 'rando', groups: [] } } as never))
    .rejects.toMatchObject({ code: 'NOT_COMPANY_ADMIN' });
});
```

- [ ] **Step 3: Confirmar fail.** `cd polla-backend && npx jest --maxWorkers=2 company-ranking`

- [ ] **Step 4: Implementar `handler.ts`:**

```typescript
/**
 * company-ranking Lambda (on-read)
 *
 * Arma el ranking corporativo de 3 niveles reusando los totales existentes:
 *  - individual: empleados (todos los departamentos) por puntos desc.
 *  - departments: suma de puntos por departamento (competencia inter-depto).
 * Auth: super-admin, company-admin de companyId, o empleado de la empresa.
 */
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand, GetCommand } from '@aws-sdk/lib-dynamodb';
import { DomainError } from '../../../src/lib/errors';
import { isCompanyAdmin } from '../../../src/lib/auth';

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const GROUP = process.env['GROUP_TABLE']!;
const UGT = process.env['USER_GROUP_TOTAL_TABLE']!;
const USER = process.env['USER_TABLE']!;
const COMPANY_MEMBER = process.env['COMPANY_MEMBER_TABLE']!;
const COMPANY_MEMBER_INDEX = process.env['COMPANY_MEMBER_INDEX']!;

interface AppSyncEvent { arguments: { companyId: string }; identity: { sub: string; groups?: ReadonlyArray<string> }; }
interface Row { userId: string; handle: string; points: number; department: string }
interface Dept { groupId: string; name: string; points: number; members: number }
interface Result { individual: Row[]; departments: Dept[] }

export async function handler(event: AppSyncEvent): Promise<Result> {
  const caller = event.identity.sub;
  const isSuperAdmin = (event.identity.groups ?? []).includes('admins');
  const { companyId } = event.arguments;

  // 1. Departamentos de la empresa.
  const groupsRes = await ddb.send(new QueryCommand({
    TableName: GROUP, IndexName: 'groupsByCompany',
    KeyConditionExpression: 'companyId = :c',
    ExpressionAttributeValues: { ':c': companyId },
  }));
  const groups = ((groupsRes.Items ?? []) as Array<{ id: string; name: string }>);

  // 2. Totales por departamento + por empleado.
  const departments: Dept[] = [];
  const flat: Array<{ userId: string; points: number; department: string }> = [];
  const employees = new Set<string>();
  for (const g of groups) {
    const totalsRes = await ddb.send(new QueryCommand({
      TableName: UGT, IndexName: 'leaderboardByGroup',
      KeyConditionExpression: 'groupId = :g',
      ExpressionAttributeValues: { ':g': g.id },
    }));
    const rows = ((totalsRes.Items ?? []) as Array<{ userId: string; points?: number }>);
    let sum = 0;
    for (const r of rows) {
      const pts = r.points ?? 0;
      sum += pts;
      flat.push({ userId: r.userId, points: pts, department: g.name });
      employees.add(r.userId);
    }
    departments.push({ groupId: g.id, name: g.name, points: sum, members: rows.length });
  }

  // 3. Auth: super-admin, company-admin, o empleado de la empresa.
  if (!isSuperAdmin && !employees.has(caller)) {
    const admin = await isCompanyAdmin(ddb, COMPANY_MEMBER, COMPANY_MEMBER_INDEX, caller, companyId);
    if (!admin) throw new DomainError('NOT_COMPANY_ADMIN');
  }

  // 4. Resolver handles.
  const handles = new Map<string, string>();
  await Promise.all([...employees].map(async (sub) => {
    const u = await ddb.send(new GetCommand({ TableName: USER, Key: { sub } }));
    handles.set(sub, (u.Item as { handle?: string } | undefined)?.handle ?? sub.slice(0, 6));
  }));

  const individual: Row[] = flat
    .map((f) => ({ userId: f.userId, handle: handles.get(f.userId) ?? f.userId.slice(0, 6), points: f.points, department: f.department }))
    .sort((a, b) => b.points - a.points);
  departments.sort((a, b) => b.points - a.points);

  return { individual, departments };
}
```

- [ ] **Step 5: Pass.** `cd polla-backend && npx jest --maxWorkers=2 company-ranking`
- [ ] **Step 6: Commit.**

```bash
git add amplify/functions/company-ranking/ tests/unit/company-ranking.test.ts
git commit -m "feat(company-ranking): resolver on-read del ranking corporativo (3 niveles)"
```

---

## TASK 2 — Custom types + query en schema

**Files:** Modify `amplify/data/resource.ts`

- [ ] **Step 1: Import** (junto a los otros): `import { companyRanking } from '../functions/company-ranking/resource';`

- [ ] **Step 2: Custom types + query** (cerca de otras custom queries como `groupChampionDistribution`):

```typescript
  CompanyRankingRow: a.customType({
    userId: a.string().required(),
    handle: a.string().required(),
    points: a.integer().required(),
    department: a.string().required(),
  }),
  CompanyRankingDept: a.customType({
    groupId: a.string().required(),
    name: a.string().required(),
    points: a.integer().required(),
    members: a.integer().required(),
  }),
  CompanyRanking: a.customType({
    individual: a.ref('CompanyRankingRow').array(),
    departments: a.ref('CompanyRankingDept').array(),
  }),

  companyRanking: a
    .query()
    .arguments({ companyId: a.id().required() })
    .returns(a.ref('CompanyRanking'))
    .authorization((allow) => [allow.authenticated()])
    .handler(a.handler.function(companyRanking)),
```
(Si la síntesis rechaza `a.ref('X').array()` dentro de un `customType`, fallback: define la query devolviendo `a.ref('CompanyRankingRow').array()` para `individual` y una 2ª query `companyDepartmentRanking` devolviendo `a.ref('CompanyRankingDept').array()`. Pero intenta primero el tipo combinado — es el patrón soportado.)

- [ ] **Step 3: Typecheck.** `cd polla-backend && npx tsc --noEmit` (exit 0 en fuentes). **Commit:**

```bash
git add amplify/data/resource.ts
git commit -m "feat(schema): query companyRanking + custom types"
```

---

## TASK 3 — Wiring en backend.ts

**Files:** Modify `amplify/backend.ts`

- [ ] **Step 1:** import `import { companyRanking } from './functions/company-ranking/resource';`, añade `companyRanking,` a `defineBackend({...})`, y wiring (reusa `groupTable`, `ugtTable`, `userTable`, `companyMemberTable`):

```typescript
// company-ranking (on-read): query Group.groupsByCompany + UGT.leaderboardByGroup; read User; read CompanyMember.companiesByUser.
backend.companyRanking.addEnvironment('GROUP_TABLE', groupTable.tableName);
backend.companyRanking.addEnvironment('USER_GROUP_TOTAL_TABLE', ugtTable.tableName);
backend.companyRanking.addEnvironment('USER_TABLE', userTable.tableName);
backend.companyRanking.addEnvironment('COMPANY_MEMBER_TABLE', companyMemberTable.tableName);
backend.companyRanking.addEnvironment('COMPANY_MEMBER_INDEX', 'companiesByUser');
groupTable.grantReadData(backend.companyRanking.resources.lambda);
ugtTable.grantReadData(backend.companyRanking.resources.lambda);
userTable.grantReadData(backend.companyRanking.resources.lambda);
companyMemberTable.grantReadData(backend.companyRanking.resources.lambda);
grantIndexQuery(groupTable, backend.companyRanking.resources.lambda);
grantIndexQuery(ugtTable, backend.companyRanking.resources.lambda);
grantIndexQuery(companyMemberTable, backend.companyRanking.resources.lambda);
```

- [ ] **Step 2: Typecheck + suite.** `cd polla-backend && npx tsc --noEmit` (exit 0 fuentes) + `npx jest --maxWorkers=2` (verde; reporta total). **Commit:**

```bash
git add amplify/backend.ts
git commit -m "feat(schema): wiring company-ranking"
```

---

## TASK 4 — api.service: companyRanking + findMyCompanyId

**Files:** Modify `src/app/core/api/api.service.ts`

- [ ] **Step 1:** Añadir (cast, no deployado en tipos):

```typescript
  /** Ranking corporativo (3 niveles) de una empresa. */
  companyRanking(companyId: string) {
    return (apiClient as unknown as {
      queries: { companyRanking: (i: { companyId: string }) => Promise<{ data?: {
        individual: Array<{ userId: string; handle: string; points: number; department: string }>;
        departments: Array<{ groupId: string; name: string; points: number; members: number }>;
      } | null }> };
    }).queries.companyRanking({ companyId });
  }

  /** Detecta la empresa del empleado: su grupo con companyId. Devuelve el
   *  companyId o null. */
  async findMyCompanyId(userId: string): Promise<string | null> {
    const ms = (await apiClient.models.Membership.list({ filter: { userId: { eq: userId } } })).data ?? [];
    for (const m of ms) {
      const gid = (m as { groupId?: string } | null)?.groupId;
      if (!gid) continue;
      const g = (await apiClient.models.Group.get({ id: gid })).data as { companyId?: string | null } | null;
      if (g?.companyId) return g.companyId;
    }
    return null;
  }
```

- [ ] **Step 2: Typecheck.** `cd polla-app && npx tsc --noEmit -p tsconfig.app.json` → exit 0. **Commit:**

```bash
git add src/app/core/api/api.service.ts
git commit -m "feat(api): companyRanking + findMyCompanyId"
```

---

## TASK 5 — Página "Mi empresa" + ruta + branding contextual

**Files:** Create `src/app/features/empresa/mi-empresa.component.ts`; Modify `src/app/app.routes.ts`

- [ ] **Step 1: Componente** (detecta la empresa del empleado, pinta los 3 niveles y aplica los colores de la empresa al contenedor):

```typescript
import { Component, OnInit, inject, signal } from '@angular/core';
import { ApiService } from '../../core/api/api.service';
import { AuthService } from '../../core/auth/auth.service';

interface Row { userId: string; handle: string; points: number; department: string }
interface Dept { groupId: string; name: string; points: number; members: number }

@Component({
  standalone: true,
  selector: 'app-mi-empresa',
  template: `
    <section class="page" [style.--pa-brand]="brand()">
      <h1 class="page__title">Mi empresa</h1>
      @if (loading()) { <p>Cargando…</p> }
      @else if (!companyId()) { <p>No perteneces a ninguna empresa todavía.</p> }
      @else {
        <h2>🏆 Ranking de la empresa</h2>
        <table>
          <tr><th>#</th><th>Empleado</th><th>Departamento</th><th>Pts</th></tr>
          @for (r of individual(); track r.userId; let i = $index) {
            <tr><td>{{ i + 1 }}</td><td>{{ r.handle }}</td><td>{{ r.department }}</td><td>{{ r.points }}</td></tr>
          }
        </table>
        <h2>🏟️ Por departamento</h2>
        <table>
          <tr><th>#</th><th>Departamento</th><th>Pts</th><th>Miembros</th></tr>
          @for (d of departments(); track d.groupId; let i = $index) {
            <tr><td>{{ i + 1 }}</td><td>{{ d.name }}</td><td>{{ d.points }}</td><td>{{ d.members }}</td></tr>
          }
        </table>
      }
    </section>
  `,
})
export class MiEmpresaComponent implements OnInit {
  private api = inject(ApiService);
  private auth = inject(AuthService);

  companyId = signal<string | null>(null);
  individual = signal<Row[]>([]);
  departments = signal<Dept[]>([]);
  brand = signal<string>('#e23744');
  loading = signal(true);

  async ngOnInit() {
    const u = this.auth.user();
    if (!u) { this.loading.set(false); return; }
    const cid = await this.api.findMyCompanyId(u.sub);
    this.companyId.set(cid);
    if (cid) {
      const c = (await this.api.getCompany(cid)).data as { brandPrimary?: string | null } | null;
      if (c?.brandPrimary) this.brand.set(c.brandPrimary);
      const res = await this.api.companyRanking(cid);
      this.individual.set(res.data?.individual ?? []);
      this.departments.set(res.data?.departments ?? []);
    }
    this.loading.set(false);
  }
}
```

- [ ] **Step 2: Ruta.** En `src/app/app.routes.ts`, dentro de los `children` del `ShellComponent` (junto a `empresa`), añade:

```typescript
      {
        path: 'mi-empresa',
        loadComponent: () => import('./features/empresa/mi-empresa.component').then((m) => m.MiEmpresaComponent),
      },
```

- [ ] **Step 3: Typecheck + suite front.** `cd polla-app && npx tsc --noEmit -p tsconfig.app.json` (exit 0) + `npm test -- --no-watch` (verde). **Commit:**

```bash
git add src/app/features/empresa/mi-empresa.component.ts src/app/app.routes.ts
git commit -m "feat(empresa): vista Mi empresa (ranking 3 niveles + branding contextual)"
```

---

## Self-Review (cobertura del spec SP-3)

- **Resolver on-read `companyRanking` (3 niveles, reusa scoring):** Tasks 1-3. ✓
- **Ranking individual de empresa + por departamento (suma):** Task 1 (handler). ✓ (El ranking individual *por departamento* ya existe como el leaderboard de grupo — no se duplica.)
- **Auth: super-admin / company-admin / empleado:** Task 1. ✓
- **Vista "Mi empresa" del empleado + branding contextual:** Task 5 (aplica `brandPrimary` como var CSS). ✓
- **Detecta la empresa del empleado:** Task 4 (`findMyCompanyId`). ✓

**Consistencia de tipos:** `companyRanking` devuelve `{ individual: Row[], departments: Dept[] }` (handler ↔ custom types ↔ api.service ↔ UI). Env `COMPANY_MEMBER_INDEX='companiesByUser'`, GSIs `groupsByCompany`/`leaderboardByGroup` coinciden con los declarados.

**Notas:**
- El "switch 🏢 Mi empresa ⇄ ⚽ Mis grupos" del spec se reduce en SP-3 a una ruta `/mi-empresa` separada (volver = navegar a `/groups`). El switch visual fino y el branding profundo (logo, más pantallas) quedan para pulido/SP-4.
- Riesgo: `a.ref('X').array()` dentro de `customType` — si la síntesis falla, usar el fallback de 2 queries (documentado en Task 2).

**Deploy (humano):** `npx ampx sandbox --once --profile polla` + copiar `amplify_outputs.json`. `companyRanking` aparece como cast en el front hasta el deploy.

---

## Execution Handoff
Ejecución recomendada: **subagent-driven-development** (backend Tasks 1-3, front Tasks 4-5, revisión entre lotes).
