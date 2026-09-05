/**
 * O pacote `verovio` não publica tipos. Declaramos aqui só a parte da API que
 * este projeto usa, com os formatos confirmados empiricamente contra a v6.3.
 */

declare module 'verovio/wasm' {
  const createVerovioModule: () => Promise<unknown>;
  export default createVerovioModule;
}

/** Mesma API do módulo padrão, mais o suporte a Humdrum kern. */
declare module 'verovio/wasm-hum' {
  const createVerovioModule: () => Promise<unknown>;
  export default createVerovioModule;
}

declare module 'verovio/esm' {
  export interface MidiValues {
    pitch: number;
    /** Em milissegundos. */
    duration: number;
    /** Em milissegundos. */
    time: number;
  }

  export interface TimemapEntry {
    /** Posição em semínimas — a mesma unidade de `Note.startBeat`. */
    qstamp: number;
    /** Posição em milissegundos. */
    tstamp: number;
    on?: string[];
    off?: string[];
    restsOn?: string[];
    restsOff?: string[];
    measureOn?: string;
  }

  export interface ElementsAtTime {
    page: number;
    notes: string[];
    chords: string[];
    rests: string[];
    measure?: string;
  }

  export class VerovioToolkit {
    constructor(module: unknown);
    loadData(data: string): number;
    loadZipDataBuffer(data: ArrayBuffer): number;
    setOptions(options: Record<string, unknown>): void;
    getPageCount(): number;
    renderToSVG(page: number, xmlDeclaration?: boolean): string;
    renderToMIDI(): string;
    renderToTimemap(options?: Record<string, unknown>): TimemapEntry[];
    getMIDIValuesForElement(xmlId: string): MidiValues;
    getElementsAtTime(millisec: number): ElementsAtTime;
    getMEI(options?: Record<string, unknown>): string;
    redoLayout(options?: Record<string, unknown>): void;
  }
}
