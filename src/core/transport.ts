/**
 * Transporte: um *cursor que avança sobre eventos*, não uma linha do tempo presa
 * ao relógio. A diferença importa — o modo "espera a nota certa" (entrada MIDI,
 * futura) precisa poder segurar o cursor indefinidamente, o que uma timeline
 * dirigida pelo relógio não permite sem reescrita.
 *
 * Padrão de agendamento (Chris Wilson): um `setInterval` curto agenda no relógio
 * do `AudioContext` tudo que cai na janela de lookahead; o `requestAnimationFrame`
 * apenas *lê* `currentBeat` para desenhar. Áudio nunca é agendado a partir do rAF.
 */

import type { Note, Score } from './score';
import { beatToSeconds, secondsToBeat } from './score';

const SCHEDULER_INTERVAL_MS = 25;
const LOOKAHEAD_SECONDS = 0.12;
const MAX_LOOP_WRAPS_PER_TICK = 32;

export interface TransportCallbacks {
  /** Relógio monotônico do áudio, em segundos (`AudioContext.currentTime`). */
  now(): number;
  scheduleNoteOn(note: Note, atTime: number): void;
  scheduleNoteOff(note: Note, atTime: number): void;
  /** Cancela tudo que foi agendado e ainda não soou. */
  cancelScheduled(): void;
  onEnded?(): void;
}

export interface LoopRange {
  startBeat: number;
  endBeat: number;
}

export class Transport {
  private score: Score | null = null;
  private cursor = 0; // índice na lista de notas: a próxima ainda não agendada
  private playing = false;
  private speed = 1;
  private loop: LoopRange | null = null;
  private handFilter: (note: Note) => boolean = () => true;

  /** Âncora que liga o tempo musical ao relógio do áudio. */
  private anchorBeat = 0;
  private anchorTime = 0;
  private pausedAtBeat = 0;

  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(private readonly callbacks: TransportCallbacks) {}

  setScore(score: Score | null): void {
    this.stop();
    this.score = score;
    this.pausedAtBeat = 0;
    this.cursor = 0;
    this.loop = null;
  }

  /** Filtro de mão: notas reprovadas não são agendadas (silenciar uma das mãos). */
  setHandFilter(filter: (note: Note) => boolean): void {
    this.handFilter = filter;
  }

  get isPlaying(): boolean {
    return this.playing;
  }

  get currentBeat(): number {
    if (!this.score) return 0;
    if (!this.playing) return this.pausedAtBeat;
    const elapsed = (this.callbacks.now() - this.anchorTime) * this.speed;
    const seconds = beatToSeconds(this.anchorBeat, this.score.tempoMap) + elapsed;
    return secondsToBeat(seconds, this.score.tempoMap);
  }

  play(): void {
    if (this.playing || !this.score) return;
    this.playing = true;
    // Dar play com o cabeçote fora do loop entra nele pelo início, em vez de
    // fazer o agendador correr voltas até alcançar o presente.
    this.pausedAtBeat = this.clampToLoop(this.pausedAtBeat);
    this.reanchor(this.pausedAtBeat);
    this.resetCursorTo(this.pausedAtBeat);
    this.timer = setInterval(() => this.tick(), SCHEDULER_INTERVAL_MS);
    this.tick();
  }

  pause(): void {
    if (!this.playing) return;
    this.pausedAtBeat = this.currentBeat;
    this.halt();
  }

  stop(): void {
    this.halt();
    this.pausedAtBeat = 0;
    this.cursor = 0;
  }

  seekBeat(beat: number): void {
    const clamped = this.clampToLoop(Math.max(0, beat));
    const wasPlaying = this.playing;
    if (wasPlaying) this.halt();
    this.pausedAtBeat = clamped;
    this.resetCursorTo(clamped);
    if (wasPlaying) this.play();
  }

  setSpeed(speed: number): void {
    const next = Math.max(0.1, Math.min(2, speed));
    if (next === this.speed) return;
    // Re-ancorar no beat corrente antes de trocar o fator, senão todo o passado
    // seria reinterpretado na velocidade nova.
    if (this.playing) {
      const beat = this.currentBeat;
      this.callbacks.cancelScheduled();
      this.speed = next;
      this.reanchor(beat);
      this.resetCursorTo(beat);
    } else {
      this.speed = next;
    }
  }

  getSpeed(): number {
    return this.speed;
  }

  setLoop(loop: LoopRange | null): void {
    this.loop = loop && loop.endBeat > loop.startBeat ? loop : null;
    if (!this.loop) return;
    const beat = this.currentBeat;
    if (beat < this.loop.startBeat || beat >= this.loop.endBeat) {
      this.seekBeat(this.loop.startBeat);
    }
  }

  getLoop(): LoopRange | null {
    return this.loop;
  }

  private halt(): void {
    this.playing = false;
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.callbacks.cancelScheduled();
  }

  private reanchor(beat: number): void {
    this.anchorBeat = beat;
    this.anchorTime = this.callbacks.now();
  }

  /** Instante no relógio do áudio em que um dado beat soará. */
  private timeForBeat(beat: number): number {
    const score = this.score!;
    const delta = beatToSeconds(beat, score.tempoMap) - beatToSeconds(this.anchorBeat, score.tempoMap);
    return this.anchorTime + delta / this.speed;
  }

  private resetCursorTo(beat: number): void {
    const notes = this.score?.notes ?? [];
    let index = 0;
    while (index < notes.length && notes[index]!.startBeat < beat) index++;
    this.cursor = index;
  }

  private clampToLoop(beat: number): number {
    if (!this.loop) return beat;
    if (beat < this.loop.startBeat || beat >= this.loop.endBeat) return this.loop.startBeat;
    return beat;
  }

  private tick(): void {
    const score = this.score;
    if (!score || !this.playing) return;

    const horizonTime = this.callbacks.now() + LOOKAHEAD_SECONDS;
    // Mais de uma volta pode caber numa única janela de lookahead quando o loop
    // é curto. O teto existe só para que um loop degenerado (poucos ticks de
    // duração) não prenda a thread — nesse caso re-ancoramos no presente.
    for (let iterations = 0; ; iterations++) {
      if (iterations > MAX_LOOP_WRAPS_PER_TICK) {
        this.reanchor(this.loop ? this.loop.startBeat : 0);
        this.resetCursorTo(this.loop ? this.loop.startBeat : 0);
        return;
      }
      const boundaryBeat = this.loop ? this.loop.endBeat : score.durationBeats;

      while (this.cursor < score.notes.length) {
        const note = score.notes[this.cursor]!;
        if (note.startBeat >= boundaryBeat) break;
        const startTime = this.timeForBeat(note.startBeat);
        if (startTime > horizonTime) return;
        if (this.handFilter(note)) {
          this.callbacks.scheduleNoteOn(note, startTime);
          this.callbacks.scheduleNoteOff(note, this.timeForBeat(Math.min(note.endBeat, boundaryBeat)));
        }
        this.cursor++;
      }

      const boundaryTime = this.timeForBeat(boundaryBeat);
      if (boundaryTime > horizonTime) return;

      if (this.loop) {
        // Salta o cursor de volta, ancorando no instante exato da emenda para
        // que a costura do loop não acumule deriva.
        this.anchorBeat = this.loop.startBeat;
        this.anchorTime = boundaryTime;
        this.resetCursorTo(this.loop.startBeat);
        continue;
      }

      this.pausedAtBeat = score.durationBeats;
      this.halt();
      this.callbacks.onEnded?.();
      return;
    }
  }
}
