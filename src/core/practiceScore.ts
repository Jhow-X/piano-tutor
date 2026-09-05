/**
 * Pontuação do modo espera.
 *
 * Só faz sentido com o modo espera ligado: ali o app segura a reprodução até a
 * nota certa, então "acertar" é exato e não depende de julgar tempo. Tocando
 * junto, no tempo, seria preciso uma janela de tolerância — outro recurso.
 *
 * A unidade é o **portão**, não a tecla: um acorde de três notas é um acerto, e
 * não três. É assim que se conta ao estudar, e evita que peças com acordes
 * densos inflem a pontuação.
 */

export interface ScoreSnapshot {
  /** Portões concluídos tocando (pular não conta). */
  gatesPlayed: number;
  /** Concluídos sem nenhuma tecla errada antes. */
  cleanGates: number;
  wrongNotes: number;
  skippedGates: number;
  streak: number;
  bestStreak: number;
}

export type GateOutcome = 'played' | 'skipped' | 'cancelled';

const EMPTY: ScoreSnapshot = {
  gatesPlayed: 0,
  cleanGates: 0,
  wrongNotes: 0,
  skippedGates: 0,
  streak: 0,
  bestStreak: 0,
};

export class PracticeScore {
  private state: ScoreSnapshot = { ...EMPTY };
  /** Houve tecla errada desde que o portão corrente abriu? */
  private dirty = false;
  private openBeat: number | null = null;

  constructor(private readonly onChange?: (snapshot: ScoreSnapshot) => void) {}

  get snapshot(): ScoreSnapshot {
    return this.state;
  }

  reset(): void {
    this.state = { ...EMPTY };
    this.dirty = false;
    this.openBeat = null;
    this.emit();
  }

  /**
   * Um portão ficou pendente. Idempotente por beat: o transporte avisa de novo a
   * cada nota de um acorde, e só a primeira vez abre um portão novo.
   */
  beginGate(beat: number): void {
    if (this.openBeat === beat) return;
    this.openBeat = beat;
    this.dirty = false;
  }

  /** Tecla tocada com um portão aberto. Fora disso não há o que julgar. */
  registerPress(correct: boolean): void {
    if (this.openBeat === null || correct) return;
    this.dirty = true;
    this.state = { ...this.state, wrongNotes: this.state.wrongNotes + 1 };
    this.emit();
  }

  resolveGate(outcome: GateOutcome): void {
    if (this.openBeat === null) return;
    this.openBeat = null;

    // 'cancelled' é desligar o modo espera no meio: não é acerto nem erro, e
    // penalizar por mudar de configuração seria arbitrário.
    if (outcome === 'cancelled') {
      this.dirty = false;
      return;
    }

    if (outcome === 'skipped') {
      this.state = { ...this.state, skippedGates: this.state.skippedGates + 1, streak: 0 };
    } else {
      const clean = !this.dirty;
      const streak = clean ? this.state.streak + 1 : 0;
      this.state = {
        ...this.state,
        gatesPlayed: this.state.gatesPlayed + 1,
        cleanGates: this.state.cleanGates + (clean ? 1 : 0),
        streak,
        bestStreak: Math.max(this.state.bestStreak, streak),
      };
    }
    this.dirty = false;
    this.emit();
  }

  private emit(): void {
    this.onChange?.(this.state);
  }
}

/** Proporção de portões acertados de primeira, ou `null` sem nada medido ainda. */
export function accuracy(snapshot: ScoreSnapshot): number | null {
  return snapshot.gatesPlayed === 0 ? null : snapshot.cleanGates / snapshot.gatesPlayed;
}

export function isScoreEmpty(snapshot: ScoreSnapshot): boolean {
  return snapshot.gatesPlayed === 0 && snapshot.wrongNotes === 0 && snapshot.skippedGates === 0;
}
