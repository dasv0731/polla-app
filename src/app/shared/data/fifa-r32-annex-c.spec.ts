import matrix from './fifa-r32-annex-c.json';
import { FIRSTS_VS_THIRDS, ALL_LETTERS } from './wc2026-bracket';

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
