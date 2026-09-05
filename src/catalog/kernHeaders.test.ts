import { describe, expect, it } from 'vitest';
import { clean, describeKern, displayComposer, parseKernHeaders } from './kernHeaders';

/** Cabeçalho real de mozart-piano-sonatas/kern/sonata01-1.krn. */
const REAL_HEADER = `!!!!SEGMENT: sonata01-1.krn
!!!COM: Mozart, Wolfgang Amadeus
!!!CDT: 1756/01/27/-1791/12/05/
!!!OTL: Piano Sonata No. 1 in C major
!!!SCT1: K<sup>1</sup> 279
!!!SCT2: K<sup>6</sup> 189d
!!!OMV: 1
!!!OMD: Allegro.
!!!YOR: Alte Mozart-Ausgabe, Breitkopf &amp; H&auml;rtel 1877-1883.
!!!YEM: Licence: (CC BY-NC-SA 4.0) https://creativecommons.org/licenses/by-nc-sa/4.0
!!!AGN: piano sonata
**kern	**kern
*staff2	*staff1
`;

describe('parseKernHeaders', () => {
  it('extrai os campos que o catálogo usa', () => {
    const meta = parseKernHeaders(REAL_HEADER);
    expect(meta.composer).toBe('Mozart, Wolfgang Amadeus');
    expect(meta.title).toBe('Piano Sonata No. 1 in C major');
    expect(meta.movementNumber).toBe('1');
    expect(meta.movementName).toBe('Allegro.');
  });

  it('limpa o HTML do número de catálogo', () => {
    expect(parseKernHeaders(REAL_HEADER).catalog).toBe('K1 279');
  });

  it('para na primeira linha de dados em vez de varrer o arquivo', () => {
    const meta = parseKernHeaders(`${REAL_HEADER}!!!OTL: nunca vista\n`);
    expect(meta.title).toBe('Piano Sonata No. 1 in C major');
  });

  it('o primeiro registro de cada tipo vence', () => {
    // !!!OTL repetido descreve traduções do título, não o título principal.
    const meta = parseKernHeaders('!!!OTL: Original\n!!!OTL: Tradução\n');
    expect(meta.title).toBe('Original');
  });

  it('devolve objeto vazio num arquivo sem cabeçalho', () => {
    expect(parseKernHeaders('**kern\n4c\n*-\n')).toEqual({});
  });

  it('aceita chaves com sufixo de idioma', () => {
    // Os 370 corais de Bach só trazem o título como `!!!OTL@@DE`; ignorar o
    // sufixo os deixaria todos sem nome no catálogo.
    const meta = parseKernHeaders('!!!COM: Bach, Johann Sebastian\n!!!OTL@@DE: In allen meinen Taten\n!!!SCT: BWV 244/37\n!!!PC#: 50\n');
    expect(meta.title).toBe('In allen meinen Taten');
    expect(meta.catalog).toBe('BWV 244/37');
    expect(meta.pieceNumber).toBe('50');
  });

  it('prefere SCT1 quando existem os dois sistemas de catálogo', () => {
    expect(parseKernHeaders('!!!SCT1: K1 279\n!!!SCT: outro\n').catalog).toBe('K1 279');
  });
});

describe('clean', () => {
  it('decodifica entidades nomeadas', () => {
    expect(clean('Breitkopf &amp; H&auml;rtel')).toBe('Breitkopf & Härtel');
  });

  it('decodifica entidades numéricas, decimais e hexadecimais', () => {
    expect(clean('caf&#233; e &#x263A;')).toBe('café e ☺');
  });

  it('deixa passar o que não reconhece, sem inventar', () => {
    expect(clean('&naoexiste; fica')).toBe('&naoexiste; fica');
  });

  it('normaliza espaços', () => {
    expect(clean('  muito    espaço  ')).toBe('muito espaço');
  });

  it('remove a sequência "\\n" literal, que aparece crua nos títulos', () => {
    expect(clean('MINUETTO\\nAllegretto')).toBe('MINUETTO Allegretto');
  });
});

describe('displayComposer', () => {
  it('inverte a forma catalográfica', () => {
    expect(displayComposer('Mozart, Wolfgang Amadeus')).toBe('Wolfgang Amadeus Mozart');
  });

  it('deixa em paz um nome já natural', () => {
    expect(displayComposer('Scott Joplin')).toBe('Scott Joplin');
  });
});

describe('describeKern', () => {
  it('junta título, catálogo e movimento', () => {
    const meta = parseKernHeaders(REAL_HEADER);
    expect(describeKern(meta, 'sonata01-1')).toEqual({
      title: 'Piano Sonata No. 1 in C major, K1 279',
      subtitle: 'mov. 1 — Allegro',
    });
  });

  it('usa o nome do arquivo quando não há título', () => {
    expect(describeKern({}, 'the-entertainer')).toEqual({ title: 'the-entertainer' });
  });

  it('nomeia pelo número da coleção antes de cair no nome do arquivo', () => {
    expect(describeKern({ pieceNumber: '50', catalog: 'BWV 244/37' }, 'chor050').title)
      .toBe('Coral 50, BWV 244/37');
  });

  it('omite o subtítulo em peça de um movimento só', () => {
    expect(describeKern({ title: 'Maple Leaf Rag' }, 'x').subtitle).toBeUndefined();
  });

  it('não repete o catálogo que o título já traz', () => {
    // Scarlatti: o título já vem com "L.334, K.122", e acrescentar "K. 122"
    // produziria a mesma referência duas vezes.
    expect(describeKern({ title: 'Sonata in D major, L.334, K.122', catalog: 'K. 122' }, 'x').title)
      .toBe('Sonata in D major, L.334, K.122');
  });

  it('reconhece o mesmo número sob outro prefixo de catálogo', () => {
    // Scarlatti mistura Longo e Kirkpatrick: "L.240" no título e "K. 240" no
    // registro são a mesma referência com nomes diferentes.
    expect(describeKern({ title: 'Sonata in A major, L.240, K.369', catalog: 'K. 240' }, 'x').title)
      .toBe('Sonata in A major, L.240, K.369');
  });

  it('acrescenta o catálogo que o título de fato não menciona', () => {
    expect(describeKern({ title: 'Piano Sonata No. 1 in C major', catalog: 'K1 279' }, 'x').title)
      .toBe('Piano Sonata No. 1 in C major, K1 279');
  });
});
