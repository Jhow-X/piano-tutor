/** Uma peça guardada no navegador, pronta para tocar sem rede. */
export interface LibraryEntry {
  /** Estável: vem do `CatalogItem`, ou de um hash do conteúdo para arquivos locais. */
  id: string;
  title: string;
  composer?: string;
  subtitle?: string;
  /** A extensão comanda o importador, então precisa ser preservada. */
  fileName: string;
  bytes: ArrayBuffer;
  origin: 'catalog' | 'local';
  /** Exigido pelas licenças CC BY das coleções; exibido junto da peça. */
  attribution?: string;
  license?: string;
  sourceUrl?: string;
  addedAt: number;
  lastOpenedAt?: number;
}

/** O mesmo, sem os bytes: o que a lista precisa para desenhar. */
export type LibrarySummary = Omit<LibraryEntry, 'bytes'> & { sizeBytes: number };
