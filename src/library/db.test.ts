import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  closeDb,
  deleteEntry,
  getEntry,
  hasEntry,
  hashBytes,
  listEntries,
  putEntry,
  touchEntry,
} from './db';
import type { LibraryEntry } from './types';

const bytesOf = (text: string) => new TextEncoder().encode(text).buffer as ArrayBuffer;

function entry(id: string, overrides: Partial<LibraryEntry> = {}): LibraryEntry {
  return {
    id,
    title: `Peça ${id}`,
    fileName: `${id}.mid`,
    bytes: bytesOf(`conteúdo de ${id}`),
    origin: 'catalog',
    addedAt: 1000,
    ...overrides,
  };
}

beforeEach(async () => {
  // Fechar antes de apagar: uma conexão aberta bloqueia o deleteDatabase e o
  // teste seguinte trava esperando.
  await closeDb();
  await new Promise((resolve) => {
    const request = indexedDB.deleteDatabase('piano-tutor');
    request.onsuccess = request.onerror = request.onblocked = () => resolve(null);
  });
});

describe('biblioteca', () => {
  it('grava e lê uma peça com os bytes intactos', async () => {
    await putEntry(entry('a', { composer: 'Mozart' }));
    const found = await getEntry('a');
    expect(found?.composer).toBe('Mozart');
    expect(new TextDecoder().decode(found!.bytes)).toBe('conteúdo de a');
  });

  it('regravar o mesmo id substitui em vez de duplicar', async () => {
    await putEntry(entry('a', { title: 'Antigo' }));
    await putEntry(entry('a', { title: 'Novo' }));
    const all = await listEntries();
    expect(all).toHaveLength(1);
    expect(all[0]!.title).toBe('Novo');
  });

  it('lista da mais recente para a mais antiga', async () => {
    await putEntry(entry('velha', { addedAt: 100 }));
    await putEntry(entry('nova', { addedAt: 300 }));
    await putEntry(entry('media', { addedAt: 200 }));
    expect((await listEntries()).map((e) => e.id)).toEqual(['nova', 'media', 'velha']);
  });

  it('a peça aberta por último sobe na lista', async () => {
    await putEntry(entry('velha', { addedAt: 100 }));
    await putEntry(entry('nova', { addedAt: 300 }));
    await touchEntry('velha');
    expect((await listEntries())[0]!.id).toBe('velha');
  });

  it('o resumo traz o tamanho e não os bytes', async () => {
    await putEntry(entry('a'));
    const [summary] = await listEntries();
    expect(summary!.sizeBytes).toBeGreaterThan(0);
    expect(summary).not.toHaveProperty('bytes');
  });

  it('apaga', async () => {
    await putEntry(entry('a'));
    await deleteEntry('a');
    expect(await hasEntry('a')).toBe(false);
    expect(await listEntries()).toEqual([]);
  });

  it('tocar numa peça inexistente não quebra', async () => {
    await expect(touchEntry('fantasma')).resolves.toBeUndefined();
  });
});

describe('hashBytes', () => {
  it('o mesmo conteúdo dá o mesmo id, mesmo com outro nome', async () => {
    expect(await hashBytes(bytesOf('igual'))).toBe(await hashBytes(bytesOf('igual')));
  });

  it('conteúdos diferentes dão ids diferentes', async () => {
    expect(await hashBytes(bytesOf('a'))).not.toBe(await hashBytes(bytesOf('b')));
  });
});
