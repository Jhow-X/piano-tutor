/**
 * thesession.org — ~50 mil melodias tradicionais irlandesas em ABC.
 *
 * Fonte ao vivo: a API libera CORS, então a busca vai direto ao servidor e não
 * precisa de índice local. Em compensação, ela **não informa o compasso** — o
 * JSON traz só o tipo da melodia (`reel`, `jig`, `slip jig`…) e a tonalidade num
 * formato próprio. O arquivo ABC precisa ser montado aqui.
 */

import type { CatalogItem, ScoreSource } from './types';

const API = 'https://thesession.org';
const SOURCE_ID = 'thesession';
const RESULTS_PER_PAGE = 30;

/**
 * Compasso por tipo de dança. O ABC do site é escrito assumindo estes valores;
 * sem eles a peça sai com a métrica errada e as barras de compasso não fecham.
 */
const METER_BY_TYPE: Record<string, string> = {
  reel: '4/4',
  hornpipe: '4/4',
  strathspey: '4/4',
  barndance: '4/4',
  march: '4/4',
  jig: '6/8',
  'slip jig': '9/8',
  slide: '12/8',
  polka: '2/4',
  waltz: '3/4',
  mazurka: '3/4',
  'three-two': '3/2',
};

const DEFAULT_METER = '4/4';
/** Convenção do site: os corpos ABC são escritos em colcheias. */
const DEFAULT_NOTE_LENGTH = '1/8';

const MODE_SUFFIX: Record<string, string> = {
  major: '',
  ionian: '',
  minor: 'm',
  aeolian: 'm',
  dorian: 'dor',
  mixolydian: 'mix',
  lydian: 'lyd',
  phrygian: 'phr',
  locrian: 'loc',
};

export interface SessionTune {
  name: string;
  type: string;
  /** Tonalidade no formato do site: "Edorian", "Gmajor", "Bbminor". */
  key: string;
  /** Corpo ABC, com `!` no lugar das quebras de linha. */
  abc: string;
  id: number;
}

/**
 * Monta um arquivo ABC completo a partir do que a API devolve.
 *
 * Função pura e exportada de propósito: é aqui que moram os bugs desta fonte, e
 * é o único ponto que dá para testar sem rede.
 */
export function buildAbc(tune: SessionTune): string {
  const meter = METER_BY_TYPE[tune.type.toLowerCase()] ?? DEFAULT_METER;
  const body = tune.abc.split('!').map((line) => line.trim()).filter(Boolean).join('\n');

  return [
    `X:1`,
    `T:${tune.name}`,
    ...(tune.type ? [`R:${tune.type}`] : []),
    `M:${meter}`,
    `L:${DEFAULT_NOTE_LENGTH}`,
    `K:${toAbcKey(tune.key)}`,
    body,
    '',
  ].join('\n');
}

/** "Edorian" → "Edor", "Gmajor" → "G", "Bbminor" → "Bbm". */
export function toAbcKey(key: string): string {
  const match = /^([A-G][b#]?)\s*(.*)$/.exec(key.trim());
  if (!match) return 'C';
  const [, root, mode] = match;
  const suffix = MODE_SUFFIX[(mode ?? '').toLowerCase()];
  // Modo desconhecido: manter o texto original em vez de inventar uma
  // tonalidade — o abcjs ignora o que não entende, e um palpite errado
  // transporia a peça.
  return `${root}${suffix ?? mode ?? ''}`;
}

interface SearchResponse {
  tunes?: { id: number; name: string; type: string; url?: string }[];
}

interface TuneResponse {
  id: number;
  name: string;
  type: string;
  settings?: { key: string; abc: string }[];
}

export class TheSessionSource implements ScoreSource {
  readonly id = SOURCE_ID;
  readonly label = 'The Session (tradicional irlandesa)';

  async search(query: string, signal: AbortSignal): Promise<CatalogItem[]> {
    const url = `${API}/tunes/search?q=${encodeURIComponent(query)}&format=json&perpage=${RESULTS_PER_PAGE}`;
    const response = await fetch(url, { signal });
    if (!response.ok) throw new Error(`The Session respondeu ${response.status}`);
    const data = (await response.json()) as SearchResponse;

    return (data.tunes ?? []).map((tune) => ({
      id: `${SOURCE_ID}:${tune.id}`,
      title: tune.name,
      subtitle: tune.type,
      format: 'abc' as const,
      sourceId: SOURCE_ID,
      sourceLabel: this.label,
      attribution: 'thesession.org — enviado pela comunidade',
      sourceUrl: tune.url ?? `${API}/tunes/${tune.id}`,
    }));
  }

  async fetchFile(item: CatalogItem, signal: AbortSignal): Promise<Uint8Array> {
    const tuneId = item.id.slice(SOURCE_ID.length + 1);
    const response = await fetch(`${API}/tunes/${tuneId}?format=json`, { signal });
    if (!response.ok) throw new Error(`The Session respondeu ${response.status}`);
    const data = (await response.json()) as TuneResponse;

    const setting = data.settings?.[0];
    if (!setting) throw new Error('Esta melodia não tem nenhuma versão em ABC.');

    return new TextEncoder().encode(
      buildAbc({ name: data.name, type: data.type, key: setting.key, abc: setting.abc, id: data.id }),
    );
  }
}
