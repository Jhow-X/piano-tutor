/**
 * Modelo interno de uma peça. Independente de renderer, áudio e React.
 *
 * O tempo canônico é medido em *beats*, onde 1 beat = 1 semínima (quarter note),
 * seguindo a convenção do MIDI (PPQ = ticks por semínima). Segundos são sempre
 * derivados sob demanda via `tempoMap` — isso é o que torna a mudança de
 * velocidade de reprodução um simples multiplicador em vez de uma reescrita
 * da linha do tempo.
 */

export type Hand = 'left' | 'right' | 'unknown';

export interface Note {
  midi: number; // 21..108 num piano de 88 teclas
  startBeat: number;
  endBeat: number;
  velocity: number; // 0..1
  hand: Hand;
  finger?: number; // dedilhado do MusicXML, quando houver
  measure: number; // índice em `Score.measures`
}

export interface Measure {
  index: number;
  startBeat: number;
  endBeat: number;
}

export interface TempoEvent {
  beat: number;
  bpm: number; // semínimas por minuto
}

export interface TimeSignatureEvent {
  beat: number;
  numerator: number;
  denominator: number;
}

/** O motor capaz de gravar esta peça, e o que ele precisa para isso. */
export type Engraving =
  /** O Verovio guarda os dados carregados no próprio toolkit. */
  | { kind: 'verovio' }
  | { kind: 'abc'; source: string };

export interface Score {
  notes: Note[]; // ordenado por startBeat, depois por midi
  measures: Measure[];
  tempoMap: TempoEvent[]; // ordenado por beat, sempre com um evento em beat 0
  timeSignatures: TimeSignatureEvent[]; // ordenado por beat, sempre com um evento em beat 0
  title?: string;
  /**
   * Ausente para `.mid`: um arquivo MIDI não carrega grafia (sem enarmonia,
   * armadura confiável nem divisão visual de compasso), então não há partitura
   * tradicional a exibir. Quando presente, diz *qual* motor sabe desenhá-la.
   */
  engraving?: Engraving;
  durationBeats: number;
}

export const PIANO_LOWEST_MIDI = 21; // A0
export const PIANO_HIGHEST_MIDI = 108; // C8

/** Converte uma posição em beats para segundos, integrando sobre o mapa de andamento. */
export function beatToSeconds(beat: number, tempoMap: TempoEvent[]): number {
  if (tempoMap.length === 0) return (beat * 60) / 120;

  let seconds = 0;
  let cursor = 0;
  let bpm = tempoMap[0]!.bpm;

  for (const event of tempoMap) {
    if (event.beat >= beat) break;
    if (event.beat > cursor) {
      seconds += ((event.beat - cursor) * 60) / bpm;
      cursor = event.beat;
    }
    bpm = event.bpm;
  }

  seconds += ((beat - cursor) * 60) / bpm;
  return seconds;
}

/** Inverso de `beatToSeconds`. */
export function secondsToBeat(seconds: number, tempoMap: TempoEvent[]): number {
  if (tempoMap.length === 0) return (seconds * 120) / 60;

  let elapsed = 0;
  let cursorBeat = 0;
  let bpm = tempoMap[0]!.bpm;

  for (const event of tempoMap) {
    if (event.beat <= cursorBeat) {
      bpm = event.bpm;
      continue;
    }
    const segmentSeconds = ((event.beat - cursorBeat) * 60) / bpm;
    if (elapsed + segmentSeconds >= seconds) {
      return cursorBeat + ((seconds - elapsed) * bpm) / 60;
    }
    elapsed += segmentSeconds;
    cursorBeat = event.beat;
    bpm = event.bpm;
  }

  return cursorBeat + ((seconds - elapsed) * bpm) / 60;
}

/** Notas que soam em qualquer instante da janela [startBeat, endBeat). */
export function notesInBeatRange(score: Score, startBeat: number, endBeat: number): Note[] {
  return score.notes.filter((n) => n.endBeat > startBeat && n.startBeat < endBeat);
}

export function measureAtBeat(score: Score, beat: number): Measure | undefined {
  return score.measures.find((m) => beat >= m.startBeat && beat < m.endBeat);
}

const SHARP_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] as const;
const SOLFEGE_NAMES = ['Dó', 'Dó#', 'Ré', 'Ré#', 'Mi', 'Fá', 'Fá#', 'Sol', 'Sol#', 'Lá', 'Lá#', 'Si'] as const;

export type NoteNaming = 'letters' | 'solfege';

export function midiToNoteName(midi: number, naming: NoteNaming = 'letters'): string {
  const names = naming === 'solfege' ? SOLFEGE_NAMES : SHARP_NAMES;
  return names[((midi % 12) + 12) % 12]!;
}

export function midiToOctave(midi: number): number {
  return Math.floor(midi / 12) - 1;
}

/** Uma tecla preta do piano (as cinco alterações dentro da oitava). */
export function isBlackKey(midi: number): boolean {
  const pc = ((midi % 12) + 12) % 12;
  return pc === 1 || pc === 3 || pc === 6 || pc === 8 || pc === 10;
}
