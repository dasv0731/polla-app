/**
 * Comparator de leaderboard según reglamento §9 (v2).
 *
 * Orden estricto (solo se pasa al siguiente si el anterior empata):
 *   1. points (total) — mayor primero
 *   2. pointsPreMundial — mayor primero (campeón + subcampeón + revelación)
 *   3. pointsBracket — mayor primero (R32 → campeón)
 *   4. pointsBestThirds — mayor primero (sub-juego de mejores 3eros)
 *   5. groupStandingsExactCount — mayor primero (exactas en 1° y 2°)
 *   6. exactCount (marcadores exactos, solo modo completo) — mayor primero
 *   7. createdAt timestamp — predicción más antigua gana (asc)
 *
 * Las rows que falten subtotales (rows pre-tiebreaker o sin scoring corrido)
 * se tratan como 0/'' — efectivamente caen al final del tiebreaker chain.
 */
export interface RankableRow {
  points: number;
  pointsPreMundial?: number | null;
  pointsBracket?: number | null;
  pointsBestThirds?: number | null;
  groupStandingsExactCount?: number | null;
  exactCount?: number | null;
  createdAt?: string | null;
}

export function compareRankable(a: RankableRow, b: RankableRow): number {
  if (b.points !== a.points) return b.points - a.points;

  const aPm = a.pointsPreMundial ?? 0;
  const bPm = b.pointsPreMundial ?? 0;
  if (bPm !== aPm) return bPm - aPm;

  const aBr = a.pointsBracket ?? 0;
  const bBr = b.pointsBracket ?? 0;
  if (bBr !== aBr) return bBr - aBr;

  const aBt = a.pointsBestThirds ?? 0;
  const bBt = b.pointsBestThirds ?? 0;
  if (bBt !== aBt) return bBt - aBt;

  const aGs = a.groupStandingsExactCount ?? 0;
  const bGs = b.groupStandingsExactCount ?? 0;
  if (bGs !== aGs) return bGs - aGs;

  const aEx = a.exactCount ?? 0;
  const bEx = b.exactCount ?? 0;
  if (bEx !== aEx) return bEx - aEx;

  // Timestamp: más antiguo primero. Strings ISO comparan bien con localeCompare.
  const aTs = a.createdAt ?? '';
  const bTs = b.createdAt ?? '';
  if (aTs && bTs) return aTs.localeCompare(bTs);
  if (aTs) return -1;       // a tiene timestamp, b no → a primero
  if (bTs) return 1;
  return 0;
}
