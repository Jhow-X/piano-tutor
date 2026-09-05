/**
 * Gaveta de busca e biblioteca.
 *
 * O rodapé já tem dez grupos de controle e quebra em duas linhas — não cabe mais
 * nada lá. Isto abre por cima da tela e some, em vez de disputar espaço com os
 * controles de estudo.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { SOURCES, fileNameFor, searchAll, sourceById, type CatalogItem } from '../catalog';
import { listEntries, putEntry, deleteEntry, hasEntry } from '../library/db';
import type { LibrarySummary } from '../library/types';

type Tab = 'search' | 'library';

interface Props {
  open: boolean;
  initialTab: Tab;
  onClose(): void;
  /** Carrega no player. `id` identifica a peça na biblioteca. */
  onPlay(id: string): void;
  onLibraryChange(): void;
}

export function CatalogDrawer({ open, initialTab, onClose, onPlay, onLibraryChange }: Props) {
  const [tab, setTab] = useState<Tab>(initialTab);
  const [query, setQuery] = useState('');
  const [sourceIds, setSourceIds] = useState<string[]>(SOURCES.map((s) => s.id));
  const [results, setResults] = useState<CatalogItem[]>([]);
  const [failures, setFailures] = useState<{ sourceLabel: string; message: string }[]>([]);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<Set<string>>(new Set());
  const [busyId, setBusyId] = useState<string | null>(null);
  const [library, setLibrary] = useState<LibrarySummary[]>([]);

  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => setTab(initialTab), [initialTab, open]);

  const refreshLibrary = useCallback(async () => {
    const entries = await listEntries();
    setLibrary(entries);
    setSaved(new Set(entries.map((entry) => entry.id)));
  }, []);

  useEffect(() => {
    if (open) void refreshLibrary();
  }, [open, refreshLibrary]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.code === 'Escape') {
        event.stopPropagation();
        onClose();
      }
    };
    // Captura: o Esc da janela principal limpa o loop, e com a gaveta aberta
    // fechar a gaveta é o que o usuário espera.
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [open, onClose]);

  const runSearch = useCallback(async () => {
    const term = query.trim();
    if (term.length === 0) return;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setSearching(true);
    setError(null);
    try {
      const outcome = await searchAll(term, sourceIds, controller.signal);
      if (controller.signal.aborted) return;
      setResults(outcome.items);
      setFailures(outcome.failures);
    } catch (cause) {
      if (!controller.signal.aborted) {
        setError(cause instanceof Error ? cause.message : String(cause));
      }
    } finally {
      if (!controller.signal.aborted) setSearching(false);
    }
  }, [query, sourceIds]);

  const download = useCallback(
    async (item: CatalogItem) => {
      setBusyId(item.id);
      setError(null);
      try {
        if (!(await hasEntry(item.id))) {
          const source = sourceById(item.sourceId);
          if (!source) throw new Error(`Fonte desconhecida: ${item.sourceId}`);
          const bytes = await source.fetchFile(item, new AbortController().signal);
          await putEntry({
            id: item.id,
            title: item.title,
            ...(item.composer ? { composer: item.composer } : {}),
            ...(item.subtitle ? { subtitle: item.subtitle } : {}),
            fileName: fileNameFor(item),
            bytes: bytes.slice().buffer as ArrayBuffer,
            origin: 'catalog',
            attribution: item.attribution,
            ...(item.license ? { license: item.license } : {}),
            ...(item.sourceUrl ? { sourceUrl: item.sourceUrl } : {}),
            addedAt: Date.now(),
          });
          await refreshLibrary();
          onLibraryChange();
        }
        onPlay(item.id);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : String(cause));
      } finally {
        setBusyId(null);
      }
    },
    [onPlay, onLibraryChange, refreshLibrary],
  );

  const remove = useCallback(
    async (id: string) => {
      await deleteEntry(id);
      await refreshLibrary();
      onLibraryChange();
    },
    [onLibraryChange, refreshLibrary],
  );

  if (!open) return null;

  return (
    <div className="drawer-backdrop" onClick={onClose}>
      <section className="drawer" onClick={(event) => event.stopPropagation()}>
        <header className="drawer-head">
          <div className="drawer-tabs">
            <button className={tab === 'search' ? 'on' : ''} onClick={() => setTab('search')}>
              Buscar
            </button>
            <button className={tab === 'library' ? 'on' : ''} onClick={() => setTab('library')}>
              Biblioteca ({library.length})
            </button>
          </div>
          <button className="drawer-close" onClick={onClose} title="Esc">✕</button>
        </header>

        {error && <p className="drawer-error">{error}</p>}

        {tab === 'search' ? (
          <>
            <form
              className="drawer-search"
              onSubmit={(event) => {
                event.preventDefault();
                void runSearch();
              }}
            >
              <input
                autoFocus
                type="search"
                placeholder="Compositor, título, catálogo… (ex.: joplin, mozart k 279, cooley)"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
              <button type="submit" className="primary" disabled={searching}>
                {searching ? 'buscando…' : 'Buscar'}
              </button>
            </form>

            <div className="drawer-sources">
              {SOURCES.map((source) => (
                <label key={source.id} className="check">
                  <input
                    type="checkbox"
                    checked={sourceIds.includes(source.id)}
                    onChange={(event) =>
                      setSourceIds((current) =>
                        event.target.checked
                          ? [...current, source.id]
                          : current.filter((id) => id !== source.id),
                      )
                    }
                  />
                  {source.label}
                </label>
              ))}
            </div>

            {failures.map((failure) => (
              <p key={failure.sourceLabel} className="drawer-warning">
                {failure.sourceLabel} não respondeu: {failure.message}
              </p>
            ))}

            <ul className="drawer-list">
              {results.map((item) => (
                <li key={item.id}>
                  <div className="item-main">
                    <span className="item-title">{item.title}</span>
                    {item.composer && <span className="item-composer">{item.composer}</span>}
                    {item.subtitle && <span className="item-subtitle">{item.subtitle}</span>}
                  </div>
                  <span className="item-credit">
                    {item.attribution}
                    {item.license ? ` · ${item.license}` : ''}
                  </span>
                  <button
                    className="primary"
                    disabled={busyId === item.id}
                    onClick={() => void download(item)}
                  >
                    {busyId === item.id ? '…' : saved.has(item.id) ? 'abrir' : 'baixar'}
                  </button>
                </li>
              ))}
              {!searching && results.length === 0 && query.trim() !== '' && (
                <li className="drawer-empty">Nada encontrado.</li>
              )}
            </ul>
          </>
        ) : (
          <ul className="drawer-list">
            {library.map((entry) => (
              <li key={entry.id}>
                <div className="item-main">
                  <span className="item-title">{entry.title}</span>
                  {entry.composer && <span className="item-composer">{entry.composer}</span>}
                  {entry.subtitle && <span className="item-subtitle">{entry.subtitle}</span>}
                </div>
                <span className="item-credit">
                  {entry.origin === 'local' ? 'do seu computador' : entry.attribution}
                  {` · ${Math.max(1, Math.round(entry.sizeBytes / 1024))} KB`}
                </span>
                <button className="primary" onClick={() => onPlay(entry.id)}>abrir</button>
                <button onClick={() => void remove(entry.id)} title="Remover da biblioteca">✕</button>
              </li>
            ))}
            {library.length === 0 && (
              <li className="drawer-empty">
                A biblioteca está vazia. Busque uma peça, ou arraste um arquivo para a janela.
              </li>
            )}
          </ul>
        )}
      </section>
    </div>
  );
}
