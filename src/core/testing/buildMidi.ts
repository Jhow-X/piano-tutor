/**
 * Construção de arquivos MIDI em memória para os testes.
 *
 * Fixtures gerados, e não baixados, para que os testes sejam determinísticos e
 * rodem offline. Os arquivos reais (com repetições, tercinas e mudança de
 * compasso) ficam em `test-fixtures/` e são conferidos manualmente.
 */

import { Midi } from '@tonejs/midi';

export interface TrackSpec {
  name?: string;
  /** [midi, beat inicial, duração em beats] */
  notes: [number, number, number][];
}

export interface MidiSpec {
  ppq?: number;
  bpm?: number;
  timeSignature?: [number, number];
  tracks: TrackSpec[];
}

export function buildMidi(spec: MidiSpec): Uint8Array {
  const midi = new Midi();
  const ppq = spec.ppq ?? 480;
  const [numerator, denominator] = spec.timeSignature ?? [4, 4];
  // `header.ppq` só tem getter; a única via pública de defini-lo é `fromJSON`.
  midi.header.fromJSON({
    name: '',
    ppq,
    meta: [],
    tempos: [{ ticks: 0, bpm: spec.bpm ?? 120 }],
    timeSignatures: [{ ticks: 0, timeSignature: [numerator, denominator] }],
    keySignatures: [],
  });

  for (const trackSpec of spec.tracks) {
    const track = midi.addTrack();
    if (trackSpec.name) track.name = trackSpec.name;
    for (const [note, startBeat, durationBeats] of trackSpec.notes) {
      track.addNote({
        midi: note,
        ticks: Math.round(startBeat * ppq),
        durationTicks: Math.round(durationBeats * ppq),
        velocity: 0.8,
      });
    }
  }

  return midi.toArray();
}
