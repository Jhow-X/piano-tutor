/**
 * Catálogo: buscar partituras em repositórios públicos e trazê-las para dentro
 * do app.
 *
 * Só entram fontes que liberam CORS — o app é estático e sem backend, então o
 * navegador bloqueia qualquer outra. Isso deixa o IMSLP e o MuseScore de fora;
 * incluí-los exigiria um proxy, ou seja, um servidor.
 */

/** Formatos que `importFile` sabe abrir. A extensão comanda o roteamento. */
export type CatalogFormat = 'krn' | 'abc' | 'musicxml' | 'mxl' | 'mid';

export interface CatalogItem {
  /** Estável entre buscas: vira a chave da peça na biblioteca. */
  id: string;
  title: string;
  composer?: string;
  /** Movimento, andamento, tipo de dança — o que distingue itens de mesmo título. */
  subtitle?: string;
  format: CatalogFormat;
  sourceId: string;
  sourceLabel: string;
  /** Exibido junto da peça; exigido pelas licenças CC BY das coleções. */
  attribution: string;
  license?: string;
  /** Página de origem, para o usuário conferir a procedência. */
  sourceUrl?: string;
}

export interface ScoreSource {
  readonly id: string;
  readonly label: string;
  search(query: string, signal: AbortSignal): Promise<CatalogItem[]>;
  fetchFile(item: CatalogItem, signal: AbortSignal): Promise<Uint8Array>;
}

/** Nome de arquivo que faz `importFile` escolher o importador certo. */
export function fileNameFor(item: CatalogItem): string {
  const safe = `${item.composer ? `${item.composer} - ` : ''}${item.title}`
    .replace(/[/\\?%*:|"<>]/g, '-')
    .slice(0, 120);
  return `${safe}.${item.format}`;
}
