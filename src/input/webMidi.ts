/**
 * Teclado MIDI físico, via Web MIDI API.
 *
 * Segunda implementação de `NoteInputSource` — a primeira é o teclado do
 * computador. Nada fora deste arquivo precisou mudar para acomodá-la, que era o
 * propósito de a interface existir desde a v1.
 *
 * Disponibilidade: Chrome, Edge e Firefox. Safari não implementa a API, e o
 * usuário precisa ser informado disso em vez de ficar diante de um controle que
 * simplesmente não reage.
 */

import { BaseNoteInputSource } from './NoteInputSource';
import { parseMidiMessage, velocityToGain } from './midiMessage';

/**
 * Portas de loopback que os sistemas criam sozinhos e que nunca são o
 * instrumento do usuário — "Midi Through" é a do ALSA, presente em todo Linux.
 */
const VIRTUAL_PORT_PATTERN = /midi through|through port/i;

export type MidiStatus =
  | { kind: 'idle' }
  | { kind: 'unsupported' }
  | { kind: 'denied'; message: string }
  | { kind: 'ready'; devices: string[] };

export class WebMidiSource extends BaseNoteInputSource {
  readonly name = 'Teclado MIDI';

  private access: MIDIAccess | null = null;
  private attached: MIDIInput[] = [];
  private status: MidiStatus = { kind: 'idle' };

  constructor(private readonly onStatusChange?: (status: MidiStatus) => void) {
    super();
  }

  getStatus(): MidiStatus {
    return this.status;
  }

  async start(): Promise<void> {
    if (this.access) return;
    if (typeof navigator === 'undefined' || !navigator.requestMIDIAccess) {
      this.setStatus({ kind: 'unsupported' });
      return;
    }
    try {
      // `sysex: false` mantém o pedido no nível de permissão mais brando; nada
      // aqui precisa de system exclusive.
      this.access = await navigator.requestMIDIAccess({ sysex: false });
    } catch (cause) {
      this.setStatus({
        kind: 'denied',
        message: cause instanceof Error ? cause.message : String(cause),
      });
      return;
    }
    this.access.onstatechange = () => this.attachInputs();
    this.attachInputs();
  }

  stop(): void {
    this.detachInputs();
    if (this.access) this.access.onstatechange = null;
    this.access = null;
    this.setStatus({ kind: 'idle' });
  }

  /**
   * Escuta todas as entradas: com um teclado só, escolher qual seria atrito à toa.
   * As portas virtuais continuam ligadas (não custa nada), mas ficam fora da
   * lista mostrada — o usuário quer ver o instrumento dele, não o encanamento.
   */
  private attachInputs(): void {
    if (!this.access) return;
    this.detachInputs();
    for (const input of this.access.inputs.values()) {
      input.onmidimessage = this.handleMessage;
      this.attached.push(input);
    }
    this.setStatus({
      kind: 'ready',
      devices: this.attached
        .map((input) => input.name ?? 'Dispositivo sem nome')
        .filter((name) => !VIRTUAL_PORT_PATTERN.test(name)),
    });
  }

  private detachInputs(): void {
    for (const input of this.attached) input.onmidimessage = null;
    this.attached = [];
  }

  private handleMessage = (event: MIDIMessageEvent): void => {
    if (!event.data) return;
    const message = parseMidiMessage(event.data);
    switch (message.kind) {
      case 'noteOn':
        this.emitNoteOn(message.midi, velocityToGain(message.velocity));
        break;
      case 'noteOff':
        this.emitNoteOff(message.midi);
        break;
      case 'allNotesOff':
        this.emitAllNotesOff();
        break;
      case 'ignored':
        break;
    }
  };

  private setStatus(status: MidiStatus): void {
    this.status = status;
    this.onStatusChange?.(status);
  }
}
