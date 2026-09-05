import { describe, expect, it } from 'vitest';
import {
  cleanComposer,
  isArrangerCredit,
  parseMusicXmlHeaders,
  titleFromFileName,
} from './musicXmlHeaders';

/** Recorte real de musetrainer/library, exportado pelo MuseScore 3.5.2. */
const REAL = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="3.01">
  <work><work-title>Arabesque No. 1 in E Major</work-title></work>
  <identification>
    <creator type="composer">Claude Achille Debussy(1862–1918)</creator>
    <encoding><software>MuseScore 3.5.2</software></encoding>
  </identification>
  <part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list>
</score-partwise>`;

describe('parseMusicXmlHeaders', () => {
  it('lê título e compositor', () => {
    expect(parseMusicXmlHeaders(REAL)).toEqual({
      title: 'Arabesque No. 1 in E Major',
      composer: 'Claude Achille Debussy',
    });
  });

  it('cai em movement-title quando a obra não está preenchida', () => {
    // Acontece bastante em exportações do MuseScore.
    const xml = '<movement-title>Clair de Lune</movement-title>';
    expect(parseMusicXmlHeaders(xml).title).toBe('Clair de Lune');
  });

  it('prefere work-title a movement-title', () => {
    const xml = '<work-title>Obra</work-title><movement-title>Movimento</movement-title>';
    expect(parseMusicXmlHeaders(xml).title).toBe('Obra');
  });

  it('descarta o crédito de arranjo posto no campo de compositor', () => {
    // "Arranged by Fulano" como autor de Happy Birthday seria pior do que
    // não mostrar autor nenhum.
    const xml = '<creator type="composer">Arranged by Manjuprasad</creator>';
    expect(parseMusicXmlHeaders(xml).composer).toBeUndefined();
  });

  it('ignora creator de outro tipo', () => {
    const xml = '<creator type="lyricist">Alguém</creator>';
    expect(parseMusicXmlHeaders(xml).composer).toBeUndefined();
  });

  it('decodifica entidades', () => {
    const xml = '<work-title>Pr&#233;lude &amp; Fugue</work-title>';
    expect(parseMusicXmlHeaders(xml).title).toBe('Prélude & Fugue');
  });

  it('devolve objeto vazio num arquivo sem metadados', () => {
    expect(parseMusicXmlHeaders('<score-partwise/>')).toEqual({});
  });
});

describe('cleanComposer', () => {
  it('remove as datas de vida coladas no nome', () => {
    expect(cleanComposer('Claude Achille Debussy(1862–1918)')).toBe('Claude Achille Debussy');
    expect(cleanComposer('Bach (1685-1750)')).toBe('Bach');
  });

  it('preserva parênteses que não são datas', () => {
    expect(cleanComposer('Anônimo (século XVI)')).toBe('Anônimo (século XVI)');
  });
});

describe('isArrangerCredit', () => {
  it('reconhece as formas usuais', () => {
    // "arr. Verona" é o caso que motivou o teste: um `\\b` depois do ponto
    // nunca casa, e o filtro deixava passar.
    expect(isArrangerCredit('arr. Verona')).toBe(true);
    expect(isArrangerCredit('Arranged by Manjuprasad')).toBe(true);
    expect(isArrangerCredit('Transcribed by Liszt')).toBe(true);
  });

  it('não confunde com nome de compositor', () => {
    expect(isArrangerCredit('Arnold Schoenberg')).toBe(false);
    expect(isArrangerCredit('Frédéric Chopin')).toBe(false);
  });
});

describe('titleFromFileName', () => {
  it('transforma o nome do arquivo em algo legível', () => {
    expect(titleFromFileName('Canon_in_D_easy.mxl')).toBe('Canon in D easy');
  });
});
