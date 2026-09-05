/**
 * Portões do modo espera.
 *
 * Um *portão* é um grupo de notas que começam juntas e que o usuário precisa
 * tocar para a reprodução continuar. A peça vira uma sequência de portões, e o
 * transporte para em cada um até ser satisfeito.
 */

import type { Note, Score } from './score';

export interface Gate {
  beat: number;
  /** Alturas exigidas, sem repetição, em ordem crescente. */
  required: number[];
  /**
   * Alturas fora do alcance do teclado do usuário. São exigidas pela peça mas
   * nascem satisfeitas — sem isso, uma peça que desça abaixo do teclado travaria
   * para sempre esperando uma nota que o instrumento não consegue produzir.
   */
  unreachable: number[];
}

/**
 * Tolerância de agrupamento, em semínimas.
 *
 * Arquivos MIDI humanizados espalham as notas de um acorde por alguns ticks;
 * agrupar por igualdade exata partiria um acorde de três notas em três portões
 * seguidos, e o usuário teria de tocá-lo desmembrado. 0,05 fica bem abaixo de
 * uma fusa (0,125) e bem acima do jitter típico.
 */
export const GATE_GROUPING_BEATS = 0.05;

export function buildGates(
  score: Score,
  isRequired: (note: Note) => boolean,
  isReachable: (midi: number) => boolean,
): Gate[] {
  const gates: Gate[] = [];
  let pitches: number[] = [];
  let anchorBeat = 0;

  const flush = () => {
    if (pitches.length === 0) return;
    const unique = [...new Set(pitches)].sort((a, b) => a - b);
    const unreachable = unique.filter((midi) => !isReachable(midi));
    // Um portão inteiramente fora do alcance não é portão nenhum: a reprodução
    // simplesmente passa por ele.
    if (unreachable.length < unique.length) {
      gates.push({ beat: anchorBeat, required: unique, unreachable });
    }
    pitches = [];
  };

  // `score.notes` já vem ordenado por startBeat (ver importers/midi.ts).
  for (const note of score.notes) {
    if (!isRequired(note)) continue;
    if (pitches.length === 0) {
      anchorBeat = note.startBeat;
    } else if (note.startBeat - anchorBeat > GATE_GROUPING_BEATS) {
      flush();
      anchorBeat = note.startBeat;
    }
    pitches.push(note.midi);
  }
  flush();

  return gates;
}

/** Índice do primeiro portão em `beat` ou depois dele. Busca binária. */
export function firstGateAtOrAfter(gates: Gate[], beat: number): number {
  let low = 0;
  let high = gates.length;
  while (low < high) {
    const mid = (low + high) >> 1;
    if (gates[mid]!.beat < beat) low = mid + 1;
    else high = mid;
  }
  return low;
}
