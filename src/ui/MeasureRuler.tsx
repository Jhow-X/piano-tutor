/**
 * Régua de compassos: faz dupla função de barra de busca e de seletor de loop.
 *
 * Desenha no próprio `requestAnimationFrame` e lê a posição direto do transporte,
 * para que o cabeçote a 60fps não force re-render do React.
 */

import { useEffect, useRef } from 'react';
import type { LoopRange } from '../core/transport';
import type { Score } from '../core/score';
import { theme } from '../render/theme';

const DRAG_THRESHOLD_PX = 4;

interface Props {
  score: Score;
  loop: LoopRange | null;
  getCurrentBeat: () => number;
  onSeek(beat: number): void;
  onLoopChange(loop: LoopRange | null): void;
}

export function MeasureRuler({ score, loop, getCurrentBeat, onSeek, onLoopChange }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // Refs porque o laço de desenho não deve reiniciar a cada render.
  const loopRef = useRef(loop);
  const scoreRef = useRef(score);
  const dragRef = useRef<{ startX: number; startBeat: number; dragging: boolean } | null>(null);
  const previewRef = useRef<LoopRange | null>(null);

  loopRef.current = loop;
  scoreRef.current = score;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let frame = 0;
    const draw = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      if (canvas.width !== Math.round(rect.width * dpr)) {
        canvas.width = Math.round(rect.width * dpr);
        canvas.height = Math.round(rect.height * dpr);
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      drawRuler(ctx, rect.width, rect.height, scoreRef.current, previewRef.current ?? loopRef.current, getCurrentBeat());
      frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, [getCurrentBeat]);

  const beatAtClientX = (clientX: number): number => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    return ratio * Math.max(scoreRef.current.durationBeats, 1);
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = { startX: event.clientX, startBeat: beatAtClientX(event.clientX), dragging: false };
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    if (!drag.dragging && Math.abs(event.clientX - drag.startX) < DRAG_THRESHOLD_PX) return;
    drag.dragging = true;
    // Um arrasto seleciona compassos inteiros: loop no meio do compasso quase
    // nunca é o que se quer ao estudar um trecho.
    previewRef.current = snapToMeasures(scoreRef.current, drag.startBeat, beatAtClientX(event.clientX));
  };

  const handlePointerUp = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const drag = dragRef.current;
    dragRef.current = null;
    if (!drag) return;
    if (drag.dragging) {
      onLoopChange(previewRef.current);
      previewRef.current = null;
    } else {
      onSeek(beatAtClientX(event.clientX));
    }
  };

  return (
    <canvas
      ref={canvasRef}
      className="measure-ruler"
      title="Clique para buscar · arraste para marcar um loop · Esc limpa"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
    />
  );
}

/** Expande a seção arrastada até as bordas dos compassos que ela toca. */
function snapToMeasures(score: Score, beatA: number, beatB: number): LoopRange | null {
  const from = Math.min(beatA, beatB);
  const to = Math.max(beatA, beatB);
  const touched = score.measures.filter((m) => m.endBeat > from && m.startBeat < to);
  if (touched.length === 0) return null;
  return { startBeat: touched[0]!.startBeat, endBeat: touched[touched.length - 1]!.endBeat };
}

function drawRuler(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  score: Score,
  loop: LoopRange | null,
  currentBeat: number,
): void {
  const total = Math.max(score.durationBeats, 1);
  const x = (beat: number) => (beat / total) * width;

  ctx.fillStyle = '#1b1e29';
  ctx.fillRect(0, 0, width, height);

  if (loop) {
    ctx.fillStyle = 'rgba(77, 157, 224, 0.22)';
    ctx.fillRect(x(loop.startBeat), 0, x(loop.endBeat) - x(loop.startBeat), height);
    ctx.strokeStyle = '#4d9de0';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x(loop.startBeat), 0);
    ctx.lineTo(x(loop.startBeat), height);
    ctx.moveTo(x(loop.endBeat), 0);
    ctx.lineTo(x(loop.endBeat), height);
    ctx.stroke();
  }

  // Compassos ficam ilegíveis quando há centenas: só rotula quando cabe.
  const labelEvery = labelInterval(score.measures.length, width);
  ctx.lineWidth = 1;
  ctx.font = '9px system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  for (const measure of score.measures) {
    const px = Math.round(x(measure.startBeat)) + 0.5;
    const labeled = measure.index % labelEvery === 0;
    ctx.strokeStyle = labeled ? theme.gridLineStrong : theme.gridLine;
    ctx.beginPath();
    ctx.moveTo(px, labeled ? 0 : height * 0.6);
    ctx.lineTo(px, height);
    ctx.stroke();
    if (labeled) {
      ctx.fillStyle = theme.textDim;
      ctx.fillText(String(measure.index + 1), px + 3, 2);
    }
  }

  const playheadX = Math.round(x(currentBeat)) + 0.5;
  ctx.strokeStyle = '#f2f3f7';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(playheadX, 0);
  ctx.lineTo(playheadX, height);
  ctx.stroke();
}

function labelInterval(measureCount: number, width: number): number {
  const minPixelsPerLabel = 34;
  const maxLabels = Math.max(1, Math.floor(width / minPixelsPerLabel));
  for (const step of [1, 2, 4, 8, 16, 32, 64]) {
    if (measureCount / step <= maxLabels) return step;
  }
  return 128;
}
