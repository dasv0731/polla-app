# Auto-armado del bracket R32 desde predicciones del usuario

**Fecha:** 2026-05-22
**Alcance:** `polla-app` (Angular FE) únicamente. Sin cambios de backend.

## Problema

Hoy, la pantalla `/picks/bracket` muestra los partidos eliminatorios solo cuando un admin ya los cargó en DynamoDB (vía `Match` rows con `phaseOrder ≥ 2` y `homeTeamId`/`awayTeamId` definidos). Antes de eso, la vista muestra "Las llaves todavía no están armadas".

Esto impide que el usuario:

- Vea cómo lucirían las llaves *según sus propias predicciones de grupos y mejores terceros*.
- Haga sus picks de R32 en adelante antes de que termine la fase de grupos.

## Solución (resumen)

`/picks/bracket` muestra **siempre** el bracket proyectado del propio usuario, independiente de si admin cargó o no partidos reales:

1. Derivar `1.º` y `2.º` de cada grupo desde los `GroupStandingPick`.
2. Resolver qué tercero juega contra cada `1.º` de A/B/D/E/G/I/K/L consultando la **matriz oficial FIFA del Anexo C** (495 combinaciones).
3. Construir las 16 llaves R32 (8 fijas, 8 derivadas de matriz) y los 15 partidos vacíos R16/QF/SF/F del árbol.
4. El componente `bracket-picks` renderiza esos partidos. El usuario clickea ganadores y eso alimenta su `BracketPick` (sets de slugs por fase) con el mismo flujo de save que hoy.

**El user nunca ve los partidos reales del admin en esta pantalla.** Admin sigue cargando Match rows con `homeTeamId`/`awayTeamId`/scores como hoy — eso alimenta el scoring (`score-bracket` lambda usa `deriveBracketActuals(matches)` para construir los sets reales por fase y compararlos contra el `BracketPick` del user). El user juega con sus picks ya establecidos.

Si el user no completó sus 12 `GroupStandingPick` + sus 8 `BestThirdsPick.advancing`, la pantalla muestra un bloqueo con CTAs a las pantallas correspondientes.

## No-objetivos

- **No** se modifica el modelo `BracketPick` ni el scoring (`score-bracket` lambda). El scoring sigue siendo basado en sets `r32`/`octavos`/.../`champion`, no en cruces concretos. Si la realidad difiere de la predicción del user, da igual contra qué equipo predijo: solo importa si los equipos correctos están en su set de cada fase.
- **No** se modifica la lógica de propagación del árbol (`parentOf` ya implementa "R{N} pos K alimentado por R{N-1} pos 2K-1 y 2K").
- **No** se proyecta el bracket en el backend. Es 100% cliente.

## Datos estáticos (nuevos archivos)

### `polla-app/src/app/shared/data/fifa-r32-annex-c.json`

La matriz FIFA del Anexo C tal cual, en formato:

```json
{
  "source": "FIFA World Cup 26 - Annex C: Combinations for eight best third-placed teams",
  "columns": ["1A","1B","1D","1E","1G","1I","1K","1L"],
  "byCombination": {
    "ACDEFHIJ": {"1A":"3H","1B":"3J","1D":"3E","1E":"3C","1G":"3A","1I":"3F","1K":"3D","1L":"3I"},
    ... (495 entradas)
  }
}
```

- **Key:** 8 letras (de A..L) ordenadas alfabéticamente, concatenadas. Representa los grupos cuyos terceros clasificaron.
- **Valor:** mapeo de "ganador de grupo X" → "tercero del grupo Y" para los 8 cruces R32 1.º-vs-3.º.
- **Tamaño:** ~180 KB. Cabe holgadamente como JSON estático importado.

### `polla-app/src/app/shared/data/wc2026-bracket.ts`

```typescript
/** Los 4 grupos cuyo 1.º enfrenta a un 2.º en R32 (no a un 3.º). */
export const FIRSTS_VS_SECONDS = ['C','F','H','J'] as const;

/** Los 8 grupos cuyo 1.º enfrenta a un mejor 3.º en R32.
 *  Coinciden exactamente con las "columnas" de la matriz FIFA. */
export const FIRSTS_VS_THIRDS = ['A','B','D','E','G','I','K','L'] as const;

export type Letter = 'A'|'B'|'C'|'D'|'E'|'F'|'G'|'H'|'I'|'J'|'K'|'L';

/** Referencia a un slot del template R32 que se resolverá a un slug.
 *  - 'F-X' = 1.º del grupo X
 *  - 'S-X' = 2.º del grupo X
 *  - 'T-X' = mejor 3.º asignado a la llave del 1.º del grupo X (vía matriz) */
export type SlotRef = `F-${Letter}` | `S-${Letter}` | `T-${Letter}`;

/** 16 llaves base de R32 en orden de calendario FIFA (partidos 73→88).
 *  Convención acordada: bracketPosition = índice del array + 1. */
export const R32_TEMPLATE: ReadonlyArray<{ home: SlotRef; away: SlotRef }> = [
  /* pos  1 / m73 */ { home: 'S-A', away: 'S-B' },
  /* pos  2 / m74 */ { home: 'F-E', away: 'T-E' },
  /* pos  3 / m75 */ { home: 'F-F', away: 'S-C' },
  /* pos  4 / m76 */ { home: 'F-C', away: 'S-F' },
  /* pos  5 / m77 */ { home: 'F-I', away: 'T-I' },
  /* pos  6 / m78 */ { home: 'S-E', away: 'S-I' },
  /* pos  7 / m79 */ { home: 'F-A', away: 'T-A' },
  /* pos  8 / m80 */ { home: 'F-L', away: 'T-L' },
  /* pos  9 / m81 */ { home: 'F-D', away: 'T-D' },
  /* pos 10 / m82 */ { home: 'F-G', away: 'T-G' },
  /* pos 11 / m83 */ { home: 'S-K', away: 'S-L' },
  /* pos 12 / m84 */ { home: 'F-H', away: 'S-J' },
  /* pos 13 / m85 */ { home: 'F-B', away: 'T-B' },
  /* pos 14 / m86 */ { home: 'F-J', away: 'S-H' },
  /* pos 15 / m87 */ { home: 'F-K', away: 'T-K' },
  /* pos 16 / m88 */ { home: 'S-D', away: 'S-G' },
] as const;
```

### `polla-app/src/app/shared/data/wc2026-bracket.spec.ts`

Tests de invariantes estáticos:

- `R32_TEMPLATE.length === 16`.
- Por cada letra `X` en `A..L`: aparece exactamente una vez como `F-X` (12 firsts) y exactamente una vez como `S-X` (12 seconds).
- Por cada letra `X`: aparece como `T-X` si y solo si `X ∈ FIRSTS_VS_THIRDS` (8 thirds).
- Total de slots referenciados: 32 (=12 F + 12 S + 8 T).
- Matriz: 495 keys, cada key tiene exactamente columnas `1A,1B,1D,1E,1G,1I,1K,1L`, los valores son `3X` con `X` en la key. (Ya validado con PowerShell.)

## Servicio `projected-bracket.service.ts`

Ubicación: `polla-app/src/app/core/bracket/projected-bracket.service.ts`.

Function-style export (no es una clase Angular `@Injectable` — es lógica pura, sin DI).

### Tipos

```typescript
import type { GroupStandingPick } from '<schema-types>';

export type ProjectionInput = {
  groupStandings: ReadonlyArray<{
    groupLetter: string;          // 'A'..'L'
    pos1: string; pos2: string; pos3: string; pos4: string;  // slugs
  }>;
  advancingThirds: ReadonlySet<string>;  // letras 'A'..'L'
  mode: 'SIMPLE' | 'COMPLETE';
};

export type ProjectedKnockoutMatch = {
  id: string;                          // sintético, prefijo 'projected:'
  phaseOrder: number;                  // 2..6 (v3 schema). 2=R32, 3=R16, 4=QF, 5=SF, 6=Final
  homeTeamId: string;                  // '' si fase > 2 (se llena por propagación cliente)
  awayTeamId: string;
  bracketPosition: number;
  kickoffAt: string;                   // '' para projected — la UI no usa kickoff en este modo
                                       //   (el lock del bracket aplica sólo a matches reales)
  status: 'PROJECTED';
  homeScore: null;
  awayScore: null;
};

export type ProjectionMissing = {
  groupsWithoutFullStanding: string[]; // letras sin las 4 pos completas
  thirdsCount: number;                 // 0..12. válido sólo si === 8
};

export type ProjectionResult =
  | { kind: 'ok'; matches: ProjectedKnockoutMatch[] }
  | { kind: 'incomplete'; missing: ProjectionMissing };

export function projectKnockoutTree(input: ProjectionInput): ProjectionResult;
```

### Lógica

1. **Validar inputs.** Construir `groupsWithoutFullStanding`: para cada letra A..L, verificar que existe en `groupStandings` con `pos1..pos4` no vacíos. Si la lista no está vacía, o si `advancingThirds.size !== 8`, devolver `{kind:'incomplete', missing}`.

2. **Índices.**
   ```typescript
   const firstOf: Record<string, string> = {}, secondOf: Record<string, string> = {}, thirdOf: Record<string, string> = {};
   for (const gs of groupStandings) {
     firstOf[gs.groupLetter] = gs.pos1;
     secondOf[gs.groupLetter] = gs.pos2;
     thirdOf[gs.groupLetter] = gs.pos3;
   }
   ```

3. **Lookup matriz.**
   ```typescript
   const key = [...advancingThirds].sort().join('');  // ej 'ACDEFHIJ'
   const row = matrix.byCombination[key];
   if (!row) throw new Error(`No matrix row for key=${key}`);  // imposible si validamos arriba
   // row['1A'] = '3H'  ⇒ el 1º de A enfrenta al 3º del grupo H
   ```

4. **Construir 16 R32** iterando `R32_TEMPLATE`. Para cada `SlotRef`:
   - `F-X` → `firstOf[X]`
   - `S-X` → `secondOf[X]`
   - `T-X` → leer `row['1' + X]` → `'3Y'` → `thirdOf[Y]`

5. **Construir vacíos para fases superiores:** 8 R16 (pos 1..8), 4 QF (1..4), 2 SF (1..2), 1 Final (1). Todos con `homeTeamId='', awayTeamId=''`, IDs sintéticos `projected:3:1`, `projected:3:2`, ...

6. **Total:** 16 + 8 + 4 + 2 + 1 = **31 matches**.

### Tests (`projected-bracket.service.spec.ts`)

- **Happy path** con `advancingThirds = {A,C,D,E,F,H,I,J}` y standings dummy (`pos1='1X', pos2='2X', pos3='3X'`):
  - Verifica que R32 pos 7 (1.º A) tiene `homeTeamId='1A'` y `awayTeamId='3H'` (lookup matrix['ACDEFHIJ']['1A']='3H').
  - Verifica los 8 cruces fijos: pos 1 = `2A` vs `2B`, pos 3 = `1F` vs `2C`, pos 4 = `1C` vs `2F`, pos 6 = `2E` vs `2I`, pos 11 = `2K` vs `2L`, pos 12 = `1H` vs `2J`, pos 14 = `1J` vs `2H`, pos 16 = `2D` vs `2G`.
- **Incompleto: faltan terceros.** `advancingThirds.size = 7` → `{kind:'incomplete', missing.thirdsCount: 7}`.
- **Incompleto: standing parcial.** Standings para A..K solo (sin L) → `groupsWithoutFullStanding: ['L']`.
- **Estructura del árbol.** Output tiene exactamente 16 R32 + 8 R16 + 4 QF + 2 SF + 1 F. `bracketPosition` cubre el rango entero por fase. IDs únicos.
- **Determinismo.** Misma entrada llamada dos veces → output deep-equal.

## Integración con `bracket-picks.component.ts`

Tres puntos de cambio, el resto del componente no se toca.

### Cambio 1 — `loadForMode()` después de cargar la API

Reemplazo del bloque que construye `knockouts` desde `matchesRes`:

```typescript
const realKnockouts = (matchesRes.data ?? [])
  .filter(...)
  .map(...)
  .filter(m => m.phaseOrder >= 2 && m.phaseOrder <= 6);

if (realKnockouts.length === 0) {
  const [standingsRes, thirdsRes] = await Promise.all([
    this.api.listGroupStandingPicks(this.currentUserId, m),
    this.api.getBestThirdsPick(this.currentUserId, TOURNAMENT_ID, m),
  ]);

  const standings = (standingsRes.data ?? [])
    .filter(s => s && s.tournamentId === TOURNAMENT_ID)
    .map(s => ({ groupLetter: s.groupLetter, pos1: s.pos1, pos2: s.pos2, pos3: s.pos3, pos4: s.pos4 }));
  const advancing = new Set(thirdsRes.data?.[0]?.advancing ?? []);

  const result = projectKnockoutTree({ groupStandings: standings, advancingThirds: advancing, mode: m });

  if (result.kind === 'ok') {
    this.matches.set(result.matches as KnockoutMatch[]);
    this.isProjected.set(true);
    this.projectionMissing.set(null);
  } else {
    this.matches.set([]);
    this.isProjected.set(false);
    this.projectionMissing.set(result.missing);
  }
} else {
  this.matches.set(realKnockouts);
  this.isProjected.set(false);
  this.projectionMissing.set(null);
}
```

### Cambio 2 — Branch nuevo de "preds incompletas"

Reemplazo del bloque actual `@else if (hasNoKnockoutMatches())`:

```html
@else if (projectionMissing(); as miss) {
  <div class="empty-block">
    <h3>Para ver tu bracket primero termina tus predicciones</h3>
    <ul class="check-list">
      @if (miss.groupsWithoutFullStanding.length > 0) {
        <li>
          ⚠ Faltan posiciones en {{ miss.groupsWithoutFullStanding.length }} grupo(s):
          {{ miss.groupsWithoutFullStanding.join(', ') }}
          <a routerLink="/picks/group-stage/predict" class="btn-wf btn-wf--sm">
            Ir a tabla de grupos →
          </a>
        </li>
      } @else {
        <li>✓ Tablas de grupos completas</li>
      }
      @if (miss.thirdsCount !== 8) {
        <li>
          ⚠ Marca exactamente 8 mejores 3.os (tienes {{ miss.thirdsCount }})
          <a routerLink="/profile/special-picks" class="btn-wf btn-wf--sm">
            Ir a mis terceros →
          </a>
        </li>
      } @else {
        <li>✓ 8 mejores 3.os marcados</li>
      }
    </ul>
  </div>
}
```

La ruta `/profile/special-picks` debe verificarse al implementar; si los terceros viven en otra pantalla, ajustar.

### Cambio 3 — Banner de proyección

Antes del `<div class="bracket-scroll">`:

```html
@if (isProjected()) {
  <div class="info-banner">
    🔮 Bracket proyectado desde tus predicciones de grupos.
    Cuando termine la fase de grupos, las llaves reales del Mundial reemplazarán esta vista.
  </div>
}
```

### Estado nuevo del componente

```typescript
isProjected = signal(false);
projectionMissing = signal<ProjectionMissing | null>(null);
```

`hasNoKnockoutMatches` deja de usarse para el branch de "vacío" (la nueva lógica de tres estados — proyectado / incompleto / real — la reemplaza). Puede eliminarse o quedarse si lo usa el banner de lock.

### Nada más cambia

- `parentOf()` y `displayedTeam()` ya implementan la propagación R32 → R16 → ... → Final. Con IDs sintéticos `projected:N:K` funcionan idénticos.
- `pickWinner()`, `winners()`, `save()` no se enteran si los matches son reales o proyectados.
- `realWinner()` para `status === 'PROJECTED'` devuelve `null` (no entra a la rama `'FINAL'`), correcto.
- `bracketLocked()` sigue calculando lock por el `kickoffAt` del primer partido real (en proyectado no hay lock).
- El scoring backend no se entera de la proyección. Cuando admin cargue reales, el user re-entra y la UI muestra reales con su `BracketPick` ya guardado.

## Flujo end-to-end del user

1. **Antes de hacer preds:** entra a `/picks/bracket` → ve "Para ver tu bracket primero termina tus predicciones" + CTAs.
2. **Después de completar standings + 8 terceros:** vuelve a `/picks/bracket` → ve los 16 cruces R32 con los slugs concretos (de sus propias preds) + 15 partidos vacíos en R16/QF/SF/F.
3. **Clickea ganadores fase por fase** → cada click llena el slot upstream del siguiente partido. Auto-save a `BracketPick` igual que hoy.
4. **Durante el torneo:** la pantalla sigue mostrando el bracket proyectado del user con su BracketPick guardado. Los partidos reales que admin carga **no son visibles aquí**; el scoring backend los lee aparte y deriva los sets reales por fase para puntuar.

> **Nota sobre cambio de predicciones:** si el user vuelve a `/picks/group-stage/predict` y cambia el orden de un grupo, los cruces R32 cambian (porque los slugs F-X / S-X / T-X se re-resuelven). Los winners guardados que ya no calzan con ningún match del bracket nuevo se descartan al rehidratar (filter por matchId vigente). Esto es esperado.

## Riesgos y mitigaciones

- **Predicciones del user inconsistentes** (ej. pone el mismo slug como pos1 de dos grupos). La validación de inputs en el servicio detecta colisiones de slugs y devuelve `{kind:'incomplete', missing}` con un nuevo campo `slugConflicts: string[]` si pasa. *Mitigación: agregar al validador.*
- **Cambios en la matriz FIFA.** Si FIFA publica un fix a la matriz, regenerar el JSON y los tests pasan/fallan determinísticamente. Sin migración de datos.
- **Tamaño del JSON.** 180 KB es notable para una SPA. Como es un asset estático Angular puede code-split-earlo en la ruta `/picks/bracket` (ya es lazy-loaded). Si en el futuro se vuelve un problema, mover la matriz a un endpoint REST estático.

## Plan de implementación (alto nivel)

1. Crear `wc2026-bracket.ts` + spec, validar constantes.
2. Copiar JSON matriz a `fifa-r32-annex-c.json` + spec de invariantes.
3. Implementar `projectKnockoutTree` + spec con casos happy/incompleto/determinismo.
4. Integrar en `bracket-picks.component.ts` (3 cambios listados).
5. Probar manualmente: usuario sin preds → bloqueo; con preds completas → bracket proyectado; admin seed-test-knockouts → reales prevalecen.
