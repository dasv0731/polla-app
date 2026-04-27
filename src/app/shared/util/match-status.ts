export type MatchStatus = 'SCHEDULED' | 'LIVE' | 'FINAL';

/**
 * Effective status mostrada en UI:
 *   - FINAL → siempre FINAL (lo que el admin marcó manualmente).
 *   - SCHEDULED + kickoffAt ya pasó → LIVE (auto-transición visual).
 *   - resto → status guardado.
 *
 * No modifica el row en DB; el cambio "real" a LIVE no es necesario porque
 * la lógica que importa (pick-window) se chequea con kickoffAt directamente
 * en el upsertPick Lambda. Esto es solo cosmética para la UI.
 */
export function effectiveStatus(stored: MatchStatus | string | null | undefined, kickoffAt: string | null | undefined): MatchStatus {
  const s = (stored ?? 'SCHEDULED') as MatchStatus;
  if (s === 'FINAL') return 'FINAL';
  if (kickoffAt && Date.parse(kickoffAt) <= Date.now()) return 'LIVE';
  return s;
}
