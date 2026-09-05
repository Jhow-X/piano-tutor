/**
 * Teste de integração do caminho MusicXML: exercita o Verovio de verdade contra
 * os arquivos de `test-fixtures/`. É lento em relação aos testes unitários, mas
 * é o único jeito de garantir que o desenrolar de repetições, a separação de
 * mãos e o casamento do dedilhado continuam funcionando.
 */

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { importMusicXml } from './musicxml';

const read = (name: string) => {
  const buffer = readFileSync(`test-fixtures/${name}`);
  return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer;
};

describe('importMusicXml', () => {
  it('desenrola as repetições', async () => {
    const score = await importMusicXml(
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
    const score = await importMusicXml(
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
    const score = await importMusicXml(
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
    const score = await importMusicXml(read('fingering-sample.musicxml'), 'f.musicxml', 'Fingering');
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
    const fromZip = await importMusicXml(read('clementi.mxl'), 'clementi.mxl', 'Clementi');
    const fromXml = await importMusicXml(
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
