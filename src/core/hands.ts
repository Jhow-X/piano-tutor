/**
 * Atribuição de mão esquerda/direita, em cascata de confiança:
 *
 *   1. `<staff>` do MusicXML  — autoritativo, resolvido no importador de MusicXML
 *   2. Separação por track MIDI — confiável só quando o arquivo tem exatamente
 *      duas tracks com notas, ou tracks nomeadas
 *   3. Heurística de altura   — ponto de corte móvel, calculado por compasso
 *
 * `'unknown'` é um estado legítimo: um arquivo de track única sem separação
 * clara não deve ser forçado a uma resposta inventada, mas a heurística (3) é
 * boa o bastante para ser útil e a UI permite desligá-la.
 */

import type { Hand, Note } from './score';

const LEFT_HAND_TRACK_PATTERN = /\b(left|lh|l\.h\.|bass|baixo|esquerda|m\.?e\.?)\b/i;
const RIGHT_HAND_TRACK_PATTERN = /\b(right|rh|r\.h\.|treble|melody|direita|m\.?d\.?)\b/i;

/** Passo 2: separação por track. Retorna `undefined` quando não há sinal confiável. */
export function handFromTrack(trackName: string | undefined, trackIndex: number, trackCount: number): Hand | undefined {
  if (trackName) {
    if (LEFT_HAND_TRACK_PATTERN.test(trackName)) return 'left';
    if (RIGHT_HAND_TRACK_PATTERN.test(trackName)) return 'right';
  }
  // Convenção quase universal em arquivos de piano de duas tracks: a primeira
  // é a clave de sol. Só confiamos nisso quando há exatamente duas.
  if (trackCount === 2) return trackIndex === 0 ? 'right' : 'left';
  return undefined;
}

const DEFAULT_SPLIT = 60; // Dó central
const MIN_SPLIT = 45;
const MAX_SPLIT = 72;

/**
 * Passo 3: ponto de corte móvel. Para cada compasso, separa as alturas que
 * soam nele em dois grupos com 2-means em uma dimensão; o corte é o ponto médio
 * entre os grupos. Compassos sem separação clara herdam o corte do anterior,
 * o que evita que a mão "pule" em trechos de mão única.
 */
export function assignHandsByPitch(notes: Note[]): void {
  if (notes.length === 0) return;

  const byMeasure = new Map<number, Note[]>();
  for (const note of notes) {
    let bucket = byMeasure.get(note.measure);
    if (!bucket) {
      bucket = [];
      byMeasure.set(note.measure, bucket);
    }
    bucket.push(note);
  }

  let split = DEFAULT_SPLIT;
  for (const measure of [...byMeasure.keys()].sort((a, b) => a - b)) {
    const measureNotes = byMeasure.get(measure)!;
    const pitches = measureNotes.map((n) => n.midi);
    split = clamp(splitPoint(pitches) ?? split, MIN_SPLIT, MAX_SPLIT);
    for (const note of measureNotes) {
      if (note.hand === 'unknown') {
        note.hand = note.midi >= split ? 'right' : 'left';
      }
    }
  }
}

/**
 * 2-means em uma dimensão. Retorna o ponto médio entre os centróides, ou
 * `undefined` quando as alturas estão próximas demais para justificar duas mãos.
 */
function splitPoint(pitches: number[]): number | undefined {
  const min = Math.min(...pitches);
  const max = Math.max(...pitches);
  // Menos de uma oitava e meia de amplitude: provavelmente uma mão só.
  if (max - min < 18) return undefined;

  let low = min;
  let high = max;
  for (let i = 0; i < 12; i++) {
    const lowGroup: number[] = [];
    const highGroup: number[] = [];
    for (const p of pitches) {
      (Math.abs(p - low) <= Math.abs(p - high) ? lowGroup : highGroup).push(p);
    }
    if (lowGroup.length === 0 || highGroup.length === 0) return undefined;
    const nextLow = mean(lowGroup);
    const nextHigh = mean(highGroup);
    if (nextLow === low && nextHigh === high) break;
    low = nextLow;
    high = nextHigh;
  }

  return (low + high) / 2;
}

function mean(values: number[]): number {
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
