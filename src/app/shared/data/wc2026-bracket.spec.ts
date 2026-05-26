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
