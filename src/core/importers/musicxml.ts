/**
 * MusicXML (`.musicxml`, `.xml`, `.mxl`) → `Score`.
 *
 * Estratégia: o Verovio exporta MIDI com as repetições já desenroladas, e esse
 * MIDI passa pelo importador de `.mid` — assim existe um único extrator de notas.
 * O que a exportação MIDI perde é recuperado num segundo passe:
 *
 *   - **mãos**: o Verovio nomeia as tracks ("Piano (right)"/"Piano (left)") ou,
 *     quando o nome é genérico, emite uma track por pauta — os dois casos já são
 *     cobertos por `handFromTrack`.
 *   - **dedilhado**: o `<fing>` do MEI aponta para o `xml:id` da nota; o timemap
 *     dá `qstamp` (em semínimas) e o id de cada nota que soa. Como o timemap e a
 *     exportação MIDI descrevem a *mesma* linha do tempo desenrolada, casar por
 *     (semínima, altura) é exato.
 */

import type { Note, Score } from '../score';
import { importMidi } from './midi';
import { ENGRAVING_OPTIONS, getVerovioToolkit } from '../verovio';
import type { VerovioToolkit } from 'verovio/esm';

export async function importMusicXml(
  data: ArrayBuffer,
  fileName: string,
  title: string,
): Promise<Score> {
  const toolkit = await getVerovioToolkit();
  toolkit.setOptions({ ...ENGRAVING_OPTIONS });

  const compressed = fileName.toLowerCase().endsWith('.mxl');
  const loaded = compressed
    ? toolkit.loadZipDataBuffer(data)
    : toolkit.loadData(new TextDecoder().decode(data));
  if (!loaded) {
    throw new Error('O Verovio não conseguiu interpretar este arquivo MusicXML.');
  }

  const midiBytes = base64ToBytes(toolkit.renderToMIDI());
  const score = importMidi(midiBytes, {
    title,
    engraving: { kind: 'verovio' },
    // O Verovio já separa as pautas em tracks; a heurística de altura só
    // atrapalharia numa peça de mão cruzada.
    skipPitchHeuristic: true,
  });

  attachFingerings(toolkit, score.notes);
  return score;
}

/** Casa `<fing>` (por `xml:id` de nota) com as notas importadas do MIDI. */
function attachFingerings(toolkit: VerovioToolkit, notes: Note[]): void {
  const fingeringByNoteId = readFingerings(toolkit.getMEI({}));
  if (fingeringByNoteId.size === 0) return;

  // Chave (semínima, altura) → dedo, montada a partir do timemap.
  const byBeatAndPitch = new Map<string, number>();
  for (const entry of toolkit.renderToTimemap({})) {
    for (const id of entry.on ?? []) {
      const finger = fingeringByNoteId.get(id);
      if (finger === undefined) continue;
      const { pitch } = toolkit.getMIDIValuesForElement(id);
      byBeatAndPitch.set(beatPitchKey(entry.qstamp, pitch), finger);
    }
  }

  for (const note of notes) {
    const finger = byBeatAndPitch.get(beatPitchKey(note.startBeat, note.midi));
    if (finger !== undefined) note.finger = finger;
  }
}

/**
 * Lê `<fing ... startid="#xmlId">N</fing>` do MEI. Uma varredura por regex basta:
 * o MEI vem do próprio Verovio, com formato previsível, e o alvo é um elemento
 * folha de conteúdo numérico.
 */
function readFingerings(mei: string): Map<string, number> {
  const result = new Map<string, number>();
  const pattern = /<fing\b[^>]*\bstartid="#([^"]+)"[^>]*>([^<]*)<\/fing>/g;
  for (const match of mei.matchAll(pattern)) {
    const finger = Number.parseInt((match[2] ?? '').trim(), 10);
    if (Number.isInteger(finger) && finger >= 1 && finger <= 5) {
      result.set(match[1]!, finger);
    }
  }
  return result;
}

/** Arredondado para absorver ruído de ponto flutuante entre as duas fontes. */
function beatPitchKey(beat: number, pitch: number): string {
  return `${Math.round(beat * 1000)}:${pitch}`;
}

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}
