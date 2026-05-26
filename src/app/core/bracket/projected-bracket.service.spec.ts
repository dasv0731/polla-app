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
