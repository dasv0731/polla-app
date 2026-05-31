# Datos dinámicos del grupo — Sub-1 (quick wins front) + Sub-2 (campos de grupo) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Volver dinámicos los datos hardcodeados más baratos del detalle de grupo: el KPI "Jornada" y la columna "Acierto %" (derivados en el front, Sub-1), y el monto de cuota "$X por persona" + la fecha de reparto del podio (campo `entryFeeAmount` en `Group`, Sub-2).

**Architecture:** Sub-1 es 100% frontend: `group-detail` ya carga grupo/leaderboard/miembros; le sumamos `listPhases` + `listMatches` (lecturas públicas apiKey ya existentes) y derivamos jornada actual + acierto. Sub-2 agrega un campo entero `entryFeeAmount` al modelo `Group` y lo propaga por las mutations `createGroup`/`updateGroup` (mirror exacto del patrón `entryFeeInstructions` ya presente), el editor y el detalle.

**Tech Stack:** Angular 18 (standalone, signals, jest vía `@angular-builders/jest`), AWS Amplify Gen2 (AppSync + DynamoDB Lambdas), TypeScript.

**Convenciones del repo (NO violar):** tono "tú" (sin voseo); `npm test` nunca `npx jest` directo en el front; backend `npx jest --maxWorkers=2`; modelos con custom mutations usan `.disableOperations([...])`; `src/amplify_outputs.json` está gitignored.

---

## File Structure

**Sub-1 (front):**
- Modify `polla-app/src/app/features/groups/group-detail.component.ts` — añade `phases`/`matches` al load, computed `currentJornada`, helper `acierto` real, y cablea KPI Jornada.
- Modify `polla-app/src/app/features/groups/group-detail.component.spec.ts` — tests de jornada/acierto.

**Sub-2 (backend + front):**
- Modify `polla-backend/amplify/data/resource.ts` — `entryFeeAmount` en modelo `Group` + en args de `createGroup` y `updateGroup`.
- Modify `polla-backend/amplify/functions/create-group/handler.ts` — acepta y persiste `entryFeeAmount`.
- Modify `polla-backend/amplify/functions/update-group/handler.ts` — acepta y persiste `entryFeeAmount`.
- Create/Modify `polla-backend/tests/unit/create-group.test.ts` y `update-group.test.ts` — cobertura del nuevo campo.
- Modify `polla-app/src/app/core/api/api.service.ts` — `entryFeeAmount` en `createGroup`/`updateGroup`.
- Modify `polla-app/src/app/features/groups/group-edit.component.ts` — input de monto.
- Modify `polla-app/src/app/shared/layout/group-actions-modals.component.ts` — input de monto en crear grupo.
- Modify `polla-app/src/app/features/groups/group-detail.component.ts` — podio: "$X por persona" desde `entryFeeAmount` + fecha real.

---

## SUB-1 · Quick wins (frontend)

### Task 1: `currentJornada` en group-detail (cargar phases+matches + derivar)

**Files:**
- Modify: `polla-app/src/app/features/groups/group-detail.component.ts`
- Test: `polla-app/src/app/features/groups/group-detail.component.spec.ts`

- [ ] **Step 1: Escribir el test que falla**

En `group-detail.component.spec.ts`, añade un nuevo `describe` al final del archivo. El componente ya se construye con `ApiService` mockeado; este bloque mockea además `listPhases` y `listMatches`.

```typescript
describe('GroupDetailComponent — jornada actual (Sub-1)', () => {
  function buildWith(phases: unknown[], matches: unknown[]) {
    const apiMock = {
      getGroup: jest.fn().mockResolvedValue({ data: {
        id: 'g1', name: 'G', adminUserId: 'me', mode: 'COMPLETE',
        joinCode: 'ABC123', createdAt: '2026-01-01',
        prize1st: null, prize2nd: null, prize3rd: null,
        entryFeeEnabled: false, entryFeeInstructions: null,
      } }),
      groupLeaderboard: jest.fn().mockResolvedValue({ data: [] }),
      groupMembers: jest.fn().mockResolvedValue({ data: [] }),
      getUser: jest.fn().mockResolvedValue({ data: { handle: 'me', avatarKey: null } }),
      listPhases: jest.fn().mockResolvedValue({ data: phases }),
      listMatches: jest.fn().mockResolvedValue({ data: matches }),
      markEntryFeePaid: jest.fn(),
    };
    TestBed.configureTestingModule({
      imports: [GroupDetailComponent],
      providers: [
        provideRouter([]),
        { provide: ApiService, useValue: apiMock },
        { provide: AuthService, useValue: { user: () => ({ sub: 'me' }) } },
        { provide: ToastService, useValue: { success: jest.fn(), error: jest.fn() } },
      ],
    });
    const fixture = TestBed.createComponent(GroupDetailComponent);
    fixture.componentInstance.id = 'g1';
    return fixture;
  }

  it('jornada actual = primera phase (por order) con match no-FINAL', async () => {
    const fixture = buildWith(
      [{ id: 'p1', order: 1, name: 'Fecha 1' }, { id: 'p2', order: 2, name: 'Fecha 2' }],
      [
        { id: 'm1', phaseId: 'p1', status: 'FINAL', kickoffAt: '2026-06-11T19:00:00Z' },
        { id: 'm2', phaseId: 'p2', status: 'SCHEDULED', kickoffAt: '2026-06-15T19:00:00Z' },
      ],
    );
    fixture.detectChanges();
    await fixture.componentInstance.ngOnInit();
    await fixture.whenStable();
    const j = fixture.componentInstance.currentJornada();
    expect(j?.order).toBe(2);
    expect(j?.label).toBe('J2');
    expect(j?.totalJornadas).toBe(2);
  });

  it('sin matches → currentJornada null', async () => {
    const fixture = buildWith([], []);
    fixture.detectChanges();
    await fixture.componentInstance.ngOnInit();
    await fixture.whenStable();
    expect(fixture.componentInstance.currentJornada()).toBeNull();
  });
});
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `cd polla-app && npm test -- --watch=false --testPathPattern=group-detail`
Expected: FAIL — `currentJornada` no existe / `listPhases` no se llama.

- [ ] **Step 3: Implementar — añadir signals + load + computed**

En `group-detail.component.ts`:

(a) Añadir signals para phases/matches junto a `rows`:

```typescript
  phases = signal<Array<{ id: string; order: number; name: string }>>([]);
  matches = signal<Array<{ phaseId: string; status: string; kickoffAt: string }>>([]);
```

(b) En `load()`, ampliar el `Promise.all` para traer phases y matches (lecturas públicas apiKey):

```typescript
      const [grp, totals, members, phasesRes, matchesRes] = await Promise.all([
        this.api.getGroup(this.id),
        this.api.groupLeaderboard(this.id),
        this.api.groupMembers(this.id),
        this.api.listPhases('mundial-2026'),
        this.api.listMatches('mundial-2026'),
      ]);
```

y, antes de `} finally {`, poblar los signals:

```typescript
      this.phases.set(((phasesRes.data ?? []) as Array<{ id: string; order: number; name: string }>)
        .filter((p) => p && p.order >= 1 && p.order <= 8));
      this.matches.set(((matchesRes.data ?? []) as Array<{ phaseId: string; status: string; kickoffAt: string }>)
        .filter((m) => !!m?.phaseId));
```

(c) Añadir el computed (junto a los demás computeds):

```typescript
  /** Jornada actual = primera phase (order 1–8) con algún match no-FINAL.
   *  Si todas están jugadas, la última. Null si no hay matches. */
  currentJornada = computed<{ order: number; label: string; totalJornadas: number; startsInDays: number | null } | null>(() => {
    const phases = [...this.phases()].sort((a, b) => a.order - b.order);
    const matches = this.matches();
    if (phases.length === 0 || matches.length === 0) return null;
    const pending = phases.find((p) =>
      matches.some((m) => m.phaseId === p.id && m.status !== 'FINAL'));
    const current = pending ?? phases[phases.length - 1]!;
    // Próximo kickoff dentro de la jornada actual.
    const now = Date.now();
    const next = matches
      .filter((m) => m.phaseId === current.id)
      .map((m) => Date.parse(m.kickoffAt))
      .filter((t) => Number.isFinite(t) && t > now)
      .sort((a, b) => a - b)[0];
    const startsInDays = next != null ? Math.max(0, Math.ceil((next - now) / 86_400_000)) : null;
    return { order: current.order, label: `J${current.order}`, totalJornadas: phases.length, startsInDays };
  });
```

- [ ] **Step 4: Correr el test y verificar que pasa**

Run: `cd polla-app && npm test -- --watch=false --testPathPattern=group-detail`
Expected: PASS (ambos casos del nuevo describe + los existentes de entry-fee).

- [ ] **Step 5: Commit**

```bash
git add polla-app/src/app/features/groups/group-detail.component.ts polla-app/src/app/features/groups/group-detail.component.spec.ts
git commit -m "feat(group-detail): derivar jornada actual desde phases+matches (Sub-1)"
```

---

### Task 2: Cablear el KPI "Jornada" al dato derivado

**Files:**
- Modify: `polla-app/src/app/features/groups/group-detail.component.ts` (template, bloque KPI Jornada)

- [ ] **Step 1: Reemplazar el KPI hardcodeado**

Buscar el bloque (tiene el comentario `<!-- FALTA: jornada actual / countdown ... -->`):

```html
          <!-- FALTA: jornada actual / countdown (sin calendario de jornadas en backend) -->
          <div class="kpi">
            <div class="kpi__l">Jornada</div>
            <div class="kpi__v">J1 <small>/8</small></div>
            <div class="kpi__d">Arranca pronto</div>
          </div>
```

Reemplazar por:

```html
          @if (currentJornada(); as j) {
            <div class="kpi">
              <div class="kpi__l">Jornada</div>
              <div class="kpi__v">{{ j.label }} <small>/{{ j.totalJornadas }}</small></div>
              <div class="kpi__d">{{ j.startsInDays === null ? 'En curso' : (j.startsInDays === 0 ? 'Arranca hoy' : 'Arranca en ' + j.startsInDays + (j.startsInDays === 1 ? ' día' : ' días')) }}</div>
            </div>
          } @else {
            <div class="kpi">
              <div class="kpi__l">Jornada</div>
              <div class="kpi__v">—</div>
              <div class="kpi__d">Sin fixture cargado</div>
            </div>
          }
```

- [ ] **Step 2: Verificar build + tests**

Run: `cd polla-app && npm test -- --watch=false --testPathPattern=group-detail`
Expected: PASS. Además, watch del dev server debe recompilar sin errores.

- [ ] **Step 3: Commit**

```bash
git add polla-app/src/app/features/groups/group-detail.component.ts
git commit -m "feat(group-detail): KPI Jornada real (Sub-1)"
```

---

### Task 3: Columna "Acierto %" real

**Files:**
- Modify: `polla-app/src/app/features/groups/group-detail.component.ts` (helper `acierto`)
- Test: `polla-app/src/app/features/groups/group-detail.component.spec.ts`

- [ ] **Step 1: Escribir el test que falla**

Añadir dentro del describe de Sub-1 (o uno nuevo) — usa el mismo `buildWith` con matches FINAL:

```typescript
  it('acierto% = (exact+result)/partidosFINAL', async () => {
    const fixture = buildWith(
      [{ id: 'p1', order: 1, name: 'Fecha 1' }],
      [
        { id: 'm1', phaseId: 'p1', status: 'FINAL', kickoffAt: '2026-06-11T19:00:00Z' },
        { id: 'm2', phaseId: 'p1', status: 'FINAL', kickoffAt: '2026-06-12T19:00:00Z' },
        { id: 'm3', phaseId: 'p1', status: 'FINAL', kickoffAt: '2026-06-13T19:00:00Z' },
        { id: 'm4', phaseId: 'p1', status: 'SCHEDULED', kickoffAt: '2026-06-14T19:00:00Z' },
      ],
    );
    fixture.detectChanges();
    await fixture.componentInstance.ngOnInit();
    await fixture.whenStable();
    // 2 aciertos (1 exacto + 1 resultado) sobre 3 FINAL = 67%
    const pct = fixture.componentInstance.acierto({ exactCount: 1, resultCount: 1 } as never);
    expect(pct).toBe('67%');
    // sin partidos FINAL → "—"
    const none = buildWith([{ id: 'p1', order: 1, name: 'F1' }], [{ id: 'm1', phaseId: 'p1', status: 'SCHEDULED', kickoffAt: '2026-06-14T19:00:00Z' }]);
    none.detectChanges(); await none.componentInstance.ngOnInit(); await none.whenStable();
    expect(none.componentInstance.acierto({ exactCount: 0, resultCount: 0 } as never)).toBe('—');
  });
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `cd polla-app && npm test -- --watch=false --testPathPattern=group-detail`
Expected: FAIL — el `acierto` actual devuelve el placeholder `Math.min(99, 40 + …)`.

- [ ] **Step 3: Implementar `acierto` real + computed de finales**

Añadir un computed y reescribir el helper (reemplaza el actual `acierto(r)` con comentario `FALTA: % de acierto`):

```typescript
  /** Partidos con resultado publicado (denominador del acierto). */
  finalMatchesCount = computed(() => this.matches().filter((m) => m.status === 'FINAL').length);

  /** % de acierto del miembro = (exactos + resultados) / partidos jugados. */
  acierto(r: RankRow): string {
    const played = this.finalMatchesCount();
    if (played === 0) return '—';
    return Math.round(((r.exactCount + r.resultCount) / played) * 100) + '%';
  }
```

- [ ] **Step 4: Correr y verificar que pasa**

Run: `cd polla-app && npm test -- --watch=false --testPathPattern=group-detail`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add polla-app/src/app/features/groups/group-detail.component.ts polla-app/src/app/features/groups/group-detail.component.spec.ts
git commit -m "feat(group-detail): columna Acierto% real (Sub-1)"
```

---

## SUB-2 · `entryFeeAmount` en Group (monto por persona) + fecha de reparto

### Task 4: Schema — `entryFeeAmount` en modelo + mutations

**Files:**
- Modify: `polla-backend/amplify/data/resource.ts`

- [ ] **Step 1: Añadir el campo al modelo `Group`**

Tras la línea `entryFeeInstructions: a.string(),` del modelo `Group` (alrededor de la línea 388), añadir:

```typescript
      entryFeeAmount: a.integer(),   // monto entero por persona (ej. 5 = $5). Nullable legacy.
```

- [ ] **Step 2: Añadir el arg a la mutation `createGroup`**

En los `.arguments({...})` de `createGroup` (tras `entryFeeInstructions: a.string(),`, ~línea 791) añadir:

```typescript
      entryFeeAmount: a.integer(),       // NUEVO opcional. Monto por persona.
```

- [ ] **Step 3: Añadir el arg a la mutation `updateGroup`**

En los args de `updateGroup` (junto a `entryFeeInstructions: a.string(),`, ~línea 1025) añadir:

```typescript
      entryFeeAmount: a.integer(),
```

- [ ] **Step 4: Commit**

```bash
git add polla-backend/amplify/data/resource.ts
git commit -m "feat(schema): Group.entryFeeAmount + args en create/updateGroup (Sub-2)"
```

---

### Task 5: `create-group` handler persiste `entryFeeAmount`

**Files:**
- Modify: `polla-backend/amplify/functions/create-group/handler.ts`
- Test: `polla-backend/tests/unit/create-group.test.ts`

- [ ] **Step 1: Escribir el test que falla**

Añadir un test al spec existente de create-group (mirror del de entryFee). El handler usa `ddb.send` mockeado; el test inspecciona el `Item` del Put de `GROUP`. Si no existe el archivo, créalo siguiendo el patrón de los demás `tests/unit/*.test.ts` (mock de `@aws-sdk/lib-dynamodb`). Test mínimo:

```typescript
it('persiste entryFeeAmount cuando entryFeeEnabled', async () => {
  const send = captureSend(); // helper del archivo que devuelve el TransactWriteCommand enviado
  await handler({ arguments: {
    name: 'G', tournamentId: 'mundial-2026', mode: 'COMPLETE',
    entryFeeEnabled: true, entryFeeInstructions: 'Pagar a X', entryFeeAmount: 5,
  }, identity: { sub: 'u1' } } as never);
  const groupPut = send.mock.calls[0][0].input.TransactItems
    .find((t: { Put?: { Item?: { __typename?: string } } }) => t.Put?.Item?.__typename === 'Group');
  expect(groupPut.Put.Item.entryFeeAmount).toBe(5);
});

it('ignora entryFeeAmount cuando entryFee está apagado', async () => {
  const send = captureSend();
  await handler({ arguments: {
    name: 'G', tournamentId: 'mundial-2026', mode: 'COMPLETE',
    entryFeeEnabled: false, entryFeeAmount: 5,
  }, identity: { sub: 'u1' } } as never);
  const groupPut = send.mock.calls[0][0].input.TransactItems
    .find((t: { Put?: { Item?: { __typename?: string } } }) => t.Put?.Item?.__typename === 'Group');
  expect(groupPut.Put.Item.entryFeeAmount).toBeUndefined();
});
```

(Si el spec ya tiene un helper de captura del `send`, reúsalo en vez de `captureSend()`.)

- [ ] **Step 2: Correr y verificar que falla**

Run: `cd polla-backend && npx jest --maxWorkers=2 create-group`
Expected: FAIL — `entryFeeAmount` no se escribe.

- [ ] **Step 3: Implementar**

En `handler.ts`:

(a) En la interface `AppSyncEvent.arguments` (tras `entryFeeInstructions?: string | null;`):

```typescript
    entryFeeAmount?: number | null;
```

(b) En el destructuring (tras `entryFeeEnabled, entryFeeInstructions,`):

```typescript
    entryFeeAmount,
```

(c) Tras el bloque de normalización de instructions, añadir:

```typescript
  // Monto solo si la cuota está activa y es un entero >= 0.
  const effectiveEntryFeeAmount =
    effectiveEntryFeeEnabled && typeof entryFeeAmount === 'number' && Number.isInteger(entryFeeAmount) && entryFeeAmount >= 0
      ? entryFeeAmount
      : undefined;
```

(d) En el `Item` del Put de `GROUP` (tras la línea de `entryFeeInstructions` spread):

```typescript
                ...(effectiveEntryFeeAmount !== undefined ? { entryFeeAmount: effectiveEntryFeeAmount } : {}),
```

- [ ] **Step 4: Correr y verificar que pasa**

Run: `cd polla-backend && npx jest --maxWorkers=2 create-group`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add polla-backend/amplify/functions/create-group/handler.ts polla-backend/tests/unit/create-group.test.ts
git commit -m "feat(create-group): persistir entryFeeAmount (Sub-2)"
```

---

### Task 6: `update-group` handler persiste `entryFeeAmount`

**Files:**
- Modify: `polla-backend/amplify/functions/update-group/handler.ts`
- Test: `polla-backend/tests/unit/update-group.test.ts`

- [ ] **Step 1: Leer el handler para ubicar el patrón sparse de `entryFeeInstructions`**

Run: `cat polla-backend/amplify/functions/update-group/handler.ts`
El handler arma un `UpdateExpression` sparse (solo setea campos presentes). Identifica cómo agrega `entryFeeInstructions`.

- [ ] **Step 2: Escribir el test que falla**

En `tests/unit/update-group.test.ts`, mirror del patrón existente: llamar `handler` con `{ arguments: { id:'g1', entryFeeAmount: 7 }, identity:{ sub:'admin' } }` y assert que el `UpdateExpression`/`ExpressionAttributeValues` incluye `entryFeeAmount = 7`. (Usa el helper de captura del spec.)

```typescript
it('actualiza entryFeeAmount (sparse)', async () => {
  const send = captureSend();
  await handler({ arguments: { id: 'g1', entryFeeAmount: 7 }, identity: { sub: 'admin' } } as never);
  const cmd = send.mock.calls.at(-1)[0].input;
  expect(JSON.stringify(cmd.ExpressionAttributeValues)).toContain('7');
  expect(cmd.UpdateExpression).toMatch(/entryFeeAmount/);
});
```

- [ ] **Step 3: Correr y verificar que falla**

Run: `cd polla-backend && npx jest --maxWorkers=2 update-group`
Expected: FAIL.

- [ ] **Step 4: Implementar — añadir `entryFeeAmount` al sparse update**

(a) Interface de args: `entryFeeAmount?: number | null;`
(b) Donde se construye el update sparse, añadir el bloque equivalente al de `entryFeeInstructions` pero para `entryFeeAmount` (solo si viene definido y es entero >= 0):

```typescript
  if (typeof args.entryFeeAmount === 'number' && Number.isInteger(args.entryFeeAmount) && args.entryFeeAmount >= 0) {
    setParts.push('#entryFeeAmount = :entryFeeAmount');
    names['#entryFeeAmount'] = 'entryFeeAmount';
    values[':entryFeeAmount'] = args.entryFeeAmount;
  }
```

(Ajusta los nombres `setParts`/`names`/`values` a como se llamen en el handler real.)

- [ ] **Step 5: Correr y verificar que pasa + Commit**

Run: `cd polla-backend && npx jest --maxWorkers=2 update-group`
Expected: PASS.

```bash
git add polla-backend/amplify/functions/update-group/handler.ts polla-backend/tests/unit/update-group.test.ts
git commit -m "feat(update-group): persistir entryFeeAmount (Sub-2)"
```

---

### Task 7: `api.service` propaga `entryFeeAmount`

**Files:**
- Modify: `polla-app/src/app/core/api/api.service.ts`

- [ ] **Step 1: createGroup — añadir el campo**

En las 3 firmas/objeto-input de `createGroup` (el overload `{...}`, el implementación `a: string | {...}`) añadir `entryFeeAmount?: number;` junto a `entryFeeInstructions?: string;`. En el cuerpo (`apiClient.mutations.createGroup({...})`), tras el spread de `entryFeeInstructions`, añadir:

```typescript
      ...('entryFeeAmount' in input && input.entryFeeAmount !== undefined
        ? { entryFeeAmount: input.entryFeeAmount }
        : {}),
```

- [ ] **Step 2: updateGroup — añadir el campo**

En el input de `updateGroup` añadir `entryFeeAmount?: number | null;` y propagarlo al `apiClient.mutations.updateGroup({...})` con el mismo patrón sparse que `entryFeeInstructions`.

- [ ] **Step 3: Verificar build (tsc) + commit**

Run: `cd polla-app && npx tsc --noEmit -p tsconfig.app.json`
Expected: clean.

```bash
git add polla-app/src/app/core/api/api.service.ts
git commit -m "feat(api): entryFeeAmount en create/updateGroup (Sub-2)"
```

---

### Task 8: Input de monto en editor + modal de crear grupo

**Files:**
- Modify: `polla-app/src/app/features/groups/group-edit.component.ts`
- Modify: `polla-app/src/app/shared/layout/group-actions-modals.component.ts`

- [ ] **Step 1: group-edit — añadir el campo monto**

Localiza la sección de cuota (`entryFeeEnabled` / `entryFeeInstructions`). Añade, visible solo cuando `entryFeeEnabled` está activo, un input numérico ligado a un nuevo signal `entryFeeAmount = signal<number | null>(null)`:

```html
@if (entryFeeEnabled()) {
  <label class="field">
    <span>Monto por persona ($)</span>
    <input type="number" inputmode="numeric" min="0" step="1"
           [ngModel]="entryFeeAmount()" (ngModelChange)="entryFeeAmount.set($event)"
           placeholder="Ej: 5">
  </label>
}
```

Inicializa `entryFeeAmount` desde `group.entryFeeAmount` al cargar, e inclúyelo en el payload de `api.updateGroup({ ..., entryFeeAmount: entryFeeAmount() ?? null })`.

- [ ] **Step 2: group-actions-modals (crear grupo) — mismo input**

En el modal de crear, junto a las instrucciones de cuota, añade el mismo input numérico (signal `entryFeeAmount`) e inclúyelo en `actions`/`api.createGroup({ ..., entryFeeAmount: entryFeeAmount() ?? undefined })` solo cuando `entryFeeEnabled`.

- [ ] **Step 3: Verificar build + tests + commit**

Run: `cd polla-app && npm test -- --watch=false`
Expected: 178+ PASS, build limpio.

```bash
git add polla-app/src/app/features/groups/group-edit.component.ts polla-app/src/app/shared/layout/group-actions-modals.component.ts
git commit -m "feat(groups): input de monto de cuota en editor y crear grupo (Sub-2)"
```

---

### Task 9: group-detail muestra "$X por persona" + fecha de reparto real

**Files:**
- Modify: `polla-app/src/app/features/groups/group-detail.component.ts`

- [ ] **Step 1: Añadir entryFeeAmount al modelo local + load**

En la interface `GroupHeader` añadir `entryFeeAmount: number | null;`. En `load()`, al setear `this.group.set({...})`, añadir:

```typescript
          entryFeeAmount: (grp.data as { entryFeeAmount?: number | null }).entryFeeAmount ?? null,
```

- [ ] **Step 2: Constante de fin de torneo**

Cerca del tope del archivo (junto a otras constantes) añadir:

```typescript
const TOURNAMENT_END_ISO = '2026-07-19T20:00:00-04:00'; // fin Mundial 2026
```

y un helper de formato:

```typescript
  readonly distributionDate = new Intl.DateTimeFormat('es-EC', { day: 'numeric', month: 'short' })
    .format(new Date(TOURNAMENT_END_ISO));
```

- [ ] **Step 3: Cablear el footer del podio**

En el footer del podio (tab Premios), reemplazar el span hardcodeado `Se reparte al final del Mundial · <b ...>19 jul</b>` y el conteo, por:

```html
                <span>
                  @if (g.entryFeeEnabled) {
                    👥 {{ paidCount() }} de {{ rows().length }} pagaron
                    @if (g.entryFeeAmount) { · 💳 ${{ g.entryFeeAmount }} por persona }
                  } @else { Reparto según el ranking final }
                </span>
                <span>Se reparte al final del Mundial · <b style="color:var(--pa-ink)">{{ distributionDate }}</b></span>
```

Quitar los comentarios `<!-- FALTA: "$X por persona" ... -->` y `<!-- FALTA: fecha exacta de reparto ... -->`.

- [ ] **Step 4: Verificar build + tests + commit**

Run: `cd polla-app && npm test -- --watch=false --testPathPattern=group-detail`
Expected: PASS.

```bash
git add polla-app/src/app/features/groups/group-detail.component.ts
git commit -m "feat(group-detail): \$X por persona + fecha de reparto reales (Sub-2)"
```

---

## Notas de cierre

- Tras Sub-2, sigue hardcodeada **solo** la lógica de J1/Mov del leaderboard (Sub-4), la card de campeón (Sub-3) y el feed de actividad (Sub-5) — ya cubiertos en el spec maestro.
- El deploy del schema (Task 4) requiere `npx ampx sandbox --profile polla` y regenerar `amplify_outputs.json` (+ copiar a `src/`). No commitear `src/amplify_outputs.json` (gitignored).
- `entryFeeAmount` es nullable → grupos legacy siguen válidos sin migración.
