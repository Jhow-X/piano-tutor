/** Paleta única, compartilhada entre o piano roll e o teclado. */

import type { Hand } from '../core/score';

export const theme = {
  background: '#12141c',
  gridLine: '#232735',
  gridLineStrong: '#39405a',
  strikeLine: '#5b6480',
  text: '#e6e8f0',
  textDim: '#8b93aa',
  hand: {
    right: { fill: '#4d9de0', edge: '#7fbdf0', key: '#7fbdf0' },
    left: { fill: '#e0794d', edge: '#f0a77f', key: '#f0a77f' },
    unknown: { fill: '#7a7f95', edge: '#a3a8bd', key: '#a3a8bd' },
  } satisfies Record<Hand, { fill: string; edge: string; key: string }>,
  /** Notas vindas do usuário, distintas das da peça. */
  played: '#6bd08a',
  /** Exigida pelo portão e ainda não tocada. */
  wanted: '#e8b04b',
  /** Tocada enquanto o portão pedia outra coisa. */
  wrong: '#e0574d',
  keyboard: {
    white: '#f2f3f7',
    black: '#1c1f2b',
    whiteActive: '#4d9de0',
    blackActive: '#4d9de0',
    border: '#9aa0b4',
  },
};

export type Theme = typeof theme;
