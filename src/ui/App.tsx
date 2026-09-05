import { useCallback, useEffect, useRef, useState } from 'react';
import type { Hand, NoteNaming, Score } from '../core/score';
import { Transport, type LoopRange, type PendingGate } from '../core/transport';
import { AudioPlayer } from '../audio/player';
import { Stage } from '../render/stage';
import { ACCEPTED_EXTENSIONS, importFile } from '../core/importers';
import { MeasureRuler } from './MeasureRuler';
import { ScorePanel } from './ScorePanel';
import { ComputerKeyboardSource } from '../input/computerKeyboard';
import { WebMidiSource, type MidiStatus } from '../input/webMidi';
import type { NoteInputListener } from '../input/NoteInputSource';
import {
  DEFAULT_KEYBOARD_SIZE,
  KEYBOARD_SIZES,
  isKeyboardSize,
  isWithinRange,
  type KeyboardSize,
} from '../input/keyboardRange';
import { useConstant } from './useConstant';
import { isBoolean, readPref, writePref } from './prefs';
import { theme } from '../render/theme';
import { midiToNoteName, midiToOctave } from '../core/score';

type Status = { kind: 'idle' } | { kind: 'loading' } | { kind: 'error'; message: string };

/** Qual mão o usuário se compromete a tocar no modo espera. */
type YouPlay = 'both' | 'right' | 'left';

const isYouPlay = (value: unknown): value is YouPlay =>
  value === 'both' || value === 'right' || value === 'left';

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

  const [waitMode, setWaitMode] = useState(() => readPref('waitMode', isBoolean, false));
  const [youPlay, setYouPlay] = useState<YouPlay>(() => readPref('youPlay', isYouPlay, 'both'));
  const [keyboardSize, setKeyboardSize] = useState<KeyboardSize>(
    () => readPref('keyboardSize', isKeyboardSize, DEFAULT_KEYBOARD_SIZE),
  );
  const [midiStatus, setMidiStatus] = useState<MidiStatus>({ kind: 'idle' });
  const [gate, setGate] = useState<PendingGate | null>(null);

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
        onGateChange: setGate,
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
    transport.setHandFilter((note) => {
      if (mutedHands.has(note.hand)) return false;
      // No modo espera o app não soa o que é do usuário — senão ele ouviria a
      // própria nota antes de tocá-la.
      if (waitMode && (youPlay === 'both' || note.hand === youPlay)) return false;
      return true;
    });
  }, [transport, mutedHands, waitMode, youPlay]);

  // Entrada de notas: teclado do computador e teclado MIDI compartilham o mesmo
  // ouvinte. Para o resto do app, de onde a nota veio é indiferente.
  const computerKeyboard = useConstant(() => new ComputerKeyboardSource(setInputOctave));
  const midiKeyboard = useConstant(() => new WebMidiSource(setMidiStatus));

  const inputListener = useConstant<NoteInputListener>(() => ({
    noteOn: (midi, velocity) => {
      void audio.init().then(() => audio.playNow(midi, velocity));
      stageRef.current?.state.playedNotes.add(midi);
      // Errar não bloqueia nem reinicia: só marca. Bloquear puniria justamente
      // quem está tateando a nota, que é o que se faz aprendendo.
      const pending = transport.getPendingGate();
      if (pending && !pending.required.includes(midi)) {
        stageRef.current?.state.wrongNotes.add(midi);
      }
      transport.notePressed(midi);
    },
    noteOff: (midi) => {
      stageRef.current?.state.playedNotes.delete(midi);
      stageRef.current?.state.wrongNotes.delete(midi);
    },
  }));

  useEffect(() => {
    const unsubscribe = [
      computerKeyboard.subscribe(inputListener),
      midiKeyboard.subscribe(inputListener),
    ];
    computerKeyboard.start();
    void midiKeyboard.start();
    return () => {
      for (const off of unsubscribe) off();
      computerKeyboard.stop();
      midiKeyboard.stop();
    };
  }, [computerKeyboard, midiKeyboard, inputListener]);

  // O modo espera precisa saber duas coisas: o que exigir do usuário, e o que o
  // teclado dele alcança. As duas mudam por configuração, não pela peça.
  useEffect(() => {
    if (!waitMode || !score) {
      transport.setWaitMode(null);
      return;
    }
    transport.setWaitMode({
      isRequired: (note) => youPlay === 'both' || note.hand === youPlay,
      isReachable: (midi) => isWithinRange(midi, keyboardSize),
    });
  }, [transport, waitMode, youPlay, keyboardSize, score]);

  useEffect(() => writePref('waitMode', waitMode), [waitMode]);
  useEffect(() => writePref('youPlay', youPlay), [youPlay]);
  useEffect(() => writePref('keyboardSize', keyboardSize), [keyboardSize]);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    stage.state.gate = gate;
    // Portão liberado limpa os erros: o vermelho é sobre o portão que passou.
    if (!gate) stage.state.wrongNotes.clear();
  }, [gate]);

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
    // `isRunning`, não `isPlaying`: parado num portão a sessão continua ativa.
    if (transport.isRunning) {
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
      } else if (event.code === 'ArrowRight') {
        event.preventDefault();
        transport.skipGate();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [togglePlay, transport]);

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
          {gate && (
            <div className="waiting-badge">
              <span className="waiting-label">aguardando</span>
              {gate.missing.map((midi) => (
                <span key={midi} className="waiting-note">
                  {midiToNoteName(midi, naming)}
                  <sub>{midiToOctave(midi)}</sub>
                </span>
              ))}
              <button onClick={() => transport.skipGate()} title="Atalho: seta para a direita">
                pular →
              </button>
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
              muted={mutedHands.has(hand) || playedByUser(waitMode, youPlay, hand)}
              // No modo espera quem decide o mudo é o "você toca": dois
              // controles disputando o mesmo efeito confundiriam.
              muteLocked={playedByUser(waitMode, youPlay, hand)}
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

        <div className="group midi-group">
          <MidiStatusLabel status={midiStatus} onRetry={() => void midiKeyboard.start()} />
          <label>
            Teclas
            <select
              value={keyboardSize}
              onChange={(e) => setKeyboardSize(Number(e.target.value) as KeyboardSize)}
              title="Notas fora do alcance do seu teclado contam como já tocadas"
            >
              {KEYBOARD_SIZES.map((size) => (
                <option key={size} value={size}>{size}</option>
              ))}
            </select>
          </label>
          <label className="check">
            <input
              type="checkbox"
              checked={waitMode}
              onChange={(e) => setWaitMode(e.target.checked)}
            />
            Modo espera
          </label>
          {waitMode && (
            <label>
              Você toca
              <select value={youPlay} onChange={(e) => setYouPlay(e.target.value as YouPlay)}>
                <option value="both">ambas</option>
                <option value="right">direita</option>
                <option value="left">esquerda</option>
              </select>
            </label>
          )}
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

/** A mão é do usuário quando o modo espera está ligado e o seletor a inclui. */
function playedByUser(waitMode: boolean, youPlay: YouPlay, hand: Hand): boolean {
  return waitMode && (youPlay === 'both' || hand === youPlay);
}

function MidiStatusLabel({ status, onRetry }: { status: MidiStatus; onRetry(): void }) {
  switch (status.kind) {
    case 'ready':
      return status.devices.length > 0 ? (
        <span className="midi-device" title="Teclado MIDI conectado">
          🎹 {status.devices.join(', ')}
        </span>
      ) : (
        <span className="hint">nenhum teclado MIDI</span>
      );
    case 'unsupported':
      return <span className="hint">MIDI indisponível neste navegador</span>;
    case 'denied':
      return (
        <button onClick={onRetry} title={status.message}>
          permitir MIDI
        </button>
      );
    case 'idle':
      return <span className="hint">procurando teclado…</span>;
  }
}

function HandToggle({
  hand,
  muted,
  muteLocked,
  hidden,
  onToggleMute,
  onToggleHide,
}: {
  hand: Hand;
  muted: boolean;
  muteLocked: boolean;
  hidden: boolean;
  onToggleMute(): void;
  onToggleHide(): void;
}) {
  return (
    <span className="hand-toggle">
      <span className="swatch" style={{ background: theme.hand[hand].fill }} />
      <span className="hand-name">{hand === 'right' ? 'D' : 'E'}</span>
      <button
        className={muted ? 'off' : ''}
        onClick={onToggleMute}
        disabled={muteLocked}
        title={muteLocked ? 'Silenciada porque é você quem toca esta mão' : 'Silenciar esta mão'}
      >
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
