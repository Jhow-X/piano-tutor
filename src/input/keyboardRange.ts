/**
 * Alcance do teclado físico do usuário.
 *
 * O MIDI não informa quantas teclas o instrumento tem, então isto é
 * configuração. Importa para o modo espera: uma nota fora do alcance não pode
 * ser tocada, e sem esse conhecimento a reprodução travaria esperando por ela.
 */

export interface KeyRange {
  lowest: number;
  highest: number;
}

export const KEYBOARD_RANGES = {
  88: { lowest: 21, highest: 108 }, // A0–C8, piano completo
  76: { lowest: 28, highest: 103 }, // E1–G7
  61: { lowest: 36, highest: 96 },  // C2–C7 — o Casio CTK-3500
  49: { lowest: 36, highest: 84 },  // C2–C6
} as const satisfies Record<number, KeyRange>;

export type KeyboardSize = keyof typeof KEYBOARD_RANGES;

export const KEYBOARD_SIZES = [88, 76, 61, 49] as const;

export const DEFAULT_KEYBOARD_SIZE: KeyboardSize = 88;

export function isWithinRange(midi: number, size: KeyboardSize): boolean {
  const range = KEYBOARD_RANGES[size];
  return midi >= range.lowest && midi <= range.highest;
}

export function isKeyboardSize(value: unknown): value is KeyboardSize {
  return typeof value === 'number' && value in KEYBOARD_RANGES;
}
