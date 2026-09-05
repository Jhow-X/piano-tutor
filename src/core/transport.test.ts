import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Transport } from './transport';
import type { Note, Score } from './score';
import { buildMidi } from './testing/buildMidi';
import { importMidi } from './importers/midi';

/**
 * O transporte é dirigido por dois relógios: o do `setInterval` (temporizadores)
 * e o do `AudioContext`. Aqui os dois são falsos e avançam juntos, o que torna o
 * agendamento inteiramente determinístico.
 */
function harness(score: Score) {
  let clock = 0;
  const onNotes: { midi: number; time: number }[] = [];
  const offNotes: { midi: number; time: number }[] = [];
  let cancels = 0;

  const transport = new Transport({
    now: () => clock,
    scheduleNoteOn: (note: Note, time: number) => onNotes.push({ midi: note.midi, time }),
    scheduleNoteOff: (note: Note, time: number) => offNotes.push({ midi: note.midi, time }),
    cancelScheduled: () => { cancels++; },
  });
  transport.setScore(score);

  /** Avança os dois relógios em passos de 25ms, como faz o agendador. */
  const advance = (seconds: number) => {
    const steps = Math.round(seconds / 0.025);
    for (let i = 0; i < steps; i++) {
      clock += 0.025;
      vi.advanceTimersByTime(25);
    }
  };

  return { transport, onNotes, offNotes, advance, getCancels: () => cancels, now: () => clock };
}

/** Quatro semínimas a 120bpm: uma nota por segundo... na verdade uma a cada 0,5s. */
function fourNotes(): Score {
  return importMidi(
    buildMidi({ bpm: 120, tracks: [{ notes: [[60, 0, 1], [62, 1, 1], [64, 2, 1], [65, 3, 1]] }] }),
  );
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('Transport', () => {
  it('agenda cada nota no instante correto do relógio de áudio', () => {
    const h = harness(fourNotes());
    h.transport.play();
    h.advance(2.5);

    // 120bpm ⇒ 0,5s por semínima.
    expect(h.onNotes).toEqual([
      { midi: 60, time: 0 },
      { midi: 62, time: 0.5 },
      { midi: 64, time: 1 },
      { midi: 65, time: 1.5 },
    ]);
    expect(h.offNotes.map((n) => n.time)).toEqual([0.5, 1, 1.5, 2]);
  });

  it('não agenda além da janela de lookahead', () => {
    const h = harness(fourNotes());
    h.transport.play();
    // Lookahead é de 120ms: só a nota em t=0 cabe.
    expect(h.onNotes).toHaveLength(1);
  });

  it('currentBeat acompanha o relógio', () => {
    const h = harness(fourNotes());
    h.transport.play();
    h.advance(1);
    expect(h.transport.currentBeat).toBeCloseTo(2, 5);
  });

  it('meia velocidade dobra a distância entre as notas', () => {
    const h = harness(fourNotes());
    h.transport.setSpeed(0.5);
    h.transport.play();
    h.advance(5);
    expect(h.onNotes.map((n) => n.time)).toEqual([0, 1, 2, 3]);
  });

  it('re-ancora ao mudar de velocidade no meio, sem reinterpretar o passado', () => {
    const h = harness(fourNotes());
    h.transport.play();
    h.advance(0.6); // já passou da segunda nota
    const beatBefore = h.transport.currentBeat;
    h.transport.setSpeed(0.5);
    expect(h.transport.currentBeat).toBeCloseTo(beatBefore, 5);

    h.advance(1); // 1s a meia velocidade ⇒ 1 semínima
    expect(h.transport.currentBeat).toBeCloseTo(beatBefore + 1, 5);
  });

  it('volta ao início do loop na emenda, sem deriva', () => {
    const h = harness(fourNotes());
    // Compassos 4/4 a 120bpm: o loop abaixo cobre as duas primeiras semínimas.
    h.transport.setLoop({ startBeat: 0, endBeat: 2 });
    h.transport.play();
    h.advance(3.5);

    // Uma volta dura 1s; em 3,5s dão-se três voltas completas.
    expect(h.onNotes.map((n) => `${n.midi}@${n.time.toFixed(2)}`)).toEqual([
      '60@0.00', '62@0.50',
      '60@1.00', '62@1.50',
      '60@2.00', '62@2.50',
      '60@3.00', '62@3.50',
    ]);
  });

  it('trunca a nota que atravessa o fim do loop', () => {
    const score = importMidi(buildMidi({ bpm: 120, tracks: [{ notes: [[60, 0, 4]] }] }));
    const h = harness(score);
    h.transport.setLoop({ startBeat: 0, endBeat: 2 });
    h.transport.play();
    h.advance(1.2);
    // A nota dura 4 semínimas mas o loop fecha em 2: o noteOff é adiantado.
    expect(h.offNotes[0]!.time).toBeCloseTo(1, 5);
  });

  it('o filtro de mão impede o agendamento sem afetar o tempo', () => {
    const score = importMidi(
      buildMidi({
        bpm: 120,
        tracks: [
          { name: 'Right Hand', notes: [[72, 0, 1], [74, 1, 1]] },
          { name: 'Left Hand', notes: [[48, 0, 1], [50, 1, 1]] },
        ],
      }),
    );
    const h = harness(score);
    h.transport.setHandFilter((note) => note.hand !== 'left');
    h.transport.play();
    h.advance(2);
    expect(h.onNotes.map((n) => n.midi)).toEqual([72, 74]);
  });

  it('pausa preserva a posição e tocar retoma de lá', () => {
    const h = harness(fourNotes());
    h.transport.play();
    h.advance(0.75);
    h.transport.pause();
    const beat = h.transport.currentBeat;
    expect(beat).toBeCloseTo(1.5, 5);

    h.advance(2); // tempo passa, mas parado não avança
    expect(h.transport.currentBeat).toBeCloseTo(beat, 5);

    h.transport.play();
    h.advance(0.25);
    expect(h.transport.currentBeat).toBeCloseTo(2, 5);
  });

  it('avisa ao chegar ao fim e para', () => {
    const ended = vi.fn();
    let clock = 0;
    const score = fourNotes();
    const transport = new Transport({
      now: () => clock,
      scheduleNoteOn: () => {},
      scheduleNoteOff: () => {},
      cancelScheduled: () => {},
      onEnded: ended,
    });
    transport.setScore(score);
    transport.play();
    for (let i = 0; i < 100; i++) {
      clock += 0.025;
      vi.advanceTimersByTime(25);
    }
    expect(ended).toHaveBeenCalledTimes(1);
    expect(transport.isPlaying).toBe(false);
  });

  it('entra no loop pelo início quando o play parte de fora dele', () => {
    const h = harness(fourNotes());
    h.transport.seekBeat(3);
    h.transport.setLoop({ startBeat: 0, endBeat: 2 });
    expect(h.transport.currentBeat).toBeCloseTo(0, 5);

    h.transport.play();
    h.advance(0.3);
    // Sem o clamp, o agendador correria voltas para alcançar o presente e as
    // primeiras notas sairiam com instantes no passado.
    expect(h.onNotes.every((n) => n.time >= 0)).toBe(true);
    expect(h.onNotes[0]!.midi).toBe(60);
  });

  it('seek cancela o que já estava agendado', () => {
    const h = harness(fourNotes());
    h.transport.play();
    h.advance(0.1);
    const before = h.getCancels();
    h.transport.seekBeat(2);
    expect(h.getCancels()).toBeGreaterThan(before);
    expect(h.transport.currentBeat).toBeCloseTo(2, 5);
  });
});
