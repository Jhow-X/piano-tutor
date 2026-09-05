/**
 * Saída de áudio. Carrega o piano de samples e agenda `noteOn`/`noteOff` no
 * relógio do `AudioContext` — nunca no relógio de parede.
 */

import { SplendidGrandPiano } from 'smplr';
import type { Note } from '../core/score';

type StopFn = (time?: number) => void;

export class AudioPlayer {
  private context: AudioContext | null = null;
  private piano: SplendidGrandPiano | null = null;
  private loading: Promise<void> | null = null;
  /** Notas agendadas e ainda não encerradas, para poder cancelá-las. */
  private pending = new Map<Note, StopFn>();

  get isReady(): boolean {
    return this.piano !== null;
  }

  /**
   * Deve ser chamado a partir de um gesto do usuário: navegadores só permitem
   * criar/retomar um `AudioContext` dentro de um evento de interação.
   */
  async init(): Promise<void> {
    if (this.loading) return this.loading;
    this.loading = (async () => {
      const context = new AudioContext();
      const piano = new SplendidGrandPiano(context);
      await piano.load;
      this.context = context;
      this.piano = piano;
    })();
    return this.loading;
  }

  async resume(): Promise<void> {
    if (this.context?.state === 'suspended') await this.context.resume();
  }

  now(): number {
    return this.context?.currentTime ?? 0;
  }

  scheduleNoteOn(note: Note, atTime: number): void {
    if (!this.piano) return;
    const stop = this.piano.start({
      note: note.midi,
      time: atTime,
      velocity: Math.round(note.velocity * 127),
    });
    this.pending.set(note, stop);
  }

  scheduleNoteOff(note: Note, atTime: number): void {
    const stop = this.pending.get(note);
    if (!stop) return;
    stop(atTime);
    this.pending.delete(note);
  }

  cancelScheduled(): void {
    this.piano?.stop();
    this.pending.clear();
  }

  /** Toque imediato, para a pré-escuta ao clicar numa tecla. */
  playNow(midi: number, velocity = 0.7): void {
    this.piano?.start({ note: midi, velocity: Math.round(velocity * 127) });
  }
}
