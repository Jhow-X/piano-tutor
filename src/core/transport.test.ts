import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Transport, type PendingGate, type WaitModeConfig } from './transport';
import type { GateOutcome } from './practiceScore';
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

  const gateEvents: (PendingGate | null)[] = [];
  const outcomes: GateOutcome[] = [];

  const transport = new Transport({
    now: () => clock,
    scheduleNoteOn: (note: Note, time: number) => onNotes.push({ midi: note.midi, time }),
    scheduleNoteOff: (note: Note, time: number) => offNotes.push({ midi: note.midi, time }),
    cancelScheduled: () => { cancels++; },
    onGateChange: (gate) => gateEvents.push(gate),
    onGateResolved: (outcome) => outcomes.push(outcome),
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

  return { transport, onNotes, offNotes, gateEvents, outcomes, advance, getCancels: () => cancels, now: () => clock };
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

  // O botão "Reiniciar" é `seekBeat(0)`; estes casos fixam a semântica de que
  // ele depende.
  it('reiniciar volta ao começo sem parar a reprodução', () => {
    const h = harness(fourNotes());
    h.transport.play();
    h.advance(1.2);
    expect(h.transport.currentBeat).toBeGreaterThan(2);

    h.transport.seekBeat(0);
    expect(h.transport.currentBeat).toBeCloseTo(0, 5);
    expect(h.transport.isRunning).toBe(true);

    h.advance(0.5);
    expect(h.transport.currentBeat).toBeCloseTo(1, 5);
  });

  it('com loop marcado, reiniciar volta ao início do loop e não da peça', () => {
    // Quem está treinando um trecho quer voltar para ele, não para o compasso 1.
    const h = harness(fourNotes());
    h.transport.setLoop({ startBeat: 2, endBeat: 4 });
    h.transport.play();
    h.advance(0.3);

    h.transport.seekBeat(0);
    expect(h.transport.currentBeat).toBeCloseTo(2, 5);
  });

  it('reiniciar parado apenas recoloca o cabeçote no começo', () => {
    const h = harness(fourNotes());
    h.transport.play();
    h.advance(1);
    h.transport.pause();

    h.transport.seekBeat(0);
    expect(h.transport.currentBeat).toBe(0);
    expect(h.transport.isRunning).toBe(false);
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

/** Config padrão: tudo é exigido e o teclado alcança tudo. */
const waitAll: WaitModeConfig = { isRequired: () => true, isReachable: () => true };

describe('Transport — modo espera', () => {
  it('congela exatamente no beat do portão, não no tick seguinte', () => {
    const h = harness(fourNotes());
    h.transport.setWaitMode(waitAll);
    h.transport.play();
    // O primeiro portão é em beat 0: para antes de qualquer nota soar.
    expect(h.transport.isWaiting).toBe(true);
    expect(h.transport.currentBeat).toBe(0);
    expect(h.onNotes).toEqual([]);

    h.transport.notePressed(60);
    h.advance(0.4); // 0,4s a 120bpm ⇒ 0,8 semínima
    expect(h.transport.currentBeat).toBeCloseTo(0.8, 5);

    // Passa do beat 1 em tempo de relógio, mas o portão de lá segura o cabeçote.
    h.advance(0.2);
    expect(h.transport.isWaiting).toBe(true);
    expect(h.transport.currentBeat).toBe(1);
  });

  it('a sessão continua ativa enquanto o portão segura', () => {
    const h = harness(fourNotes());
    h.transport.setWaitMode(waitAll);
    h.transport.play();
    expect(h.transport.isRunning).toBe(true); // botão continua em "Pausar"
    expect(h.transport.isPlaying).toBe(false); // mas o relógio está parado
  });

  it('não agenda áudio além do portão', () => {
    const h = harness(fourNotes());
    h.transport.setWaitMode(waitAll);
    h.transport.play();
    h.transport.notePressed(60);
    h.advance(3);
    // Sem soltar o segundo portão, só a nota do primeiro pode ter soado.
    expect(h.onNotes.map((n) => n.midi)).toEqual([60]);
  });

  it('retoma no instante da satisfação e segue no tempo', () => {
    const h = harness(fourNotes());
    h.transport.setWaitMode(waitAll);
    h.transport.play();
    h.transport.notePressed(60);
    expect(h.onNotes).toEqual([{ midi: 60, time: 0 }]);

    // O portão do beat 1 abre em t=0,5s; o usuário só toca meio segundo depois.
    h.advance(1);
    h.transport.notePressed(62);
    // A nota sai quando o usuário tocou (t=1,0s), não quando a peça a pedia (0,5s).
    expect(h.onNotes[1]!.midi).toBe(62);
    expect(h.onNotes[1]!.time).toBeCloseTo(1, 5);
  });

  it('exige as notas todas de um acorde', () => {
    const score = importMidi(
      buildMidi({ bpm: 120, tracks: [{ notes: [[60, 0, 1], [64, 0, 1], [67, 0, 1]] }] }),
    );
    const h = harness(score);
    h.transport.setWaitMode(waitAll);
    h.transport.play();

    h.transport.notePressed(60);
    expect(h.transport.isWaiting).toBe(true);
    h.transport.notePressed(64);
    expect(h.transport.isWaiting).toBe(true);
    expect(h.transport.getPendingGate()?.missing).toEqual([67]);
    h.transport.notePressed(67);
    expect(h.transport.isWaiting).toBe(false);
  });

  it('ignora a nota errada sem destravar', () => {
    const h = harness(fourNotes());
    h.transport.setWaitMode(waitAll);
    h.transport.play();
    h.transport.notePressed(61);
    h.transport.notePressed(59);
    expect(h.transport.isWaiting).toBe(true);
    expect(h.transport.getPendingGate()?.missing).toEqual([60]);
  });

  it('nota repetida exige novo ataque, mesmo com a tecla ainda pressionada', () => {
    // Dó duas vezes seguidas: o segundo portão não pode se auto-satisfazer só
    // porque o usuário nunca soltou a tecla.
    const score = importMidi(
      buildMidi({ bpm: 120, tracks: [{ notes: [[60, 0, 1], [60, 1, 1]] }] }),
    );
    const h = harness(score);
    h.transport.setWaitMode(waitAll);
    h.transport.play();
    h.transport.notePressed(60);
    h.advance(1);
    expect(h.transport.isWaiting).toBe(true);
    expect(h.transport.getPendingGate()?.missing).toEqual([60]);

    h.transport.notePressed(60);
    expect(h.transport.isWaiting).toBe(false);
  });

  it('alturas fora do alcance nascem satisfeitas', () => {
    const score = importMidi(
      buildMidi({ bpm: 120, tracks: [{ notes: [[24, 0, 1], [60, 0, 1]] }] }),
    );
    const h = harness(score);
    h.transport.setWaitMode({ isRequired: () => true, isReachable: (midi) => midi >= 36 });
    h.transport.play();
    expect(h.transport.getPendingGate()?.missing).toEqual([60]);
    h.transport.notePressed(60);
    expect(h.transport.isWaiting).toBe(false);
  });

  it('passa direto por trechos inteiramente fora do alcance', () => {
    const score = importMidi(
      buildMidi({ bpm: 120, tracks: [{ notes: [[24, 0, 1], [26, 1, 1], [60, 2, 1]] }] }),
    );
    const h = harness(score);
    h.transport.setWaitMode({ isRequired: () => true, isReachable: (midi) => midi >= 36 });
    h.transport.play();
    // Os dois primeiros beats fluem sozinhos; a espera é só no beat 2.
    expect(h.transport.isWaiting).toBe(false);
    h.advance(1.2);
    expect(h.transport.isWaiting).toBe(true);
    expect(h.transport.currentBeat).toBe(2);
    expect(h.onNotes.map((n) => n.midi)).toEqual([24, 26]);
  });

  it('só exige a mão escolhida, e toca a outra sozinho', () => {
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
    h.transport.setWaitMode({ isRequired: (n) => n.hand === 'right', isReachable: () => true });
    h.transport.play();
    expect(h.transport.getPendingGate()?.required).toEqual([72]);

    h.transport.notePressed(72);
    // A mão esquerda do mesmo beat soa junto, na retomada.
    expect(h.onNotes.map((n) => n.midi).sort()).toEqual([48, 72]);
  });

  it('skipGate destrava sem tocar nada', () => {
    const h = harness(fourNotes());
    h.transport.setWaitMode(waitAll);
    h.transport.play();
    h.transport.skipGate();
    expect(h.transport.isWaiting).toBe(false);
    h.advance(0.3);
    expect(h.onNotes.map((n) => n.midi)).toEqual([60]);
  });

  it('desligar o modo com um portão aberto destrava a reprodução', () => {
    const h = harness(fourNotes());
    h.transport.setWaitMode(waitAll);
    h.transport.play();
    expect(h.transport.isWaiting).toBe(true);
    h.transport.setWaitMode(null);
    expect(h.transport.isWaiting).toBe(false);
    h.advance(1);
    expect(h.transport.currentBeat).toBeGreaterThan(1);
  });

  it('pausar durante a espera funciona, e tocar volta ao mesmo portão', () => {
    const h = harness(fourNotes());
    h.transport.setWaitMode(waitAll);
    h.transport.play();
    h.transport.notePressed(60);
    h.advance(1); // espera no portão do beat 1
    expect(h.transport.currentBeat).toBe(1);

    h.transport.pause();
    expect(h.transport.isRunning).toBe(false);
    expect(h.transport.currentBeat).toBe(1);

    h.transport.play();
    expect(h.transport.isWaiting).toBe(true);
    expect(h.transport.getPendingGate()?.required).toEqual([62]);
  });

  it('distingue tocar, pular e cancelar ao liberar o portão', () => {
    // A pontuação depende dessa diferença: o mesmo `null` chega em `onGateChange`
    // nos três casos, e inferi-la de fora seria frágil.
    const h = harness(fourNotes());
    h.transport.setWaitMode(waitAll);
    h.transport.play();

    h.transport.notePressed(60);
    h.advance(1);
    h.transport.skipGate();
    h.advance(1);
    h.transport.setWaitMode(null);

    expect(h.outcomes).toEqual(['played', 'skipped', 'cancelled']);
  });

  it('avisa a UI quando o portão abre e quando é liberado', () => {
    const h = harness(fourNotes());
    h.transport.setWaitMode(waitAll);
    h.transport.play();
    h.transport.notePressed(60);
    expect(h.gateEvents.map((g) => g?.beat ?? null)).toEqual([0, null]);
  });

  it('reiniciar volta ao primeiro portão', () => {
    const h = harness(fourNotes());
    h.transport.setWaitMode(waitAll);
    h.transport.play();
    h.transport.notePressed(60);
    h.advance(1);
    h.transport.notePressed(62);
    h.advance(1);
    expect(h.transport.getPendingGate()?.required).toEqual([64]);

    h.transport.seekBeat(0);
    expect(h.transport.isWaiting).toBe(true);
    expect(h.transport.getPendingGate()?.required).toEqual([60]);
  });

  it('busca reposiciona o portão corrente', () => {
    const h = harness(fourNotes());
    h.transport.setWaitMode(waitAll);
    h.transport.seekBeat(2);
    h.transport.play();
    expect(h.transport.getPendingGate()?.required).toEqual([64]);
  });

  it('o loop volta a exigir os portões da volta anterior', () => {
    const h = harness(fourNotes());
    h.transport.setLoop({ startBeat: 0, endBeat: 2 });
    h.transport.setWaitMode(waitAll);
    h.transport.play();
    h.transport.notePressed(60);
    h.advance(1);
    h.transport.notePressed(62);
    h.advance(1);
    // Terceiro portão: de volta ao começo do loop, exigindo o Dó de novo.
    expect(h.transport.isWaiting).toBe(true);
    expect(h.transport.getPendingGate()?.required).toEqual([60]);
    expect(h.transport.currentBeat).toBe(0);
  });
});
