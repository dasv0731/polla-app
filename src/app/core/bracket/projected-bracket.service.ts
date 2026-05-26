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
