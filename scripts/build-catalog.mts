/**
 * Gera `public/catalog/humdrum.json`, o índice de busca do catálogo.
 *
 * Rodado à mão (`npm run catalog`), não no build: depende da rede e da API do
 * GitHub, que limita a 60 requisições por hora. Prender o build a isso deixaria
 * o projeto refém de um serviço externo.
 *
 * Por padrão reaproveita os caminhos do índice anterior e só rebusca os
 * metadados — assim corrigir o parser não gasta cota de API, porque a lista de
 * arquivos raramente muda. Use `--refresh` para relistar os repositórios.
 *
 * Uso: npm run catalog [-- --refresh]
 *      GITHUB_TOKEN=… npm run catalog -- --refresh   (limite de 5000/hora)
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describeKern, displayComposer, parseKernHeaders } from '../src/catalog/kernHeaders.ts';
import type { HumdrumIndex, HumdrumIndexEntry } from '../src/catalog/humdrumSource.ts';

const ROOT = dirname(fileURLToPath(import.meta.url)) + '/..';
const OUTPUT = `${ROOT}/public/catalog/humdrum.json`;

/** Coleções de teclado do Craig Sapp. Todas CC BY-NC-SA 4.0. */
const REPOS = [
  'craigsapp/mozart-piano-sonatas',
  'craigsapp/beethoven-piano-sonatas',
  'craigsapp/haydn-piano-sonatas',
  'craigsapp/scarlatti-keyboard-sonatas',
  'craigsapp/joplin',
  'craigsapp/chopin-preludes',
  'craigsapp/chopin-mazurkas',
  'craigsapp/hummel-preludes',
  'craigsapp/bach-370-chorales',
];

const ATTRIBUTION = 'Edições digitais de Craig Stuart Sapp';
/**
 * A licença é a mesma em toda a coleção, então fica no nível do índice. Ela vive
 * no registro `!!!YEM` de cada arquivo, mas no *rodapé* — fora dos primeiros 4KB
 * que baixamos, e não vale baixar arquivos inteiros para reler uma constante.
 */
const LICENSE = 'CC BY-NC-SA 4.0';
/** Baixar 900 arquivos inteiros seria desnecessário: os metadados estão no topo. */
const HEADER_BYTES = 4096;
const CONCURRENCY = 8;

async function main(): Promise<void> {
  const refresh = process.argv.includes('--refresh');
  const known = refresh ? null : await readPreviousPaths();
  if (known) {
    console.log(`reaproveitando os caminhos do índice anterior (--refresh para relistar)\n`);
  }

  const entries: HumdrumIndexEntry[] = [];

  for (const repo of REPOS) {
    process.stdout.write(`${repo}… `);
    const cached = known?.get(repo);
    const [branch, paths] = cached
      ? [cached.branch, cached.paths]
      : await listFromGitHub(repo);
    const built = await mapWithConcurrency(paths, CONCURRENCY, (path) =>
      buildEntry(repo, branch, path),
    );
    const ok = built.filter((entry): entry is HumdrumIndexEntry => entry !== null);
    entries.push(...ok);
    console.log(`${ok.length}/${paths.length} peças`);
  }

  entries.sort((a, b) =>
    (a.composer ?? '').localeCompare(b.composer ?? '') || a.title.localeCompare(b.title),
  );

  const index: HumdrumIndex = {
    generatedAt: new Date().toISOString().slice(0, 10),
    attribution: ATTRIBUTION,
    license: LICENSE,
    entries,
  };
  await mkdir(dirname(OUTPUT), { recursive: true });
  await writeFile(OUTPUT, JSON.stringify(index));
  const kb = Math.round((await import('node:fs')).statSync(OUTPUT).size / 1024);
  console.log(`\n${entries.length} peças em ${OUTPUT} (${kb}KB)`);
}

async function listFromGitHub(repo: string): Promise<[string, string[]]> {
  const branch = await defaultBranch(repo);
  return [branch, await listKernFiles(repo, branch)];
}

/** Caminhos do índice anterior, agrupados por repositório. */
async function readPreviousPaths(): Promise<Map<string, { branch: string; paths: string[] }> | null> {
  let previous: HumdrumIndex;
  try {
    previous = JSON.parse(await readFile(OUTPUT, 'utf8')) as HumdrumIndex;
  } catch {
    return null;
  }
  const byRepo = new Map<string, { branch: string; paths: string[] }>();
  for (const entry of previous.entries) {
    // `owner/repo@branch/caminho`
    const [repo, rest] = entry.path.split('@');
    const slash = rest!.indexOf('/');
    const branch = rest!.slice(0, slash);
    const bucket = byRepo.get(repo!) ?? { branch, paths: [] };
    bucket.paths.push(rest!.slice(slash + 1));
    byRepo.set(repo!, bucket);
  }
  // Um repositório novo em REPOS não está no índice antigo: aí não dá para
  // reaproveitar nada e vale relistar tudo.
  return REPOS.every((repo) => byRepo.has(repo)) ? byRepo : null;
}

async function defaultBranch(repo: string): Promise<string> {
  const response = await fetch(`https://api.github.com/repos/${repo}`, { headers: ghHeaders() });
  if (response.status === 403 || response.status === 429) {
    const reset = response.headers.get('x-ratelimit-reset');
    const when = reset ? new Date(Number(reset) * 1000).toLocaleTimeString('pt-BR') : 'em breve';
    throw new Error(
      `limite da API do GitHub atingido (libera às ${when}). ` +
        'Rode sem --refresh para reaproveitar os caminhos, ou defina GITHUB_TOKEN.',
    );
  }
  if (!response.ok) throw new Error(`${repo}: API do GitHub respondeu ${response.status}`);
  const data = (await response.json()) as { default_branch?: string };
  // Estes repos migraram para `main`; pedir a árvore de `master` responde 404.
  return data.default_branch ?? 'main';
}

async function listKernFiles(repo: string, branch: string): Promise<string[]> {
  const url = `https://api.github.com/repos/${repo}/git/trees/${branch}?recursive=1`;
  const response = await fetch(url, { headers: ghHeaders() });
  if (!response.ok) throw new Error(`${repo}: árvore respondeu ${response.status}`);
  const data = (await response.json()) as {
    tree?: { path: string; type: string }[];
    truncated?: boolean;
  };
  if (data.truncated) {
    console.warn(`\n  aviso: a árvore de ${repo} veio truncada; faltarão peças`);
  }
  return (data.tree ?? [])
    .filter((node) => node.type === 'blob' && node.path.endsWith('.krn'))
    .map((node) => node.path);
}

async function buildEntry(
  repo: string,
  branch: string,
  path: string,
): Promise<HumdrumIndexEntry | null> {
  const url = `https://raw.githubusercontent.com/${repo}/${branch}/${path}`;
  try {
    const response = await fetch(url, { headers: { Range: `bytes=0-${HEADER_BYTES}` } });
    if (!response.ok && response.status !== 206) return null;
    const meta = parseKernHeaders(await response.text());
    const { title, subtitle } = describeKern(meta, basename(path, '.krn'));

    const entry: HumdrumIndexEntry = {
      id: `humdrum:${repo}:${path}`,
      title,
      path: `${repo}@${branch}/${path}`,
    };
    if (meta.composer) entry.composer = displayComposer(meta.composer);
    if (subtitle) entry.subtitle = subtitle;
    return entry;
  } catch {
    return null;
  }
}

function ghHeaders(): Record<string, string> {
  // Um token opcional sobe o limite de 60 para 5000 requisições por hora.
  const token = process.env.GITHUB_TOKEN;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const index = next++;
        results[index] = await worker(items[index]!);
      }
    }),
  );
  return results;
}

await main();
