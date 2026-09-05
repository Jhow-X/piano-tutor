/**
 * Geometria e desenho do teclado de 88 teclas.
 *
 * A geometria é exportada porque o piano roll precisa alinhar cada nota que cai
 * com a coluna exata da sua tecla — as duas visões têm que compartilhar a mesma
 * fonte de verdade, senão desalinham em larguras não múltiplas de 52.
 */

import { PIANO_HIGHEST_MIDI, PIANO_LOWEST_MIDI, isBlackKey } from '../core/score';

export interface KeyRect {
  midi: number;
  x: number;
  width: number;
  black: boolean;
}

export interface KeyboardLayout {
  keys: KeyRect[];
  /** Indexado por `midi - PIANO_LOWEST_MIDI`, para consulta em O(1) no laço de desenho. */
  byMidi: (KeyRect | undefined)[];
  whiteWidth: number;
  blackWidth: number;
}

const BLACK_KEY_WIDTH_RATIO = 0.62;
export const BLACK_KEY_HEIGHT_RATIO = 0.62;

export function computeKeyboardLayout(width: number): KeyboardLayout {
  const whiteCount = countWhiteKeys(PIANO_LOWEST_MIDI, PIANO_HIGHEST_MIDI);
  const whiteWidth = width / whiteCount;
  const blackWidth = whiteWidth * BLACK_KEY_WIDTH_RATIO;

  const keys: KeyRect[] = [];
  const byMidi: (KeyRect | undefined)[] = [];
  let whiteIndex = 0;

  for (let midi = PIANO_LOWEST_MIDI; midi <= PIANO_HIGHEST_MIDI; midi++) {
    const black = isBlackKey(midi);
    const key: KeyRect = black
      ? { midi, x: whiteIndex * whiteWidth - blackWidth / 2, width: blackWidth, black }
      : { midi, x: whiteIndex * whiteWidth, width: whiteWidth, black };
    if (!black) whiteIndex++;
    keys.push(key);
    byMidi[midi - PIANO_LOWEST_MIDI] = key;
  }

  return { keys, byMidi, whiteWidth, blackWidth };
}

function countWhiteKeys(lowest: number, highest: number): number {
  let count = 0;
  for (let midi = lowest; midi <= highest; midi++) if (!isBlackKey(midi)) count++;
  return count;
}

export interface KeyboardColors {
  white: string;
  black: string;
  whiteActive: string;
  blackActive: string;
  border: string;
}

/**
 * Desenha o teclado. `activeColors` mapeia midi → cor, permitindo que a mão
 * esquerda e a direita acendam em cores distintas.
 */
export function drawKeyboard(
  ctx: CanvasRenderingContext2D,
  layout: KeyboardLayout,
  top: number,
  height: number,
  activeColors: Map<number, string>,
  colors: KeyboardColors,
): void {
  const blackHeight = height * BLACK_KEY_HEIGHT_RATIO;

  // Brancas primeiro: as pretas são desenhadas por cima.
  for (const key of layout.keys) {
    if (key.black) continue;
    ctx.fillStyle = activeColors.get(key.midi) ?? colors.white;
    ctx.fillRect(key.x, top, key.width, height);
    ctx.strokeStyle = colors.border;
    ctx.lineWidth = 1;
    ctx.strokeRect(key.x + 0.5, top + 0.5, key.width - 1, height - 1);
  }

  for (const key of layout.keys) {
    if (!key.black) continue;
    ctx.fillStyle = activeColors.get(key.midi) ?? colors.black;
    ctx.fillRect(key.x, top, key.width, blackHeight);
  }
}
