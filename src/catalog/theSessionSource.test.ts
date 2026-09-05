import { describe, expect, it } from 'vitest';
import { buildAbc, toAbcKey, type SessionTune } from './theSessionSource';
import { importAbc } from '../core/importers/abc';

const tune = (overrides: Partial<SessionTune> = {}): SessionTune => ({
  id: 1,
  name: "Cooley's",
  type: 'reel',
  key: 'Edorian',
  abc: '|:D2|EBBA B2 EB|B2 AB dBAG|! FDAD BDAD|FDAD dAFD:|',
  ...overrides,
});

describe('toAbcKey', () => {
  it('traduz os modos que o site usa', () => {
    expect(toAbcKey('Edorian')).toBe('Edor');
    expect(toAbcKey('Gmajor')).toBe('G');
    expect(toAbcKey('Aminor')).toBe('Am');
    expect(toAbcKey('Dmixolydian')).toBe('Dmix');
  });

  it('entende alterações na tônica', () => {
    expect(toAbcKey('Bbmajor')).toBe('Bb');
    expect(toAbcKey('F#minor')).toBe('F#m');
  });

  it('preserva um modo desconhecido em vez de chutar', () => {
    // Chutar transporia a peça; manter o texto deixa o abcjs ignorar o que não
    // entende, que é o erro menor.
    expect(toAbcKey('Cinventado')).toBe('Cinventado');
  });
});

describe('buildAbc', () => {
  it('deriva o compasso do tipo da dança', () => {
    const meterOf = (type: string) => /^M:(.+)$/m.exec(buildAbc(tune({ type })))?.[1];
    expect(meterOf('reel')).toBe('4/4');
    expect(meterOf('jig')).toBe('6/8');
    expect(meterOf('slip jig')).toBe('9/8');
    expect(meterOf('slide')).toBe('12/8');
    expect(meterOf('waltz')).toBe('3/4');
    expect(meterOf('polka')).toBe('2/4');
    expect(meterOf('three-two')).toBe('3/2');
  });

  it('cai em 4/4 num tipo desconhecido', () => {
    expect(/^M:(.+)$/m.exec(buildAbc(tune({ type: 'algo-novo' })))?.[1]).toBe('4/4');
  });

  it('transforma os "!" do site em quebras de linha', () => {
    const abc = buildAbc(tune());
    expect(abc).not.toContain('!');
    // O corpo vem depois da linha K:, e o "!" do meio vira uma segunda linha.
    const body = abc.split('\n').slice(6).filter(Boolean);
    expect(body).toEqual([
      '|:D2|EBBA B2 EB|B2 AB dBAG|',
      'FDAD BDAD|FDAD dAFD:|',
    ]);
  });

  it('escreve o cabeçalho completo, na ordem que o ABC exige', () => {
    const lines = buildAbc(tune()).split('\n');
    expect(lines.slice(0, 6)).toEqual([
      'X:1',
      "T:Cooley's",
      'R:reel',
      'M:4/4',
      'L:1/8',
      'K:Edor',
    ]);
  });

  it('o resultado é ABC válido: o importador que já existe o lê', async () => {
    // A prova que interessa. O cabeçalho pode estar sintaticamente certo e ainda
    // assim não produzir notas.
    const score = await importAbc(buildAbc(tune()), 'teste');
    expect(score.notes.length).toBeGreaterThan(20);
    expect(score.title).toBe("Cooley's");
    expect(score.engraving?.kind).toBe('abc');
  });

  it('um jig sai com compassos de três semínimas', async () => {
    const score = await importAbc(
      buildAbc(tune({ type: 'jig', key: 'Gmajor', abc: 'GFG BAB|gfg gab|! GFG BAB|d3 gba|' })),
      'jig',
    );
    // 6/8 ⇒ 3 semínimas por compasso.
    const first = score.measures[0]!;
    expect(first.endBeat - first.startBeat).toBeCloseTo(3, 5);
  });
});
