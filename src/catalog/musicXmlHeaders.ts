/**
 * Metadados de um arquivo MusicXML.
 *
 * Usado pelo script que gera o índice do catálogo, e testado aqui porque tem
 * regras de verdade: os arquivos do MuseTrainer são exportações do MuseScore, e
 * trazem o compositor com as datas de vida grudadas ("Claude Achille
 * Debussy(1862–1918)"), o que polui a listagem.
 */

export interface MusicXmlMetadata {
  title?: string;
  composer?: string;
}

export function parseMusicXmlHeaders(xml: string): MusicXmlMetadata {
  const result: MusicXmlMetadata = {};
  // `work-title` é o campo canônico; `movement-title` é o recurso de quem
  // exportou sem preencher a obra, o que acontece bastante no MuseScore.
  const title =
    tagText(xml, 'work-title') ?? tagText(xml, 'movement-title') ?? undefined;
  const composer = attributedText(xml, 'creator', 'composer');
  if (title) result.title = title;
  const cleaned = composer ? cleanComposer(composer) : '';
  // Quem envia partitura ao MuseScore costuma pôr o próprio crédito de arranjo
  // no campo de compositor. Mostrar "Arranged by Fulano" como autor de "Happy
  // Birthday" seria pior do que não mostrar autor nenhum.
  if (cleaned && !isArrangerCredit(cleaned)) result.composer = cleaned;
  return result;
}

// Sem `\b` no fim: depois de um ponto não existe fronteira de palavra, e
// "arr. Verona" escaparia do filtro.
const ARRANGER_CREDIT = /^(arr\b\.?|arranged\s+by|transcri(bed|ption)\s+by|adapted\s+by)/i;

export function isArrangerCredit(value: string): boolean {
  return ARRANGER_CREDIT.test(value.trim());
}

/** Remove as datas de vida coladas no nome: "Debussy(1862–1918)" → "Debussy". */
export function cleanComposer(value: string): string {
  return decode(value)
    .replace(/\s*\((?:[^()]*\d{3,4}[^()]*)\)\s*$/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function tagText(xml: string, tag: string): string | undefined {
  const match = new RegExp(`<${tag}[^>]*>([^<]*)</${tag}>`).exec(xml);
  const text = match?.[1] ? decode(match[1]).trim() : '';
  return text || undefined;
}

function attributedText(xml: string, tag: string, type: string): string | undefined {
  const match = new RegExp(`<${tag}\\b[^>]*type="${type}"[^>]*>([^<]*)</${tag}>`).exec(xml);
  const text = match?.[1] ? match[1].trim() : '';
  return text || undefined;
}

const ENTITIES: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'",
};

function decode(value: string): string {
  return value.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (whole, code: string) => {
    if (code.startsWith('#')) {
      const point = code[1]?.toLowerCase() === 'x'
        ? Number.parseInt(code.slice(2), 16)
        : Number.parseInt(code.slice(1), 10);
      return Number.isFinite(point) ? String.fromCodePoint(point) : whole;
    }
    return ENTITIES[code] ?? whole;
  });
}

/** "Canon_in_D_easy.mxl" → "Canon in D easy", para quando não há `work-title`. */
export function titleFromFileName(fileName: string): string {
  return fileName
    .replace(/\.[^.]+$/, '')
    .replace(/[_+]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
