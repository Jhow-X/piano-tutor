import { describe, expect, it } from 'vitest';
import { buildGates, firstGateAtOrAfter } from './gates';
import { importMidi } from './importers/midi';
import { buildMidi, type TrackSpec } from './testing/buildMidi';

const all = () => true;
const anyPitch = () => true;

function scoreOf(tracks: TrackSpec[]) {
  return importMidi(buildMidi({ bpm: 120, tracks }));
}

describe('buildGates', () => {
  it('faz um portão por ataque numa linha melódica', () => {
    const score = scoreOf([{ notes: [[60, 0, 1], [62, 1, 1], [64, 2, 1]] }]);
    const gates = buildGates(score, all, anyPitch);
    expect(gates.map((g) => [g.beat, g.required])).toEqual([
      [0, [60]],
      [1, [62]],
      [2, [64]],
    ]);
  });

  it('junta num único portão as notas de um acorde', () => {
    const score = scoreOf([{ notes: [[60, 0, 1], [64, 0, 1], [67, 0, 1]] }]);
    const gates = buildGates(score, all, anyPitch);
    expect(gates).toHaveLength(1);
    expect(gates[0]!.required).toEqual([60, 64, 67]);
  });

  it('junta acorde humanizado, espalhado por alguns ticks', () => {
    // Espalhamento típico de MIDI gravado ao vivo. Sem tolerância, isto viraria
    // três portões e o acorde teria de ser tocado desmembrado.
    const score = scoreOf([{ notes: [[60, 0, 1], [64, 0.012, 1], [67, 0.03, 1]] }]);
    const gates = buildGates(score, all, anyPitch);
    expect(gates).toHaveLength(1);
    expect(gates[0]!.required).toEqual([60, 64, 67]);
  });

  it('não junta notas separadas por uma fusa', () => {
    // 0,125 semínima está acima da tolerância: são dois ataques distintos.
    const score = scoreOf([{ notes: [[60, 0, 1], [62, 0.125, 1]] }]);
    expect(buildGates(score, all, anyPitch)).toHaveLength(2);
  });

  it('remove alturas repetidas dentro do mesmo portão', () => {
    const score = scoreOf([{ notes: [[60, 0, 1], [60, 0, 2], [64, 0, 1]] }]);
    expect(buildGates(score, all, anyPitch)[0]!.required).toEqual([60, 64]);
  });

  it('exige apenas as notas da mão escolhida', () => {
    const score = scoreOf([
      { name: 'Right Hand', notes: [[72, 0, 1], [74, 1, 1]] },
      { name: 'Left Hand', notes: [[48, 0, 1], [50, 1, 1]] },
    ]);
    const gates = buildGates(score, (note) => note.hand === 'right', anyPitch);
    expect(gates.map((g) => g.required)).toEqual([[72], [74]]);
  });

  it('marca como inalcançável a altura fora do teclado, sem perder o portão', () => {
    const score = scoreOf([{ notes: [[24, 0, 1], [60, 0, 1]] }]);
    const gates = buildGates(score, all, (midi) => midi >= 36);
    expect(gates).toHaveLength(1);
    expect(gates[0]!.required).toEqual([24, 60]);
    expect(gates[0]!.unreachable).toEqual([24]);
  });

  it('descarta o portão inteiramente fora do alcance', () => {
    // Sem isto, uma peça que desça abaixo do teclado travaria para sempre
    // esperando uma nota que o instrumento não consegue produzir.
    const score = scoreOf([{ notes: [[24, 0, 1], [26, 1, 1], [60, 2, 1]] }]);
    const gates = buildGates(score, all, (midi) => midi >= 36);
    expect(gates.map((g) => g.beat)).toEqual([2]);
  });

  it('não produz portão nenhum quando nada é exigido', () => {
    const score = scoreOf([{ notes: [[60, 0, 1]] }]);
    expect(buildGates(score, () => false, anyPitch)).toEqual([]);
  });
});

describe('firstGateAtOrAfter', () => {
  const gates = [0, 1, 2.5, 4].map((beat) => ({ beat, required: [60], unreachable: [] }));

  it('encontra o portão que começa exatamente no beat', () => {
    expect(firstGateAtOrAfter(gates, 2.5)).toBe(2);
  });

  it('encontra o próximo quando o beat cai no meio', () => {
    expect(firstGateAtOrAfter(gates, 1.4)).toBe(2);
  });

  it('devolve o comprimento quando não há mais portões', () => {
    expect(firstGateAtOrAfter(gates, 9)).toBe(4);
  });

  it('devolve 0 no início', () => {
    expect(firstGateAtOrAfter(gates, 0)).toBe(0);
  });
});
