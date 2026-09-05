/** Fontes disponíveis, na ordem em que aparecem na busca. */

import { HumdrumSource } from './humdrumSource';
import { TheSessionSource } from './theSessionSource';
import type { CatalogItem, ScoreSource } from './types';

export const SOURCES: ScoreSource[] = [new HumdrumSource(), new TheSessionSource()];

export interface SearchOutcome {
  items: CatalogItem[];
  /** Fontes que falharam, para a UI dizer o que não respondeu em vez de omitir. */
  failures: { sourceLabel: string; message: string }[];
}

/**
 * Busca em todas as fontes ao mesmo tempo. Uma fonte fora do ar não pode
 * derrubar as outras — offline, a busca local Humdrum ainda funciona enquanto o
 * thesession, que depende de rede, falha.
 */
export async function searchAll(
  query: string,
  sourceIds: string[],
  signal: AbortSignal,
): Promise<SearchOutcome> {
  const chosen = SOURCES.filter((source) => sourceIds.includes(source.id));
  const settled = await Promise.allSettled(
    chosen.map((source) => source.search(query, signal)),
  );

  const items: CatalogItem[] = [];
  const failures: SearchOutcome['failures'] = [];
  settled.forEach((result, index) => {
    const source = chosen[index]!;
    if (result.status === 'fulfilled') items.push(...result.value);
    else if (!signal.aborted) {
      failures.push({
        sourceLabel: source.label,
        message: result.reason instanceof Error ? result.reason.message : String(result.reason),
      });
    }
  });
  return { items, failures };
}

export function sourceById(id: string): ScoreSource | undefined {
  return SOURCES.find((source) => source.id === id);
}

export type { CatalogItem, ScoreSource } from './types';
export { fileNameFor } from './types';
