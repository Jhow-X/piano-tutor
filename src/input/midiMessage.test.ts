import { describe, expect, it } from 'vitest';
import { parseMidiMessage, velocityToGain } from './midiMessage';

const bytes = (...values: number[]) => new Uint8Array(values);

describe('parseMidiMessage', () => {
  it('lê note-on com velocidade', () => {
    // Mensagem real capturada do Casio CTK-3500.
    expect(parseMidiMessage(bytes(0x90, 0x5d, 0x59))).toEqual({
      kind: 'noteOn',
      midi: 93,
      velocity: 89,
    });
  });

  it('lê note-off explícito', () => {
    expect(parseMidiMessage(bytes(0x80, 0x5d, 0x40))).toEqual({ kind: 'noteOff', midi: 93 });
  });

  it('trata note-on com velocidade zero como note-off', () => {
    // O Casio manda 0x80, mas muitos instrumentos usam esta forma.
    expect(parseMidiMessage(bytes(0x90, 0x3c, 0x00))).toEqual({ kind: 'noteOff', midi: 60 });
  });

  it('reconhece o canal, seja qual for', () => {
    expect(parseMidiMessage(bytes(0x99, 0x3c, 0x40))).toEqual({
      kind: 'noteOn',
      midi: 60,
      velocity: 64,
    });
  });

  it('trata all notes off e all sound off', () => {
    expect(parseMidiMessage(bytes(0xb0, 123, 0))).toEqual({ kind: 'allNotesOff' });
    expect(parseMidiMessage(bytes(0xb0, 120, 0))).toEqual({ kind: 'allNotesOff' });
  });

  it('ignora outros control changes', () => {
    expect(parseMidiMessage(bytes(0xb0, 64, 127))).toEqual({ kind: 'ignored' }); // pedal
    expect(parseMidiMessage(bytes(0xb0, 7, 100))).toEqual({ kind: 'ignored' }); // volume
  });

  it('ignora tempo real, que chega sem parar', () => {
    expect(parseMidiMessage(bytes(0xfe))).toEqual({ kind: 'ignored' }); // active sensing
    expect(parseMidiMessage(bytes(0xf8))).toEqual({ kind: 'ignored' }); // clock
  });

  it('não quebra com mensagem vazia ou truncada', () => {
    expect(parseMidiMessage(bytes())).toEqual({ kind: 'ignored' });
    expect(parseMidiMessage(bytes(0x90))).toEqual({ kind: 'ignored' });
    expect(parseMidiMessage(bytes(0x90, 0x3c))).toEqual({ kind: 'noteOff', midi: 60 });
  });
});

describe('velocityToGain', () => {
  it('mantém a ordem: tocar mais forte soa mais forte', () => {
    const gains = [1, 8, 24, 47, 72, 89, 127].map(velocityToGain);
    for (let i = 1; i < gains.length; i++) {
      expect(gains[i]!).toBeGreaterThan(gains[i - 1]!);
    }
  });

  it('mantém audível a faixa baixa onde o Casio de fato toca', () => {
    // Na captura real, 13 de 32 notas saíram abaixo de 16. Num mapeamento
    // linear elas seriam praticamente inaudíveis.
    expect(velocityToGain(1)).toBeGreaterThan(0.25);
    expect(velocityToGain(16)).toBeGreaterThan(0.35);
  });

  it('usa toda a faixa até o máximo', () => {
    expect(velocityToGain(127)).toBeCloseTo(1, 5);
  });

  it('silêncio é silêncio', () => {
    expect(velocityToGain(0)).toBe(0);
  });
});
