/**
 * Placar do modo espera, sempre visível.
 *
 * Fica na barra de cima, e não no menu, porque é informação para olhar de
 * relance enquanto se toca — enterrá-la num painel que precisa ser aberto
 * anularia o propósito.
 */

import { accuracy, isScoreEmpty, type ScoreSnapshot } from '../core/practiceScore';

interface Props {
  score: ScoreSnapshot;
  onReset(): void;
}

export function ScoreReadout({ score, onReset }: Props) {
  const rate = accuracy(score);
  const empty = isScoreEmpty(score);

  return (
    <div className="score-readout" title="Acertos de primeira, por portão (acordes contam como um)">
      {empty ? (
        <span className="hint">toque para começar a contar</span>
      ) : (
        <>
          <span className="score-rate" data-good={rate !== null && rate >= 0.9}>
            {rate === null ? '—' : `${Math.round(rate * 100)}%`}
          </span>
          <span className="score-detail">
            {score.cleanGates}/{score.gatesPlayed}
          </span>
          {score.streak > 1 && <span className="score-streak">seq. {score.streak}</span>}
          {score.wrongNotes > 0 && (
            <span className="score-wrong">
              {score.wrongNotes} {score.wrongNotes === 1 ? 'erro' : 'erros'}
            </span>
          )}
          <button onClick={onReset} title="Zerar a contagem">zerar</button>
        </>
      )}
    </div>
  );
}
