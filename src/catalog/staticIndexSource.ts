/**
 * Fonte de catálogo servida por um índice estático.
 *
 * A busca é **local**, sobre um JSON gerado por `scripts/build-catalog.mts`.
 * Não é preguiça: a API do GitHub limita a 60 requisições por hora por IP, o que
 * inviabiliza busca ao vivo. Em troca, a busca fica instantânea e funciona
 * offline. O download em si vai ao `raw.githubusercontent.com`, que libera CORS
 * e não tem esse limite.
 */

import type { CatalogFormat, CatalogItem, ScoreSource } from './types';

export interface StaticIndexEntry {
  id: string;
  title: string;
  composer?: string;
  subtitle?: string;
  /** `owner/repo@branch/caminho` — compacto porque são centenas de entradas. */
  path: string;
}

export interface StaticIndex {
  generatedAt: string;
  /** Créditos e licença valem para a coleção inteira, não por peça. */
  attribution: string;
  license?: string;
  entries: StaticIndexEntry[];
}

export interface StaticSourceConfig {
  id: string;
  label: string;
  /** Caminho do índice, relativo à raiz do app. */
  indexPath: string;
  format: CatalogFormat;
}

const MAX_RESULTS = 60;

export class StaticIndexSource implements ScoreSource {
  readonly id: string;
  readonly label: string;

  private index: Promise<StaticIndex> | null = null;

  constructor(private readonly config: StaticSourceConfig) {
    this.id = config.id;
    this.label = config.label;
  }

  private loadIndex(signal: AbortSignal): Promise<StaticIndex> {
    if (!this.index) {
      const url = `${import.meta.env.BASE_URL}${this.config.indexPath}`;
      this.index = fetch(url, { signal }).then((response) => {
        if (!response.ok) throw new Error(`Índice indisponível (${response.status})`);
        return response.json() as Promise<StaticIndex>;
      });
      // Um índice que falhou não pode ficar em cache: a próxima busca deve
      // tentar de novo, e não repetir o erro para sempre.
      this.index.catch(() => { this.index = null; });
    }
    return this.index;
  }

  async search(query: string, signal: AbortSignal): Promise<CatalogItem[]> {
    const index = await this.loadIndex(signal);
    const terms = normalize(query).split(/\s+/).filter(Boolean);
    if (terms.length === 0) return [];

    const scored: { entry: StaticIndexEntry; score: number }[] = [];
    for (const entry of index.entries) {
      const haystack = normalize(`${entry.composer ?? ''} ${entry.title} ${entry.subtitle ?? ''}`);
      if (!terms.every((term) => haystack.includes(term))) continue;
      // Casar no começo vale mais do que casar no meio de um subtítulo.
      scored.push({ entry, score: haystack.indexOf(terms[0]!) });
    }

    return scored
      .sort((a, b) => a.score - b.score || a.entry.title.localeCompare(b.entry.title))
      .slice(0, MAX_RESULTS)
      .map(({ entry }) => this.toItem(entry, index));
  }

  async fetchFile(item: CatalogItem, signal: AbortSignal): Promise<Uint8Array> {
    const index = await this.loadIndex(signal);
    const entry = index.entries.find((candidate) => candidate.id === item.id);
    if (!entry) throw new Error('Peça não encontrada no índice do catálogo.');

    const response = await fetch(rawUrl(entry.path), { signal });
    if (!response.ok) throw new Error(`Falha ao baixar (${response.status})`);
    return new Uint8Array(await response.arrayBuffer());
  }

  private toItem(entry: StaticIndexEntry, index: StaticIndex): CatalogItem {
    const item: CatalogItem = {
      id: entry.id,
      title: entry.title,
      format: this.config.format,
      sourceId: this.id,
      sourceLabel: this.label,
      attribution: index.attribution,
      sourceUrl: githubUrl(entry.path),
    };
    if (entry.composer) item.composer = entry.composer;
    if (entry.subtitle) item.subtitle = entry.subtitle;
    if (index.license) item.license = index.license;
    return item;
  }
}

/** `owner/repo@branch/caminho` → URL de conteúdo cru (com CORS liberado). */
export function rawUrl(path: string): string {
  const { repo, branch, file } = splitPath(path);
  return `https://raw.githubusercontent.com/${repo}/${branch}/${file}`;
}

export function githubUrl(path: string): string {
  const { repo, branch, file } = splitPath(path);
  return `https://github.com/${repo}/blob/${branch}/${file}`;
}

export function splitPath(path: string): { repo: string; branch: string; file: string } {
  const [repo, rest] = path.split('@');
  const slash = rest!.indexOf('/');
  return { repo: repo!, branch: rest!.slice(0, slash), file: rest!.slice(slash + 1) };
}

/** Sem acentos e em minúsculas: buscar "handel" tem de achar "Händel". */
export function normalize(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}
