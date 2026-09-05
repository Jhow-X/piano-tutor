/**
 * ABC notation → `Score`.
 *
 * Mesmo caminho do MusicXML: o abcjs gera um SMF com as repetições desenroladas
 * e o importador de `.mid` faz o resto. ABC não tem noção de pauta separada, de
 * modo que a atribuição de mão fica por conta da heurística de altura.
 */

import type { Score } from '../score';
import { importMidi } from './midi';

export async function importAbc(source: string, fallbackTitle: string): Promise<Score> {
  // O abcjs é pesado e só interessa a quem abre ABC.
  const { default: abcjs } = await import('abcjs');
  const output: unknown = abcjs.synth.getMidiFile(source, { midiOutputType: 'binary' });
  const bytes = firstBinary(output);
  if (!bytes) {
    throw new Error('Não foi possível gerar MIDI a partir deste arquivo ABC.');
  }

  const score = importMidi(bytes, {
    title: readAbcTitle(source) ?? fallbackTitle,
    engraving: { kind: 'abc', source },
  });
  if (score.notes.length === 0) {
    throw new Error('O arquivo ABC não produziu nenhuma nota.');
  }
  return score;
}

/** `getMidiFile` devolve um array de arquivos (um por melodia do tunebook). */
function firstBinary(output: unknown): Uint8Array | null {
  const candidate = Array.isArray(output) ? output[0] : output;
  return candidate instanceof Uint8Array ? candidate : null;
}

/** Campo `T:` do cabeçalho ABC. */
function readAbcTitle(source: string): string | undefined {
  const match = /^\s*T:\s*(.+)$/m.exec(source);
  return match?.[1]?.trim() || undefined;
}

/** Um arquivo ABC começa (após comentários) com o campo obrigatório `X:`. */
export function looksLikeAbc(text: string): boolean {
  return /^\s*(?:%.*\n)*\s*X:\s*\d/m.test(text);
}
