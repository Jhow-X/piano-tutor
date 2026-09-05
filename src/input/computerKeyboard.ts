/**
 * Teclado do computador como entrada de notas.
 *
 * Duas fileiras dispostas como um teclado de piano: a fileira de baixo são as
 * brancas e a de cima, as pretas, com os buracos onde o piano também não tem
 * tecla preta (entre Mi–Fá e Si–Dó).
 */

import { BaseNoteInputSource } from './NoteInputSource';
import { PIANO_HIGHEST_MIDI, PIANO_LOWEST_MIDI } from '../core/score';

/** Semitons acima do Dó da oitava corrente, por `KeyboardEvent.code`. */
const KEY_MAP: Record<string, number> = {
  KeyA: 0, KeyW: 1, KeyS: 2, KeyE: 3, KeyD: 4, KeyF: 5, KeyT: 6,
  KeyG: 7, KeyY: 8, KeyH: 9, KeyU: 10, KeyJ: 11,
  KeyK: 12, KeyO: 13, KeyL: 14, KeyP: 15, Semicolon: 16, Quote: 17,
};

const OCTAVE_DOWN = 'KeyZ';
const OCTAVE_UP = 'KeyX';
const DEFAULT_OCTAVE = 4; // Dó central em KeyA

export class ComputerKeyboardSource extends BaseNoteInputSource {
  readonly name = 'Teclado do computador';

  private octave = DEFAULT_OCTAVE;
  /** Tecla física → nota emitida, para que o noteOff use a mesma nota mesmo se
   *  a oitava mudar enquanto a tecla está pressionada. */
  private held = new Map<string, number>();
  private listening = false;

  constructor(private readonly onOctaveChange?: (octave: number) => void) {
    super();
  }

  start(): void {
    if (this.listening) return;
    this.listening = true;
    window.addEventListener('keydown', this.handleKeyDown);
    window.addEventListener('keyup', this.handleKeyUp);
    window.addEventListener('blur', this.releaseAll);
  }

  stop(): void {
    if (!this.listening) return;
    this.listening = false;
    window.removeEventListener('keydown', this.handleKeyDown);
    window.removeEventListener('keyup', this.handleKeyUp);
    window.removeEventListener('blur', this.releaseAll);
    this.releaseAll();
  }

  getOctave(): number {
    return this.octave;
  }

  private handleKeyDown = (event: KeyboardEvent): void => {
    if (event.repeat || isTypingTarget(event.target) || hasModifier(event)) return;

    if (event.code === OCTAVE_DOWN || event.code === OCTAVE_UP) {
      event.preventDefault();
      this.octave = clamp(this.octave + (event.code === OCTAVE_UP ? 1 : -1), 0, 8);
      this.onOctaveChange?.(this.octave);
      return;
    }

    const offset = KEY_MAP[event.code];
    if (offset === undefined || this.held.has(event.code)) return;
    const midi = (this.octave + 1) * 12 + offset;
    if (midi < PIANO_LOWEST_MIDI || midi > PIANO_HIGHEST_MIDI) return;

    event.preventDefault();
    this.held.set(event.code, midi);
    this.emitNoteOn(midi, 0.75);
  };

  private handleKeyUp = (event: KeyboardEvent): void => {
    const midi = this.held.get(event.code);
    if (midi === undefined) return;
    this.held.delete(event.code);
    this.emitNoteOff(midi);
  };

  /** Perder o foco com teclas pressionadas deixaria notas presas soando. */
  private releaseAll = (): void => {
    for (const midi of this.held.values()) this.emitNoteOff(midi);
    this.held.clear();
  };
}

function isTypingTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement
  );
}

function hasModifier(event: KeyboardEvent): boolean {
  return event.ctrlKey || event.metaKey || event.altKey;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
