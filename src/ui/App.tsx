import { useCallback, useEffect, useRef, useState } from 'react';
import type { Hand, NoteNaming, Score } from '../core/score';
import { Transport, type LoopRange } from '../core/transport';
import { AudioPlayer } from '../audio/player';
import { Stage } from '../render/stage';
import { ACCEPTED_EXTENSIONS, importFile } from '../core/importers';
import { MeasureRuler } from './MeasureRuler';
import { ScorePanel } from './ScorePanel';
import { ComputerKeyboardSource } from '../input/computerKeyboard';
import { useConstant } from './useConstant';
import { theme } from '../render/theme';

type Status = { kind: 'idle' } | { kind: 'loading' } | { kind: 'error'; message: string };

export function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stageRef = useRef<Stage | null>(null);

  const [score, setScore] = useState<Score | null>(null);
  const [status, setStatus] = useState<Status>({ kind: 'idle' });
  const [isPlaying, setIsPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [loop, setLoop] = useState<LoopRange | null>(null);
  const [mutedHands, setMutedHands] = useState<Set<Hand>>(new Set());
  const [hiddenHands, setHiddenHands] = useState<Set<Hand>>(new Set());
  const [showNoteNames, setShowNoteNames] = useState(false);
  const [naming, setNaming] = useState<NoteNaming>('letters');
  const [showFingering, setShowFingering] = useState(true);
  const [beatsVisible, setBeatsVisible] = useState(8);
  const [showScore, setShowScore] = useState(true);
  const [inputOctave, setInputOctave] = useState(4);

  // Áudio e transporte vivem fora do ciclo de render.
  const audio = useConstant(() => new AudioPlayer());
  const transport = useConstant(
    () =>
      new Transport({
        now: () => audio.now(),
        scheduleNoteOn: (note, time) => audio.scheduleNoteOn(note, time),
        scheduleNoteOff: (note, time) => audio.scheduleNoteOff(note, time),
        cancelScheduled: () => audio.cancelScheduled(),
        onEnded: () => setIsPlaying(false),
      }),
  );

  const getCurrentBeat = useCallback(() => transport.currentBeat, [transport]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const stage = new Stage(canvas, getCurrentBeat);
    stageRef.current = stage;
    stage.start();
    return () => {
      stage.dispose();
      stageRef.current = null;
    };
  }, [getCurrentBeat]);

  // O palco lê `state` a cada quadro, então basta escrever nele.
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    stage.state.score = score;
    stage.state.hiddenHands = hiddenHands;
    stage.state.showNoteNames = showNoteNames;
    stage.state.showFingering = showFingering;
    stage.state.naming = naming;
    stage.state.beatsVisible = beatsVisible;
  }, [score, hiddenHands, showNoteNames, showFingering, naming, beatsVisible]);

  useEffect(() => {
    transport.setHandFilter((note) => !mutedHands.has(note.hand));
  }, [transport, mutedHands]);

  // Entrada de notas do usuário. Hoje só o teclado do computador; a Web MIDI
  // entra como outra implementação da mesma interface, sem mexer aqui.
  useEffect(() => {
    const source = new ComputerKeyboardSource(setInputOctave);
    const unsubscribe = source.subscribe({
      noteOn: (midi, velocity) => {
        void audio.init().then(() => audio.playNow(midi, velocity));
        stageRef.current?.state.playedNotes.add(midi);
      },
      noteOff: (midi) => {
        stageRef.current?.state.playedNotes.delete(midi);
      },
    });
    source.start();
    return () => {
      unsubscribe();
      source.stop();
    };
  }, [audio]);

  useEffect(() => {
    transport.setSpeed(speed);
  }, [transport, speed]);

  useEffect(() => {
    transport.setLoop(loop);
  }, [transport, loop]);

  const loadFile = useCallback(async (file: File) => {
    setStatus({ kind: 'loading' });
    transport.pause();
    setIsPlaying(false);
    try {
      const loaded = await importFile(file);
      if (loaded.notes.length === 0) {
        setStatus({ kind: 'error', message: 'O arquivo não contém notas.' });
        return;
      }
      transport.setScore(loaded);
      setLoop(null);
      setShowScore(true);
      setScore(loaded);
      setStatus({ kind: 'idle' });
    } catch (error) {
      setStatus({ kind: 'error', message: error instanceof Error ? error.message : String(error) });
    }
  }, [transport]);

  const togglePlay = useCallback(async () => {
    if (transport.isPlaying) {
      transport.pause();
      setIsPlaying(false);
      return;
    }
    if (!score) return;
    // O `AudioContext` só pode nascer dentro de um gesto do usuário.
    await audio.init();
    await audio.resume();
    transport.play();
    setIsPlaying(true);
  }, [audio, transport, score]);

  const stop = useCallback(() => {
    transport.stop();
    setIsPlaying(false);
  }, [transport]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement) return;
      if (event.code === 'Space') {
        event.preventDefault();
        void togglePlay();
      } else if (event.code === 'Escape') {
        // Não usar uma letra: elas todas pertencem ao teclado de notas.
        setLoop(null);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [togglePlay]);

  const onDrop = (event: React.DragEvent) => {
    event.preventDefault();
    const file = event.dataTransfer.files[0];
    if (file) void loadFile(file);
  };

  /** Clicar numa tecla toca a nota — pré-escuta enquanto se lê a partitura. */
  const onCanvasPointerDown = async (event: React.PointerEvent<HTMLCanvasElement>) => {
    const midi = stageRef.current?.keyAt(event.clientX, event.clientY);
    if (midi === undefined) return;
    await audio.init();
    audio.playNow(midi);
    stageRef.current?.state.playedNotes.add(midi);
    const release = () => {
      stageRef.current?.state.playedNotes.delete(midi);
      window.removeEventListener('pointerup', release);
    };
    window.addEventListener('pointerup', release);
  };

  return (
    <div className="app" onDrop={onDrop} onDragOver={(e) => e.preventDefault()}>
      <header className="topbar">
        <label className="file-button">
          Abrir arquivo
          <input
            type="file"
            accept={ACCEPTED_EXTENSIONS}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void loadFile(file);
              e.target.value = '';
            }}
          />
        </label>
        <span className="title">{score?.title ?? 'Nenhuma peça carregada'}</span>
        {status.kind === 'loading' && <span className="hint">carregando…</span>}
        {status.kind === 'error' && <span className="error">{status.message}</span>}
      </header>

      <div className="workspace">
        <div className="stage">
          <canvas ref={canvasRef} onPointerDown={(e) => void onCanvasPointerDown(e)} />
          {!score && status.kind !== 'loading' && (
            <div className="dropzone-hint">
              Arraste um arquivo aqui, ou clique em “Abrir arquivo”.
              <br />
              <code>.mid</code> <code>.musicxml</code> <code>.mxl</code> <code>.abc</code>
            </div>
          )}
        </div>
        {score && showScore && <ScorePanel score={score} getCurrentBeat={getCurrentBeat} />}
      </div>

      {score && (
        <MeasureRuler
          score={score}
          loop={loop}
          getCurrentBeat={getCurrentBeat}
          onSeek={(beat) => transport.seekBeat(beat)}
          onLoopChange={setLoop}
        />
      )}

      <footer className="controls">
        <div className="group">
          <button className="primary" onClick={() => void togglePlay()} disabled={!score}>
            {isPlaying ? '❚❚ Pausar' : '▶ Tocar'}
          </button>
          <button onClick={stop} disabled={!score}>■ Parar</button>
        </div>

        <div className="group">
          <label>
            Velocidade <strong>{Math.round(speed * 100)}%</strong>
            <input
              type="range"
              min={25}
              max={150}
              step={5}
              value={Math.round(speed * 100)}
              onChange={(e) => setSpeed(Number(e.target.value) / 100)}
            />
          </label>
        </div>

        <div className="group">
          <span className="group-label">Loop</span>
          {loop ? (
            <>
              <span className="loop-info">{describeLoop(score, loop)}</span>
              <button onClick={() => setLoop(null)}>limpar</button>
            </>
          ) : (
            <span className="hint">arraste na régua</span>
          )}
        </div>

        <div className="group">
          <span className="group-label">Mãos</span>
          {(['right', 'left'] as const).map((hand) => (
            <HandToggle
              key={hand}
              hand={hand}
              muted={mutedHands.has(hand)}
              hidden={hiddenHands.has(hand)}
              onToggleMute={() => setMutedHands(toggled(mutedHands, hand))}
              onToggleHide={() => setHiddenHands(toggled(hiddenHands, hand))}
            />
          ))}
        </div>

        <div className="group">
          <label className="check">
            <input type="checkbox" checked={showNoteNames} onChange={(e) => setShowNoteNames(e.target.checked)} />
            Nomes
          </label>
          <select value={naming} onChange={(e) => setNaming(e.target.value as NoteNaming)} disabled={!showNoteNames}>
            <option value="letters">C D E</option>
            <option value="solfege">Dó Ré Mi</option>
          </select>
          <label className="check">
            <input type="checkbox" checked={showFingering} onChange={(e) => setShowFingering(e.target.checked)} />
            Dedilhado
          </label>
        </div>

        {score?.engraving && (
          <div className="group">
            <label className="check">
              <input type="checkbox" checked={showScore} onChange={(e) => setShowScore(e.target.checked)} />
              Partitura
            </label>
          </div>
        )}

        <div className="group">
          <span className="group-label" title="Fileira de baixo: teclas brancas · fileira de cima: pretas · Z e X mudam de oitava">
            Toque com o teclado
          </span>
          <span className="octave">C{inputOctave}</span>
        </div>

        <div className="group">
          <label>
            Zoom
            <input
              type="range"
              min={2}
              max={24}
              step={1}
              // Invertido: arrastar para a direita aproxima, que é o que se espera.
              value={26 - beatsVisible}
              onChange={(e) => setBeatsVisible(26 - Number(e.target.value))}
            />
          </label>
        </div>
      </footer>
    </div>
  );
}

function HandToggle({
  hand,
  muted,
  hidden,
  onToggleMute,
  onToggleHide,
}: {
  hand: Hand;
  muted: boolean;
  hidden: boolean;
  onToggleMute(): void;
  onToggleHide(): void;
}) {
  return (
    <span className="hand-toggle">
      <span className="swatch" style={{ background: theme.hand[hand].fill }} />
      <span className="hand-name">{hand === 'right' ? 'D' : 'E'}</span>
      <button className={muted ? 'off' : ''} onClick={onToggleMute} title="Silenciar esta mão">
        {muted ? '🔇' : '🔊'}
      </button>
      <button className={hidden ? 'off' : ''} onClick={onToggleHide} title="Ocultar esta mão">
        {hidden ? '🙈' : '👁'}
      </button>
    </span>
  );
}

function toggled<T>(set: Set<T>, value: T): Set<T> {
  const next = new Set(set);
  if (next.has(value)) next.delete(value);
  else next.add(value);
  return next;
}

function describeLoop(score: Score | null, loop: LoopRange): string {
  if (!score) return '';
  const first = score.measures.find((m) => m.startBeat >= loop.startBeat - 1e-6);
  const last = [...score.measures].reverse().find((m) => m.endBeat <= loop.endBeat + 1e-6);
  if (!first || !last) return '';
  return first.index === last.index
    ? `compasso ${first.index + 1}`
    : `compassos ${first.index + 1}–${last.index + 1}`;
}
