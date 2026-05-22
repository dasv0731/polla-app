# Auto-armado del bracket R32 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que `polla-app /picks/bracket` muestre **siempre** los 16 cruces R32 (más el árbol R16→Final vacío) calculados desde las predicciones del usuario (12 `GroupStandingPick` + 8 `BestThirdsPick.advancing`) usando la matriz FIFA del Anexo C. El usuario juega con sus picks ya establecidos sin importar qué partidos reales cargue el admin después.

**Architecture:** Cliente puro, sin backend. Lógica encapsulada en un servicio pure-function (`projectKnockoutTree`) que consume datos estáticos (matriz FIFA 495 filas + plantilla de 16 llaves base). El componente `bracket-picks` siempre llama al servicio y **nunca** usa los Match rows reales de la API para esta pantalla. El scoring backend sigue funcionando aparte: lee Match rows reales para derivar los sets verdaderos por fase y comparar contra el `BracketPick` del user.

**Tech Stack:** Angular 18 standalone, signals, aws-amplify data client, jest (vía `@angular-builders/jest`), TypeScript strict.

**Spec:** `polla-app/docs/superpowers/specs/2026-05-22-auto-bracket-r32-design.md`

---

## File map

**Create:**
- `polla-app/src/app/shared/data/fifa-r32-annex-c.json` — matriz FIFA, 495 entradas (~180 KB)
- `polla-app/src/app/shared/data/wc2026-bracket.ts` — constantes Mundial 2026 (FIRSTS_VS_SECONDS, FIRSTS_VS_THIRDS, R32_TEMPLATE, tipos)
- `polla-app/src/app/shared/data/wc2026-bracket.spec.ts` — invariantes de la plantilla y la matriz
- `polla-app/src/app/core/bracket/projected-bracket.service.ts` — función pura `projectKnockoutTree`
- `polla-app/src/app/core/bracket/projected-bracket.service.spec.ts` — tests del servicio

**Modify:**
- `polla-app/src/app/features/picks/bracket-picks.component.ts` — 3 puntos: `loadForMode()`, branch nuevo de UI "preds incompletas", banner de proyección, filtro de winners en localStorage, fix de `bracketLockAt` para projected

---

## Task 1: Plantilla y constantes Mundial 2026

**Files:**
- Create: `polla-app/src/app/shared/data/wc2026-bracket.ts`
- Test: `polla-app/src/app/shared/data/wc2026-bracket.spec.ts`

- [ ] **Step 1: Escribir el archivo de constantes**

Crear `polla-app/src/app/shared/data/wc2026-bracket.ts`:

```typescript
/**
 * Datos estáticos del bracket Mundial 2026 (FIFA).
 *
 * Los 1.º de cada grupo enfrentan distintos rivales en R32:
 *  - C/F/H/J → enfrentan a un 2.º (cruces fijos)
 *  - A/B/D/E/G/I/K/L → enfrentan a un mejor 3.º (definido por matriz Anexo C)
 *
 * La plantilla R32 sigue el orden del calendario FIFA (partidos 73→88):
 *   bracketPosition i+1 = partido (73 + i).
 *
 * La convención del árbol (R{N} pos K alimentado por R{N-1} pos 2K-1 y 2K)
 * está implementada en `bracket-picks.component.ts:parentOf()`.
 */

export const FIRSTS_VS_SECONDS = ['C', 'F', 'H', 'J'] as const;
export const FIRSTS_VS_THIRDS  = ['A', 'B', 'D', 'E', 'G', 'I', 'K', 'L'] as const;

export type Letter =
  | 'A' | 'B' | 'C' | 'D' | 'E' | 'F'
  | 'G' | 'H' | 'I' | 'J' | 'K' | 'L';

export const ALL_LETTERS: ReadonlyArray<Letter> =
  ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L'] as const;

/** Referencia a un slot del template R32 que se resolverá a un slug. */
export type SlotRef =
  | `F-${Letter}`   // 1.º del grupo X
  | `S-${Letter}`   // 2.º del grupo X
  | `T-${Letter}`;  // mejor 3.º asignado a la llave del 1.º del grupo X (vía matriz)

export interface R32Slot {
  readonly home: SlotRef;
  readonly away: SlotRef;
}

/** 16 llaves base de R32 en orden de calendario FIFA (partidos 73→88).
 *  bracketPosition = índice + 1. */
export const R32_TEMPLATE: ReadonlyArray<R32Slot> = [
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

- [ ] **Step 2: Escribir los tests de invariantes**

Crear `polla-app/src/app/shared/data/wc2026-bracket.spec.ts`:

```typescript
import {
  R32_TEMPLATE,
  FIRSTS_VS_SECONDS,
  FIRSTS_VS_THIRDS,
  ALL_LETTERS,
  type Letter,
  type SlotRef,
} from './wc2026-bracket';

describe('wc2026-bracket constants', () => {
  it('R32_TEMPLATE has 16 matches', () => {
    expect(R32_TEMPLATE.length).toBe(16);
  });

  it('FIRSTS_VS_SECONDS + FIRSTS_VS_THIRDS partition the 12 letters', () => {
    const union = new Set<Letter>([...FIRSTS_VS_SECONDS, ...FIRSTS_VS_THIRDS]);
    expect(union.size).toBe(12);
    expect(FIRSTS_VS_SECONDS.length + FIRSTS_VS_THIRDS.length).toBe(12);
  });

  it('each letter A..L appears exactly once as F-X and once as S-X', () => {
    const firstCount = new Map<Letter, number>();
    const secondCount = new Map<Letter, number>();
    for (const { home, away } of R32_TEMPLATE) {
      for (const slot of [home, away] as SlotRef[]) {
        const kind = slot[0];      // 'F' | 'S' | 'T'
        const letter = slot[2] as Letter;
        if (kind === 'F') firstCount.set(letter, (firstCount.get(letter) ?? 0) + 1);
        else if (kind === 'S') secondCount.set(letter, (secondCount.get(letter) ?? 0) + 1);
      }
    }
    for (const letter of ALL_LETTERS) {
      expect(firstCount.get(letter)).toBe(1);
      expect(secondCount.get(letter)).toBe(1);
    }
  });

  it('T-X slots only appear for letters in FIRSTS_VS_THIRDS, exactly once each', () => {
    const thirdLetters = new Set<Letter>();
    for (const { home, away } of R32_TEMPLATE) {
      for (const slot of [home, away] as SlotRef[]) {
        if (slot[0] === 'T') thirdLetters.add(slot[2] as Letter);
      }
    }
    expect(thirdLetters.size).toBe(FIRSTS_VS_THIRDS.length);
    for (const letter of FIRSTS_VS_THIRDS) {
      expect(thirdLetters.has(letter)).toBe(true);
    }
  });

  it('each R32 match references 2 distinct slots', () => {
    for (const { home, away } of R32_TEMPLATE) {
      expect(home).not.toBe(away);
    }
  });

  it('total slot references = 32 (12 F + 12 S + 8 T)', () => {
    let f = 0, s = 0, t = 0;
    for (const { home, away } of R32_TEMPLATE) {
      for (const slot of [home, away] as SlotRef[]) {
        if (slot[0] === 'F') f++;
        else if (slot[0] === 'S') s++;
        else if (slot[0] === 'T') t++;
      }
    }
    expect(f).toBe(12);
    expect(s).toBe(12);
    expect(t).toBe(8);
  });
});
```

- [ ] **Step 3: Correr los tests y verificar que pasen**

Run: `cd polla-app && npx jest src/app/shared/data/wc2026-bracket.spec.ts --no-coverage`

Expected: 6 tests PASS.

- [ ] **Step 4: Commit**

```bash
git add polla-app/src/app/shared/data/wc2026-bracket.ts \
        polla-app/src/app/shared/data/wc2026-bracket.spec.ts
git commit -m "feat(bracket): add Mundial 2026 R32 template and group constants"
```

---

## Task 2: Matriz FIFA Annex C (datos)

**Files:**
- Create: `polla-app/src/app/shared/data/fifa-r32-annex-c.json` (180 KB, generado vía PowerShell)
- Create: `polla-app/src/app/shared/data/fifa-r32-annex-c.spec.ts`

- [ ] **Step 1: Extraer el JSON desde el tool result y guardarlo en el repo**

El JSON ya está disponible en disco. Extraerlo y guardarlo:

```powershell
# Ejecutar desde la raíz del workspace
$src = 'C:\Users\Marke\.claude\projects\C--Users-Marke-Documents-Respaldo-polla-mundialista\8c76e4f3-0b9e-47c7-af30-35ad381c6670\tool-results\toolu_01AvJvJoYuHH95yi4zZP3brn.txt'
$dst = 'C:\Users\Marke\Documents\Respaldo\polla mundialista\polla-app\src\app\shared\data\fifa-r32-annex-c.json'
$raw = Get-Content $src -Raw
$start = $raw.IndexOf('{')
$endMarker = $raw.IndexOf('. You can now continue')
$end = $raw.LastIndexOf('}', $endMarker)
$json = $raw.Substring($start, $end - $start + 1)
# Re-parse y re-serialize para canonicalizar formato y validar integridad
$obj = $json | ConvertFrom-Json
$obj | ConvertTo-Json -Depth 4 -Compress | Set-Content $dst -Encoding utf8
Write-Output "wrote $((Get-Item $dst).Length) bytes"
```

Verificar tamaño esperado: ~150-180 KB.

- [ ] **Step 2: Habilitar `resolveJsonModule` en tsconfig si no está ya**

Run: `Get-Content polla-app/tsconfig.json | Select-String resolveJsonModule`

Si no aparece, agregar `"resolveJsonModule": true, "esModuleInterop": true` a `compilerOptions` de `polla-app/tsconfig.json`. Si ya está, saltar.

- [ ] **Step 3: Escribir tests de invariantes de la matriz**

Crear `polla-app/src/app/shared/data/fifa-r32-annex-c.spec.ts`:

```typescript
import matrix from './fifa-r32-annex-c.json';
import { FIRSTS_VS_THIRDS, ALL_LETTERS, type Letter } from './wc2026-bracket';

const EXPECTED_COLUMNS = ['1A', '1B', '1D', '1E', '1G', '1I', '1K', '1L'];

describe('FIFA Annex C matrix', () => {
  it('has exactly 495 combinations (C(12,8))', () => {
    expect(Object.keys(matrix.byCombination).length).toBe(495);
  });

  it('declares the correct 8 first-team columns', () => {
    expect(matrix.columns).toEqual(EXPECTED_COLUMNS);
  });

  it('columns match FIRSTS_VS_THIRDS', () => {
    const lettersFromMatrix = matrix.columns.map((c: string) => c[1]).sort();
    expect(lettersFromMatrix).toEqual([...FIRSTS_VS_THIRDS].sort());
  });

  it('every key is 8 sorted letters from A..L', () => {
    const validLetters = new Set<string>(ALL_LETTERS as readonly string[]);
    for (const key of Object.keys(matrix.byCombination)) {
      expect(key.length).toBe(8);
      const letters = key.split('');
      expect([...letters].sort().join('')).toBe(key);   // sorted
      for (const l of letters) expect(validLetters.has(l)).toBe(true);
      expect(new Set(letters).size).toBe(8);             // unique
    }
  });

  it('every row maps the 8 columns and its values are exactly the 8 thirds from the key', () => {
    for (const [key, row] of Object.entries(matrix.byCombination)) {
      const rowKeys = Object.keys(row as object).sort();
      expect(rowKeys).toEqual(EXPECTED_COLUMNS);
      const expectedThirds = key.split('').map((l) => `3${l}`).sort();
      const gotThirds = (Object.values(row as object) as string[]).sort();
      expect(gotThirds).toEqual(expectedThirds);
    }
  });

  it('user-provided sanity case: ACDEFHIJ', () => {
    expect((matrix.byCombination as Record<string, Record<string, string>>)['ACDEFHIJ']).toEqual({
      '1A': '3H',
      '1B': '3J',
      '1D': '3E',
      '1E': '3C',
      '1G': '3A',
      '1I': '3F',
      '1K': '3D',
      '1L': '3I',
    });
  });
});
```

- [ ] **Step 4: Correr los tests**

Run: `cd polla-app && npx jest src/app/shared/data/fifa-r32-annex-c.spec.ts --no-coverage`

Expected: 6 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add polla-app/src/app/shared/data/fifa-r32-annex-c.json \
        polla-app/src/app/shared/data/fifa-r32-annex-c.spec.ts \
        polla-app/tsconfig.json
git commit -m "feat(bracket): add FIFA Annex C 495-row matrix as static asset"
```

---

## Task 3: Servicio `projectKnockoutTree`

**Files:**
- Create: `polla-app/src/app/core/bracket/projected-bracket.service.ts`
- Create: `polla-app/src/app/core/bracket/projected-bracket.service.spec.ts`

- [ ] **Step 1: Escribir el test del happy path (falla primero)**

Crear `polla-app/src/app/core/bracket/projected-bracket.service.spec.ts`:

```typescript
import { projectKnockoutTree, type ProjectionInput } from './projected-bracket.service';
import { ALL_LETTERS, type Letter } from '../../shared/data/wc2026-bracket';

/** Standings dummy: pos1='1X', pos2='2X', pos3='3X', pos4='4X' para cada letra. */
function dummyStandings(letters: ReadonlyArray<Letter> = ALL_LETTERS) {
  return letters.map((groupLetter) => ({
    groupLetter,
    pos1: `1${groupLetter}`,
    pos2: `2${groupLetter}`,
    pos3: `3${groupLetter}`,
    pos4: `4${groupLetter}`,
  }));
}

const COMPLETE_INPUT = (): ProjectionInput => ({
  groupStandings: dummyStandings(),
  advancingThirds: new Set(['A', 'C', 'D', 'E', 'F', 'H', 'I', 'J']),
  mode: 'COMPLETE',
});

describe('projectKnockoutTree — happy path', () => {
  it('returns ok with 31 matches for complete input', () => {
    const r = projectKnockoutTree(COMPLETE_INPUT());
    expect(r.kind).toBe('ok');
    if (r.kind !== 'ok') throw new Error();
    expect(r.matches.length).toBe(31);   // 16 + 8 + 4 + 2 + 1
  });

  it('R32 fixed pairs (no thirds) — pos 1: 2A vs 2B (m73)', () => {
    const r = projectKnockoutTree(COMPLETE_INPUT());
    if (r.kind !== 'ok') throw new Error();
    const m = r.matches.find((mm) => mm.phaseOrder === 2 && mm.bracketPosition === 1)!;
    expect(m.homeTeamId).toBe('2A');
    expect(m.awayTeamId).toBe('2B');
  });

  it('R32 fixed pairs — pos 3: 1F vs 2C (m75)', () => {
    const r = projectKnockoutTree(COMPLETE_INPUT());
    if (r.kind !== 'ok') throw new Error();
    const m = r.matches.find((mm) => mm.phaseOrder === 2 && mm.bracketPosition === 3)!;
    expect(m.homeTeamId).toBe('1F');
    expect(m.awayTeamId).toBe('2C');
  });

  it('R32 fixed pairs — pos 16: 2D vs 2G (m88)', () => {
    const r = projectKnockoutTree(COMPLETE_INPUT());
    if (r.kind !== 'ok') throw new Error();
    const m = r.matches.find((mm) => mm.phaseOrder === 2 && mm.bracketPosition === 16)!;
    expect(m.homeTeamId).toBe('2D');
    expect(m.awayTeamId).toBe('2G');
  });

  it('R32 with thirds — pos 7 (m79, 1A): matrix ACDEFHIJ[1A]=3H, so 1A vs 3H', () => {
    const r = projectKnockoutTree(COMPLETE_INPUT());
    if (r.kind !== 'ok') throw new Error();
    const m = r.matches.find((mm) => mm.phaseOrder === 2 && mm.bracketPosition === 7)!;
    expect(m.homeTeamId).toBe('1A');
    expect(m.awayTeamId).toBe('3H');
  });

  it('R32 with thirds — pos 2 (m74, 1E): ACDEFHIJ[1E]=3C, so 1E vs 3C', () => {
    const r = projectKnockoutTree(COMPLETE_INPUT());
    if (r.kind !== 'ok') throw new Error();
    const m = r.matches.find((mm) => mm.phaseOrder === 2 && mm.bracketPosition === 2)!;
    expect(m.homeTeamId).toBe('1E');
    expect(m.awayTeamId).toBe('3C');
  });

  it('R32 with thirds — pos 15 (m87, 1K): ACDEFHIJ[1K]=3D, so 1K vs 3D', () => {
    const r = projectKnockoutTree(COMPLETE_INPUT());
    if (r.kind !== 'ok') throw new Error();
    const m = r.matches.find((mm) => mm.phaseOrder === 2 && mm.bracketPosition === 15)!;
    expect(m.homeTeamId).toBe('1K');
    expect(m.awayTeamId).toBe('3D');
  });

  it('higher rounds are empty (R16 + QF + SF + F with no teams assigned)', () => {
    const r = projectKnockoutTree(COMPLETE_INPUT());
    if (r.kind !== 'ok') throw new Error();
    const byPhase = new Map<number, number>();
    for (const m of r.matches) {
      byPhase.set(m.phaseOrder, (byPhase.get(m.phaseOrder) ?? 0) + 1);
    }
    expect(byPhase.get(2)).toBe(16);
    expect(byPhase.get(3)).toBe(8);
    expect(byPhase.get(4)).toBe(4);
    expect(byPhase.get(5)).toBe(2);
    expect(byPhase.get(6)).toBe(1);
    for (const m of r.matches) {
      if (m.phaseOrder > 2) {
        expect(m.homeTeamId).toBe('');
        expect(m.awayTeamId).toBe('');
      }
    }
  });

  it('all match ids are unique and use projected: prefix', () => {
    const r = projectKnockoutTree(COMPLETE_INPUT());
    if (r.kind !== 'ok') throw new Error();
    const ids = new Set(r.matches.map((m) => m.id));
    expect(ids.size).toBe(r.matches.length);
    for (const id of ids) expect(id.startsWith('projected:')).toBe(true);
  });

  it('all projected matches have status PROJECTED and empty kickoffAt', () => {
    const r = projectKnockoutTree(COMPLETE_INPUT());
    if (r.kind !== 'ok') throw new Error();
    for (const m of r.matches) {
      expect(m.status).toBe('PROJECTED');
      expect(m.kickoffAt).toBe('');
      expect(m.homeScore).toBeNull();
      expect(m.awayScore).toBeNull();
    }
  });

  it('determinism: same input produces deep-equal output', () => {
    const r1 = projectKnockoutTree(COMPLETE_INPUT());
    const r2 = projectKnockoutTree(COMPLETE_INPUT());
    expect(r2).toEqual(r1);
  });
});

describe('projectKnockoutTree — incomplete input', () => {
  it('returns incomplete when fewer than 8 thirds', () => {
    const r = projectKnockoutTree({
      ...COMPLETE_INPUT(),
      advancingThirds: new Set(['A', 'B', 'C', 'D', 'E', 'F', 'G']),
    });
    expect(r.kind).toBe('incomplete');
    if (r.kind !== 'incomplete') throw new Error();
    expect(r.missing.thirdsCount).toBe(7);
  });

  it('returns incomplete when more than 8 thirds', () => {
    const r = projectKnockoutTree({
      ...COMPLETE_INPUT(),
      advancingThirds: new Set(['A','B','C','D','E','F','G','H','I']),
    });
    expect(r.kind).toBe('incomplete');
    if (r.kind !== 'incomplete') throw new Error();
    expect(r.missing.thirdsCount).toBe(9);
  });

  it('returns incomplete when a standing row is missing a position', () => {
    const standings = dummyStandings();
    // Vaciar pos3 del grupo A
    standings[0] = { ...standings[0]!, pos3: '' };
    const r = projectKnockoutTree({ ...COMPLETE_INPUT(), groupStandings: standings });
    expect(r.kind).toBe('incomplete');
    if (r.kind !== 'incomplete') throw new Error();
    expect(r.missing.groupsWithoutFullStanding).toContain('A');
  });

  it('returns incomplete when entire group standing is missing', () => {
    const standings = dummyStandings(ALL_LETTERS.filter((l) => l !== 'L'));
    const r = projectKnockoutTree({ ...COMPLETE_INPUT(), groupStandings: standings });
    expect(r.kind).toBe('incomplete');
    if (r.kind !== 'incomplete') throw new Error();
    expect(r.missing.groupsWithoutFullStanding).toContain('L');
  });
});
```

- [ ] **Step 2: Correr el test para confirmar que falla**

Run: `cd polla-app && npx jest src/app/core/bracket/projected-bracket.service.spec.ts --no-coverage`

Expected: FAIL con "Cannot find module './projected-bracket.service'".

- [ ] **Step 3: Implementar el servicio**

Crear `polla-app/src/app/core/bracket/projected-bracket.service.ts`:

```typescript
/**
 * Proyección del bracket Mundial 2026 desde las predicciones del usuario.
 *
 * Función pura, sin dependencias Angular: dada la tabla del usuario por
 * grupo + los 8 grupos que él considera que pasan tercero, devuelve los
 * 16 cruces de R32 (resueltos vía la matriz FIFA Anexo C) más los 15
 * partidos vacíos del resto del árbol (R16, QF, SF, F).
 *
 * Los IDs de los matches son sintéticos (prefijo `projected:`) para no
 * colisionar con IDs reales de DynamoDB cuando el admin cargue los
 * partidos. Cuando eso ocurra, el componente deja de llamar a este
 * servicio y muestra los reales — la transición es automática.
 */

import matrixData from '../../shared/data/fifa-r32-annex-c.json';
import {
  R32_TEMPLATE,
  ALL_LETTERS,
  FIRSTS_VS_THIRDS,
  type Letter,
  type SlotRef,
} from '../../shared/data/wc2026-bracket';

type MatrixRow = Record<string, string>;
const matrix = matrixData as {
  byCombination: Record<string, MatrixRow>;
};

export type ProjectionInput = {
  groupStandings: ReadonlyArray<{
    groupLetter: string;
    pos1: string; pos2: string; pos3: string; pos4: string;
  }>;
  advancingThirds: ReadonlySet<string>;
  mode: 'SIMPLE' | 'COMPLETE';
};

export type ProjectedKnockoutMatch = {
  id: string;
  phaseOrder: number;
  homeTeamId: string;
  awayTeamId: string;
  bracketPosition: number;
  kickoffAt: string;
  status: 'PROJECTED';
  homeScore: null;
  awayScore: null;
};

export type ProjectionMissing = {
  groupsWithoutFullStanding: string[];
  thirdsCount: number;
};

export type ProjectionResult =
  | { kind: 'ok'; matches: ProjectedKnockoutMatch[] }
  | { kind: 'incomplete'; missing: ProjectionMissing };

const HIGHER_PHASES: ReadonlyArray<{ order: number; count: number }> = [
  { order: 3, count: 8 },   // R16
  { order: 4, count: 4 },   // QF
  { order: 5, count: 2 },   // SF
  { order: 6, count: 1 },   // Final
];

function validate(input: ProjectionInput): ProjectionMissing | null {
  const byLetter = new Map<string, ProjectionInput['groupStandings'][number]>();
  for (const gs of input.groupStandings) byLetter.set(gs.groupLetter, gs);

  const missing: string[] = [];
  for (const letter of ALL_LETTERS) {
    const gs = byLetter.get(letter);
    if (!gs || !gs.pos1 || !gs.pos2 || !gs.pos3 || !gs.pos4) {
      missing.push(letter);
    }
  }

  const thirdsCount = input.advancingThirds.size;

  if (missing.length === 0 && thirdsCount === 8) return null;
  return { groupsWithoutFullStanding: missing, thirdsCount };
}

export function projectKnockoutTree(input: ProjectionInput): ProjectionResult {
  const missing = validate(input);
  if (missing) return { kind: 'incomplete', missing };

  // Index slugs por grupo
  const firstOf:  Record<string, string> = {};
  const secondOf: Record<string, string> = {};
  const thirdOf:  Record<string, string> = {};
  for (const gs of input.groupStandings) {
    firstOf[gs.groupLetter]  = gs.pos1;
    secondOf[gs.groupLetter] = gs.pos2;
    thirdOf[gs.groupLetter]  = gs.pos3;
  }

  // Lookup matriz
  const key = [...input.advancingThirds].sort().join('');
  const row = matrix.byCombination[key];
  if (!row) {
    // Imposible si validate() pasó (495 keys cubren todas las combinaciones).
    throw new Error(`No matrix row for thirds combination "${key}"`);
  }

  // Construir 16 R32 desde la plantilla
  const r32: ProjectedKnockoutMatch[] = R32_TEMPLATE.map((slot, idx) => {
    const home = resolveSlot(slot.home, firstOf, secondOf, thirdOf, row);
    const away = resolveSlot(slot.away, firstOf, secondOf, thirdOf, row);
    return {
      id: `projected:2:${idx + 1}`,
      phaseOrder: 2,
      homeTeamId: home,
      awayTeamId: away,
      bracketPosition: idx + 1,
      kickoffAt: '',
      status: 'PROJECTED' as const,
      homeScore: null,
      awayScore: null,
    };
  });

  // Construir fases superiores vacías
  const higher: ProjectedKnockoutMatch[] = [];
  for (const { order, count } of HIGHER_PHASES) {
    for (let pos = 1; pos <= count; pos++) {
      higher.push({
        id: `projected:${order}:${pos}`,
        phaseOrder: order,
        homeTeamId: '',
        awayTeamId: '',
        bracketPosition: pos,
        kickoffAt: '',
        status: 'PROJECTED' as const,
        homeScore: null,
        awayScore: null,
      });
    }
  }

  return { kind: 'ok', matches: [...r32, ...higher] };
}

function resolveSlot(
  slot: SlotRef,
  firstOf:  Record<string, string>,
  secondOf: Record<string, string>,
  thirdOf:  Record<string, string>,
  matrixRow: MatrixRow,
): string {
  const letter = slot[2] as Letter;
  if (slot[0] === 'F') return firstOf[letter]!;
  if (slot[0] === 'S') return secondOf[letter]!;
  // 'T' — leer matriz: 1<letter> → '3X' → thirdOf[X]
  const mapped = matrixRow[`1${letter}`];
  if (!mapped) throw new Error(`Matrix row missing column 1${letter}`);
  const thirdLetter = mapped[1] as Letter;   // '3X' → 'X'
  return thirdOf[thirdLetter]!;
}
```

- [ ] **Step 4: Correr los tests**

Run: `cd polla-app && npx jest src/app/core/bracket/projected-bracket.service.spec.ts --no-coverage`

Expected: 15 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add polla-app/src/app/core/bracket/projected-bracket.service.ts \
        polla-app/src/app/core/bracket/projected-bracket.service.spec.ts
git commit -m "feat(bracket): add projectKnockoutTree pure service with TDD"
```

---

## Task 4: Integrar la proyección en `bracket-picks.component.ts`

**Files:**
- Modify: `polla-app/src/app/features/picks/bracket-picks.component.ts`

Este componente es grande (≈900 líneas). Los cambios son acotados pero tocan varias secciones. Hacerlos en orden.

- [ ] **Step 1: Agregar imports y estado nuevo**

En el bloque de imports superior (después de `PicksSyncService`), agregar:

```typescript
import { projectKnockoutTree, type ProjectionMissing } from '../../core/bracket/projected-bracket.service';
```

En la clase, junto a los signals existentes (`matches`, `winners`, etc., línea ~371), agregar:

```typescript
isProjected = signal(false);
projectionMissing = signal<ProjectionMissing | null>(null);
```

- [ ] **Step 2: Modificar `loadForMode()` para que siempre proyecte el bracket**

Localizar el bloque que construye `knockouts` desde `matchesRes` (línea ~604-618). Reemplazar desde `const knockouts: KnockoutMatch[] = (matchesRes.data ?? [])` hasta `this.matches.set(knockouts);` con:

```typescript
      // El bracket de /picks/bracket SIEMPRE es la proyección del propio
      // user. Los Match rows reales que admin carga viven en otras
      // pantallas y alimentan el scoring backend (no se renderizan aquí).
      const [standingsRes, thirdsRes] = await Promise.all([
        this.api.listGroupStandingPicks(this.currentUserId, m),
        this.api.getBestThirdsPick(this.currentUserId, TOURNAMENT_ID, m),
      ]);
      const standings = (standingsRes.data ?? [])
        .filter((s): s is NonNullable<typeof s> =>
          !!s && s.tournamentId === TOURNAMENT_ID && !!s.groupLetter)
        .map((s) => ({
          groupLetter: s.groupLetter,
          pos1: s.pos1 ?? '',
          pos2: s.pos2 ?? '',
          pos3: s.pos3 ?? '',
          pos4: s.pos4 ?? '',
        }));
      const advancing = new Set<string>(
        (thirdsRes.data?.[0]?.advancing ?? []).filter((l): l is string => !!l),
      );
      const result = projectKnockoutTree({
        groupStandings: standings,
        advancingThirds: advancing,
        mode: m,
      });

      let knockouts: KnockoutMatch[];
      if (result.kind === 'ok') {
        knockouts = result.matches as KnockoutMatch[];
        this.isProjected.set(true);
        this.projectionMissing.set(null);
      } else {
        knockouts = [];
        this.isProjected.set(false);
        this.projectionMissing.set(result.missing);
      }
      this.matches.set(knockouts);
```

Nota: `matchesRes` ya no se usa para construir el bracket en este componente. La llamada `this.api.listMatches(TOURNAMENT_ID)` sigue corriendo (no es trivial removerla del `Promise.all`) y su resultado simplemente se ignora aquí. Si quieres limpiarlo, omite `matchesRes` del Promise.all y de los listMatches.

- [ ] **Step 3: Filtrar winners rehidratados a IDs vigentes**

Localizar el bloque `this.winners.set(winnersState);` (línea ~648). Justo antes de ese set, agregar el filtro para descartar entries con ids que no existen en el bracket actual (importante cuando el user re-entra después de cambiar standings/thirds y los IDs sintéticos viejos del localStorage ya no aplican):

```typescript
      // Descartar winners cuyo matchId ya no existe (puede pasar cuando
      // el user cambió sus preds y los IDs proyectados anteriores no
      // coinciden con los nuevos).
      const validIds = new Set(knockouts.map((k) => k.id));
      winnersState = new Map([...winnersState].filter(([id]) => validIds.has(id)));

      this.winners.set(winnersState);
```

- [ ] **Step 4: Fix `bracketLockAt` para ignorar matches sin kickoff**

Localizar el computed `bracketLockAt` (línea ~405-411). Reemplazarlo con:

```typescript
  bracketLockAt = computed<string | null>(() => {
    const withKickoff = this.matches().filter((m) => !!m.kickoffAt);
    if (withKickoff.length === 0) return null;
    let min = withKickoff[0]!.kickoffAt;
    for (const m of withKickoff) if (m.kickoffAt < min) min = m.kickoffAt;
    return min;
  });
```

Razón: matches proyectados tienen `kickoffAt: ''`; sin este filtro, el min compara strings vacíos y devuelve `''`, lo que rompe `bracketLockFormatted()` (llama `time.formatKickoff('')`).

- [ ] **Step 5: Reemplazar el branch de UI "hasNoKnockoutMatches"**

Localizar el bloque (línea ~151):

```html
      } @else if (hasNoKnockoutMatches()) {
        <div class="empty-block">
          <h3>Las llaves todavía no están armadas</h3>
          <p>
            El admin carga las llaves después de que termine la fase de grupos.
            Vuelve cuando estén disponibles.
          </p>
        </div>
      } @else {
```

Reemplazarlo con:

```html
      } @else if (projectionMissing(); as miss) {
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
      } @else {
```

Nota: dejamos el branch original `hasNoKnockoutMatches()` como fallback raro (puede ocurrir si la API devolvió un error parcial), pero ahora es secundario al de `projectionMissing()`.

- [ ] **Step 6: Agregar banner informativo**

Justo antes del `<div class="bracket-scroll">` (línea ~161), agregar:

```html
        @if (isProjected()) {
          <div class="info-banner" style="margin-bottom:14px;padding:10px 12px;background:rgba(0,200,100,0.08);border:1px solid rgba(0,200,100,0.25);border-radius:8px;font-size:13px;color:var(--wf-ink-2);">
            🔮 Bracket armado desde tus predicciones de grupos.
            Tus elecciones aquí se quedan fijas — los resultados reales
            del Mundial puntúan tu BracketPick comparando equipos por fase.
          </div>
        }
```

- [ ] **Step 7: Verificar typecheck**

Run: `cd polla-app && npx tsc --noEmit -p tsconfig.app.json`

Expected: 0 errores. Si hay un type mismatch entre `ProjectedKnockoutMatch` y `KnockoutMatch` por el campo `status` (`'PROJECTED'` vs `string | null`), el cast `as KnockoutMatch[]` en el código resuelve. Si hay error de otro tipo, ajustar.

- [ ] **Step 8: Verificar tests existentes y nuevos**

Run: `cd polla-app && npx jest --no-coverage`

Expected: todos los suites verdes (incluyendo los 2 nuevos: wc2026-bracket.spec.ts, fifa-r32-annex-c.spec.ts, projected-bracket.service.spec.ts).

- [ ] **Step 9: Commit**

```bash
git add polla-app/src/app/features/picks/bracket-picks.component.ts
git commit -m "feat(bracket): wire projected R32 bracket into picks UI"
```

---

## Task 5: Verificación manual en el navegador

**Files:** ninguno (verificación)

- [ ] **Step 1: Asegurar dev server corriendo**

El dev server debería estar corriendo en `http://localhost:4200` (lanzado al inicio de la sesión). Si no:

```bash
cd polla-app && npm start
```

Esperar a "Application bundle generation complete" y "Local: http://localhost:4200/".

- [ ] **Step 2: Login y navegar a `/picks/bracket`**

Abrir `http://localhost:4200/picks/bracket` con un usuario cuyos `GroupStandingPick` y `BestThirdsPick` no estén completos. Verificar:

- Se muestra "Para ver tu bracket primero termina tus predicciones".
- Lista los grupos que faltan completar (si alguno).
- Lista el conteo de terceros marcados (si no es 8).
- Los CTAs llevan a `/picks/group-stage/predict` y `/profile/special-picks` respectivamente.

- [ ] **Step 3: Completar predicciones**

Navegar a `/picks/group-stage/predict`, completar 4 posiciones para cada uno de los 12 grupos. Después navegar a la pantalla de los 8 mejores terceros (verificar la ruta correcta — puede no ser exactamente `/profile/special-picks`; si difiere, actualizar el CTA en el component y re-commitear).

- [ ] **Step 4: Volver a `/picks/bracket`**

Verificar:

- Banner verde "🔮 Bracket proyectado desde tus predicciones de grupos."
- Las 16 llaves R32 muestran 32 equipos con flag e identidad real.
- Los 8 cruces fijos (m73, m75, m76, m78, m83, m84, m86, m88) tienen 1º y 2º correctos.
- Los 8 cruces con terceros (m74, m77, m79, m80, m81, m82, m85, m87) muestran un tercero proveniente de los grupos que marcaste como clasificados.
- R16 hacia adelante están con "Pick fase anterior" en los slots.

- [ ] **Step 5: Probar la propagación**

Clickear un equipo en cada partido R32 (16 clicks). Verificar:

- Cada slot de R16 se llena con el ganador clickeado.
- El pill de save status pasa por "Cambios sin guardar" → "Guardando…" → "Bracket guardado".

Continuar clickeando R16 → QF → SF → Final → ver "CAMPEÓN · X" en el centro.

- [ ] **Step 6: Verificar que partidos reales del admin NO afectan la pantalla**

Si tienes el sandbox de backend corriendo:

```bash
cd polla-backend && node scripts/seed-test-knockouts.mjs --yes
```

Esto inserta 32 matches reales en DDB. Recargar `/picks/bracket`. Verificar:

- El banner verde sigue mostrándose.
- Los partidos R32 siguen mostrando **tus equipos proyectados** (no los del seed alfabético).
- Los winners() del user persisten — la pantalla no cambió.

Limpiar después (opcional): borrar manualmente desde DDB si quieres restaurar el estado.

- [ ] **Step 7: Verificar el flujo de "perder predicciones después de cambiar standings"**

En `/picks/group-stage/predict`, cambiar el orden de un grupo (ej. invertir 1º y 2º del grupo A). Volver a `/picks/bracket`. Verificar:

- Los cruces R32 reflejan el nuevo orden (el equipo recién promovido a 1º aparece donde antes estaba el otro).
- Los winners() guardados que ya no calzan con el nuevo bracket se descartan silenciosamente (esperado).

- [ ] **Step 8: Commit final con notas si hubo ajustes manuales**

Si en Step 3 detectaste que la ruta de "marcar 8 mejores 3.os" no es `/profile/special-picks`, actualizar el href en el component y commitear:

```bash
git add polla-app/src/app/features/picks/bracket-picks.component.ts
git commit -m "fix(bracket): correct CTA route for best thirds"
```

---

## Notas finales

- Toda la lógica nueva es **client-side**: no hay cambios en `polla-backend`, ni en el schema GraphQL, ni en lambdas.
- El scoring (`score-bracket` lambda) sigue comparando sets, no cruces; la proyección no lo afecta.
- Si en el futuro se quiere proyectar también el bracket real (admin lo carga automáticamente al cierre de la fase de grupos), el mismo `projectKnockoutTree` puede portarse a una lambda — el código es portable.
