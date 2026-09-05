/**
 * Biblioteca local, em IndexedDB.
 *
 * IndexedDB e não localStorage porque as peças têm centenas de KB — uma sonata
 * em MusicXML passa de 100KB e o localStorage inteiro costuma parar em 5MB.
 *
 * Sem dependência: a API crua é verbosa, mas é um único módulo pequeno e
 * evita arrastar uma biblioteca para dentro do bundle por causa de cinco
 * operações.
 */

import type { LibraryEntry, LibrarySummary } from './types';

const DB_NAME = 'piano-tutor';
const DB_VERSION = 1;
const STORE = 'scores';
const INDEX_ADDED = 'addedAt';

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: 'id' });
        store.createIndex(INDEX_ADDED, 'addedAt');
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB indisponível'));
    // Acontece quando outra aba segura uma versão antiga do banco.
    request.onblocked = () => reject(new Error('Outra aba está usando a biblioteca'));
  });
  return dbPromise;
}

function run<T>(mode: IDBTransactionMode, work: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(STORE, mode);
        const request = work(tx.objectStore(STORE));
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
        tx.onabort = () => reject(tx.error);
      }),
  );
}

/** Grava, substituindo se o id já existir — rebaixar uma peça não a duplica. */
export async function putEntry(entry: LibraryEntry): Promise<void> {
  await run('readwrite', (store) => store.put(entry));
}

export function getEntry(id: string): Promise<LibraryEntry | undefined> {
  return run('readonly', (store) => store.get(id) as IDBRequest<LibraryEntry | undefined>);
}

export async function deleteEntry(id: string): Promise<void> {
  await run('readwrite', (store) => store.delete(id));
}

/** Resumo de tudo, do mais recente para o mais antigo. */
export async function listEntries(): Promise<LibrarySummary[]> {
  const all = await run('readonly', (store) => store.getAll() as IDBRequest<LibraryEntry[]>);
  return all
    .map(({ bytes, ...rest }) => ({ ...rest, sizeBytes: bytes.byteLength }))
    .sort((a, b) => (b.lastOpenedAt ?? b.addedAt) - (a.lastOpenedAt ?? a.addedAt));
}

export async function touchEntry(id: string): Promise<void> {
  const entry = await getEntry(id);
  if (!entry) return;
  await putEntry({ ...entry, lastOpenedAt: Date.now() });
}

export function hasEntry(id: string): Promise<boolean> {
  return getEntry(id).then((entry) => entry !== undefined);
}

/**
 * Identidade de um arquivo aberto do disco: hash do conteúdo, não o nome.
 * Abrir o mesmo arquivo duas vezes — mesmo renomeado — não deve criar duas
 * entradas.
 */
export async function hashBytes(bytes: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest).slice(0, 12)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Fecha a conexão. Só os testes precisam disto — em produção o banco fica
 * aberto pela vida da página. Fechar de verdade importa: uma conexão aberta
 * bloqueia `deleteDatabase` e qualquer troca de versão de schema.
 */
export async function closeDb(): Promise<void> {
  if (!dbPromise) return;
  const db = await dbPromise.catch(() => null);
  db?.close();
  dbPromise = null;
}
