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
