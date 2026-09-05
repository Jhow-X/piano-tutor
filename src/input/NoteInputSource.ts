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
  /**
   * Notas cujo `noteOn` foi emitido e ainda não teve `noteOff`. Rastreadas aqui,
   * e não em cada implementação, para que soltar tudo de uma vez seja sempre
   * consistente — é o que impede notas presas quando a janela perde o foco ou
   * quando o instrumento manda "all notes off".
   */
  private sounding = new Set<number>();

  abstract start(): void | Promise<void>;
  abstract stop(): void;

  subscribe(listener: NoteInputListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  protected emitNoteOn(midi: number, velocity: number): void {
    this.sounding.add(midi);
    for (const listener of this.listeners) listener.noteOn(midi, velocity);
  }

  protected emitNoteOff(midi: number): void {
    this.sounding.delete(midi);
    for (const listener of this.listeners) listener.noteOff(midi);
  }

  /** Solta tudo que ainda soa, uma nota por vez — os ouvintes não veem diferença. */
  protected emitAllNotesOff(): void {
    for (const midi of [...this.sounding]) this.emitNoteOff(midi);
  }
}
