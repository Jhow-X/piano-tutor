/**
 * Dono do canvas e do laço de `requestAnimationFrame`.
 *
 * O laço apenas *lê* `currentBeat` do transporte e desenha. Ele nunca agenda
 * áudio nem avança tempo — se o rAF for estrangulado (aba em segundo plano), o
 * som continua correto e o desenho volta sincronizado ao reaparecer.
 */

import type { Note, NoteNaming, Score } from '../core/score';
import { notesInBeatRange } from '../core/score';
import {
  BLACK_KEY_HEIGHT_RATIO,
  computeKeyboardLayout,
  drawKeyboard,
  type KeyboardLayout,
} from './keyboard';
import { drawPianoRoll } from './pianoRoll';
import { theme } from './theme';

export interface StageState {
  score: Score | null;
  beatsVisible: number;
  showNoteNames: boolean;
  showFingering: boolean;
  naming: NoteNaming;
  hiddenHands: Set<Note['hand']>;
  /** Notas que o usuário está tocando agora, vindas de um `NoteInputSource`. */
  playedNotes: Set<number>;
}

const KEYBOARD_HEIGHT_RATIO = 0.22;
const KEYBOARD_MAX_HEIGHT = 150;
const KEYBOARD_MIN_HEIGHT = 70;

export class Stage {
  state: StageState = {
    score: null,
    beatsVisible: 8,
    showNoteNames: false,
    showFingering: true,
    naming: 'letters',
    hiddenHands: new Set(),
    playedNotes: new Set(),
  };

  private ctx: CanvasRenderingContext2D;
  private layout: KeyboardLayout;
  private cssWidth = 0;
  private cssHeight = 0;
  private frame: number | null = null;
  private observer: ResizeObserver;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly getCurrentBeat: () => number,
  ) {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D não disponível neste navegador');
    this.ctx = ctx;
    this.layout = computeKeyboardLayout(1);
    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(canvas);
    this.resize();
  }

  start(): void {
    if (this.frame !== null) return;
    const loop = () => {
      this.draw();
      this.frame = requestAnimationFrame(loop);
    };
    this.frame = requestAnimationFrame(loop);
  }

  stop(): void {
    if (this.frame !== null) cancelAnimationFrame(this.frame);
    this.frame = null;
  }

  dispose(): void {
    this.stop();
    this.observer.disconnect();
  }

  /** Tecla sob um ponto do canvas, ou `undefined` fora da faixa do teclado. */
  keyAt(clientX: number, clientY: number): number | undefined {
    const rect = this.canvas.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    const keyboardTop = this.cssHeight - this.keyboardHeight();
    if (y < keyboardTop) return undefined;

    const keyboardHeight = this.keyboardHeight();
    // Percorrido de trás para frente: as pretas estão por cima das brancas.
    for (let i = this.layout.keys.length - 1; i >= 0; i--) {
      const key = this.layout.keys[i]!;
      const height = key.black ? keyboardHeight * BLACK_KEY_HEIGHT_RATIO : keyboardHeight;
      if (x >= key.x && x <= key.x + key.width && y <= keyboardTop + height) return key.midi;
    }
    return undefined;
  }

  private keyboardHeight(): number {
    return Math.max(
      KEYBOARD_MIN_HEIGHT,
      Math.min(KEYBOARD_MAX_HEIGHT, this.cssHeight * KEYBOARD_HEIGHT_RATIO),
    );
  }

  private resize(): void {
    const rect = this.canvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    const dpr = window.devicePixelRatio || 1;
    this.cssWidth = rect.width;
    this.cssHeight = rect.height;
    this.canvas.width = Math.round(rect.width * dpr);
    this.canvas.height = Math.round(rect.height * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.layout = computeKeyboardLayout(rect.width);
    this.draw();
  }

  private draw(): void {
    const { ctx } = this;
    const keyboardHeight = this.keyboardHeight();
    const rollHeight = this.cssHeight - keyboardHeight;

    ctx.fillStyle = theme.background;
    ctx.fillRect(0, 0, this.cssWidth, this.cssHeight);

    const { score } = this.state;
    const currentBeat = this.getCurrentBeat();
    const active = new Map<number, string>();

    if (score) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 0, this.cssWidth, rollHeight);
      ctx.clip();
      drawPianoRoll(ctx, score, this.layout, currentBeat, rollHeight, {
        beatsVisible: this.state.beatsVisible,
        showNoteNames: this.state.showNoteNames,
        showFingering: this.state.showFingering,
        naming: this.state.naming,
        hiddenHands: this.state.hiddenHands,
      });
      ctx.restore();

      for (const note of notesInBeatRange(score, currentBeat, currentBeat + 0.001)) {
        if (this.state.hiddenHands.has(note.hand)) continue;
        active.set(note.midi, theme.hand[note.hand].key);
      }
    }

    // O que o usuário toca é pintado por cima do que a peça pede: quando os
    // dois coincidem, ver a própria nota é o retorno que importa.
    for (const midi of this.state.playedNotes) active.set(midi, theme.played);

    drawKeyboard(ctx, this.layout, rollHeight, keyboardHeight, active, theme.keyboard);
  }
}
