/**
 * Teste de integração dos formatos gravados: exercita o Verovio de verdade
 * contra os arquivos de `test-fixtures/`. É lento em relação aos testes
 * unitários, mas é o único jeito de garantir que o desenrolar de repetições, a
 * separação de mãos e o casamento do dedilhado continuam funcionando.
 */

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { importEngraved } from './engraved';

const read = (name: string) => {
  const buffer = readFileSync(`test-fixtures/${name}`);
  return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer;
};

describe('importEngraved — MusicXML', () => {
  it('desenrola as repetições', async () => {
    const score = await importEngraved(
      read('MuzioClementi_SonatinaOpus36No1_Part1.xml'),
      'clementi.xml',
      'Clementi',
    );
    // A fonte tem 389 <note>; com as duas seções repetidas o total soa bem acima
    // disso. Sem o desenrolar, a peça teria ~half dessa duração.
    expect(score.notes.length).toBeGreaterThan(600);
    expect(score.durationBeats).toBeCloseTo(303, 0);
    expect(score.engraving).toEqual({ kind: 'verovio' });
  });

  it('separa as mãos pelas tracks nomeadas pelo Verovio', async () => {
    const score = await importEngraved(
      read('MuzioClementi_SonatinaOpus36No1_Part1.xml'),
      'clementi.xml',
      'Clementi',
    );
    expect(score.notes.some((n) => n.hand === 'right')).toBe(true);
    expect(score.notes.some((n) => n.hand === 'left')).toBe(true);
    expect(score.notes.some((n) => n.hand === 'unknown')).toBe(false);
  });

  it('separa as mãos por pauta mesmo quando as tracks têm nome genérico', async () => {
    // Nesta fonte as duas tracks se chamam "Klavier"; a separação vem de haver
    // exatamente duas, uma por pauta.
    const score = await importEngraved(
      read('JohannSebastianBach_PraeludiumInCDur_BWV846_1.xml'),
      'bach.xml',
      'Bach',
    );
    const right = score.notes.filter((n) => n.hand === 'right');
    const left = score.notes.filter((n) => n.hand === 'left');
    expect(right.length).toBeGreaterThan(0);
    expect(left.length).toBeGreaterThan(0);
    expect(mean(right.map((n) => n.midi))).toBeGreaterThan(mean(left.map((n) => n.midi)));
  });

  it('recupera o dedilhado, que a exportação MIDI perde', async () => {
    const score = await importEngraved(read('fingering-sample.musicxml'), 'f.musicxml', 'Fingering');
    const fingered = score.notes.filter((n) => n.finger !== undefined);
    expect(fingered).toHaveLength(6);
    // Mão direita: Dó5 Ré5 Mi5 Fá5 com dedos 1 2 3 4.
    expect(
      score.notes
        .filter((n) => n.midi >= 72)
        .sort((a, b) => a.startBeat - b.startBeat)
        .map((n) => n.finger),
    ).toEqual([1, 2, 3, 4]);
    // Mão esquerda: Dó3 com 5, Sol3 com 1.
    expect(score.notes.find((n) => n.midi === 48)?.finger).toBe(5);
    expect(score.notes.find((n) => n.midi === 55)?.finger).toBe(1);
  });

  it('abre .mxl comprimido, com o mesmo resultado do .xml solto', async () => {
    const fromZip = await importEngraved(read('clementi.mxl'), 'clementi.mxl', 'Clementi');
    const fromXml = await importEngraved(
      read('MuzioClementi_SonatinaOpus36No1_Part1.xml'),
      'clementi.xml',
      'Clementi',
    );
    expect(fromZip.notes.length).toBe(fromXml.notes.length);
    expect(fromZip.durationBeats).toBeCloseTo(fromXml.durationBeats, 5);
  });
});

function mean(values: number[]): number {
  return values.reduce((a, b) => a + b, 0) / values.length;
}

/**
 * Humdrum kern, o formato das coleções de piano do catálogo.
 *
 * O arquivo é buscado na rede em vez de versionado: ele é CC BY-NC-SA 4.0, e a
 * cláusula não-comercial é incompatível com a GPL-3.0 deste repositório. Sem
 * rede, o teste é pulado com aviso — não silenciosamente.
 */
describe('importEngraved — Humdrum kern', () => {
  const KERN_URL =
    'https://raw.githubusercontent.com/craigsapp/mozart-piano-sonatas/main/kern/sonata01-1.krn';

  async function fetchKern(): Promise<ArrayBuffer | null> {
    try {
      const res = await fetch(KERN_URL, { signal: AbortSignal.timeout(15_000) });
      return res.ok ? await res.arrayBuffer() : null;
    } catch {
      return null;
    }
  }

  it('lê kern e separa as mãos pela ordem das pautas', async ({ skip }) => {
    const data = await fetchKern();
    // Pular de verdade, e não passar calado: um teste que passa sem ter rodado
    // esconderia exatamente a regressão que ele existe para pegar.
    if (!data) {
      skip('kern indisponível (sem rede?)');
      return; // `skip` lança, mas o TypeScript não sabe disso
    }

    const score = await importEngraved(data, 'sonata01-1.krn', 'Mozart K.279');
    expect(score.notes.length).toBeGreaterThan(1900);
    expect(score.engraving).toEqual({ kind: 'verovio' });

    const right = score.notes.filter((n) => n.hand === 'right');
    const left = score.notes.filter((n) => n.hand === 'left');
    expect(right.length).toBeGreaterThan(0);
    expect(left.length).toBeGreaterThan(0);
    expect(score.notes.some((n) => n.hand === 'unknown')).toBe(false);

    // Em kern os nomes das tracks saem ilegíveis, então as mãos vêm da ordem
    // das pautas. Isto é a prova de que a ordem é a que supomos.
    expect(mean(right.map((n) => n.midi))).toBeGreaterThan(mean(left.map((n) => n.midi)));
  }, 40_000);
});
