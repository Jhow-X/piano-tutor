/**
 * Painel de partitura tradicional.
 *
 * Cada formato traz o próprio motor de gravação — Verovio para MusicXML, abcjs
 * para ABC — então a visão é uma estratégia por fonte atrás desta interface.
 * `.mid` não tem implementação: um arquivo MIDI não carrega grafia.
 */
export interface EngravingView {
  /** Realça o que soa neste instante da reprodução, em segundos. */
  highlight(seconds: number): void;
  dispose(): void;
}
