/**
 * Decodificação de mensagens MIDI, separada da API do navegador para poder ser
 * testada sem hardware nem Web MIDI.
 */

export type MidiMessage =
  | { kind: 'noteOn'; midi: number; velocity: number }
  | { kind: 'noteOff'; midi: number }
  | { kind: 'allNotesOff' }
  | { kind: 'ignored' };

const NOTE_OFF = 0x80;
const NOTE_ON = 0x90;
const CONTROL_CHANGE = 0xb0;
const SYSTEM = 0xf0;

const CC_ALL_SOUND_OFF = 120;
const CC_ALL_NOTES_OFF = 123;

export function parseMidiMessage(data: Uint8Array): MidiMessage {
  const status = data[0];
  if (status === undefined || status < 0x80) return { kind: 'ignored' };
  // Tempo real e system common (0xF8 clock, 0xFE active sensing) chegam sem
  // parar; descartar cedo evita inundar qualquer log.
  if ((status & 0xf0) === SYSTEM) return { kind: 'ignored' };

  const type = status & 0xf0;
  const first = data[1];
  const second = data[2];
  if (first === undefined) return { kind: 'ignored' };

  switch (type) {
    case NOTE_ON:
      // Velocidade zero num note-on é note-off. O Casio CTK-3500 manda 0x80 de
      // verdade, mas muitos instrumentos usam esta forma e ela custa uma linha.
      return second === undefined || second === 0
        ? { kind: 'noteOff', midi: first }
        : { kind: 'noteOn', midi: first, velocity: second };
    case NOTE_OFF:
      return { kind: 'noteOff', midi: first };
    case CONTROL_CHANGE:
      return first === CC_ALL_NOTES_OFF || first === CC_ALL_SOUND_OFF
        ? { kind: 'allNotesOff' }
        : { kind: 'ignored' };
    default:
      return { kind: 'ignored' };
  }
}

/**
 * Curva de resposta ao toque, de velocidade MIDI (1..127) para ganho (0..1).
 *
 * Medido no Casio CTK-3500: numa execução normal, 13 de 32 notas saíram com
 * velocidade abaixo de 16, e o mínimo foi 1. Num mapeamento linear, boa parte
 * do que se toca sairia inaudível — o instrumento pareceria quebrado.
 *
 * A curva levanta o piso sem achatar a dinâmica: a ordem entre as velocidades é
 * preservada e o expoente < 1 abre o registro grave da escala, onde estão quase
 * todas as notas reais.
 */
const VELOCITY_FLOOR = 0.28;
const VELOCITY_GAMMA = 0.65;

export function velocityToGain(velocity: number): number {
  const normalized = Math.min(1, Math.max(0, velocity / 127));
  if (normalized === 0) return 0;
  return VELOCITY_FLOOR + (1 - VELOCITY_FLOOR) * normalized ** VELOCITY_GAMMA;
}
