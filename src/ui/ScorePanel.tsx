/**
 * Painel de partitura tradicional, ao lado do piano roll.
 *
 * Só aparece quando a fonte carrega grafia (MusicXML e ABC). Um `.mid` não tem
 * partitura confiável a mostrar, e gravá-la por quantização produziria uma
 * leitura errada — pior do que não mostrar nada.
 */

import { useEffect, useRef, useState } from 'react';
import type { Score } from '../core/score';
import { beatToSeconds } from '../core/score';
import type { EngravingView } from '../render/engraving/types';

interface Props {
  score: Score;
  getCurrentBeat: () => number;
}

export function ScorePanel({ score, getCurrentBeat }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const container = containerRef.current;
    const engraving = score.engraving;
    if (!container || !engraving) return;

    let view: EngravingView | null = null;
    let frame = 0;
    let cancelled = false;
    setLoading(true);
    setError(null);

    (async () => {
      try {
        view = engraving.kind === 'abc'
          ? await (await import('../render/engraving/abcView')).createAbcView(container, engraving.source)
          : await (await import('../render/engraving/verovioView')).createVerovioView(container);
        if (cancelled) {
          view.dispose();
          return;
        }
        setLoading(false);
        const tick = () => {
          view!.highlight(beatToSeconds(getCurrentBeat(), score.tempoMap));
          frame = requestAnimationFrame(tick);
        };
        frame = requestAnimationFrame(tick);
      } catch (cause) {
        if (!cancelled) {
          setLoading(false);
          setError(cause instanceof Error ? cause.message : String(cause));
        }
      }
    })();

    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
      view?.dispose();
    };
  }, [score, getCurrentBeat]);

  if (!score.engraving) return null;

  return (
    <div className="score-panel">
      {loading && <div className="score-status">desenhando a partitura…</div>}
      {error && <div className="score-status error">{error}</div>}
      <div ref={containerRef} className="score-surface" />
    </div>
  );
}
