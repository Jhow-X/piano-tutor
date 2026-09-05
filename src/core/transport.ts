/**
 * Transporte: um *cursor que avança sobre eventos*, não uma linha do tempo presa
 * ao relógio. É essa forma que permite o **modo espera** segurar o cursor
 * indefinidamente num portão até o usuário tocar a nota certa — uma timeline
 * dirigida pelo relógio não conseguiria sem reescrita.
 *
 * Padrão de agendamento (Chris Wilson): um `setInterval` curto agenda no relógio
 * do `AudioContext` tudo que cai na janela de lookahead; o `requestAnimationFrame`
 * apenas *lê* `currentBeat` para desenhar. Áudio nunca é agendado a partir do rAF.
 *
 * Dois estados de reprodução, e a distinção importa:
 *   - `running` — o usuário mandou tocar (não pausou nem parou)
 *   - `playing` — o relógio está de fato correndo, ou seja `running && !waiting`
 */

import type { Note, Score } from './score';
import { beatToSeconds, secondsToBeat } from './score';
import { buildGates, firstGateAtOrAfter, type Gate } from './gates';
import type { GateOutcome } from './practiceScore';

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
  /** Portão pendente mudou de estado, ou foi liberado (`null`). */
  onGateChange?(gate: PendingGate | null): void;
  /**
   * Um portão foi liberado, e por quê. Separado de `onGateChange` porque a
   * pontuação precisa distinguir tocar de pular — o mesmo `null` chega nos dois
   * casos, e inferir a diferença de fora seria frágil.
   */
  onGateResolved?(outcome: GateOutcome): void;
}

export interface WaitModeConfig {
  /** Nota que o usuário se comprometeu a tocar (seletor "você toca"). */
  isRequired(note: Note): boolean;
  /** Falso para notas fora do alcance do teclado físico — nascem satisfeitas. */
  isReachable(midi: number): boolean;
}

export interface PendingGate {
  beat: number;
  required: number[];
  /** Já atacadas desde que o portão abriu, mais as inalcançáveis. */
  satisfied: number[];
  missing: number[];
}

export interface LoopRange {
  startBeat: number;
  endBeat: number;
}

export class Transport {
  private score: Score | null = null;
  private cursor = 0; // índice na lista de notas: a próxima ainda não agendada
  private running = false;
  private waiting = false;
  private speed = 1;
  private loop: LoopRange | null = null;
  private handFilter: (note: Note) => boolean = () => true;

  /** Âncora que liga o tempo musical ao relógio do áudio. */
  private anchorBeat = 0;
  private anchorTime = 0;
  private pausedAtBeat = 0;

  private timer: ReturnType<typeof setInterval> | null = null;

  // --- modo espera
  private waitMode: WaitModeConfig | null = null;
  private gates: Gate[] = [];
  private gateIndex = 0;
  /** Alturas atacadas desde que o portão corrente abriu. */
  private struck = new Set<number>();

  constructor(private readonly callbacks: TransportCallbacks) {}

  setScore(score: Score | null): void {
    this.stop();
    this.score = score;
    this.pausedAtBeat = 0;
    this.cursor = 0;
    this.loop = null;
    this.rebuildGates();
  }

  /** Filtro de mão: notas reprovadas não são agendadas (silenciar uma das mãos). */
  setHandFilter(filter: (note: Note) => boolean): void {
    this.handFilter = filter;
  }

  /** Sessão ativa: o usuário mandou tocar, mesmo que esteja parado num portão. */
  get isRunning(): boolean {
    return this.running;
  }

  /** Relógio correndo. Falso enquanto um portão segura a reprodução. */
  get isPlaying(): boolean {
    return this.running && !this.waiting;
  }

  get isWaiting(): boolean {
    return this.waiting;
  }

  get currentBeat(): number {
    if (!this.score) return 0;
    if (!this.isPlaying) return this.pausedAtBeat;
    const elapsed = (this.callbacks.now() - this.anchorTime) * this.speed;
    const seconds = beatToSeconds(this.anchorBeat, this.score.tempoMap) + elapsed;
    const beat = secondsToBeat(seconds, this.score.tempoMap);
    // Travar no portão que vem: o agendador só congela no tick seguinte (até
    // 25ms depois), e sem isto o cabeçote passaria da linha e voltaria.
    const gateBeat = this.nextGateBeat();
    return gateBeat === undefined ? beat : Math.min(beat, gateBeat);
  }

  play(): void {
    if (this.running || !this.score) return;
    this.running = true;
    this.waiting = false;
    // Dar play com o cabeçote fora do loop entra nele pelo início, em vez de
    // fazer o agendador correr voltas até alcançar o presente.
    this.pausedAtBeat = this.clampToLoop(this.pausedAtBeat);
    this.startClockAt(this.pausedAtBeat);
  }

  pause(): void {
    if (!this.running) return;
    this.pausedAtBeat = this.currentBeat;
    this.halt();
  }

  stop(): void {
    this.halt();
    this.pausedAtBeat = 0;
    this.cursor = 0;
    this.syncGateIndex(0);
  }

  seekBeat(beat: number): void {
    const clamped = this.clampToLoop(Math.max(0, beat));
    const wasRunning = this.running;
    if (wasRunning) this.halt();
    this.pausedAtBeat = clamped;
    this.cursor = 0;
    this.resetCursorTo(clamped);
    this.syncGateIndex(clamped);
    if (wasRunning) this.play();
  }

  setSpeed(speed: number): void {
    const next = Math.max(0.1, Math.min(2, speed));
    if (next === this.speed) return;
    // Re-ancorar no beat corrente antes de trocar o fator, senão todo o passado
    // seria reinterpretado na velocidade nova.
    if (this.isPlaying) {
      const beat = this.currentBeat;
      this.callbacks.cancelScheduled();
      this.speed = next;
      this.startClockAt(beat);
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

  // ------------------------------------------------------------------
  // Modo espera
  // ------------------------------------------------------------------

  setWaitMode(config: WaitModeConfig | null): void {
    this.waitMode = config;
    this.rebuildGates();
    this.syncGateIndex(this.currentBeat);
    // Desligar o modo com um portão segurando a reprodução tem de destravá-la,
    // senão o app fica parado sem nada na tela explicando por quê.
    if (!config && this.waiting) this.releaseGate('cancelled');
  }

  /**
   * Ataque de nota vindo do usuário.
   *
   * A regra é "houve um ataque desde que o portão abriu", e não "a tecla está
   * pressionada": sem isso uma nota repetida se auto-satisfaria enquanto o
   * usuário ainda segura a anterior.
   */
  notePressed(midi: number): void {
    if (!this.waiting) return;
    const gate = this.gates[this.gateIndex];
    if (!gate || !gate.required.includes(midi)) return;
    if (this.struck.has(midi)) return;
    this.struck.add(midi);
    if (gate.required.every((pitch) => this.struck.has(pitch))) {
      this.releaseGate('played');
    } else {
      // Ainda falta nota: avisar para o acorde parcial aparecer na tela.
      this.callbacks.onGateChange?.(this.getPendingGate());
    }
  }

  /** Escape manual, para quando a nota exigida não sair (ou não existir no teclado). */
  skipGate(): void {
    if (this.waiting) this.releaseGate('skipped');
  }

  getPendingGate(): PendingGate | null {
    if (!this.waiting) return null;
    const gate = this.gates[this.gateIndex];
    if (!gate) return null;
    return {
      beat: gate.beat,
      required: gate.required,
      satisfied: gate.required.filter((midi) => this.struck.has(midi)),
      missing: gate.required.filter((midi) => !this.struck.has(midi)),
    };
  }

  private rebuildGates(): void {
    const { score, waitMode } = this;
    this.gates = score && waitMode
      ? buildGates(score, (note) => waitMode.isRequired(note), (midi) => waitMode.isReachable(midi))
      : [];
  }

  private syncGateIndex(beat: number): void {
    this.gateIndex = firstGateAtOrAfter(this.gates, beat);
  }

  private nextGateBeat(): number | undefined {
    return this.waitMode ? this.gates[this.gateIndex]?.beat : undefined;
  }

  private enterWait(gate: Gate): void {
    this.waiting = true;
    this.pausedAtBeat = gate.beat;
    this.stopTimer();
    // Sem `cancelScheduled`: as notas anteriores ao portão já foram agendadas e
    // precisam soar — inclusive as que ainda estão ressoando por cima dele.
    this.struck = new Set(gate.unreachable);
    this.callbacks.onGateChange?.(this.getPendingGate());
  }

  private releaseGate(outcome: GateOutcome): void {
    this.gateIndex++;
    this.waiting = false;
    this.struck.clear();
    this.callbacks.onGateResolved?.(outcome);
    this.callbacks.onGateChange?.(null);
    // Retomar exatamente do beat do portão: as notas de acompanhamento que
    // começam ali soam junto com o que o usuário acabou de tocar.
    if (this.running) this.startClockAt(this.pausedAtBeat);
  }

  // ------------------------------------------------------------------

  private halt(): void {
    // Só anunciar a queda do portão se havia um: parar uma reprodução que nunca
    // esteve esperando não deve gerar evento nenhum.
    const hadGate = this.waiting;
    this.running = false;
    this.waiting = false;
    this.stopTimer();
    this.callbacks.cancelScheduled();
    if (hadGate) this.callbacks.onGateChange?.(null);
  }

  private stopTimer(): void {
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  /** Ancora o relógio num beat e (re)começa a agendar a partir dele. */
  private startClockAt(beat: number): void {
    this.reanchor(beat);
    this.resetCursorTo(beat);
    this.stopTimer();
    this.timer = setInterval(() => this.tick(), SCHEDULER_INTERVAL_MS);
    this.tick();
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
    if (!score || !this.isPlaying) return;

    const now = this.callbacks.now();
    const horizonTime = now + LOOKAHEAD_SECONDS;
    // Mais de uma volta pode caber numa única janela de lookahead quando o loop
    // é curto. O teto existe só para que um loop degenerado (poucos ticks de
    // duração) não prenda a thread — nesse caso re-ancoramos no presente.
    for (let iterations = 0; ; iterations++) {
      if (iterations > MAX_LOOP_WRAPS_PER_TICK) {
        const restart = this.loop ? this.loop.startBeat : 0;
        this.reanchor(restart);
        this.resetCursorTo(restart);
        this.syncGateIndex(restart);
        return;
      }

      const playBoundary = this.loop ? this.loop.endBeat : score.durationBeats;
      const gateBeat = this.nextGateBeat();
      // O portão é só mais uma fronteira: a mesma máquina que faz o loop parar
      // na emenda faz a reprodução parar na nota que o usuário tem de tocar.
      const gateFirst = gateBeat !== undefined && gateBeat < playBoundary;
      const boundaryBeat = gateFirst ? gateBeat! : playBoundary;

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

      if (gateFirst) {
        // Diferente do loop: aqui não basta o portão estar na janela de
        // lookahead, o relógio precisa ter chegado nele — senão congelaríamos
        // até 120ms cedo demais.
        if (now < boundaryTime) return;
        this.enterWait(this.gates[this.gateIndex]!);
        return;
      }

      if (this.loop) {
        // Salta o cursor de volta, ancorando no instante exato da emenda para
        // que a costura do loop não acumule deriva.
        this.anchorBeat = this.loop.startBeat;
        this.anchorTime = boundaryTime;
        this.resetCursorTo(this.loop.startBeat);
        this.syncGateIndex(this.loop.startBeat);
        continue;
      }

      this.pausedAtBeat = score.durationBeats;
      this.halt();
      this.callbacks.onEnded?.();
      return;
    }
  }
}
