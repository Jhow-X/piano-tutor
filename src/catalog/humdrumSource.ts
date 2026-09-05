/**
 * Coleções Humdrum de Craig Sapp, hospedadas no GitHub.
 *
 * A busca é **local**, sobre um índice gerado por `scripts/build-catalog.mts`.
 * Não é preguiça: a API do GitHub limita a 60 requisições por hora por IP, o que
 * inviabiliza busca ao vivo. Em troca, a busca fica instantânea e funciona
 * offline. O download em si vai ao `raw.githubusercontent.com`, que libera CORS
 * e não tem esse limite.
 */

import type { CatalogItem, ScoreSource } from './types';

const SOURCE_ID = 'humdrum';
const INDEX_URL = `${import.meta.env.BASE_URL}catalog/humdrum.json`;

export interface HumdrumIndexEntry {
  id: string;
  title: string;
  composer?: string;
  subtitle?: string;
  /** `owner/repo@branch/caminho.krn` — compacto porque são ~900 entradas. */
  path: string;
}

export interface HumdrumIndex {
  generatedAt: string;
  /** A licença é a mesma para toda a coleção, então vive aqui e não por peça. */
  attribution: string;
  license: string;
  entries: HumdrumIndexEntry[];
}

const MAX_RESULTS = 60;

export class HumdrumSource implements ScoreSource {
  readonly id = SOURCE_ID;
  readonly label = 'Coleções Humdrum (piano clássico)';

  private index: Promise<HumdrumIndex> | null = null;

  private loadIndex(signal: AbortSignal): Promise<HumdrumIndex> {
    if (!this.index) {
      this.index = fetch(INDEX_URL, { signal }).then((response) => {
        if (!response.ok) throw new Error(`Índice do catálogo indisponível (${response.status})`);
        return response.json() as Promise<HumdrumIndex>;
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

    const scored: { entry: HumdrumIndexEntry; score: number }[] = [];
    for (const entry of index.entries) {
      const haystack = normalize(`${entry.composer ?? ''} ${entry.title} ${entry.subtitle ?? ''}`);
      if (!terms.every((term) => haystack.includes(term))) continue;
      // Casar no começo do título vale mais do que casar no meio de um subtítulo.
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

  private toItem(entry: HumdrumIndexEntry, index: HumdrumIndex): CatalogItem {
    const attribution = index.attribution;
    const item: CatalogItem = {
      id: entry.id,
      title: entry.title,
      format: 'krn',
      sourceId: SOURCE_ID,
      sourceLabel: this.label,
      attribution,
      license: index.license,
      sourceUrl: githubUrl(entry.path),
    };
    if (entry.composer) item.composer = entry.composer;
    if (entry.subtitle) item.subtitle = entry.subtitle;
    return item;
  }
}

/** `owner/repo@branch/caminho` → URL de conteúdo cru (com CORS liberado). */
export function rawUrl(path: string): string {
  const [repo, rest] = path.split('@');
  const slash = rest!.indexOf('/');
  return `https://raw.githubusercontent.com/${repo}/${rest!.slice(0, slash)}/${rest!.slice(slash + 1)}`;
}

export function githubUrl(path: string): string {
  const [repo, rest] = path.split('@');
  const slash = rest!.indexOf('/');
  return `https://github.com/${repo}/blob/${rest!.slice(0, slash)}/${rest!.slice(slash + 1)}`;
}

/** Sem acentos e em minúsculas: buscar "handel" tem de achar "Händel". */
export function normalize(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}
