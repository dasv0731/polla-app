# Toggle de comodines a nivel grupo

**Fecha:** 2026-05-26
**Alcance:** `polla-backend` (schema + lambda `applyScoreDelta` + `create-group`) + `polla-app` (form crear grupo, detail, edit, ranking).

## Problema

Hoy el sistema de comodines aplica uniformemente a todos los grupos en Modo Completo de un torneo. Algunos admins quieren grupos "más puros" donde los puntos se ganen exclusivamente por aciertos directos (sin multiplicadores, seguros, resets, etc.), sin renunciar al resto del Modo Completo (marcadores partido a partido).

## Solución (resumen)

Un boolean nuevo en `Group.comodinesEnabled`, decidido al crear el grupo e **irrevocable**:

- Solo aplica a `mode === 'COMPLETE'`. En `SIMPLE` el sistema de comodines no aplica de raíz, así que el flag se guarda como `false` por convención (sin UI).
- Si `comodinesEnabled === true` (o ausente, para compat): comportamiento actual sin cambios.
- Si `comodinesEnabled === false`: el `UserGroupTotal` de ese grupo se computa **sin los efectos de comodines activados por sus miembros**. El user sigue obteniendo, asignando y activando comodines normalmente a nivel torneo — los efectos aparecen en `UserTournamentTotal` (ranking global) y en grupos donde el flag está `true`, pero no en grupos con el flag `false`.

Default para grupos nuevos COMPLETE: `true`. Default defensivo en código para grupos pre-feature (registros sin el campo): tratados como `true`.

## No-objetivos

- **No** se cambia el modelo `Comodin` ni los flujos de obtener/asignar/activar comodines. Esos siguen viviendo a nivel torneo.
- **No** se cambia el ranking global (`UserTournamentTotal`). Solo cambia `UserGroupTotal`.
- **No** se permite editar el flag post-creación (eso requeriría recalc retroactivo de UGT — fuera de scope).
- **No** se elimina el toggle en grupos SIMPLE de forma visual; simplemente no aparece (el sistema de comodines no aplica a SIMPLE de todos modos).

## Diseño técnico

### Schema (`polla-backend/amplify/data/resource.ts`)

Un único cambio al modelo `Group`:

```typescript
Group: a.model({
  // ...campos existentes...
  comodinesEnabled: a.boolean().required().default(true),
})
```

Y un argumento opcional en la mutation `createGroup`:

```typescript
createGroup: a.mutation()
  .arguments({
    name: a.string().required(),
    tournamentId: a.id().required(),
    mode: a.ref('GameMode').required(),
    description: a.string(),
    imageKey: a.string(),
    comodinesEnabled: a.boolean(),   // NUEVO opcional
  })
  // ...
```

Sin nuevos índices, sin nuevos modelos, sin breaking changes.

### Lambda `create-group` (`polla-backend/amplify/functions/create-group/handler.ts`)

Lógica nueva al construir el item del grupo:

```typescript
const comodinesEnabled =
  args.mode === 'SIMPLE'
    ? false                             // siempre false en SIMPLE (irrelevante)
    : (args.comodinesEnabled ?? true);  // COMPLETE: respeta input, default true
```

Se guarda en el `PutCommand` junto con el resto del grupo.

### Helper `scoring-totals.ts` (`polla-backend/src/lib/scoring-totals.ts`)

**Cambio clave.** El helper `applyScoreDelta` es el único punto que toca `UserGroupTotal` y `UserTournamentTotal`. Extensión de `ScoreDeltas`:

```typescript
export interface ScoreDeltas {
  points: number;
  exactCount?: number;
  resultCount?: number;
  pointsPreMundial?: number;
  pointsBracket?: number;
  groupStandingsExactCount?: number;
  /**
   * Porción del delta `points` que vino de un comodín activado.
   * Forma parte de `points` (no se suma extra). El helper la usa para
   * restar el efecto cuando un grupo tiene comodinesEnabled=false.
   * Default 0 (caller sin comodín no necesita cambiar nada).
   */
  comodinPoints?: number;
}
```

Y en el loop que itera memberships del user:

```typescript
const group = groupRes.Item as { id: string; mode?: string; comodinesEnabled?: boolean } | undefined;
if (!group || group.mode !== p.pickMode) continue;

const stripsComodin = group.comodinesEnabled === false
  && (p.deltas.comodinPoints ?? 0) !== 0;
const groupDeltas = stripsComodin
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
```

**Tabla de verdad para `comodinesEnabled`:**

| Valor en DDB | Tratamiento |
|---|---|
| `true` | ON — comodines aplican |
| `undefined` / ausente | ON — compat con grupos pre-feature |
| `null` | ON — compat |
| `false` | OFF — efectos de comodines se restan del UGT |

### Lambdas de scoring que pasan `comodinPoints`

Tres lambdas (`score-match`, `score-bracket`, `score-group-stage`) ya calculan internamente el extra del comodín como `appliedComodin?.extra`. Cambio en cada una: pasar ese valor a `applyScoreDelta(...)` como `comodinPoints`.

`score-trivia` **no se toca**: la trivia otorga comodines pero no aplica multiplicadores a su scoring.

Las lambdas de **uso** de comodines (`use-late-edit`, `use-bracket-reset`, `use-group-reset`, `use-reassign-champ-runner`) no se tocan: el efecto puntual de cada comodín pasa por las lambdas de scoring eventualmente y se contabiliza ahí.

`assign-comodin`, `claim-comodin-type`, `redeem-sponsor-code`, `expire-comodines`, `run-loyalty-sweep`, `run-engagement-sweep`, `adjudicate-special`: tampoco se tocan. Toda la gestión de comodines es a nivel torneo y agnóstica del grupo.

### Frontend — `group-create.component.ts`

Toggle visible **solo cuando `mode === 'COMPLETE'`**:

```html
@if (form.mode === 'COMPLETE') {
  <div class="form-row">
    <label class="checkbox-row">
      <input type="checkbox" [(ngModel)]="form.comodinesEnabled" name="comodinesEnabled">
      <div>
        <div class="checkbox-row__title">Comodines</div>
        <div class="checkbox-row__sub text-mute">
          Activá los 9 tipos de comodines (multiplicadores, seguros, resets, etc).
          <b>No se puede cambiar después</b> de crear el grupo.
        </div>
      </div>
    </label>
  </div>
}
```

Default en el modelo del form: `comodinesEnabled: true`. La mutation `createGroup` recibe el flag como nuevo argumento. Si el user elige SIMPLE el componente no manda el campo (el handler lo fuerza a false).

### Frontend — `group-detail.component.ts`

Pill en la cabecera del grupo, junto al badge de modo:

```html
@if (group()?.mode === 'COMPLETE') {
  @if (group()!.comodinesEnabled) {
    <span class="pill pill--accent">🃏 Comodines activos</span>
  } @else {
    <span class="pill pill--mute">🃏 Sin comodines</span>
  }
}
```

En SIMPLE no se muestra.

### Frontend — `group-edit.component.ts`

El toggle aparece **solo en lectura**, sin botón para cambiarlo:

```html
<div class="form-row form-row--readonly">
  <label>Comodines</label>
  <div>
    <span class="pill pill--{{ group()!.comodinesEnabled ? 'accent' : 'mute' }}">
      {{ group()!.comodinesEnabled ? '🃏 Activados' : '🃏 Desactivados' }}
    </span>
    <p class="text-mute" style="font-size:11px;margin-top:6px;">
      Esta configuración se eligió al crear el grupo y no se puede modificar.
    </p>
  </div>
</div>
```

### Frontend — ranking del grupo

Banner pequeño arriba de la tabla cuando aplique:

```html
@if (group()!.mode === 'COMPLETE' && !group()!.comodinesEnabled) {
  <div class="info-banner info-banner--mute">
    ℹ Los puntos de este grupo se computan sin efectos de comodines.
    Tu posición global (ranking del torneo) sigue incluyéndolos.
  </div>
}
```

### `/mis-comodines` no cambia

Es la gestión personal del user a nivel torneo. El user sigue viendo, asignando y activando comodines igual que hoy. La diferencia se manifiesta solo en los rankings de los grupos que tienen el flag OFF.

### `api.service.ts`

Pasar `comodinesEnabled?: boolean` como nuevo argumento opcional a `createGroup`. Cuando se regenere `schema.d.ts` (vía `npm run sandbox` o `ampx generate graphql-client-code`), el tipo aparece automáticamente.

## Migración

**Sin script de backfill obligatorio.** Amplify maneja `default(true)` para nuevos rows, y la lógica defensiva en `applyScoreDelta` trata cualquier valor distinto de `false` como ON. Grupos existentes mantienen su comportamiento.

Script opcional (`polla-backend/scripts/backfill-comodines-enabled.mjs`) por si se quiere normalizar el dataset. Idempotente con `ConditionExpression: 'attribute_not_exists(comodinesEnabled)'`. YAGNI hasta que haga falta.

## Testing

### Backend — unit

- `polla-backend/tests/unit/scoring-totals.spec.ts`:
  - Group con `comodinesEnabled: true` + delta `{ points: 8, comodinPoints: 3 }` → UGT +8, UTT +8.
  - Group con `comodinesEnabled: false` + mismo delta → UGT +5, UTT +8.
  - Group con `comodinesEnabled: undefined` + mismo delta → UGT +8, UTT +8 (compat legacy).
  - `comodinPoints: 0` + flag OFF → UGT +8, UTT +8 (no diferencia).
  - `comodinPoints === points` + flag OFF → UGT no se actualiza (delta efectivo 0 tras strip), UTT +points.

- `polla-backend/tests/unit/create-group.spec.ts` (extender o agregar):
  - `mode: 'SIMPLE'` + `comodinesEnabled: true` en args → guarda `false` (forzado).
  - `mode: 'COMPLETE'` sin `comodinesEnabled` → guarda `true` (default).
  - `mode: 'COMPLETE'` + `comodinesEnabled: false` → guarda `false`.

### Backend — integration

- `polla-backend/tests/integration/`: smoke con dos grupos del mismo torneo (uno ON, uno OFF) y un user en ambos; activar comodín y verificar que las dos UGT divergen por exactamente `comodinPoints`.

### Frontend — jest

- `group-create.component.spec.ts`: mode SIMPLE no muestra el toggle; mode COMPLETE sí; payload de la mutation incluye/omite el flag correctamente.
- `group-detail.component.spec.ts`: pill renderiza según flag.

### QA manual

- Crear grupo COMPLETE con comodines ON, joinear con un user secundario, simular activación de comodín, verificar UGT y UTT crecen igual.
- Crear segundo grupo COMPLETE con comodines OFF, mismo user activado, verificar UGT del segundo crece menos que UTT.
- Edit del primer grupo: confirmar que el toggle aparece solo lectura.
- Modo SIMPLE: confirmar que el toggle no aparece en `/groups/new` y que su detail no muestra la pill de comodines.

## Riesgos y mitigaciones

- **Lambdas de scoring no actualizadas pasan `comodinPoints` ausente.** Default 0 en el helper hace que el comportamiento sea idéntico al actual: cero diferencia para grupos ON, ningún strip aplicable. Sin riesgo de regresión.
- **Grupo creado antes del deploy del schema.** No tiene `comodinesEnabled`. La lógica defensiva lo trata como ON (comportamiento actual). El admin ve la pill "Comodines activos" sin haber tomado la decisión explícitamente — coherente con el default.
- **Cliente viejo no manda `comodinesEnabled`.** El handler usa el default `true` para COMPLETE, `false` para SIMPLE. Sin error.

## Plan de implementación (alto nivel)

1. Schema: agregar `comodinesEnabled` al modelo `Group` y al input de `createGroup`. Deploy a sandbox.
2. `create-group` handler: aplicar las reglas mode-SIMPLE-forzado / mode-COMPLETE-default.
3. `scoring-totals.ts`: extender `ScoreDeltas` con `comodinPoints`. Implementar branch defensivo en `applyScoreDelta`. Tests unitarios.
4. Lambdas de scoring (`score-match`, `score-bracket`, `score-group-stage`): pasar `comodinPoints` desde el `appliedComodin.extra` que ya calculan.
5. Frontend: toggle en form crear, pill en detail, readonly en edit, banner en ranking.
6. Tests jest frontend + integration backend.
7. QA manual con dos grupos divergentes.
