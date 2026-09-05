import { describe, expect, it } from 'vitest';
import { beatToSeconds, isBlackKey, midiToNoteName, secondsToBeat } from './score';

describe('beatToSeconds', () => {
  it('usa 120bpm como andamento único', () => {
    const map = [{ beat: 0, bpm: 120 }];
    expect(beatToSeconds(0, map)).toBe(0);
    expect(beatToSeconds(4, map)).toBeCloseTo(2);
  });

  it('integra sobre mudanças de andamento', () => {
    // 4 semínimas a 120bpm (2s) e depois 4 a 60bpm (4s).
    const map = [
      { beat: 0, bpm: 120 },
      { beat: 4, bpm: 60 },
    ];
    expect(beatToSeconds(4, map)).toBeCloseTo(2);
    expect(beatToSeconds(8, map)).toBeCloseTo(6);
  });

  it('é invertido exatamente por secondsToBeat', () => {
    const map = [
      { beat: 0, bpm: 90 },
      { beat: 6, bpm: 144 },
      { beat: 13, bpm: 72 },
    ];
    for (const beat of [0, 1.5, 6, 9.25, 13, 20]) {
      expect(secondsToBeat(beatToSeconds(beat, map), map)).toBeCloseTo(beat, 6);
    }
  });
});

describe('nomes de notas', () => {
  it('nomeia as classes de altura nos dois sistemas', () => {
    expect(midiToNoteName(60)).toBe('C');
    expect(midiToNoteName(61)).toBe('C#');
    expect(midiToNoteName(60, 'solfege')).toBe('Dó');
    expect(midiToNoteName(67, 'solfege')).toBe('Sol');
  });

  it('identifica as cinco teclas pretas da oitava', () => {
    const black = [60, 61, 62, 63, 64, 65, 66, 67, 68, 69, 70, 71].filter(isBlackKey);
    expect(black).toEqual([61, 63, 66, 68, 70]);
  });
});
