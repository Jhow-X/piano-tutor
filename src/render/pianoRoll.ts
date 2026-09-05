/**
 * Piano roll: as notas caem de cima em direção à linha de ataque, que fica
 * exatamente no topo do teclado. Cada nota ocupa a coluna da sua tecla, usando
 * a geometria de `keyboard.ts`.
 */

import type { Note, NoteNaming, Score } from '../core/score';
import { PIANO_LOWEST_MIDI, midiToNoteName, notesInBeatRange } from '../core/score';
import type { KeyboardLayout } from './keyboard';
import { theme } from './theme';

export interface PianoRollOptions {
  /** Quantos beats cabem entre o topo da tela e a linha de ataque. */
  beatsVisible: number;
  showNoteNames: boolean;
  showFingering: boolean;
  naming: NoteNaming;
  /** Mãos ocultas: as notas não são desenhadas (nem silenciadas — isso é do transport). */
  hiddenHands: Set<Note['hand']>;
}

const NOTE_CORNER_RADIUS = 3;
const MIN_NOTE_HEIGHT = 4;
const LABEL_MIN_HEIGHT = 16;

export function drawPianoRoll(
  ctx: CanvasRenderingContext2D,
  score: Score,
  layout: KeyboardLayout,
  currentBeat: number,
  rollHeight: number,
  options: PianoRollOptions,
): void {
  const pixelsPerBeat = rollHeight / options.beatsVisible;
  const topBeat = currentBeat + options.beatsVisible;

  drawMeasureLines(ctx, score, currentBeat, topBeat, rollHeight, pixelsPerBeat, ctx.canvas.width);

  // Uma pequena folga para trás mantém desenhada a nota que ainda está soando
  // mas já cruzou a linha de ataque.
  const visible = notesInBeatRange(score, currentBeat - 0.5, topBeat);

  for (const note of visible) {
    if (options.hiddenHands.has(note.hand)) continue;
    const key = layout.byMidi[note.midi - PIANO_LOWEST_MIDI];
    if (!key) continue; // fora das 88 teclas

    const yBottom = rollHeight - (note.startBeat - currentBeat) * pixelsPerBeat;
    const yTop = rollHeight - (note.endBeat - currentBeat) * pixelsPerBeat;
    const height = Math.max(MIN_NOTE_HEIGHT, yBottom - yTop);
    if (yBottom < 0 || yTop > rollHeight) continue;

    const palette = theme.hand[note.hand];
    const inset = key.black ? 1 : 2;
    const x = key.x + inset;
    const width = key.width - inset * 2;

    roundedRect(ctx, x, yTop, width, height, NOTE_CORNER_RADIUS);
    ctx.fillStyle = palette.fill;
    ctx.fill();
    ctx.strokeStyle = palette.edge;
    ctx.lineWidth = 1;
    ctx.stroke();

    if (height >= LABEL_MIN_HEIGHT && width >= 10) {
      drawLabel(ctx, note, x, yTop, width, height, options);
    }
  }

  drawStrikeLine(ctx, rollHeight, ctx.canvas.width);
}

function drawLabel(
  ctx: CanvasRenderingContext2D,
  note: Note,
  x: number,
  y: number,
  width: number,
  height: number,
  options: PianoRollOptions,
): void {
  const lines: string[] = [];
  if (options.showNoteNames) lines.push(midiToNoteName(note.midi, options.naming));
  if (options.showFingering && note.finger !== undefined) lines.push(String(note.finger));
  if (lines.length === 0) return;

  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, width, height);
  ctx.clip();
  ctx.fillStyle = '#0d0f16';
  ctx.font = '600 10px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  // Rótulos ancorados na base: é a ponta que chega na linha de ataque, e é
  // para onde o olho vai quando a nota está prestes a ser tocada.
  let baseline = y + height - 3;
  for (let i = lines.length - 1; i >= 0; i--) {
    ctx.fillText(lines[i]!, x + width / 2, baseline);
    baseline -= 11;
  }
  ctx.restore();
}

function drawMeasureLines(
  ctx: CanvasRenderingContext2D,
  score: Score,
  fromBeat: number,
  toBeat: number,
  rollHeight: number,
  pixelsPerBeat: number,
  width: number,
): void {
  ctx.lineWidth = 1;
  for (const measure of score.measures) {
    if (measure.startBeat < fromBeat || measure.startBeat > toBeat) continue;
    const y = Math.round(rollHeight - (measure.startBeat - fromBeat) * pixelsPerBeat) + 0.5;
    ctx.strokeStyle = measure.index % 4 === 0 ? theme.gridLineStrong : theme.gridLine;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();

    if (measure.index % 4 === 0) {
      ctx.fillStyle = theme.textDim;
      ctx.font = '10px system-ui, sans-serif';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'bottom';
      ctx.fillText(String(measure.index + 1), 4, y - 2);
    }
  }
}

function drawStrikeLine(ctx: CanvasRenderingContext2D, rollHeight: number, width: number): void {
  ctx.strokeStyle = theme.strikeLine;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, rollHeight - 1);
  ctx.lineTo(width, rollHeight - 1);
  ctx.stroke();
}

function roundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
): void {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
}
