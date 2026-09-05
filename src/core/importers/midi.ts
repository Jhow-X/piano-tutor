/**
 * `.mid` → `Score`.
 *
 * Este é o alvo comum dos três formatos: MusicXML e ABC são convertidos a MIDI
 * pelo Verovio/abcjs e passam por aqui, de modo que existe um único extrator de
 * notas em vez de três.
 */

import { Midi } from '@tonejs/midi';
import type { Engraving, Measure, Note, Score, TempoEvent, TimeSignatureEvent } from '../score';
import { assignHandsByPitch, handFromTrack } from '../hands';

export interface MidiImportOptions {
  title?: string;
  engraving?: Engraving;
  /** Desliga a heurística de altura; usado quando a fonte já traz as mãos. */
  skipPitchHeuristic?: boolean;
}

export function importMidi(data: ArrayBuffer | Uint8Array, options: MidiImportOptions = {}): Score {
  const midi = new Midi(data instanceof Uint8Array ? data : new Uint8Array(data));
  const ppq = midi.header.ppq || 480;
  const toBeats = (ticks: number) => ticks / ppq;

  const tempoMap = normalizeTempoMap(
    midi.header.tempos.map((t) => ({ beat: toBeats(t.ticks), bpm: t.bpm })),
  );
  const timeSignatures = normalizeTimeSignatures(
    midi.header.timeSignatures.map((ts) => ({
      beat: toBeats(ts.ticks),
      numerator: ts.timeSignature[0] ?? 4,
      denominator: ts.timeSignature[1] ?? 4,
    })),
  );

  const tracksWithNotes = midi.tracks.filter((t) => t.notes.length > 0);
  const notes: Note[] = [];

  tracksWithNotes.forEach((track, trackIndex) => {
    const trackHand = handFromTrack(track.name, trackIndex, tracksWithNotes.length);
    for (const note of track.notes) {
      notes.push({
        midi: note.midi,
        startBeat: toBeats(note.ticks),
        endBeat: toBeats(note.ticks + note.durationTicks),
        velocity: note.velocity,
        hand: trackHand ?? 'unknown',
        measure: 0, // preenchido abaixo, quando os compassos existirem
      });
    }
  });

  notes.sort((a, b) => a.startBeat - b.startBeat || a.midi - b.midi);

  const durationBeats = notes.reduce((max, n) => Math.max(max, n.endBeat), 0);
  const measures = buildMeasures(timeSignatures, durationBeats);
  assignMeasures(notes, measures);

  if (!options.skipPitchHeuristic) {
    assignHandsByPitch(notes);
  }

  const score: Score = {
    notes,
    measures,
    tempoMap,
    timeSignatures,
    durationBeats,
  };
  const title = options.title ?? midi.header.name;
  if (title) score.title = title;
  if (options.engraving) score.engraving = options.engraving;
  return score;
}

/**
 * Constrói a grade de compassos a partir das fórmulas de compasso. O comprimento
 * de um compasso em semínimas é `numerator * 4 / denominator`, então 6/8 dá 3
 * semínimas e 3/4 dá 3 — mesma duração, grades diferentes só na origem.
 */
export function buildMeasures(timeSignatures: TimeSignatureEvent[], durationBeats: number): Measure[] {
  const signatures = timeSignatures.length > 0
    ? timeSignatures
    : [{ beat: 0, numerator: 4, denominator: 4 }];

  const measures: Measure[] = [];
  let beat = 0;
  let index = 0;

  for (let i = 0; i < signatures.length; i++) {
    const signature = signatures[i]!;
    const next = signatures[i + 1];
    // Um compasso incompleto antes da próxima fórmula (anacruse, ou mudança de
    // compasso no meio) é truncado em vez de invadir a seção seguinte.
    const sectionEnd = next ? next.beat : Math.max(durationBeats, beat);
    const measureLength = (signature.numerator * 4) / signature.denominator;
    if (measureLength <= 0) continue;

    beat = Math.max(beat, signature.beat);
    while (beat < sectionEnd) {
      const end = Math.min(beat + measureLength, sectionEnd);
      measures.push({ index, startBeat: beat, endBeat: end });
      index++;
      beat = end;
    }
  }

  if (measures.length === 0) {
    measures.push({ index: 0, startBeat: 0, endBeat: Math.max(durationBeats, 4) });
  }
  return measures;
}

/** Cada nota pertence ao compasso onde ela *começa*. */
export function assignMeasures(notes: Note[], measures: Measure[]): void {
  if (measures.length === 0) return;
  let cursor = 0;
  for (const note of notes) {
    while (cursor < measures.length - 1 && note.startBeat >= measures[cursor]!.endBeat) {
      cursor++;
    }
    note.measure = measures[cursor]!.index;
  }
}

function normalizeTempoMap(events: TempoEvent[]): TempoEvent[] {
  const sorted = [...events].sort((a, b) => a.beat - b.beat).filter((e) => e.bpm > 0);
  if (sorted.length === 0 || sorted[0]!.beat > 0) {
    sorted.unshift({ beat: 0, bpm: sorted[0]?.bpm ?? 120 });
  }
  return sorted;
}

function normalizeTimeSignatures(events: TimeSignatureEvent[]): TimeSignatureEvent[] {
  const sorted = [...events]
    .sort((a, b) => a.beat - b.beat)
    .filter((e) => e.numerator > 0 && e.denominator > 0);
  if (sorted.length === 0 || sorted[0]!.beat > 0) {
    sorted.unshift({ beat: 0, numerator: 4, denominator: 4 });
  }
  return sorted;
}
