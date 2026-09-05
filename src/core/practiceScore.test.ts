import { describe, expect, it, vi } from 'vitest';
import { PracticeScore, accuracy, isScoreEmpty } from './practiceScore';

/** Toca um portão inteiro: abre, erra `wrong` vezes, acerta e conclui. */
function playGate(score: PracticeScore, beat: number, wrong = 0): void {
  score.beginGate(beat);
  for (let i = 0; i < wrong; i++) score.registerPress(false);
  score.registerPress(true);
  score.resolveGate('played');
}

describe('PracticeScore', () => {
  it('começa zerado', () => {
    const score = new PracticeScore();
    expect(isScoreEmpty(score.snapshot)).toBe(true);
    expect(accuracy(score.snapshot)).toBeNull();
  });

  it('conta um portão limpo', () => {
    const score = new PracticeScore();
    playGate(score, 0);
    expect(score.snapshot).toMatchObject({ gatesPlayed: 1, cleanGates: 1, wrongNotes: 0, streak: 1 });
    expect(accuracy(score.snapshot)).toBe(1);
  });

  it('erro antes do acerto suja o portão, mas ele ainda conclui', () => {
    const score = new PracticeScore();
    playGate(score, 0, 2);
    expect(score.snapshot).toMatchObject({ gatesPlayed: 1, cleanGates: 0, wrongNotes: 2, streak: 0 });
    expect(accuracy(score.snapshot)).toBe(0);
  });

  it('conta o portão, e não cada tecla do acorde', () => {
    // Um acorde de três notas é um acerto; senão peças com acordes densos
    // inflariam a pontuação em relação a uma linha melódica.
    const score = new PracticeScore();
    score.beginGate(0);
    score.registerPress(true);
    score.registerPress(true);
    score.registerPress(true);
    score.resolveGate('played');
    expect(score.snapshot.gatesPlayed).toBe(1);
  });

  it('beginGate é idempotente no mesmo beat', () => {
    // O transporte reavisa a cada nota de um acorde parcial.
    const score = new PracticeScore();
    score.beginGate(4);
    score.registerPress(false);
    score.beginGate(4); // não pode limpar o erro já cometido
    score.registerPress(true);
    score.resolveGate('played');
    expect(score.snapshot.cleanGates).toBe(0);
  });

  it('acumula a sequência e guarda a melhor', () => {
    const score = new PracticeScore();
    playGate(score, 0);
    playGate(score, 1);
    playGate(score, 2);
    expect(score.snapshot).toMatchObject({ streak: 3, bestStreak: 3 });

    playGate(score, 3, 1); // erra: zera a sequência
    expect(score.snapshot).toMatchObject({ streak: 0, bestStreak: 3 });

    playGate(score, 4);
    expect(score.snapshot).toMatchObject({ streak: 1, bestStreak: 3 });
  });

  it('pular não conta como acerto nem como erro, mas zera a sequência', () => {
    const score = new PracticeScore();
    playGate(score, 0);
    score.beginGate(1);
    score.resolveGate('skipped');
    expect(score.snapshot).toMatchObject({
      gatesPlayed: 1,
      cleanGates: 1,
      skippedGates: 1,
      streak: 0,
    });
  });

  it('desligar o modo espera no meio não penaliza', () => {
    // Mudar de configuração não é erro do usuário.
    const score = new PracticeScore();
    score.beginGate(0);
    score.registerPress(false);
    score.resolveGate('cancelled');
    expect(score.snapshot).toMatchObject({ gatesPlayed: 0, skippedGates: 0, streak: 0 });
  });

  it('erro sem portão aberto é ignorado', () => {
    // Fora do modo espera não há o que julgar.
    const score = new PracticeScore();
    score.registerPress(false);
    expect(score.snapshot.wrongNotes).toBe(0);
  });

  it('calcula a precisão sobre os portões tocados', () => {
    const score = new PracticeScore();
    playGate(score, 0);
    playGate(score, 1);
    playGate(score, 2, 1);
    playGate(score, 3);
    expect(accuracy(score.snapshot)).toBeCloseTo(0.75, 5);
  });

  it('reset zera tudo, inclusive a melhor sequência', () => {
    const score = new PracticeScore();
    playGate(score, 0);
    score.reset();
    expect(isScoreEmpty(score.snapshot)).toBe(true);
    expect(score.snapshot.bestStreak).toBe(0);
  });

  it('avisa a cada mudança, para a tela acompanhar', () => {
    const onChange = vi.fn();
    const score = new PracticeScore(onChange);
    playGate(score, 0, 1);
    // um aviso pelo erro, um pela conclusão
    expect(onChange).toHaveBeenCalledTimes(2);
    expect(onChange.mock.lastCall?.[0]).toMatchObject({ gatesPlayed: 1, wrongNotes: 1 });
  });
});
