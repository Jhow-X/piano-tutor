import { describe, expect, it } from 'vitest';
import { buildMidi } from '../testing/buildMidi';
import { importMidi, buildMeasures } from './midi';

describe('importMidi', () => {
  it('converte ticks em beats independentemente do PPQ', () => {
    for (const ppq of [96, 480, 960]) {
      const score = importMidi(
        buildMidi({ ppq, tracks: [{ notes: [[60, 0, 1], [62, 1, 0.5], [64, 2, 2]] }] }),
      );
      expect(score.notes.map((n) => n.startBeat)).toEqual([0, 1, 2]);
      expect(score.notes.map((n) => n.endBeat)).toEqual([1, 1.5, 4]);
      expect(score.durationBeats).toBe(4);
    }
  });

  it('ordena as notas por início e depois por altura', () => {
    const score = importMidi(
      buildMidi({ tracks: [{ notes: [[67, 1, 1], [60, 0, 1], [64, 0, 1], [55, 0, 1]] }] }),
    );
    expect(score.notes.map((n) => [n.startBeat, n.midi])).toEqual([
      [0, 55],
      [0, 60],
      [0, 64],
      [1, 67],
    ]);
  });

  it('atribui as mãos por track quando há exatamente duas', () => {
    const score = importMidi(
      buildMidi({
        tracks: [
          { notes: [[72, 0, 1]] },
          { notes: [[48, 0, 1]] },
        ],
      }),
    );
    expect(score.notes.find((n) => n.midi === 72)!.hand).toBe('right');
    expect(score.notes.find((n) => n.midi === 48)!.hand).toBe('left');
  });

  it('respeita o nome da track acima da ordem', () => {
    const score = importMidi(
      buildMidi({
        tracks: [
          { name: 'Left Hand', notes: [[48, 0, 1]] },
          { name: 'Right Hand', notes: [[72, 0, 1]] },
        ],
      }),
    );
    expect(score.notes.find((n) => n.midi === 48)!.hand).toBe('left');
    expect(score.notes.find((n) => n.midi === 72)!.hand).toBe('right');
  });

  it('separa as mãos por altura numa track única', () => {
    // Baixo em Dó2/Sol2 contra melodia em Dó5: mais de uma oitava e meia de
    // amplitude, então a heurística deve encontrar o corte.
    const score = importMidi(
      buildMidi({
        tracks: [
          {
            notes: [
              [36, 0, 1], [43, 0, 1], [84, 0, 1],
              [36, 1, 1], [43, 1, 1], [86, 1, 1],
            ],
          },
        ],
      }),
    );
    expect(score.notes.filter((n) => n.midi < 60).every((n) => n.hand === 'left')).toBe(true);
    expect(score.notes.filter((n) => n.midi > 80).every((n) => n.hand === 'right')).toBe(true);
  });

  it('não expõe grafia: .mid não carrega notação', () => {
    const score = importMidi(buildMidi({ tracks: [{ notes: [[60, 0, 1]] }] }));
    expect(score.engraving).toBeUndefined();
  });
});

describe('buildMeasures', () => {
  it('usa 4/4 como padrão', () => {
    const measures = buildMeasures([{ beat: 0, numerator: 4, denominator: 4 }], 12);
    expect(measures).toHaveLength(3);
    expect(measures[1]).toEqual({ index: 1, startBeat: 4, endBeat: 8 });
  });

  it('mede 6/8 como três semínimas', () => {
    const measures = buildMeasures([{ beat: 0, numerator: 6, denominator: 8 }], 9);
    expect(measures.map((m) => m.startBeat)).toEqual([0, 3, 6]);
  });

  it('trunca o compasso na mudança de fórmula em vez de invadir a seção seguinte', () => {
    const measures = buildMeasures(
      [
        { beat: 0, numerator: 4, denominator: 4 },
        { beat: 6, numerator: 3, denominator: 4 },
      ],
      12,
    );
    // 0–4 completo, 4–6 truncado pela mudança, depois compassos de 3 em 3.
    expect(measures.map((m) => [m.startBeat, m.endBeat])).toEqual([
      [0, 4],
      [4, 6],
      [6, 9],
      [9, 12],
    ]);
  });

  it('atribui cada nota ao compasso em que ela começa', () => {
    const score = importMidi(
      buildMidi({ tracks: [{ notes: [[60, 0, 1], [62, 3.5, 1], [64, 4, 1], [65, 9, 1]] }] }),
    );
    expect(score.notes.map((n) => n.measure)).toEqual([0, 0, 1, 2]);
  });
});
