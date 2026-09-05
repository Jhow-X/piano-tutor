/**
 * Fonte de notas tocadas pelo usuário.
 *
 * Na v1 a única implementação é o teclado do computador. A Web MIDI entra
 * depois como uma segunda implementação desta mesma interface, sem tocar em
 * nada do resto — é por isso que a abstração existe agora, quando ainda custa
 * quase nada, em vez de depois.
 */

export interface NoteInputListener {
  noteOn(midi: number, velocity: number): void;
  noteOff(midi: number): void;
}

export interface NoteInputSource {
  readonly name: string;
  start(): void | Promise<void>;
  stop(): void;
  /** Retorna a função que cancela a inscrição. */
  subscribe(listener: NoteInputListener): () => void;
}

/** Base com a mecânica de inscrição, comum a todas as implementações. */
export abstract class BaseNoteInputSource implements NoteInputSource {
  abstract readonly name: string;
  private listeners = new Set<NoteInputListener>();

  abstract start(): void | Promise<void>;
  abstract stop(): void;

  subscribe(listener: NoteInputListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  protected emitNoteOn(midi: number, velocity: number): void {
    for (const listener of this.listeners) listener.noteOn(midi, velocity);
  }

  protected emitNoteOff(midi: number): void {
    for (const listener of this.listeners) listener.noteOff(midi);
  }
}
