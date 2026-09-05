/**
 * Registros de referência do Humdrum (`!!!XXX: valor`).
 *
 * Usado pelo script que gera o índice do catálogo, e testado aqui em vez de lá
 * porque é a parte com regras de verdade: os campos vêm com HTML e entidades
 * (`K<sup>1</sup> 279`, `Breitkopf &amp; H&auml;rtel`) que precisam ser limpos
 * na geração — deixar isso para a exibição espalharia o problema pela UI.
 */

export interface KernMetadata {
  composer?: string;
  title?: string;
  movementNumber?: string;
  movementName?: string;
  catalog?: string;
  /** Número na coleção — os corais de Bach são identificados assim. */
  pieceNumber?: string;
}

/** Só o começo do arquivo interessa; o resto são as notas. */
export function parseKernHeaders(text: string): KernMetadata {
  const records = new Map<string, string>();
  for (const line of text.split('\n')) {
    if (!line.startsWith('!!!')) {
      // Os registros ficam no topo e no rodapé, mas os que usamos estão todos
      // no topo — parar na primeira linha de dados evita varrer o arquivo todo.
      if (line.startsWith('**')) break;
      continue;
    }
    const match = /^!!!([^:]+):\s*(.*)$/.exec(line);
    if (!match) continue;
    // Chaves podem trazer sufixo de idioma (`OTL@@DE`, `YOR1`): os corais de
    // Bach só têm o título nessa forma, e ignorá-la deixaria 370 peças sem nome.
    const key = match[1]!.trim().replace(/@@?[A-Z]{2,3}$/, '');
    // O primeiro registro de cada tipo vence: `!!!OTL` repetido descreve
    // traduções do título, não o título principal.
    if (!records.has(key)) records.set(key, clean(match[2] ?? ''));
  }

  const result: KernMetadata = {};
  const put = (field: keyof KernMetadata, key: string) => {
    const value = records.get(key);
    if (value) result[field] = value;
  };
  put('composer', 'COM');
  put('title', 'OTL');
  put('movementNumber', 'OMV');
  put('movementName', 'OMD');
  put('pieceNumber', 'PC#');
  // `SCT1` nas sonatas (que têm dois sistemas de catálogo), `SCT` nos corais.
  put('catalog', records.has('SCT1') ? 'SCT1' : 'SCT');
  return result;
}

/**
 * O título já traz esta referência de catálogo?
 *
 * Heurística, porque os dados da fonte são inconsistentes: as sonatas de
 * Scarlatti misturam a numeração Longo e a Kirkpatrick, e o mesmo número
 * aparece com prefixos diferentes ("L.240" no título, "K. 240" no registro).
 * Comparar só os dígitos pega esses casos sem descartar catálogos legítimos,
 * que trazem números que o título não menciona.
 */
function containsCatalog(title: string, catalog: string): boolean {
  const squash = (text: string) => text.toLowerCase().replace(/[^a-z0-9]/g, '');
  const digits = (text: string) => text.replace(/\D/g, '');
  if (squash(title).includes(squash(catalog))) return true;
  const catalogDigits = digits(catalog);
  return catalogDigits.length > 0 && digits(title).includes(catalogDigits);
}

const ENTITIES: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
  auml: 'ä', ouml: 'ö', uuml: 'ü', Auml: 'Ä', Ouml: 'Ö', Uuml: 'Ü', szlig: 'ß',
  eacute: 'é', egrave: 'è', agrave: 'à', ccedil: 'ç', uacute: 'ú', oacute: 'ó',
};

/** Remove marcação e decodifica entidades: `K<sup>1</sup> 279` → `K1 279`. */
export function clean(value: string): string {
  return value
    .replace(/<[^>]*>/g, '')
    // Alguns campos trazem a *sequência* "\n" literal, e não uma quebra de
    // linha — ela apareceria crua no meio do título.
    .replace(/\\[nrt]/g, ' ')
    .replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (whole, code: string) => {
      if (code.startsWith('#')) {
        const point = code[1]?.toLowerCase() === 'x'
          ? Number.parseInt(code.slice(2), 16)
          : Number.parseInt(code.slice(1), 10);
        return Number.isFinite(point) ? String.fromCodePoint(point) : whole;
      }
      return ENTITIES[code] ?? whole;
    })
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Compositor no formato "Sobrenome, Nome" → "Nome Sobrenome".
 * O Humdrum usa a forma catalográfica; para ler na tela a natural é melhor.
 */
export function displayComposer(composer: string): string {
  const match = /^([^,]+),\s*(.+)$/.exec(composer);
  return match ? `${match[2]!.trim()} ${match[1]!.trim()}` : composer;
}

/** Junta título, número de catálogo e movimento no rótulo que aparece na busca. */
export function describeKern(meta: KernMetadata, fallbackTitle: string): {
  title: string;
  subtitle?: string;
} {
  // Sem `!!!OTL`, o número na coleção ainda dá um nome melhor que "chor050".
  const named = meta.title
    ?? (meta.pieceNumber ? `Coral ${meta.pieceNumber}` : undefined)
    ?? fallbackTitle;
  // O catálogo às vezes já vem dentro do título ("Sonata in D major, L.334,
  // K.122"); repeti-lo produziria "…, K.122, K. 122".
  const catalog = meta.catalog && !containsCatalog(named, meta.catalog) ? meta.catalog : undefined;
  const title = [named, catalog].filter(Boolean).join(', ');
  const subtitle = [
    meta.movementNumber ? `mov. ${meta.movementNumber}` : undefined,
    meta.movementName?.replace(/\.$/, ''),
  ]
    .filter(Boolean)
    .join(' — ');
  return subtitle ? { title, subtitle } : { title };
}
